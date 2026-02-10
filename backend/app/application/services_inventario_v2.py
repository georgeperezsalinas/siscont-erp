"""
Servicios de Inventario - Versión Refactorizada según Requisitos
================================================================

Implementa la lógica de negocio para inventarios según PCGE peruano.
Sigue la metodología de "ensamblaje de carro":
- Módulo independiente (Productos, Almacenes, Movimientos)
- Se acopla con Asientos Contables a través del Motor de Asientos
- UnitOfWork es el "chassis" que une todo

PRINCIPIOS:
- Inventario NO genera ingresos
- Inventario NO genera cobros ni pagos
- Inventario SÍ genera asientos de costo y stock
- Inventario NO recalcula IGV
- Inventario delega la contabilidad al Motor de Asientos
"""
from decimal import Decimal
from datetime import date
from typing import Tuple, Optional, List, Dict, Any
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_

from ..infrastructure.unit_of_work import UnitOfWork
from ..domain.models_ext import Product, MovimientoInventario
from ..domain.models_inventario import Almacen, Stock
from ..domain.models import JournalEntry, Account, Period
from ..application.services import ensure_accounts_for_demo
from ..application.services_journal_engine import MotorAsientos
from ..application.services_journal_engine_init import inicializar_eventos_y_reglas_predeterminadas
from ..domain.models_journal_engine import EventoContableType
from ..application.validations_journal_engine import validar_periodo_abierto, PeriodoCerradoError
import logging

logger = logging.getLogger(__name__)


class InventarioError(Exception):
    """Excepción base para errores del módulo de inventario"""
    pass


class ProductoNoEncontradoError(InventarioError):
    """Error cuando el producto no existe"""
    pass


class AlmacenNoEncontradoError(InventarioError):
    """Error cuando el almacén no existe"""
    pass


class StockInsuficienteError(InventarioError):
    """Error cuando no hay stock suficiente"""
    pass


class ProductoNoManejaStockError(InventarioError):
    """Error cuando se intenta operar con un producto que no maneja stock"""
    pass


