"""
Endpoints específicos para asientos manuales tipo SAP.

Implementa el flujo completo:
- DRAFT → POSTED
- Reversión de asientos
- Validaciones estrictas
- Trazabilidad completa
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session, joinedload
from datetime import date, datetime
from typing import List, Optional
from pydantic import BaseModel

from ...dependencies import get_db
from ...application.dtos import JournalEntryIn, JournalEntryOut, JournalEntryDetailOut, EntryLineOut
from ...domain.models import JournalEntry, EntryLine, Account, Period, User
from ...infrastructure.unit_of_work import UnitOfWork
from ...security.auth import get_current_user
from ...application.services_journal_manual import (
    create_draft_entry,
    post_draft_entry,
    reverse_entry,
    create_adjustment_entry,
    JournalManualError
)
from ...application.services_journal_validation import validate_journal_entry
from ...application.services_journal_integrity import verify_integrity_hash

router = APIRouter(prefix="/journal/manual", tags=["journal-manual"])


class DraftEntryIn(JournalEntryIn):
    """DTO para crear asiento DRAFT"""
    pass


class PostEntryIn(BaseModel):
    """DTO para postear asiento DRAFT"""
    confirmed_warnings: Optional[List[str]] = None  # Códigos de advertencias confirmadas


class ReverseEntryIn(BaseModel):
    """DTO para revertir asiento POSTED"""
    reversal_date: Optional[date] = None
    reversal_glosa: Optional[str] = None
    reversal_reason: Optional[str] = None  # Motivo obligatorio para auditoría


class AdjustmentEntryIn(BaseModel):
    """DTO para crear asiento de ajuste"""
    adjustment_date: Optional[date] = None
    adjustment_glosa: Optional[str] = None
    adjustment_reason: Optional[str] = None  # Motivo obligatorio para auditoría


@router.post("/draft", response_model=dict)
def create_draft(
    payload: DraftEntryIn,
    entry_subtype: Optional[str] = Query(None, description="Subtipo del asiento (OPENING, CAPITAL, CLOSING, etc.)"),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Crea un asiento manual en estado DRAFT.
    
    El asiento se crea pero NO se postea hasta que se llame a POST /journal/manual/{id}/post
    
    Si se proporciona `entry_subtype`, el asiento se marca con ese subtipo en motor_metadata.
    Esto permite identificar asientos creados desde verificaciones base.
    """
    uow = UnitOfWork(db)
    try:
        entry, validation_info = create_draft_entry(
            uow=uow,
            entry_data=payload,
            user_id=current_user.id,
            entry_subtype=entry_subtype
        )
        uow.commit()
        
        # Construir respuesta
        total_debit = float(sum([float(l.debit) for l in entry.lines]))
        total_credit = float(sum([float(l.credit) for l in entry.lines]))
        
        return {
            "id": entry.id,
            "company_id": entry.company_id,
            "date": entry.date,
            "glosa": entry.glosa or "",
            "currency": entry.currency,
            "origin": entry.origin,
            "status": entry.status,
            "correlative": entry.correlative,
            "total_debit": total_debit,
            "total_credit": total_credit,
            "created_by": entry.created_by,
            "created_at": entry.created_at.isoformat() if entry.created_at else None,
            "warnings": validation_info["warnings"],
            "requires_confirmation": validation_info["requires_confirmation"]
        }
    except JournalManualError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        uow.close()


