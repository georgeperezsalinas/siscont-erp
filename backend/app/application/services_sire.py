"""
Servicios de aplicación para SIRE
==================================

Lógica de negocio para gestión de propuestas SIRE.
"""
from datetime import datetime, date
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from decimal import Decimal

from ..domain.models_sire import (
    SireRVIEProposal,
    SireRCEProposal,
    SireSyncLog,
    SireConfiguration,
    SireProposalStatus,
    SireProposalType,
    SireSyncStatus
)
from ..infrastructure.sire_client import SIREClient
from ..infrastructure.sire_parser import SireProposalParser
from ..infrastructure.unit_of_work import UnitOfWork


def get_sire_configuration(uow: UnitOfWork, company_id: int) -> Optional[SireConfiguration]:
    """Obtiene la configuración SIRE de una empresa"""
    return uow.db.query(SireConfiguration).filter(
        SireConfiguration.company_id == company_id
    ).first()


def create_or_update_sire_configuration(
    uow: UnitOfWork,
    company_id: int,
    oauth_client_id: str,
    oauth_client_secret: str,
    ruc: Optional[str] = None,
    usuario_generador: Optional[str] = None,
    password_generador: Optional[str] = None,
    auto_sync_enabled: bool = False,
    sync_frequency_hours: int = 24,
    email_notifications: bool = True,
    notification_emails: Optional[str] = None,
    use_preliminary_mode: bool = True,  # True = usar Preliminares (modo seguro), False = operaciones definitivas
    created_by: Optional[int] = None
) -> SireConfiguration:
    """
    Crea o actualiza la configuración SIRE de una empresa
    
    NOTA: SIRE no tiene ambiente de pruebas separado.
    use_preliminary_mode=True significa trabajar con Preliminares (modo seguro para pruebas).
    """
    config = get_sire_configuration(uow, company_id)
    
    # Encriptar password del generador si se proporciona
    from ..infrastructure.sire_auth import SireOAuthClient
    oauth_client = SireOAuthClient()
    encrypted_password = oauth_client.encrypt_secret(password_generador) if password_generador else None
    
    # Validar campos requeridos al crear nueva configuración
    if not config:
        if not ruc or ruc.strip() == "":
            raise ValueError("RUC del contribuyente es requerido")
        if not usuario_generador or usuario_generador.strip() == "":
            raise ValueError("Usuario del generador es requerido")
        if not password_generador or password_generador.strip() == "":
            raise ValueError("Password del generador es requerido")
        
        config = SireConfiguration(
            company_id=company_id,
            ruc=ruc.strip(),
            usuario_generador=usuario_generador.strip(),
            password_generador=encrypted_password,
            oauth_client_id=oauth_client_id,
            oauth_client_secret=oauth_client_secret,
            auto_sync_enabled=auto_sync_enabled,
            sync_frequency_hours=sync_frequency_hours,
            email_notifications=email_notifications,
            notification_emails=notification_emails,
            use_test_env=use_preliminary_mode,  # Mantener compatibilidad con BD
            created_by=created_by
        )
        uow.db.add(config)
    else:
        # Actualizar solo los campos que se proporcionan (no None)
        # Esto permite actualizar parcialmente sin perder valores existentes
        if ruc is not None:
            if ruc.strip() == "":
                raise ValueError("RUC no puede estar vacío")
            config.ruc = ruc.strip()
        if usuario_generador is not None:
            if usuario_generador.strip() == "":
                raise ValueError("Usuario del generador no puede estar vacío")
            config.usuario_generador = usuario_generador.strip()
        if password_generador is not None:
            if password_generador.strip() == "":
                raise ValueError("Password del generador no puede estar vacío")
            config.password_generador = encrypted_password
        # Solo actualizar OAuth si se proporcionan nuevos valores (no vacíos)
        if oauth_client_id and oauth_client_id.strip() != "":
            config.oauth_client_id = oauth_client_id
        if oauth_client_secret and oauth_client_secret.strip() != "":
            config.oauth_client_secret = oauth_client_secret
        config.auto_sync_enabled = auto_sync_enabled
        config.sync_frequency_hours = sync_frequency_hours
        config.email_notifications = email_notifications
        config.notification_emails = notification_emails
        config.use_test_env = use_preliminary_mode  # Mantener compatibilidad con BD
        config.updated_at = datetime.now()
    
    return config


