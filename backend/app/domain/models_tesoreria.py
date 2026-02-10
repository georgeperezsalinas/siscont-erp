"""
Modelos del Dominio - Módulo de Tesorería

Principios:
- Tesorería NO genera ingresos ni gastos
- Tesorería solo liquida CxC y CxP
- Tesorería es el único módulo que mueve CAJA y BANCO
"""
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Text, Numeric, DateTime, Enum as SQLEnum, Date, UniqueConstraint
from datetime import datetime
from sqlalchemy.orm import relationship, Mapped, mapped_column
from enum import Enum
from ..db import Base


class TipoMovimientoTesoreria(str, Enum):
    """Tipos de movimientos de tesorería"""
    COBRO = "COBRO"  # Cobro de clientes
    PAGO = "PAGO"    # Pago a proveedores
    TRANSFERENCIA = "TRANSFERENCIA"  # Transferencia entre cuentas


class TipoReferencia(str, Enum):
    """Tipos de documentos de referencia"""
    VENTA = "VENTA"
    COMPRA = "COMPRA"
    # Futuro: NOTA_CREDITO, NOTA_DEBITO, etc.


class EstadoMovimiento(str, Enum):
    """Estados de un movimiento de tesorería"""
    PENDIENTE = "PENDIENTE"
    REGISTRADO = "REGISTRADO"
    ANULADO = "ANULADO"


class MovimientoTesoreria(Base):
    """
    Movimiento de Tesorería
    
    Representa un cobro, pago o transferencia que liquida CxC o CxP.
    NO genera ingresos ni gastos, solo liquida cuentas por cobrar/pagar.
    """
    __tablename__ = "movimientos_tesoreria"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    
    # Tipo de movimiento
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)  # TipoMovimientoTesoreria
    
    # Referencia al documento origen (VENTA o COMPRA)
    referencia_tipo: Mapped[str] = mapped_column(String(20), nullable=False)  # TipoReferencia
    referencia_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)  # ID de Venta o Compra
    
    # Monto y fecha
    monto: Mapped[Numeric] = mapped_column(Numeric(12, 2), nullable=False)
    fecha: Mapped[Date] = mapped_column(Date, nullable=False)
    
    # Método de pago
    metodo_pago_id: Mapped[int] = mapped_column(ForeignKey("metodos_pago.id"), nullable=False)
    
    # Estado
    estado: Mapped[str] = mapped_column(String(20), default="REGISTRADO")  # EstadoMovimiento
    
    # Referencia al asiento contable generado
    journal_entry_id: Mapped[int | None] = mapped_column(ForeignKey("journal_entries.id"), nullable=True, index=True)
    
    # Glosa/descripción
    glosa: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Auditoría
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    
    # Relaciones
    company = relationship("Company")
    metodo_pago = relationship("MetodoPago")
    journal_entry = relationship("JournalEntry", foreign_keys=[journal_entry_id])
    created_by = relationship("User", foreign_keys=[created_by_id])


class MetodoPago(Base):
    """
    Método de Pago
    
    Define los métodos de pago disponibles (EFECTIVO, TRANSFERENCIA, YAPE, etc.)
    y a qué cuenta impacta (CAJA o BANCO).
    """
    __tablename__ = "metodos_pago"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    
    # Código único del método (EFECTIVO, TRANSFERENCIA, YAPE, PLIN, TARJETA)
    # Único por empresa, no globalmente
    codigo: Mapped[str] = mapped_column(String(50), nullable=False)
    
    # Descripción
    descripcion: Mapped[str] = mapped_column(String(200), nullable=False)
    
    # Impacta en CAJA o BANCO
    impacta_en: Mapped[str] = mapped_column(String(10), nullable=False)  # "CAJA" o "BANCO"
    
    # Estado
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    
    # Auditoría
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    # Relaciones
    company = relationship("Company")
    movimientos = relationship("MovimientoTesoreria", back_populates="metodo_pago")
    
    # Restricción única: (company_id, codigo) - permite el mismo código en diferentes empresas
    __table_args__ = (UniqueConstraint('company_id', 'codigo', name='uq_company_metodo_pago_codigo'),)

