"""
Servicio de Notas de Crédito y Débito
Cumpliendo normativa SUNAT y arquitectura desacoplada

PRINCIPIOS:
- NO edita asientos existentes
- Genera NUEVOS asientos
- Referencia obligatoria al documento original
- Puede afectar inventario (según motivo)
- Usa Motor de Asientos (no lógica propia)
- Notas pueden ser parciales
- Respeta periodo contable
- No hardcodear cuentas contables
"""
from decimal import Decimal
from datetime import date
from typing import Optional, Tuple, List, Dict, Any
from sqlalchemy.orm import Session
import logging

from ..domain.models import JournalEntry, Period
from ..domain.models_ext import Purchase, Sale, Product
from ..domain.models_notas import (
    NotaDocumento, NotaDetalle, TipoNota, OrigenNota, 
    EstadoNota, MotivoNotaCredito, MotivoNotaDebito
)
from ..infrastructure.unit_of_work import UnitOfWork
from .services_journal_engine import MotorAsientos, MotorAsientosError, CuentaNoMapeadaError
from .services_journal_engine_init import inicializar_eventos_y_reglas_predeterminadas
from .services_inventario_v2 import InventarioService
from .services import post_journal_entry
from .dtos import JournalEntryIn, EntryLineIn
from .validations_journal_engine import validar_periodo_abierto, PeriodoCerradoError as ValidacionPeriodoCerradoError
from ..domain.models_journal_engine import EventoContableType, TipoCuentaMapeo

logger = logging.getLogger(__name__)


def _get_cuenta_mapeo(db, company_id: int, tipo_cuenta: str, default_code: str) -> str:
    """Obtiene el código de cuenta del mapeo, o default si no existe."""
    mapeo = db.query(TipoCuentaMapeo).filter(
        TipoCuentaMapeo.company_id == company_id,
        TipoCuentaMapeo.tipo_cuenta == tipo_cuenta,
        TipoCuentaMapeo.activo == True
    ).first()
    if mapeo and mapeo.account:
        return mapeo.account.code or default_code
    return default_code


class NotasError(Exception):
    """Excepción base para errores del módulo de notas"""
    pass


class DocumentoNoEncontradoError(NotasError):
    """Error cuando el documento original no existe"""
    pass


class DocumentoNoContabilizadoError(NotasError):
    """Error cuando el documento original no está contabilizado"""
    pass


class MontoExcedeSaldoError(NotasError):
    """Error cuando el monto de la nota excede el saldo del documento"""
    pass


class StockInsuficienteError(NotasError):
    """Error cuando no hay stock suficiente para la devolución"""
    pass


