from decimal import Decimal
from datetime import date
from typing import List
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
import logging
from .dtos import JournalEntryIn
from ..infrastructure.unit_of_work import UnitOfWork
# DEPRECATED: No usar plantillas hardcodeadas - todo debe usar el motor de asientos
# from ..infrastructure.plugins import peru_impuestos as pe
from ..domain.models import Account, JournalEntry, EntryLine
from ..domain.models_ext import Purchase, Sale, PurchaseLine, SaleLine
from ..application.services import ensure_accounts_for_demo
from ..application.services_journal_engine import MotorAsientos, MotorAsientosError, CuentaNoMapeadaError

logger = logging.getLogger("app.application.services_pe")

def registrar_compra(uow: UnitOfWork, *, company_id:int, doc_type:str, series:str, number:str, issue_date:date, supplier_id:int, currency:str, base:Decimal, glosa:str, usar_motor: bool = True, user_id: int | None = None):
    """
    Registra una compra con base única (backward compatibility).
    Para compras con múltiples líneas, usar registrar_compra_con_lineas.
    
    Args:
        usar_motor: DEPRECATED - Siempre se usa el motor de asientos. Si False, lanza error.
    """
    ensure_accounts_for_demo(uow, company_id)
    # Redondear base a 2 decimales antes de procesar
    base_rounded = base.quantize(Decimal('0.01'))
    igv_amount = (base_rounded * Decimal('0.18')).quantize(Decimal('0.01'))
    total_amount = (base_rounded * Decimal('1.18')).quantize(Decimal('0.01'))
    
    # SIEMPRE usar el motor de asientos - no hay fallback a legacy
    if not usar_motor:
        raise ValueError("El parámetro usar_motor=False está deprecado. El sistema siempre usa el motor de asientos.")
    
    motor = MotorAsientos(uow)
    glosa_final = glosa or f"Compra {doc_type} {series}-{number}"
    entry = motor.generar_asiento(
        evento_tipo="COMPRA",
        datos_operacion={
            "base": float(base_rounded),
            "igv": float(igv_amount),
            "total": float(total_amount)
        },
        company_id=company_id,
        fecha=issue_date,
        glosa=glosa_final,
        origin="COMPRAS",
        user_id=user_id,
    )
    # Establecer currency después de crear el entry
    entry.currency = currency
    uow.db.flush()

    p = Purchase(company_id=company_id, doc_type=doc_type, series=series, number=number, issue_date=issue_date, supplier_id=supplier_id, currency=currency, base_amount=base_rounded, igv_amount=igv_amount, total_amount=total_amount, journal_entry_id=entry.id)
    uow.db.add(p); uow.db.flush()
    return p, entry

