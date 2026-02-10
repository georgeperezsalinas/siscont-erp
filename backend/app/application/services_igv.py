"""
Servicios para Gestión de Pagos de IGV
========================================

Registra los pagos de IGV a SUNAT, generando automáticamente
los asientos contables correspondientes.
"""
from decimal import Decimal
from datetime import date
from typing import Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..domain.models import Account, JournalEntry, EntryLine, Period
from ..infrastructure.unit_of_work import UnitOfWork
from ..application.services import post_journal_entry, ensure_accounts_for_demo
from ..application.dtos import JournalEntryIn, EntryLineIn
from ..application.services_payments import _get_cash_bank_account_code


def registrar_pago_igv(
    uow: UnitOfWork,
    *,
    company_id: int,
    payment_date: date,
    amount: Decimal,
    payment_method: str,
    cash_account_code: str | None = None,
    payment_reference: str | None = None,
    notes: str | None = None,
    period_reference: str | None = None,  # Período al que corresponde el pago (ej: "2025-01")
    created_by: str | None = None,
    use_detractions: bool = False,  # Si True, usa detracciones en lugar de caja/bancos
    detraction_amount: Decimal | None = None  # Monto de detracciones a usar (si use_detractions=True)
) -> Tuple[JournalEntry]:
    """
    Registra el pago de IGV a SUNAT y genera el asiento contable.
    
    Asiento contable:
    - DEBE: IGV por Pagar (40.11) = amount
    - HABER: Caja/Bancos (10.x) = amount
    
    Args:
        uow: UnitOfWork
        company_id: ID de la empresa
        payment_date: Fecha del pago
        amount: Monto pagado
        payment_method: Método de pago (EFECTIVO, TRANSFERENCIA, CHEQUE, etc.)
        cash_account_code: Código de cuenta de caja/banco (opcional, se determina automáticamente)
        payment_reference: Referencia del pago (número de operación, etc.)
        notes: Observaciones
        period_reference: Período al que corresponde el pago (ej: "2025-01")
        created_by: Usuario que creó el registro
        
    Returns:
        JournalEntry: Asiento contable creado
    """
    # Obtener período
    period = uow.db.query(Period).filter(
        Period.company_id == company_id,
        Period.year == payment_date.year,
        Period.month == payment_date.month
    ).first()
    
    if not period:
        raise ValueError(f"No existe período para {payment_date.year}-{payment_date.month:02d}")
    
    # Si se usan detracciones, el asiento es diferente
    if use_detractions and detraction_amount and detraction_amount > 0:
        from ..application.services_detractions import usar_detracciones_para_pagar_igv
        
        # Validar que el monto de detracciones no exceda el monto total
        if detraction_amount > amount:
            raise ValueError(f"El monto de detracciones ({detraction_amount}) no puede exceder el monto total del pago ({amount})")
        
        # Usar detracciones para pagar IGV
        entry, detraction_usage = usar_detracciones_para_pagar_igv(
            uow,
            company_id=company_id,
            usage_date=payment_date,
            amount=detraction_amount,
            period_reference=period_reference,
            notes=notes or f"Pago IGV con detracciones. {payment_reference or ''}",
            created_by=created_by
        )
        
        # Si el monto de detracciones es menor al monto total, pagar el resto con caja/bancos
        remaining_amount = amount - detraction_amount
        if remaining_amount > 0:
            # Determinar cuenta de caja/bancos para el resto
            if not cash_account_code:
                if payment_method in ["TRANSFERENCIA", "CHEQUE", "TARJETA"]:
                    account = uow.db.query(Account).filter(
                        Account.company_id == company_id,
                        Account.code.like('10.2%'),
                        Account.active == True
                    ).first()
                    if account:
                        cash_account_code = account.code
                
                if not cash_account_code:
                    account = uow.db.query(Account).filter(
                        Account.company_id == company_id,
                        Account.code.like('10.1%'),
                        Account.active == True
                    ).first()
                    if account:
                        cash_account_code = account.code
                
                if not cash_account_code:
                    account = uow.db.query(Account).filter(
                        Account.company_id == company_id,
                        Account.code.like('10%'),
                        Account.active == True
                    ).first()
                    if account:
                        cash_account_code = account.code
                
                if not cash_account_code:
                    cash_account_code = "10.10" if payment_method not in ["TRANSFERENCIA", "CHEQUE", "TARJETA"] else "10.20"
            
            # Verificar que la cuenta existe
            cash_account = uow.accounts.by_code(company_id, cash_account_code)
            if not cash_account:
                raise ValueError(f"Cuenta {cash_account_code} no encontrada")
            
            # Crear segundo asiento para el resto del pago con caja/bancos
            glosa_resto = f"Pago de IGV a SUNAT (resto con {payment_method})"
            if period_reference:
                glosa_resto += f" - Período {period_reference}"
            if payment_reference:
                glosa_resto += f" - Ref: {payment_reference}"
            
            entry_lines_resto = [
                EntryLineIn(
                    account_code="40.11",
                    debit=float(remaining_amount),
                    credit=0.0,
                    memo=f"Pago de IGV (resto) - {period_reference or f'{payment_date.year}-{payment_date.month:02d}'}"
                ),
                EntryLineIn(
                    account_code=cash_account_code,
                    debit=0.0,
                    credit=float(remaining_amount),
                    memo=f"Pago IGV {payment_method}"
                )
            ]
            
            entry_data_resto = JournalEntryIn(
                company_id=company_id,
                period_id=period.id,
                date=payment_date,
                currency="PEN",
                glosa=glosa_resto,
                origin="PAGO_IGV",
                lines=entry_lines_resto
            )
            
            entry_resto = post_journal_entry(uow, entry_data_resto)
            return entry_resto  # Retornar el último asiento creado
        
        return entry  # Si se pagó todo con detracciones, retornar ese asiento
    
    # Si NO se usan detracciones, proceder con el pago normal con caja/bancos
    # Determinar cuenta de caja/bancos según método de pago
    if not cash_account_code:
        if payment_method in ["TRANSFERENCIA", "CHEQUE", "TARJETA"]:
            # Buscar una cuenta de bancos (10.2x)
            account = uow.db.query(Account).filter(
                Account.company_id == company_id,
                Account.code.like('10.2%'),
                Account.active == True
            ).first()
            if account:
                cash_account_code = account.code
        
        # Para efectivo, yape, plin o si no se encontró cuenta bancaria
        if not cash_account_code:
            account = uow.db.query(Account).filter(
                Account.company_id == company_id,
                Account.code.like('10.1%'),  # Cuentas de caja
                Account.active == True
            ).first()
            if account:
                cash_account_code = account.code
        
        # Fallback a cualquier cuenta 10.x si no se encuentra una específica
        if not cash_account_code:
            account = uow.db.query(Account).filter(
                Account.company_id == company_id,
                Account.code.like('10%'),
                Account.active == True
            ).first()
            if account:
                cash_account_code = account.code
        
        # Si no se encuentra ninguna, usar un valor por defecto
        if not cash_account_code:
            if payment_method in ["TRANSFERENCIA", "CHEQUE", "TARJETA"]:
                cash_account_code = "10.20"  # Cuenta de bancos por defecto
            else:
                cash_account_code = "10.10"  # Cuenta de caja por defecto
    
    # Verificar que las cuentas existen
    cash_account = uow.accounts.by_code(company_id, cash_account_code)
    if not cash_account:
        raise ValueError(f"Cuenta {cash_account_code} no encontrada")
    
    igv_account = uow.accounts.by_code(company_id, "40.11")
    if not igv_account:
        raise ValueError("Cuenta 40.11 (IGV por Pagar) no encontrada")
    
    # Crear asiento contable
    glosa = f"Pago de IGV a SUNAT"
    if period_reference:
        glosa += f" - Período {period_reference}"
    if payment_reference:
        glosa += f" - Ref: {payment_reference}"
    
    entry_lines = [
        EntryLineIn(
            account_code="40.11",
            debit=float(amount),
            credit=0.0,
            memo=f"Pago de IGV - {period_reference or f'{payment_date.year}-{payment_date.month:02d}'}"
        ),
        EntryLineIn(
            account_code=cash_account_code,
            debit=0.0,
            credit=float(amount),
            memo=f"Pago IGV {payment_method}"
        )
    ]
    
    entry_data = JournalEntryIn(
        company_id=company_id,
        period_id=period.id,
        date=payment_date,
        currency="PEN",
        glosa=glosa,
        origin="PAGO_IGV",
        lines=entry_lines
    )
    
    entry = post_journal_entry(uow, entry_data)
    
    return entry


