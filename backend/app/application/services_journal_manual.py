"""
Servicios para asientos manuales tipo SAP.

Implementa el flujo completo DRAFT → POSTED → REVERSED
con todas las validaciones y trazabilidad.
"""
from decimal import Decimal
from datetime import datetime, date
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from ..domain.models import JournalEntry, EntryLine, Account, Period, User
from ..infrastructure.unit_of_work import UnitOfWork
from ..application.dtos import JournalEntryIn, EntryLineIn
from ..application.services import post_journal_entry, patch_journal_entry
from ..application.services_correlative import generate_correlative
from ..application.services_journal_validation import (
    validate_journal_entry,
    ValidationError,
    ValidationWarning
)
from ..application.services_journal_integrity import (
    calculate_integrity_hash,
    update_integrity_hash,
    verify_integrity_hash
)
from ..application.services_cierre_periodo import can_modify_entry_in_period
from ..application.services_audit import log_audit, MODULE_ASIENTOS, ACTION_CREATE, ACTION_POST, ACTION_REVERSE


class JournalManualError(Exception):
    """Error en operación de asiento manual"""
    pass


def create_draft_entry(
    uow: UnitOfWork,
    entry_data: JournalEntryIn,
    user_id: int,
    entry_subtype: Optional[str] = None  # OPENING, CAPITAL, CLOSING, etc.
) -> Tuple[JournalEntry, Dict[str, Any]]:
    """
    Crea un asiento en estado DRAFT.
    
    Args:
        uow: UnitOfWork
        entry_data: Datos del asiento
        user_id: ID del usuario creador
        
    Returns:
        Tuple (JournalEntry, validation_result)
    """
    # Validar entrada básica
    if not entry_data.glosa or not entry_data.glosa.strip():
        raise JournalManualError("La glosa (descripción) es obligatoria")
    
    if not entry_data.lines or len(entry_data.lines) < 2:
        raise JournalManualError("Un asiento debe tener al menos 2 líneas (partida doble)")
    
    # Validar período
    y, m = entry_data.date.year, entry_data.date.month
    period = uow.periods.get_or_open(entry_data.company_id, y, m)
    if not period:
        raise JournalManualError("Período no encontrado")
    
    # Validar con reglas tipo SAP
    validation_result = validate_journal_entry(
        db=uow.db,
        company_id=entry_data.company_id,
        entry_data=entry_data,
        lines=entry_data.lines,
        user_id=user_id
    )
    
    # Si hay errores, lanzar excepción
    if validation_result.errors:
        error_messages = [err["message"] for err in validation_result.errors]
        raise JournalManualError(f"Errores de validación: {'; '.join(error_messages)}")
    
    # Generar correlativo
    origin = entry_data.origin or "MANUAL"
    correlative = generate_correlative(
        db=uow.db,
        company_id=entry_data.company_id,
        origin=origin,
        entry_date=entry_data.date
    )
    
    # Preparar motor_metadata con subtipo si se proporciona
    motor_metadata = None
    if entry_subtype:
        motor_metadata = {
            "entry_subtype": entry_subtype,
            "created_from_base_check": True
        }
    
    # Crear asiento en estado DRAFT
    entry = JournalEntry(
        company_id=entry_data.company_id,
        date=entry_data.date,
        period_id=period.id,
        glosa=entry_data.glosa,
        currency=entry_data.currency,
        exchange_rate=entry_data.exchange_rate,
        origin=origin,
        status="DRAFT",  # Estado inicial
        correlative=correlative,
        created_by=user_id,
        created_at=datetime.now(),
        motor_metadata=motor_metadata
    )
    
    # Crear líneas
    built_lines = []
    for line_data in entry_data.lines:
        account = uow.accounts.by_code(entry_data.company_id, line_data.account_code)
        if not account:
            raise JournalManualError(f"Cuenta no existe: {line_data.account_code}")
        
        built_lines.append(EntryLine(
            account_id=account.id,
            debit=Decimal(str(line_data.debit)).quantize(Decimal('0.01')),
            credit=Decimal(str(line_data.credit)).quantize(Decimal('0.01')),
            memo=line_data.memo,
            third_party_id=line_data.third_party_id,
            cost_center=line_data.cost_center
        ))
    
    # Validar cuadre
    total_debit = sum(l.debit for l in built_lines)
    total_credit = sum(l.credit for l in built_lines)
    if total_debit != total_credit:
        raise JournalManualError(f"Asiento no cuadra: Debe={total_debit} ≠ Haber={total_credit}")
    
    entry.lines = built_lines
    uow.journal.add_entry(entry)
    uow.db.flush()
    
    # Calcular hash de integridad
    update_integrity_hash(entry)
    uow.db.flush()

    log_audit(
        uow.db,
        module=MODULE_ASIENTOS,
        action=ACTION_CREATE,
        entity_type="JournalEntry",
        entity_id=entry.id,
        summary=f"Asiento DRAFT creado: {entry.glosa[:80] if entry.glosa else ''}",
        metadata_={"correlative": entry.correlative, "origin": entry.origin},
        user_id=user_id,
        user_role=None,
        company_id=entry_data.company_id,
    )

    return entry, {
        "warnings": [{"code": w.code, "message": w.message} for w in validation_result.warnings],
        "requires_confirmation": any(w.requires_confirmation for w in validation_result.warnings)
    }


