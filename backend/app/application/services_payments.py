"""
Servicios para Gestión de Pagos y Cobros
==========================================

Registra pagos a proveedores y cobros de clientes, generando automáticamente
los asientos contables correspondientes.
"""
from decimal import Decimal
from datetime import date
from typing import Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..domain.models import Account, JournalEntry, EntryLine, Period
from ..domain.models_ext import Purchase, Sale
from ..domain.models_payments import PaymentTransaction
from ..infrastructure.unit_of_work import UnitOfWork
from ..application.services import post_journal_entry
from ..application.dtos import JournalEntryIn, EntryLineIn
from ..application.services_journal_engine import MotorAsientos, MotorAsientosError, CuentaNoMapeadaError


def _get_cash_bank_account_code(
    uow: UnitOfWork,
    company_id: int,
    payment_method: str,
    preferred_account_code: str | None = None
) -> str:
    """
    Determina el código de cuenta de caja/bancos según el método de pago.
    
    Lógica:
    - EFECTIVO, YAPE, PLIN -> 10.1x (Caja)
    - TRANSFERENCIA, CHEQUE, TARJETA -> 10.2x (Bancos)
    - OTRO -> Usa preferred_account_code o 10.10 por defecto
    
    Args:
        uow: UnitOfWork
        company_id: ID de la empresa
        payment_method: Método de pago (EFECTIVO, TRANSFERENCIA, etc.)
        preferred_account_code: Código de cuenta preferido (opcional)
        
    Returns:
        str: Código de cuenta a usar
    """
    # Si se proporciona una cuenta preferida y existe, usarla
    if preferred_account_code:
        account = uow.accounts.by_code(company_id, preferred_account_code)
        if account and account.active:
            return preferred_account_code
    
    # Determinar tipo de cuenta según método de pago
    if payment_method in ['EFECTIVO', 'YAPE', 'PLIN']:
        # Buscar cuenta de caja (10.1x)
        accounts = uow.accounts.list(company_id)
        caja_accounts = [acc for acc in accounts if acc.code.startswith('10.1') and acc.active]
        if caja_accounts:
            return caja_accounts[0].code
        # Fallback a 10.10 si no hay cuentas de caja específicas
        return "10.10"
    
    elif payment_method in ['TRANSFERENCIA', 'CHEQUE', 'TARJETA']:
        # Buscar cuenta bancaria (10.2x)
        accounts = uow.accounts.list(company_id)
        bank_accounts = [acc for acc in accounts if acc.code.startswith('10.2') and acc.active]
        if bank_accounts:
            return bank_accounts[0].code
        # Si no hay cuentas bancarias, buscar cualquier cuenta 10.x activa
        any_cash_accounts = [acc for acc in accounts if acc.code.startswith('10.') and acc.active]
        if any_cash_accounts:
            return any_cash_accounts[0].code
        # Fallback a 10.20 si no hay cuentas
        return "10.20"
    
    else:
        # OTRO o método desconocido: usar preferida o 10.10
        if preferred_account_code:
            account = uow.accounts.by_code(company_id, preferred_account_code)
            if account and account.active:
                return preferred_account_code
        return "10.10"


