"""
Auditoría Global de Acciones - SISCONT
=====================================
Registro inmutable de todas las acciones relevantes.
Nivel ERP: SAP / Oracle / SUNAT.
"""
from datetime import datetime
from typing import Any, Dict, Optional
from sqlalchemy import Integer, String, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship, Mapped, mapped_column
from ..db import Base


class AuditLog(Base):
    """
    Log global de auditoría. Inmutable.
    Solo INSERT permitido. Prohibido UPDATE y DELETE.
    """
    __tablename__ = "audit_log"
    __table_args__ = {"comment": "Auditoría global ERP - inmutable"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    user_role: Mapped[str | None] = mapped_column(String(50), nullable=True)
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"), nullable=True, index=True)
    module: Mapped[str] = mapped_column(String(50), index=True)  # COMPRAS, VENTAS, ASIENTOS, TESORERIA, CASILLA, CONFIG, AUTH
    action: Mapped[str] = mapped_column(String(50), index=True)  # CREATE, UPDATE, POST, REVERSE, READ, DOWNLOAD, LOGIN, etc.
    entity_type: Mapped[str | None] = mapped_column(String(100), nullable=True)  # Asiento, Compra, Venta, Pago, Mensaje
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    summary: Mapped[str | None] = mapped_column(String(500), nullable=True)
    metadata_: Mapped[Dict[str, Any] | None] = mapped_column("metadata", JSON, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)

    user = relationship("User", foreign_keys=[user_id])
    company = relationship("Company", foreign_keys=[company_id])