def post_draft_entry(
    uow: UnitOfWork,
    entry_id: int,
    user_id: int,
    confirmed_warnings: Optional[List[str]] = None
) -> JournalEntry:
    """
    Postea un asiento DRAFT (lo convierte a POSTED).
    
    Args:
        uow: UnitOfWork
        entry_id: ID del asiento DRAFT
        user_id: ID del usuario que postea
        confirmed_warnings: Lista de códigos de advertencias confirmadas
        
    Returns:
        JournalEntry posteado
    """
    entry = uow.db.query(JournalEntry).filter(JournalEntry.id == entry_id).first()
    if not entry:
        raise JournalManualError(f"Asiento no encontrado: {entry_id}")
    
    if entry.status != "DRAFT":
        raise JournalManualError(f"El asiento #{entry_id} no está en estado DRAFT. Estado actual: {entry.status}")
    
    # Validar período
    period = uow.db.query(Period).filter(Period.id == entry.period_id).first()
    if not period:
        raise JournalManualError("Período no encontrado")
    
    # Validar permisos
    user = uow.db.query(User).filter(User.id == user_id).first()
    if not user:
        raise JournalManualError("Usuario no encontrado")
    
    role_str = str(user.role.value) if hasattr(user.role, 'value') else str(user.role)
    if not can_modify_entry_in_period(uow.db, entry.period_id, role_str):
        if period.status == "CERRADO":
            raise JournalManualError(f"El período {period.year}-{period.month:02d} está cerrado")
        else:
            raise JournalManualError("No autorizado para postear asientos en este período")
    
    # Re-validar antes de postear
    lines_data = []
    for line in entry.lines:
        account = uow.db.query(Account).filter(Account.id == line.account_id).first()
        if account:
            lines_data.append(EntryLineIn(
                account_code=account.code,
                debit=float(line.debit),
                credit=float(line.credit),
                memo=line.memo,
                third_party_id=line.third_party_id,
                cost_center=line.cost_center
            ))
    
    entry_in_data = JournalEntryIn(
        company_id=entry.company_id,
        date=entry.date,
        glosa=entry.glosa,
        currency=entry.currency,
        exchange_rate=float(entry.exchange_rate),
        origin=entry.origin,
        lines=lines_data
    )
    
    validation_result = validate_journal_entry(
        db=uow.db,
        company_id=entry.company_id,
        entry_data=entry_in_data,
        lines=lines_data,
        existing_entry=entry,
        user_id=user_id
    )
    
    # Si hay errores, no permitir postear
    if validation_result.errors:
        error_messages = [err["message"] for err in validation_result.errors]
        raise JournalManualError(f"Errores de validación: {'; '.join(error_messages)}")
    
    # Verificar confirmación de advertencias
    if validation_result.warnings:
        unconfirmed = [
            w for w in validation_result.warnings
            if w.requires_confirmation and w.code not in (confirmed_warnings or [])
        ]
        if unconfirmed:
            unconfirmed_messages = [w.message for w in unconfirmed]
            raise JournalManualError(
                f"Debe confirmar las siguientes advertencias antes de postear: "
                f"{'; '.join(unconfirmed_messages)}"
            )
        
        # Guardar confirmaciones
        entry.warning_confirmations = {
            "confirmed_at": datetime.now().isoformat(),
            "confirmed_by": user_id,
            "confirmed_warnings": confirmed_warnings or []
        }
        flag_modified(entry, "warning_confirmations")
    
    # Postear el asiento
    entry.status = "POSTED"
    entry.posted_by = user_id
    entry.posted_at = datetime.now()
    entry.updated_by = user_id
    entry.updated_at = datetime.now()
    
    # Actualizar hash de integridad
    update_integrity_hash(entry)
    uow.db.flush()

    log_audit(
        uow.db,
        module=MODULE_ASIENTOS,
        action=ACTION_POST,
        entity_type="JournalEntry",
        entity_id=entry.id,
        summary=f"Asiento posteado: #{entry.id} {entry.glosa[:60] if entry.glosa else ''}",
        metadata_={"correlative": entry.correlative, "origin": entry.origin},
        user_id=user_id,
        user_role=role_str,
        company_id=entry.company_id,
    )

    return entry


