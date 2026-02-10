"""
Servicios para asientos principales del sistema contable.

Implementa:
- Asientos de Patrimonio
- Asientos de Apertura
- Fondos en banco
- Cierre de Resultados
"""
from decimal import Decimal
from datetime import date, datetime
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

from ..domain.models import JournalEntry, EntryLine, Account, Period
from ..infrastructure.unit_of_work import UnitOfWork
from ..application.services_correlative import generate_correlative
from ..application.services_journal_integrity import update_integrity_hash


class SystemEntryError(Exception):
    """Error en creación de asiento del sistema"""
    pass


def create_equity_entry(
    uow: UnitOfWork,
    company_id: int,
    entry_date: date,
    capital_amount: Decimal,
    reserves_amount: Decimal = Decimal('0.00'),
    glosa: Optional[str] = None,
    user_id: Optional[int] = None
) -> JournalEntry:
    """
    Crea asiento de Patrimonio (Capital y Reservas).
    
    Args:
        uow: UnitOfWork
        company_id: ID de la empresa
        entry_date: Fecha del asiento
        capital_amount: Monto de capital
        reserves_amount: Monto de reservas (opcional)
        glosa: Descripción del asiento
        user_id: ID del usuario creador
        
    Returns:
        JournalEntry creado
    """
    # Validar período
    y, m = entry_date.year, entry_date.month
    period = uow.periods.get_or_open(company_id, y, m)
    
    # Buscar cuentas de patrimonio
    capital_account = uow.accounts.by_code(company_id, "50.10")  # Capital Social
    if not capital_account:
        raise SystemEntryError("Cuenta 50.10 (Capital Social) no existe. Cree la cuenta primero.")
    
    # Buscar cuenta de efectivo o banco para el debe
    cash_account = uow.accounts.by_code(company_id, "10.10")  # Caja
    if not cash_account:
        cash_account = uow.accounts.by_code(company_id, "10.20")  # Banco
    
    if not cash_account:
        raise SystemEntryError("No se encontró cuenta de Caja (10.10) o Banco (10.20). Cree una cuenta primero.")
    
    # Generar glosa
    glosa_final = glosa or f"Aporte de Capital - {capital_amount}"
    
    # Generar correlativo
    correlative = generate_correlative(
        db=uow.db,
        company_id=company_id,
        origin="MANUAL",
        entry_date=entry_date
    )
    
    # Crear asiento
    entry = JournalEntry(
        company_id=company_id,
        date=entry_date,
        period_id=period.id,
        glosa=glosa_final,
        currency="PEN",
        exchange_rate=Decimal('1.0'),
        origin="MANUAL",
        status="POSTED",
        correlative=correlative,
        created_by=user_id,
        created_at=datetime.now(),
        posted_by=user_id,
        posted_at=datetime.now()
    )
    
    # Crear líneas
    total_amount = capital_amount + reserves_amount
    lines = [
        EntryLine(
            account_id=cash_account.id,
            debit=total_amount,
            credit=Decimal('0.00'),
            memo="Aporte de capital"
        ),
        EntryLine(
            account_id=capital_account.id,
            debit=Decimal('0.00'),
            credit=capital_amount,
            memo="Capital social"
        )
    ]
    
    # Agregar reservas si aplica
    if reserves_amount > 0:
        reserves_account = uow.accounts.by_code(company_id, "51.10")  # Reservas
        if reserves_account:
            lines.append(EntryLine(
                account_id=reserves_account.id,
                debit=Decimal('0.00'),
                credit=reserves_amount,
                memo="Reservas"
            ))
    
    entry.lines = lines
    uow.journal.add_entry(entry)
    uow.db.flush()
    
    # Calcular hash de integridad
    update_integrity_hash(entry)
    uow.db.flush()
    
    return entry