async def sync_sire_proposals(
    uow: UnitOfWork,
    company_id: int,
    proposal_type: SireProposalType,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    periods: Optional[List[str]] = None,  # Lista de períodos tributarios a sincronizar (ej: ["202401", "202402"])
    created_by: Optional[int] = None
) -> Dict[str, Any]:
    """
    Sincroniza propuestas SIRE desde SUNAT
    
    El flujo correcto es:
    1. Obtener períodos disponibles con get_periods()
    2. Para cada período "No Presentado" (codEstado: "03"), descargar la propuesta
    3. Guardar las propuestas en la base de datos
    
    Returns:
        Dict con resultados de sincronización
    """
    # Obtener configuración
    config = get_sire_configuration(uow, company_id)
    if not config or not config.oauth_client_id or not config.oauth_client_secret:
        raise ValueError("Configuración SIRE no encontrada o incompleta")
    
    # Validar que se tengan las credenciales del generador
    if not config.ruc or not config.usuario_generador or not config.password_generador:
        raise ValueError(
            f"Configuración SIRE incompleta para empresa {company_id}:\n"
            f"  - RUC: {'Presente' if config.ruc else 'FALTANTE'}\n"
            f"  - Usuario: {'Presente' if config.usuario_generador else 'FALTANTE'}\n"
            f"  - Password: {'Presente' if config.password_generador else 'FALTANTE'}\n"
            f"Por favor, configura estos valores en la página de SIRE."
        )
    
    # Desencriptar password del generador
    from ..infrastructure.sire_auth import SireOAuthClient
    oauth_helper = SireOAuthClient()
    
    # Intentar desencriptar el password
    # Si falla, puede ser que esté en texto plano (compatibilidad con configuraciones antiguas)
    decrypted_password = oauth_helper.decrypt_secret(config.password_generador)
    
    # Si la desencriptación falla o retorna vacío, intentar usar el valor directamente
    # (puede estar en texto plano si se guardó antes de implementar la encriptación)
    if not decrypted_password and config.password_generador:
        # Intentar usar el valor directamente (puede estar en texto plano)
        # Solo si parece ser un password válido (no es un hash de encriptación)
        if not config.password_generador.startswith('gAAAAAB'):  # Prefijo típico de Fernet
            decrypted_password = config.password_generador
        else:
            raise ValueError(
                "Error al desencriptar password del generador. "
                "El password parece estar encriptado pero no se puede desencriptar. "
                "Por favor, guarda la configuración nuevamente con el password correcto."
            )
    
    # Validar que tengamos un password
    if not decrypted_password:
        raise ValueError(
            "Password del generador no disponible. "
            "Por favor, guarda la configuración SIRE nuevamente con el password del generador."
        )
    
    # Log para debugging
    print(f"[SIRE Service] Creando cliente para empresa {company_id}")
    print(f"[SIRE Service] RUC: {config.ruc}")
    print(f"[SIRE Service] Usuario: {config.usuario_generador}")
    print(f"[SIRE Service] Password desencriptado: {'Sí' if decrypted_password else 'No'}")
    
    # Crear cliente SIRE
    # use_test_env ahora representa use_preliminary_mode (compatibilidad)
    client = SIREClient(
        company_id=company_id,
        oauth_client_id=config.oauth_client_id,
        oauth_client_secret=config.oauth_client_secret,
        access_token=config.oauth_token,
        refresh_token=config.oauth_refresh_token,
        token_expires_at=config.oauth_token_expires_at,
        use_preliminary_mode=config.use_test_env,  # Mantener compatibilidad
        ruc=config.ruc,
        usuario_generador=config.usuario_generador,
        password_generador=decrypted_password
    )
    
    # Obtener propuestas desde SUNAT
    try:
        # Si se proporcionan períodos específicos, usarlos
        # Si no, obtener períodos disponibles y sincronizar los "No Presentado"
        if periods:
            periods_to_sync = periods
        else:
            # Obtener períodos disponibles
            print(f"[SIRE Service] Obteniendo períodos disponibles para {proposal_type.value}...")
            periods_response = await client.get_periods(proposal_type=proposal_type)
            
            # Extraer períodos "No Presentado" (codEstado: "03")
            periods_to_sync = []
            if isinstance(periods_response, list):
                for ejercicio in periods_response:
                    if isinstance(ejercicio, dict) and "lisPeriodos" in ejercicio:
                        for periodo in ejercicio["lisPeriodos"]:
                            if isinstance(periodo, dict):
                                cod_estado = periodo.get("codEstado")
                                per_tributario = periodo.get("perTributario")
                                if cod_estado == "03" and per_tributario:  # "03" = No Presentado
                                    periods_to_sync.append(per_tributario)
            
            print(f"[SIRE Service] Períodos a sincronizar: {periods_to_sync}")
        
        if not periods_to_sync:
            return {
                "success": True,
                "records_processed": 0,
                "records_success": 0,
                "records_failed": 0,
                "message": "No hay períodos para sincronizar"
            }
        
        # Procesar cada período
        records_processed = 0
        records_success = 0
        records_failed = 0
        errors = []
        
        for per_tributario in periods_to_sync:
            records_processed += 1
            try:
                print(f"[SIRE Service] Intentando obtener propuesta para período {per_tributario}...")
                
                # Obtener propuesta para este período
                if proposal_type == SireProposalType.RVIE:
                    proposal_data = await client.get_rvie_proposal_by_period(per_tributario)
                else:
                    proposal_data = await client.get_rce_proposal_by_period(per_tributario)
                
                # La respuesta puede ser directamente la propuesta o estar dentro de un objeto
                if not isinstance(proposal_data, dict):
                    raise ValueError(f"Respuesta inválida para período {per_tributario}")
                
                # Verificar si la respuesta indica que no hay propuesta disponible
                if proposal_data.get("cod") and proposal_data.get("cod") != 200:
                    error_msg = proposal_data.get("msg", "Error desconocido")
                    print(f"[SIRE Service] Período {per_tributario}: {error_msg}")
                    records_failed += 1
                    errors.append({
                        "period": per_tributario,
                        "error": error_msg
                    })
                    continue
                
                # Verificar si la respuesta está vacía o no tiene datos
                if not proposal_data or len(proposal_data) == 0:
                    print(f"[SIRE Service] Período {per_tributario}: No hay datos de propuesta disponibles")
                    records_failed += 1
                    errors.append({
                        "period": per_tributario,
                        "error": "No hay datos de propuesta disponibles"
                    })
                    continue
                
                print(f"[SIRE Service] Propuesta obtenida exitosamente para período {per_tributario}")
                
                # Procesar la propuesta
                try:
                    # Parsear propuesta
                    if proposal_type == SireProposalType.RVIE:
                        parsed = SireProposalParser.parse_rvie_proposal(proposal_data)
                        proposal_id = parsed.get("sunat_proposal_id") or f"RVIE-{per_tributario}"
                        
                        # Verificar si ya existe
                        existing = uow.db.query(SireRVIEProposal).filter(
                            SireRVIEProposal.sunat_proposal_id == proposal_id,
                            SireRVIEProposal.company_id == company_id
                        ).first()
                        
                        if not existing:
                            # Crear nueva propuesta
                            proposal = SireRVIEProposal(
                                company_id=company_id,
                                sunat_proposal_id=proposal_id,
                                sunat_correlative=parsed.get("sunat_correlative"),
                                proposal_date=parsed.get("proposal_date") or date.today(),
                                sunat_created_at=parsed.get("sunat_created_at"),
                                proposal_data=proposal_data,
                                status=SireProposalStatus.PENDING,
                                created_by=created_by
                            )
                            uow.db.add(proposal)
                            records_success += 1
                        else:
                            # Actualizar si cambió
                            existing.proposal_data = proposal_data
                            existing.updated_at = datetime.now()
                            records_success += 1
                    else:
                        # RCE
                        parsed = SireProposalParser.parse_rce_proposal(proposal_data)
                        proposal_id = parsed.get("sunat_proposal_id") or f"RCE-{per_tributario}"
                        
                        existing = uow.db.query(SireRCEProposal).filter(
                            SireRCEProposal.sunat_proposal_id == proposal_id,
                            SireRCEProposal.company_id == company_id
                        ).first()
                        
                        if not existing:
                            proposal = SireRCEProposal(
                                company_id=company_id,
                                sunat_proposal_id=proposal_id,
                                sunat_correlative=parsed.get("sunat_correlative"),
                                proposal_date=parsed.get("proposal_date") or date.today(),
                                sunat_created_at=parsed.get("sunat_created_at"),
                                proposal_data=proposal_data,
                                status=SireProposalStatus.PENDING,
                                created_by=created_by
                            )
                            uow.db.add(proposal)
                            records_success += 1
                        else:
                            existing.proposal_data = proposal_data
                            existing.updated_at = datetime.now()
                            records_success += 1
                except Exception as e:
                    records_failed += 1
                    error_msg = f"Error procesando propuesta del período {per_tributario}: {str(e)}"
                    errors.append({
                        "period": per_tributario,
                        "error": str(e)
                    })
                    print(f"[SIRE Service] {error_msg}")
            
            except Exception as e:
                records_failed += 1
                error_msg = f"Error obteniendo propuesta para período {per_tributario}: {str(e)}"
                errors.append({
                    "period": per_tributario,
                    "error": str(e)
                })
                print(f"[SIRE Service] {error_msg}")
        
        # Actualizar tokens si se renovaron
        if client.access_token != config.oauth_token:
            config.oauth_token = client.access_token
            config.oauth_refresh_token = client.refresh_token
            if client.token_expires_at:
                config.oauth_token_expires_at = client.token_expires_at
        
        # Actualizar última sincronización
        config.last_sync_date = datetime.now()
        
        # Crear log de sincronización
        sync_status = SireSyncStatus.SUCCESS if records_failed == 0 else (
            SireSyncStatus.PARTIAL if records_success > 0 else SireSyncStatus.ERROR
        )
        
        sync_log = SireSyncLog(
            company_id=company_id,
            sync_type=proposal_type,
            sync_date=datetime.now(),
            records_processed=records_processed,
            records_success=records_success,
            records_failed=records_failed,
            status=sync_status,
            error_message=f"{records_failed} errores" if records_failed > 0 else None,
            error_details={"errors": errors} if errors else None,
            sunat_response={"periods_synced": periods_to_sync},
            created_by=created_by
        )
        uow.db.add(sync_log)
        
        return {
            "success": True,
            "records_processed": records_processed,
            "records_success": records_success,
            "records_failed": records_failed,
            "errors": errors
        }
        
    except Exception as e:
        # Crear log de error
        sync_log = SireSyncLog(
            company_id=company_id,
            sync_type=proposal_type,
            sync_date=datetime.now(),
            records_processed=0,
            records_success=0,
            records_failed=0,
            status=SireSyncStatus.ERROR,
            error_message=str(e),
            created_by=created_by
        )
        uow.db.add(sync_log)
        raise


