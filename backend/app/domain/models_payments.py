"""
Modelos para Gestión de Pagos y Cobros
========================================

Rastrea los pagos realizados a proveedores y los cobros recibidos de clientes.
Permite pagos parciales y múltiples pagos por factura.
"""
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import Integer, String, Date, Numeric, ForeignKey, Enum, DateTime, Text
from datetime import datetime, date
from .models import Base

class PaymentTransaction(Base):
    """
    Transacción de pago o cobro
    
    Puede ser:
    - Pago a proveedor (relacionado con Purchase)
    - Cobro de cliente (relacionado con Sale)
    """
    __tablename__ = "payment_transactions"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(Integer, index=True)
    
    # Tipo de transacción
    transaction_type: Mapped[str] = mapped_column(String(20))  # 'PAYMENT' o 'COLLECTION'
    
    # Relación con la factura (compra o venta)
    purchase_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("purchases.id"), nullable=True, index=True)
    sale_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("sales.id"), nullable=True, index=True)
    
    # Detalles del pago/cobro
    payment_date: Mapped[Date] = mapped_column(Date, index=True)
    amount: Mapped[Numeric] = mapped_column(Numeric(14, 2))  # Monto pagado/cobrado
    currency: Mapped[str] = mapped_column(String(3), default="PEN")
    
    # Cuenta de caja/banco utilizada
    cash_account_code: Mapped[str] = mapped_column(String(20), default="10.10")  # Por defecto Caja
    
    # Referencia del pago (número de cheque, transferencia, etc.)
    payment_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    payment_method: Mapped[str] = mapped_column(String(50), default="EFECTIVO")  # EFECTIVO, TRANSFERENCIA, CHEQUE, etc.
    
    # Observaciones
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Asiento contable generado
    journal_entry_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("journal_entries.id"), nullable=True, index=True)
    
    # Auditoría
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    
    # Relaciones
    purchase = relationship("Purchase", foreign_keys=[purchase_id])
    sale = relationship("Sale", foreign_keys=[sale_id])
    journal_entry = relationship("JournalEntry", foreign_keys=[journal_entry_id])