def registrar_compra_con_lineas(uow: UnitOfWork, *, company_id:int, doc_type:str, series:str, number:str, issue_date:date, supplier_id:int, currency:str, purchase_lines:List[dict], glosa:str, usar_motor: bool = True, user_id: int | None = None):
    """
    Registra una compra con múltiples líneas.
    
    purchase_lines: Lista de dicts con {description, quantity, unit_price}
    Calcula automáticamente base_amount, igv_amount, total_amount por línea y totales.
    """
    from typing import List as TypingList
    ensure_accounts_for_demo(uow, company_id)
    IGV_RATE = Decimal('0.18')
    
    # Calcular totales de todas las líneas
    total_base = Decimal('0')
    total_igv = Decimal('0')
    total_total = Decimal('0')
    
    purchase_line_objs = []
    for idx, line_data in enumerate(purchase_lines, start=1):
        qty = Decimal(str(line_data['quantity'])).quantize(Decimal('0.0001'))
        unit_price = Decimal(str(line_data['unit_price'])).quantize(Decimal('0.0001'))
        base_line = (qty * unit_price).quantize(Decimal('0.01'))
        igv_line = (base_line * IGV_RATE).quantize(Decimal('0.01'))
        total_line = (base_line + igv_line).quantize(Decimal('0.01'))
        
        purchase_line = PurchaseLine(
            line_number=idx,
            description=line_data['description'],
            quantity=qty,
            unit_price=unit_price,
            base_amount=base_line,
            igv_amount=igv_line,
            total_amount=total_line,
            product_id=line_data.get('product_id')  # Producto de inventario (opcional)
        )
        purchase_line_objs.append(purchase_line)
        
        total_base += base_line
        total_igv += igv_line
        total_total += total_line
    
    # Redondear totales finales
    total_base = total_base.quantize(Decimal('0.01'))
    total_igv = total_igv.quantize(Decimal('0.01'))
    total_total = total_total.quantize(Decimal('0.01'))
    
    # Generar asiento contable consolidado
    glosa_final = glosa or f"Compra {doc_type}-{series}-{number}"
    
    # SIEMPRE usar el motor de asientos - no hay fallback a legacy
    if not usar_motor:
        raise ValueError("El parámetro usar_motor=False está deprecado. El sistema siempre usa el motor de asientos.")
    
    motor = MotorAsientos(uow)
    entry = motor.generar_asiento(
        evento_tipo="COMPRA",
        datos_operacion={
            "base": float(total_base),
            "igv": float(total_igv),
            "total": float(total_total)
        },
        company_id=company_id,
        fecha=issue_date,
        glosa=glosa_final,
        origin="COMPRAS",
        user_id=user_id,
    )
    # Establecer currency después de crear el entry
    entry.currency = currency
    uow.db.flush()

    # Crear compra con líneas
    p = Purchase(
        company_id=company_id,
        doc_type=doc_type,
        series=series,
        number=number,
        issue_date=issue_date,
        supplier_id=supplier_id,
        currency=currency,
        base_amount=total_base,
        igv_amount=total_igv,
        total_amount=total_total,
        journal_entry_id=entry.id
    )
    uow.db.add(p)
    uow.db.flush()
    
    # Asociar líneas a la compra
    for pl in purchase_line_objs:
        pl.purchase_id = p.id
        uow.db.add(pl)
    
    uow.db.flush()
    
    # ✅ INTEGRACIÓN CON INVENTARIO: Registrar entradas de inventario para productos
    # Solo si hay líneas con product_id y el producto maneja stock
    try:
        from ..application.services_inventario_v2 import InventarioService
        from ..domain.models_ext import Product
        
        inventario_service = InventarioService(uow)
        for pl in purchase_line_objs:
            if pl.product_id:
                # Verificar que el producto existe y maneja stock
                product = uow.db.query(Product).filter(
                    Product.id == pl.product_id,
                    Product.company_id == company_id
                ).first()
                
                if product and product.maneja_stock:
                    # Registrar entrada de inventario
                    # El costo unitario es el precio unitario sin IGV (base_line / quantity)
                    costo_unitario = (pl.base_amount / pl.quantity).quantize(Decimal('0.01')) if pl.quantity > 0 else Decimal('0.00')
                    
                    inventario_service.registrar_entrada(
                        company_id=company_id,
                        producto_id=pl.product_id,
                        almacen_id=None,  # Por defecto sin almacén (se puede configurar después)
                        cantidad=pl.quantity,
                        costo_unitario=costo_unitario,
                        fecha=issue_date,
                        referencia_tipo="COMPRA",
                        referencia_id=p.id,
                        glosa=f"Compra {doc_type}-{series}-{number} - {product.name}",
                        usar_motor=True
                    )
                    logger.info(f"✅ Entrada de inventario registrada para producto {product.code} desde compra {p.id}")
    except Exception as e:
        # No fallar la compra si hay error en inventario (log y continuar)
        logger.warning(f"⚠️ Error al registrar entrada de inventario para compra {p.id}: {e}")
    
    return p, entry

