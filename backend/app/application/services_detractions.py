"""
Servicios para Gestión de Detracciones
========================================

Las detracciones son retenciones que hacen los clientes (como el Estado) sobre el total de la factura.
Estas detracciones se pueden usar para pagar el IGV que la empresa debe a SUNAT.
"""
from decimal import Decimal
from datetime import date
from typing import Tuple, Dict
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..domain.models import Account, JournalEntry, EntryLine, Period
from ..domain.models_ext import DetractionUsage, Sale
from ..infrastructure.unit_of_work import UnitOfWork
from ..application.services import post_journal_entry, ensure_accounts_for_demo
from ..application.dtos import JournalEntryIn, EntryLineIn


def obtener_detracciones_disponibles(
    db: Session,
    company_id: int,
    period_id: int | None = None,
    year: int | None = None,
    month: int | None = None
) -> Decimal:
    """
    Calcula las detracciones disponibles (saldo de la cuenta 12.20).
    
    Las detracciones disponibles = Saldo acumulado de la cuenta 12.20 (Detracciones por Cobrar)
    menos las detracciones ya usadas para pagar IGV.
    
    Args:
        db: Sesión de base de datos
        company_id: ID de la empresa
        period_id: ID del período (opcional)
        year: Año del período (opcional)
        month: Mes del período (opcional)
        
    Returns:
        Decimal: Monto de detracciones disponibles
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
    
    # Saldo de la cuenta 12.20 (Detracciones por Cobrar)
    # Saldo = DEBE - HABER (es un activo, así que el saldo es el débito menos el crédito)
    detracciones_acumuladas = db.query(
        func.coalesce(func.sum(EntryLine.debit) - func.sum(EntryLine.credit), Decimal('0'))
    ).join(JournalEntry, JournalEntry.id == EntryLine.entry_id).join(
        Account, Account.id == EntryLine.account_id
    ).filter(
        Account.company_id == company_id,
        Account.code == '12.20',
        JournalEntry.period_id.in_(period_ids_list),
        JournalEntry.status == "POSTED"
    ).scalar() or Decimal('0')
    
    # Detracciones ya usadas para pagar IGV
    detracciones_usadas = db.query(
        func.coalesce(func.sum(DetractionUsage.amount), Decimal('0'))
    ).filter(
        DetractionUsage.company_id == company_id
    ).scalar() or Decimal('0')
    
    # Detracciones disponibles = Acumuladas - Usadas
    disponibles = detracciones_acumuladas - detracciones_usadas
    
    return max(Decimal('0'), disponibles)


def usar_detracciones_para_pagar_igv(
    uow: UnitOfWork,
    *,
    company_id: int,
    usage_date: date,
    amount: Decimal,
    period_reference: str | None = None,
    notes: str | None = None,
    created_by: int | None = None
) -> Tuple[JournalEntry, DetractionUsage]:
    """
    Usa detracciones disponibles para pagar IGV.
    
    Genera dos asientos contables:
    1. Uso de detracciones:
       - DEBE: IGV por Pagar (40.11) = amount
       - CRÉDITO: Detracciones por Cobrar (12.20) = amount
    
    2. Registro de uso (opcional, para control):
       - Se guarda en la tabla detraction_usage
    
    Args:
        uow: UnitOfWork
        company_id: ID de la empresa
        usage_date: Fecha de uso de las detracciones
        amount: Monto de detracciones a usar
        period_reference: Período al que corresponde el pago (ej: "2025-01")
        notes: Observaciones
        created_by: ID del usuario que creó el registro
        
    Returns:
        Tuple[JournalEntry, DetractionUsage]: Asiento contable y registro de uso
    """
    # Verificar que hay detracciones disponibles
    disponibles = obtener_detracciones_disponibles(
        uow.db,
        company_id,
        year=usage_date.year,
        month=usage_date.month
    )
    
    if disponibles < amount:
        raise ValueError(
            f"No hay suficientes detracciones disponibles. "
            f"Disponibles: {disponibles}, Solicitadas: {amount}"
        )
    
    # Obtener período
    period = uow.db.query(Period).filter(
        Period.company_id == company_id,
        Period.year == usage_date.year,
        Period.month == usage_date.month
    ).first()
    
    if not period:
        raise ValueError(f"No existe período para {usage_date.year}-{usage_date.month:02d}")
    
    # Verificar que las cuentas existen
    ensure_accounts_for_demo(uow, company_id)
    
    igv_account = uow.accounts.by_code(company_id, "40.11")
    if not igv_account:
        raise ValueError("Cuenta 40.11 (IGV por Pagar) no encontrada")
    
    detraction_account = uow.accounts.by_code(company_id, "12.20")
    if not detraction_account:
        raise ValueError("Cuenta 12.20 (Detracciones por Cobrar) no encontrada")
    
    # Crear asiento contable
    glosa = f"Uso de detracciones para pago de IGV"
    if period_reference:
        glosa += f" - Período {period_reference}"
    if notes:
        glosa += f" - {notes}"
    
    entry_lines = [
        EntryLineIn(
            account_code="40.11",
            debit=float(amount),
            credit=0.0,
            memo=f"Pago de IGV con detracciones - {period_reference or f'{usage_date.year}-{usage_date.month:02d}'}"
        ),
        EntryLineIn(
            account_code="12.20",
            debit=0.0,
            credit=float(amount),
            memo=f"Uso de detracciones para pago IGV"
        )
    ]
    
    entry_data = JournalEntryIn(
        company_id=company_id,
        period_id=period.id,
        date=usage_date,
        currency="PEN",
        glosa=glosa,
        origin="USO_DETRACCIONES",
        lines=entry_lines
    )
    
    entry = post_journal_entry(uow, entry_data)
    
    # Registrar el uso de detracciones
    detraction_usage = DetractionUsage(
        company_id=company_id,
        usage_date=usage_date,
        amount=amount,
        journal_entry_id=entry.id,
        period_reference=period_reference,
        notes=notes,
        created_by=created_by
    )
    uow.db.add(detraction_usage)
    uow.db.flush()
    
    return entry, detraction_usage


def obtener_resumen_detracciones(
    db: Session,
    company_id: int,
    period_id: int | None = None,
    year: int | None = None,
    month: int | None = None
) -> Dict:
    """
    Obtiene un resumen completo de las detracciones.
    
    Returns:
        Dict con:
        - detracciones_acumuladas: Total de detracciones recibidas
        - detracciones_usadas: Total de detracciones usadas para pagar IGV
        - detracciones_disponibles: Detracciones disponibles para usar
        - detracciones_por_periodo: Lista de detracciones por período
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
        period = db.query(Period).filter(
            Period.company_id == company_id
        ).order_by(Period.year.desc(), Period.month.desc()).first()
    
    if not period:
        return {
            "detracciones_acumuladas": 0.0,
            "detracciones_usadas": 0.0,
            "detracciones_disponibles": 0.0,
            "detracciones_por_periodo": []
        }
    
    # Obtener todos los períodos hasta el actual
    all_periods = db.query(Period).filter(
        Period.company_id == company_id
    ).order_by(Period.year, Period.month).all()
    
    period_ids_list = [
        p.id for p in all_periods 
        if (p.year < period.year) or 
           (p.year == period.year and p.month <= period.month)
    ]
    
    if not period_ids_list:
        period_ids_list = [period.id]
    
    # Detracciones acumuladas (saldo de cuenta 12.20)
    detracciones_acumuladas = db.query(
        func.coalesce(func.sum(EntryLine.debit) - func.sum(EntryLine.credit), Decimal('0'))
    ).join(JournalEntry, JournalEntry.id == EntryLine.entry_id).join(
        Account, Account.id == EntryLine.account_id
    ).filter(
        Account.company_id == company_id,
        Account.code == '12.20',
        JournalEntry.period_id.in_(period_ids_list),
        JournalEntry.status == "POSTED"
    ).scalar() or Decimal('0')
    
    # Detracciones usadas
    detracciones_usadas = db.query(
        func.coalesce(func.sum(DetractionUsage.amount), Decimal('0'))
    ).filter(
        DetractionUsage.company_id == company_id
    ).scalar() or Decimal('0')
    
    # Detracciones disponibles
    detracciones_disponibles = max(Decimal('0'), detracciones_acumuladas - detracciones_usadas)
    
    # Detracciones por período (de ventas)
    detracciones_por_periodo = []
    for p in all_periods:
        if p.id not in period_ids_list:
            continue
        
        # Calcular fecha inicio y fin del período
        from datetime import date as date_type
        start_date = date_type(p.year, p.month, 1)
        if p.month == 12:
            end_date = date_type(p.year + 1, 1, 1)
        else:
            end_date = date_type(p.year, p.month + 1, 1)
        
        # Sumar detracciones de ventas en este período
        total_periodo = db.query(
            func.coalesce(func.sum(Sale.detraction_amount), Decimal('0'))
        ).filter(
            Sale.company_id == company_id,
            Sale.issue_date >= start_date,
            Sale.issue_date < end_date,
            Sale.detraction_amount.isnot(None),
            Sale.detraction_amount > 0
        ).scalar() or Decimal('0')
        
        detracciones_por_periodo.append({
            "year": p.year,
            "month": p.month,
            "total": total_periodo
        })
    
    return {
        "detracciones_acumuladas": float(detracciones_acumuladas),
        "detracciones_usadas": float(detracciones_usadas),
        "detracciones_disponibles": float(detracciones_disponibles),
        "detracciones_por_periodo": [
            {
                "period": f"{p['year']}-{p['month']:02d}",
                "amount": float(p['total'])
            }
            for p in detracciones_por_periodo
        ]
    }