def registrar_cobro_venta(
    uow: UnitOfWork,
    *,
    company_id: int,
    sale_id: int,
    payment_date: date,
    amount: Decimal,
    cash_account_code: str | None = None,
    payment_method: str = "EFECTIVO",
    payment_reference: str | None = None,
    notes: str | None = None,
    created_by: str | None = None
) -> Tuple[PaymentTransaction, JournalEntry]:
    """
    Registra un cobro de cliente por una venta.
    
    Genera el asiento contable:
    - Débito: Caja/Bancos (10.x) = amount
    - Crédito: Clientes (12.10) = amount
    
    Args:
        uow: UnitOfWork
        company_id: ID de la empresa
        sale_id: ID de la venta
        payment_date: Fecha del cobro
        amount: Monto cobrado
        cash_account_code: Código de cuenta de caja/banco (default: 10.10)
        payment_method: Método de pago (EFECTIVO, TRANSFERENCIA, CHEQUE, etc.)
        payment_reference: Referencia del pago (número de cheque, transferencia, etc.)
        notes: Observaciones
        created_by: Usuario que creó el registro
        
    Returns:
        (PaymentTransaction, JournalEntry): Transacción y asiento creados
    """
    # Verificar que la venta existe
    sale = uow.db.query(Sale).filter(
        Sale.id == sale_id,
        Sale.company_id == company_id
    ).first()
    
    if not sale:
        raise ValueError(f"Venta {sale_id} no encontrada")
    
    # Verificar que no se exceda el monto total
    total_cobrado = uow.db.query(func.coalesce(func.sum(PaymentTransaction.amount), Decimal('0'))).filter(
        PaymentTransaction.sale_id == sale_id,
        PaymentTransaction.transaction_type == 'COLLECTION'
    ).scalar() or Decimal('0')
    
    if total_cobrado + amount > sale.total_amount:
        raise ValueError(f"El monto a cobrar ({amount}) excede el saldo pendiente. Total factura: {sale.total_amount}, Ya cobrado: {total_cobrado}")
    
    # Obtener período
    period = uow.db.query(Period).filter(
        Period.company_id == company_id,
        Period.year == payment_date.year,
        Period.month == payment_date.month
    ).first()
    
    if not period:
        raise ValueError(f"No existe período para {payment_date.year}-{payment_date.month:02d}")
    
    # Determinar cuenta de caja/bancos según método de pago
    if not cash_account_code:
        cash_account_code = _get_cash_bank_account_code(uow, company_id, payment_method)
    
    # Verificar que las cuentas existen
    cash_account = uow.accounts.by_code(company_id, cash_account_code)
    if not cash_account:
        raise ValueError(f"Cuenta {cash_account_code} no encontrada")
    
    client_account = uow.accounts.by_code(company_id, "12.10")
    if not client_account:
        raise ValueError("Cuenta 12.10 (Clientes) no encontrada")
    
    # Crear asiento contable usando motor (con fallback a legacy)
    glosa = f"Cobro de venta {sale.doc_type}-{sale.series}-{sale.number}"
    if payment_reference:
        glosa += f" - Ref: {payment_reference}"
    
    # Intentar usar el motor de asientos
    # Usar evento COBRO_CAJA o COBRO_BANCO según método de pago para mapear correctamente
    try:
        motor = MotorAsientos(uow)
        es_caja = payment_method in ['EFECTIVO', 'YAPE', 'PLIN']
        evento_tipo = "COBRO_CAJA" if es_caja else "COBRO_BANCO"
        
        entry = motor.generar_asiento(
            evento_tipo=evento_tipo,
            datos_operacion={
                "total": float(amount),
                "tipo_caja": "CAJA" if es_caja else "BANCO",
                "cash_account_code": cash_account_code  # Para referencia
            },
            company_id=company_id,
            fecha=payment_date,
            origin="VENTAS",  # Cobro desde módulo de ventas
            glosa=glosa
        )
        # Establecer currency después de crear el entry
        entry.currency = "PEN"
        from sqlalchemy.orm.attributes import flag_modified
        if entry.motor_metadata:
            flag_modified(entry, "motor_metadata")
        uow.db.flush()
    except (MotorAsientosError, CuentaNoMapeadaError):
        # Fallback a método legacy si el motor no está configurado
        entry_lines = [
            EntryLineIn(
                account_code=cash_account_code,
                debit=float(amount),
                credit=0.0,
                memo=glosa
            ),
            EntryLineIn(
                account_code="12.10",  # TODO: Migrar a tipo CLIENTES
                debit=0.0,
                credit=float(amount),
                memo=f"Reducción de cuenta por cobrar - {sale.doc_type}-{sale.series}-{sale.number}"
            )
        ]
        
        entry_data = JournalEntryIn(
            company_id=company_id,
            period_id=period.id,
            date=payment_date,
            currency="PEN",
            glosa=glosa,
            origin="COBROS",
            lines=entry_lines
        )
        
        entry = post_journal_entry(uow, entry_data)
    
    # Crear transacción de pago
    payment = PaymentTransaction(
        company_id=company_id,
        transaction_type="COLLECTION",
        sale_id=sale_id,
        payment_date=payment_date,
        amount=amount,
        currency="PEN",
        cash_account_code=cash_account_code,
        payment_method=payment_method,
        payment_reference=payment_reference,
        notes=notes,
        journal_entry_id=entry.id,
        created_by=created_by
    )
    
    uow.db.add(payment)
    uow.db.flush()
    
    return payment, entry