class NotasService:
    """
    Servicio de Notas de Crédito y Débito
    
    Maneja la creación de notas según normativa SUNAT.
    Delega la generación de asientos al Motor de Asientos.
    Integra condicionalmente con Inventario.
    """
    
    def __init__(self, uow: UnitOfWork):
        self.uow = uow
        self.motor = MotorAsientos(uow)
        self.inventario = InventarioService(uow)
    
    def _validar_documento_original(
        self,
        documento_id: int,
        documento_tipo: str,
        company_id: int
    ) -> Tuple[Sale | Purchase, Decimal]:
        """
        Valida que el documento original existe y está contabilizado.
        Retorna el documento y su saldo pendiente.
        """
        if documento_tipo == "VENTA":
            documento = self.uow.db.query(Sale).filter(
                Sale.id == documento_id,
                Sale.company_id == company_id
            ).first()
            
            if not documento:
                raise DocumentoNoEncontradoError(f"Venta {documento_id} no encontrada")
            
            if not documento.journal_entry_id:
                raise DocumentoNoContabilizadoError(f"Venta {documento_id} no está contabilizada")
            
            # Calcular saldo pendiente (total - cobros)
            from .services_tesoreria import TesoreriaService
            tesoreria = TesoreriaService(self.uow)
            saldo_pendiente = tesoreria._calcular_saldo_pendiente_venta(documento_id, company_id)
            
            return documento, saldo_pendiente
            
        elif documento_tipo == "COMPRA":
            documento = self.uow.db.query(Purchase).filter(
                Purchase.id == documento_id,
                Purchase.company_id == company_id
            ).first()
            
            if not documento:
                raise DocumentoNoEncontradoError(f"Compra {documento_id} no encontrada")
            
            if not documento.journal_entry_id:
                raise DocumentoNoContabilizadoError(f"Compra {documento_id} no está contabilizada")
            
            # Calcular saldo pendiente (total - pagos)
            from .services_tesoreria import TesoreriaService
            tesoreria = TesoreriaService(self.uow)
            saldo_pendiente = tesoreria._calcular_saldo_pendiente_compra(documento_id, company_id)
            
            return documento, saldo_pendiente
        else:
            raise NotasError(f"Tipo de documento inválido: {documento_tipo}")
    
    def _validar_periodo_abierto(self, company_id: int, fecha: date):
        """Valida que el período contable esté abierto"""
        periodo = self.uow.periods.get_or_open(company_id, fecha.year, fecha.month)
        try:
            validar_periodo_abierto(periodo)
        except ValidacionPeriodoCerradoError as e:
            raise NotasError(f"Período contable cerrado: {str(e)}")
    
    def _calcular_montos(self, monto_base: Decimal, igv_rate: Decimal = Decimal('0.18')) -> Tuple[Decimal, Decimal, Decimal]:
        """
        Calcula IGV y total a partir de la base.
        
        Args:
            monto_base: Base imponible
            igv_rate: Tasa de IGV (default 18%)
        
        Returns:
            (monto_base, igv, total)
        """
        igv = (monto_base * igv_rate).quantize(Decimal('0.01'))
        total = (monto_base + igv).quantize(Decimal('0.01'))
        return monto_base, igv, total
    
    def _determinar_afecta_inventario(self, motivo: str, tipo: str) -> bool:
        """
        Determina si la nota afecta inventario según el motivo.
        
        Notas de crédito que afectan inventario:
        - Devolución total/parcial
        - Error en cantidad (si implica devolución)
        
        Notas de débito NO afectan inventario.
        """
        if tipo == TipoNota.DEBITO.value:
            return False
        
        motivos_con_inventario = [
            MotivoNotaCredito.DEVOLUCION_TOTAL.value,
            MotivoNotaCredito.DEVOLUCION_PARCIAL.value,
            MotivoNotaCredito.ERROR_CANTIDAD.value
        ]
        
        return motivo in motivos_con_inventario
    
    def registrar_nota_credito_venta(
        self,
        company_id: int,
        venta_id: int,
        serie: str,
        numero: str,
        fecha_emision: date,
        motivo: str,
        monto_base: Decimal,
        detalles: Optional[List[Dict[str, Any]]] = None,
        glosa: Optional[str] = None,
        usuario_id: Optional[int] = None,
        usar_motor: bool = True
    ) -> Tuple[NotaDocumento, JournalEntry]:
        """
        Registra una Nota de Crédito para una venta.
        
        Args:
            company_id: ID de la empresa
            venta_id: ID de la venta original
            serie: Serie de la nota (ej: "FC01")
            numero: Número de la nota
            fecha_emision: Fecha de emisión
            motivo: Motivo según SUNAT (MotivoNotaCredito)
            monto_base: Monto base de la nota
            detalles: Lista de detalles (productos, cantidades) si afecta inventario
            glosa: Descripción adicional
            usuario_id: ID del usuario que registra
            usar_motor: Si True, usa Motor de Asientos
        
        Returns:
            (NotaDocumento, JournalEntry)
        """
        # Validar documento original
        venta, saldo_pendiente = self._validar_documento_original(venta_id, "VENTA", company_id)
        
        # Calcular montos
        base, igv, total = self._calcular_montos(monto_base)
        
        # Validar monto
        if total > saldo_pendiente:
            raise MontoExcedeSaldoError(
                f"Monto de nota ({total}) excede saldo pendiente ({saldo_pendiente}) de venta {venta_id}"
            )
        
        # Validar período
        self._validar_periodo_abierto(company_id, fecha_emision)
        
        # Determinar si afecta inventario
        afecta_inventario = self._determinar_afecta_inventario(motivo, TipoNota.CREDITO.value)
        
        # Validar stock si afecta inventario
        if afecta_inventario and detalles:
            for detalle in detalles:
                producto_id = detalle.get('producto_id')
                cantidad = Decimal(str(detalle.get('cantidad', 0)))
                almacen_id = detalle.get('almacen_id')
                
                if producto_id and cantidad > 0:
                    # Verificar stock actual (para devoluciones, debe haber stock suficiente)
                    # En realidad, para devoluciones no necesitamos validar stock,
                    # porque estamos devolviendo productos que ya salieron.
                    # Pero validamos que el producto exista y maneje stock
                    producto = self.uow.db.query(Product).filter(
                        Product.id == producto_id,
                        Product.company_id == company_id
                    ).first()
                    
                    if not producto:
                        raise NotasError(f"Producto {producto_id} no encontrado")
                    
                    if not producto.maneja_stock:
                        raise NotasError(f"Producto {producto_id} no maneja stock")
        
        # Inicializar eventos si no existen
        inicializar_eventos_y_reglas_predeterminadas(self.uow.db, company_id)
        
        # Crear NotaDocumento
        nota = NotaDocumento(
            company_id=company_id,
            tipo=TipoNota.CREDITO.value,
            origen=OrigenNota.VENTA.value,
            documento_ref_id=venta_id,
            documento_ref_tipo="VENTA",
            serie=serie,
            numero=numero,
            fecha_emision=fecha_emision,
            motivo=motivo,
            monto_base=base,
            igv=igv,
            total=total,
            afecta_inventario=afecta_inventario,
            estado=EstadoNota.REGISTRADA.value,
            created_by=usuario_id
        )
        self.uow.db.add(nota)
        self.uow.db.flush()
        
        # Crear detalles si existen
        if detalles:
            for detalle in detalles:
                nota_detalle = NotaDetalle(
                    nota_id=nota.id,
                    producto_id=detalle.get('producto_id'),
                    cantidad=Decimal(str(detalle.get('cantidad', 0))) if detalle.get('cantidad') else None,
                    costo_unitario=Decimal(str(detalle.get('costo_unitario', 0))) if detalle.get('costo_unitario') else None,
                    costo_total=Decimal(str(detalle.get('costo_total', 0))) if detalle.get('costo_total') else None,
                    descripcion=detalle.get('descripcion')
                )
                self.uow.db.add(nota_detalle)
        
        # Generar asiento contable
        entry = None
        if usar_motor:
            glosa_nota = glosa or f"NC {serie}-{numero} por {motivo} - Ref: Venta {venta_id}"
            datos_operacion = {
                "base": float(base),
                "igv": float(igv),
                "total": float(total),
                "documento_ref_id": venta_id,
                "documento_ref_tipo": "VENTA",
                "nota_id": nota.id,
                "motivo": motivo
            }
            try:
                entry = self.motor.generar_asiento(
                    evento_tipo=EventoContableType.NOTA_CREDITO_VENTA,
                    company_id=company_id,
                    fecha=fecha_emision,
                    glosa=glosa_nota,
                    datos_operacion=datos_operacion,
                    origin="NOTAS"
                )
            except (MotorAsientosError, CuentaNoMapeadaError) as e:
                logger.warning(f"FALLBACK LEGACY - NC Venta: {e}. Usando asiento manual.")
                db = self.uow.db
                ingreso = _get_cuenta_mapeo(db, company_id, "INGRESO_VENTAS", "70.10")
                igv_deb = _get_cuenta_mapeo(db, company_id, "IGV_DEBITO", "40.10")
                clientes = _get_cuenta_mapeo(db, company_id, "CLIENTES", "12.10")
                entry_lines = [
                    EntryLineIn(account_code=ingreso, debit=float(base), credit=0.0, memo=glosa_nota),
                    EntryLineIn(account_code=igv_deb, debit=float(igv), credit=0.0, memo=glosa_nota),
                    EntryLineIn(account_code=clientes, debit=0.0, credit=float(total), memo=glosa_nota),
                ]
                entry = post_journal_entry(self.uow, JournalEntryIn(
                    company_id=company_id, date=fecha_emision, glosa=glosa_nota,
                    currency="PEN", origin="NOTAS", lines=entry_lines
                ))
                self.uow.db.flush()
            nota.journal_entry_id = entry.id
        
        # Procesar inventario si aplica
        if afecta_inventario and detalles:
            for detalle in detalles:
                producto_id = detalle.get('producto_id')
                cantidad = Decimal(str(detalle.get('cantidad', 0)))
                almacen_id = detalle.get('almacen_id')
                costo_unitario = Decimal(str(detalle.get('costo_unitario', 0))) if detalle.get('costo_unitario') else None
                
                if producto_id and cantidad > 0 and almacen_id:
                    # Nota de crédito venta = devolución = entrada de inventario
                    try:
                        if costo_unitario:
                            self.inventario.registrar_entrada(
                                company_id=company_id,
                                producto_id=producto_id,
                                almacen_id=almacen_id,
                                cantidad=cantidad,
                                costo_unitario=costo_unitario,
                                fecha=fecha_emision,
                                referencia_tipo="NOTA_CREDITO_VENTA",
                                referencia_id=nota.id,
                                glosa=f"Devolución por NC {serie}-{numero}",
                                usar_motor=True
                            )
                    except Exception as e:
                        logger.error(f"Error al registrar entrada de inventario por nota: {e}")
                        # No fallar la nota si falla el inventario, pero loguear
        
        return nota, entry
    
    def registrar_nota_debito_venta(
        self,
        company_id: int,
        venta_id: int,
        serie: str,
        numero: str,
        fecha_emision: date,
        motivo: str,
        monto_base: Decimal,
        glosa: Optional[str] = None,
        usuario_id: Optional[int] = None,
        usar_motor: bool = True
    ) -> Tuple[NotaDocumento, JournalEntry]:
        """
        Registra una Nota de Débito para una venta.
        
        Notas de débito NO afectan inventario.
        """
        # Validar documento original
        venta, saldo_pendiente = self._validar_documento_original(venta_id, "VENTA", company_id)
        
        # Calcular montos
        base, igv, total = self._calcular_montos(monto_base)
        
        # Validar período
        self._validar_periodo_abierto(company_id, fecha_emision)
        
        # Inicializar eventos si no existen
        inicializar_eventos_y_reglas_predeterminadas(self.uow.db, company_id)
        
        # Crear NotaDocumento
        nota = NotaDocumento(
            company_id=company_id,
            tipo=TipoNota.DEBITO.value,
            origen=OrigenNota.VENTA.value,
            documento_ref_id=venta_id,
            documento_ref_tipo="VENTA",
            serie=serie,
            numero=numero,
            fecha_emision=fecha_emision,
            motivo=motivo,
            monto_base=base,
            igv=igv,
            total=total,
            afecta_inventario=False,  # Notas de débito nunca afectan inventario
            estado=EstadoNota.REGISTRADA.value,
            created_by=usuario_id
        )
        self.uow.db.add(nota)
        self.uow.db.flush()
        
        # Generar asiento contable
        entry = None
        if usar_motor:
            glosa_nota = glosa or f"ND {serie}-{numero} por {motivo} - Ref: Venta {venta_id}"
            datos_operacion = {
                "base": float(base),
                "igv": float(igv),
                "total": float(total),
                "documento_ref_id": venta_id,
                "documento_ref_tipo": "VENTA",
                "nota_id": nota.id,
                "motivo": motivo
            }
            try:
                entry = self.motor.generar_asiento(
                    evento_tipo=EventoContableType.NOTA_DEBITO_VENTA,
                    company_id=company_id,
                    fecha=fecha_emision,
                    glosa=glosa_nota,
                    datos_operacion=datos_operacion,
                    origin="NOTAS"
                )
            except (MotorAsientosError, CuentaNoMapeadaError) as e:
                logger.warning(f"FALLBACK LEGACY - ND Venta: {e}. Usando asiento manual.")
                db = self.uow.db
                clientes = _get_cuenta_mapeo(db, company_id, "CLIENTES", "12.10")
                ingreso = _get_cuenta_mapeo(db, company_id, "INGRESO_VENTAS", "70.10")
                igv_deb = _get_cuenta_mapeo(db, company_id, "IGV_DEBITO", "40.10")
                entry_lines = [
                    EntryLineIn(account_code=clientes, debit=float(total), credit=0.0, memo=glosa_nota),
                    EntryLineIn(account_code=ingreso, debit=0.0, credit=float(base), memo=glosa_nota),
                    EntryLineIn(account_code=igv_deb, debit=0.0, credit=float(igv), memo=glosa_nota),
                ]
                entry = post_journal_entry(self.uow, JournalEntryIn(
                    company_id=company_id, date=fecha_emision, glosa=glosa_nota,
                    currency="PEN", origin="NOTAS", lines=entry_lines
                ))
                self.uow.db.flush()
            nota.journal_entry_id = entry.id
        
        return nota, entry
    
    def registrar_nota_credito_compra(
        self,
        company_id: int,
        compra_id: int,
        serie: str,
        numero: str,
        fecha_emision: date,
        motivo: str,
        monto_base: Decimal,
        detalles: Optional[List[Dict[str, Any]]] = None,
        glosa: Optional[str] = None,
        usuario_id: Optional[int] = None,
        usar_motor: bool = True
    ) -> Tuple[NotaDocumento, JournalEntry]:
        """
        Registra una Nota de Crédito para una compra.
        """
        # Validar documento original
        compra, saldo_pendiente = self._validar_documento_original(compra_id, "COMPRA", company_id)
        
        # Calcular montos
        base, igv, total = self._calcular_montos(monto_base)
        
        # Validar monto
        if total > saldo_pendiente:
            raise MontoExcedeSaldoError(
                f"Monto de nota ({total}) excede saldo pendiente ({saldo_pendiente}) de compra {compra_id}"
            )
        
        # Validar período
        self._validar_periodo_abierto(company_id, fecha_emision)
        
        # Determinar si afecta inventario
        afecta_inventario = self._determinar_afecta_inventario(motivo, TipoNota.CREDITO.value)
        
        # Validar stock si afecta inventario (devolución de compra = salida de inventario)
        if afecta_inventario and detalles:
            for detalle in detalles:
                producto_id = detalle.get('producto_id')
                cantidad = Decimal(str(detalle.get('cantidad', 0)))
                almacen_id = detalle.get('almacen_id')
                
                if producto_id and cantidad > 0 and almacen_id:
                    # Verificar stock suficiente
                    from .services_inventario_v2 import InventarioService
                    inventario = InventarioService(self.uow)
                    stock_actual = inventario.calcular_stock_actual(company_id, producto_id, almacen_id)
                    
                    if stock_actual['cantidad_actual'] < cantidad:
                        raise StockInsuficienteError(
                            f"Stock insuficiente para devolución. Disponible: {stock_actual['cantidad_actual']}, Requerido: {cantidad}"
                        )
        
        # Inicializar eventos si no existen
        inicializar_eventos_y_reglas_predeterminadas(self.uow.db, company_id)
        
        # Crear NotaDocumento
        nota = NotaDocumento(
            company_id=company_id,
            tipo=TipoNota.CREDITO.value,
            origen=OrigenNota.COMPRA.value,
            documento_ref_id=compra_id,
            documento_ref_tipo="COMPRA",
            serie=serie,
            numero=numero,
            fecha_emision=fecha_emision,
            motivo=motivo,
            monto_base=base,
            igv=igv,
            total=total,
            afecta_inventario=afecta_inventario,
            estado=EstadoNota.REGISTRADA.value,
            created_by=usuario_id
        )
        self.uow.db.add(nota)
        self.uow.db.flush()
        
        # Crear detalles si existen
        if detalles:
            for detalle in detalles:
                nota_detalle = NotaDetalle(
                    nota_id=nota.id,
                    producto_id=detalle.get('producto_id'),
                    cantidad=Decimal(str(detalle.get('cantidad', 0))) if detalle.get('cantidad') else None,
                    costo_unitario=Decimal(str(detalle.get('costo_unitario', 0))) if detalle.get('costo_unitario') else None,
                    costo_total=Decimal(str(detalle.get('costo_total', 0))) if detalle.get('costo_total') else None,
                    descripcion=detalle.get('descripcion')
                )
                self.uow.db.add(nota_detalle)
        
        # Generar asiento contable
        entry = None
        if usar_motor:
            glosa_nota = glosa or f"NC {serie}-{numero} por {motivo} - Ref: Compra {compra_id}"
            datos_operacion = {
                "base": float(base),
                "igv": float(igv),
                "total": float(total),
                "documento_ref_id": compra_id,
                "documento_ref_tipo": "COMPRA",
                "nota_id": nota.id,
                "motivo": motivo
            }
            try:
                entry = self.motor.generar_asiento(
                    evento_tipo=EventoContableType.NOTA_CREDITO_COMPRA,
                    company_id=company_id,
                    fecha=fecha_emision,
                    glosa=glosa_nota,
                    datos_operacion=datos_operacion,
                    origin="NOTAS"
                )
            except (MotorAsientosError, CuentaNoMapeadaError) as e:
                logger.warning(f"FALLBACK LEGACY - NC Compra: {e}. Usando asiento manual.")
                db = self.uow.db
                proveedores = _get_cuenta_mapeo(db, company_id, "PROVEEDORES", "42.10")
                gasto = _get_cuenta_mapeo(db, company_id, "GASTO_COMPRAS", "60.11")
                igv_cred = _get_cuenta_mapeo(db, company_id, "IGV_CREDITO", "40.11")
                entry_lines = [
                    EntryLineIn(account_code=proveedores, debit=float(total), credit=0.0, memo=glosa_nota),
                    EntryLineIn(account_code=gasto, debit=0.0, credit=float(base), memo=glosa_nota),
                    EntryLineIn(account_code=igv_cred, debit=0.0, credit=float(igv), memo=glosa_nota),
                ]
                entry = post_journal_entry(self.uow, JournalEntryIn(
                    company_id=company_id, date=fecha_emision, glosa=glosa_nota,
                    currency="PEN", origin="NOTAS", lines=entry_lines
                ))
                self.uow.db.flush()
            nota.journal_entry_id = entry.id
        
        # Procesar inventario si aplica
        if afecta_inventario and detalles:
            for detalle in detalles:
                producto_id = detalle.get('producto_id')
                cantidad = Decimal(str(detalle.get('cantidad', 0)))
                almacen_id = detalle.get('almacen_id')
                costo_unitario = Decimal(str(detalle.get('costo_unitario', 0))) if detalle.get('costo_unitario') else None
                
                if producto_id and cantidad > 0 and almacen_id:
                    # Nota de crédito compra = devolución = salida de inventario
                    try:
                        if costo_unitario:
                            self.inventario.registrar_salida(
                                company_id=company_id,
                                producto_id=producto_id,
                                almacen_id=almacen_id,
                                cantidad=cantidad,
                                costo_unitario=costo_unitario,
                                fecha=fecha_emision,
                                referencia_tipo="NOTA_CREDITO_COMPRA",
                                referencia_id=nota.id,
                                glosa=f"Devolución por NC {serie}-{numero}",
                                usar_motor=True
                            )
                    except Exception as e:
                        logger.error(f"Error al registrar salida de inventario por nota: {e}")
                        # No fallar la nota si falla el inventario, pero loguear
        
        return nota, entry
    
    def registrar_nota_debito_compra(
        self,
        company_id: int,
        compra_id: int,
        serie: str,
        numero: str,
        fecha_emision: date,
        motivo: str,
        monto_base: Decimal,
        glosa: Optional[str] = None,
        usuario_id: Optional[int] = None,
        usar_motor: bool = True
    ) -> Tuple[NotaDocumento, JournalEntry]:
        """
        Registra una Nota de Débito para una compra.
        
        Notas de débito NO afectan inventario.
        """
        # Validar documento original
        compra, saldo_pendiente = self._validar_documento_original(compra_id, "COMPRA", company_id)
        
        # Calcular montos
        base, igv, total = self._calcular_montos(monto_base)
        
        # Validar período
        self._validar_periodo_abierto(company_id, fecha_emision)
        
        # Inicializar eventos si no existen
        inicializar_eventos_y_reglas_predeterminadas(self.uow.db, company_id)
        
        # Crear NotaDocumento
        nota = NotaDocumento(
            company_id=company_id,
            tipo=TipoNota.DEBITO.value,
            origen=OrigenNota.COMPRA.value,
            documento_ref_id=compra_id,
            documento_ref_tipo="COMPRA",
            serie=serie,
            numero=numero,
            fecha_emision=fecha_emision,
            motivo=motivo,
            monto_base=base,
            igv=igv,
            total=total,
            afecta_inventario=False,  # Notas de débito nunca afectan inventario
            estado=EstadoNota.REGISTRADA.value,
            created_by=usuario_id
        )
        self.uow.db.add(nota)
        self.uow.db.flush()
        
        # Generar asiento contable
        entry = None
        if usar_motor:
            glosa_nota = glosa or f"ND {serie}-{numero} por {motivo} - Ref: Compra {compra_id}"
            datos_operacion = {
                "base": float(base),
                "igv": float(igv),
                "total": float(total),
                "documento_ref_id": compra_id,
                "documento_ref_tipo": "COMPRA",
                "nota_id": nota.id,
                "motivo": motivo
            }
            try:
                entry = self.motor.generar_asiento(
                    evento_tipo=EventoContableType.NOTA_DEBITO_COMPRA,
                    company_id=company_id,
                    fecha=fecha_emision,
                    glosa=glosa_nota,
                    datos_operacion=datos_operacion,
                    origin="NOTAS"
                )
            except (MotorAsientosError, CuentaNoMapeadaError) as e:
                logger.warning(f"FALLBACK LEGACY - ND Compra: {e}. Usando asiento manual.")
                db = self.uow.db
                gasto = _get_cuenta_mapeo(db, company_id, "GASTO_COMPRAS", "60.11")
                igv_cred = _get_cuenta_mapeo(db, company_id, "IGV_CREDITO", "40.11")
                proveedores = _get_cuenta_mapeo(db, company_id, "PROVEEDORES", "42.10")
                entry_lines = [
                    EntryLineIn(account_code=gasto, debit=float(base), credit=0.0, memo=glosa_nota),
                    EntryLineIn(account_code=igv_cred, debit=float(igv), credit=0.0, memo=glosa_nota),
                    EntryLineIn(account_code=proveedores, debit=0.0, credit=float(total), memo=glosa_nota),
                ]
                entry = post_journal_entry(self.uow, JournalEntryIn(
                    company_id=company_id, date=fecha_emision, glosa=glosa_nota,
                    currency="PEN", origin="NOTAS", lines=entry_lines
                ))
                self.uow.db.flush()
            nota.journal_entry_id = entry.id
        
        return nota, entry