def obtener_igv_por_pagar(
    db: Session,
    company_id: int,
    period_id: int | None = None,
    year: int | None = None,
    month: int | None = None
) -> Decimal:
    """
    Calcula el IGV por pagar acumulado hasta un período específico.
    
    IGV por Pagar = IGV Débito Fiscal - IGV Crédito Fiscal
    
    Args:
        db: Sesión de base de datos
        company_id: ID de la empresa
        period_id: ID del período (opcional)
        year: Año del período (opcional)
        month: Mes del período (opcional)
        
    Returns:
        Decimal: Monto de IGV por pagar (0 si hay saldo a favor)
    """
    from ..domain.models import Period
    
    # Obtener período
    if period_id:
        period = db.query(Period).filter(Period.id == period_id).first()
    elif year and month:
        period = db.query(Period).filter(
            Period.company_id == company_id,
            Period.year == year,
            Period.month == month
        ).first()
    else:
        # Si no se especifica período, usar el más reciente
        period = db.query(Period).filter(
            Period.company_id == company_id
        ).order_by(Period.year.desc(), Period.month.desc()).first()
    
    if not period:
        return Decimal('0')
    
    # Obtener todos los períodos hasta el actual (inclusive) para cálculo acumulado
    all_periods = db.query(Period).filter(
        Period.company_id == company_id
    ).order_by(Period.year, Period.month).all()
    
    # Filtrar períodos hasta el actual
    period_ids_list = [
        p.id for p in all_periods 
        if (p.year < period.year) or 
           (p.year == period.year and p.month <= period.month)
    ]
    
    if not period_ids_list:
        period_ids_list = [period.id]
    
    # IGV Crédito Fiscal (de compras) - DEBE en 40.11
    igv_credito = db.query(
        func.coalesce(func.sum(EntryLine.debit), Decimal('0'))
    ).join(JournalEntry, JournalEntry.id == EntryLine.entry_id).join(
        Account, Account.id == EntryLine.account_id
    ).filter(
        Account.company_id == company_id,
        Account.code == '40.11',
        JournalEntry.period_id.in_(period_ids_list),
        JournalEntry.status == "POSTED",
        JournalEntry.origin.in_(["COMPRAS", "INVENTARIOS"])
    ).scalar() or Decimal('0')
    
    # IGV Débito Fiscal (de ventas) - HABER en 40.11
    igv_debito = db.query(
        func.coalesce(func.sum(EntryLine.credit), Decimal('0'))
    ).join(JournalEntry, JournalEntry.id == EntryLine.entry_id).join(
        Account, Account.id == EntryLine.account_id
    ).filter(
        Account.company_id == company_id,
        Account.code == '40.11',
        JournalEntry.period_id.in_(period_ids_list),
        JournalEntry.status == "POSTED",
        JournalEntry.origin.in_(["VENTAS"])
    ).scalar() or Decimal('0')
    
    # IGV Pagado (pagos de IGV) - DEBE en 40.11
    # Incluye pagos normales (PAGO_IGV) y pagos con detracciones (USO_DETRACCIONES)
    igv_pagado = db.query(
        func.coalesce(func.sum(EntryLine.debit), Decimal('0'))
    ).join(JournalEntry, JournalEntry.id == EntryLine.entry_id).join(
        Account, Account.id == EntryLine.account_id
    ).filter(
        Account.company_id == company_id,
        Account.code == '40.11',
        JournalEntry.period_id.in_(period_ids_list),
        JournalEntry.status == "POSTED",
        JournalEntry.origin.in_(["PAGO_IGV", "USO_DETRACCIONES"])
    ).scalar() or Decimal('0')
    
    # IGV por pagar = (IGV Débito - IGV Crédito) - IGV Pagado
    igv_por_pagar = (igv_debito - igv_credito) - igv_pagado
    
    # Si es negativo, significa que hay saldo a favor o ya se pagó de más
    return max(Decimal('0'), igv_por_pagar)

