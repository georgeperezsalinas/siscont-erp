"""
Modelos para el Motor de Asientos Contables
Sistema basado en eventos y reglas configurables
"""
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Text, JSON, UniqueConstraint, DateTime, Float, Enum as SQLEnum
from datetime import datetime
from sqlalchemy.orm import relationship, Mapped, mapped_column
from enum import Enum
from ..db import Base

class EventoContableType(str, Enum):
    """Tipos de eventos contables"""
    COMPRA = "COMPRA"
    VENTA = "VENTA"
    PAGO = "PAGO"
    COBRO = "COBRO"
    # Eventos de Tesorería (específicos por método de pago)
    COBRO_CAJA = "COBRO_CAJA"
    COBRO_BANCO = "COBRO_BANCO"
    PAGO_CAJA = "PAGO_CAJA"
    PAGO_BANCO = "PAGO_BANCO"
    TRANSFERENCIA = "TRANSFERENCIA"
    # Notas de Crédito y Débito
    NOTA_CREDITO_VENTA = "NOTA_CREDITO_VENTA"
    NOTA_DEBITO_VENTA = "NOTA_DEBITO_VENTA"
    NOTA_CREDITO_COMPRA = "NOTA_CREDITO_COMPRA"
    NOTA_DEBITO_COMPRA = "NOTA_DEBITO_COMPRA"
    # Otros eventos
    AJUSTE_INVENTARIO = "AJUSTE_INVENTARIO"
    ENTRADA_INVENTARIO = "ENTRADA_INVENTARIO"
    SALIDA_INVENTARIO = "SALIDA_INVENTARIO"
    DEPRECIACION = "DEPRECIACION"
    AJUSTE_CONTABLE = "AJUSTE_CONTABLE"
    CIERRE_ANUAL = "CIERRE_ANUAL"
    # Planillas (registro contable, no cálculo)
    PLANILLA_PROVISION = "PLANILLA_PROVISION"

class TipoCuentaContable(str, Enum):
    """Tipos de cuentas contables (abstracción, no códigos hardcodeados)"""
    # Activos
    CAJA = "CAJA"
    BANCO = "BANCO"
    CLIENTES = "CLIENTES"
    INVENTARIO = "INVENTARIO"
    ACTIVO_FIJO = "ACTIVO_FIJO"
    
    # Pasivos
    PROVEEDORES = "PROVEEDORES"
    IGV_CREDITO = "IGV_CREDITO"
    IGV_DEBITO = "IGV_DEBITO"
    DETRACCIONES = "DETRACCIONES"
    
    # Patrimonio
    CAPITAL = "CAPITAL"
    RESERVAS = "RESERVAS"
    RESULTADOS = "RESULTADOS"
    
    # Ingresos
    INGRESO_VENTAS = "INGRESO_VENTAS"
    INGRESO_OTROS = "INGRESO_OTROS"
    
    # Gastos
    GASTO_COMPRAS = "GASTO_COMPRAS"
    GASTO_VENTAS = "GASTO_VENTAS"
    GASTO_PERSONAL = "GASTO_PERSONAL"  # Planillas - 62.10 Remuneraciones
    COSTO_VENTAS = "COSTO_VENTAS"
    GASTO_OTROS = "GASTO_OTROS"

    # Pasivos - Planillas
    REMUNERACIONES_POR_PAGAR = "REMUNERACIONES_POR_PAGAR"  # 41.10
    TRIBUTOS_POR_PAGAR = "TRIBUTOS_POR_PAGAR"  # 40.20 Laborales
    APORTES_POR_PAGAR = "APORTES_POR_PAGAR"  # 46.10

class LadoAsiento(str, Enum):
    """Lado del asiento contable"""
    DEBE = "DEBE"
    HABER = "HABER"