async def accept_sire_proposal(
    uow: UnitOfWork,
    company_id: int,
    proposal_type: SireProposalType,
    proposal_id: int,
    created_by: Optional[int] = None,
    responded_by: Optional[int] = None
) -> Dict[str, Any]:
    """
    Acepta una propuesta SIRE sin modificaciones
    """
    # Obtener configuración
    config = get_sire_configuration(uow, company_id)
    if not config:
        raise ValueError("Configuración SIRE no encontrada")
    
    # Desencriptar password
    from ..infrastructure.sire_auth import SireOAuthClient
    oauth_helper = SireOAuthClient()
    decrypted_password = oauth_helper.decrypt_secret(config.password_generador)
    if not decrypted_password and config.password_generador and not config.password_generador.startswith('gAAAAAB'):
        decrypted_password = config.password_generador
    
    # Crear cliente
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
    
    # Obtener propuesta
    if proposal_type == SireProposalType.RVIE:
        proposal = uow.db.query(SireRVIEProposal).filter(
            SireRVIEProposal.id == proposal_id,
            SireRVIEProposal.company_id == company_id
        ).first()
        if not proposal:
            raise ValueError("Propuesta RVIE no encontrada")
        sunat_response = await client.accept_rvie_proposal(proposal.sunat_proposal_id)
    else:
        proposal = uow.db.query(SireRCEProposal).filter(
            SireRCEProposal.id == proposal_id,
            SireRCEProposal.company_id == company_id
        ).first()
        if not proposal:
            raise ValueError("Propuesta RCE no encontrada")
        sunat_response = await client.accept_rce_proposal(proposal.sunat_proposal_id)
    
    # Actualizar propuesta
    proposal.status = SireProposalStatus.ACCEPTED
    proposal.response_data = sunat_response
    proposal.response_date = datetime.now()
    proposal.responded_by = responded_by or created_by
    proposal.updated_at = datetime.now()
    
    # Actualizar tokens
    if client.access_token != config.oauth_token:
        config.oauth_token = client.access_token
        config.oauth_refresh_token = client.refresh_token
        if client.token_expires_at:
            config.oauth_token_expires_at = client.token_expires_at
    
    return {"success": True, "response": sunat_response}


