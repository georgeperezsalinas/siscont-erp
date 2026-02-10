from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Date, DateTime, Numeric, Enum, UniqueConstraint, Table, JSON, Text
from datetime import datetime
from sqlalchemy.orm import relationship, Mapped, mapped_column
from typing import Dict, Any
from ..db import Base
from .enums import AccountType, UserRole

# Tabla intermedia para relación many-to-many entre User y Company (CompanyUser)
user_companies = Table(
    "user_companies",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id"), primary_key=True),
    Column("company_id", Integer, ForeignKey("companies.id"), primary_key=True),
    Column("role", String(50), nullable=True, default="EMPRESA_USUARIO"),  # Por empresa: EMPRESA_PROPIETARIO, EMPRESA_ADMIN, etc.
    Column("is_active", Boolean, nullable=True, default=True),
)

class Company(Base):
    __tablename__ = "companies"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)  # Razón Social
    ruc: Mapped[str] = mapped_column(String(20), unique=True, nullable=True)
    
    # Campos SUNAT / PLE
    commercial_name: Mapped[str | None] = mapped_column(String(200), nullable=True)  # Nombre Comercial
    taxpayer_type: Mapped[str | None] = mapped_column(String(50), nullable=True)  # Tipo de Contribuyente: Natural con negocio, Jurídica, EIRL
    fiscal_address: Mapped[str | None] = mapped_column(String(500), nullable=True)  # Domicilio Fiscal
    ubigeo: Mapped[str | None] = mapped_column(String(6), nullable=True)  # Ubigeo SUNAT (6 dígitos)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)  # Teléfono
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)  # Correo electrónico
    tax_regime: Mapped[str | None] = mapped_column(String(100), nullable=True)  # Régimen Tributario: RMT, MYPE, Régimen General, etc.
    economic_activity_code: Mapped[str | None] = mapped_column(String(10), nullable=True)  # Actividad Económica (CIIU) - código SUNAT/INEI
    sunat_status: Mapped[str | None] = mapped_column(String(50), nullable=True)  # Estado SUNAT: Activo, Baja definitiva
    domicile_condition: Mapped[str | None] = mapped_column(String(50), nullable=True)  # Condición Domicilio SUNAT: Habido, No habido
    
    # Representante Legal (opcional)
    legal_representative_name: Mapped[str | None] = mapped_column(String(200), nullable=True)  # Nombres del representante legal
    legal_representative_dni: Mapped[str | None] = mapped_column(String(20), nullable=True)  # DNI del representante legal
    legal_representative_position: Mapped[str | None] = mapped_column(String(100), nullable=True)  # Cargo del representante legal
    
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    users = relationship("User", secondary=user_companies, back_populates="companies")
    mailbox = relationship("ElectronicMailbox", back_populates="company", uselist=False)

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    user_type: Mapped[str] = mapped_column(String(30), default="SISCONT_INTERNAL")  # SISCONT_INTERNAL | COMPANY_USER
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)  # Mantener para compatibilidad
    role: Mapped[str] = mapped_column(String(50), default="OPERADOR")  # Cambiado a String para permitir roles dinámicos (compatibilidad)
    role_id: Mapped[int | None] = mapped_column(ForeignKey("roles.id"), nullable=True, index=True)  # FK a rol dinámico
    nombre: Mapped[str | None] = mapped_column(String(100), nullable=True)
    apellido: Mapped[str | None] = mapped_column(String(100), nullable=True)
    correo: Mapped[str | None] = mapped_column(String(255), nullable=True)
    foto: Mapped[str | None] = mapped_column(String(500), nullable=True)  # URL o path de la foto
    companies = relationship("Company", secondary=user_companies, back_populates="users")
    dynamic_role = relationship("Role", foreign_keys=[role_id], back_populates="users")

class Role(Base):
    """Roles dinámicos del sistema"""
    __tablename__ = "roles"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, index=True)  # Nombre del rol (ej: "ADMINISTRADOR", "CONTADOR")
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)  # Descripción del rol
    active: Mapped[bool] = mapped_column(Boolean, default=True)  # Si el rol está activo
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)  # Si es un rol del sistema (no se puede eliminar)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)
    permissions = relationship("RolePermission", back_populates="role", cascade="all, delete-orphan")
    users = relationship("User", foreign_keys=[User.role_id], back_populates="dynamic_role")

