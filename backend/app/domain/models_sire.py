"""
Modelos de datos para SIRE (Sistema Integrado de Registros Electrónicos)
===========================================================================

Gestiona las propuestas de ventas (RVIE) y compras (RCE) que SUNAT genera automáticamente.
"""
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import Integer, String, Date, ForeignKey, DateTime, Text, Enum, JSON, Boolean, UniqueConstraint, Index
from datetime import datetime
from typing import Dict, Any
from .models import Base
import enum

class SireProposalStatus(str, enum.Enum):
    """Estado de una propuesta SIRE"""
    PENDING = "PENDING"  # Pendiente de revisión
    ACCEPTED = "ACCEPTED"  # Aceptada sin modificaciones
    REJECTED = "REJECTED"  # Rechazada
    COMPLEMENTED = "COMPLEMENTED"  # Complementada con datos adicionales
    REPLACED = "REPLACED"  # Reemplazada completamente
    SYNCED = "SYNCED"  # Sincronizada con SUNAT

class SireProposalType(str, enum.Enum):
    """Tipo de propuesta SIRE"""
    RVIE = "RVIE"  # Registro de Ventas e Ingresos Electrónico
    RCE = "RCE"  # Registro de Compras Electrónico

class SireSyncStatus(str, enum.Enum):
    """Estado de sincronización"""
    SUCCESS = "SUCCESS"
    ERROR = "ERROR"
    PARTIAL = "PARTIAL"  # Algunos registros fallaron

class SireRVIEProposal(Base):
    """
    Propuesta de Registro de Ventas e Ingresos Electrónico (RVIE) desde SUNAT
    """
    __tablename__ = "sire_rvie_proposals"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True, nullable=False)
    
    # Identificadores SUNAT
    sunat_proposal_id: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    sunat_correlative: Mapped[str | None] = mapped_column(String(20), nullable=True)  # Correlativo SUNAT
    
    # Fechas
    proposal_date: Mapped[Date] = mapped_column(Date, nullable=False, index=True)
    sunat_created_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)  # Fecha creación en SUNAT
    
    # Datos de la propuesta (JSON completo desde SUNAT)
    proposal_data: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    
    # Estado y respuesta
    status: Mapped[SireProposalStatus] = mapped_column(
        Enum(SireProposalStatus),
        default=SireProposalStatus.PENDING,
        index=True
    )
    response_data: Mapped[Dict[str, Any] | None] = mapped_column(JSON, nullable=True)  # Respuesta enviada a SUNAT
    response_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)  # Fecha de respuesta
    
    # Relación con venta local (si existe)
    sale_id: Mapped[int | None] = mapped_column(ForeignKey("sales.id"), nullable=True, index=True)
    
    # Notas y observaciones
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)  # Si fue rechazada
    
    # Auditoría
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now, nullable=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    responded_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    
    # Índices compuestos
    __table_args__ = (
        Index('idx_sire_rvie_company_status', 'company_id', 'status'),
        Index('idx_sire_rvie_company_date', 'company_id', 'proposal_date'),
    )

class SireRCEProposal(Base):
    """
    Propuesta de Registro de Compras Electrónico (RCE) desde SUNAT
    """
    __tablename__ = "sire_rce_proposals"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True, nullable=False)
    
    # Identificadores SUNAT
    sunat_proposal_id: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    sunat_correlative: Mapped[str | None] = mapped_column(String(20), nullable=True)
    
    # Fechas
    proposal_date: Mapped[Date] = mapped_column(Date, nullable=False, index=True)
    sunat_created_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    
    # Datos de la propuesta
    proposal_data: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False)
    
    # Estado y respuesta
    status: Mapped[SireProposalStatus] = mapped_column(
        Enum(SireProposalStatus),
        default=SireProposalStatus.PENDING,
        index=True
    )
    response_data: Mapped[Dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    response_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    
    # Relación con compra local (si existe)
    purchase_id: Mapped[int | None] = mapped_column(ForeignKey("purchases.id"), nullable=True, index=True)
    
    # Notas y observaciones
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Auditoría
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now, nullable=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    responded_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    
    # Índices compuestos
    __table_args__ = (
        Index('idx_sire_rce_company_status', 'company_id', 'status'),
        Index('idx_sire_rce_company_date', 'company_id', 'proposal_date'),
    )

class SireSyncLog(Base):
    """
    Log de sincronización con SIRE SUNAT
    """
    __tablename__ = "sire_sync_log"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True, nullable=False)
    
    # Tipo de sincronización
    sync_type: Mapped[SireProposalType] = mapped_column(Enum(SireProposalType), nullable=False, index=True)
    
    # Fecha y hora de sincronización
    sync_date: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False, index=True)
    
    # Resultados
    records_processed: Mapped[int] = mapped_column(Integer, default=0)
    records_success: Mapped[int] = mapped_column(Integer, default=0)
    records_failed: Mapped[int] = mapped_column(Integer, default=0)
    
    # Estado
    status: Mapped[SireSyncStatus] = mapped_column(Enum(SireSyncStatus), nullable=False, index=True)
    
    # Detalles de error (si aplica)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_details: Mapped[Dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    
    # Información adicional
    sunat_response: Mapped[Dict[str, Any] | None] = mapped_column(JSON, nullable=True)  # Respuesta completa de SUNAT
    
    # Auditoría
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    
    # Índices
    __table_args__ = (
        Index('idx_sire_sync_company_type_date', 'company_id', 'sync_type', 'sync_date'),
    )

class SireConfiguration(Base):
    """
    Configuración de SIRE por empresa
    """
    __tablename__ = "sire_configurations"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), unique=True, index=True, nullable=False)
    
    # Credenciales del generador (requeridas según manual SUNAT)
    ruc: Mapped[str | None] = mapped_column(String(20), nullable=True)  # RUC del contribuyente
    usuario_generador: Mapped[str | None] = mapped_column(String(100), nullable=True)  # Usuario del generador
    password_generador: Mapped[str | None] = mapped_column(String(255), nullable=True)  # Password del generador (encriptado)
    
    # Credenciales OAuth (encriptadas)
    oauth_client_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    oauth_client_secret: Mapped[str | None] = mapped_column(String(255), nullable=True)  # Debe estar encriptado
    oauth_token: Mapped[str | None] = mapped_column(Text, nullable=True)  # Token de acceso actual
    oauth_refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True)  # Refresh token
    oauth_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)  # Expiración del token
    
    # Configuración de sincronización
    auto_sync_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    sync_frequency_hours: Mapped[int] = mapped_column(Integer, default=24)  # Frecuencia en horas
    last_sync_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    
    # Ambiente (pruebas o producción)
    use_test_env: Mapped[bool] = mapped_column(Boolean, default=True)  # True = pruebas, False = producción
    
    # Notificaciones
    email_notifications: Mapped[bool] = mapped_column(Boolean, default=True)
    notification_emails: Mapped[str | None] = mapped_column(Text, nullable=True)  # Emails separados por coma
    
    # Configuración adicional
    settings: Mapped[Dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    
    # Auditoría
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now, nullable=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