def registrar_venta(uow: UnitOfWork, *, company_id:int, doc_type:str, series:str, number:str, issue_date:date, customer_id:int, currency:str, base:Decimal, glosa:str, usar_motor: bool = True, user_id: int | None = None):
    """
    Registra una venta con base única (backward compatibility).
    Para ventas con múltiples líneas, usar registrar_venta_con_lineas.
    
    Args:
        usar_motor: Si True, usa el Motor de Asientos. Si False, usa plantillas hardcodeadas (legacy).
    """
    ensure_accounts_for_demo(uow, company_id)
    # Redondear base a 2 decimales antes de procesar
    base_rounded = base.quantize(Decimal('0.01'))
    igv_amount = (base_rounded * Decimal('0.18')).quantize(Decimal('0.01'))
    total_amount = (base_rounded * Decimal('1.18')).quantize(Decimal('0.01'))
    
    # SIEMPRE usar el motor de asientos - no hay fallback a legacy
    if not usar_motor:
        raise ValueError("El parámetro usar_motor=False está deprecado. El sistema siempre usa el motor de asientos.")
    
    motor = MotorAsientos(uow)
    glosa_final = glosa or f"Venta {doc_type} {series}-{number}"
    entry = motor.generar_asiento(
        evento_tipo="VENTA",
        datos_operacion={
            "base": float(base_rounded),
            "igv": float(igv_amount),
            "total": float(total_amount)
        },
        company_id=company_id,
        fecha=issue_date,
        glosa=glosa_final,
        origin="VENTAS",
        user_id=user_id,
    )
    # Verificar que se usó el motor correctamente
    logger.info(
        f"MOTOR_VENTA_USADO: {doc_type} {series}-{number}, "
        f"entry_id={entry.id}, origin={entry.origin}, "
        f"motor_metadata={entry.motor_metadata is not None}"
    )
    # Verificar las líneas generadas para IGV
    for line in entry.lines:
        account = uow.db.query(Account).filter(Account.id == line.account_id).first()
        if account and "40" in account.code:  # Cuenta de IGV
            logger.info(
                f"IGV_LINEA_VENTA: entry_id={entry.id}, account_code={account.code}, "
                f"account_name={account.name}, debit={line.debit}, credit={line.credit}"
            )
    # Establecer currency después de crear el entry
    entry.currency = currency
    # Asegurar que motor_metadata se persista explícitamente
    if entry.motor_metadata:
        flag_modified(entry, "motor_metadata")
    uow.db.flush()
    
    s = Sale(company_id=company_id, doc_type=doc_type, series=series, number=number, issue_date=issue_date, customer_id=customer_id, currency=currency, base_amount=base_rounded, igv_amount=igv_amount, total_amount=total_amount, journal_entry_id=entry.id)
    uow.db.add(s); uow.db.flush()
    return s, entry