class RolePermission(Base):
    """Relación entre roles y permisos"""
    __tablename__ = "role_permissions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), index=True)
    permission: Mapped[str] = mapped_column(String(100), index=True)  # Código del permiso (ej: "dashboard.view")
    __table_args__ = (UniqueConstraint('role_id', 'permission', name='uq_role_permission'),)
    role = relationship("Role", back_populates="permissions")

class Account(Base):
    __tablename__ = "accounts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    code: Mapped[str] = mapped_column(String(20), index=True)
    name: Mapped[str] = mapped_column(String(200))
    level: Mapped[int] = mapped_column(Integer, default=4)
    # NATURALEZA CONTABLE REAL (la usa el motor de asientos)
    type: Mapped[AccountType] = mapped_column(Enum(AccountType), nullable=False)
    # CLASE / GRUPO PCGE (solo para agrupación y reportes normativos)
    class_code: Mapped[str | None] = mapped_column(String(2), nullable=True, index=True)  # "10", "40", "70"
    class_name: Mapped[str | None] = mapped_column(String(100), nullable=True)  # "Caja y Bancos", "Tributos", "Ventas"
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    __table_args__ = (UniqueConstraint('company_id','code', name='uq_company_account_code'),)

class ThirdParty(Base):
    __tablename__ = "third_parties"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    tax_id: Mapped[str] = mapped_column(String(20), index=True)  # RUC o DNI
    tax_id_type: Mapped[str] = mapped_column(String(3), default="6")  # Catálogo 06 SUNAT: 1=DNI, 4=Carnet Extranjería, 6=RUC, 7=Pasaporte, 0=Doc. Identidad Extranjero
    name: Mapped[str] = mapped_column(String(200))
    type: Mapped[str] = mapped_column(String(30), default="PROVEEDOR")  # CLIENTE/PROVEEDOR
    # Campos adicionales para normativa peruana
    commercial_name: Mapped[str | None] = mapped_column(String(200), nullable=True)  # Nombre comercial
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)  # Dirección completa (Domicilio fiscal)
    district: Mapped[str | None] = mapped_column(String(100), nullable=True)  # Distrito
    province: Mapped[str | None] = mapped_column(String(100), nullable=True)  # Provincia
    department: Mapped[str | None] = mapped_column(String(100), nullable=True)  # Departamento
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)  # Teléfono / Celular
    email: Mapped[str | None] = mapped_column(String(200), nullable=True)  # Email (para envío de comprobantes)
    website: Mapped[str | None] = mapped_column(String(200), nullable=True)  # Sitio web
    contact_person: Mapped[str | None] = mapped_column(String(200), nullable=True)  # Persona de contacto
    
    # Campos adicionales para SUNAT / PLE
    country_code: Mapped[str | None] = mapped_column(String(3), nullable=True, default="PE")  # País de residencia según Catálogo 18 SUNAT (PE=Perú)
    third_party_type: Mapped[str | None] = mapped_column(String(20), nullable=True)  # Tipo: Nacional, Extranjero, No domiciliado
    sunat_status: Mapped[str | None] = mapped_column(String(50), nullable=True)  # Estado SUNAT: Habido, No habido (solo para proveedores)
    
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)  # Notas adicionales
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)

class Period(Base):
    __tablename__ = "periods"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    year: Mapped[int] = mapped_column(Integer)
    month: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="ABIERTO")  # ABIERTO, CERRADO, REABIERTO
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)  # Fecha/hora de cierre
    closed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)  # Usuario que cerró
    reopened_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)  # Fecha/hora de reapertura
    reopened_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)  # Usuario que reabrió
    close_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)  # Motivo/justificación del cierre
    reopen_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)  # Motivo/justificación de reapertura

