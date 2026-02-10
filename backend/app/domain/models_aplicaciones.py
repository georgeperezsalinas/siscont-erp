"""
Modelos de dominio para Aplicación de Cobros y Pagos a Documentos

Principios:
- La aplicación NO genera asientos
- La aplicación NO modifica asientos existentes
- Las notas NO se cobran ni pagan (solo facturas)
- Un cobro puede aplicarse a múltiples documentos
- Un documento puede pagarse en múltiples cobros
"""
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import Integer, String, Date, Numeric, ForeignKey, DateTime, Index
from datetime import datetime, date
from enum import Enum as PyEnum
from .models import Base


class TipoDocumentoAplicacion(str, PyEnum):
    """Tipos de documentos que pueden recibir aplicación de cobros/pagos"""
    FACTURA = "FACTURA"  # Factura de venta o compra
    # NOTA_CREDITO y NOTA_DEBITO NO se aplican según las reglas


class AplicacionDocumento(Base):
    """
    Aplicación de un cobro/pago a un documento específico.
    
    Permite rastrear qué documentos se cancelan con qué cobros/pagos,
    permitiendo pagos parciales y múltiples aplicaciones.
    
    Reglas:
    - NO genera asientos contables
    - NO modifica asientos existentes
    - Solo se aplica a FACTURAS (ventas/compras), NO a notas
    - Un movimiento de tesorería puede tener múltiples aplicaciones
    - Un documento puede tener múltiples aplicaciones
    """
    __tablename__ = "aplicacion_documentos"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    
    # Referencia al movimiento de tesorería (cobro o pago)
    movimiento_tesoreria_id: Mapped[int] = mapped_column(
        ForeignKey("movimientos_tesoreria.id"), 
        nullable=False, 
        index=True
    )
    
    # Tipo de documento (solo FACTURA según las reglas)
    tipo_documento: Mapped[str] = mapped_column(String(20), nullable=False)  # TipoDocumentoAplicacion.FACTURA
    
    # ID del documento (venta_id o compra_id)
    documento_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    
    # Monto aplicado a este documento
    monto_aplicado: Mapped[Numeric] = mapped_column(Numeric(12, 2), nullable=False)
    
    # Fecha de aplicación
    fecha: Mapped[Date] = mapped_column(Date, nullable=False, default=date.today)
    
    # Auditoría
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    
    # Relaciones
    company = relationship("Company")
    movimiento_tesoreria = relationship("MovimientoTesoreria", foreign_keys=[movimiento_tesoreria_id])
    created_by = relationship("User", foreign_keys=[created_by_id])
    
    # Índices para búsquedas frecuentes
    __table_args__ = (
        Index('idx_aplicacion_documento', 'tipo_documento', 'documento_id'),
        Index('idx_aplicacion_movimiento', 'movimiento_tesoreria_id'),
    )
