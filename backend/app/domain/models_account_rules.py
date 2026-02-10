"""
Modelos para reglas de validación de cuentas contables
Sistema de ayuda tipo IA para validar y sugerir asientos contables
"""
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Text, JSON, UniqueConstraint, DateTime, Float
from datetime import datetime
from sqlalchemy.orm import relationship, Mapped, mapped_column
from ..db import Base

class AccountValidationRule(Base):
    """Reglas de validación para cuentas contables"""
    __tablename__ = "account_validation_rules"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    rule_type: Mapped[str] = mapped_column(String(50), nullable=False)  # INCOMPATIBLE, REQUIRED_PAIR, SUGGESTION, WARNING
    name: Mapped[str] = mapped_column(String(200), nullable=False)  # Nombre descriptivo de la regla
    description: Mapped[str | None] = mapped_column(Text, nullable=True)  # Descripción de la regla
    
    # Cuentas involucradas (JSON array de códigos de cuenta o patrones)
    # Ejemplo: ["10.*", "10.*"] para "no usar cuenta 10 con otra cuenta 10"
    account_patterns: Mapped[str] = mapped_column(JSON, nullable=False)  # Lista de patrones de cuentas
    
    # Configuración de la regla
    severity: Mapped[str] = mapped_column(String(20), default="ERROR")  # ERROR, WARNING, INFO
    message: Mapped[str] = mapped_column(String(500), nullable=False)  # Mensaje a mostrar cuando se viola la regla
    
    # Sugerencias (para reglas tipo SUGGESTION)
    suggested_accounts: Mapped[str | None] = mapped_column(JSON, nullable=True)  # Lista de cuentas sugeridas
    suggested_glosa: Mapped[str | None] = mapped_column(String(500), nullable=True)  # Glosa sugerida
    
    # Condiciones adicionales (JSON)
    conditions: Mapped[str | None] = mapped_column(JSON, nullable=True)  # Condiciones adicionales (ej: solo en ciertos períodos)
    
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    company = relationship("Company")

class AccountCompatibilityRule(Base):
    """Reglas de compatibilidad entre cuentas (cuentas que suelen usarse juntas)"""
    __tablename__ = "account_compatibility_rules"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    account_code_pattern: Mapped[str] = mapped_column(String(50), nullable=False)  # Patrón de cuenta (ej: "10.*")
    compatible_with: Mapped[str] = mapped_column(JSON, nullable=False)  # Lista de patrones de cuentas compatibles
    confidence: Mapped[float] = mapped_column(Float, default=0.8)  # Nivel de confianza (0.0 a 1.0)
    usage_count: Mapped[int] = mapped_column(Integer, default=0)  # Contador de veces que se ha usado esta combinación
    last_used: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    company = relationship("Company")
    
    __table_args__ = (UniqueConstraint('company_id', 'account_code_pattern', name='uq_company_account_compat'),)