def create_opening_entry(
    uow: UnitOfWork,
    company_id: int,
    opening_date: date,
    balances: Dict[str, Decimal],  # {account_code: balance}
    glosa: Optional[str] = None,
    user_id: Optional[int] = None
) -> JournalEntry:
    """
    Crea asiento de Apertura del ejercicio.
    
    Args:
        uow: UnitOfWork
        company_id: ID de la empresa
        opening_date: Fecha de apertura (primer día del ejercicio)
        balances: Diccionario con saldos de cuentas {account_code: balance}
        glosa: Descripción del asiento
        user_id: ID del usuario creador
        
    Returns:
        JournalEntry creado
    """
    # Validar período
    y, m = opening_date.year, opening_date.month
    period = uow.periods.get_or_open(company_id, y, m)
    
    # Generar glosa
    glosa_final = glosa or f"Asiento de Apertura - Ejercicio {y}"
    
    # Generar correlativo
    correlative = generate_correlative(
        db=uow.db,
        company_id=company_id,
        origin="MANUAL",
        entry_date=opening_date
    )
    
    # Crear asiento
    entry = JournalEntry(
        company_id=company_id,
        date=opening_date,
        period_id=period.id,
        glosa=glosa_final,
        currency="PEN",
        exchange_rate=Decimal('1.00'),
        origin="MANUAL",
        status="POSTED",
        correlative=correlative,
        created_by=user_id,
        created_at=datetime.now(),
        posted_by=user_id,
        posted_at=datetime.now()
    )
    
    # Crear líneas desde balances
    lines = []
    total_debit = Decimal('0.00')
    total_credit = Decimal('0.00')
    
    for account_code, balance in balances.items():
        account = uow.accounts.by_code(company_id, account_code)
        if not account:
            raise SystemEntryError(f"Cuenta {account_code} no existe")
        
        if balance > 0:
            # Saldo deudor
            lines.append(EntryLine(
                account_id=account.id,
                debit=balance,
                credit=Decimal('0.00'),
                memo=f"Saldo inicial - {account.name}"
            ))
            total_debit += balance
        elif balance < 0:
            # Saldo acreedor
            lines.append(EntryLine(
                account_id=account.id,
                debit=Decimal('0.00'),
                credit=abs(balance),
                memo=f"Saldo inicial - {account.name}"
            ))
            total_credit += abs(balance)
    
    # Validar cuadre
    if total_debit != total_credit:
        raise SystemEntryError(
            f"El asiento de apertura no cuadra: Debe={total_debit} ≠ Haber={total_credit}"
        )
    
    entry.lines = lines
    uow.journal.add_entry(entry)
    uow.db.flush()
    
    # Calcular hash de integridad
    update_integrity_hash(entry)
    uow.db.flush()
    
    return entry


def create_bank_funds_entry(
    uow: UnitOfWork,
    company_id: int,
    entry_date: date,
    bank_account_code: str,
    amount: Decimal,
    glosa: Optional[str] = None,
    user_id: Optional[int] = None
) -> JournalEntry:
    """
    Crea asiento de Fondos en Banco.
    
    Args:
        uow: UnitOfWork
        company_id: ID de la empresa
        entry_date: Fecha del asiento
        bank_account_code: Código de cuenta bancaria (10.2x)
        amount: Monto depositado
        glosa: Descripción del asiento
        user_id: ID del usuario creador
        
    Returns:
        JournalEntry creado
    """
    # Validar período
    y, m = entry_date.year, entry_date.month
    period = uow.periods.get_or_open(company_id, y, m)
    
    # Buscar cuenta bancaria
    bank_account = uow.accounts.by_code(company_id, bank_account_code)
    if not bank_account:
        raise SystemEntryError(f"Cuenta bancaria {bank_account_code} no existe")
    
    # Buscar cuenta de origen (Caja o otra cuenta)
    cash_account = uow.accounts.by_code(company_id, "10.10")  # Caja
    if not cash_account:
        raise SystemEntryError("Cuenta 10.10 (Caja) no existe")
    
    # Generar glosa
    glosa_final = glosa or f"Depósito en {bank_account.name} - {amount}"
    
    # Generar correlativo
    correlative = generate_correlative(
        db=uow.db,
        company_id=company_id,
        origin="MANUAL",
        entry_date=entry_date
    )
    
    # Crear asiento
    entry = JournalEntry(
        company_id=company_id,
        date=entry_date,
        period_id=period.id,
        glosa=glosa_final,
        currency="PEN",
        exchange_rate=Decimal('1.00'),
        origin="MANUAL",
        status="POSTED",
        correlative=correlative,
        created_by=user_id,
        created_at=datetime.now(),
        posted_by=user_id,
        posted_at=datetime.now()
    )
    
    # Crear líneas
    entry.lines = [
        EntryLine(
            account_id=bank_account.id,
            debit=amount,
            credit=Decimal('0.00'),
            memo=f"Depósito en {bank_account.name}"
        ),
        EntryLine(
            account_id=cash_account.id,
            debit=Decimal('0.00'),
            credit=amount,
            memo=f"Egreso de caja"
        )
    ]
    
    uow.journal.add_entry(entry)
    uow.db.flush()
    
    # Calcular hash de integridad
    update_integrity_hash(entry)
    uow.db.flush()
    
    return entry


