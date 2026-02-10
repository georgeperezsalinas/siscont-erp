# services_journal_engine_SAP.py
# VERSION SAP – Motor de Asientos (estricto, determinístico, auditable)

from decimal import Decimal
from datetime import date, datetime
from typing import List, Dict, Any, Optional
import json, hashlib, uuid, os, logging

from ..domain.models import Account, JournalEntry, EntryLine, Period
from ..domain.enums import AccountType
from ..domain.models_journal_engine import (
    EventoContable, ReglaContable, TipoCuentaMapeo,
    LadoAsiento, TipoMonto
)
from ..infrastructure.unit_of_work import UnitOfWork
from .validations_journal_engine import (
    validar_mapeo_sensible,
    validar_periodo_abierto,
    validar_cuenta_activa,
    validar_asiento_cuadra,
    MapeoInvalidoError,
    CuentaInactivaError,
    PeriodoCerradoError
)

logger = logging.getLogger(__name__)

class MotorAsientosError(Exception):
    pass

class CuentaNoMapeadaError(MotorAsientosError):
    pass

class AsientoDescuadradoError(MotorAsientosError):
    pass

class EngineRunLog:
    def __init__(self, *, evento_tipo: str, company_id: int, origin: str, fecha: date, glosa: str, datos_operacion: Dict[str, Any]):
        self.run_id = uuid.uuid4().hex
        self.started_at = datetime.utcnow().isoformat()
        self.evento_tipo = evento_tipo
        self.company_id = company_id
        self.origin = origin
        self.fecha = str(fecha)
        self.glosa = glosa
        self.datos_operacion_keys = sorted(list(datos_operacion.keys())) if isinstance(datos_operacion, dict) else []
        self.steps = []
        self.errors = []
        self.warnings = []

    def _add(self, level, action, details=None):
        self.steps.append({"ts": datetime.utcnow().isoformat(), "level": level, "action": action, "details": details or {}})

    def info(self, a, d=None): self._add("INFO", a, d)
    def warn(self, a, d=None):
        self.warnings.append({"ts": datetime.utcnow().isoformat(), "action": a, "details": d or {}})
        self._add("WARN", a, d)
    def error(self, a, d=None):
        self.errors.append({"ts": datetime.utcnow().isoformat(), "action": a, "details": d or {}})
        self._add("ERROR", a, d)

    def to_metadata(self):
        return {
            "engine_run_id": self.run_id,
            "engine_started_at": self.started_at,
            "evento_tipo": self.evento_tipo,
            "company_id": self.company_id,
            "origin": self.origin,
            "fecha": self.fecha,
            "glosa": self.glosa,
            "datos_operacion_keys": self.datos_operacion_keys,
            "warnings": self.warnings,
            "errors": self.errors,
            "steps": self.steps,
        }