def reverse_entry(
    uow: UnitOfWork,
    entry_id: int,
    user_id: int,
    reversal_date: Optional[datetime] = None,
    reversal_glosa: Optional[str] = None
) -> JournalEntry:
    """
    Revierte un asiento POSTED creando un nuevo asiento REVERSED.
    
    Args:
        uow: UnitOfWork
        entry_id: ID del asiento a revertir
        user_id: ID del usuario que revierte
        reversal_date: Fecha de reversión (default: hoy)
        reversal_glosa: Glosa para el asiento de reversión
        
    Returns:
        JournalEntry revertido (nuevo asiento)
    """
    original_entry = uow.db.query(JournalEntry).filter(JournalEntry.id == entry_id).first()
    if not original_entry:
        raise JournalManualError(f"Asiento no encontrado: {entry_id}")
    
    if original_entry.status != "POSTED":
        raise JournalManualError(f"El asiento #{entry_id} no está POSTED. Solo se pueden revertir asientos POSTED.")
    
    if original_entry.reversed_entry_id:
        raise JournalManualError(f"El asiento #{entry_id} ya fue revertido por el asiento #{original_entry.reversed_entry_id}")
    
    # Validar período
    period = uow.db.query(Period).filter(Period.id == original_entry.period_id).first()
    if not period:
        raise JournalManualError("Período no encontrado")
    
    # Validar permisos
    user = uow.db.query(User).filter(User.id == user_id).first()
    if not user:
        raise JournalManualError("Usuario no encontrado")
    
    role_str = str(user.role.value) if hasattr(user.role, 'value') else str(user.role)
    if not can_modify_entry_in_period(uow.db, original_entry.period_id, role_str):
        if period.status == "CERRADO":
            raise JournalManualError(f"El período {period.year}-{period.month:02d} está cerrado")
        else:
            raise JournalManualError("No autorizado para revertir asientos en este período")
    
    # Usar fecha de reversión o fecha del asiento original
    reversal_date = reversal_date or datetime.now().date()
    
    # Crear asiento de reversión (invertir debe/haber)
    reversal_lines = []
    for line in original_entry.lines:
        account = uow.db.query(Account).filter(Account.id == line.account_id).first()
        reversal_lines.append(EntryLineIn(
            account_code=account.code,
            debit=float(line.credit),  # Invertir
            credit=float(line.debit),  # Invertir
            memo=line.memo,
            third_party_id=line.third_party_id,
            cost_center=line.cost_center
        ))
    
    # Generar glosa de reversión
    glosa_reversal = reversal_glosa or f"REVERSIÓN de asiento #{original_entry.id}: {original_entry.glosa}"
    
    # Crear asiento de reversión
    reversal_entry_data = JournalEntryIn(
        company_id=original_entry.company_id,
        date=reversal_date,
        glosa=glosa_reversal,
        currency=original_entry.currency,
        exchange_rate=float(original_entry.exchange_rate),
        origin=original_entry.origin,
        lines=reversal_lines
    )
    
    # Crear asiento de reversión (directamente POSTED, no DRAFT)
    # El asiento de reversión tiene ORIGIN = MANUAL y SUBTYPE = REVERSAL
    reversal_entry = JournalEntry(
        company_id=original_entry.company_id,
        date=reversal_date,
        period_id=original_entry.period_id,
        glosa=glosa_reversal,
        currency=original_entry.currency,
        exchange_rate=original_entry.exchange_rate,
        origin="MANUAL",  # Siempre MANUAL para reversiones
        status="REVERSED",
        created_by=user_id,
        created_at=datetime.now(),
        posted_by=user_id,
        posted_at=datetime.now(),
        reversed_entry_id=original_entry.id,
        reversed_by=user_id,
        reversed_at=datetime.now(),
        motor_metadata={
            "entry_subtype": "REVERSAL",
            "reversed_entry_id": original_entry.id,
            "reversal_reason": reversal_glosa or "Reversión de asiento"
        }
    )
    
    # Crear líneas invertidas
    built_lines = []
    for line_data in reversal_lines:
        account = uow.accounts.by_code(original_entry.company_id, line_data.account_code)
        built_lines.append(EntryLine(
            account_id=account.id,
            debit=Decimal(str(line_data.debit)).quantize(Decimal('0.01')),
            credit=Decimal(str(line_data.credit)).quantize(Decimal('0.01')),
            memo=line_data.memo,
            third_party_id=line_data.third_party_id,
            cost_center=line_data.cost_center
        ))
    
    reversal_entry.lines = built_lines
    uow.journal.add_entry(reversal_entry)
    uow.db.flush()
    
    # Actualizar asiento original: cambiar status a REVERSED
    original_entry.status = "REVERSED"
    original_entry.reversed_entry_id = reversal_entry.id
    original_entry.reversed_by = user_id
    original_entry.reversed_at = datetime.now()
    original_entry.updated_by = user_id
    original_entry.updated_at = datetime.now()
    
    # Actualizar motor_metadata del original para trazabilidad
    if not original_entry.motor_metadata:
        original_entry.motor_metadata = {}
    original_entry.motor_metadata["reversed_by_entry_id"] = reversal_entry.id
    original_entry.motor_metadata["reversed_at"] = datetime.now().isoformat()
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(original_entry, "motor_metadata")
    
    uow.db.flush()
    
    # Calcular hash de integridad
    update_integrity_hash(reversal_entry)
    update_integrity_hash(original_entry)
    uow.db.flush()

    log_audit(
        uow.db,
        module=MODULE_ASIENTOS,
        action=ACTION_REVERSE,
        entity_type="JournalEntry",
        entity_id=original_entry.id,
        summary=f"Reversión asiento #{original_entry.id} → #{reversal_entry.id}",
        metadata_={"original_id": original_entry.id, "reversal_id": reversal_entry.id},
        user_id=user_id,
        user_role=role_str,
        company_id=original_entry.company_id,
    )

    return reversal_entry


