"""
API de SIRE (Sistema Integrado de Registros Electrónicos)
==========================================================

Endpoints para gestión de propuestas SIRE desde SUNAT.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from typing import Optional, List, Dict, Any
from datetime import date, datetime
from pydantic import BaseModel

from ...dependencies import get_db
from ...security.auth import get_current_user
from ...domain.models import User
from ...domain.models_sire import SireProposalType, SireProposalStatus
from ...infrastructure.unit_of_work import UnitOfWork
from ...application.services_sire import (
    get_sire_configuration,
    create_or_update_sire_configuration,
    sync_sire_proposals,
    accept_sire_proposal,
    complement_sire_proposal,
    replace_sire_proposal
)
from ...infrastructure.sire_client import SIREClient

router = APIRouter(prefix="/sire", tags=["sire"])

# ===== MODELOS PYDANTIC =====

class SireConfigurationIn(BaseModel):
    # Credenciales del generador (requeridas según manual SUNAT)
    ruc: Optional[str] = None
    usuario_generador: Optional[str] = None
    password_generador: Optional[str] = None
    
    # Credenciales OAuth (opcionales para actualizaciones, requeridos para nuevas configuraciones)
    oauth_client_id: Optional[str] = None
    oauth_client_secret: Optional[str] = None
    
    # Configuración
    auto_sync_enabled: bool = False
    sync_frequency_hours: int = 24
    email_notifications: bool = True
    notification_emails: Optional[str] = None
    use_test_env: bool = True  # True = usar Preliminares (modo seguro), False = operaciones definitivas. NOTA: SIRE no tiene ambiente de pruebas separado.

class SireConfigurationOut(BaseModel):
    id: int
    company_id: int
    # Credenciales del generador (password no se incluye por seguridad)
    ruc: Optional[str] = None
    usuario_generador: Optional[str] = None
    auto_sync_enabled: bool
    sync_frequency_hours: int
    email_notifications: bool
    notification_emails: Optional[str] = None
    use_test_env: bool = True  # True = usar Preliminares (modo seguro), False = operaciones definitivas. NOTA: SIRE no tiene ambiente de pruebas separado.
    last_sync_date: Optional[datetime] = None

class SireProposalOut(BaseModel):
    id: int
    sunat_proposal_id: str
    sunat_correlative: Optional[str] = None
    proposal_date: date
    status: str
    proposal_data: Dict[str, Any]
    response_data: Optional[Dict[str, Any]] = None
    response_date: Optional[datetime] = None
    sale_id: Optional[int] = None
    purchase_id: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

class SireSyncRequest(BaseModel):
    proposal_type: str  # "RVIE" o "RCE"
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    periods: Optional[List[str]] = None  # Lista de períodos tributarios a sincronizar (ej: ["202401", "202402"])

class SireSyncResponse(BaseModel):
    success: bool
    records_processed: int
    records_success: int
    records_failed: int
    errors: List[Dict[str, Any]] = []

class SireProposalActionRequest(BaseModel):
    additional_data: Optional[Dict[str, Any]] = None
    replacement_data: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None

# ===== CONFIGURACIÓN =====

@router.post("/configuration", response_model=SireConfigurationOut)
def create_sire_configuration(
    payload: SireConfigurationIn,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Crea o actualiza la configuración SIRE de una empresa
    """
    # Verificar autorización
    if company_id not in [c.id for c in current_user.companies]:
        raise HTTPException(status_code=403, detail="No autorizado para esta empresa")
    
    uow = UnitOfWork()
    uow.db = db  # Usar la sesión del endpoint
    try:
        # Validar que OAuth credentials estén presentes si es nueva configuración
        existing_config = get_sire_configuration(uow, company_id)
        if not existing_config:
            # Nueva configuración: OAuth es requerido
            if not payload.oauth_client_id or not payload.oauth_client_secret:
                raise HTTPException(
                    status_code=400,
                    detail="Client ID y Client Secret OAuth son requeridos para nueva configuración"
                )
        
        config = create_or_update_sire_configuration(
            uow,
            company_id=company_id,
            oauth_client_id=payload.oauth_client_id or (existing_config.oauth_client_id if existing_config else ""),
            oauth_client_secret=payload.oauth_client_secret or (existing_config.oauth_client_secret if existing_config else ""),
            ruc=payload.ruc,
            usuario_generador=payload.usuario_generador,
            password_generador=payload.password_generador,
            auto_sync_enabled=payload.auto_sync_enabled,
            sync_frequency_hours=payload.sync_frequency_hours,
            email_notifications=payload.email_notifications,
            notification_emails=payload.notification_emails,
            use_preliminary_mode=payload.use_test_env,  # use_test_env del payload se mapea a use_preliminary_mode
            created_by=current_user.id
        )
        uow.commit()
        
        return SireConfigurationOut(
            id=config.id,
            company_id=config.company_id,
            ruc=config.ruc,
            usuario_generador=config.usuario_generador,
            auto_sync_enabled=config.auto_sync_enabled,
            sync_frequency_hours=config.sync_frequency_hours,
            email_notifications=config.email_notifications,
            notification_emails=config.notification_emails,
            use_test_env=config.use_test_env,
            last_sync_date=config.last_sync_date
        )
    except ValueError as e:
        uow.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        uow.close()

