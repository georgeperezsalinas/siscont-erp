"""
Servicios para el cierre de períodos contables
Sigue la metodología de "ensamblaje de carro" - componente independiente
"""
from sqlalchemy.orm import Session
from typing import Dict, List, Optional
from datetime import datetime
from ..domain.models import Period, JournalEntry, EntryLine, Account
from ..infrastructure.logging_config import get_logger

logger = get_logger("cierre_periodo")

class PeriodValidationError(Exception):
    """Excepción para errores de validación de período"""
    pass

def validate_period_before_close(
    db: Session,
    period_id: int,
    user_id: int
) -> Dict:
    """
    Valida un período antes de cerrarlo.
    Retorna un diccionario con el resultado de las validaciones.
    
    Validaciones:
    1. Balance Cuadrado: Total Debe = Total Haber en todos los asientos
    2. Asientos Pendientes: No debe haber asientos en borrador o pendientes
    3. Integridad de Datos: Todas las cuentas referenciadas existen
    4. Consistencia de Fechas: Las fechas de los asientos están dentro del período
    """
    logger.info(f"Validando período {period_id} antes de cerrar")
    
    # Obtener el período
    period = db.query(Period).filter(Period.id == period_id).first()
    if not period:
        raise PeriodValidationError(f"Período {period_id} no encontrado")
    
    # Verificar que el período no esté ya cerrado
    if period.status == "CERRADO":
        raise PeriodValidationError(f"El período {period.year}-{period.month:02d} ya está cerrado")
    
    validation_results = {
        "period_id": period_id,
        "period": f"{period.year}-{period.month:02d}",
        "valid": True,
        "errors": [],
        "warnings": [],
        "entry_count": 0,
        "unbalanced_entries": [],
        "pending_entries": [],
        "invalid_accounts": [],
        "entries_out_of_period": []
    }
    
    # Obtener todos los asientos del período
    entries = db.query(JournalEntry).filter(
        JournalEntry.period_id == period_id
    ).all()
    
    validation_results["entry_count"] = len(entries)
    
    if len(entries) == 0:
        validation_results["warnings"].append("No hay asientos contables en este período")
        return validation_results
    
    # 1. Validar Balance Cuadrado
    logger.info(f"Validando balance cuadrado para {len(entries)} asientos")
    for entry in entries:
        if not entry.lines:
            validation_results["errors"].append(f"Asiento {entry.id} no tiene líneas")
            validation_results["valid"] = False
            continue
        
        total_debit = sum(float(line.debit) if line.debit else 0.0 for line in entry.lines)
        total_credit = sum(float(line.credit) if line.credit else 0.0 for line in entry.lines)
        
        # Tolerancia de 0.01 para diferencias de redondeo
        if abs(total_debit - total_credit) > 0.01:
            validation_results["unbalanced_entries"].append({
                "entry_id": entry.id,
                "date": entry.date.isoformat() if entry.date else None,
                "glosa": entry.glosa,
                "debit": total_debit,
                "credit": total_credit,
                "difference": abs(total_debit - total_credit)
            })
            validation_results["valid"] = False
    
    if validation_results["unbalanced_entries"]:
        validation_results["errors"].append(
            f"{len(validation_results['unbalanced_entries'])} asientos no cuadran (partida doble)"
        )
    
    # 2. Validar Asientos Pendientes
    logger.info("Validando asientos pendientes")
    for entry in entries:
        if entry.status not in ["POSTED", "VOIDED"]:
            validation_results["pending_entries"].append({
                "entry_id": entry.id,
                "date": entry.date.isoformat() if entry.date else None,
                "status": entry.status,
                "glosa": entry.glosa
            })
            validation_results["valid"] = False
    
    if validation_results["pending_entries"]:
        validation_results["errors"].append(
            f"{len(validation_results['pending_entries'])} asientos en estado pendiente o borrador"
        )
    
    # 3. Validar Integridad de Datos (cuentas existen)
    logger.info("Validando integridad de datos")
    account_ids = set()
    for entry in entries:
        if entry.lines:
            for line in entry.lines:
                if line.account_id:
                    account_ids.add(line.account_id)
    
    if account_ids:
        existing_accounts = db.query(Account.id).filter(
            Account.id.in_(list(account_ids))
        ).all()
        existing_account_ids = {acc[0] for acc in existing_accounts}
        missing_account_ids = account_ids - existing_account_ids
        
        if missing_account_ids:
            validation_results["invalid_accounts"] = list(missing_account_ids)
            validation_results["errors"].append(
                f"{len(missing_account_ids)} cuentas referenciadas no existen en el plan contable"
            )
            validation_results["valid"] = False
    
    # 4. Validar Consistencia de Fechas
    logger.info("Validando consistencia de fechas")
    period_start = datetime(period.year, period.month, 1)
    if period.month == 12:
        period_end = datetime(period.year + 1, 1, 1)
    else:
        period_end = datetime(period.year, period.month + 1, 1)
    
    for entry in entries:
        if entry.date:
            entry_date = datetime.combine(entry.date, datetime.min.time())
            if entry_date < period_start or entry_date >= period_end:
                validation_results["entries_out_of_period"].append({
                    "entry_id": entry.id,
                    "date": entry.date.isoformat(),
                    "glosa": entry.glosa
                })
                validation_results["warnings"].append(
                    f"Asiento {entry.id} tiene fecha {entry.date} fuera del período {period.year}-{period.month:02d}"
                )
    
    logger.info(f"Validación completada - Válido: {validation_results['valid']}, Errores: {len(validation_results['errors'])}")
    
    return validation_results

