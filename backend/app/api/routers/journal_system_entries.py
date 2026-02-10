"""
Endpoints para asientos principales del sistema contable.

Implementa:
- Asientos de Patrimonio
- Asientos de Apertura
- Fondos en banco
- Cierre de Resultados
"""
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from datetime import date
from decimal import Decimal
from typing import Dict, Optional
from pydantic import BaseModel

from ...dependencies import get_db
from ...domain.models import JournalEntry
from ...infrastructure.unit_of_work import UnitOfWork
from ...security.auth import get_current_user
from ...application.services_journal_system_entries import (
    create_equity_entry,
    create_opening_entry,
    create_bank_funds_entry,
    create_results_closing_entry,
    SystemEntryError
)
from ...application.dtos import JournalEntryOut

router = APIRouter(prefix="/journal/system", tags=["journal-system"])


class EquityEntryIn(BaseModel):
    """DTO para crear asiento de Patrimonio"""
    company_id: int
    entry_date: date
    capital_amount: Decimal
    reserves_amount: Decimal = Decimal('0.00')
    glosa: Optional[str] = None


class OpeningEntryIn(BaseModel):
    """DTO para crear asiento de Apertura"""
    company_id: int
    opening_date: date
    balances: Dict[str, Decimal]  # {account_code: balance}
    glosa: Optional[str] = None


class BankFundsEntryIn(BaseModel):
    """DTO para crear asiento de Fondos en Banco"""
    company_id: int
    entry_date: date
    bank_account_code: str
    amount: Decimal
    glosa: Optional[str] = None


class ResultsClosingEntryIn(BaseModel):
    """DTO para crear asiento de Cierre de Resultados"""
    company_id: int
    closing_date: date
    glosa: Optional[str] = None


@router.post("/equity", response_model=JournalEntryOut)
def create_equity(
    payload: EquityEntryIn,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Crea asiento de Patrimonio (Capital y Reservas).
    
    Este asiento registra el aporte inicial de capital de los socios.
    """
    uow = UnitOfWork(db)
    try:
        entry = create_equity_entry(
            uow=uow,
            company_id=payload.company_id,
            entry_date=payload.entry_date,
            capital_amount=payload.capital_amount,
            reserves_amount=payload.reserves_amount,
            glosa=payload.glosa,
            user_id=current_user.id
        )
        uow.commit()
        
        total_debit = float(sum([float(l.debit) for l in entry.lines]))
        total_credit = float(sum([float(l.credit) for l in entry.lines]))
        
        return JournalEntryOut(
            id=entry.id,
            company_id=entry.company_id,
            date=entry.date,
            glosa=entry.glosa or "",
            currency=entry.currency,
            origin=entry.origin,
            status=entry.status,
            total_debit=total_debit,
            total_credit=total_credit,
        )
    except SystemEntryError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        uow.close()


@router.post("/opening", response_model=JournalEntryOut)
def create_opening(
    payload: OpeningEntryIn,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Crea asiento de Apertura del ejercicio.
    
    Este asiento registra los saldos iniciales de todas las cuentas al inicio del ejercicio.
    """
    uow = UnitOfWork(db)
    try:
        entry = create_opening_entry(
            uow=uow,
            company_id=payload.company_id,
            opening_date=payload.opening_date,
            balances=payload.balances,
            glosa=payload.glosa,
            user_id=current_user.id
        )
        uow.commit()
        
        total_debit = float(sum([float(l.debit) for l in entry.lines]))
        total_credit = float(sum([float(l.credit) for l in entry.lines]))
        
        return JournalEntryOut(
            id=entry.id,
            company_id=entry.company_id,
            date=entry.date,
            glosa=entry.glosa or "",
            currency=entry.currency,
            origin=entry.origin,
            status=entry.status,
            total_debit=total_debit,
            total_credit=total_credit,
        )
    except SystemEntryError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        uow.close()


@router.post("/bank-funds", response_model=JournalEntryOut)
def create_bank_funds(
    payload: BankFundsEntryIn,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Crea asiento de Fondos en Banco (depósito de efectivo en banco).
    """
    uow = UnitOfWork(db)
    try:
        entry = create_bank_funds_entry(
            uow=uow,
            company_id=payload.company_id,
            entry_date=payload.entry_date,
            bank_account_code=payload.bank_account_code,
            amount=payload.amount,
            glosa=payload.glosa,
            user_id=current_user.id
        )
        uow.commit()
        
        total_debit = float(sum([float(l.debit) for l in entry.lines]))
        total_credit = float(sum([float(l.credit) for l in entry.lines]))
        
        return JournalEntryOut(
            id=entry.id,
            company_id=entry.company_id,
            date=entry.date,
            glosa=entry.glosa or "",
            currency=entry.currency,
            origin=entry.origin,
            status=entry.status,
            total_debit=total_debit,
            total_credit=total_credit,
        )
    except SystemEntryError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        uow.close()


@router.post("/results-closing", response_model=JournalEntryOut)
def create_results_closing(
    payload: ResultsClosingEntryIn,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Crea asiento de Cierre de Resultados (cierre de ejercicio).
    
    Calcula automáticamente los saldos de cuentas de resultado y los transfiere
    a la cuenta de Resultados del Ejercicio.
    """
    uow = UnitOfWork(db)
    try:
        entry = create_results_closing_entry(
            uow=uow,
            company_id=payload.company_id,
            closing_date=payload.closing_date,
            glosa=payload.glosa,
            user_id=current_user.id
        )
        uow.commit()
        
        total_debit = float(sum([float(l.debit) for l in entry.lines]))
        total_credit = float(sum([float(l.credit) for l in entry.lines]))
        
        return JournalEntryOut(
            id=entry.id,
            company_id=entry.company_id,
            date=entry.date,
            glosa=entry.glosa or "",
            currency=entry.currency,
            origin=entry.origin,
            status=entry.status,
            total_debit=total_debit,
            total_credit=total_credit,
        )
    except SystemEntryError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        uow.close()