async def complement_sire_proposal(
    uow: UnitOfWork,
    company_id: int,
    proposal_type: SireProposalType,
    proposal_id: int,
    additional_data: Dict[str, Any],
    created_by: Optional[int] = None,
    responded_by: Optional[int] = None
) -> Dict[str, Any]:
    """
    Complementa una propuesta SIRE con datos adicionales
    """
    # Obtener configuración
    config = get_sire_configuration(uow, company_id)
    if not config:
        raise ValueError("Configuración SIRE no encontrada")
    
    # Desencriptar password
    from ..infrastructure.sire_auth import SireOAuthClient
    oauth_helper = SireOAuthClient()
    decrypted_password = oauth_helper.decrypt_secret(config.password_generador)
    if not decrypted_password and config.password_generador and not config.password_generador.startswith('gAAAAAB'):
        decrypted_password = config.password_generador
    
    # Crear cliente
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
    
    # Obtener propuesta
    if proposal_type == SireProposalType.RVIE:
        proposal = uow.db.query(SireRVIEProposal).filter(
            SireRVIEProposal.id == proposal_id,
            SireRVIEProposal.company_id == company_id
        ).first()
        if not proposal:
            raise ValueError("Propuesta RVIE no encontrada")
        sunat_response = await client.complement_rvie_proposal(proposal.sunat_proposal_id, additional_data)
    else:
        proposal = uow.db.query(SireRCEProposal).filter(
            SireRCEProposal.id == proposal_id,
            SireRCEProposal.company_id == company_id
        ).first()
        if not proposal:
            raise ValueError("Propuesta RCE no encontrada")
        sunat_response = await client.complement_rce_proposal(proposal.sunat_proposal_id, additional_data)
    
    # Actualizar propuesta
    proposal.status = SireProposalStatus.COMPLEMENTED
    proposal.response_data = sunat_response
    proposal.response_date = datetime.now()
    proposal.responded_by = responded_by or created_by
    proposal.updated_at = datetime.now()
    
    # Actualizar tokens
    if client.access_token != config.oauth_token:
        config.oauth_token = client.access_token
        config.oauth_refresh_token = client.refresh_token
        if client.token_expires_at:
            config.oauth_token_expires_at = client.token_expires_at
    
    return {"success": True, "response": sunat_response}


