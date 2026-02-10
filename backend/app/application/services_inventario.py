"""
Servicios de Inventario - Metodología Contable Peruana
========================================================

Implementa la lógica de negocio para inventarios según PCGE peruano.
Sigue la metodología de "ensamblaje de carro":
- Módulo independiente (Productos, Movimientos)
- Se acopla con Asientos Contables a través de interfaces claras
- UnitOfWork es el "chassis" que une todo
"""
from decimal import Decimal
from datetime import date
from typing import Tuple, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..infrastructure.unit_of_work import UnitOfWork
from ..domain.models_ext import Product, InventoryMovement
from ..domain.models import JournalEntry, Account, Period
from ..application.services import ensure_accounts_for_demo
from ..application.services_journal_engine import MotorAsientos
from ..application.services_journal_engine_init import inicializar_eventos_y_reglas_predeterminadas
from ..domain.models_journal_engine import EventoContableType


def calcular_stock_actual(db: Session, company_id: int, product_id: int) -> Tuple[Decimal, Decimal]:
    """
    Calcula el stock actual y costo promedio de un producto.
    
    Returns:
        (cantidad_actual, costo_promedio)
    """
    # Obtener todas las entradas
    entradas = db.query(
        func.sum(InventoryMovement.cantidad).label('total'),
        func.sum(InventoryMovement.costo_total).label('costo_total')
    ).filter(
        InventoryMovement.company_id == company_id,
        InventoryMovement.producto_id == product_id,
        InventoryMovement.tipo == 'ENTRADA'
    ).first()
    
    # Obtener todas las salidas
    salidas = db.query(
        func.sum(InventoryMovement.cantidad).label('total'),
        func.sum(InventoryMovement.costo_total).label('costo_total')
    ).filter(
        InventoryMovement.company_id == company_id,
        InventoryMovement.producto_id == product_id,
        InventoryMovement.tipo == 'SALIDA'
    ).first()
    
    cantidad_entrada = Decimal(str(entradas.total or 0))
    costo_entrada = Decimal(str(entradas.costo_total or 0))
    cantidad_salida = Decimal(str(salidas.total or 0))
    costo_salida = Decimal(str(salidas.costo_total or 0))
    
    cantidad_actual = cantidad_entrada - cantidad_salida
    
    # Calcular costo promedio
    if cantidad_entrada > 0:
        costo_promedio = (costo_entrada - costo_salida) / cantidad_actual if cantidad_actual > 0 else Decimal('0.00')
        costo_promedio = costo_promedio.quantize(Decimal('0.01'))
    else:
        costo_promedio = Decimal('0.00')
    
    return cantidad_actual, costo_promedio


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
    credit_account_code: Optional[str] = None  # Cuenta de crédito (60.11 para compras, etc.)
) -> Tuple[InventoryMovement, JournalEntry]:
    """
    Registra una ENTRADA de inventario con su asiento contable automático.
    
    Integración acoplada: Inventario + Asiento Contable
    
    Args:
        uow: UnitOfWork (el "chassis")
        company_id: ID de la empresa
        product_id: ID del producto
        quantity: Cantidad que entra
        unit_cost: Costo unitario
        movement_date: Fecha del movimiento
        reference: Referencia (factura, orden, etc.)
        reference_type: Tipo de referencia ("COMPRA", "AJUSTE", etc.)
        reference_id: ID del documento relacionado
        glosa: Descripción del movimiento
        credit_account_code: Cuenta de crédito (por defecto 60.11 para compras)
        
    Returns:
        (InventoryMovement, JournalEntry): Movimiento y asiento creados
    """
    # Asegurar que las cuentas básicas de inventario existan
    ensure_accounts_for_demo(uow, company_id)
    
    # Validar producto
    product = uow.db.query(Product).filter(
        Product.id == product_id,
        Product.company_id == company_id
    ).first()
    
    if not product:
        raise ValueError(f"Producto {product_id} no encontrado")
    
    # Validar que la cuenta del producto exista
    account = uow.accounts.by_code(company_id, product.account_code)
    if not account:
        raise ValueError(f"La cuenta contable {product.account_code} del producto no existe. Por favor créela en el Plan de Cuentas.")
    
    # Calcular total
    quantity_rounded = quantity.quantize(Decimal('0.0001'))
    unit_cost_rounded = unit_cost.quantize(Decimal('0.01'))
    total_cost = (quantity_rounded * unit_cost_rounded).quantize(Decimal('0.01'))
    
    # Crear movimiento
    movimiento = InventoryMovement(
        company_id=company_id,
        producto_id=product_id,
        tipo="ENTRADA",
        cantidad=quantity_rounded,
        costo_unitario=unit_cost_rounded,
        costo_total=total_cost,
        fecha=movement_date,
        referencia_tipo=reference_type,
        referencia_id=reference_id,
        glosa=glosa
    )
    uow.db.add(movimiento)
    uow.db.flush()
    
    # Generar glosa automática si no se proporciona
    glosa_final = glosa or f"Entrada de inventario - {product.name}"
    if reference:
        glosa_final += f" - {reference}"
    
    # Inicializar eventos y reglas si no existen
    inicializar_eventos_y_reglas_predeterminadas(uow.db, company_id)
    
    # Usar motor de asientos para generar el asiento
    motor = MotorAsientos(uow)
    
    # Preparar datos de operación para el motor
    datos_operacion = {
        "total": float(total_cost),
        "inventory_account_code": product.account_code,  # Cuenta específica del producto
        "product_id": product_id,
        "product_name": product.name,
        "quantity": float(quantity_rounded),
        "unit_cost": float(unit_cost_rounded)
    }
    
    # Si hay una cuenta de crédito específica, agregarla a los datos
    if credit_account_code:
        datos_operacion["credit_account_code"] = credit_account_code
    
    # Generar asiento usando el motor
    entry = motor.generar_asiento(
        evento_tipo=EventoContableType.ENTRADA_INVENTARIO.value,
        datos_operacion=datos_operacion,
        company_id=company_id,
        fecha=movement_date,
        glosa=glosa_final,
        origin="INVENTARIOS"
    )
    # Establecer currency y exchange_rate después de crear el entry
    entry.currency = "PEN"
    entry.exchange_rate = Decimal('1.0')
    from sqlalchemy.orm.attributes import flag_modified
    if entry.motor_metadata:
        flag_modified(entry, "motor_metadata")
    uow.db.flush()
    
    # Si hay una cuenta de crédito específica, reemplazar la línea de crédito
    if credit_account_code:
        credit_account = uow.accounts.by_code(company_id, credit_account_code)
        if credit_account:
            # Buscar la línea de crédito (GASTO_COMPRAS) y reemplazarla
            from ..domain.models import EntryLine
            credit_line = uow.db.query(EntryLine).filter(
                EntryLine.entry_id == entry.id,
                EntryLine.credit > 0
            ).first()
            if credit_line:
                credit_line.account_id = credit_account.id
                uow.db.flush()
    
    # Vincular movimiento con asiento
    movimiento.journal_entry_id = entry.id
    uow.db.flush()
    
    return movimiento, entry


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
    usar_costo_promedio: bool = True  # Si True, usa costo promedio; si False, usa FIFO/LIFO
) -> Tuple[InventoryMovement, JournalEntry]:
    """
    Registra una SALIDA de inventario con su asiento contable automático.
    
    Integración acoplada: Inventario + Asiento Contable
    
    Args:
        uow: UnitOfWork (el "chassis")
        company_id: ID de la empresa
        product_id: ID del producto
        quantity: Cantidad que sale
        movement_date: Fecha del movimiento
        reference: Referencia (factura de venta, orden, etc.)
        reference_type: Tipo de referencia ("VENTA", "AJUSTE", "MERMA", etc.)
        reference_id: ID del documento relacionado
        glosa: Descripción del movimiento
        usar_costo_promedio: Si usar costo promedio (True) o FIFO (False)
        
    Returns:
        (InventoryMovement, JournalEntry): Movimiento y asiento creados
    """
    # Asegurar que las cuentas básicas de inventario existan
    ensure_accounts_for_demo(uow, company_id)
    
    # Validar producto
    product = uow.db.query(Product).filter(
        Product.id == product_id,
        Product.company_id == company_id
    ).first()
    
    if not product:
        raise ValueError(f"Producto {product_id} no encontrado")
    
    # Validar que la cuenta del producto exista
    account = uow.accounts.by_code(company_id, product.account_code)
    if not account:
        raise ValueError(f"La cuenta contable {product.account_code} del producto no existe. Por favor créela en el Plan de Cuentas.")
    
    # Calcular stock actual y costo promedio
    cantidad_actual, costo_promedio = calcular_stock_actual(uow.db, company_id, product_id)
    
    if cantidad_actual < quantity:
        raise ValueError(f"Stock insuficiente. Disponible: {cantidad_actual}, Solicitado: {quantity}")
    
    # Calcular costo unitario
    if usar_costo_promedio:
        unit_cost = costo_promedio
    else:
        # FIFO: obtener el costo de la entrada más antigua disponible
        # Por simplicidad, usar costo promedio (se puede implementar FIFO más adelante)
        unit_cost = costo_promedio
    
    # Calcular total
    quantity_rounded = quantity.quantize(Decimal('0.0001'))
    unit_cost_rounded = unit_cost.quantize(Decimal('0.01'))
    total_cost = (quantity_rounded * unit_cost_rounded).quantize(Decimal('0.01'))
    
    # Crear movimiento
    movimiento = InventoryMovement(
        company_id=company_id,
        producto_id=product_id,
        tipo="SALIDA",
        cantidad=quantity_rounded,
        costo_unitario=unit_cost_rounded,
        costo_total=total_cost,
        fecha=movement_date,
        referencia_tipo=reference_type,
        referencia_id=reference_id,
        glosa=glosa
    )
    uow.db.add(movimiento)
    uow.db.flush()
    
    # Generar glosa automática si no se proporciona
    glosa_final = glosa or f"Salida de inventario - {product.name}"
    if reference:
        glosa_final += f" - {reference}"
    
    # Inicializar eventos y reglas si no existen
    inicializar_eventos_y_reglas_predeterminadas(uow.db, company_id)
    
    # Usar motor de asientos para generar el asiento
    motor = MotorAsientos(uow)
    
    # Preparar datos de operación para el motor
    datos_operacion = {
        "total": float(total_cost),
        "inventory_account_code": product.account_code,  # Cuenta específica del producto
        "product_id": product_id,
        "product_name": product.name,
        "quantity": float(quantity_rounded),
        "unit_cost": float(unit_cost_rounded)
    }
    
    # Generar asiento usando el motor
    entry = motor.generar_asiento(
        evento_tipo=EventoContableType.SALIDA_INVENTARIO.value,
        datos_operacion=datos_operacion,
        company_id=company_id,
        fecha=movement_date,
        glosa=glosa_final,
        origin="INVENTARIOS"
    )
    # Establecer currency y exchange_rate después de crear el entry
    entry.currency = "PEN"
    entry.exchange_rate = Decimal('1.0')
    from sqlalchemy.orm.attributes import flag_modified
    if entry.motor_metadata:
        flag_modified(entry, "motor_metadata")
    uow.db.flush()
    
    # Vincular movimiento con asiento
    movimiento.journal_entry_id = entry.id
    uow.db.flush()
    
    return movimiento, entry