class InventarioService:
    """
    Servicio principal del módulo de inventario.
    
    Implementa todas las operaciones de inventario según los requisitos.
    """
    
    def __init__(self, uow: UnitOfWork):
        self.uow = uow
    
    def _validar_producto(self, company_id: int, producto_id: int, requiere_stock: bool = True) -> Product:
        """Valida que el producto existe y maneja stock si es requerido"""
        product = self.uow.db.query(Product).filter(
            Product.id == producto_id,
            Product.company_id == company_id
        ).first()
        
        if not product:
            raise ProductoNoEncontradoError(f"Producto {producto_id} no encontrado")
        
        if requiere_stock and not product.maneja_stock:
            raise ProductoNoManejaStockError(f"El producto {product.code} no maneja stock")
        
        return product
    
    def _validar_almacen(self, company_id: int, almacen_id: Optional[int]) -> Optional[Almacen]:
        """Valida que el almacén existe (si se proporciona)"""
        if almacen_id is None:
            return None
        
        almacen = self.uow.db.query(Almacen).filter(
            Almacen.id == almacen_id,
            Almacen.company_id == company_id,
            Almacen.activo == True
        ).first()
        
        if not almacen:
            raise AlmacenNoEncontradoError(f"Almacén {almacen_id} no encontrado o inactivo")
        
        return almacen
    
    def _validar_periodo_abierto(self, company_id: int, fecha: date) -> None:
        """Valida que el periodo contable esté abierto"""
        try:
            # Obtener o crear el período correspondiente a la fecha
            y = fecha.year
            m = fecha.month
            periodo = self.uow.periods.get_or_open(company_id, y, m)
            
            if not periodo:
                raise InventarioError(f"Período {y}-{m:02d} no encontrado. Debe crear el período antes de registrar movimientos.")
            
            # Validar que el período esté abierto
            es_periodo_abierto, error_periodo = validar_periodo_abierto(periodo)
            if not es_periodo_abierto:
                raise PeriodoCerradoError(error_periodo)
        except PeriodoCerradoError as e:
            raise InventarioError(f"No se puede registrar el movimiento: {str(e)}")
    
    def _obtener_o_crear_stock(self, company_id: int, producto_id: int, almacen_id: Optional[int]) -> Optional[Stock]:
        """Obtiene o crea el registro de stock para un producto y almacén"""
        if almacen_id is None:
            return None
        
        stock = self.uow.db.query(Stock).filter(
            Stock.company_id == company_id,
            Stock.producto_id == producto_id,  # Stock usa producto_id (correcto)
            Stock.almacen_id == almacen_id
        ).first()
        
        if not stock:
            stock = Stock(
                company_id=company_id,
                producto_id=producto_id,
                almacen_id=almacen_id,
                cantidad_actual=Decimal('0'),
                costo_promedio=Decimal('0')
            )
            self.uow.db.add(stock)
            self.uow.db.flush()
        
        return stock
    
    def _calcular_costo_promedio_ponderado(
        self,
        cantidad_actual: Decimal,
        costo_actual: Decimal,
        cantidad_entrada: Decimal,
        costo_entrada: Decimal
    ) -> Decimal:
        """
        Calcula el costo promedio ponderado.
        
        Fórmula: (cantidad_actual * costo_actual + cantidad_entrada * costo_entrada) / (cantidad_actual + cantidad_entrada)
        """
        if cantidad_actual + cantidad_entrada == 0:
            return Decimal('0.00')
        
        total_actual = cantidad_actual * costo_actual
        total_entrada = cantidad_entrada * costo_entrada
        nuevo_stock = cantidad_actual + cantidad_entrada
        
        costo_promedio = (total_actual + total_entrada) / nuevo_stock
        return costo_promedio.quantize(Decimal('0.01'))
    
    def _calcular_stock_por_almacen(
        self,
        company_id: int,
        producto_id: int,
        almacen_id: Optional[int]
    ) -> Tuple[Decimal, Decimal]:
        """
        Calcula el stock actual y costo promedio por almacén.
        
        Returns:
            (cantidad_actual, costo_promedio)
        """
        if almacen_id is None:
            # Si no hay almacén, calcular stock total (compatibilidad con código existente)
            entradas = self.uow.db.query(
                func.sum(MovimientoInventario.cantidad).label('total'),
                func.sum(MovimientoInventario.costo_total).label('costo_total')
            ).filter(
                MovimientoInventario.company_id == company_id,
                MovimientoInventario.producto_id == producto_id,
                MovimientoInventario.tipo == 'ENTRADA'
            ).first()
            
            salidas = self.uow.db.query(
                func.sum(MovimientoInventario.cantidad).label('total'),
                func.sum(MovimientoInventario.costo_total).label('costo_total')
            ).filter(
                MovimientoInventario.company_id == company_id,
                MovimientoInventario.producto_id == producto_id,
                MovimientoInventario.tipo == 'SALIDA'
            ).first()
            
            cantidad_entrada = Decimal(str(entradas.total or 0))
            costo_entrada = Decimal(str(entradas.costo_total or 0))
            cantidad_salida = Decimal(str(salidas.total or 0))
            costo_salida = Decimal(str(salidas.costo_total or 0))
            
            cantidad_actual = cantidad_entrada - cantidad_salida
            
            if cantidad_entrada > 0:
                costo_promedio = (costo_entrada - costo_salida) / cantidad_actual if cantidad_actual > 0 else Decimal('0.00')
                costo_promedio = costo_promedio.quantize(Decimal('0.01'))
            else:
                costo_promedio = Decimal('0.00')
            
            return cantidad_actual, costo_promedio
        else:
            # Usar tabla Stock
            stock = self._obtener_o_crear_stock(company_id, producto_id, almacen_id)
            if stock:
                return stock.cantidad_actual, stock.costo_promedio
            return Decimal('0'), Decimal('0.00')
    
    def registrar_entrada(
        self,
        company_id: int,
        producto_id: int,
        almacen_id: Optional[int],
        cantidad: Decimal,
        costo_unitario: Decimal,
        fecha: date,
        referencia_tipo: Optional[str] = None,
        referencia_id: Optional[int] = None,
        glosa: Optional[str] = None,
        usar_motor: bool = True
    ) -> Tuple[MovimientoInventario, JournalEntry]:
        """
        Registra una ENTRADA de inventario con su asiento contable automático.
        
        Args:
            company_id: ID de la empresa
            producto_id: ID del producto
            almacen_id: ID del almacén (opcional)
            cantidad: Cantidad que entra
            costo_unitario: Costo unitario
            fecha: Fecha del movimiento
            referencia_tipo: Tipo de referencia ("COMPRA", "AJUSTE", "MANUAL", etc.)
            referencia_id: ID del documento relacionado
            glosa: Descripción del movimiento
            usar_motor: Si usar el motor de asientos (default: True)
        
        Returns:
            (MovimientoInventario, JournalEntry): Movimiento y asiento creados
        """
        # Validaciones
        self._validar_periodo_abierto(company_id, fecha)
        product = self._validar_producto(company_id, producto_id, requiere_stock=True)
        almacen = self._validar_almacen(company_id, almacen_id)
        
        # Asegurar que las cuentas básicas existan
        ensure_accounts_for_demo(self.uow, company_id)
        
        # Validar que la cuenta del producto exista
        account = self.uow.accounts.by_code(company_id, product.account_code)
        if not account:
            raise InventarioError(f"La cuenta contable {product.account_code} del producto no existe. Por favor créela en el Plan de Cuentas.")
        
        # Calcular total
        cantidad_rounded = cantidad.quantize(Decimal('0.0001'))
        costo_unitario_rounded = costo_unitario.quantize(Decimal('0.01'))
        costo_total = (cantidad_rounded * costo_unitario_rounded).quantize(Decimal('0.01'))
        
        # Obtener stock actual para calcular nuevo costo promedio
        cantidad_actual, costo_promedio_actual = self._calcular_stock_por_almacen(company_id, producto_id, almacen_id)
        nuevo_costo_promedio = self._calcular_costo_promedio_ponderado(
            cantidad_actual, costo_promedio_actual, cantidad_rounded, costo_unitario_rounded
        )
        
        # Crear movimiento
        movimiento = MovimientoInventario(
            company_id=company_id,
            tipo="ENTRADA",
            producto_id=producto_id,
            almacen_id=almacen_id,
            cantidad=cantidad_rounded,
            costo_unitario=costo_unitario_rounded,
            costo_total=costo_total,
            fecha=fecha,
            referencia_tipo=referencia_tipo,
            referencia_id=referencia_id,
            glosa=glosa
        )
        self.uow.db.add(movimiento)
        self.uow.db.flush()
        
        # Actualizar stock
        if almacen_id:
            stock = self._obtener_o_crear_stock(company_id, producto_id, almacen_id)
            if stock:
                stock.cantidad_actual = cantidad_actual + cantidad_rounded
                stock.costo_promedio = nuevo_costo_promedio
                self.uow.db.flush()
        
        # Generar glosa automática si no se proporciona
        glosa_final = glosa or f"Entrada de inventario - {product.name}"
        if referencia_tipo and referencia_id:
            glosa_final += f" - {referencia_tipo} {referencia_id}"
        
        # Generar asiento contable usando motor
        entry = None
        if usar_motor:
            inicializar_eventos_y_reglas_predeterminadas(self.uow.db, company_id)
            motor = MotorAsientos(self.uow)
            
            datos_operacion = {
                "total": float(costo_total),
                "inventory_account_code": product.account_code,
                "product_id": producto_id,
                "product_name": product.name,
                "quantity": float(cantidad_rounded),
                "unit_cost": float(costo_unitario_rounded)
            }
            
            entry = motor.generar_asiento(
                evento_tipo=EventoContableType.ENTRADA_INVENTARIO.value,
                datos_operacion=datos_operacion,
                company_id=company_id,
                fecha=fecha,
                glosa=glosa_final,
                origin="INVENTARIOS"
            )
            # Establecer currency y exchange_rate después de crear el entry
            entry.currency = "PEN"
            entry.exchange_rate = Decimal('1.0')
            from sqlalchemy.orm.attributes import flag_modified
            if entry.motor_metadata:
                flag_modified(entry, "motor_metadata")
            
            movimiento.journal_entry_id = entry.id
            self.uow.db.flush()
        
        return movimiento, entry
    
    def registrar_salida(
        self,
        company_id: int,
        producto_id: int,
        almacen_id: Optional[int],
        cantidad: Decimal,
        fecha: date,
        referencia_tipo: Optional[str] = None,
        referencia_id: Optional[int] = None,
        glosa: Optional[str] = None,
        usar_motor: bool = True
    ) -> Tuple[MovimientoInventario, JournalEntry]:
        """
        Registra una SALIDA de inventario con su asiento contable automático.
        
        Args:
            company_id: ID de la empresa
            producto_id: ID del producto
            almacen_id: ID del almacén (opcional)
            cantidad: Cantidad que sale
            fecha: Fecha del movimiento
            referencia_tipo: Tipo de referencia ("VENTA", "AJUSTE", "MANUAL", etc.)
            referencia_id: ID del documento relacionado
            glosa: Descripción del movimiento
            usar_motor: Si usar el motor de asientos (default: True)
        
        Returns:
            (MovimientoInventario, JournalEntry): Movimiento y asiento creados
        """
        # Validaciones
        self._validar_periodo_abierto(company_id, fecha)
        product = self._validar_producto(company_id, producto_id, requiere_stock=True)
        almacen = self._validar_almacen(company_id, almacen_id)
        
        # Calcular stock actual y costo promedio
        cantidad_actual, costo_promedio = self._calcular_stock_por_almacen(company_id, producto_id, almacen_id)
        
        # Validar stock suficiente
        if cantidad_actual < cantidad:
            raise StockInsuficienteError(
                f"Stock insuficiente. Disponible: {cantidad_actual}, Solicitado: {cantidad}"
            )
        
        # Calcular costo unitario (usar costo promedio)
        cantidad_rounded = cantidad.quantize(Decimal('0.0001'))
        costo_unitario_rounded = costo_promedio.quantize(Decimal('0.01'))
        costo_total = (cantidad_rounded * costo_unitario_rounded).quantize(Decimal('0.01'))
        
        # Crear movimiento
        movimiento = MovimientoInventario(
            company_id=company_id,
            tipo="SALIDA",
            producto_id=producto_id,
            almacen_id=almacen_id,
            cantidad=cantidad_rounded,
            costo_unitario=costo_unitario_rounded,
            costo_total=costo_total,
            fecha=fecha,
            referencia_tipo=referencia_tipo,
            referencia_id=referencia_id,
            glosa=glosa
        )
        self.uow.db.add(movimiento)
        self.uow.db.flush()
        
        # Actualizar stock
        if almacen_id:
            stock = self._obtener_o_crear_stock(company_id, producto_id, almacen_id)
            if stock:
                stock.cantidad_actual = cantidad_actual - cantidad_rounded
                # El costo promedio no cambia en salidas
                self.uow.db.flush()
        
        # Generar glosa automática si no se proporciona
        glosa_final = glosa or f"Salida de inventario - {product.name}"
        if referencia_tipo and referencia_id:
            glosa_final += f" - {referencia_tipo} {referencia_id}"
        
        # Generar asiento contable usando motor
        entry = None
        if usar_motor:
            inicializar_eventos_y_reglas_predeterminadas(self.uow.db, company_id)
            motor = MotorAsientos(self.uow)
            
            datos_operacion = {
                "total": float(costo_total),
                "inventory_account_code": product.account_code,
                "product_id": producto_id,
                "product_name": product.name,
                "quantity": float(cantidad_rounded),
                "unit_cost": float(costo_unitario_rounded)
            }
            
            entry = motor.generar_asiento(
                evento_tipo=EventoContableType.SALIDA_INVENTARIO.value,
                datos_operacion=datos_operacion,
                company_id=company_id,
                fecha=fecha,
                glosa=glosa_final,
                origin="INVENTARIOS"
            )
            # Establecer currency y exchange_rate después de crear el entry
            entry.currency = "PEN"
            entry.exchange_rate = Decimal('1.0')
            from sqlalchemy.orm.attributes import flag_modified
            if entry.motor_metadata:
                flag_modified(entry, "motor_metadata")
            
            movimiento.journal_entry_id = entry.id
            self.uow.db.flush()
        
        return movimiento, entry
    
    def ajustar_stock(
        self,
        company_id: int,
        producto_id: int,
        almacen_id: Optional[int],
        cantidad: Decimal,  # Positivo para sobrante, negativo para faltante
        motivo: str,
        fecha: date,
        usar_motor: bool = True
    ) -> Tuple[MovimientoInventario, JournalEntry]:
        """
        Ajusta el stock de un producto (sobrante o faltante).
        
        Args:
            company_id: ID de la empresa
            producto_id: ID del producto
            almacen_id: ID del almacén (opcional)
            cantidad: Cantidad del ajuste (positivo = sobrante, negativo = faltante)
            motivo: Motivo del ajuste
            fecha: Fecha del ajuste
            usar_motor: Si usar el motor de asientos (default: True)
        
        Returns:
            (MovimientoInventario, JournalEntry): Movimiento y asiento creados
        """
        # Validaciones
        self._validar_periodo_abierto(company_id, fecha)
        product = self._validar_producto(company_id, producto_id, requiere_stock=True)
        almacen = self._validar_almacen(company_id, almacen_id)
        
        # Obtener stock actual y costo promedio
        cantidad_actual, costo_promedio = self._calcular_stock_por_almacen(company_id, producto_id, almacen_id)
        
        # Calcular costo total del ajuste
        cantidad_rounded = cantidad.quantize(Decimal('0.0001'))
        costo_unitario_rounded = costo_promedio.quantize(Decimal('0.01'))
        costo_total = abs(cantidad_rounded * costo_unitario_rounded).quantize(Decimal('0.01'))
        
        # Crear movimiento
        movimiento = MovimientoInventario(
            company_id=company_id,
            tipo="AJUSTE",
            producto_id=producto_id,
            almacen_id=almacen_id,
            cantidad=cantidad_rounded,
            costo_unitario=costo_unitario_rounded,
            costo_total=costo_total,
            fecha=fecha,
            referencia_tipo="AJUSTE",
            referencia_id=None,
            glosa=f"Ajuste de inventario: {motivo}"
        )
        self.uow.db.add(movimiento)
        self.uow.db.flush()
        
        # Actualizar stock
        if almacen_id:
            stock = self._obtener_o_crear_stock(company_id, producto_id, almacen_id)
            if stock:
                stock.cantidad_actual = cantidad_actual + cantidad_rounded
                # El costo promedio no cambia en ajustes
                self.uow.db.flush()
        
        # Generar glosa
        tipo_ajuste = "Sobrante" if cantidad_rounded > 0 else "Faltante"
        glosa_final = f"Ajuste de inventario ({tipo_ajuste}) - {product.name}: {motivo}"
        
        # Generar asiento contable usando motor
        entry = None
        if usar_motor:
            inicializar_eventos_y_reglas_predeterminadas(self.uow.db, company_id)
            motor = MotorAsientos(self.uow)
            
            datos_operacion = {
                "total": float(costo_total),
                "inventory_account_code": product.account_code,
                "product_id": producto_id,
                "product_name": product.name,
                "quantity": float(cantidad_rounded),  # Positivo o negativo según el tipo
                "unit_cost": float(costo_unitario_rounded)
            }
            
            entry = motor.generar_asiento(
                evento_tipo=EventoContableType.AJUSTE_INVENTARIO.value,
                datos_operacion=datos_operacion,
                company_id=company_id,
                fecha=fecha,
                glosa=glosa_final,
                origin="INVENTARIOS"
            )
            # Establecer currency y exchange_rate después de crear el entry
            entry.currency = "PEN"
            entry.exchange_rate = Decimal('1.0')
            from sqlalchemy.orm.attributes import flag_modified
            if entry.motor_metadata:
                flag_modified(entry, "motor_metadata")
            
            movimiento.journal_entry_id = entry.id
            self.uow.db.flush()
        
        return movimiento, entry
    
    def obtener_kardex(
        self,
        company_id: int,
        producto_id: Optional[int] = None,
        almacen_id: Optional[int] = None,
        fecha_desde: Optional[date] = None,
        fecha_hasta: Optional[date] = None
    ) -> List[Dict[str, Any]]:
        """
        Obtiene el Kardex (histórico de movimientos) de inventario.
        
        Args:
            company_id: ID de la empresa
            producto_id: ID del producto (opcional, filtra por producto)
            almacen_id: ID del almacén (opcional, filtra por almacén)
            fecha_desde: Fecha desde (opcional)
            fecha_hasta: Fecha hasta (opcional)
        
        Returns:
            Lista de movimientos con información completa
        """
        query = self.uow.db.query(MovimientoInventario).filter(
            MovimientoInventario.company_id == company_id
        )
        
        if producto_id:
            query = query.filter(MovimientoInventario.producto_id == producto_id)
        
        if almacen_id:
            query = query.filter(MovimientoInventario.almacen_id == almacen_id)
        
        if fecha_desde:
            query = query.filter(MovimientoInventario.fecha >= fecha_desde)
        
        if fecha_hasta:
            query = query.filter(MovimientoInventario.fecha <= fecha_hasta)
        
        # Ordenar por fecha ASC para calcular saldos acumulados correctamente
        movimientos = query.options(
            joinedload(MovimientoInventario.product),
            joinedload(MovimientoInventario.almacen)
        ).order_by(
            MovimientoInventario.fecha.asc(),
            MovimientoInventario.id.asc()
        ).all()
        
        # Calcular saldos acumulados usando costo promedio ponderado
        saldo_cantidad = Decimal('0')
        saldo_costo_total = Decimal('0')
        saldo_costo_promedio = Decimal('0')
        
        resultado = []
        for mov in movimientos:
            # Usar relaciones con joinedload para evitar N+1 queries
            producto = mov.product if hasattr(mov, 'product') else None
            almacen = mov.almacen if hasattr(mov, 'almacen') else None
            
            cantidad_mov = Decimal(str(mov.cantidad))
            costo_unitario_mov = Decimal(str(mov.costo_unitario))
            costo_total_mov = Decimal(str(mov.costo_total))
            
            # Actualizar saldos según el tipo de movimiento
            if mov.tipo == "ENTRADA":
                # Entrada: aumenta cantidad y costo total
                saldo_cantidad += cantidad_mov
                saldo_costo_total += costo_total_mov
            elif mov.tipo == "SALIDA":
                # Salida: disminuye cantidad y costo total (usando costo promedio)
                saldo_cantidad -= cantidad_mov
                saldo_costo_total -= (saldo_costo_promedio * cantidad_mov)
            elif mov.tipo == "AJUSTE":
                # Ajuste: puede aumentar o disminuir según el signo de cantidad
                if cantidad_mov > 0:
                    # Sobrante: aumenta
                    saldo_cantidad += cantidad_mov
                    saldo_costo_total += costo_total_mov
                else:
                    # Faltante: disminuye
                    saldo_cantidad += cantidad_mov  # cantidad_mov ya es negativo
                    saldo_costo_total += (saldo_costo_promedio * cantidad_mov)
            
            # Calcular costo promedio ponderado
            if saldo_cantidad > 0:
                saldo_costo_promedio = (saldo_costo_total / saldo_cantidad).quantize(Decimal('0.01'))
            else:
                saldo_costo_promedio = Decimal('0')
            
            # Calcular valor total del saldo
            saldo_valor_total = (saldo_cantidad * saldo_costo_promedio).quantize(Decimal('0.01'))
            
            resultado.append({
                "id": mov.id,
                "tipo": mov.tipo,
                "producto_id": mov.producto_id,
                "producto_code": producto.code if producto else None,
                "producto_name": producto.name if producto else None,
                "almacen_id": mov.almacen_id,
                "almacen_codigo": almacen.codigo if almacen else None,
                "almacen_nombre": almacen.nombre if almacen else None,
                "cantidad": float(cantidad_mov),
                "costo_unitario": float(costo_unitario_mov),
                "costo_total": float(costo_total_mov),
                "fecha": mov.fecha.isoformat(),
                "referencia_tipo": mov.referencia_tipo,
                "referencia_id": mov.referencia_id,
                "glosa": mov.glosa,
                "journal_entry_id": mov.journal_entry_id,
                "created_at": mov.created_at.isoformat() if mov.created_at else None,
                # Saldos acumulados
                "saldo_cantidad": float(saldo_cantidad),
                "saldo_costo_promedio": float(saldo_costo_promedio),
                "saldo_valor_total": float(saldo_valor_total)
            })
        
        # Revertir el orden para mostrar los más recientes primero
        resultado.reverse()
        
        return resultado
    
    def obtener_stock(
        self,
        company_id: int,
        producto_id: Optional[int] = None,
        almacen_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Obtiene el stock actual de productos.
        
        Args:
            company_id: ID de la empresa
            producto_id: ID del producto (opcional, filtra por producto)
            almacen_id: ID del almacén (opcional, filtra por almacén)
        
        Returns:
            Lista de stocks con información completa
        """
        if almacen_id:
            # Stock por almacén específico
            query = self.uow.db.query(Stock).filter(
                Stock.company_id == company_id,
                Stock.almacen_id == almacen_id
            )
            
            if producto_id:
                query = query.filter(Stock.producto_id == producto_id)
            
            stocks = query.all()
            
            resultado = []
            for stock in stocks:
                resultado.append({
                    "producto_id": stock.producto_id,
                    "producto_code": stock.producto.code if stock.producto else None,
                    "producto_name": stock.producto.name if stock.producto else None,
                    "almacen_id": stock.almacen_id,
                    "almacen_codigo": stock.almacen.codigo if stock.almacen else None,
                    "almacen_nombre": stock.almacen.nombre if stock.almacen else None,
                    "cantidad_actual": float(stock.cantidad_actual),
                    "costo_promedio": float(stock.costo_promedio),
                    "valor_total": float(stock.cantidad_actual * stock.costo_promedio),
                    "updated_at": stock.updated_at.isoformat() if stock.updated_at else None
                })
        else:
            # Stock total (sin almacén) - calcular desde movimientos
            query = self.uow.db.query(Product).filter(
                Product.company_id == company_id,
                Product.maneja_stock == True
            )
            
            if producto_id:
                query = query.filter(Product.id == producto_id)
            
            products = query.all()
            
            resultado = []
            for product in products:
                cantidad, costo = self._calcular_stock_por_almacen(company_id, product.id, None)
                resultado.append({
                    "producto_id": product.id,
                    "producto_code": product.code,
                    "producto_name": product.name,
                    "almacen_id": None,
                    "almacen_codigo": None,
                    "almacen_nombre": "TOTAL",
                    "cantidad_actual": float(cantidad),
                    "costo_promedio": float(costo),
                    "valor_total": float(cantidad * costo),
                    "updated_at": None
                })
        
        return resultado
    
    def eliminar_movimiento(
        self,
        movimiento_id: int,
        company_id: int
    ) -> None:
        """
        Elimina un movimiento de inventario y anula su asiento contable.
        
        También recalcula el stock y el costo promedio después de la eliminación.
        """
        from ..domain.models import JournalEntry, EntryLine
        
        # 1. Obtener movimiento
        movimiento = self.uow.db.query(MovimientoInventario).filter(
            MovimientoInventario.id == movimiento_id,
            MovimientoInventario.company_id == company_id
        ).first()
        
        if not movimiento:
            raise InventarioError(f"Movimiento {movimiento_id} no encontrado")
        
        # 2. Guardar información del movimiento antes de eliminarlo (para recalcular stock)
        producto_id = movimiento.producto_id
        almacen_id = movimiento.almacen_id
        tipo_movimiento = movimiento.tipo
        cantidad_movimiento = movimiento.cantidad
        journal_entry_id = movimiento.journal_entry_id
        
        # 3. Eliminar asiento contable asociado si existe
        if journal_entry_id:
            entry = self.uow.db.query(JournalEntry).filter(
                JournalEntry.id == journal_entry_id,
                JournalEntry.company_id == company_id
            ).first()
            
            if entry:
                # Eliminar líneas del asiento
                self.uow.db.query(EntryLine).filter(
                    EntryLine.entry_id == entry.id
                ).delete()
                
                # Eliminar asiento
                self.uow.db.delete(entry)
                logger.info(f"Asiento {entry.id} anulado al eliminar movimiento {movimiento_id}")
        
        # 4. Eliminar movimiento
        self.uow.db.delete(movimiento)
        self.uow.db.flush()
        
        logger.info(
            f"Movimiento {movimiento_id} eliminado: tipo={tipo_movimiento}, "
            f"producto_id={producto_id}, cantidad={cantidad_movimiento}"
        )
        
        # 5. Recalcular stock y costo promedio después de la eliminación
        # Esto se hace automáticamente al consultar, pero podemos forzar una actualización
        if almacen_id:
            stock = self._obtener_o_crear_stock(company_id, producto_id, almacen_id)
            if stock:
                cantidad_actual, costo_promedio_actual = self._calcular_stock_por_almacen(
                    company_id, producto_id, almacen_id
                )
                stock.cantidad_actual = cantidad_actual
                stock.costo_promedio = costo_promedio_actual
                self.uow.db.flush()
                logger.info(f"Stock recalculado para producto {producto_id}, almacén {almacen_id}")


# Funciones de compatibilidad con código existente
def calcular_stock_actual(db: Session, company_id: int, product_id: int) -> Tuple[Decimal, Decimal]:
    """Función de compatibilidad - calcula stock sin almacén"""
    uow = UnitOfWork(db)
    try:
        service = InventarioService(uow)
        cantidad, costo = service._calcular_stock_por_almacen(company_id, product_id, None)
        return cantidad, costo
    finally:
        uow.close()


def registrar_entrada_inventario(
    uow: UnitOfWork,
    company_id: int,
    product_id: int,
    quantity: Decimal,
    unit_cost: Decimal,
    movement_date: date,
    reference: Optional[str] = None,
    reference_type: Optional[str] = None,
    reference_id: Optional[int] = None,
    glosa: Optional[str] = None,
    credit_account_code: Optional[str] = None
) -> Tuple[MovimientoInventario, JournalEntry]:
    """Función de compatibilidad - usa el nuevo servicio"""
    service = InventarioService(uow)
    return service.registrar_entrada(
        company_id=company_id,
        producto_id=product_id,
        almacen_id=None,  # Sin almacén para compatibilidad
        cantidad=quantity,
        costo_unitario=unit_cost,
        fecha=movement_date,
        referencia_tipo=reference_type,
        referencia_id=reference_id,
        glosa=glosa or reference,
        usar_motor=True
    )


def registrar_salida_inventario(
    uow: UnitOfWork,
    company_id: int,
    product_id: int,
    quantity: Decimal,
    movement_date: date,
    reference: Optional[str] = None,
    reference_type: Optional[str] = None,
    reference_id: Optional[int] = None,
    glosa: Optional[str] = None,
    usar_costo_promedio: bool = True
) -> Tuple[MovimientoInventario, JournalEntry]:
    """Función de compatibilidad - usa el nuevo servicio"""
    service = InventarioService(uow)
    return service.registrar_salida(
        company_id=company_id,
        producto_id=product_id,
        almacen_id=None,  # Sin almacén para compatibilidad
        cantidad=quantity,
        fecha=movement_date,
        referencia_tipo=reference_type,
        referencia_id=reference_id,
        glosa=glosa or reference,
        usar_motor=True
    )