def create_adjustment_entry(
    uow: UnitOfWork,
    entry_id: int,
    user_id: int,
    adjustment_date: Optional[date] = None,
    adjustment_glosa: Optional[str] = None
) -> JournalEntry:
    """
    Crea un asiento de ajuste (DRAFT) referenciando un asiento POSTED.
    
    El sistema NO calcula diferencias automáticamente.
    El usuario debe definir cuentas y montos manualmente.
    
    Args:
        uow: UnitOfWork
        entry_id: ID del asiento POSTED a ajustar
        user_id: ID del usuario que crea el ajuste
        adjustment_date: Fecha del ajuste (default: hoy)
        adjustment_glosa: Glosa sugerida para el ajuste
        
    Returns:
        JournalEntry en estado DRAFT (ajuste)
    """
    original_entry = uow.db.query(JournalEntry).filter(JournalEntry.id == entry_id).first()
    if not original_entry:
        raise JournalManualError(f"Asiento no encontrado: {entry_id}")
    
    if original_entry.status != "POSTED":
        raise JournalManualError(
            f"El asiento #{entry_id} no está POSTED. Solo se pueden crear ajustes para asientos POSTED."
        )
    
    # Validar período
    period = uow.db.query(Period).filter(Period.id == original_entry.period_id).first()
    if not period:
        raise JournalManualError("Período no encontrado")
    
    # Validar permisos
    user = uow.db.query(User).filter(User.id == user_id).first()
    if not user:
        raise JournalManualError("Usuario no encontrado")
    
    role_str = str(user.role.value) if hasattr(user.role, 'value') else str(user.role)
    if not can_modify_entry_in_period(uow.db, original_entry.period_id, role_str):
        if period.status == "CERRADO":
            raise JournalManualError(f"El período {period.year}-{period.month:02d} está cerrado")
        else:
            raise JournalManualError("No autorizado para crear ajustes en este período")
    
    # Usar fecha de ajuste o fecha actual
    adjustment_date = adjustment_date or date.today()
    
    # Generar glosa de ajuste
    glosa_adjustment = adjustment_glosa or f"Ajuste de asiento #{original_entry.id}: {original_entry.glosa}"
    
    # Crear asiento de ajuste en estado DRAFT
    # El usuario debe completar las líneas manualmente
    adjustment_entry = JournalEntry(
        company_id=original_entry.company_id,
        date=adjustment_date,
        period_id=original_entry.period_id,
        glosa=glosa_adjustment,
        currency=original_entry.currency,
        exchange_rate=original_entry.exchange_rate,
        origin="MANUAL",
        status="DRAFT",
        created_by=user_id,
        created_at=datetime.now(),
        motor_metadata={
            "entry_subtype": "ADJUSTMENT",
            "adjusted_entry_id": original_entry.id,
            "adjustment_reason": adjustment_glosa or "Ajuste de asiento"
        }
    )
    
    # El asiento de ajuste se crea sin líneas
    # El usuario debe agregar las líneas manualmente
    uow.journal.add_entry(adjustment_entry)
    uow.db.flush()
    
    # Calcular hash de integridad
    update_integrity_hash(adjustment_entry)
    uow.db.flush()
    
    return adjustment_entry

