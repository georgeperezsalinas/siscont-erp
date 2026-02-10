from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import Integer, String, Date, Numeric, ForeignKey, Enum, UniqueConstraint, Boolean, DateTime, Text
from datetime import datetime, date
from typing import TYPE_CHECKING
from .models import Base
from .enums import AccountType

if TYPE_CHECKING:
    from .models_inventario import Almacen, Stock

class CostCenter(Base):
    __tablename__ = "cost_centers"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(Integer, index=True)
    code: Mapped[str] = mapped_column(String(20), index=True)
    name: Mapped[str] = mapped_column(String(120))

class ExchangeRate(Base):
    __tablename__ = "exchange_rates"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    date: Mapped[Date] = mapped_column(Date, index=True)
    currency: Mapped[str] = mapped_column(String(3), index=True)  # e.g. USD
    buy: Mapped[Numeric] = mapped_column(Numeric(12,6))
    sell: Mapped[Numeric] = mapped_column(Numeric(12,6))

class DocumentType(Base):
    __tablename__ = "document_types"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(3), unique=True)  # SUNAT code (e.g. 01, 03)
    name: Mapped[str] = mapped_column(String(120))

class Purchase(Base):
    __tablename__ = "purchases"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(Integer, index=True)
    doc_type: Mapped[str] = mapped_column(String(3))  # SUNAT doc type
    series: Mapped[str] = mapped_column(String(10))
    number: Mapped[str] = mapped_column(String(20))
    issue_date: Mapped[Date] = mapped_column(Date)
    supplier_id: Mapped[int] = mapped_column(Integer, index=True)  # FK to ThirdParty (simplificado)
    currency: Mapped[str] = mapped_column(String(3), default="PEN")
    base_amount: Mapped[Numeric] = mapped_column(Numeric(14,2), default=0)
    igv_amount: Mapped[Numeric] = mapped_column(Numeric(14,2), default=0)
    total_amount: Mapped[Numeric] = mapped_column(Numeric(14,2), default=0)
    glosa: Mapped[str | None] = mapped_column(String(500), nullable=True)  # Glosa personalizada
    journal_entry_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    lines = relationship("PurchaseLine", back_populates="purchase", cascade="all, delete-orphan")

class PurchaseLine(Base):
    """
    Línea de detalle de una compra (factura con múltiples productos/servicios)
    """
    __tablename__ = "purchase_lines"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    purchase_id: Mapped[int] = mapped_column(ForeignKey("purchases.id", ondelete="CASCADE"), index=True)
    line_number: Mapped[int] = mapped_column(Integer, default=1)  # Número de línea (1, 2, 3, ...)
    description: Mapped[str] = mapped_column(String(500))  # Descripción del producto/servicio
    quantity: Mapped[Numeric] = mapped_column(Numeric(12,4), default=1)  # Cantidad
    unit_price: Mapped[Numeric] = mapped_column(Numeric(14,4))  # Precio unitario
    base_amount: Mapped[Numeric] = mapped_column(Numeric(14,2))  # quantity * unit_price (redondeado)
    igv_amount: Mapped[Numeric] = mapped_column(Numeric(14,2))  # base_amount * 0.18 (redondeado)
    total_amount: Mapped[Numeric] = mapped_column(Numeric(14,2))  # base_amount + igv_amount
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"), nullable=True, index=True)  # Producto de inventario (opcional)
    purchase = relationship("Purchase", back_populates="lines")
    product = relationship("Product")

class Sale(Base):
    __tablename__ = "sales"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(Integer, index=True)
    doc_type: Mapped[str] = mapped_column(String(3))  # SUNAT
    series: Mapped[str] = mapped_column(String(10))
    number: Mapped[str] = mapped_column(String(20))
    issue_date: Mapped[Date] = mapped_column(Date)
    customer_id: Mapped[int] = mapped_column(Integer, index=True)  # FK to ThirdParty (simplificado)
    currency: Mapped[str] = mapped_column(String(3), default="PEN")
    base_amount: Mapped[Numeric] = mapped_column(Numeric(14,2), default=0)
    igv_amount: Mapped[Numeric] = mapped_column(Numeric(14,2), default=0)
    total_amount: Mapped[Numeric] = mapped_column(Numeric(14,2), default=0)
    # Campos de detracción
    detraction_rate: Mapped[Numeric | None] = mapped_column(Numeric(5,2), nullable=True, default=0)  # Tasa de detracción (ej: 12.00 para 12%)
    detraction_amount: Mapped[Numeric | None] = mapped_column(Numeric(14,2), nullable=True, default=0)  # Monto de detracción
    net_amount: Mapped[Numeric | None] = mapped_column(Numeric(14,2), nullable=True)  # Monto neto a recibir (total_amount - detraction_amount)
    glosa: Mapped[str | None] = mapped_column(String(500), nullable=True)  # Glosa personalizada
    journal_entry_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    lines = relationship("SaleLine", back_populates="sale", cascade="all, delete-orphan")

class SaleLine(Base):
    """
    Línea de detalle de una venta (factura con múltiples productos/servicios)
    """
    __tablename__ = "sale_lines"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id", ondelete="CASCADE"), index=True)
    line_number: Mapped[int] = mapped_column(Integer, default=1)  # Número de línea (1, 2, 3, ...)
    description: Mapped[str] = mapped_column(String(500))  # Descripción del producto/servicio
    quantity: Mapped[Numeric] = mapped_column(Numeric(12,4), default=1)  # Cantidad
    unit_price: Mapped[Numeric] = mapped_column(Numeric(14,4))  # Precio unitario
    base_amount: Mapped[Numeric] = mapped_column(Numeric(14,2))  # quantity * unit_price (redondeado)
    igv_amount: Mapped[Numeric] = mapped_column(Numeric(14,2))  # base_amount * 0.18 (redondeado)
    total_amount: Mapped[Numeric] = mapped_column(Numeric(14,2))  # base_amount + igv_amount
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"), nullable=True, index=True)  # Producto de inventario (opcional)
    sale = relationship("Sale", back_populates="lines")
    product = relationship("Product")