def close_period(
    db: Session,
    period_id: int,
    user_id: int,
    reason: Optional[str] = None
) -> Period:
    """
    Cierra un período contable.
    
    Requisitos:
    - El período debe pasar todas las validaciones
    - Solo ADMINISTRADOR o CONTADOR pueden cerrar períodos
    """
    logger.info(f"Cerrando período {period_id} por usuario {user_id}")
    
    # Validar antes de cerrar
    validation = validate_period_before_close(db, period_id, user_id)
    
    if not validation["valid"]:
        errors_msg = "; ".join(validation["errors"])
        raise PeriodValidationError(f"No se puede cerrar el período. Errores: {errors_msg}")
    
    # Obtener el período
    period = db.query(Period).filter(Period.id == period_id).first()
    if not period:
        raise PeriodValidationError(f"Período {period_id} no encontrado")
    
    if period.status == "CERRADO":
        raise PeriodValidationError(f"El período {period.year}-{period.month:02d} ya está cerrado")
    
    # Actualizar el período
    period.status = "CERRADO"
    period.closed_at = datetime.now()
    period.closed_by = user_id
    period.close_reason = reason
    
    db.commit()
    db.refresh(period)
    
    logger.info(f"Período {period.year}-{period.month:02d} cerrado exitosamente")
    
    return period

def reopen_period(
    db: Session,
    period_id: int,
    user_id: int,
    reason: Optional[str] = None
) -> Period:
    """
    Reabre un período cerrado.
    
    Requisitos:
    - Solo ADMINISTRADOR puede reabrir períodos
    - El período debe estar CERRADO
    """
    logger.info(f"Reabriendo período {period_id} por usuario {user_id}")
    
    # Obtener el período
    period = db.query(Period).filter(Period.id == period_id).first()
    if not period:
        raise PeriodValidationError(f"Período {period_id} no encontrado")
    
    if period.status != "CERRADO":
        raise PeriodValidationError(f"El período {period.year}-{period.month:02d} no está cerrado. Estado actual: {period.status}")
    
    # Actualizar el período
    period.status = "REABIERTO"
    period.reopened_at = datetime.now()
    period.reopened_by = user_id
    period.reopen_reason = reason
    
    db.commit()
    db.refresh(period)
    
    logger.info(f"Período {period.year}-{period.month:02d} reabierto exitosamente")
    
    return period

def can_modify_entry_in_period(
    db: Session,
    period_id: int,
    user_role: str
) -> bool:
    """
    Verifica si se pueden modificar asientos en un período.
    
    Reglas:
    - Si el período está ABIERTO o REABIERTO: se puede modificar
    - Si el período está CERRADO: solo ADMINISTRADOR puede modificar (pero debe reabrir primero)
    """
    period = db.query(Period).filter(Period.id == period_id).first()
    if not period:
        return False
    
    if period.status == "CERRADO":
        # Solo ADMINISTRADOR puede trabajar con períodos cerrados (pero debe reabrir primero)
        # user_role puede ser un enum UserRole o un string
        role_str = str(user_role).upper() if hasattr(user_role, 'value') else str(user_role).upper()
        return role_str == "ADMINISTRADOR"
    
    # ABIERTO o REABIERTO: todos pueden modificar (según sus permisos normales)
    return True

