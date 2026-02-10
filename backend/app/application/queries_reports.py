"""
Queries para el Módulo de Reportes
Solo consultas - NO modifican datos
"""
from decimal import Decimal
from datetime import date
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_, case, select
from sqlalchemy.orm import aliased

from ..domain.models import (
    JournalEntry, EntryLine, Account, Period, Company
)
from ..domain.models_ext import (
    Sale, Purchase, InventoryMovement, Product
)
from ..domain.models_inventario import Almacen, Stock
from ..domain.models_tesoreria import MovimientoTesoreria
from ..domain.models_notas import NotaDocumento
from ..infrastructure.unit_of_work import UnitOfWork


class ReportQuery:
    """
    Clase base para queries de reportes.
    Todos los métodos son de solo lectura.
    """
    
    def __init__(self, uow: UnitOfWork):
        self.uow = uow
        self.db = uow.db
    
    def get_libro_diario(
        self,
        company_id: int,
        period_id: Optional[int] = None,
        account_id: Optional[int] = None,
        origin: Optional[str] = None,
        currency: Optional[str] = None,
        fecha_desde: Optional[date] = None,
        fecha_hasta: Optional[date] = None
    ) -> List[Dict[str, Any]]:
        """
        Obtiene el Libro Diario completo.
        
        Retorna lista de líneas con:
        - fecha
        - nro_asiento
        - cuenta
        - glosa
        - debe
        - haber
        - periodo
        - origen
        """
        query = (
            self.db.query(
                JournalEntry.date.label('fecha'),
                JournalEntry.id.label('nro_asiento'),
                Account.code.label('cuenta_codigo'),
                Account.name.label('cuenta_nombre'),
                EntryLine.memo.label('glosa'),
                EntryLine.debit.label('debe'),
                EntryLine.credit.label('haber'),
                Period.month.label('periodo_mes'),
                Period.year.label('periodo_anio'),
                JournalEntry.origin.label('origen')
            )
            .join(EntryLine, EntryLine.entry_id == JournalEntry.id)
            .join(Account, Account.id == EntryLine.account_id)
            .join(Period, Period.id == JournalEntry.period_id)
            .filter(
                JournalEntry.company_id == company_id,
                JournalEntry.status == "POSTED"
            )
        )
        
        if period_id:
            query = query.filter(JournalEntry.period_id == period_id)
        
        if account_id:
            query = query.filter(EntryLine.account_id == account_id)
        
        if origin:
            query = query.filter(JournalEntry.origin == origin)
        
        if currency:
            query = query.filter(JournalEntry.currency == currency)
        
        if fecha_desde:
            query = query.filter(JournalEntry.date >= fecha_desde)
        
        if fecha_hasta:
            query = query.filter(JournalEntry.date <= fecha_hasta)
        
        query = query.order_by(
            JournalEntry.date,
            JournalEntry.id,
            EntryLine.id
        )
        
        results = query.all()
        
        return [
            {
                'fecha': r.fecha,
                'nro_asiento': r.nro_asiento,
                'cuenta_codigo': r.cuenta_codigo,
                'cuenta_nombre': r.cuenta_nombre,
                'glosa': r.glosa or '',
                'debe': float(r.debe) if r.debe else 0.0,
                'haber': float(r.haber) if r.haber else 0.0,
                'periodo': f"{r.periodo_anio}-{r.periodo_mes:02d}",
                'origen': r.origen or 'MANUAL'
            }
            for r in results
        ]
    
    def get_libro_mayor(
        self,
        company_id: int,
        account_id: Optional[int] = None,
        period_id: Optional[int] = None,
        fecha_desde: Optional[date] = None,
        fecha_hasta: Optional[date] = None
    ) -> List[Dict[str, Any]]:
        """
        Obtiene el Libro Mayor agrupado por cuenta.
        
        Retorna:
        - cuenta
        - saldo_inicial
        - debe_total
        - haber_total
        - saldo_final
        """
        # Calcular saldo inicial (antes del período)
        # Necesitamos el tipo de cuenta para calcular el saldo correctamente
        from ..domain.enums import AccountType
        
        saldo_inicial_subq = (
            self.db.query(
                EntryLine.account_id,
                func.sum(
                    case(
                        (Account.type.in_([AccountType.ASSET.value, AccountType.EXPENSE.value]),
                         EntryLine.debit - EntryLine.credit),
                        else_=EntryLine.credit - EntryLine.debit
                    )
                ).label('saldo_inicial')
            )
            .join(JournalEntry, JournalEntry.id == EntryLine.entry_id)
            .join(Period, Period.id == JournalEntry.period_id)
            .join(Account, Account.id == EntryLine.account_id)
            .filter(
                JournalEntry.company_id == company_id,
                JournalEntry.status == "POSTED"
            )
        )
        
        if period_id:
            period = self.db.query(Period).filter(Period.id == period_id).first()
            if period:
                saldo_inicial_subq = saldo_inicial_subq.filter(
                    or_(
                        Period.year < period.year,
                        and_(Period.year == period.year, Period.month < period.month)
                    )
                )
        
        if fecha_desde:
            saldo_inicial_subq = saldo_inicial_subq.filter(JournalEntry.date < fecha_desde)
        
        saldo_inicial_subq = saldo_inicial_subq.group_by(EntryLine.account_id).subquery()
        
        # Query principal para movimientos del período
        query = (
            self.db.query(
                Account.id.label('account_id'),
                Account.code.label('cuenta_codigo'),
                Account.name.label('cuenta_nombre'),
                Account.type.label('account_type'),
                func.coalesce(saldo_inicial_subq.c.saldo_inicial, 0).label('saldo_inicial'),
                func.sum(EntryLine.debit).label('debe_total'),
                func.sum(EntryLine.credit).label('haber_total')
            )
            .outerjoin(saldo_inicial_subq, saldo_inicial_subq.c.account_id == Account.id)
            .join(EntryLine, EntryLine.account_id == Account.id)
            .join(JournalEntry, JournalEntry.id == EntryLine.entry_id)
            .filter(
                Account.company_id == company_id,
                JournalEntry.company_id == company_id,
                JournalEntry.status == "POSTED"
            )
        )
        
        if period_id:
            query = query.filter(JournalEntry.period_id == period_id)
        
        if fecha_desde:
            query = query.filter(JournalEntry.date >= fecha_desde)
        
        if fecha_hasta:
            query = query.filter(JournalEntry.date <= fecha_hasta)
        
        if account_id:
            query = query.filter(Account.id == account_id)
        
        query = query.group_by(
            Account.id,
            Account.code,
            Account.name,
            Account.type,
            saldo_inicial_subq.c.saldo_inicial
        )
        
        results = query.all()
        
        def calcular_saldo_final(account_type: str, saldo_inicial: float, debe_total: float, haber_total: float) -> float:
            """
            Calcula el saldo final según el tipo de cuenta:
            - ACTIVO (A) y GASTOS (G): Saldo = Saldo Inicial + Debe - Haber
            - PASIVO (P), PATRIMONIO (PN) e INGRESOS (I): Saldo = Saldo Inicial + Haber - Debe
            """
            if account_type in [AccountType.ASSET.value, AccountType.EXPENSE.value]:
                # Activos y Gastos: Debe - Haber
                return float(saldo_inicial + debe_total - haber_total)
            else:
                # Pasivos, Patrimonio e Ingresos: Haber - Debe
                return float(saldo_inicial + haber_total - debe_total)
        
        return [
            {
                'account_id': r.account_id,
                'cuenta_codigo': r.cuenta_codigo,
                'cuenta_nombre': r.cuenta_nombre,
                'account_type': r.account_type,
                'saldo_inicial': float(r.saldo_inicial or 0),
                'debe_total': float(r.debe_total or 0),
                'haber_total': float(r.haber_total or 0),
                'saldo_final': calcular_saldo_final(
                    r.account_type,
                    float(r.saldo_inicial or 0),
                    float(r.debe_total or 0),
                    float(r.haber_total or 0)
                )
            }
            for r in results
        ]
    
    def get_balance_comprobacion(
        self,
        company_id: int,
        period_id: Optional[int] = None,
        fecha_desde: Optional[date] = None,
        fecha_hasta: Optional[date] = None
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Obtiene el Balance de Comprobación.
        
        Retorna:
        - Lista de cuentas con debe, haber, saldo
        - Totales y validación de cuadratura
        """
        libro_mayor = self.get_libro_mayor(
            company_id=company_id,
            period_id=period_id,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta
        )
        
        total_debe = sum(r['debe_total'] for r in libro_mayor)
        total_haber = sum(r['haber_total'] for r in libro_mayor)
        
        cuadra = abs(total_debe - total_haber) < Decimal('0.01')  # Tolerancia por redondeo
        
        validacion = {
            'total_debe': float(total_debe),
            'total_haber': float(total_haber),
            'diferencia': float(total_debe - total_haber),
            'cuadra': cuadra,
            'mensaje': 'Cuadra correctamente' if cuadra else f'DESCUADRE: Diferencia de {abs(total_debe - total_haber)}'
        }
        
        return libro_mayor, validacion
    
    def get_asientos_descuadrados(
        self,
        company_id: int,
        period_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Detecta asientos que no cuadran (Debe ≠ Haber).
        """
        query = (
            self.db.query(
                JournalEntry.id.label('asiento_id'),
                JournalEntry.date.label('fecha'),
                JournalEntry.glosa.label('glosa'),
                JournalEntry.origin.label('origen'),
                func.sum(EntryLine.debit).label('total_debe'),
                func.sum(EntryLine.credit).label('total_haber'),
                (func.sum(EntryLine.debit) - func.sum(EntryLine.credit)).label('diferencia')
            )
            .join(EntryLine, EntryLine.entry_id == JournalEntry.id)
            .filter(
                JournalEntry.company_id == company_id,
                JournalEntry.status == "POSTED"
            )
            .group_by(
                JournalEntry.id,
                JournalEntry.date,
                JournalEntry.glosa,
                JournalEntry.origin
            )
            .having(
                func.abs(func.sum(EntryLine.debit) - func.sum(EntryLine.credit)) > Decimal('0.01')
            )
        )
        
        if period_id:
            query = query.filter(JournalEntry.period_id == period_id)
        
        results = query.all()
        
        return [
            {
                'asiento_id': r.asiento_id,
                'fecha': r.fecha,
                'glosa': r.glosa or '',
                'origen': r.origen or 'MANUAL',
                'total_debe': float(r.total_debe or 0),
                'total_haber': float(r.total_haber or 0),
                'diferencia': float(r.diferencia or 0)
            }
            for r in results
        ]
    
    def get_movimientos_sin_asiento(
        self,
        company_id: int
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        Detecta movimientos que no tienen asiento contable asociado.
        """
        resultados = {
            'compras': [],
            'ventas': [],
            'inventario': [],
            'tesoreria': [],
            'notas': []
        }
        
        # Compras sin asiento
        compras_sin_asiento = (
            self.db.query(Purchase)
            .filter(
                Purchase.company_id == company_id,
                or_(
                    Purchase.journal_entry_id.is_(None),
                    Purchase.journal_entry_id == 0
                )
            )
            .all()
        )
        
        resultados['compras'] = [
            {
                'id': c.id,
                'doc_type': c.doc_type,
                'series': c.series,
                'number': c.number,
                'fecha': c.issue_date,
                'total': float(c.total_amount)
            }
            for c in compras_sin_asiento
        ]
        
        # Ventas sin asiento
        ventas_sin_asiento = (
            self.db.query(Sale)
            .filter(
                Sale.company_id == company_id,
                or_(
                    Sale.journal_entry_id.is_(None),
                    Sale.journal_entry_id == 0
                )
            )
            .all()
        )
        
        resultados['ventas'] = [
            {
                'id': v.id,
                'doc_type': v.doc_type,
                'series': v.series,
                'number': v.number,
                'fecha': v.issue_date,
                'total': float(v.total_amount)
            }
            for v in ventas_sin_asiento
        ]
        
        # Movimientos de inventario sin asiento
        inventario_sin_asiento = (
            self.db.query(InventoryMovement)
            .filter(
                InventoryMovement.company_id == company_id,
                or_(
                    InventoryMovement.journal_entry_id.is_(None),
                    InventoryMovement.journal_entry_id == 0
                )
            )
            .all()
        )
        
        resultados['inventario'] = [
            {
                'id': m.id,
                'tipo': m.tipo,
                'fecha': m.fecha,
                'producto_id': m.producto_id,
                'cantidad': float(m.cantidad),
                'costo_total': float(m.costo_total)
            }
            for m in inventario_sin_asiento
        ]
        
        # Movimientos de tesorería sin asiento
        tesoreria_sin_asiento = (
            self.db.query(MovimientoTesoreria)
            .filter(
                MovimientoTesoreria.company_id == company_id,
                MovimientoTesoreria.estado == "REGISTRADO",
                or_(
                    MovimientoTesoreria.journal_entry_id.is_(None),
                    MovimientoTesoreria.journal_entry_id == 0
                )
            )
            .all()
        )
        
        resultados['tesoreria'] = [
            {
                'id': m.id,
                'tipo': m.tipo,
                'fecha': m.fecha,
                'monto': float(m.monto),
                'referencia_tipo': m.referencia_tipo,
                'referencia_id': m.referencia_id
            }
            for m in tesoreria_sin_asiento
        ]
        
        # Notas sin asiento
        notas_sin_asiento = (
            self.db.query(NotaDocumento)
            .filter(
                NotaDocumento.company_id == company_id,
                NotaDocumento.estado == "REGISTRADA",
                or_(
                    NotaDocumento.journal_entry_id.is_(None),
                    NotaDocumento.journal_entry_id == 0
                )
            )
            .all()
        )
        
        resultados['notas'] = [
            {
                'id': n.id,
                'tipo': n.tipo,
                'origen': n.origen,
                'serie': n.serie,
                'numero': n.numero,
                'fecha': n.fecha_emision,
                'total': float(n.total)
            }
            for n in notas_sin_asiento
        ]
        
        return resultados
    
    def get_estado_resultados(
        self,
        company_id: int,
        period_id: Optional[int] = None,
        fecha_desde: Optional[date] = None,
        fecha_hasta: Optional[date] = None
    ) -> List[Dict[str, Any]]:
        """
        Obtiene el Estado de Resultados.
        
        Basado en cuentas de Ingresos, Costos y Gastos.
        """
        from ..domain.enums import AccountType
        
        # Obtener libro mayor filtrado
        libro_mayor = self.get_libro_mayor(
            company_id=company_id,
            period_id=period_id,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta
        )
        
        # Filtrar por tipo de cuenta
        # Nota: Los costos se manejan como EXPENSE o pueden estar en cuentas específicas (ej: 60.11 Costo de Ventas)
        ingresos = [c for c in libro_mayor if c['account_type'] == AccountType.INCOME.value]
        # Costos: cuentas que empiezan con 60 (Costo de Ventas) o 61 (Gastos de Operación)
        # Por ahora, los tratamos como EXPENSE, pero podrían estar en una categoría separada
        costos = [c for c in libro_mayor if c['account_type'] == AccountType.EXPENSE.value and c['cuenta_codigo'].startswith('60')]
        gastos = [c for c in libro_mayor if c['account_type'] == AccountType.EXPENSE.value and not c['cuenta_codigo'].startswith('60')]
        
        # Calcular totales
        total_ingresos = sum(c['saldo_final'] for c in ingresos)
        total_costos = sum(c['saldo_final'] for c in costos)
        total_gastos = sum(c['saldo_final'] for c in gastos)
        
        utilidad_bruta = total_ingresos - total_costos
        utilidad_neta = utilidad_bruta - total_gastos
        
        return {
            'ingresos': [
                {
                    'cuenta_codigo': c['cuenta_codigo'],
                    'cuenta_nombre': c['cuenta_nombre'],
                    'monto': c['saldo_final']
                }
                for c in ingresos if abs(c['saldo_final']) > 0.01
            ],
            'costos': [
                {
                    'cuenta_codigo': c['cuenta_codigo'],
                    'cuenta_nombre': c['cuenta_nombre'],
                    'monto': c['saldo_final']
                }
                for c in costos if abs(c['saldo_final']) > 0.01
            ],
            'gastos': [
                {
                    'cuenta_codigo': c['cuenta_codigo'],
                    'cuenta_nombre': c['cuenta_nombre'],
                    'monto': c['saldo_final']
                }
                for c in gastos if abs(c['saldo_final']) > 0.01
            ],
            'totales': {
                'total_ingresos': float(total_ingresos),
                'total_costos': float(total_costos),
                'total_gastos': float(total_gastos),
                'utilidad_bruta': float(utilidad_bruta),
                'utilidad_neta': float(utilidad_neta)
            }
        }
    
    def get_balance_general(
        self,
        company_id: int,
        period_id: Optional[int] = None,
        fecha_desde: Optional[date] = None,
        fecha_hasta: Optional[date] = None
    ) -> Dict[str, Any]:
        """
        Obtiene el Balance General.
        
        Basado en cuentas de Activos, Pasivos y Patrimonio.
        """
        from ..domain.enums import AccountType
        
        # Obtener libro mayor filtrado
        libro_mayor = self.get_libro_mayor(
            company_id=company_id,
            period_id=period_id,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta
        )
        
        # Filtrar por tipo de cuenta
        activos = [c for c in libro_mayor if c['account_type'] == AccountType.ASSET.value]
        pasivos = [c for c in libro_mayor if c['account_type'] == AccountType.LIABILITY.value]
        patrimonio = [c for c in libro_mayor if c['account_type'] == AccountType.EQUITY.value]
        
        # Calcular totales
        # Los saldos ya están calculados correctamente según el tipo de cuenta
        total_activos = sum(c['saldo_final'] for c in activos)
        total_pasivos = sum(c['saldo_final'] for c in pasivos)
        total_patrimonio = sum(c['saldo_final'] for c in patrimonio)
        
        # Validación: Activo = Pasivo + Patrimonio
        diferencia = abs(total_activos - (total_pasivos + total_patrimonio))
        cuadra = diferencia < 0.01
        
        return {
            'activos': [
                {
                    'cuenta_codigo': c['cuenta_codigo'],
                    'cuenta_nombre': c['cuenta_nombre'],
                    'saldo': c['saldo_final']
                }
                for c in activos if abs(c['saldo_final']) > 0.01
            ],
            'pasivos': [
                {
                    'cuenta_codigo': c['cuenta_codigo'],
                    'cuenta_nombre': c['cuenta_nombre'],
                    'saldo': c['saldo_final']
                }
                for c in pasivos if abs(c['saldo_final']) > 0.01
            ],
            'patrimonio': [
                {
                    'cuenta_codigo': c['cuenta_codigo'],
                    'cuenta_nombre': c['cuenta_nombre'],
                    'saldo': c['saldo_final']
                }
                for c in patrimonio if abs(c['saldo_final']) > 0.01
            ],
            'totales': {
                'total_activos': float(total_activos),
                'total_pasivos': float(total_pasivos),
                'total_patrimonio': float(total_patrimonio),
                'total_pasivo_patrimonio': float(total_pasivos + total_patrimonio)
            },
            'validacion': {
                'cuadra': cuadra,
                'diferencia': float(diferencia),
                'mensaje': 'Balance cuadra correctamente' if cuadra else f'DESCUADRE: Diferencia de {diferencia:.2f}'
            }
        }
    
    def get_cuentas_sin_mapeo(
        self,
        company_id: int
    ) -> Dict[str, Any]:
        """
        Detecta tipos de cuenta contable que no tienen mapeo.
        """
        from ..domain.models_journal_engine import TipoCuentaMapeo, TipoCuentaContable
        
        # Obtener todos los tipos de cuenta contable definidos
        tipos_esperados = [tipo.value for tipo in TipoCuentaContable]
        
        # Obtener mapeos existentes
        mapeos = (
            self.db.query(TipoCuentaMapeo)
            .filter(TipoCuentaMapeo.company_id == company_id)
            .all()
        )
        
        tipos_mapeados = {m.tipo_cuenta for m in mapeos}
        tipos_sin_mapeo = [t for t in tipos_esperados if t not in tipos_mapeados]
        
        return {
            'tipos_sin_mapeo': tipos_sin_mapeo,
            'total': len(tipos_sin_mapeo),
            'mensaje': f'Se encontraron {len(tipos_sin_mapeo)} tipos de cuenta sin mapeo' if len(tipos_sin_mapeo) > 0 else 'Todos los tipos de cuenta tienen mapeo'
        }
    
    def get_periodos_inconsistentes(
        self,
        company_id: int
    ) -> Dict[str, Any]:
        """
        Detecta movimientos en períodos cerrados o asientos fuera de rango.
        """
        from ..domain.models import Period
        
        # Obtener períodos cerrados
        periodos_cerrados = (
            self.db.query(Period)
            .filter(
                Period.company_id == company_id,
                Period.closed == True
            )
            .all()
        )
        
        periodos_cerrados_ids = [p.id for p in periodos_cerrados]
        
        # Buscar asientos en períodos cerrados
        asientos_periodo_cerrado = (
            self.db.query(JournalEntry)
            .filter(
                JournalEntry.company_id == company_id,
                JournalEntry.period_id.in_(periodos_cerrados_ids),
                JournalEntry.status == "POSTED"
            )
            .all()
        )
        
        # Buscar asientos con fecha fuera del rango del período
        asientos_fuera_rango = []
        for periodo in periodos_cerrados:
            asientos = (
                self.db.query(JournalEntry)
                .filter(
                    JournalEntry.company_id == company_id,
                    JournalEntry.period_id == periodo.id,
                    or_(
                        JournalEntry.date < periodo.start_date,
                        JournalEntry.date > periodo.end_date
                    ),
                    JournalEntry.status == "POSTED"
                )
                .all()
            )
            asientos_fuera_rango.extend(asientos)
        
        return {
            'periodos_cerrados': [
                {
                    'period_id': p.id,
                    'year': p.year,
                    'month': p.month,
                    'start_date': p.start_date.isoformat() if p.start_date else None,
                    'end_date': p.end_date.isoformat() if p.end_date else None
                }
                for p in periodos_cerrados
            ],
            'asientos_periodo_cerrado': [
                {
                    'asiento_id': a.id,
                    'fecha': a.date.isoformat(),
                    'period_id': a.period_id,
                    'glosa': a.glosa or ''
                }
                for a in asientos_periodo_cerrado
            ],
            'asientos_fuera_rango': [
                {
                    'asiento_id': a.id,
                    'fecha': a.date.isoformat(),
                    'period_id': a.period_id,
                    'glosa': a.glosa or ''
                }
                for a in asientos_fuera_rango
            ],
            'totales': {
                'periodos_cerrados': len(periodos_cerrados),
                'asientos_periodo_cerrado': len(asientos_periodo_cerrado),
                'asientos_fuera_rango': len(asientos_fuera_rango)
            }
        }
    
    def get_kardex_valorizado(
        self,
        company_id: int,
        product_id: Optional[int] = None,
        almacen_id: Optional[int] = None,
        fecha_desde: Optional[date] = None,
        fecha_hasta: Optional[date] = None
    ) -> Dict[str, Any]:
        """
        Obtiene el Kardex Valorizado.
        
        Fuente: Movimientos de Inventario + asientos de inventario.
        Valida: Saldo físico = saldo contable.
        """
        # Query base para movimientos
        query = (
            self.db.query(InventoryMovement)
            .filter(InventoryMovement.company_id == company_id)
        )
        
        if product_id:
            query = query.filter(InventoryMovement.producto_id == product_id)
        
        if almacen_id:
            query = query.filter(InventoryMovement.almacen_id == almacen_id)
        
        if fecha_desde:
            query = query.filter(InventoryMovement.fecha >= fecha_desde)
        
        if fecha_hasta:
            query = query.filter(InventoryMovement.fecha <= fecha_hasta)
        
        query = query.order_by(
            InventoryMovement.fecha,
            InventoryMovement.id
        )
        
        movimientos = query.all()
        
        # Calcular saldos acumulados
        saldo_cantidad = Decimal('0')
        saldo_valor = Decimal('0')
        kardex_rows = []
        
        # Obtener productos y almacenes para enriquecer datos
        productos_dict = {}
        almacenes_dict = {}
        
        if movimientos:
            producto_ids = list(set([m.producto_id for m in movimientos if m.producto_id]))
            almacen_ids = list(set([m.almacen_id for m in movimientos if m.almacen_id]))
            
            if producto_ids:
                productos = (
                    self.db.query(Product)
                    .filter(Product.id.in_(producto_ids))
                    .all()
                )
                productos_dict = {p.id: p for p in productos}
            
            if almacen_ids:
                almacenes = (
                    self.db.query(Almacen)
                    .filter(Almacen.id.in_(almacen_ids))
                    .all()
                )
                almacenes_dict = {a.id: a for a in almacenes}
        
        for mov in movimientos:
            if mov.tipo == 'ENTRADA':
                saldo_cantidad += mov.cantidad
                saldo_valor += mov.costo_total
            elif mov.tipo == 'SALIDA':
                # Calcular costo promedio antes de la salida
                costo_promedio = saldo_valor / saldo_cantidad if saldo_cantidad > 0 else Decimal('0')
                costo_salida = costo_promedio * mov.cantidad
                saldo_cantidad -= mov.cantidad
                saldo_valor -= costo_salida
            elif mov.tipo == 'AJUSTE':
                # Ajuste puede aumentar o disminuir
                diferencia_cantidad = mov.cantidad
                diferencia_valor = mov.costo_total
                saldo_cantidad += diferencia_cantidad
                saldo_valor += diferencia_valor
            
            costo_promedio_actual = saldo_valor / saldo_cantidad if saldo_cantidad > 0 else Decimal('0')
            
            # Obtener información del producto y almacén
            producto = productos_dict.get(mov.producto_id) if mov.producto_id else None
            almacen = almacenes_dict.get(mov.almacen_id) if mov.almacen_id else None
            
            kardex_rows.append({
                'fecha': mov.fecha.isoformat(),
                'tipo': mov.tipo,
                'producto_id': mov.producto_id,
                'producto_codigo': producto.code if producto else None,
                'producto_nombre': producto.name if producto else None,
                'almacen_id': mov.almacen_id,
                'almacen_codigo': almacen.codigo if almacen else None,
                'almacen_nombre': almacen.nombre if almacen else None,
                'cantidad': float(mov.cantidad),
                'costo_unitario': float(mov.costo_unitario),
                'costo_total': float(mov.costo_total),
                'saldo_cantidad': float(saldo_cantidad),
                'costo_promedio': float(costo_promedio_actual),
                'saldo_valor': float(saldo_valor),
                'journal_entry_id': mov.journal_entry_id,
                'glosa': mov.glosa or ''
            })
        
        # Obtener stock actual (físico)
        stock_query = (
            self.db.query(Stock)
            .filter(Stock.company_id == company_id)
        )
        
        if product_id:
            stock_query = stock_query.filter(Stock.producto_id == product_id)
        
        if almacen_id:
            stock_query = stock_query.filter(Stock.almacen_id == almacen_id)
        
        stocks = stock_query.all()
        
        # Validar: Saldo físico = saldo contable
        validaciones = []
        for stock in stocks:
            # Calcular saldo contable desde movimientos
            movimientos_producto = [
                m for m in movimientos
                if m.producto_id == stock.producto_id and m.almacen_id == stock.almacen_id
            ]
            
            saldo_contable_cantidad = Decimal('0')
            saldo_contable_valor = Decimal('0')
            
            for mov in movimientos_producto:
                if mov.tipo == 'ENTRADA':
                    saldo_contable_cantidad += mov.cantidad
                    saldo_contable_valor += mov.costo_total
                elif mov.tipo == 'SALIDA':
                    costo_promedio = saldo_contable_valor / saldo_contable_cantidad if saldo_contable_cantidad > 0 else Decimal('0')
                    costo_salida = costo_promedio * mov.cantidad
                    saldo_contable_cantidad -= mov.cantidad
                    saldo_contable_valor -= costo_salida
                elif mov.tipo == 'AJUSTE':
                    saldo_contable_cantidad += mov.cantidad
                    saldo_contable_valor += mov.costo_total
            
            diferencia_cantidad = abs(float(stock.cantidad_actual) - float(saldo_contable_cantidad))
            diferencia_valor = abs(float(stock.costo_promedio * stock.cantidad_actual) - float(saldo_contable_valor))
            
            cuadra = diferencia_cantidad < 0.01 and diferencia_valor < 0.01
            
            validaciones.append({
                'producto_id': stock.producto_id,
                'almacen_id': stock.almacen_id,
                'stock_fisico_cantidad': float(stock.cantidad_actual),
                'stock_contable_cantidad': float(saldo_contable_cantidad),
                'stock_fisico_valor': float(stock.costo_promedio * stock.cantidad_actual),
                'stock_contable_valor': float(saldo_contable_valor),
                'diferencia_cantidad': diferencia_cantidad,
                'diferencia_valor': diferencia_valor,
                'cuadra': cuadra
            })
        
        return {
            'kardex': kardex_rows,
            'stocks': [
                {
                    'producto_id': s.producto_id,
                    'almacen_id': s.almacen_id,
                    'cantidad_actual': float(s.cantidad_actual),
                    'costo_promedio': float(s.costo_promedio),
                    'valor_total': float(s.costo_promedio * s.cantidad_actual)
                }
                for s in stocks
            ],
            'validaciones': validaciones,
            'total_movimientos': len(kardex_rows)
        }
    
    def get_saldos_por_cliente(
        self,
        company_id: int,
        customer_id: Optional[int] = None,
        fecha_corte: Optional[date] = None
    ) -> List[Dict[str, Any]]:
        """
        Obtiene saldos por cliente (Cuentas por Cobrar - CxC).
        
        Fuente: Asientos de CLIENTES + Tesorería.
        """
        from ..application.services_tesoreria import TesoreriaService
        
        # Obtener todas las ventas
        query = (
            self.db.query(Sale)
            .filter(Sale.company_id == company_id)
        )
        
        if customer_id:
            query = query.filter(Sale.customer_id == customer_id)
        
        ventas = query.all()
        
        # Calcular saldo pendiente para cada venta
        tesoreria = TesoreriaService(self.uow)
        resultados = []
        
        for venta in ventas:
            saldo_pendiente = tesoreria._calcular_saldo_pendiente_venta(venta.id, company_id)
            
            if saldo_pendiente > Decimal('0.01') or not customer_id:  # Mostrar todas si no hay filtro
                # Calcular antigüedad
                dias_antiguedad = (fecha_corte or date.today()) - venta.issue_date
                
                resultados.append({
                    'customer_id': venta.customer_id,
                    'venta_id': venta.id,
                    'doc_type': venta.doc_type,
                    'series': venta.series,
                    'number': venta.number,
                    'fecha_emision': venta.issue_date.isoformat(),
                    'total': float(venta.total_amount),
                    'saldo_pendiente': float(saldo_pendiente),
                    'dias_antiguedad': dias_antiguedad.days,
                    'journal_entry_id': venta.journal_entry_id
                })
        
        # Ordenar por antigüedad (más antiguo primero)
        resultados.sort(key=lambda x: x['dias_antiguedad'], reverse=True)
        
        return resultados
    
    def get_saldos_por_proveedor(
        self,
        company_id: int,
        supplier_id: Optional[int] = None,
        fecha_corte: Optional[date] = None
    ) -> List[Dict[str, Any]]:
        """
        Obtiene saldos por proveedor (Cuentas por Pagar - CxP).
        
        Similar a clientes.
        """
        from ..application.services_tesoreria import TesoreriaService
        
        # Obtener todas las compras
        query = (
            self.db.query(Purchase)
            .filter(Purchase.company_id == company_id)
        )
        
        if supplier_id:
            query = query.filter(Purchase.supplier_id == supplier_id)
        
        compras = query.all()
        
        # Calcular saldo pendiente para cada compra
        tesoreria = TesoreriaService(self.uow)
        resultados = []
        
        for compra in compras:
            saldo_pendiente = tesoreria._calcular_saldo_pendiente_compra(compra.id, company_id)
            
            if saldo_pendiente > Decimal('0.01') or not supplier_id:  # Mostrar todas si no hay filtro
                # Calcular antigüedad
                dias_antiguedad = (fecha_corte or date.today()) - compra.issue_date
                
                resultados.append({
                    'supplier_id': compra.supplier_id,
                    'compra_id': compra.id,
                    'doc_type': compra.doc_type,
                    'series': compra.series,
                    'number': compra.number,
                    'fecha_emision': compra.issue_date.isoformat(),
                    'total': float(compra.total_amount),
                    'saldo_pendiente': float(saldo_pendiente),
                    'dias_antiguedad': dias_antiguedad.days,
                    'journal_entry_id': compra.journal_entry_id
                })
        
        # Ordenar por antigüedad (más antiguo primero)
        resultados.sort(key=lambda x: x['dias_antiguedad'], reverse=True)
        
        return resultados
    
    def get_trazabilidad_total(
        self,
        company_id: int,
        asiento_id: int
    ) -> Dict[str, Any]:
        """
        Trazabilidad Total de un asiento.
        
        Muestra:
        - Módulo origen
        - Documento
        - Evento contable
        - Reglas aplicadas
        - Hash de contexto (si existe)
        """
        from ..domain.models_journal_engine import EventoContable, ReglaContable
        
        asiento = (
            self.db.query(JournalEntry)
            .filter(
                JournalEntry.id == asiento_id,
                JournalEntry.company_id == company_id
            )
            .first()
        )
        
        if not asiento:
            return {
                'error': f'Asiento {asiento_id} no encontrado'
            }
        
        # Obtener líneas del asiento
        lineas = (
            self.db.query(EntryLine)
            .filter(EntryLine.entry_id == asiento_id)
            .all()
        )
        
        # Determinar documento origen según el origin
        documento_origen = None
        if asiento.origin == 'VENTAS':
            documento = (
                self.db.query(Sale)
                .filter(
                    Sale.journal_entry_id == asiento_id,
                    Sale.company_id == company_id
                )
                .first()
            )
            if documento:
                documento_origen = {
                    'tipo': 'VENTA',
                    'id': documento.id,
                    'doc_type': documento.doc_type,
                    'series': documento.series,
                    'number': documento.number,
                    'fecha': documento.issue_date.isoformat(),
                    'total': float(documento.total_amount)
                }
        elif asiento.origin == 'COMPRAS':
            documento = (
                self.db.query(Purchase)
                .filter(
                    Purchase.journal_entry_id == asiento_id,
                    Purchase.company_id == company_id
                )
                .first()
            )
            if documento:
                documento_origen = {
                    'tipo': 'COMPRA',
                    'id': documento.id,
                    'doc_type': documento.doc_type,
                    'series': documento.series,
                    'number': documento.number,
                    'fecha': documento.issue_date.isoformat(),
                    'total': float(documento.total_amount)
                }
        elif asiento.origin == 'TESORERIA':
            movimiento = (
                self.db.query(MovimientoTesoreria)
                .filter(
                    MovimientoTesoreria.journal_entry_id == asiento_id,
                    MovimientoTesoreria.company_id == company_id
                )
                .first()
            )
            if movimiento:
                documento_origen = {
                    'tipo': 'MOVIMIENTO_TESORERIA',
                    'id': movimiento.id,
                    'tipo_movimiento': movimiento.tipo,
                    'monto': float(movimiento.monto),
                    'fecha': movimiento.fecha.isoformat(),
                    'referencia_tipo': movimiento.referencia_tipo,
                    'referencia_id': movimiento.referencia_id
                }
        elif asiento.origin == 'INVENTARIOS':
            movimiento = (
                self.db.query(InventoryMovement)
                .filter(
                    InventoryMovement.journal_entry_id == asiento_id,
                    InventoryMovement.company_id == company_id
                )
                .first()
            )
            if movimiento:
                documento_origen = {
                    'tipo': 'MOVIMIENTO_INVENTARIO',
                    'id': movimiento.id,
                    'tipo_movimiento': movimiento.tipo,
                    'producto_id': movimiento.producto_id,
                    'cantidad': float(movimiento.cantidad),
                    'costo_total': float(movimiento.costo_total),
                    'fecha': movimiento.fecha.isoformat()
                }
        
        # Buscar evento contable relacionado (si existe en metadata o glosa)
        # Por ahora, inferimos del origin
        evento_contable = None
        if asiento.origin:
            eventos_posibles = (
                self.db.query(EventoContable)
                .filter(EventoContable.company_id == company_id)
                .all()
            )
            # Intentar encontrar evento por nombre/origin
            for evt in eventos_posibles:
                if asiento.origin in evt.nombre.upper() or asiento.origin in evt.codigo.upper():
                    evento_contable = {
                        'codigo': evt.codigo,
                        'nombre': evt.nombre,
                        'categoria': evt.categoria
                    }
                    break
        
        return {
            'asiento': {
                'id': asiento.id,
                'fecha': asiento.date.isoformat(),
                'glosa': asiento.glosa or '',
                'origin': asiento.origin or 'MANUAL',
                'status': asiento.status,
                'currency': asiento.currency,
                'period_id': asiento.period_id,
                'motor_metadata': asiento.motor_metadata
            },
            'documento_origen': documento_origen,
            'evento_contable': evento_contable,
            'lineas': [
                {
                    'account_id': l.account_id,
                    'debit': float(l.debit),
                    'credit': float(l.credit),
                    'memo': l.memo or ''
                }
                for l in lineas
            ],
            'total_debe': float(sum(l.debit for l in lineas)),
            'total_haber': float(sum(l.credit for l in lineas)),
            'cuadra': abs(sum(l.debit for l in lineas) - sum(l.credit for l in lineas)) < Decimal('0.01')
        }
    
    def get_cambios_y_reversiones(
        self,
        company_id: int,
        fecha_desde: Optional[date] = None,
        fecha_hasta: Optional[date] = None
    ) -> Dict[str, Any]:
        """
        Detecta cambios y reversiones.
        
        - Asientos revertidos (status = VOIDED)
        - Ajustes manuales
        - Notas de crédito/débito
        """
        # Asientos revertidos
        asientos_revertidos = (
            self.db.query(JournalEntry)
            .filter(
                JournalEntry.company_id == company_id,
                JournalEntry.status == "VOIDED"
            )
        )
        
        if fecha_desde:
            asientos_revertidos = asientos_revertidos.filter(JournalEntry.date >= fecha_desde)
        
        if fecha_hasta:
            asientos_revertidos = asientos_revertidos.filter(JournalEntry.date <= fecha_hasta)
        
        asientos_revertidos = asientos_revertidos.all()
        
        # Notas de crédito y débito
        notas = (
            self.db.query(NotaDocumento)
            .filter(NotaDocumento.company_id == company_id)
        )
        
        if fecha_desde:
            notas = notas.filter(NotaDocumento.fecha_emision >= fecha_desde)
        
        if fecha_hasta:
            notas = notas.filter(NotaDocumento.fecha_emision <= fecha_hasta)
        
        notas = notas.all()
        
        # Ajustes manuales (asientos con origin = MANUAL)
        ajustes_manuales = (
            self.db.query(JournalEntry)
            .filter(
                JournalEntry.company_id == company_id,
                JournalEntry.origin == 'MANUAL',
                JournalEntry.status == "POSTED"
            )
        )
        
        if fecha_desde:
            ajustes_manuales = ajustes_manuales.filter(JournalEntry.date >= fecha_desde)
        
        if fecha_hasta:
            ajustes_manuales = ajustes_manuales.filter(JournalEntry.date <= fecha_hasta)
        
        ajustes_manuales = ajustes_manuales.all()
        
        return {
            'asientos_revertidos': [
                {
                    'asiento_id': a.id,
                    'fecha': a.date.isoformat(),
                    'glosa': a.glosa or '',
                    'origin': a.origin or 'MANUAL',
                    'fecha_reversion': a.updated_at.isoformat() if a.updated_at else None
                }
                for a in asientos_revertidos
            ],
            'notas': [
                {
                    'nota_id': n.id,
                    'tipo': n.tipo,
                    'origen': n.origen,
                    'serie': n.serie,
                    'numero': n.numero,
                    'fecha': n.fecha_emision.isoformat(),
                    'total': float(n.total),
                    'journal_entry_id': n.journal_entry_id
                }
                for n in notas
            ],
            'ajustes_manuales': [
                {
                    'asiento_id': a.id,
                    'fecha': a.date.isoformat(),
                    'glosa': a.glosa or '',
                    'created_at': a.created_at.isoformat() if a.created_at else None
                }
                for a in ajustes_manuales
            ],
            'totales': {
                'asientos_revertidos': len(asientos_revertidos),
                'notas': len(notas),
                'ajustes_manuales': len(ajustes_manuales)
            }
        }
    
    def get_dashboard_summary(
        self,
        company_id: int,
        period_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Obtiene el resumen del Dashboard.
        
        Calcula métricas desde asientos contables:
        - cash_and_banks: Saldo de cuentas CAJA y BANCO
        - igv_por_pagar: IGV Débito Fiscal - IGV Crédito Fiscal
        - accounts_receivable: Saldo de cuentas CLIENTES
        - accounts_payable: Saldo de cuentas PROVEEDORES
        - total_purchases: Total de compras del período
        - total_sales: Total de ventas del período
        """
        from ..domain.models_journal_engine import TipoCuentaMapeo
        from ..application.services_tesoreria import TesoreriaService
        
        # Obtener mapeos de tipos de cuenta
        mapeos = (
            self.db.query(TipoCuentaMapeo)
            .filter(TipoCuentaMapeo.company_id == company_id)
            .all()
        )
        
        # Crear diccionarios de mapeo
        cuenta_caja_ids = []
        cuenta_banco_ids = []
        cuenta_clientes_ids = []
        cuenta_proveedores_ids = []
        cuenta_igv_debito_ids = []
        cuenta_igv_credito_ids = []
        
        for mapeo in mapeos:
            if mapeo.tipo_cuenta == 'CAJA':
                cuenta_caja_ids.append(mapeo.account_id)
            elif mapeo.tipo_cuenta == 'BANCO':
                cuenta_banco_ids.append(mapeo.account_id)
            elif mapeo.tipo_cuenta == 'CLIENTES':
                cuenta_clientes_ids.append(mapeo.account_id)
            elif mapeo.tipo_cuenta == 'PROVEEDORES':
                cuenta_proveedores_ids.append(mapeo.account_id)
            elif mapeo.tipo_cuenta == 'IGV_DEBITO':
                cuenta_igv_debito_ids.append(mapeo.account_id)
            elif mapeo.tipo_cuenta == 'IGV_CREDITO':
                cuenta_igv_credito_ids.append(mapeo.account_id)
        
        # Si no hay mapeos, buscar por código de cuenta
        if not cuenta_caja_ids:
            cuentas_caja = (
                self.db.query(Account)
                .filter(
                    Account.company_id == company_id,
                    Account.code.like('10%')
                )
                .all()
            )
            cuenta_caja_ids = [c.id for c in cuentas_caja]
        
        if not cuenta_banco_ids:
            cuentas_banco = (
                self.db.query(Account)
                .filter(
                    Account.company_id == company_id,
                    Account.code.like('104%')
                )
                .all()
            )
            cuenta_banco_ids = [c.id for c in cuentas_banco]
        
        if not cuenta_clientes_ids:
            cuentas_clientes = (
                self.db.query(Account)
                .filter(
                    Account.company_id == company_id,
                    Account.code.like('12%')
                )
                .all()
            )
            cuenta_clientes_ids = [c.id for c in cuentas_clientes]
        
        if not cuenta_proveedores_ids:
            cuentas_proveedores = (
                self.db.query(Account)
                .filter(
                    Account.company_id == company_id,
                    Account.code.like('42%')
                )
                .all()
            )
            cuenta_proveedores_ids = [c.id for c in cuentas_proveedores]
        
        # Query base para líneas de asientos
        query_base = (
            self.db.query(EntryLine)
            .join(JournalEntry, JournalEntry.id == EntryLine.entry_id)
            .filter(
                JournalEntry.company_id == company_id,
                JournalEntry.status == "POSTED"
            )
        )
        
        if period_id:
            query_base = query_base.filter(JournalEntry.period_id == period_id)
        
        # Calcular saldos (DEBE - HABER para activos, HABER - DEBE para pasivos)
        # Caja + Bancos (Activos - saldo = DEBE - HABER)
        cash_and_banks = Decimal('0')
        if cuenta_caja_ids or cuenta_banco_ids:
            todas_cuentas = cuenta_caja_ids + cuenta_banco_ids
            if todas_cuentas:
                saldo_caja_banco = (
                    query_base
                    .filter(EntryLine.account_id.in_(todas_cuentas))
                    .with_entities(
                        func.sum(EntryLine.debit - EntryLine.credit).label('saldo')
                    )
                    .scalar() or Decimal('0')
                )
                cash_and_banks = saldo_caja_banco
        
        # Clientes (Activos - saldo = DEBE - HABER)
        accounts_receivable = Decimal('0')
        if cuenta_clientes_ids:
            saldo_clientes = (
                query_base
                .filter(EntryLine.account_id.in_(cuenta_clientes_ids))
                .with_entities(
                    func.sum(EntryLine.debit - EntryLine.credit).label('saldo')
                )
                .scalar() or Decimal('0')
            )
            accounts_receivable = saldo_clientes
        
        # Proveedores (Pasivos - saldo = HABER - DEBE)
        accounts_payable = Decimal('0')
        if cuenta_proveedores_ids:
            saldo_proveedores = (
                query_base
                .filter(EntryLine.account_id.in_(cuenta_proveedores_ids))
                .with_entities(
                    func.sum(EntryLine.credit - EntryLine.debit).label('saldo')
                )
                .scalar() or Decimal('0')
            )
            accounts_payable = saldo_proveedores
        
        # IGV por Pagar = IGV Débito Fiscal - IGV Crédito Fiscal
        igv_debito = Decimal('0')
        if cuenta_igv_debito_ids:
            saldo_igv_debito = (
                query_base
                .filter(EntryLine.account_id.in_(cuenta_igv_debito_ids))
                .with_entities(
                    func.sum(EntryLine.credit - EntryLine.debit).label('saldo')
                )
                .scalar() or Decimal('0')
            )
            igv_debito = saldo_igv_debito
        
        igv_credito = Decimal('0')
        if cuenta_igv_credito_ids:
            saldo_igv_credito = (
                query_base
                .filter(EntryLine.account_id.in_(cuenta_igv_credito_ids))
                .with_entities(
                    func.sum(EntryLine.debit - EntryLine.credit).label('saldo')
                )
                .scalar() or Decimal('0')
            )
            igv_credito = saldo_igv_credito
        
        igv_por_pagar = igv_debito - igv_credito
        
        # Total de compras y ventas del período
        total_purchases = Decimal('0')
        total_sales = Decimal('0')
        
        purchases_query = (
            self.db.query(Purchase)
            .filter(Purchase.company_id == company_id)
        )
        if period_id:
            period_obj = self.db.query(Period).filter(Period.id == period_id).first()
            if period_obj:
                purchases_query = purchases_query.filter(
                    func.extract('year', Purchase.issue_date) == period_obj.year,
                    func.extract('month', Purchase.issue_date) == period_obj.month
                )
        
        purchases = purchases_query.all()
        total_purchases = sum(p.total_amount for p in purchases)
        
        sales_query = (
            self.db.query(Sale)
            .filter(Sale.company_id == company_id)
        )
        if period_id:
            period_obj = self.db.query(Period).filter(Period.id == period_id).first()
            if period_obj:
                sales_query = sales_query.filter(
                    func.extract('year', Sale.issue_date) == period_obj.year,
                    func.extract('month', Sale.issue_date) == period_obj.month
                )
        
        sales = sales_query.all()
        total_sales = sum(s.total_amount for s in sales)
        
        # Actividades recientes (últimos asientos, compras, ventas)
        recent_activities = []
        
        # Últimos asientos
        recent_entries = (
            self.db.query(JournalEntry)
            .filter(
                JournalEntry.company_id == company_id,
                JournalEntry.status == "POSTED"
            )
            .order_by(JournalEntry.date.desc(), JournalEntry.id.desc())
            .limit(10)
            .all()
        )
        
        for entry in recent_entries:
            total_debe = sum(l.debit for l in entry.lines)
            total_haber = sum(l.credit for l in entry.lines)
            recent_activities.append({
                'type': 'asiento',
                'description': entry.glosa or f'Asiento #{entry.id}',
                'amount': float(max(total_debe, total_haber)),
                'date': entry.date.isoformat(),
                'status': entry.status
            })
        
        # Últimas compras
        recent_purchases = (
            self.db.query(Purchase)
            .filter(Purchase.company_id == company_id)
            .order_by(Purchase.issue_date.desc(), Purchase.id.desc())
            .limit(5)
            .all()
        )
        
        for purchase in recent_purchases:
            recent_activities.append({
                'type': 'compra',
                'description': f'{purchase.doc_type} {purchase.series}-{purchase.number}',
                'amount': float(purchase.total_amount),
                'date': purchase.issue_date.isoformat(),
                'status': 'POSTED'
            })
        
        # Últimas ventas
        recent_sales = (
            self.db.query(Sale)
            .filter(Sale.company_id == company_id)
            .order_by(Sale.issue_date.desc(), Sale.id.desc())
            .limit(5)
            .all()
        )
        
        for sale in recent_sales:
            recent_activities.append({
                'type': 'venta',
                'description': f'{sale.doc_type} {sale.series}-{sale.number}',
                'amount': float(sale.total_amount),
                'date': sale.issue_date.isoformat(),
                'status': 'POSTED'
            })
        
        # Ordenar actividades por fecha (más recientes primero)
        recent_activities.sort(key=lambda x: x['date'], reverse=True)
        recent_activities = recent_activities[:10]  # Limitar a 10
        
        return {
            'metrics': {
                'cash_and_banks': float(cash_and_banks),
                'igv_por_pagar': float(igv_por_pagar),
                'accounts_receivable': float(accounts_receivable),
                'accounts_payable': float(accounts_payable),
                'total_purchases': float(total_purchases),
                'total_sales': float(total_sales)
            },
            'recent_activities': recent_activities
        }
    
    def get_igv_por_pagar(
        self,
        company_id: int,
        period_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Calcula el IGV por pagar.
        
        IGV por Pagar = IGV Débito Fiscal - IGV Crédito Fiscal
        """
        from ..domain.models_journal_engine import TipoCuentaMapeo
        
        # Obtener mapeos de tipos de cuenta
        mapeos = (
            self.db.query(TipoCuentaMapeo)
            .filter(TipoCuentaMapeo.company_id == company_id)
            .all()
        )
        
        cuenta_igv_debito_ids = []
        cuenta_igv_credito_ids = []
        
        for mapeo in mapeos:
            if mapeo.tipo_cuenta == 'IGV_DEBITO':
                cuenta_igv_debito_ids.append(mapeo.account_id)
            elif mapeo.tipo_cuenta == 'IGV_CREDITO':
                cuenta_igv_credito_ids.append(mapeo.account_id)
        
        # Si no hay mapeos, buscar por código de cuenta
        # IGV_DEBITO debe ser un Pasivo (40.10 según la BD actual)
        if not cuenta_igv_debito_ids:
            cuentas_igv_debito = (
                self.db.query(Account)
                .filter(
                    Account.company_id == company_id,
                    Account.code.like('40.10%')
                )
                .all()
            )
            cuenta_igv_debito_ids = [c.id for c in cuentas_igv_debito]
        
        # IGV_CREDITO debe ser un Activo (40.11 según la BD actual)
        if not cuenta_igv_credito_ids:
            cuentas_igv_credito = (
                self.db.query(Account)
                .filter(
                    Account.company_id == company_id,
                    Account.code.like('40.11%')
                )
                .all()
            )
            cuenta_igv_credito_ids = [c.id for c in cuentas_igv_credito]
        
        # Query base para líneas de asientos
        query_base = (
            self.db.query(EntryLine)
            .join(JournalEntry, JournalEntry.id == EntryLine.entry_id)
            .filter(
                JournalEntry.company_id == company_id,
                JournalEntry.status == "POSTED"
            )
        )
        
        if period_id:
            query_base = query_base.filter(JournalEntry.period_id == period_id)
        
        # IGV Débito Fiscal (Pasivo - saldo = HABER - DEBE)
        igv_debito = Decimal('0')
        if cuenta_igv_debito_ids:
            saldo_igv_debito = (
                query_base
                .filter(EntryLine.account_id.in_(cuenta_igv_debito_ids))
                .with_entities(
                    func.sum(EntryLine.credit - EntryLine.debit).label('saldo')
                )
                .scalar() or Decimal('0')
            )
            igv_debito = saldo_igv_debito
        
        # IGV Crédito Fiscal (Activo - saldo = DEBE - HABER)
        igv_credito = Decimal('0')
        if cuenta_igv_credito_ids:
            saldo_igv_credito = (
                query_base
                .filter(EntryLine.account_id.in_(cuenta_igv_credito_ids))
                .with_entities(
                    func.sum(EntryLine.debit - EntryLine.credit).label('saldo')
                )
                .scalar() or Decimal('0')
            )
            igv_credito = saldo_igv_credito
        
        igv_por_pagar = igv_debito - igv_credito
        
        # Obtener período
        period_str = None
        if period_id:
            period = self.db.query(Period).filter(Period.id == period_id).first()
            if period:
                period_str = f"{period.year}-{period.month:02d}"
        
        return {
            'igv_por_pagar': float(igv_por_pagar),
            'period': period_str
        }
    
    def get_detractions_summary(
        self,
        company_id: int,
        period_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Calcula el resumen de detracciones.
        
        - detracciones_acumuladas: Total de detracciones en ventas
        - detracciones_usadas: Total de detracciones usadas para pagar IGV
        - detracciones_disponibles: detracciones_acumuladas - detracciones_usadas
        """
        # Obtener total de detracciones de ventas
        sales_query = (
            self.db.query(Sale)
            .filter(Sale.company_id == company_id)
        )
        
        if period_id:
            period_obj = self.db.query(Period).filter(Period.id == period_id).first()
            if period_obj:
                sales_query = sales_query.filter(
                    func.extract('year', Sale.issue_date) == period_obj.year,
                    func.extract('month', Sale.issue_date) == period_obj.month
                )
        
        sales = sales_query.all()
        detracciones_acumuladas = sum(s.detraction_amount or Decimal('0') for s in sales)
        
        # Por ahora, detracciones_usadas = 0 (se implementará cuando se registre el pago de IGV con detracciones)
        detracciones_usadas = Decimal('0')
        detracciones_disponibles = detracciones_acumuladas - detracciones_usadas
        
        # Detracciones por período
        detracciones_por_periodo = []
        if period_id:
            period_obj = self.db.query(Period).filter(Period.id == period_id).first()
            if period_obj:
                detracciones_por_periodo.append({
                    'period': f"{period_obj.year}-{period_obj.month:02d}",
                    'amount': float(detracciones_acumuladas)
                })
        
        return {
            'detracciones_acumuladas': float(detracciones_acumuladas),
            'detracciones_usadas': float(detracciones_usadas),
            'detracciones_disponibles': float(detracciones_disponibles),
            'detracciones_por_periodo': detracciones_por_periodo
        }

