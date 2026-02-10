"""
Modelos de Dominio para Gestión Documental
"""
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Date, DateTime, Numeric, Text, BigInteger, UniqueConstraint, JSON
from sqlalchemy.orm import relationship, Mapped, mapped_column
from typing import Dict, Any, Optional
from datetime import datetime
from ..db import Base

class Document(Base):
    """Documento digital almacenado en el sistema"""
    __tablename__ = "documents"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    
    # Información del archivo
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    stored_filename: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    file_path: Mapped[str] = mapped_column(Text, nullable=False)
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False)  # Bytes
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)  # SHA-256
    
    # Metadatos del documento
    document_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)  # COMPROBANTE_COMPRA, COMPROBANTE_VENTA, OTRO
    document_category: Mapped[str | None] = mapped_column(String(100), nullable=True)  # FACTURA, BOLETA, NOTA_CREDITO, etc.
    title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Relaciones con entidades del sistema
    related_entity_type: Mapped[str | None] = mapped_column(String(50), nullable=True)  # PURCHASE, SALE, JOURNAL_ENTRY, THIRD_PARTY
    related_entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    __table_args__ = (
        # Índice compuesto para búsqueda rápida por entidad relacionada
        # Se crea en la migración
    )
    
    # Metadatos adicionales (JSON)
    metadata: Mapped[Dict[str, Any] | None] = mapped_column(JSON, nullable=True)  # Datos extraídos (fecha, RUC, monto, etc.)
    
    # Control de versiones
    version: Mapped[int] = mapped_column(Integer, default=1)
    parent_document_id: Mapped[int | None] = mapped_column(ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)
    
    # Estado y validación
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE", index=True)  # ACTIVE, ARCHIVED, DELETED
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    verification_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    verified_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    
    # OCR y extracción
    ocr_text: Mapped[str | None] = mapped_column(Text, nullable=True)  # Texto extraído por OCR
    ocr_confidence: Mapped[Numeric | None] = mapped_column(Numeric(5, 2), nullable=True)  # Confianza del OCR (0-100)
    extracted_data: Mapped[Dict[str, Any] | None] = mapped_column(JSON, nullable=True)  # Datos estructurados extraídos
    
    # Auditoría
    uploaded_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)  # Soft delete
    
    # Relaciones
    tags = relationship("DocumentTag", back_populates="document", cascade="all, delete-orphan")
    access_logs = relationship("DocumentAccessLog", back_populates="document", cascade="all, delete-orphan")
    versions = relationship("DocumentVersion", back_populates="document", cascade="all, delete-orphan")
    parent_document = relationship("Document", remote_side=[id], backref="child_versions")

class DocumentTag(Base):
    """Tags/Etiquetas para documentos"""
    __tablename__ = "document_tags"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    tag: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    
    document = relationship("Document", back_populates="tags")
    
    __table_args__ = (UniqueConstraint('document_id', 'tag', name='uq_document_tag'),)

class DocumentAccessLog(Base):
    """Log de accesos a documentos (auditoría)"""
    __tablename__ = "document_access_log"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(50), nullable=False)  # VIEW, DOWNLOAD, DELETE, etc.
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    accessed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, index=True)
    
    document = relationship("Document", back_populates="access_logs")

class DocumentVersion(Base):
    """Versiones de documentos"""
    __tablename__ = "document_versions"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    file_path: Mapped[str] = mapped_column(Text, nullable=False)
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    file_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    change_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    
    document = relationship("Document", back_populates="versions")
    
    __table_args__ = (UniqueConstraint('document_id', 'version_number', name='uq_document_version'),)