async def replace_sire_proposal(
    uow: UnitOfWork,
    company_id: int,
    proposal_type: SireProposalType,
    proposal_id: int,
    replacement_data: Dict[str, Any],
    created_by: Optional[int] = None,
    responded_by: Optional[int] = None
) -> Dict[str, Any]:
    """
    Reemplaza completamente una propuesta SIRE
    """
    # Obtener configuración
    config = get_sire_configuration(uow, company_id)
    if not config:
        raise ValueError("Configuración SIRE no encontrada")
    
    # Desencriptar password
    from ..infrastructure.sire_auth import SireOAuthClient
    oauth_helper = SireOAuthClient()
    decrypted_password = oauth_helper.decrypt_secret(config.password_generador)
    if not decrypted_password and config.password_generador and not config.password_generador.startswith('gAAAAAB'):
        decrypted_password = config.password_generador
    
    # Crear cliente
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
    
    # Obtener propuesta
    if proposal_type == SireProposalType.RVIE:
        proposal = uow.db.query(SireRVIEProposal).filter(
            SireRVIEProposal.id == proposal_id,
            SireRVIEProposal.company_id == company_id
        ).first()
        if not proposal:
            raise ValueError("Propuesta RVIE no encontrada")
        sunat_response = await client.replace_rvie_proposal(proposal.sunat_proposal_id, replacement_data)
    else:
        proposal = uow.db.query(SireRCEProposal).filter(
            SireRCEProposal.id == proposal_id,
            SireRCEProposal.company_id == company_id
        ).first()
        if not proposal:
            raise ValueError("Propuesta RCE no encontrada")
        sunat_response = await client.replace_rce_proposal(proposal.sunat_proposal_id, replacement_data)
    
    # Actualizar propuesta
    proposal.status = SireProposalStatus.REPLACED
    proposal.response_data = sunat_response
    proposal.response_date = datetime.now()
    proposal.responded_by = responded_by or created_by
    proposal.updated_at = datetime.now()
    
    # Actualizar tokens
    if client.access_token != config.oauth_token:
        config.oauth_token = client.access_token
        config.oauth_refresh_token = client.refresh_token
        if client.token_expires_at:
            config.oauth_token_expires_at = client.token_expires_at
    
    return {"success": True, "response": sunat_response}
