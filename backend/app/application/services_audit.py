"""
Auditoría Global de Acciones - SISCONT
=====================================
Registro inmutable de todas las acciones relevantes.
Nivel ERP: SAP / Oracle / SUNAT.
- Try-safe: no bloquea transacciones si falla auditoría
- Solo INSERT, prohibido UPDATE/DELETE
- Usa sesión separada para no afectar la transacción principal
"""
from typing import Any, Dict, Optional
from sqlalchemy.orm import Session

from ..domain.models_audit import AuditLog
from ..db import SessionLocal

# Módulos estándar
MODULE_ASIENTOS = "ASIENTOS"
MODULE_COMPRAS = "COMPRAS"
MODULE_VENTAS = "VENTAS"
MODULE_TESORERIA = "TESORERIA"
MODULE_CASILLA = "CASILLA"
MODULE_CONFIG = "CONFIG"
MODULE_AUTH = "AUTH"

# Acciones estándar
ACTION_CREATE = "CREATE"
ACTION_UPDATE = "UPDATE"
ACTION_POST = "POST"
ACTION_REVERSE = "REVERSE"
ACTION_READ = "READ"
ACTION_DOWNLOAD = "DOWNLOAD"
ACTION_LOGIN = "LOGIN"
ACTION_LOGOUT = "LOGOUT"
ACTION_DELETE = "DELETE"
ACTION_ANULATE = "ANULATE"
ACTION_CHANGE_PASSWORD = "CHANGE_PASSWORD"
ACTION_CHANGE_ROLE = "CHANGE_ROLE"
ACTION_ASSIGN_COMPANY = "ASSIGN_COMPANY"


def log_audit(
    db: Session,
    module: str,
    action: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
    summary: Optional[str] = None,
    metadata_: Optional[Dict[str, Any]] = None,
    user_id: Optional[int] = None,
    user_role: Optional[str] = None,
    company_id: Optional[int] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> None:
    """
    Registra un evento de auditoría. Inmutable.
    Try-safe: sesión separada, no afecta la transacción principal.
    """
    audit_db = None
    try:
        audit_db = SessionLocal()
        log = AuditLog(
            module=module,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            summary=summary,
            metadata_=metadata_,
            user_id=user_id,
            user_role=user_role,
            company_id=company_id,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        audit_db.add(log)
        audit_db.commit()
    except Exception:
        if audit_db:
            audit_db.rollback()
        # No fallar la operación principal
    finally:
        if audit_db:
            audit_db.close()