def registrar_pago_compra(
    uow: UnitOfWork,
    *,
    company_id: int,
    purchase_id: int,
    payment_date: date,
    amount: Decimal,
    cash_account_code: str | None = None,
    payment_method: str = "EFECTIVO",
    payment_reference: str | None = None,
    notes: str | None = None,
    created_by: str | None = None
) -> Tuple[PaymentTransaction, JournalEntry]:
    """
    Registra un pago a proveedor por una compra.
    
    Genera el asiento contable:
    - Débito: Proveedores (42.12) = amount
    - Crédito: Caja/Bancos (10.x) = amount
    
    Args:
        uow: UnitOfWork
        company_id: ID de la empresa
        purchase_id: ID de la compra
        payment_date: Fecha del pago
        amount: Monto pagado
        cash_account_code: Código de cuenta de caja/banco (default: 10.10)
        payment_method: Método de pago (EFECTIVO, TRANSFERENCIA, CHEQUE, etc.)
        payment_reference: Referencia del pago (número de cheque, transferencia, etc.)
        notes: Observaciones
        created_by: Usuario que creó el registro
        
    Returns:
        (PaymentTransaction, JournalEntry): Transacción y asiento creados
    """
    # Verificar que la compra existe
    purchase = uow.db.query(Purchase).filter(
        Purchase.id == purchase_id,
        Purchase.company_id == company_id
    ).first()
    
    if not purchase:
        raise ValueError(f"Compra {purchase_id} no encontrada")
    
    # Verificar que no se exceda el monto total
    total_pagado = uow.db.query(func.coalesce(func.sum(PaymentTransaction.amount), Decimal('0'))).filter(
        PaymentTransaction.purchase_id == purchase_id,
        PaymentTransaction.transaction_type == 'PAYMENT'
    ).scalar() or Decimal('0')
    
    if total_pagado + amount > purchase.total_amount:
        raise ValueError(f"El monto a pagar ({amount}) excede el saldo pendiente. Total factura: {purchase.total_amount}, Ya pagado: {total_pagado}")
    
    # Obtener período
    period = uow.db.query(Period).filter(
        Period.company_id == company_id,
        Period.year == payment_date.year,
        Period.month == payment_date.month
    ).first()
    
    if not period:
        raise ValueError(f"No existe período para {payment_date.year}-{payment_date.month:02d}")
    
    # Determinar cuenta de caja/bancos según método de pago
    if not cash_account_code:
        cash_account_code = _get_cash_bank_account_code(uow, company_id, payment_method)
    
    # Verificar que las cuentas existen
    cash_account = uow.accounts.by_code(company_id, cash_account_code)
    if not cash_account:
        raise ValueError(f"Cuenta {cash_account_code} no encontrada")
    
    supplier_account = uow.accounts.by_code(company_id, "42.12")
    if not supplier_account:
        raise ValueError("Cuenta 42.12 (Proveedores) no encontrada")
    
    # Crear asiento contable usando motor (con fallback a legacy)
    glosa = f"Pago a proveedor - Compra {purchase.doc_type}-{purchase.series}-{purchase.number}"
    if payment_reference:
        glosa += f" - Ref: {payment_reference}"
    
    # Intentar usar el motor de asientos
    # Usar evento PAGO_CAJA o PAGO_BANCO según método de pago para mapear correctamente
    try:
        motor = MotorAsientos(uow)
        es_caja = payment_method in ['EFECTIVO', 'YAPE', 'PLIN']
        evento_tipo = "PAGO_CAJA" if es_caja else "PAGO_BANCO"
        
        entry = motor.generar_asiento(
            evento_tipo=evento_tipo,
            datos_operacion={
                "total": float(amount),
                "tipo_caja": "CAJA" if es_caja else "BANCO",
                "cash_account_code": cash_account_code  # Para referencia
            },
            company_id=company_id,
            fecha=payment_date,
            origin="COMPRAS",  # Pago desde módulo de compras
            glosa=glosa
        )
        # Establecer currency después de crear el entry
        entry.currency = "PEN"
        from sqlalchemy.orm.attributes import flag_modified
        if entry.motor_metadata:
            flag_modified(entry, "motor_metadata")
        uow.db.flush()
    except (MotorAsientosError, CuentaNoMapeadaError):
        # Fallback a método legacy si el motor no está configurado
        entry_lines = [
            EntryLineIn(
                account_code="42.12",  # TODO: Migrar a tipo PROVEEDORES
                debit=float(amount),
                credit=0.0,
                memo=f"Reducción de cuenta por pagar - {purchase.doc_type}-{purchase.series}-{purchase.number}"
            ),
            EntryLineIn(
                account_code=cash_account_code,
                debit=0.0,
                credit=float(amount),
                memo=glosa
            )
        ]
        
        entry_data = JournalEntryIn(
            company_id=company_id,
            period_id=period.id,
            date=payment_date,
            currency="PEN",
            glosa=glosa,
            origin="PAGOS",
            lines=entry_lines
        )
        
        entry = post_journal_entry(uow, entry_data)
    
    # Crear transacción de pago
    payment = PaymentTransaction(
        company_id=company_id,
        transaction_type="PAYMENT",
        purchase_id=purchase_id,
        payment_date=payment_date,
        amount=amount,
        currency="PEN",
        cash_account_code=cash_account_code,
        payment_method=payment_method,
        payment_reference=payment_reference,
        notes=notes,
        journal_entry_id=entry.id,
        created_by=created_by
    )
    
    uow.db.add(payment)
    uow.db.flush()
    
    return payment, entry