def create_results_closing_entry(
    uow: UnitOfWork,
    company_id: int,
    closing_date: date,
    glosa: Optional[str] = None,
    user_id: Optional[int] = None
) -> JournalEntry:
    """
    Crea asiento de Cierre de Resultados (cierre de ejercicio).
    
    Calcula automáticamente los saldos de cuentas de resultado y los transfiere
    a la cuenta de Resultados del Ejercicio.
    
    Args:
        uow: UnitOfWork
        company_id: ID de la empresa
        closing_date: Fecha de cierre
        glosa: Descripción del asiento
        user_id: ID del usuario creador
        
    Returns:
        JournalEntry creado
    """
    # Validar período
    y, m = closing_date.year, closing_date.month
    period = uow.periods.get_or_open(company_id, y, m)
    
    # Buscar cuenta de Resultados del Ejercicio
    results_account = uow.accounts.by_code(company_id, "59.10")  # Resultados del Ejercicio
    if not results_account:
        raise SystemEntryError("Cuenta 59.10 (Resultados del Ejercicio) no existe. Cree la cuenta primero.")
    
    # Calcular saldos de cuentas de resultado
    from sqlalchemy import func
    from ..domain.models import EntryLine
    
    # Obtener todas las cuentas de resultado (70.x ingresos, 60.x/90.x gastos)
    income_accounts = uow.db.query(Account).filter(
        Account.company_id == company_id,
        Account.code.like("70.%"),
        Account.active == True
    ).all()
    
    expense_accounts = uow.db.query(Account).filter(
        Account.company_id == company_id,
        (Account.code.like("60.%") | Account.code.like("90.%")),
        Account.active == True
    ).all()
    
    # Calcular saldos hasta la fecha de cierre
    lines = []
    total_income = Decimal('0.00')
    total_expense = Decimal('0.00')
    
    # Ingresos (70.x) - saldo acreedor (crédito - débito)
    for account in income_accounts:
        total_credit = uow.db.query(func.sum(EntryLine.credit)).filter(
            EntryLine.account_id == account.id,
            EntryLine.entry_id.in_(
                uow.db.query(JournalEntry.id).filter(
                    JournalEntry.company_id == company_id,
                    JournalEntry.date <= closing_date,
                    JournalEntry.status == "POSTED"
                )
            )
        ).scalar() or Decimal('0.00')
        
        total_debit = uow.db.query(func.sum(EntryLine.debit)).filter(
            EntryLine.account_id == account.id,
            EntryLine.entry_id.in_(
                uow.db.query(JournalEntry.id).filter(
                    JournalEntry.company_id == company_id,
                    JournalEntry.date <= closing_date,
                    JournalEntry.status == "POSTED"
                )
            )
        ).scalar() or Decimal('0.00')
        
        balance = total_credit - total_debit
        if balance != 0:
            lines.append(EntryLine(
                account_id=account.id,
                debit=balance,  # Cerrar ingresos (debe)
                credit=Decimal('0.00'),
                memo=f"Cierre de ejercicio - {account.name}"
            ))
            total_income += balance
    
    # Gastos (60.x, 90.x) - saldo deudor (débito - crédito)
    for account in expense_accounts:
        total_debit = uow.db.query(func.sum(EntryLine.debit)).filter(
            EntryLine.account_id == account.id,
            EntryLine.entry_id.in_(
                uow.db.query(JournalEntry.id).filter(
                    JournalEntry.company_id == company_id,
                    JournalEntry.date <= closing_date,
                    JournalEntry.status == "POSTED"
                )
            )
        ).scalar() or Decimal('0.00')
        
        total_credit = uow.db.query(func.sum(EntryLine.credit)).filter(
            EntryLine.account_id == account.id,
            EntryLine.entry_id.in_(
                uow.db.query(JournalEntry.id).filter(
                    JournalEntry.company_id == company_id,
                    JournalEntry.date <= closing_date,
                    JournalEntry.status == "POSTED"
                )
            )
        ).scalar() or Decimal('0.00')
        
        balance = total_debit - total_credit
        if balance != 0:
            lines.append(EntryLine(
                account_id=account.id,
                debit=Decimal('0.00'),
                credit=balance,  # Cerrar gastos (haber)
                memo=f"Cierre de ejercicio - {account.name}"
            ))
            total_expense += balance
    
    # Calcular resultado neto
    net_result = total_income - total_expense
    
    # Agregar línea de Resultados del Ejercicio
    if net_result > 0:
        # Utilidad
        lines.append(EntryLine(
            account_id=results_account.id,
            debit=Decimal('0.00'),
            credit=net_result,
            memo="Utilidad del ejercicio"
        ))
    elif net_result < 0:
        # Pérdida
        lines.append(EntryLine(
            account_id=results_account.id,
            debit=abs(net_result),
            credit=Decimal('0.00'),
            memo="Pérdida del ejercicio"
        ))
    else:
        # Sin resultado
        raise SystemEntryError("No hay resultado para cerrar (ingresos = gastos)")
    
    # Generar glosa
    glosa_final = glosa or f"Cierre de Resultados - Ejercicio {y}"
    
    # Generar correlativo
    correlative = generate_correlative(
        db=uow.db,
        company_id=company_id,
        origin="MANUAL",
        entry_date=closing_date
    )
    
    # Crear asiento
    entry = JournalEntry(
        company_id=company_id,
        date=closing_date,
        period_id=period.id,
        glosa=glosa_final,
        currency="PEN",
        exchange_rate=Decimal('1.00'),
        origin="MANUAL",
        status="POSTED",
        correlative=correlative,
        created_by=user_id,
        created_at=datetime.now(),
        posted_by=user_id,
        posted_at=datetime.now()
    )
    
    entry.lines = lines
    uow.journal.add_entry(entry)
    uow.db.flush()
    
    # Calcular hash de integridad
    update_integrity_hash(entry)
    uow.db.flush()
    
    return entry