@router.get("/configuration", response_model=SireConfigurationOut)
def get_sire_configuration_endpoint(
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtiene la configuración SIRE de una empresa"""
    # Verificar autorización
    if company_id not in [c.id for c in current_user.companies]:
        raise HTTPException(status_code=403, detail="No autorizado para esta empresa")
    
    uow = UnitOfWork()
    uow.db = db
    try:
        config = get_sire_configuration(uow, company_id)
        if not config:
            raise HTTPException(status_code=404, detail="Configuración SIRE no encontrada")
        
        return SireConfigurationOut(
            id=config.id,
            company_id=config.company_id,
            ruc=config.ruc,
            usuario_generador=config.usuario_generador,
            auto_sync_enabled=config.auto_sync_enabled,
            sync_frequency_hours=config.sync_frequency_hours,
            email_notifications=config.email_notifications,
            notification_emails=config.notification_emails,
            use_test_env=config.use_test_env,
            last_sync_date=config.last_sync_date
        )
    finally:
        uow.close()

# ===== SINCRONIZACIÓN =====

@router.post("/sync", response_model=SireSyncResponse)
async def sync_proposals(
    payload: SireSyncRequest,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Sincroniza propuestas SIRE desde SUNAT
    """
    # Verificar autorización
    if company_id not in [c.id for c in current_user.companies]:
        raise HTTPException(status_code=403, detail="No autorizado para esta empresa")
    
    # Validar tipo de propuesta
    try:
        proposal_type = SireProposalType(payload.proposal_type.upper())
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Tipo de propuesta inválido: {payload.proposal_type}")
    
    uow = UnitOfWork()
    uow.db = db
    try:
        result = await sync_sire_proposals(
            uow,
            company_id=company_id,
            proposal_type=proposal_type,
            date_from=payload.date_from,
            date_to=payload.date_to,
            periods=payload.periods,
            created_by=current_user.id
        )
        uow.commit()
        
        return SireSyncResponse(**result)
    except ValueError as e:
        uow.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        uow.rollback()
        raise HTTPException(status_code=500, detail=f"Error sincronizando propuestas: {str(e)}")
    finally:
        uow.close()

# ===== PROPUESTAS RVIE =====

@router.get("/rvie/proposals", response_model=List[SireProposalOut])
def list_rvie_proposals(
    company_id: int = Query(..., description="ID de la empresa"),
    status: Optional[str] = Query(None, description="Filtrar por estado"),
    date_from: Optional[date] = Query(None, description="Fecha desde"),
    date_to: Optional[date] = Query(None, description="Fecha hasta"),
    limit: int = Query(100, description="Límite de resultados"),
    offset: int = Query(0, description="Offset para paginación"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista propuestas RVIE"""
    # Verificar autorización
    if company_id not in [c.id for c in current_user.companies]:
        raise HTTPException(status_code=403, detail="No autorizado para esta empresa")
    
    from ...domain.models_sire import SireRVIEProposal
    
    query = db.query(SireRVIEProposal).filter(
        SireRVIEProposal.company_id == company_id
    )
    
    if status:
        try:
            status_enum = SireProposalStatus(status.upper())
            query = query.filter(SireRVIEProposal.status == status_enum)
        except ValueError:
            pass
    
    if date_from:
        query = query.filter(SireRVIEProposal.proposal_date >= date_from)
    if date_to:
        query = query.filter(SireRVIEProposal.proposal_date <= date_to)
    
    proposals = query.order_by(
        SireRVIEProposal.proposal_date.desc(),
        SireRVIEProposal.created_at.desc()
    ).offset(offset).limit(limit).all()
    
    return [
        SireProposalOut(
            id=p.id,
            sunat_proposal_id=p.sunat_proposal_id,
            sunat_correlative=p.sunat_correlative,
            proposal_date=p.proposal_date,
            status=p.status.value,
            proposal_data=p.proposal_data,
            response_data=p.response_data,
            response_date=p.response_date,
            sale_id=p.sale_id,
            purchase_id=None,
            notes=p.notes,
            created_at=p.created_at,
            updated_at=p.updated_at
        )
        for p in proposals
    ]

@router.get("/rvie/proposals/{proposal_id}", response_model=SireProposalOut)
def get_rvie_proposal(
    proposal_id: int,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtiene una propuesta RVIE específica"""
    if company_id not in [c.id for c in current_user.companies]:
        raise HTTPException(status_code=403, detail="No autorizado")
    
    from ...domain.models_sire import SireRVIEProposal
    
    proposal = db.query(SireRVIEProposal).filter(
        SireRVIEProposal.id == proposal_id,
        SireRVIEProposal.company_id == company_id
    ).first()
    
    if not proposal:
        raise HTTPException(status_code=404, detail="Propuesta no encontrada")
    
    return SireProposalOut(
        id=proposal.id,
        sunat_proposal_id=proposal.sunat_proposal_id,
        sunat_correlative=proposal.sunat_correlative,
        proposal_date=proposal.proposal_date,
        status=proposal.status.value,
        proposal_data=proposal.proposal_data,
        response_data=proposal.response_data,
        response_date=proposal.response_date,
        sale_id=proposal.sale_id,
        purchase_id=None,
        notes=proposal.notes,
        created_at=proposal.created_at,
        updated_at=proposal.updated_at
    )

@router.post("/rvie/proposals/{proposal_id}/accept")
async def accept_rvie_proposal(
    proposal_id: int,
    company_id: int = Query(..., description="ID de la empresa"),
    payload: Optional[SireProposalActionRequest] = Body(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Acepta una propuesta RVIE"""
    if company_id not in [c.id for c in current_user.companies]:
        raise HTTPException(status_code=403, detail="No autorizado")
    
    uow = UnitOfWork()
    uow.db = db
    try:
        result = await accept_sire_proposal(
            uow,
            company_id=company_id,
            proposal_type=SireProposalType.RVIE,
            proposal_id=proposal_id,
            responded_by=current_user.id
        )
        uow.commit()
        return result
    except ValueError as e:
        uow.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        uow.rollback()
        raise HTTPException(status_code=500, detail=f"Error aceptando propuesta: {str(e)}")
    finally:
        uow.close()

@router.post("/rvie/proposals/{proposal_id}/complement")
async def complement_rvie_proposal(
    proposal_id: int,
    payload: SireProposalActionRequest,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Complementa una propuesta RVIE"""
    if company_id not in [c.id for c in current_user.companies]:
        raise HTTPException(status_code=403, detail="No autorizado")
    
    if not payload.additional_data:
        raise HTTPException(status_code=400, detail="additional_data es requerido")
    
    uow = UnitOfWork()
    uow.db = db
    try:
        result = await complement_sire_proposal(
            uow,
            company_id=company_id,
            proposal_type=SireProposalType.RVIE,
            proposal_id=proposal_id,
            additional_data=payload.additional_data,
            responded_by=current_user.id
        )
        uow.commit()
        return result
    except ValueError as e:
        uow.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        uow.rollback()
        raise HTTPException(status_code=500, detail=f"Error complementando propuesta: {str(e)}")
    finally:
        uow.close()

@router.post("/rvie/proposals/{proposal_id}/replace")
async def replace_rvie_proposal(
    proposal_id: int,
    payload: SireProposalActionRequest,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Reemplaza una propuesta RVIE"""
    if company_id not in [c.id for c in current_user.companies]:
        raise HTTPException(status_code=403, detail="No autorizado")
    
    if not payload.replacement_data:
        raise HTTPException(status_code=400, detail="replacement_data es requerido")
    
    uow = UnitOfWork()
    uow.db = db
    try:
        result = await replace_sire_proposal(
            uow,
            company_id=company_id,
            proposal_type=SireProposalType.RVIE,
            proposal_id=proposal_id,
            replacement_data=payload.replacement_data,
            responded_by=current_user.id
        )
        uow.commit()
        return result
    except ValueError as e:
        uow.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        uow.rollback()
        raise HTTPException(status_code=500, detail=f"Error reemplazando propuesta: {str(e)}")
    finally:
        uow.close()

# ===== PROPUESTAS RCE =====

@router.get("/rce/proposals", response_model=List[SireProposalOut])
def list_rce_proposals(
    company_id: int = Query(..., description="ID de la empresa"),
    status: Optional[str] = Query(None, description="Filtrar por estado"),
    date_from: Optional[date] = Query(None, description="Fecha desde"),
    date_to: Optional[date] = Query(None, description="Fecha hasta"),
    limit: int = Query(100, description="Límite de resultados"),
    offset: int = Query(0, description="Offset para paginación"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista propuestas RCE"""
    if company_id not in [c.id for c in current_user.companies]:
        raise HTTPException(status_code=403, detail="No autorizado")
    
    from ...domain.models_sire import SireRCEProposal
    
    query = db.query(SireRCEProposal).filter(
        SireRCEProposal.company_id == company_id
    )
    
    if status:
        try:
            status_enum = SireProposalStatus(status.upper())
            query = query.filter(SireRCEProposal.status == status_enum)
        except ValueError:
            pass
    
    if date_from:
        query = query.filter(SireRCEProposal.proposal_date >= date_from)
    if date_to:
        query = query.filter(SireRCEProposal.proposal_date <= date_to)
    
    proposals = query.order_by(
        SireRCEProposal.proposal_date.desc(),
        SireRCEProposal.created_at.desc()
    ).offset(offset).limit(limit).all()
    
    return [
        SireProposalOut(
            id=p.id,
            sunat_proposal_id=p.sunat_proposal_id,
            sunat_correlative=p.sunat_correlative,
            proposal_date=p.proposal_date,
            status=p.status.value,
            proposal_data=p.proposal_data,
            response_data=p.response_data,
            response_date=p.response_date,
            sale_id=None,
            purchase_id=p.purchase_id,
            notes=p.notes,
            created_at=p.created_at,
            updated_at=p.updated_at
        )
        for p in proposals
    ]

@router.get("/rce/proposals/{proposal_id}", response_model=SireProposalOut)
def get_rce_proposal(
    proposal_id: int,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtiene una propuesta RCE específica"""
    if company_id not in [c.id for c in current_user.companies]:
        raise HTTPException(status_code=403, detail="No autorizado")
    
    from ...domain.models_sire import SireRCEProposal
    
    proposal = db.query(SireRCEProposal).filter(
        SireRCEProposal.id == proposal_id,
        SireRCEProposal.company_id == company_id
    ).first()
    
    if not proposal:
        raise HTTPException(status_code=404, detail="Propuesta no encontrada")
    
    return SireProposalOut(
        id=proposal.id,
        sunat_proposal_id=proposal.sunat_proposal_id,
        sunat_correlative=proposal.sunat_correlative,
        proposal_date=proposal.proposal_date,
        status=proposal.status.value,
        proposal_data=proposal.proposal_data,
        response_data=proposal.response_data,
        response_date=proposal.response_date,
        sale_id=None,
        purchase_id=proposal.purchase_id,
        notes=proposal.notes,
        created_at=proposal.created_at,
        updated_at=proposal.updated_at
    )

@router.post("/rce/proposals/{proposal_id}/accept")
async def accept_rce_proposal(
    proposal_id: int,
    company_id: int = Query(..., description="ID de la empresa"),
    payload: Optional[SireProposalActionRequest] = Body(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Acepta una propuesta RCE"""
    if company_id not in [c.id for c in current_user.companies]:
        raise HTTPException(status_code=403, detail="No autorizado")
    
    uow = UnitOfWork()
    uow.db = db
    try:
        result = await accept_sire_proposal(
            uow,
            company_id=company_id,
            proposal_type=SireProposalType.RCE,
            proposal_id=proposal_id,
            responded_by=current_user.id
        )
        uow.commit()
        return result
    except ValueError as e:
        uow.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        uow.rollback()
        raise HTTPException(status_code=500, detail=f"Error aceptando propuesta: {str(e)}")
    finally:
        uow.close()

@router.post("/rce/proposals/{proposal_id}/complement")
async def complement_rce_proposal(
    proposal_id: int,
    payload: SireProposalActionRequest,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Complementa una propuesta RCE"""
    if company_id not in [c.id for c in current_user.companies]:
        raise HTTPException(status_code=403, detail="No autorizado")
    
    if not payload.additional_data:
        raise HTTPException(status_code=400, detail="additional_data es requerido")
    
    uow = UnitOfWork()
    uow.db = db
    try:
        result = await complement_sire_proposal(
            uow,
            company_id=company_id,
            proposal_type=SireProposalType.RCE,
            proposal_id=proposal_id,
            additional_data=payload.additional_data,
            responded_by=current_user.id
        )
        uow.commit()
        return result
    except ValueError as e:
        uow.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        uow.rollback()
        raise HTTPException(status_code=500, detail=f"Error complementando propuesta: {str(e)}")
    finally:
        uow.close()

@router.post("/rce/proposals/{proposal_id}/replace")
async def replace_rce_proposal(
    proposal_id: int,
    payload: SireProposalActionRequest,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Reemplaza una propuesta RCE"""
    if company_id not in [c.id for c in current_user.companies]:
        raise HTTPException(status_code=403, detail="No autorizado")
    
    if not payload.replacement_data:
        raise HTTPException(status_code=400, detail="replacement_data es requerido")
    
    uow = UnitOfWork()
    uow.db = db
    try:
        result = await replace_sire_proposal(
            uow,
            company_id=company_id,
            proposal_type=SireProposalType.RCE,
            proposal_id=proposal_id,
            replacement_data=payload.replacement_data,
            responded_by=current_user.id
        )
        uow.commit()
        return result
    except ValueError as e:
        uow.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        uow.rollback()
        raise HTTPException(status_code=500, detail=f"Error reemplazando propuesta: {str(e)}")
    finally:
        uow.close()

# ===== LOGS DE SINCRONIZACIÓN =====

@router.get("/periods")
async def get_sire_periods(
    company_id: int = Query(..., description="ID de la empresa"),
    proposal_type: str = Query(..., description="Tipo de propuesta: RVIE o RCE"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Obtiene la lista de períodos disponibles en SIRE
    
    Args:
        proposal_type: "RVIE" para ventas o "RCE" para compras
    """
    # Verificar autorización
    if company_id not in [c.id for c in current_user.companies]:
        raise HTTPException(status_code=403, detail="No autorizado para esta empresa")
    
    # Validar tipo de propuesta
    try:
        proposal_type_enum = SireProposalType(proposal_type.upper())
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Tipo de propuesta inválido: {proposal_type}. Debe ser RVIE o RCE")
    
    # Obtener configuración
    uow = UnitOfWork()
    uow.db = db
    try:
        config = get_sire_configuration(uow, company_id)
        if not config or not config.oauth_client_id or not config.oauth_client_secret:
            raise HTTPException(status_code=400, detail="Configuración SIRE no encontrada o incompleta")
        
        # Validar que se tengan las credenciales del generador
        if not config.ruc or not config.usuario_generador or not config.password_generador:
            raise HTTPException(
                status_code=400,
                detail="Configuración SIRE incompleta: RUC, usuario y password del generador son requeridos"
            )
        
        # Desencriptar password del generador
        from ...infrastructure.sire_auth import SireOAuthClient
        oauth_helper = SireOAuthClient()
        decrypted_password = oauth_helper.decrypt_secret(config.password_generador) if config.password_generador else None
        
        if not decrypted_password and config.password_generador:
            if not config.password_generador.startswith('gAAAAAB'):
                decrypted_password = config.password_generador
        
        if not decrypted_password:
            raise HTTPException(status_code=400, detail="Error al desencriptar password del generador")
        
        # Crear cliente SIRE
        client = SIREClient(
            company_id=company_id,
            oauth_client_id=config.oauth_client_id,
            oauth_client_secret=config.oauth_client_secret,
            access_token=config.oauth_token,
            refresh_token=config.oauth_refresh_token,
            token_expires_at=config.oauth_token_expires_at,
            use_preliminary_mode=config.use_test_env,
            ruc=config.ruc,
            usuario_generador=config.usuario_generador,
            password_generador=decrypted_password
        )
        
        # Obtener períodos (requiere tipo de propuesta para usar el código de libro correcto)
        periods = await client.get_periods(proposal_type=proposal_type_enum)
        return periods
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo períodos: {str(e)}")
    finally:
        uow.close()

@router.get("/sync-logs")
def list_sync_logs(
    company_id: int = Query(..., description="ID de la empresa"),
    sync_type: Optional[str] = Query(None, description="Tipo de sincronización (RVIE/RCE)"),
    limit: int = Query(50, description="Límite de resultados"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista logs de sincronización"""
    if company_id not in [c.id for c in current_user.companies]:
        raise HTTPException(status_code=403, detail="No autorizado")
    
    from ...domain.models_sire import SireSyncLog
    
    query = db.query(SireSyncLog).filter(
        SireSyncLog.company_id == company_id
    )
    
    if sync_type:
        try:
            sync_type_enum = SireProposalType(sync_type.upper())
            query = query.filter(SireSyncLog.sync_type == sync_type_enum)
        except ValueError:
            pass
    
    logs = query.order_by(
        SireSyncLog.sync_date.desc()
    ).limit(limit).all()
    
    return [
        {
            "id": log.id,
            "sync_type": log.sync_type.value,
            "sync_date": log.sync_date.isoformat(),
            "records_processed": log.records_processed,
            "records_success": log.records_success,
            "records_failed": log.records_failed,
            "status": log.status.value,
            "error_message": log.error_message,
        }
        for log in logs
    ]

