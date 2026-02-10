"""
API Empresa - Dashboard y rutas para usuarios de empresa
========================================================
"""
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from ...dependencies import get_db
from ...security.auth import get_current_user
from ...domain.models import User
from ...application.services_empresa import get_empresa_dashboard

router = APIRouter(prefix="/empresa", tags=["empresa"])


@router.get("/dashboard")
async def empresa_dashboard(
    company_id: int = Query(..., description="ID de la empresa"),
    period: Optional[str] = Query(None, description="Período YYYY-MM (ej: 2026-02)"),
    period_id: Optional[int] = Query(None, description="ID del período"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Dashboard para usuarios de empresa.

    Retorna:
    - Resumen financiero (caja/bancos, IGV por pagar, CxC, CxP, compras, ventas)
    - Estado de casilla (mensajes no leídos, pendientes de respuesta)
    - Accesos rápidos
    """
    try:
        return get_empresa_dashboard(
            db=db,
            user=current_user,
            company_id=company_id,
            period=period,
            period_id=period_id,
        )
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
