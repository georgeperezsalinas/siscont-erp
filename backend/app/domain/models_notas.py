"""
Modelos de dominio para Notas de Crédito y Débito
Cumpliendo normativa SUNAT y arquitectura desacoplada
"""
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import Integer, String, Date, Numeric, ForeignKey, Enum, Boolean, DateTime, Text
from datetime import datetime, date
from enum import Enum as PyEnum
from .models import Base


class TipoNota(str, PyEnum):
    """Tipos de nota según SUNAT"""
    CREDITO = "CREDITO"  # Nota de Crédito
    DEBITO = "DEBITO"    # Nota de Débito


class OrigenNota(str, PyEnum):
    """Origen de la nota (módulo que la genera)"""
    VENTA = "VENTA"
    COMPRA = "COMPRA"


class EstadoNota(str, PyEnum):
    """Estado de la nota"""
    REGISTRADA = "REGISTRADA"
    ANULADA = "ANULADA"


class MotivoNotaCredito(str, PyEnum):
    """Motivos de Nota de Crédito según SUNAT"""
    ANULACION_OPERACION = "ANULACION_OPERACION"
    DEVOLUCION_TOTAL = "DEVOLUCION_TOTAL"
    DEVOLUCION_PARCIAL = "DEVOLUCION_PARCIAL"
    DESCUENTO_POSTERIOR = "DESCUENTO_POSTERIOR"
    ERROR_PRECIO = "ERROR_PRECIO"
    ERROR_CANTIDAD = "ERROR_CANTIDAD"


class MotivoNotaDebito(str, PyEnum):
    """Motivos de Nota de Débito según SUNAT"""
    INTERESES = "INTERESES"
    PENALIDADES = "PENALIDADES"
    INCREMENTO_VALOR = "INCREMENTO_VALOR"
    GASTOS_ADICIONALES = "GASTOS_ADICIONALES"


class NotaDocumento(Base):
    """
    Nota de Crédito o Débito
    
    Principios:
    - NO edita asientos existentes
    - Genera NUEVOS asientos
    - Referencia obligatoria al documento original
    - Puede afectar inventario (según motivo)
    - Usa Motor de Asientos (no lógica propia)
    """
    __tablename__ = "nota_documentos"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    
    # Tipo y origen
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)  # TipoNota (CREDITO | DEBITO)
    origen: Mapped[str] = mapped_column(String(20), nullable=False)  # OrigenNota (VENTA | COMPRA)
    
    # Referencia al documento original
    documento_ref_id: Mapped[int] = mapped_column(Integer, index=True)  # FK a Sale o Purchase
    documento_ref_tipo: Mapped[str] = mapped_column(String(20), nullable=False)  # "VENTA" o "COMPRA"
    
    # Numeración SUNAT
    serie: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    numero: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    fecha_emision: Mapped[Date] = mapped_column(Date, nullable=False, index=True)
    
    # Motivo (según SUNAT)
    motivo: Mapped[str] = mapped_column(String(50), nullable=False)  # MotivoNotaCredito o MotivoNotaDebito
    
    # Montos
    monto_base: Mapped[Numeric] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    igv: Mapped[Numeric] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    total: Mapped[Numeric] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    
    # Afecta inventario (para devoluciones, etc.)
    afecta_inventario: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    
    # Estado
    estado: Mapped[str] = mapped_column(String(20), default=EstadoNota.REGISTRADA.value, nullable=False)
    
    # Trazabilidad contable
    journal_entry_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    
    # Auditoría
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    
    # Relaciones
    detalles = relationship("NotaDetalle", back_populates="nota", cascade="all, delete-orphan")
    company = relationship("Company")


class NotaDetalle(Base):
    """
    Detalle de una Nota (productos/servicios afectados)
    
    Solo se usa cuando la nota afecta inventario o cuando se necesita
    detalle por producto (devoluciones parciales, errores de cantidad, etc.)
    """
    __tablename__ = "nota_detalles"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nota_id: Mapped[int] = mapped_column(ForeignKey("nota_documentos.id"), index=True, nullable=False)
    
    # Producto (opcional, solo si afecta inventario)
    producto_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"), nullable=True, index=True)
    
    # Cantidad y costo (para inventario)
    cantidad: Mapped[Numeric | None] = mapped_column(Numeric(12, 4), nullable=True)
    costo_unitario: Mapped[Numeric | None] = mapped_column(Numeric(14, 2), nullable=True)
    costo_total: Mapped[Numeric | None] = mapped_column(Numeric(14, 2), nullable=True)
    
    # Descripción adicional
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Relaciones
    nota = relationship("NotaDocumento", back_populates="detalles")
    producto = relationship("Product")