class MotorAsientos:
    _VENTAS = {"VENTA", "NOTA_DEBITO_VENTA", "NOTA_CREDITO_VENTA"}
    _COMPRAS = {"COMPRA", "NOTA_DEBITO_COMPRA", "NOTA_CREDITO_COMPRA", "DEVOLUCION_COMPRA"}
    _TESORERIA = {"PAGO", "PAGO_CAJA", "PAGO_BANCO", "COBRO", "COBRO_CAJA", "COBRO_BANCO"}

    def __init__(self, uow: UnitOfWork, strict_mode: bool | None = None):
        self.uow = uow
        env_flag = os.getenv("JOURNAL_ENGINE_STRICT", "1")
        self.strict_mode = strict_mode if strict_mode is not None else env_flag not in ("0","false","False")

    def _validar_invariantes_evento(self, evento_tipo: str, tipo_cuenta: str):
        ev = (evento_tipo or "").upper().strip()
        tc = (tipo_cuenta or "").upper().strip()

        if ev in self._VENTAS and tc == "IGV_CREDITO":
            raise MapeoInvalidoError("SAP_RULE: Ventas no pueden usar IGV_CREDITO")
        if ev in self._COMPRAS and tc == "IGV_DEBITO":
            raise MapeoInvalidoError("SAP_RULE: Compras no pueden usar IGV_DEBITO")
        if ev in self._TESORERIA and tc in {"IGV_CREDITO","IGV_DEBITO","INGRESO_VENTAS","GASTO_COMPRAS","COSTO_VENTAS"}:
            raise MapeoInvalidoError("SAP_RULE: Tesorería no afecta IGV/Ingresos/Gastos")

    def _validar_tipo_vs_accounttype(self, tipo_cuenta: str, cuenta: Account):
        expected = {
            "CAJA": AccountType.ASSET,
            "BANCO": AccountType.ASSET,
            "CLIENTES": AccountType.ASSET,
            "DETRACCIONES": AccountType.ASSET,
            "INVENTARIO": AccountType.ASSET,
            "ACTIVO_FIJO": AccountType.ASSET,
            "IGV_CREDITO": AccountType.ASSET,
            "PROVEEDORES": AccountType.LIABILITY,
            "IGV_DEBITO": AccountType.LIABILITY,
            "CAPITAL": AccountType.EQUITY,
            "RESERVAS": AccountType.EQUITY,
            "RESULTADOS": AccountType.EQUITY,
            "INGRESO_VENTAS": AccountType.INCOME,
            "INGRESO_OTROS": AccountType.INCOME,
            "GASTO_COMPRAS": AccountType.EXPENSE,
            "GASTO_VENTAS": AccountType.EXPENSE,
            "COSTO_VENTAS": AccountType.EXPENSE,
            "GASTO_OTROS": AccountType.EXPENSE,
        }
        exp = expected.get((tipo_cuenta or "").upper().strip())
        if exp and cuenta.type != exp:
            raise MapeoInvalidoError(f"SAP_RULE: {tipo_cuenta} debe mapear a {exp.value}")

    def generar_asiento(self, evento_tipo: str, datos_operacion: Dict[str,Any], company_id: int,
                        fecha: date, glosa: str, origin: str="MOTOR") -> JournalEntry:

        runlog = EngineRunLog(evento_tipo=evento_tipo, company_id=company_id, origin=origin,
                              fecha=fecha, glosa=glosa, datos_operacion=datos_operacion or {})
        runlog.info("START")

        evento = self.uow.db.query(EventoContable).filter_by(
            tipo=evento_tipo, company_id=company_id, activo=True
        ).first()
        if not evento:
            raise MotorAsientosError("Evento no encontrado")

        reglas = self.uow.db.query(ReglaContable).filter_by(
            evento_id=evento.id, company_id=company_id, activo=True
        ).order_by(ReglaContable.orden).all()
        if not reglas:
            raise MotorAsientosError("Evento sin reglas")

        lineas = []
        for regla in reglas:
            self._validar_invariantes_evento(evento_tipo, regla.tipo_cuenta)

            mapeo = self.uow.db.query(TipoCuentaMapeo).filter_by(
                tipo_cuenta=regla.tipo_cuenta, company_id=company_id, activo=True
            ).first()
            if not mapeo:
                raise CuentaNoMapeadaError(f"No hay mapeo para {regla.tipo_cuenta}")

            cuenta = mapeo.account
            self._validar_tipo_vs_accounttype(regla.tipo_cuenta, cuenta)

            ok, err = validar_cuenta_activa(cuenta)
            if not ok:
                raise CuentaInactivaError(err)

            monto = Decimal(str(datos_operacion.get("base" if regla.tipo_monto==TipoMonto.BASE.value else
                                                   "total" if regla.tipo_monto==TipoMonto.TOTAL.value else
                                                   "igv", 0))).quantize(Decimal("0.01"))

            if regla.lado == LadoAsiento.DEBE.value:
                lineas.append({"account_code": cuenta.code, "debit": monto, "credit": Decimal("0.00")})
            else:
                lineas.append({"account_code": cuenta.code, "debit": Decimal("0.00"), "credit": monto})

        total_debe = sum(l["debit"] for l in lineas)
        total_haber = sum(l["credit"] for l in lineas)
        ok, err = validar_asiento_cuadra(total_debe, total_haber)
        if not ok:
            raise AsientoDescuadradoError(err)

        periodo = self.uow.periods.get_or_open(company_id, fecha.year, fecha.month)
        ok, err = validar_periodo_abierto(periodo)
        if not ok:
            raise PeriodoCerradoError(err)

        entry = JournalEntry(company_id=company_id, date=fecha, period_id=periodo.id,
                             glosa=glosa, origin=origin, status="POSTED")
        entry.motor_metadata = runlog.to_metadata()

        entry.lines = [
            EntryLine(account_id=self.uow.accounts.by_code(company_id, l["account_code"]).id,
                      debit=l["debit"], credit=l["credit"])
            for l in lineas
        ]

        self.uow.journal.add_entry(entry)
        self.uow.db.flush()
        return entry