def registrar_venta_con_lineas(
    uow: UnitOfWork,
    *,
    company_id:int,
    doc_type:str,
    series:str,
    number:str,
    issue_date:date,
    customer_id:int,
    currency:str,
    sale_lines:List[dict],
    glosa:str,
    detraction_rate: Decimal | None = None,  # Tasa de detracción (ej: 0.12 para 12%)
    usar_motor: bool = True,
    user_id: int | None = None,
):
    """
    Registra una venta con múltiples líneas.
    
    sale_lines: Lista de dicts con {description, quantity, unit_price}
    Calcula automáticamente base_amount, igv_amount, total_amount por línea y totales.
    
    Si se proporciona detraction_rate, calcula la detracción sobre el total y ajusta el asiento contable.
    """
    from typing import List as TypingList
    ensure_accounts_for_demo(uow, company_id)
    IGV_RATE = Decimal('0.18')
    
    # Calcular totales de todas las líneas
    total_base = Decimal('0')
    total_igv = Decimal('0')
    total_total = Decimal('0')
    
    sale_line_objs = []
    for idx, line_data in enumerate(sale_lines, start=1):
        qty = Decimal(str(line_data['quantity'])).quantize(Decimal('0.0001'))
        unit_price = Decimal(str(line_data['unit_price'])).quantize(Decimal('0.0001'))
        base_line = (qty * unit_price).quantize(Decimal('0.01'))
        igv_line = (base_line * IGV_RATE).quantize(Decimal('0.01'))
        total_line = (base_line + igv_line).quantize(Decimal('0.01'))
        
        sale_line = SaleLine(
            line_number=idx,
            description=line_data['description'],
            quantity=qty,
            unit_price=unit_price,
            base_amount=base_line,
            igv_amount=igv_line,
            total_amount=total_line,
            product_id=line_data.get('product_id')  # Producto de inventario (opcional)
        )
        sale_line_objs.append(sale_line)
        
        total_base += base_line
        total_igv += igv_line
        total_total += total_line
    
    # Redondear totales finales
    total_base = total_base.quantize(Decimal('0.01'))
    total_igv = total_igv.quantize(Decimal('0.01'))
    total_total = total_total.quantize(Decimal('0.01'))
    
    # Calcular detracción si se proporciona tasa
    detraction_amount = Decimal('0')
    net_amount = total_total
    if detraction_rate and detraction_rate > 0:
        detraction_rate_rounded = detraction_rate.quantize(Decimal('0.0001'))
        # La detracción se calcula sobre el total (incluyendo IGV)
        detraction_amount = (total_total * detraction_rate_rounded).quantize(Decimal('0.01'))
        net_amount = (total_total - detraction_amount).quantize(Decimal('0.01'))
    
    # Generar asiento contable consolidado
    glosa_final = glosa or f"Venta {doc_type}-{series}-{number}"
    
    # SIEMPRE usar el motor de asientos - no hay fallback a legacy
    if not usar_motor:
        raise ValueError("El parámetro usar_motor=False está deprecado. El sistema siempre usa el motor de asientos.")
    
    motor = MotorAsientos(uow)
    entry = motor.generar_asiento(
        evento_tipo="VENTA",
        datos_operacion={
            "base": float(total_base),
            "igv": float(total_igv),
            "total": float(total_total),
            "detraction_amount": float(detraction_amount) if detraction_amount > 0 else 0
        },
        company_id=company_id,
        fecha=issue_date,
        glosa=glosa_final,
        user_id=user_id,
        origin="VENTAS"
    )
    # Verificar que se usó el motor correctamente
    logger.info(
        f"MOTOR_VENTA_CON_LINEAS_USADO: {doc_type} {series}-{number}, "
        f"entry_id={entry.id}, origin={entry.origin}, "
        f"motor_metadata={entry.motor_metadata is not None}"
    )
    # Verificar las líneas generadas para IGV
    for line in entry.lines:
        account = uow.db.query(Account).filter(Account.id == line.account_id).first()
        if account and "40" in account.code:  # Cuenta de IGV
            logger.info(
                f"IGV_LINEA_VENTA_CON_LINEAS: entry_id={entry.id}, account_code={account.code}, "
                f"account_name={account.name}, debit={line.debit}, credit={line.credit}"
            )
    # Establecer currency después de crear el entry
    entry.currency = currency
    # Asegurar que motor_metadata se persista explícitamente
    if entry.motor_metadata:
        flag_modified(entry, "motor_metadata")
    uow.db.flush()
    
    # Crear venta con líneas
    s = Sale(
        company_id=company_id,
        doc_type=doc_type,
        series=series,
        number=number,
        issue_date=issue_date,
        customer_id=customer_id,
        currency=currency,
        base_amount=total_base,
        igv_amount=total_igv,
        total_amount=total_total,
        detraction_rate=detraction_rate if detraction_rate else None,
        detraction_amount=detraction_amount if detraction_amount > 0 else None,
        net_amount=net_amount,
        journal_entry_id=entry.id
    )
    uow.db.add(s)
    uow.db.flush()
    
    # Asociar líneas a la venta
    for sl in sale_line_objs:
        sl.sale_id = s.id
        uow.db.add(sl)
    
    uow.db.flush()
    
    # ✅ INTEGRACIÓN CON INVENTARIO: Registrar salidas de inventario para productos
    # Solo si hay líneas con product_id y el producto maneja stock
    try:
        from ..application.services_inventario_v2 import InventarioService
        from ..domain.models_ext import Product
        
        inventario_service = InventarioService(uow)
        for sl in sale_line_objs:
            if sl.product_id:
                # Verificar que el producto existe y maneja stock
                product = uow.db.query(Product).filter(
                    Product.id == sl.product_id,
                    Product.company_id == company_id
                ).first()
                
                if product and product.maneja_stock:
                    # Registrar salida de inventario
                    inventario_service.registrar_salida(
                        company_id=company_id,
                        producto_id=sl.product_id,
                        almacen_id=None,  # Por defecto sin almacén (se puede configurar después)
                        cantidad=sl.quantity,
                        fecha=issue_date,
                        referencia_tipo="VENTA",
                        referencia_id=s.id,
                        glosa=f"Venta {doc_type}-{series}-{number} - {product.name}",
                        usar_motor=True
                    )
                    logger.info(f"✅ Salida de inventario registrada para producto {product.code} desde venta {s.id}")
    except Exception as e:
        # No fallar la venta si hay error en inventario (log y continuar)
        logger.warning(f"⚠️ Error al registrar salida de inventario para venta {s.id}: {e}")
    
    return s, entry

def _post(uow: UnitOfWork, company_id:int, d:date, curr:str, lines_data:list, origin:str, glosa:str="")->JournalEntry:
    from ..application.services import post_journal_entry
    dto = JournalEntryIn(company_id=company_id, date=d, glosa=glosa, currency=curr, origin=origin, exchange_rate=1.0, lines=lines_data, tipo=None)
    return post_journal_entry(uow, dto)
