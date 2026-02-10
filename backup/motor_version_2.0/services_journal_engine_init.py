"""
Servicio para inicializar eventos y reglas contables predeterminadas
"""
from sqlalchemy.orm import Session
from ..domain.models_journal_engine import (
    EventoContable, ReglaContable, TipoCuentaMapeo,
    EventoContableType, TipoCuentaContable, LadoAsiento, TipoMonto
)
from ..domain.models import Account

ENGINE_VERSION = "1.2"
DEFAULT_RULE_CONFIG = {
    "system_rule": True,
    "engine_version": ENGINE_VERSION
}




def inicializar_eventos_y_reglas_predeterminadas(db: Session, company_id: int):
    """
    Inicializa eventos y reglas contables predeterminadas para una empresa.
    
    Crea:
    1. Eventos contables básicos (COMPRA, VENTA, PAGO, COBRO)
    2. Reglas para cada evento
    3. Mapeos de tipos de cuenta (requiere que el usuario los configure después)
    """
    
    # ===== EVENTO: COMPRA =====
    evento_compra = db.query(EventoContable).filter(
        EventoContable.tipo == EventoContableType.COMPRA.value,
        EventoContable.company_id == company_id
    ).first()
    
    if not evento_compra:
        evento_compra = EventoContable(
            company_id=company_id,
            tipo=EventoContableType.COMPRA.value,
            nombre="Compra de Bienes/Servicios",
            descripcion="Registra compras de bienes o servicios con IGV",
            categoria="GENERAL",  # Evento transversal
            activo=True
        )
        db.add(evento_compra)
        db.flush()
        
        # Reglas para COMPRA
        reglas_compra = [
            ReglaContable(
                evento_id=evento_compra.id,
                company_id=company_id,
                condicion=None,  # Siempre aplica
                lado=LadoAsiento.DEBE.value,
                tipo_cuenta=TipoCuentaContable.GASTO_COMPRAS.value,
                tipo_monto=TipoMonto.BASE.value,
                orden=1,
                config=DEFAULT_RULE_CONFIG,
                activo=True
            ),
            ReglaContable(
                evento_id=evento_compra.id,
                company_id=company_id,
                condicion=None,
                lado=LadoAsiento.DEBE.value,
                tipo_cuenta=TipoCuentaContable.IGV_CREDITO.value,
                tipo_monto=TipoMonto.IGV.value,
                orden=2,
                config={"igv_rate": 0.18, **DEFAULT_RULE_CONFIG},
                activo=True
            ),
            ReglaContable(
                evento_id=evento_compra.id,
                company_id=company_id,
                condicion=None,
                lado=LadoAsiento.HABER.value,
                tipo_cuenta=TipoCuentaContable.PROVEEDORES.value,
                tipo_monto=TipoMonto.TOTAL.value,
                orden=3,
                config={"igv_rate": 0.18, **DEFAULT_RULE_CONFIG},
                activo=True
            )
        ]
        db.add_all(reglas_compra)
    
    # ===== EVENTO: VENTA =====
    evento_venta = db.query(EventoContable).filter(
        EventoContable.tipo == EventoContableType.VENTA.value,
        EventoContable.company_id == company_id
    ).first()
    
    if not evento_venta:
        evento_venta = EventoContable(
            company_id=company_id,
            tipo=EventoContableType.VENTA.value,
            nombre="Venta de Bienes/Servicios",
            descripcion="Registra ventas de bienes o servicios con IGV",
            categoria="GENERAL",  # Evento transversal
            activo=True
        )
        db.add(evento_venta)
        db.flush()
        
        # Reglas para VENTA
        reglas_venta = [
            ReglaContable(
                evento_id=evento_venta.id,
                company_id=company_id,
                condicion=None,
                lado=LadoAsiento.DEBE.value,
                tipo_cuenta=TipoCuentaContable.CLIENTES.value,
                tipo_monto=TipoMonto.TOTAL.value,
                orden=1,
                config={"igv_rate": 0.18, **DEFAULT_RULE_CONFIG},
                activo=True
            ),
            ReglaContable(
                evento_id=evento_venta.id,
                company_id=company_id,
                condicion=None,
                lado=LadoAsiento.HABER.value,
                tipo_cuenta=TipoCuentaContable.INGRESO_VENTAS.value,
                tipo_monto=TipoMonto.BASE.value,
                orden=2,
                config=DEFAULT_RULE_CONFIG,
                activo=True
            ),
            ReglaContable(
                evento_id=evento_venta.id,
                company_id=company_id,
                condicion=None,
                lado=LadoAsiento.HABER.value,
                tipo_cuenta=TipoCuentaContable.IGV_DEBITO.value,
                tipo_monto=TipoMonto.IGV.value,
                orden=3,
                config={"igv_rate": 0.18, **DEFAULT_RULE_CONFIG},
                activo=True
            )
        ]
        db.add_all(reglas_venta)
    
    # ===== EVENTO: PAGO =====
    evento_pago = db.query(EventoContable).filter(
        EventoContable.tipo == EventoContableType.PAGO.value,
        EventoContable.company_id == company_id
    ).first()
    
    if not evento_pago:
        evento_pago = EventoContable(
            company_id=company_id,
            tipo=EventoContableType.PAGO.value,
            nombre="Pago a Proveedor",
            descripcion="Registra pagos a proveedores",
            categoria="GENERAL",  # Evento transversal (legacy, puede ser usado por otros módulos)
            activo=True
        )
        db.add(evento_pago)
        db.flush()
        
        # Reglas para PAGO
        reglas_pago = [
            ReglaContable(
                evento_id=evento_pago.id,
                company_id=company_id,
                condicion=None,
                lado=LadoAsiento.DEBE.value,
                tipo_cuenta=TipoCuentaContable.PROVEEDORES.value,
                tipo_monto=TipoMonto.TOTAL.value,
                orden=1,
                config=DEFAULT_RULE_CONFIG,
                activo=True
            ),
            ReglaContable(
                evento_id=evento_pago.id,
                company_id=company_id,
                condicion=None,
                lado=LadoAsiento.HABER.value,
                tipo_cuenta=TipoCuentaContable.CAJA.value,
                tipo_monto=TipoMonto.TOTAL.value,
                orden=2,
                config=DEFAULT_RULE_CONFIG,
                activo=True
            )
        ]
        db.add_all(reglas_pago)
    
    # ===== EVENTO: COBRO =====
    evento_cobro = db.query(EventoContable).filter(
        EventoContable.tipo == EventoContableType.COBRO.value,
        EventoContable.company_id == company_id
    ).first()
    
    if not evento_cobro:
        evento_cobro = EventoContable(
            company_id=company_id,
            tipo=EventoContableType.COBRO.value,
            nombre="Cobro de Cliente",
            descripcion="Registra cobros de clientes",
            categoria="GENERAL",  # Evento transversal (legacy, puede ser usado por otros módulos)
            activo=True
        )
        db.add(evento_cobro)
        db.flush()
        
        # Reglas para COBRO
        reglas_cobro = [
            ReglaContable(
                evento_id=evento_cobro.id,
                company_id=company_id,
                condicion=None,
                lado=LadoAsiento.DEBE.value,
                tipo_cuenta=TipoCuentaContable.CAJA.value,
                tipo_monto=TipoMonto.TOTAL.value,
                orden=1,
                config=DEFAULT_RULE_CONFIG,
                activo=True
            ),
            ReglaContable(
                evento_id=evento_cobro.id,
                company_id=company_id,
                condicion=None,
                lado=LadoAsiento.HABER.value,
                tipo_cuenta=TipoCuentaContable.CLIENTES.value,
                tipo_monto=TipoMonto.TOTAL.value,
                orden=2,
                config=DEFAULT_RULE_CONFIG,
                activo=True
            )
        ]
        db.add_all(reglas_cobro)
    
    # ===== EVENTOS DE TESORERÍA =====
    
    # COBRO_CAJA
    evento_cobro_caja = db.query(EventoContable).filter(
        EventoContable.tipo == "COBRO_CAJA",
        EventoContable.company_id == company_id
    ).first()
    
    if not evento_cobro_caja:
        evento_cobro_caja = EventoContable(
            company_id=company_id,
            tipo="COBRO_CAJA",
            nombre="Cobro en Caja",
            descripcion="Registra cobros de clientes en efectivo (caja)",
            categoria="TESORERIA",  # Evento específico del módulo de Tesorería
            activo=True
        )
        db.add(evento_cobro_caja)
        db.flush()
        
        reglas_cobro_caja = [
            ReglaContable(
                evento_id=evento_cobro_caja.id,
                company_id=company_id,
                condicion=None,
                lado=LadoAsiento.DEBE.value,
                tipo_cuenta=TipoCuentaContable.CAJA.value,
                tipo_monto=TipoMonto.TOTAL.value,
                orden=1,
                config=DEFAULT_RULE_CONFIG,
                activo=True
            ),
            ReglaContable(
                evento_id=evento_cobro_caja.id,
                company_id=company_id,
                condicion=None,
                lado=LadoAsiento.HABER.value,
                tipo_cuenta=TipoCuentaContable.CLIENTES.value,
                tipo_monto=TipoMonto.TOTAL.value,
                orden=2,
                config=DEFAULT_RULE_CONFIG,
                activo=True
            )
        ]
        db.add_all(reglas_cobro_caja)
    
    # COBRO_BANCO
    evento_cobro_banco = db.query(EventoContable).filter(
        EventoContable.tipo == "COBRO_BANCO",
        EventoContable.company_id == company_id
    ).first()
    
    if not evento_cobro_banco:
        evento_cobro_banco = EventoContable(
            company_id=company_id,
            tipo="COBRO_BANCO",
            nombre="Cobro en Banco",
            descripcion="Registra cobros de clientes por transferencia bancaria",
            categoria="TESORERIA",  # Evento específico del módulo de Tesorería
            activo=True
        )
        db.add(evento_cobro_banco)
        db.flush()
        
        reglas_cobro_banco = [
            ReglaContable(
                evento_id=evento_cobro_banco.id,
                company_id=company_id,
                condicion=None,
                lado=LadoAsiento.DEBE.value,
                tipo_cuenta=TipoCuentaContable.BANCO.value,
                tipo_monto=TipoMonto.TOTAL.value,
                orden=1,
                config=DEFAULT_RULE_CONFIG,
                activo=True
            ),
            ReglaContable(
                evento_id=evento_cobro_banco.id,
                company_id=company_id,
                condicion=None,
                lado=LadoAsiento.HABER.value,
                tipo_cuenta=TipoCuentaContable.CLIENTES.value,
                tipo_monto=TipoMonto.TOTAL.value,
                orden=2,
                config=DEFAULT_RULE_CONFIG,
                activo=True
            )
        ]
        db.add_all(reglas_cobro_banco)
    
    # PAGO_CAJA
    evento_pago_caja = db.query(EventoContable).filter(
        EventoContable.tipo == "PAGO_CAJA",
        EventoContable.company_id == company_id
    ).first()
    
    if not evento_pago_caja:
        evento_pago_caja = EventoContable(
            company_id=company_id,
            tipo="PAGO_CAJA",
            nombre="Pago en Caja",
            descripcion="Registra pagos a proveedores en efectivo (caja)",
            categoria="TESORERIA",  # Evento específico del módulo de Tesorería
            activo=True
        )
        db.add(evento_pago_caja)
        db.flush()
        
        reglas_pago_caja = [
            ReglaContable(
                evento_id=evento_pago_caja.id,
                company_id=company_id,
                condicion=None,
                lado=LadoAsiento.DEBE.value,
                tipo_cuenta=TipoCuentaContable.PROVEEDORES.value,
                tipo_monto=TipoMonto.TOTAL.value,
                orden=1,
                config=DEFAULT_RULE_CONFIG,
                activo=True
            ),
            ReglaContable(
                evento_id=evento_pago_caja.id,
                company_id=company_id,
                condicion=None,
                lado=LadoAsiento.HABER.value,
                tipo_cuenta=TipoCuentaContable.CAJA.value,
                tipo_monto=TipoMonto.TOTAL.value,
                orden=2,
                config=DEFAULT_RULE_CONFIG,
                activo=True
            )
        ]
        db.add_all(reglas_pago_caja)
    
    # PAGO_BANCO
    evento_pago_banco = db.query(EventoContable).filter(
        EventoContable.tipo == "PAGO_BANCO",
        EventoContable.company_id == company_id
    ).first()
    
    if not evento_pago_banco:
        evento_pago_banco = EventoContable(
            company_id=company_id,
            tipo="PAGO_BANCO",
            nombre="Pago en Banco",
            descripcion="Registra pagos a proveedores por transferencia bancaria",
            categoria="TESORERIA",  # Evento específico del módulo de Tesorería
            activo=True
        )
        db.add(evento_pago_banco)
        db.flush()
        
        reglas_pago_banco = [
            ReglaContable(
                evento_id=evento_pago_banco.id,
                company_id=company_id,
                condicion=None,
                lado=LadoAsiento.DEBE.value,
                tipo_cuenta=TipoCuentaContable.PROVEEDORES.value,
                tipo_monto=TipoMonto.TOTAL.value,
                orden=1,
                config=DEFAULT_RULE_CONFIG,
                activo=True
            ),
            ReglaContable(
                evento_id=evento_pago_banco.id,
                company_id=company_id,
                condicion=None,
                lado=LadoAsiento.HABER.value,
                tipo_cuenta=TipoCuentaContable.BANCO.value,
                tipo_monto=TipoMonto.TOTAL.value,
                orden=2,
                config=DEFAULT_RULE_CONFIG,
                activo=True
            )
        ]
        db.add_all(reglas_pago_banco)
    
    # TRANSFERENCIA (futuro: transferencia entre cuentas)
    evento_transferencia = db.query(EventoContable).filter(
        EventoContable.tipo == "TRANSFERENCIA",
        EventoContable.company_id == company_id
    ).first()
    
    if not evento_transferencia:
        evento_transferencia = EventoContable(
            company_id=company_id,
            tipo="TRANSFERENCIA",
            nombre="Transferencia entre Cuentas",
            descripcion="Registra transferencias entre caja y banco (futuro)",
            categoria="TESORERIA",  # Evento específico del módulo de Tesorería
            activo=False  # Inactivo por defecto hasta implementar
        )
        db.add(evento_transferencia)
        db.flush()
    
    # ===== EVENTOS DE INVENTARIOS =====
    
    # ENTRADA_INVENTARIO
    evento_entrada_inventario = db.query(EventoContable).filter(
        EventoContable.tipo == EventoContableType.ENTRADA_INVENTARIO.value,
        EventoContable.company_id == company_id
    ).first()
    
    if not evento_entrada_inventario:
        evento_entrada_inventario = EventoContable(
            company_id=company_id,
            tipo=EventoContableType.ENTRADA_INVENTARIO.value,
            nombre="Entrada de Inventario",
            descripcion="Registra entradas de inventario (compras, producción, ajustes positivos)",
            categoria="INVENTARIOS",
            activo=True
        )
        db.add(evento_entrada_inventario)
        db.flush()
        
        reglas_entrada_inventario = [
            ReglaContable(
                evento_id=evento_entrada_inventario.id,
                company_id=company_id,
                condicion=None,
                lado=LadoAsiento.DEBE.value,
                tipo_cuenta=TipoCuentaContable.INVENTARIO.value,
                tipo_monto=TipoMonto.TOTAL.value,
                orden=1,
                config=DEFAULT_RULE_CONFIG,
                activo=True
            ),
            ReglaContable(
                evento_id=evento_entrada_inventario.id,
                company_id=company_id,
                condicion=None,
                lado=LadoAsiento.HABER.value,
                tipo_cuenta=TipoCuentaContable.PROVEEDORES.value,
                tipo_monto=TipoMonto.TOTAL.value,
                orden=2,
                config=DEFAULT_RULE_CONFIG,
                activo=True
            )
        ]
        db.add_all(reglas_entrada_inventario)
    else:
        # Corregir reglas existentes si usan GASTO_COMPRAS en HABER
        from ..domain.models_journal_engine import ReglaContable
        reglas_existentes = db.query(ReglaContable).filter(
            ReglaContable.evento_id == evento_entrada_inventario.id,
            ReglaContable.company_id == company_id,
            ReglaContable.lado == LadoAsiento.HABER.value,
            ReglaContable.tipo_cuenta == TipoCuentaContable.GASTO_COMPRAS.value
        ).all()
        
        for regla in reglas_existentes:
            regla.tipo_cuenta = TipoCuentaContable.PROVEEDORES.value
    
    # SALIDA_INVENTARIO
    evento_salida_inventario = db.query(EventoContable).filter(
        EventoContable.tipo == EventoContableType.SALIDA_INVENTARIO.value,
        EventoContable.company_id == company_id
    ).first()
    
    if not evento_salida_inventario:
        evento_salida_inventario = EventoContable(
            company_id=company_id,
            tipo=EventoContableType.SALIDA_INVENTARIO.value,
            nombre="Salida de Inventario",
            descripcion="Registra salidas de inventario (ventas, consumo, ajustes negativos, mermas)",
            categoria="INVENTARIOS",
            activo=True
        )
        db.add(evento_salida_inventario)
        db.flush()
        
        reglas_salida_inventario = [
            ReglaContable(
                evento_id=evento_salida_inventario.id,
                company_id=company_id,
                condicion=None,
                lado=LadoAsiento.DEBE.value,
                tipo_cuenta=TipoCuentaContable.COSTO_VENTAS.value,
                tipo_monto=TipoMonto.TOTAL.value,
                orden=1,
                config=DEFAULT_RULE_CONFIG,
                activo=True
            ),
            ReglaContable(
                evento_id=evento_salida_inventario.id,
                company_id=company_id,
                condicion=None,
                lado=LadoAsiento.HABER.value,
                tipo_cuenta=TipoCuentaContable.INVENTARIO.value,
                tipo_monto=TipoMonto.TOTAL.value,
                orden=2,
                config=DEFAULT_RULE_CONFIG,
                activo=True
            )
        ]
        db.add_all(reglas_salida_inventario)
    
    # ===== EVENTO: AJUSTE_INVENTARIO =====
    evento_ajuste_inventario = db.query(EventoContable).filter(
        EventoContable.tipo == EventoContableType.AJUSTE_INVENTARIO.value,
        EventoContable.company_id == company_id
    ).first()
    
    if not evento_ajuste_inventario:
        evento_ajuste_inventario = EventoContable(
            company_id=company_id,
            tipo=EventoContableType.AJUSTE_INVENTARIO.value,
            nombre="Ajuste de Inventario",
            descripcion="Registra ajustes de inventario (sobrantes o faltantes)",
            categoria="INVENTARIOS",
            activo=True
        )
        db.add(evento_ajuste_inventario)
        db.flush()
        
        # Reglas para AJUSTE_INVENTARIO
        # Se aplicarán según el tipo de ajuste (sobrante o faltante)
        # Sobrante: DEBE INVENTARIO, HABER RESULTADOS
        # Faltante: DEBE RESULTADOS, HABER INVENTARIO
        # Usamos condiciones para determinar el lado según el signo de la cantidad
        reglas_ajuste_inventario = [
            # Regla para sobrante (cantidad > 0): DEBE INVENTARIO
            ReglaContable(
                evento_id=evento_ajuste_inventario.id,
                company_id=company_id,
                condicion="cantidad > 0",  # Sobrante
                lado=LadoAsiento.DEBE.value,
                tipo_cuenta=TipoCuentaContable.INVENTARIO.value,
                tipo_monto=TipoMonto.TOTAL.value,
                orden=1,
                config=DEFAULT_RULE_CONFIG,
                activo=True
            ),
            # Regla para sobrante (cantidad > 0): HABER RESULTADOS
            ReglaContable(
                evento_id=evento_ajuste_inventario.id,
                company_id=company_id,
                condicion="cantidad > 0",  # Sobrante
                lado=LadoAsiento.HABER.value,
                tipo_cuenta=TipoCuentaContable.RESULTADOS.value,
                tipo_monto=TipoMonto.TOTAL.value,
                orden=2,
                config=DEFAULT_RULE_CONFIG,
                activo=True
            ),
            # Regla para faltante (cantidad < 0): DEBE RESULTADOS
            ReglaContable(
                evento_id=evento_ajuste_inventario.id,
                company_id=company_id,
                condicion="cantidad < 0",  # Faltante
                lado=LadoAsiento.DEBE.value,
                tipo_cuenta=TipoCuentaContable.RESULTADOS.value,
                tipo_monto=TipoMonto.TOTAL.value,
                orden=3,
                config=DEFAULT_RULE_CONFIG,
                activo=True
            ),
            # Regla para faltante (cantidad < 0): HABER INVENTARIO
            ReglaContable(
                evento_id=evento_ajuste_inventario.id,
                company_id=company_id,
                condicion="cantidad < 0",  # Faltante
                lado=LadoAsiento.HABER.value,
                tipo_cuenta=TipoCuentaContable.INVENTARIO.value,
                tipo_monto=TipoMonto.TOTAL.value,
                orden=4,
                config=DEFAULT_RULE_CONFIG,
                activo=True
            )
        ]
        db.add_all(reglas_ajuste_inventario)
    
    # ===== EVENTOS DE NOTAS DE CRÉDITO Y DÉBITO =====
    
    # NOTA_CREDITO_VENTA
    evento_nc_venta = db.query(EventoContable).filter(
        EventoContable.tipo == EventoContableType.NOTA_CREDITO_VENTA.value,
        EventoContable.company_id == company_id
    ).first()
    
    if not evento_nc_venta:
        evento_nc_venta = EventoContable(
            company_id=company_id,
            tipo=EventoContableType.NOTA_CREDITO_VENTA.value,
            nombre="Nota de Crédito - Venta",
            descripcion="Nota de Crédito que reduce o anula una venta (devolución, descuento, error)",
            categoria="VENTAS",
            activo=True
        )
        db.add(evento_nc_venta)
        db.flush()
        
        # Reglas para NOTA_CREDITO_VENTA
        # DEBE → INGRESO_VENTAS (BASE) y IGV_DEBITO (IGV)
        # HABER → CLIENTES (TOTAL)
        reglas_nc_venta = [
            ReglaContable(
                evento_id=evento_nc_venta.id,
                company_id=company_id,
                condicion=None,
                lado=LadoAsiento.DEBE.value,
                tipo_cuenta=TipoCuentaContable.INGRESO_VENTAS.value,
                tipo_monto=TipoMonto.BASE.value,
                orden=1,
                config=DEFAULT_RULE_CONFIG,
                activo=True
            ),
            ReglaContable(
                evento_id=evento_nc_venta.id,
                company_id=company_id,
                condicion=None,
                lado=LadoAsiento.DEBE.value,
                tipo_cuenta=TipoCuentaContable.IGV_DEBITO.value,
                tipo_monto=TipoMonto.IGV.value,
                orden=2,
                config={"igv_rate": 0.18, **DEFAULT_RULE_CONFIG},
                activo=True
            ),
            ReglaContable(
                evento_id=evento_nc_venta.id,
                company_id=company_id,
                condicion=None,
                lado=LadoAsiento.HABER.value,
                tipo_cuenta=TipoCuentaContable.CLIENTES.value,
                tipo_monto=TipoMonto.TOTAL.value,
                orden=3,
                config={"igv_rate": 0.18, **DEFAULT_RULE_CONFIG},
                activo=True
            )
        ]
        db.add_all(reglas_nc_venta)
    
    # NOTA_DEBITO_VENTA
    evento_nd_venta = db.query(EventoContable).filter(
        EventoContable.tipo == EventoContableType.NOTA_DEBITO_VENTA.value,
        EventoContable.company_id == company_id
    ).first()
    
    if not evento_nd_venta:
        evento_nd_venta = EventoContable(
            company_id=company_id,
            tipo=EventoContableType.NOTA_DEBITO_VENTA.value,
            nombre="Nota de Débito - Venta",
            descripcion="Nota de Débito que incrementa una venta (intereses, penalidades, gastos adicionales)",
            categoria="VENTAS",
            activo=True
        )
        db.add(evento_nd_venta)
        db.flush()
        
        # Reglas para NOTA_DEBITO_VENTA
        # DEBE → CLIENTES (TOTAL)
        # HABER → INGRESO_VENTAS (BASE) y IGV_DEBITO (IGV)
        reglas_nd_venta = [
            ReglaContable(
                evento_id=evento_nd_venta.id,
                company_id=company_id,
                condicion=None,
                lado=LadoAsiento.DEBE.value,
                tipo_cuenta=TipoCuentaContable.CLIENTES.value,
                tipo_monto=TipoMonto.TOTAL.value,
                orden=1,
                config={"igv_rate": 0.18, **DEFAULT_RULE_CONFIG},
                activo=True
            ),
            ReglaContable(
                evento_id=evento_nd_venta.id,
                company_id=company_id,
                condicion=None,
                lado=LadoAsiento.HABER.value,
                tipo_cuenta=TipoCuentaContable.INGRESO_VENTAS.value,
                tipo_monto=TipoMonto.BASE.value,
                orden=2,
                config=DEFAULT_RULE_CONFIG,
                activo=True
            ),
            ReglaContable(
                evento_id=evento_nd_venta.id,
                company_id=company_id,
                condicion=None,
                lado=LadoAsiento.HABER.value,
                tipo_cuenta=TipoCuentaContable.IGV_DEBITO.value,
                tipo_monto=TipoMonto.IGV.value,
                orden=3,
                config={"igv_rate": 0.18, **DEFAULT_RULE_CONFIG},
                activo=True
            )
        ]
        db.add_all(reglas_nd_venta)
    
    # NOTA_CREDITO_COMPRA
    evento_nc_compra = db.query(EventoContable).filter(
        EventoContable.tipo == EventoContableType.NOTA_CREDITO_COMPRA.value,
        EventoContable.company_id == company_id
    ).first()
    
    if not evento_nc_compra:
        evento_nc_compra = EventoContable(
            company_id=company_id,
            tipo=EventoContableType.NOTA_CREDITO_COMPRA.value,
            nombre="Nota de Crédito - Compra",
            descripcion="Nota de Crédito que reduce o anula una compra (devolución, descuento, error)",
            categoria="COMPRAS",
            activo=True
        )
        db.add(evento_nc_compra)
        db.flush()
        
        # Reglas para NOTA_CREDITO_COMPRA
        # DEBE → PROVEEDORES (TOTAL)
        # HABER → GASTO_COMPRAS (BASE) y IGV_CREDITO (IGV)
        reglas_nc_compra = [
            ReglaContable(
                evento_id=evento_nc_compra.id,
                company_id=company_id,
                condicion=None,
                lado=LadoAsiento.DEBE.value,
                tipo_cuenta=TipoCuentaContable.PROVEEDORES.value,
                tipo_monto=TipoMonto.TOTAL.value,
                orden=1,
                config={"igv_rate": 0.18, **DEFAULT_RULE_CONFIG},
                activo=True
            ),
            ReglaContable(
                evento_id=evento_nc_compra.id,
                company_id=company_id,
                condicion=None,
                lado=LadoAsiento.HABER.value,
                tipo_cuenta=TipoCuentaContable.GASTO_COMPRAS.value,
                tipo_monto=TipoMonto.BASE.value,
                orden=2,
                config=DEFAULT_RULE_CONFIG,
                activo=True
            ),
            ReglaContable(
                evento_id=evento_nc_compra.id,
                company_id=company_id,
                condicion=None,
                lado=LadoAsiento.HABER.value,
                tipo_cuenta=TipoCuentaContable.IGV_CREDITO.value,
                tipo_monto=TipoMonto.IGV.value,
                orden=3,
                config={"igv_rate": 0.18, **DEFAULT_RULE_CONFIG},
                activo=True
            )
        ]
        db.add_all(reglas_nc_compra)
    
    # NOTA_DEBITO_COMPRA
    evento_nd_compra = db.query(EventoContable).filter(
        EventoContable.tipo == EventoContableType.NOTA_DEBITO_COMPRA.value,
        EventoContable.company_id == company_id
    ).first()
    
    if not evento_nd_compra:
        evento_nd_compra = EventoContable(
            company_id=company_id,
            tipo=EventoContableType.NOTA_DEBITO_COMPRA.value,
            nombre="Nota de Débito - Compra",
            descripcion="Nota de Débito que incrementa una compra (intereses, penalidades, gastos adicionales)",
            categoria="COMPRAS",
            activo=True
        )
        db.add(evento_nd_compra)
        db.flush()
        
        # Reglas para NOTA_DEBITO_COMPRA
        # DEBE → GASTO_COMPRAS (BASE) y IGV_CREDITO (IGV)
        # HABER → PROVEEDORES (TOTAL)
        reglas_nd_compra = [
            ReglaContable(
                evento_id=evento_nd_compra.id,
                company_id=company_id,
                condicion=None,
                lado=LadoAsiento.DEBE.value,
                tipo_cuenta=TipoCuentaContable.GASTO_COMPRAS.value,
                tipo_monto=TipoMonto.BASE.value,
                orden=1,
                config=DEFAULT_RULE_CONFIG,
                activo=True
            ),
            ReglaContable(
                evento_id=evento_nd_compra.id,
                company_id=company_id,
                condicion=None,
                lado=LadoAsiento.DEBE.value,
                tipo_cuenta=TipoCuentaContable.IGV_CREDITO.value,
                tipo_monto=TipoMonto.IGV.value,
                orden=2,
                config={"igv_rate": 0.18, **DEFAULT_RULE_CONFIG},
                activo=True
            ),
            ReglaContable(
                evento_id=evento_nd_compra.id,
                company_id=company_id,
                condicion=None,
                lado=LadoAsiento.HABER.value,
                tipo_cuenta=TipoCuentaContable.PROVEEDORES.value,
                tipo_monto=TipoMonto.TOTAL.value,
                orden=3,
                config={"igv_rate": 0.18, **DEFAULT_RULE_CONFIG},
                activo=True
            )
        ]
        db.add_all(reglas_nd_compra)
    
    db.commit()
    return {
        "eventos_creados": 16,  # 4 originales + 5 de tesorería + 3 de inventarios + 4 de notas
        "reglas_creadas": 38,  # 10 originales + 8 de tesorería + 8 de inventarios + 12 de notas
        "mensaje": "Eventos y reglas predeterminadas inicializadas (incluye eventos de tesorería, inventarios y notas). Configure los mapeos de tipos de cuenta."
    }

