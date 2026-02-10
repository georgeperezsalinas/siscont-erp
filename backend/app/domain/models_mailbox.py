"""
Modelos de Casilla Electrónica Empresarial
==========================================
Similar a Casilla Electrónica SUNAT / SAP Business Workplace.
Buzón oficial por empresa, no editable por la empresa.
"""
from datetime import datetime
from typing import Any, Dict, Optional
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Date, DateTime, Text
from sqlalchemy import JSON
from sqlalchemy.orm import relationship, Mapped, mapped_column
from ..db import Base


class ElectronicMailbox(Base):
    """Casilla electrónica por empresa. Una empresa tiene una sola casilla."""
    __tablename__ = "electronic_mailboxes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")  # ACTIVE / SUSPENDED
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    company = relationship("Company", back_populates="mailbox")
    messages = relationship("MailboxMessage", back_populates="mailbox", cascade="all, delete-orphan", order_by="MailboxMessage.created_at.desc()")


class MailboxMessage(Base):
    """Mensaje en la casilla electrónica. Inmutable: no se edita ni elimina."""
    __tablename__ = "mailbox_messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mailbox_id: Mapped[int] = mapped_column(ForeignKey("electronic_mailboxes.id"), index=True)
    subject: Mapped[str] = mapped_column(String(500))
    body: Mapped[str] = mapped_column(Text)
    message_type: Mapped[str] = mapped_column(String(50))  # NOTIFICACION, MULTA, REQUERIMIENTO, AUDITORIA, RECORDATORIO, DOCUMENTO, COMUNICADO
    priority: Mapped[str] = mapped_column(String(20), default="NORMAL")  # NORMAL, ALTA, CRITICA
    requires_response: Mapped[bool] = mapped_column(Boolean, default=False)
    due_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)  # Usuario SISCONT
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    read_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    is_acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    acknowledged_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    message_status: Mapped[str | None] = mapped_column(String(20), nullable=True, default="ENVIADO")  # ENVIADO, LEIDO, RESPONDIDO, VENCIDO

    mailbox = relationship("ElectronicMailbox", back_populates="messages")
    creator = relationship("User", foreign_keys=[created_by])
    read_by = relationship("User", foreign_keys=[read_by_user_id])
    acknowledged_by = relationship("User", foreign_keys=[acknowledged_by_user_id])
    attachments = relationship("MailboxAttachment", back_populates="message", cascade="all, delete-orphan")
    responses = relationship("MailboxResponse", back_populates="message", cascade="all, delete-orphan")


class MailboxAttachment(Base):
    """Adjunto de un mensaje. Hash SHA256, inmutable, no reemplazable."""
    __tablename__ = "mailbox_attachments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    message_id: Mapped[int] = mapped_column(ForeignKey("mailbox_messages.id"), index=True)
    file_name: Mapped[str] = mapped_column(String(500))
    file_path: Mapped[str] = mapped_column(String(1000))
    file_type: Mapped[str] = mapped_column(String(100))
    file_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)  # SHA256
    file_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    message = relationship("MailboxMessage", back_populates="attachments")


class MailboxResponse(Base):
    """Respuesta de la empresa a un mensaje."""
    __tablename__ = "mailbox_responses"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    message_id: Mapped[int] = mapped_column(ForeignKey("mailbox_messages.id"), index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    response_text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    message = relationship("MailboxMessage", back_populates="responses")
    creator = relationship("User", foreign_keys=[created_by])
    attachments = relationship("MailboxResponseAttachment", back_populates="response", cascade="all, delete-orphan")


class MailboxResponseAttachment(Base):
    """Adjunto de una respuesta de la empresa. Hash SHA256."""
    __tablename__ = "mailbox_response_attachments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    response_id: Mapped[int] = mapped_column(ForeignKey("mailbox_responses.id"), index=True)
    file_name: Mapped[str] = mapped_column(String(500))
    file_path: Mapped[str] = mapped_column(String(1000))
    file_type: Mapped[str] = mapped_column(String(100))
    file_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    response = relationship("MailboxResponse", back_populates="attachments")


class CompanyToAdminMessage(Base):
    """Mensaje de la empresa hacia SISCONT (admin). Inmutable."""
    __tablename__ = "company_to_admin_messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    subject: Mapped[str] = mapped_column(String(500))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    read_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    is_acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    acknowledged_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    company = relationship("Company")
    creator = relationship("User", foreign_keys=[created_by])
    attachments = relationship("CompanyToAdminAttachment", back_populates="message", cascade="all, delete-orphan")


class MailboxAuditLog(Base):
    """Auditoría de acciones en la casilla electrónica. Inmutable, nada se borra."""
    __tablename__ = "mailbox_audit_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_type: Mapped[str] = mapped_column(String(50))  # MESSAGE_SENT, MESSAGE_READ, RESPONSE_SENT, ATTACHMENT_DOWNLOAD, ACKNOWLEDGED, etc.
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"), nullable=True)
    message_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    attachment_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    extra_data: Mapped[Dict[str, Any] | None] = mapped_column("metadata", JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class CompanyToAdminAttachment(Base):
    """Adjunto de un mensaje empresa→admin. Hash SHA256."""
    __tablename__ = "company_to_admin_attachments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    message_id: Mapped[int] = mapped_column(ForeignKey("company_to_admin_messages.id"), index=True)
    file_name: Mapped[str] = mapped_column(String(500))
    file_path: Mapped[str] = mapped_column(String(1000))
    file_type: Mapped[str] = mapped_column(String(100))
    file_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    message = relationship("CompanyToAdminMessage", back_populates="attachments")