class JournalEntry(Base):
    __tablename__ = "journal_entries"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    date: Mapped[Date] = mapped_column(Date)
    period_id: Mapped[int] = mapped_column(ForeignKey("periods.id"))
    glosa: Mapped[str] = mapped_column(String(500), default="")  # Descripción del asiento
    currency: Mapped[str] = mapped_column(String(3), default="PEN")
    exchange_rate: Mapped[Numeric] = mapped_column(Numeric(12,6), default=1)
    origin: Mapped[str] = mapped_column(String(50), default="MANUAL")  # MOTOR, LEGACY, MANUAL
    status: Mapped[str] = mapped_column(String(20), default="DRAFT")  # DRAFT, POSTED, REVERSED, CANCELLED, VOIDED
    correlative: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)  # Correlativo estructurado: XX-XX-XXXXX
    motor_metadata: Mapped[Dict[str, Any] | None] = mapped_column(JSON, nullable=True)  # Trazabilidad: reglas_aplicadas, reglas_descartadas, hash_contexto
    
    # Trazabilidad tipo SAP
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)  # Usuario creador
    created_at: Mapped[datetime | None] = mapped_column(DateTime, default=datetime.now, nullable=True)  # Fecha/hora creación
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)  # Usuario que modificó
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now, nullable=True)  # Fecha/hora modificación
    posted_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)  # Usuario que posteó
    posted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)  # Fecha/hora de posteo
    reversed_entry_id: Mapped[int | None] = mapped_column(ForeignKey("journal_entries.id"), nullable=True, index=True)  # Asiento revertido (si aplica)
    reversed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)  # Usuario que revirtió
    reversed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)  # Fecha/hora de reversión
    integrity_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)  # Hash SHA-256 para integridad
    warning_confirmations: Mapped[Dict[str, Any] | None] = mapped_column(JSON, nullable=True)  # Confirmaciones de advertencias
    
    # Relaciones
    lines = relationship("EntryLine", back_populates="entry", cascade="all, delete-orphan")
    reversed_entry = relationship("JournalEntry", remote_side=[id], foreign_keys=[reversed_entry_id])
    creator = relationship("User", foreign_keys=[created_by])
    updater = relationship("User", foreign_keys=[updated_by])
    poster = relationship("User", foreign_keys=[posted_by])
    reverser = relationship("User", foreign_keys=[reversed_by])

class EntryLine(Base):
    __tablename__ = "entry_lines"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entry_id: Mapped[int] = mapped_column(ForeignKey("journal_entries.id"), index=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    third_party_id: Mapped[int | None] = mapped_column(ForeignKey("third_parties.id"), nullable=True)
    cost_center: Mapped[str | None] = mapped_column(String(50), nullable=True)
    debit: Mapped[Numeric] = mapped_column(Numeric(14,2), default=0)
    credit: Mapped[Numeric] = mapped_column(Numeric(14,2), default=0)
    memo: Mapped[str | None] = mapped_column(String(250))
    entry = relationship("JournalEntry", back_populates="lines")
    account = relationship("Account")

# ===== CONCILIACIÓN BANCARIA =====

class BankAccount(Base):
    """Cuenta bancaria asociada a una cuenta contable"""
    __tablename__ = "bank_accounts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)  # Cuenta contable (10.x)
    bank_name: Mapped[str] = mapped_column(String(100))  # Nombre del banco (ej: BCP, BBVA)
    account_number: Mapped[str] = mapped_column(String(50))  # Número de cuenta bancaria
    currency: Mapped[str] = mapped_column(String(3), default="PEN")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    account = relationship("Account")

class BankStatement(Base):
    """Extracto bancario cargado"""
    __tablename__ = "bank_statements"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bank_account_id: Mapped[int] = mapped_column(ForeignKey("bank_accounts.id"), index=True)
    period_id: Mapped[int] = mapped_column(ForeignKey("periods.id"), index=True)
    statement_date: Mapped[Date] = mapped_column(Date)  # Fecha del extracto
    opening_balance: Mapped[Numeric] = mapped_column(Numeric(14,2))  # Saldo inicial según banco
    closing_balance: Mapped[Numeric] = mapped_column(Numeric(14,2))  # Saldo final según banco
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    uploaded_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(20), default="PENDIENTE")  # PENDIENTE, EN_PROCESO, CONCILIADO
    bank_account = relationship("BankAccount")
    period = relationship("Period")
    transactions = relationship("BankTransaction", back_populates="statement", cascade="all, delete-orphan")

