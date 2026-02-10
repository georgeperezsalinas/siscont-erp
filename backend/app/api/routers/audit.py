"""
API de Auditoría Global - Solo lectura
======================================
Vistas para Admin SISCONT y Auditor interno.
Prohibido: edición, eliminación.
"""
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc

from ...dependencies import get_db
from ...security.auth import get_current_user
from ...domain.models import User
from ...domain.models_audit import AuditLog

router = APIRouter(prefix="/audit", tags=["audit"])


def _client_ip(request: Request) -> Optional[str]:
    return (
        request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        or request.headers.get("X-Real-IP")
        or (request.client.host if request.client else None)
    )


def _user_agent(request: Request) -> Optional[str]:
    return request.headers.get("User-Agent")


@router.get("/log", summary="Listar auditoría (solo lectura)")
def list_audit_log(
    company_id: Optional[int] = Query(None, description="Filtrar por empresa"),
    user_id: Optional[int] = Query(None, description="Filtrar por usuario"),
    module: Optional[str] = Query(None, description="Filtrar por módulo (ASIENTOS, COMPRAS, VENTAS, etc.)"),
    action: Optional[str] = Query(None, description="Filtrar por acción (CREATE, UPDATE, POST, etc.)"),
    since: Optional[datetime] = Query(None, description="Desde fecha"),
    until: Optional[datetime] = Query(None, description="Hasta fecha"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Consulta el log de auditoría. Solo admin/auditor.
    """
    if not current_user.is_admin and getattr(current_user, "role", None) != "ADMINISTRADOR":
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Solo admin puede consultar auditoría")

    q = db.query(AuditLog)
    if company_id is not None:
        q = q.filter(AuditLog.company_id == company_id)
    if user_id is not None:
        q = q.filter(AuditLog.user_id == user_id)
    if module:
        q = q.filter(AuditLog.module == module)
    if action:
        q = q.filter(AuditLog.action == action)
    if since:
        q = q.filter(AuditLog.timestamp >= since)
    if until:
        q = q.filter(AuditLog.timestamp <= until)

    total = q.count()
    items = q.order_by(desc(AuditLog.timestamp)).offset(offset).limit(limit).all()

    return {
        "total": total,
        "items": [
            {
                "id": r.id,
                "timestamp": r.timestamp.isoformat() if r.timestamp else None,
                "user_id": r.user_id,
                "user_role": r.user_role,
                "company_id": r.company_id,
                "module": r.module,
                "action": r.action,
                "entity_type": r.entity_type,
                "entity_id": r.entity_id,
                "summary": r.summary,
                "metadata": r.metadata_,
                "ip_address": r.ip_address,
                "user_agent": r.user_agent,
            }
            for r in items
        ],
    }


@router.get("/log/export.csv", summary="Exportar auditoría a CSV")
def export_audit_csv(
    company_id: Optional[int] = Query(None),
    user_id: Optional[int] = Query(None),
    module: Optional[str] = Query(None),
    since: Optional[datetime] = Query(None),
    until: Optional[datetime] = Query(None),
    limit: int = Query(10000, ge=1, le=100000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Exporta auditoría a CSV (solo lectura)."""
    if not current_user.is_admin and getattr(current_user, "role", None) != "ADMINISTRADOR":
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Solo admin puede exportar auditoría")

    q = db.query(AuditLog)
    if company_id is not None:
        q = q.filter(AuditLog.company_id == company_id)
    if user_id is not None:
        q = q.filter(AuditLog.user_id == user_id)
    if module:
        q = q.filter(AuditLog.module == module)
    if since:
        q = q.filter(AuditLog.timestamp >= since)
    if until:
        q = q.filter(AuditLog.timestamp <= until)

    items = q.order_by(desc(AuditLog.timestamp)).limit(limit).all()

    def gen():
        import csv
        import io
        out = io.StringIO()
        w = csv.writer(out)
        w.writerow(["id", "timestamp", "user_id", "user_role", "company_id", "module", "action", "entity_type", "entity_id", "summary", "ip_address"])
        for r in items:
            w.writerow([
                r.id,
                r.timestamp.isoformat() if r.timestamp else "",
                r.user_id or "",
                r.user_role or "",
                r.company_id or "",
                r.module or "",
                r.action or "",
                r.entity_type or "",
                r.entity_id or "",
                (r.summary or "")[:200],
                r.ip_address or "",
            ])
        yield out.getvalue()

    return StreamingResponse(
        gen(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit_log.csv"},
    )
