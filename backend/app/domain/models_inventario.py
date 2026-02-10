"""
Modelos del Dominio de Inventario
==================================

Entidades del módulo de inventario según requisitos:
- Producto (actualizado con maneja_stock)
- Almacén
- Stock (por producto y almacén)
- MovimientoInventario (actualizado con almacen_id y tipo AJUSTE)
"""
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Numeric, Date, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship, Mapped, mapped_column
from datetime import datetime, date
from ..db import Base


class Almacen(Base):
    """
    Almacén/Depósito
    Permite manejar múltiples ubicaciones de inventario
    """
    __tablename__ = "almacenes"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(Integer, index=True)
    codigo: Mapped[str] = mapped_column(String(50), index=True)
    nombre: Mapped[str] = mapped_column(String(200))
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    
    UniqueConstraint('company_id', 'codigo', name='uq_almacen_company_codigo')
    
    # Relaciones
    stocks = relationship("Stock", back_populates="almacen")
    movimientos = relationship("MovimientoInventario", back_populates="almacen")


class Stock(Base):
    """
    Stock por Producto y Almacén
    Mantiene la cantidad actual y costo promedio por ubicación
    """
    __tablename__ = "stocks"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(Integer, index=True)
    producto_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    almacen_id: Mapped[int] = mapped_column(ForeignKey("almacenes.id"), index=True)
    cantidad_actual: Mapped[Numeric] = mapped_column(Numeric(12, 4), default=0)  # Cantidad con decimales
    costo_promedio: Mapped[Numeric] = mapped_column(Numeric(14, 2), default=0)  # Costo promedio ponderado
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    UniqueConstraint('company_id', 'producto_id', 'almacen_id', name='uq_stock_producto_almacen')
    
    # Relaciones
    producto = relationship("Product", back_populates="stocks")
    almacen = relationship("Almacen", back_populates="stocks")