class TipoMonto(str, Enum):
    """Tipo de monto a calcular"""
    BASE = "BASE"  # Base imponible
    IGV = "IGV"  # IGV (18% en Perú)
    TOTAL = "TOTAL"  # Total (base + IGV)
    DESCUENTO = "DESCUENTO"  # Descuento
    COSTO = "COSTO"  # Costo
    CANTIDAD = "CANTIDAD"  # Cantidad (para inventario)
    # Planillas
    TOTAL_GASTO = "TOTAL_GASTO"  # Gasto total planilla
    NETO_TRABAJADOR = "NETO_TRABAJADOR"  # Neto a pagar al trabajador
    DESCUENTOS_TRABAJADOR = "DESCUENTOS_TRABAJADOR"  # Tributos descontados (AFP, ONP, IR)
    APORTES_EMPLEADOR = "APORTES_EMPLEADOR"  # Aportes del empleador (AFP, Seguro)

class EventoContable(Base):
    """
    Eventos contables que disparan la generación de asientos
    
    Arquitectura:
    - Eventos GENERALES: Transversales a todos los módulos (COMPRA, VENTA, PAGO, COBRO)
    - Eventos por MÓDULO: Específicos de un módulo (COBRO_CAJA, PAGO_BANCO → TESORERIA)
    
    El campo 'categoria' permite identificar el origen/organización del evento:
    - null o 'GENERAL': Eventos transversales
    - 'TESORERIA': Eventos del módulo de Tesorería
    - 'INVENTARIO': Eventos del módulo de Inventario
    - 'COMPRAS': Eventos específicos de Compras
    - 'VENTAS': Eventos específicos de Ventas
    """
    __tablename__ = "eventos_contables"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    tipo: Mapped[str] = mapped_column(String(50), nullable=False)  # EventoContableType
    nombre: Mapped[str] = mapped_column(String(200), nullable=False)  # Nombre descriptivo
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    categoria: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)  # GENERAL, TESORERIA, INVENTARIO, COMPRAS, VENTAS
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    company = relationship("Company")
    reglas = relationship("ReglaContable", back_populates="evento", cascade="all, delete-orphan")

class ReglaContable(Base):
    """Reglas contables que definen cómo generar asientos para cada evento"""
    __tablename__ = "reglas_contables"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    evento_id: Mapped[int] = mapped_column(ForeignKey("eventos_contables.id"), index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    
    # Condición para aplicar la regla (expresión Python evaluable)
    # Ejemplo: "afecta_stock == True", "tipo_documento == 'FACTURA'"
    condicion: Mapped[str | None] = mapped_column(Text, nullable=True)  # None = siempre aplica
    
    # Lado del asiento
    lado: Mapped[str] = mapped_column(String(10), nullable=False)  # LadoAsiento (DEBE/HABER)
    
    # Tipo de cuenta contable (abstracción)
    tipo_cuenta: Mapped[str] = mapped_column(String(50), nullable=False)  # TipoCuentaContable
    
    # Tipo de monto a calcular
    tipo_monto: Mapped[str] = mapped_column(String(50), nullable=False)  # TipoMonto
    
    # Orden de aplicación (para múltiples reglas)
    orden: Mapped[int] = mapped_column(Integer, default=0)
    
    # Configuración adicional (JSON)
    config: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # Parámetros adicionales
    
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    evento = relationship("EventoContable", back_populates="reglas")
    company = relationship("Company")

class TipoCuentaMapeo(Base):
    """Mapeo de TipoCuentaContable a cuenta contable real por empresa"""
    __tablename__ = "tipo_cuenta_mapeos"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), index=True)
    tipo_cuenta: Mapped[str] = mapped_column(String(50), nullable=False)  # TipoCuentaContable
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), nullable=False)  # Cuenta real
    
    # Configuración adicional
    config: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # Parámetros específicos
    
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    company = relationship("Company")
    account = relationship("Account")
    
    __table_args__ = (UniqueConstraint('company_id', 'tipo_cuenta', name='uq_company_tipo_cuenta'),)