def obtener_saldo_pendiente_venta(db: Session, sale_id: int) -> Decimal:
    """
    Calcula el saldo pendiente de cobro de una venta.
    Considera tanto PaymentTransaction (sistema legacy) como MovimientoTesoreria (sistema nuevo).
    """
    sale = db.query(Sale).filter(Sale.id == sale_id).first()
    if not sale:
        return Decimal('0')
    
    # Sumar cobros del sistema legacy (PaymentTransaction)
    total_cobrado_legacy = db.query(func.coalesce(func.sum(PaymentTransaction.amount), Decimal('0'))).filter(
        PaymentTransaction.sale_id == sale_id,
        PaymentTransaction.transaction_type == 'COLLECTION'
    ).scalar() or Decimal('0')
    
    # Sumar cobros del sistema de Tesorería (MovimientoTesoreria)
    from ..domain.models_tesoreria import MovimientoTesoreria, EstadoMovimiento
    cobros_tesoreria = db.query(MovimientoTesoreria).filter(
        MovimientoTesoreria.company_id == sale.company_id,
        MovimientoTesoreria.referencia_tipo == "VENTA",
        MovimientoTesoreria.referencia_id == sale_id,
        MovimientoTesoreria.estado == EstadoMovimiento.REGISTRADO.value
    ).all()
    
    total_cobrado_tesoreria = sum(Decimal(str(c.monto)) for c in cobros_tesoreria)
    
    # Total cobrado = suma de ambos sistemas
    total_cobrado = total_cobrado_legacy + total_cobrado_tesoreria
    
    saldo_pendiente = sale.total_amount - total_cobrado
    return max(saldo_pendiente, Decimal('0'))


def obtener_saldo_pendiente_compra(db: Session, purchase_id: int) -> Decimal:
    """
    Calcula el saldo pendiente de pago de una compra.
    Considera tanto PaymentTransaction (sistema legacy) como MovimientoTesoreria (sistema nuevo).
    """
    purchase = db.query(Purchase).filter(Purchase.id == purchase_id).first()
    if not purchase:
        return Decimal('0')
    
    # Sumar pagos del sistema legacy (PaymentTransaction)
    total_pagado_legacy = db.query(func.coalesce(func.sum(PaymentTransaction.amount), Decimal('0'))).filter(
        PaymentTransaction.purchase_id == purchase_id,
        PaymentTransaction.transaction_type == 'PAYMENT'
    ).scalar() or Decimal('0')
    
    # Sumar pagos del sistema de Tesorería (MovimientoTesoreria)
    from ..domain.models_tesoreria import MovimientoTesoreria, EstadoMovimiento
    pagos_tesoreria = db.query(MovimientoTesoreria).filter(
        MovimientoTesoreria.company_id == purchase.company_id,
        MovimientoTesoreria.referencia_tipo == "COMPRA",
        MovimientoTesoreria.referencia_id == purchase_id,
        MovimientoTesoreria.estado == EstadoMovimiento.REGISTRADO.value
    ).all()
    
    total_pagado_tesoreria = sum(Decimal(str(p.monto)) for p in pagos_tesoreria)
    
    # Total pagado = suma de ambos sistemas
    total_pagado = total_pagado_legacy + total_pagado_tesoreria
    
    saldo_pendiente = purchase.total_amount - total_pagado
    
    return max(saldo_pendiente, Decimal('0'))