class DetractionUsage(Base):
    """
    Registro de uso de detracciones para pagar IGV.
    Las detracciones se pueden usar para pagar el IGV que la empresa debe a SUNAT.
    """
    __tablename__ = "detraction_usage"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(Integer, index=True)
    usage_date: Mapped[Date] = mapped_column(Date, index=True)
    amount: Mapped[Numeric] = mapped_column(Numeric(14,2))  # Monto de detracción usado
    journal_entry_id: Mapped[int] = mapped_column(Integer, index=True)  # FK a JournalEntry
    period_reference: Mapped[str | None] = mapped_column(String(7), nullable=True)  # Período al que corresponde (ej: "2025-01")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)  # Observaciones
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

class Product(Base):
    """
    Producto/Artículo de Inventario
    Según PCGE peruano, cada producto debe tener:
    - Código único por empresa
    - Unidad de medida (UN, KG, M2, etc.)
    - Cuenta contable de inventario (20.x según PCGE)
    - maneja_stock: indica si el producto requiere control de inventario
    """
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(Integer, index=True)
    code: Mapped[str] = mapped_column(String(50), index=True)  # Código del producto
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    unit_of_measure: Mapped[str] = mapped_column(String(10), default="UN")  # UN, KG, M2, L, etc.
    account_code: Mapped[str] = mapped_column(String(20), default="20.10")  # Cuenta PCGE de inventario
    maneja_stock: Mapped[bool] = mapped_column(Boolean, default=True)  # Si requiere control de inventario
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    UniqueConstraint('company_id', 'code', name='uq_product_company_code')
    
    # Relaciones
    stocks = relationship("Stock", back_populates="producto", cascade="all, delete-orphan")
    movimientos = relationship("MovimientoInventario", back_populates="product")

class MovimientoInventario(Base):
    """
    Movimiento de Inventario
    Según metodología contable peruana:
    - ENTRADA: Incrementa inventario (compra, producción, ajuste positivo)
    - SALIDA: Decrementa inventario (venta, consumo, ajuste negativo, merma)
    - AJUSTE: Ajuste de inventario (sobrante o faltante)
    Cada movimiento genera su asiento contable automático.
    """
    __tablename__ = "inventory_movements"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(Integer, index=True)
    tipo: Mapped[str] = mapped_column("movement_type", String(20))  # "ENTRADA" | "SALIDA" | "AJUSTE" - Mapea a movement_type (BD)
    producto_id: Mapped[int] = mapped_column("product_id", ForeignKey("products.id"), index=True)  # Mapea producto_id (Python) a product_id (BD)
    almacen_id: Mapped[int | None] = mapped_column(ForeignKey("almacenes.id"), nullable=True, index=True)  # Almacén (opcional para compatibilidad)
    cantidad: Mapped[Numeric] = mapped_column("quantity", Numeric(12, 4))  # Cantidad - Mapea a quantity (BD)
    costo_unitario: Mapped[Numeric] = mapped_column("unit_cost", Numeric(14, 2))  # Costo unitario - Mapea a unit_cost (BD)
    costo_total: Mapped[Numeric] = mapped_column("total_cost", Numeric(14, 2))  # Cantidad * costo_unitario - Mapea a total_cost (BD)
    fecha: Mapped[Date] = mapped_column("movement_date", Date, index=True)  # Fecha - Mapea a movement_date (BD)
    referencia_tipo: Mapped[str | None] = mapped_column("reference_type", String(50), nullable=True)  # "COMPRA", "VENTA", "AJUSTE", "MANUAL"
    referencia_id: Mapped[int | None] = mapped_column("reference_id", Integer, nullable=True)  # ID del documento relacionado
    glosa: Mapped[str | None] = mapped_column(String(500), nullable=True)
    journal_entry_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # Asiento contable generado
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    
    # Relaciones
    product = relationship("Product", back_populates="movimientos")
    almacen = relationship("Almacen", back_populates="movimientos", foreign_keys=[almacen_id])
    
    # Aliases para compatibilidad con código existente
    @property
    def movement_type(self) -> str:
        """Alias para compatibilidad"""
        return self.tipo
    
    @property
    def quantity(self) -> Numeric:
        """Alias para compatibilidad"""
        return self.cantidad
    
    @property
    def unit_cost(self) -> Numeric:
        """Alias para compatibilidad"""
        return self.costo_unitario
    
    @property
    def total_cost(self) -> Numeric:
        """Alias para compatibilidad"""
        return self.costo_total
    
    @property
    def movement_date(self) -> Date:
        """Alias para compatibilidad"""
        return self.fecha
    
    @property
    def reference_type(self) -> str | None:
        """Alias para compatibilidad"""
        return self.referencia_tipo
    
    @property
    def reference_id(self) -> int | None:
        """Alias para compatibilidad"""
        return self.referencia_id
    
    @property
    def reference(self) -> str | None:
        """Alias para compatibilidad - genera referencia desde tipo e id"""
        if self.referencia_tipo and self.referencia_id:
            return f"{self.referencia_tipo} {self.referencia_id}"
        return None


# Alias para compatibilidad con código existente
# Mantener InventoryMovement como alias para no romper código existente
InventoryMovement = MovimientoInventario