@router.put("/{entry_id}", response_model=dict)
def update_draft(
    entry_id: int,
    payload: DraftEntryIn,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Actualiza un asiento DRAFT.
    
    Solo se pueden editar asientos en estado DRAFT.
    """
    uow = UnitOfWork(db)
    try:
        entry = uow.db.query(JournalEntry).filter(JournalEntry.id == entry_id).first()
        if not entry:
            raise HTTPException(404, detail="Asiento no encontrado")
        
        if entry.status != "DRAFT":
            raise HTTPException(400, detail=f"No se puede editar el asiento #{entry_id}. Solo se pueden editar asientos en estado DRAFT. Estado actual: {entry.status}")
        
        if entry.origin != "MANUAL":
            raise HTTPException(400, detail="Solo se pueden editar asientos manuales desde este endpoint")
        
        # Validar período
        from ...application.services_cierre_periodo import can_modify_entry_in_period
        y, m = payload.date.year, payload.date.month
        period = uow.periods.get_or_open(payload.company_id, y, m)
        
        role_str = str(current_user.role.value) if hasattr(current_user.role, 'value') else str(current_user.role)
        if not can_modify_entry_in_period(uow.db, period.id, role_str):
            if period.status == "CERRADO":
                raise HTTPException(403, detail=f"El período {period.year}-{period.month:02d} está cerrado")
            else:
                raise HTTPException(403, detail="No autorizado para editar asientos en este período")
        
        # Validar con reglas tipo SAP
        validation_result = validate_journal_entry(
            db=uow.db,
            company_id=payload.company_id,
            entry_data=payload,
            lines=payload.lines,
            existing_entry=entry,
            user_id=current_user.id
        )
        
        if validation_result.errors:
            error_messages = [err["message"] for err in validation_result.errors]
            raise HTTPException(400, detail=f"Errores de validación: {'; '.join(error_messages)}")
        
        # Actualizar asiento
        entry.date = payload.date
        entry.glosa = payload.glosa
        entry.currency = payload.currency
        entry.exchange_rate = payload.exchange_rate
        entry.period_id = period.id
        entry.updated_by = current_user.id
        entry.updated_at = datetime.now()
        
        # Eliminar líneas antiguas
        uow.db.query(EntryLine).filter(EntryLine.entry_id == entry.id).delete()
        uow.db.flush()
        
        # Crear nuevas líneas
        for line_data in payload.lines:
            account = uow.accounts.by_code(payload.company_id, line_data.account_code)
            if not account:
                raise HTTPException(400, detail=f"Cuenta no existe: {line_data.account_code}")
            
            from decimal import Decimal
            new_line = EntryLine(
                entry_id=entry.id,
                account_id=account.id,
                debit=Decimal(str(line_data.debit)).quantize(Decimal('0.01')),
                credit=Decimal(str(line_data.credit)).quantize(Decimal('0.01')),
                memo=line_data.memo,
                third_party_id=line_data.third_party_id,
                cost_center=line_data.cost_center
            )
            uow.db.add(new_line)
        
        uow.db.flush()
        
        # Actualizar hash de integridad
        from ...application.services_journal_integrity import update_integrity_hash
        update_integrity_hash(entry)
        
        uow.commit()
        uow.db.refresh(entry)
        
        total_debit = float(sum([float(l.debit) for l in entry.lines]))
        total_credit = float(sum([float(l.credit) for l in entry.lines]))
        
        return {
            "id": entry.id,
            "company_id": entry.company_id,
            "date": entry.date,
            "glosa": entry.glosa or "",
            "currency": entry.currency,
            "origin": entry.origin,
            "status": entry.status,
            "total_debit": total_debit,
            "total_credit": total_credit,
            "updated_by": entry.updated_by,
            "updated_at": entry.updated_at.isoformat() if entry.updated_at else None,
            "warnings": [{"code": w.code, "message": w.message} for w in validation_result.warnings],
            "requires_confirmation": any(w.requires_confirmation for w in validation_result.warnings)
        }
    except JournalManualError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        uow.close()


@router.post("/{entry_id}/post", response_model=JournalEntryOut)
def post_entry(
    entry_id: int,
    payload: PostEntryIn = Body(...),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Postea un asiento DRAFT (lo convierte a POSTED).
    
    Requiere confirmación de advertencias si existen.
    """
    uow = UnitOfWork(db)
    try:
        entry = post_draft_entry(
            uow=uow,
            entry_id=entry_id,
            user_id=current_user.id,
            confirmed_warnings=payload.confirmed_warnings
        )
        uow.commit()
        uow.db.refresh(entry)
        
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
    except JournalManualError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        uow.close()


@router.post("/{entry_id}/reverse", response_model=JournalEntryOut)
def reverse_entry_endpoint(
    entry_id: int,
    payload: ReverseEntryIn = Body(...),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Revierte un asiento POSTED creando un nuevo asiento REVERSED.
    
    El asiento original queda marcado como revertido y no se puede modificar.
    """
    uow = UnitOfWork(db)
    try:
        reversal_date = payload.reversal_date or date.today()
        reversal_entry = reverse_entry(
            uow=uow,
            entry_id=entry_id,
            user_id=current_user.id,
            reversal_date=datetime.combine(reversal_date, datetime.min.time()),
            reversal_glosa=payload.reversal_glosa or payload.reversal_reason
        )
        uow.commit()
        uow.db.refresh(reversal_entry)
        
        total_debit = float(sum([float(l.debit) for l in reversal_entry.lines]))
        total_credit = float(sum([float(l.credit) for l in reversal_entry.lines]))
        
        return JournalEntryOut(
            id=reversal_entry.id,
            company_id=reversal_entry.company_id,
            date=reversal_entry.date,
            glosa=reversal_entry.glosa or "",
            currency=reversal_entry.currency,
            origin=reversal_entry.origin,
            status=reversal_entry.status,
            total_debit=total_debit,
            total_credit=total_credit,
        )
    except JournalManualError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        uow.close()


@router.post("/{entry_id}/adjust", response_model=JournalEntryDetailOut)
def create_adjustment_endpoint(
    entry_id: int,
    payload: AdjustmentEntryIn = Body(...),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Crea un asiento de ajuste (DRAFT) referenciando un asiento POSTED.
    
    El sistema NO calcula diferencias automáticamente.
    El usuario debe definir cuentas y montos manualmente.
    El asiento se crea en estado DRAFT y debe ser posteado manualmente.
    """
    uow = UnitOfWork(db)
    try:
        adjustment_date = payload.adjustment_date or date.today()
        adjustment_entry = create_adjustment_entry(
            uow=uow,
            entry_id=entry_id,
            user_id=current_user.id,
            adjustment_date=adjustment_date,
            adjustment_glosa=payload.adjustment_glosa or payload.adjustment_reason
        )
        uow.commit()
        uow.db.refresh(adjustment_entry)
        
        # Construir líneas (vacías, el usuario las agregará)
        lines_out = []
        
        total_debit = 0.0
        total_credit = 0.0
        
        # Obtener periodo para period_year y period_month
        period = uow.db.query(Period).filter(Period.id == adjustment_entry.period_id).first()
        
        return JournalEntryDetailOut(
            id=adjustment_entry.id,
            company_id=adjustment_entry.company_id,
            date=adjustment_entry.date,
            glosa=adjustment_entry.glosa or "",
            currency=adjustment_entry.currency,
            origin=adjustment_entry.origin,
            status=adjustment_entry.status,
            total_debit=total_debit,
            total_credit=total_credit,
            period_id=adjustment_entry.period_id,
            period_year=period.year if period else 0,
            period_month=period.month if period else 0,
            exchange_rate=float(adjustment_entry.exchange_rate),
            lines=lines_out,
            correlative=adjustment_entry.correlative,
            motor_metadata={
                **((adjustment_entry.motor_metadata or {})),
                "created_by": adjustment_entry.created_by,
                "created_at": adjustment_entry.created_at.isoformat() if adjustment_entry.created_at else None,
            }
        )
    except JournalManualError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        uow.close()


@router.get("/{entry_id}/warnings")
def get_entry_warnings(entry_id: int, db: Session = Depends(get_db)):
    """
    Obtiene las advertencias de validación para un asiento DRAFT antes de postear.
    """
    from ...application.services_journal_validation import validate_journal_entry
    from ...application.dtos import JournalEntryIn, EntryLineIn
    
    entry = db.query(JournalEntry).options(
        joinedload(JournalEntry.lines)
    ).filter(JournalEntry.id == entry_id).first()
    
    if not entry:
        raise HTTPException(404, detail="Asiento no encontrado")
    
    if entry.status != "DRAFT":
        raise HTTPException(400, detail=f"El asiento #{entry_id} no está en estado DRAFT")
    
    # Construir datos para validación
    lines_data = []
    for line in entry.lines:
        account = db.query(Account).filter(Account.id == line.account_id).first()
        if account:
            lines_data.append(EntryLineIn(
                account_code=account.code,
                debit=float(line.debit),
                credit=float(line.credit),
                memo=line.memo or "",
                third_party_id=line.third_party_id,
                cost_center=line.cost_center
            ))
    
    entry_in_data = JournalEntryIn(
        company_id=entry.company_id,
        date=entry.date,
        glosa=entry.glosa or "",
        currency=entry.currency,
        exchange_rate=float(entry.exchange_rate),
        origin=entry.origin,
        lines=lines_data
    )
    
    # Validar
    validation_result = validate_journal_entry(
        db=db,
        company_id=entry.company_id,
        entry_data=entry_in_data,
        lines=lines_data,
        existing_entry=entry
    )
    
    # Convertir advertencias a formato JSON
    warnings = []
    for warning in validation_result.warnings:
        warnings.append({
            "code": warning.code,
            "message": warning.message,
            "requires_confirmation": warning.requires_confirmation
        })
    
    return {
        "warnings": warnings,
        "errors": validation_result.errors,
        "has_errors": len(validation_result.errors) > 0,
        "has_warnings": len(warnings) > 0
    }


@router.get("/{entry_id}", response_model=JournalEntryDetailOut)
def get_manual_entry(entry_id: int, db: Session = Depends(get_db)):
    """
    Obtiene un asiento manual con toda su información y trazabilidad.
    """
    entry = db.query(JournalEntry).options(
        joinedload(JournalEntry.lines)
    ).filter(JournalEntry.id == entry_id).first()
    
    if not entry:
        raise HTTPException(404, detail="Asiento no encontrado")
    
    # Verificar integridad
    integrity_ok = verify_integrity_hash(entry) if entry.integrity_hash else None
    
    # Obtener periodo
    period = db.query(Period).filter(Period.id == entry.period_id).first()
    
    # Construir líneas
    lines_out = []
    for line in entry.lines:
        account = db.query(Account).filter(Account.id == line.account_id).first()
        lines_out.append(EntryLineOut(
            id=line.id,
            account_code=account.code if account else "",
            account_name=account.name if account else "",
            debit=float(line.debit),
            credit=float(line.credit),
            memo=line.memo,
            third_party_id=line.third_party_id,
            cost_center=line.cost_center,
        ))
    
    total_debit = float(sum([float(l.debit) for l in entry.lines]))
    total_credit = float(sum([float(l.credit) for l in entry.lines]))
    
    return JournalEntryDetailOut(
        id=entry.id,
        company_id=entry.company_id,
        date=entry.date,
        glosa=entry.glosa or "",
        currency=entry.currency,
        origin=entry.origin,
        status=entry.status,
        total_debit=total_debit,
        total_credit=total_credit,
        period_id=entry.period_id,
        period_year=period.year if period else 0,
        period_month=period.month if period else 0,
        exchange_rate=float(entry.exchange_rate),
        lines=lines_out,
        correlative=entry.correlative,
        motor_metadata={
            **((entry.motor_metadata or {})),
            "integrity_verified": integrity_ok,
            "created_by": entry.created_by,
            "created_at": entry.created_at.isoformat() if entry.created_at else None,
            "posted_by": entry.posted_by,
            "posted_at": entry.posted_at.isoformat() if entry.posted_at else None,
            "reversed_entry_id": entry.reversed_entry_id,
            "reversed_by": entry.reversed_by,
            "reversed_at": entry.reversed_at.isoformat() if entry.reversed_at else None,
        }
    )

