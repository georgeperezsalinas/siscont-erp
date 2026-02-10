"""
Endpoints para verificaciones contables base.

Expone endpoints para detectar asientos contables críticos faltantes
y proporcionar links/wizards para crearlos.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from ...dependencies import get_db
from ...infrastructure.unit_of_work import UnitOfWork
from ...security.auth import get_current_user
from ...application.services_base_accounting_checks import (
    BaseAccountingChecksService,
    BaseEntryCheck
)

router = APIRouter(prefix="/accounting", tags=["accounting"])


@router.get("/base-checks")
def get_base_checks(
    company_id: int = Query(..., description="ID de la empresa"),
    period_id: Optional[int] = Query(None, description="ID del período (opcional)"),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Detecta asientos contables base faltantes.
    
    Retorna una lista de notificaciones con:
    - Código de la verificación
    - Mensaje
    - Severidad (INFO, WARNING, ERROR)
    - Link/acción para crear el asiento faltante
    - Plantilla sugerida (cuentas, glosa)
    
    Este endpoint NO crea asientos automáticamente, solo detecta ausencias.
    """
    uow = UnitOfWork(db)
    try:
        service = BaseAccountingChecksService(uow)
        checks = service.check_base_entries(
            company_id=company_id,
            period_id=period_id
        )
        
        # Convertir a diccionarios para la respuesta
        return [check.to_dict() for check in checks]
    
    except Exception as e:
        logger.error(f"Error en base-checks: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error al verificar asientos base: {str(e)}")
    finally:
        uow.close()


@router.get("/base-checks/summary")
def get_base_checks_summary(
    company_id: int = Query(..., description="ID de la empresa"),
    period_id: Optional[int] = Query(None, description="ID del período (opcional)"),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Obtiene un resumen de las verificaciones de asientos base.
    
    Retorna estadísticas:
    - Total de checks
    - Por severidad (INFO, WARNING, ERROR)
    - Por tipo de asiento
    """
    uow = UnitOfWork(db)
    try:
        service = BaseAccountingChecksService(uow)
        checks = service.check_base_entries(
            company_id=company_id,
            period_id=period_id
        )
        
        summary = {
            "total": len(checks),
            "by_severity": {
                "INFO": len([c for c in checks if c.severity.value == "INFO"]),
                "WARNING": len([c for c in checks if c.severity.value == "WARNING"]),
                "ERROR": len([c for c in checks if c.severity.value == "ERROR"])
            },
            "by_type": {}
        }
        
        for check in checks:
            entry_type = check.entry_type.value
            if entry_type not in summary["by_type"]:
                summary["by_type"][entry_type] = 0
            summary["by_type"][entry_type] += 1
        
        return summary
    
    except Exception as e:
        logger.error(f"Error en base-checks-summary: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error al obtener resumen: {str(e)}")
    finally:
        uow.close()


# Importar logger
from ...infrastructure.logging_config import get_logger
logger = get_logger("accounting")