class BankTransaction(Base):
    """Transacciones del extracto bancario"""
    __tablename__ = "bank_transactions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    statement_id: Mapped[int] = mapped_column(ForeignKey("bank_statements.id"), index=True)
    transaction_date: Mapped[Date] = mapped_column(Date)
    description: Mapped[str] = mapped_column(String(500))
    reference: Mapped[str | None] = mapped_column(String(100), nullable=True)  # Número de cheque, transferencia, etc.
    debit: Mapped[Numeric] = mapped_column(Numeric(14,2), default=0)  # Cargo (retiros)
    credit: Mapped[Numeric] = mapped_column(Numeric(14,2), default=0)  # Abono (depósitos)
    balance: Mapped[Numeric] = mapped_column(Numeric(14,2))  # Saldo después de la transacción
    reconciled: Mapped[bool] = mapped_column(Boolean, default=False)  # Si está conciliado
    entry_line_id: Mapped[int | None] = mapped_column(ForeignKey("entry_lines.id"), nullable=True)  # Línea contable asociada
    statement = relationship("BankStatement", back_populates="transactions")

class BankReconciliation(Base):
    """Estado de conciliación bancaria por período"""
    __tablename__ = "bank_reconciliations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bank_account_id: Mapped[int] = mapped_column(ForeignKey("bank_accounts.id"), index=True)
    period_id: Mapped[int] = mapped_column(ForeignKey("periods.id"), index=True)
    statement_id: Mapped[int | None] = mapped_column(ForeignKey("bank_statements.id"), nullable=True)
    book_balance: Mapped[Numeric] = mapped_column(Numeric(14,2))  # Saldo según contabilidad
    bank_balance: Mapped[Numeric] = mapped_column(Numeric(14,2))  # Saldo según banco
    pending_debits: Mapped[Numeric] = mapped_column(Numeric(14,2), default=0)  # Cheques pendientes, etc.
    pending_credits: Mapped[Numeric] = mapped_column(Numeric(14,2), default=0)  # Depósitos en tránsito, etc.
    reconciled_balance: Mapped[Numeric] = mapped_column(Numeric(14,2))  # Saldo conciliado
    status: Mapped[str] = mapped_column(String(20), default="PENDIENTE")  # PENDIENTE, PARCIAL, CONCILIADO
    reconciled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reconciled_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    bank_account = relationship("BankAccount")
    period = relationship("Period")

class SystemSettings(Base):
    """Configuraciones del sistema por empresa"""
    __tablename__ = "system_settings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True, unique=True)
    # Formato numérico
    number_thousand_separator: Mapped[str] = mapped_column(String(1), default=",")  # , o .
    number_decimal_separator: Mapped[str] = mapped_column(String(1), default=".")  # . o ,
    number_decimal_places: Mapped[int] = mapped_column(Integer, default=2)  # 0-4
    currency_code: Mapped[str] = mapped_column(String(3), default="PEN")  # PEN, USD, EUR
    currency_symbol: Mapped[str] = mapped_column(String(5), default="S/")  # S/, $, €
    # Formato de fecha
    date_format: Mapped[str] = mapped_column(String(20), default="DD/MM/YYYY")  # DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD
    # IGV y impuestos
    default_igv_rate: Mapped[Numeric] = mapped_column(Numeric(5,2), default=18.00)  # Porcentaje IGV por defecto
    # Configuración de períodos
    fiscal_year_start_month: Mapped[int] = mapped_column(Integer, default=1)  # Mes de inicio del año fiscal (1-12)
    # Otros
    allow_edit_closed_periods: Mapped[bool] = mapped_column(Boolean, default=False)  # Permitir editar períodos cerrados
    auto_generate_journal_entries: Mapped[bool] = mapped_column(Boolean, default=True)  # Auto-generar asientos desde compras/ventas
    require_period_validation: Mapped[bool] = mapped_column(Boolean, default=True)  # Validar fechas dentro del período
    # Configuración adicional (JSON para flexibilidad)
    extra_settings: Mapped[Dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)
