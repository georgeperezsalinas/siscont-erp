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

logger = logging.getLogger("app.application.services_journal_engine")

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

    def to_metadata(self, datos_operacion: Optional[Dict[str, Any]] = None):
        meta = {
            "evento_tipo": self.evento_tipo,
            "engine_log": {
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
        }
        if self.evento_tipo == "PLANILLA_PROVISION" and datos_operacion:
            meta["planilla"] = {
                "periodo_planilla": datos_operacion.get("periodo_planilla"),
                "total_gasto": str(datos_operacion.get("total_gasto", 0)),
                "neto_trabajador": str(datos_operacion.get("neto_trabajador", 0)),
                "descuentos_trabajador": str(datos_operacion.get("descuentos_trabajador", 0)),
                "aportes_empleador": str(datos_operacion.get("aportes_empleador", 0)),
                "referencia_externa": datos_operacion.get("referencia_externa"),
            }
        return meta

_TIPO_MONTO_TO_KEY = {
    "BASE": "base", "IGV": "igv", "TOTAL": "total",
    "DESCUENTO": "descuento", "COSTO": "costo", "CANTIDAD": "cantidad",
    "TOTAL_GASTO": "total_gasto", "NETO_TRABAJADOR": "neto_trabajador",
    "DESCUENTOS_TRABAJADOR": "descuentos_trabajador", "APORTES_EMPLEADOR": "aportes_empleador",
}

class MotorAsientos:
    _VENTAS = {"VENTA", "NOTA_DEBITO_VENTA", "NOTA_CREDITO_VENTA"}
    _COMPRAS = {"COMPRA", "NOTA_DEBITO_COMPRA", "NOTA_CREDITO_COMPRA", "DEVOLUCION_COMPRA"}
    _TESORERIA = {"PAGO", "PAGO_CAJA", "PAGO_BANCO", "COBRO", "COBRO_CAJA", "COBRO_BANCO"}
    _PLANILLA = {"PLANILLA_PROVISION"}

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
        if ev in self._PLANILLA:
            if tc in {"IGV_CREDITO", "IGV_DEBITO", "CLIENTES", "PROVEEDORES"}:
                raise MapeoInvalidoError("SAP_RULE: PLANILLA_PROVISION no permite IGV ni CLIENTES/PROVEEDORES")

    def _validar_planilla_provision(self, datos_operacion: Dict[str, Any]) -> None:
        """Valida que planilla cuentre: total_gasto = neto + descuentos + aportes."""
        d = datos_operacion or {}
        tg = Decimal(str(d.get("total_gasto", "")) or 0)
        nt = Decimal(str(d.get("neto_trabajador", "")) or 0)
        dt = Decimal(str(d.get("descuentos_trabajador", "")) or 0)
        ae = Decimal(str(d.get("aportes_empleador", "")) or 0)
        if tg <= 0 and nt <= 0 and dt <= 0 and ae <= 0:
            raise MotorAsientosError("PLANILLA_PROVISION: faltan montos (total_gasto, neto_trabajador, descuentos_trabajador, aportes_empleador)")
        if tg <= 0:
            raise MotorAsientosError("PLANILLA_PROVISION: total_gasto es obligatorio y debe ser > 0")
        haberes = nt + dt + ae
        if abs(tg - haberes) > Decimal("0.01"):
            raise MotorAsientosError(
                f"PLANILLA_PROVISION: el asiento no cuadra: total_gasto={tg} != neto+descuentos+aportes={haberes}"
            )

    def simular_asiento(
        self,
        evento_tipo: str,
        datos_operacion: Dict[str, Any],
        company_id: int,
        fecha: date,
        glosa: str,
        currency: str = "PEN",
        exchange_rate: Optional[Decimal] = None,
    ) -> Dict[str, Any]:
        """
        Simula la generación de un asiento sin persistir en BD.
        Retorna totales, cuadre y líneas para el probador.
        """
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

        if evento_tipo in self._PLANILLA:
            self._validar_planilla_provision(datos_operacion)

        lineas = []
        for regla in reglas:
            # Evaluar condicion si existe (cantidad > 0, tiene_igv == True, etc.)
            if regla.condicion and regla.condicion.strip():
                try:
                    datos = datos_operacion or {}
                    cantidad = float(datos.get("cantidad", 0))
                    cond = regla.condicion.strip()
                    ok = (cond == "cantidad > 0" and cantidad > 0) or (cond == "cantidad < 0" and cantidad < 0)
                    if not ok and cond not in ("cantidad > 0", "cantidad < 0"):
                        ok = bool(eval(cond, {"__builtins__": {}}, datos))
                    if not ok:
                        continue
                except (TypeError, ValueError, NameError):
                    continue

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

            key = _TIPO_MONTO_TO_KEY.get(regla.tipo_monto, "total")
            monto = Decimal(str(datos_operacion.get(key, 0))).quantize(Decimal("0.01"))

            acc_code = cuenta.code or ""
            acc_name = (cuenta.name or "").strip()
            if regla.lado == LadoAsiento.DEBE.value:
                lineas.append({"account_code": acc_code, "account_name": acc_name, "debit": float(monto), "credit": 0.0, "memo": None})
            else:
                lineas.append({"account_code": acc_code, "account_name": acc_name, "debit": 0.0, "credit": float(monto), "memo": None})

        detraction_amount = Decimal(str(datos_operacion.get("detraction_amount", 0))).quantize(Decimal("0.01"))
        if detraction_amount > 0 and evento_tipo == "VENTA":
            mapeo_clientes = self.uow.db.query(TipoCuentaMapeo).filter_by(
                tipo_cuenta="CLIENTES", company_id=company_id, activo=True
            ).first()
            if mapeo_clientes:
                cuenta_clientes = mapeo_clientes.account
                for linea in lineas:
                    if linea["debit"] > 0 and linea["account_code"] == cuenta_clientes.code:
                        linea["debit"] = float(Decimal(str(linea["debit"])) - detraction_amount)
                        break
                mapeo_det = self.uow.db.query(TipoCuentaMapeo).filter_by(
                    tipo_cuenta="DETRACCIONES", company_id=company_id, activo=True
                ).first()
                if mapeo_det:
                    lineas.append({
                        "account_code": mapeo_det.account.code,
                        "account_name": mapeo_det.account.name,
                        "debit": float(detraction_amount),
                        "credit": 0.0,
                        "memo": None,
                    })

        total_debit = sum(l["debit"] for l in lineas)
        total_credit = sum(l["credit"] for l in lineas)
        ok, err = validar_asiento_cuadra(
            Decimal(str(total_debit)),
            Decimal(str(total_credit))
        )
        cuadra = ok

        return {
            "total_debit": total_debit,
            "total_credit": total_credit,
            "cuadra": cuadra,
            "lineas": lineas,
            "evento": evento_tipo,
            "evento_nombre": evento.nombre,
            "glosa": glosa,
            "fecha": str(fecha),
        }

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
            "GASTO_PERSONAL": AccountType.EXPENSE,
            "COSTO_VENTAS": AccountType.EXPENSE,
            "GASTO_OTROS": AccountType.EXPENSE,
            "REMUNERACIONES_POR_PAGAR": AccountType.LIABILITY,
            "TRIBUTOS_POR_PAGAR": AccountType.LIABILITY,
            "APORTES_POR_PAGAR": AccountType.LIABILITY,
        }
        exp = expected.get((tipo_cuenta or "").upper().strip())
        if exp and cuenta.type != exp:
            raise MapeoInvalidoError(f"SAP_RULE: {tipo_cuenta} debe mapear a {exp.value}")

    def generar_asiento(self, evento_tipo: str, datos_operacion: Dict[str,Any], company_id: int,
                        fecha: date, glosa: str, origin: str="MOTOR",
                        user_id: Optional[int] = None) -> JournalEntry:

        # Log inicial para verificar que el método se está ejecutando
        logger.warning(f"MOTOR_GENERAR_ASIENTO_INICIO: evento_tipo={evento_tipo}, company_id={company_id}, origin={origin}")
        
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

        if evento_tipo in self._PLANILLA:
            self._validar_planilla_provision(datos_operacion)

        lineas = []
        for regla in reglas:
            # Evaluar condicion si existe (cantidad > 0, tiene_igv == True, etc.)
            if regla.condicion and regla.condicion.strip():
                try:
                    datos = datos_operacion or {}
                    cantidad = float(datos.get("cantidad", 0))
                    cond = regla.condicion.strip()
                    ok = (cond == "cantidad > 0" and cantidad > 0) or (cond == "cantidad < 0" and cantidad < 0)
                    if not ok and cond not in ("cantidad > 0", "cantidad < 0"):
                        ok = bool(eval(cond, {"__builtins__": {}}, datos))
                    if not ok:
                        continue
                except (TypeError, ValueError, NameError):
                    continue

            self._validar_invariantes_evento(evento_tipo, regla.tipo_cuenta)

            mapeo = self.uow.db.query(TipoCuentaMapeo).filter_by(
                tipo_cuenta=regla.tipo_cuenta, company_id=company_id, activo=True
            ).first()
            if not mapeo:
                raise CuentaNoMapeadaError(f"No hay mapeo para {regla.tipo_cuenta}")

            cuenta = mapeo.account
            # Log crítico para diagnóstico de IGV - usar WARNING para asegurar que se escriba
            if regla.tipo_cuenta in ["IGV_DEBITO", "IGV_CREDITO"]:
                logger.warning(
                    f"MAPEO_IGV {evento_tipo}: tipo_cuenta={regla.tipo_cuenta} -> "
                    f"cuenta_id={cuenta.id}, cuenta_code={cuenta.code}, "
                    f"cuenta_name={cuenta.name}, lado={regla.lado}"
                )
            self._validar_tipo_vs_accounttype(regla.tipo_cuenta, cuenta)

            ok, err = validar_cuenta_activa(cuenta)
            if not ok:
                raise CuentaInactivaError(err)

            key = _TIPO_MONTO_TO_KEY.get(regla.tipo_monto, "total")
            monto = Decimal(str(datos_operacion.get(key, 0))).quantize(Decimal("0.01"))

            # Log para diagnóstico: verificar qué cuenta se está usando para IGV
            if regla.tipo_cuenta in ["IGV_DEBITO", "IGV_CREDITO"]:
                logger.warning(
                    f"IGV_DETALLE {evento_tipo}: tipo_cuenta={regla.tipo_cuenta}, "
                    f"cuenta_code={cuenta.code}, cuenta_name={cuenta.name}, "
                    f"lado={regla.lado}, monto={monto}, "
                    f"debit={monto if regla.lado == LadoAsiento.DEBE.value else Decimal('0.00')}, "
                    f"credit={monto if regla.lado == LadoAsiento.HABER.value else Decimal('0.00')}"
                )

            if regla.lado == LadoAsiento.DEBE.value:
                lineas.append({"account_code": cuenta.code, "debit": monto, "credit": Decimal("0.00")})
            else:
                lineas.append({"account_code": cuenta.code, "debit": Decimal("0.00"), "credit": monto})

        # Manejo especial para detracciones en ventas
        detraction_amount = Decimal(str(datos_operacion.get("detraction_amount", 0))).quantize(Decimal("0.01"))
        if detraction_amount > 0 and evento_tipo == "VENTA":
            # Buscar el mapeo de CLIENTES primero
            mapeo_clientes = self.uow.db.query(TipoCuentaMapeo).filter_by(
                tipo_cuenta="CLIENTES", company_id=company_id, activo=True
            ).first()
            
            if not mapeo_clientes:
                raise CuentaNoMapeadaError("No hay mapeo para CLIENTES")
            
            cuenta_clientes = mapeo_clientes.account
            
            # Buscar la línea de CLIENTES (DEBE) y reducir su monto por la detracción
            for linea in lineas:
                if linea["debit"] > 0 and linea["account_code"] == cuenta_clientes.code:
                    # Reducir el monto de clientes por la detracción
                    linea["debit"] = linea["debit"] - detraction_amount
                    runlog.info(f"DETRACCION_APLICADA_A_CLIENTES: monto_original={linea['debit'] + detraction_amount}, detraccion={detraction_amount}, monto_nuevo={linea['debit']}")
                    break
            
            # Agregar línea de DETRACCIONES (DEBE)
            mapeo_detracciones = self.uow.db.query(TipoCuentaMapeo).filter_by(
                tipo_cuenta="DETRACCIONES", company_id=company_id, activo=True
            ).first()
            if not mapeo_detracciones:
                raise CuentaNoMapeadaError("No hay mapeo para DETRACCIONES")
            
            cuenta_detracciones = mapeo_detracciones.account
            self._validar_tipo_vs_accounttype("DETRACCIONES", cuenta_detracciones)
            ok, err = validar_cuenta_activa(cuenta_detracciones)
            if not ok:
                raise CuentaInactivaError(err)
            
            # Insertar la línea de detracciones después de la línea de clientes (DEBE)
            # Buscar el índice de la última línea DEBE
            idx_debe = -1
            for i, l in enumerate(lineas):
                if l["debit"] > 0:
                    idx_debe = i
            # Insertar después de la última línea DEBE
            lineas.insert(idx_debe + 1, {
                "account_code": cuenta_detracciones.code,
                "debit": detraction_amount,
                "credit": Decimal("0.00")
            })
            runlog.info(f"DETRACCION_AGREGADA: monto={detraction_amount}, cuenta={cuenta_detracciones.code}")

        total_debe = sum(l["debit"] for l in lineas)
        total_haber = sum(l["credit"] for l in lineas)
        ok, err = validar_asiento_cuadra(total_debe, total_haber)
        if not ok:
            raise AsientoDescuadradoError(err)

        periodo = self.uow.periods.get_or_open(company_id, fecha.year, fecha.month)
        ok, err = validar_periodo_abierto(periodo)
        if not ok:
            raise PeriodoCerradoError(err)

        # Generar correlativo ANTES de crear el entry (crítico para auditoría)
        # Esto garantiza que el correlativo se asigne antes de cualquier operación
        from .services_correlative import generate_correlative
        correlative = generate_correlative(
            db=self.uow.db,
            company_id=company_id,
            origin=origin,
            entry_date=fecha,
            evento_tipo=evento_tipo
        )

        entry = JournalEntry(company_id=company_id, date=fecha, period_id=periodo.id,
                             glosa=glosa, origin=origin, status="POSTED",
                             correlative=correlative,
                             created_by=user_id)  # Trazabilidad: usuario que generó el asiento
        entry.motor_metadata = runlog.to_metadata(datos_operacion=datos_operacion)

        # Agregar el entry primero para obtener el ID
        self.uow.journal.add_entry(entry)
        self.uow.db.flush()  # Flush primero para obtener el ID del entry
        
        # Crear las líneas explícitamente con entry_id (más robusto que usar relación bidireccional)
        created_lines = []
        for l in lineas:
            account = self.uow.accounts.by_code(company_id, l["account_code"])
            if not account:
                raise CuentaNoMapeadaError(f"Cuenta {l['account_code']} no encontrada")
            
            # Crear línea con entry_id explícito (más robusto)
            line = EntryLine(
                entry_id=entry.id,  # Asignar explícitamente el entry_id
                account_id=account.id,
                debit=l["debit"],
                credit=l["credit"]
            )
            # Agregar explícitamente a la sesión
            self.uow.db.add(line)
            created_lines.append(line)
        
        # Flush de las líneas para asegurar persistencia
        self.uow.db.flush()
        
        # Refrescar el entry para cargar las líneas desde la base de datos
        self.uow.db.refresh(entry)
        
        # Verificar que las líneas se persistan correctamente
        actual_line_count = len(created_lines)
        persisted_line_count = len(entry.lines) if entry.lines else 0
        
        # Log final para verificar que el asiento se creó correctamente
        logger.warning(
            f"MOTOR_GENERAR_ASIENTO_FIN: entry_id={entry.id}, evento_tipo={evento_tipo}, "
            f"company_id={company_id}, lineas_creadas={actual_line_count}, lineas_persistidas={persisted_line_count}"
        )
        
        # Validación adicional: si las líneas no se persisten, lanzar error
        if persisted_line_count == 0 and actual_line_count > 0:
            logger.error(
                f"ERROR_PERSISTENCIA_LINEAS: entry_id={entry.id}, lineas_creadas={actual_line_count}, "
                f"lineas_persistidas={persisted_line_count}"
            )
            raise RuntimeError(
                f"Error al persistir líneas del asiento {entry.id}: "
                f"se crearon {actual_line_count} líneas pero no se persistieron"
            )
        
        return entry
