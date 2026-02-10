"""
Carga configuración del Motor de Asientos desde archivos CSV de sistema.

Similar a plan_base.csv para el plan de cuentas, estos archivos definen
la configuración base de eventos, reglas y mapeos del motor de asientos:
- eventos_contables_base.csv
- reglas_contables_base.csv
- tipo_cuenta_mapeos_base.csv
"""
import csv
import json
from pathlib import Path
from sqlalchemy.orm import Session
from ..domain.models_journal_engine import (
    EventoContable,
    ReglaContable,
    TipoCuentaMapeo,
)
from ..domain.models import Account

ENGINE_VERSION = "1.2"
DEFAULT_RULE_CONFIG = {"system_rule": True, "engine_version": ENGINE_VERSION}

_DATA_DIR = Path(__file__).parent.parent.parent / "data"


def _csv_path(name: str) -> Path:
    p = _DATA_DIR / name
    if not p.exists():
        raise FileNotFoundError(f"No se encontró {name} en {_DATA_DIR}")
    return p


def load_eventos_from_csv(db: Session, company_id: int) -> dict:
    """
    Carga eventos contables desde eventos_contables_base.csv.
    Idempotente: solo crea eventos que no existen (por tipo + company_id).
    """
    csv_path = _csv_path("eventos_contables_base.csv")
    created = 0

    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            tipo = row["tipo"].strip()
            nombre = row["nombre"].strip()
            descripcion = (row.get("descripcion") or "").strip() or None
            categoria = (row.get("categoria") or "").strip() or None
            activo = (row.get("activo", "1").strip() or "1") == "1"

            exists = db.query(EventoContable).filter(
                EventoContable.company_id == company_id,
                EventoContable.tipo == tipo,
            ).first()

            if not exists:
                ev = EventoContable(
                    company_id=company_id,
                    tipo=tipo,
                    nombre=nombre,
                    descripcion=descripcion,
                    categoria=categoria,
                    activo=activo,
                )
                db.add(ev)
                created += 1

    db.flush()
    return {"created": created}


def load_reglas_from_csv(db: Session, company_id: int) -> dict:
    """
    Carga reglas contables desde reglas_contables_base.csv.
    Requiere que los eventos ya estén cargados (por tipo).
    Idempotente: no duplica reglas (se valida por evento + condiciones).
    """
    csv_path = _csv_path("reglas_contables_base.csv")

    # Mapeo evento_tipo -> evento_id
    eventos = {e.tipo: e.id for e in db.query(EventoContable).filter(
        EventoContable.company_id == company_id
    ).all()}

    created = 0

    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            evento_tipo = row["evento_tipo"].strip()
            condicion = (row.get("condicion") or "").strip() or None
            lado = row["lado"].strip()
            tipo_cuenta = row["tipo_cuenta"].strip()
            tipo_monto = row["tipo_monto"].strip()
            orden = int(row.get("orden", "0"))
            config_str = (row.get("config") or "").strip()
            activo = (row.get("activo", "1").strip() or "1") == "1"

            evento_id = eventos.get(evento_tipo)
            if not evento_id:
                continue  # Evento no existe, saltar

            config = None
            if config_str:
                try:
                    config = {**json.loads(config_str), **DEFAULT_RULE_CONFIG}
                except json.JSONDecodeError:
                    config = DEFAULT_RULE_CONFIG.copy()
            else:
                config = DEFAULT_RULE_CONFIG.copy()

            # Evitar duplicados: misma regla para el mismo evento
            exists = db.query(ReglaContable).filter(
                ReglaContable.evento_id == evento_id,
                ReglaContable.company_id == company_id,
                ReglaContable.lado == lado,
                ReglaContable.tipo_cuenta == tipo_cuenta,
                ReglaContable.tipo_monto == tipo_monto,
                ReglaContable.orden == orden,
            ).first()

            if not exists:
                regla = ReglaContable(
                    evento_id=evento_id,
                    company_id=company_id,
                    condicion=condicion,
                    lado=lado,
                    tipo_cuenta=tipo_cuenta,
                    tipo_monto=tipo_monto,
                    orden=orden,
                    config=config,
                    activo=activo,
                )
                db.add(regla)
                created += 1

    db.flush()
    return {"created": created}


def load_mapeos_from_csv(db: Session, company_id: int) -> dict:
    """
    Carga mapeos tipo_cuenta -> cuenta desde tipo_cuenta_mapeos_base.csv.
    Resuelve account_code a account_id usando las cuentas existentes de la empresa.
    Idempotente: no duplica (unique company_id + tipo_cuenta).
    """
    csv_path = _csv_path("tipo_cuenta_mapeos_base.csv")

    # Mapeo account_code -> account_id
    accounts = {a.code: a.id for a in db.query(Account).filter(
        Account.company_id == company_id,
        Account.active == True,
    ).all()}

    created = 0

    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            tipo_cuenta = row["tipo_cuenta"].strip()
            account_code = row["account_code"].strip()
            activo = (row.get("activo", "1").strip() or "1") == "1"

            account_id = accounts.get(account_code)
            if not account_id:
                continue  # Cuenta no existe en el plan, saltar

            exists = db.query(TipoCuentaMapeo).filter(
                TipoCuentaMapeo.company_id == company_id,
                TipoCuentaMapeo.tipo_cuenta == tipo_cuenta,
            ).first()

            if not exists:
                m = TipoCuentaMapeo(
                    company_id=company_id,
                    tipo_cuenta=tipo_cuenta,
                    account_id=account_id,
                    activo=activo,
                )
                db.add(m)
                created += 1

    db.flush()
    return {"created": created}


def load_motor_base_csv(db: Session, company_id: int) -> dict:
    """
    Carga toda la configuración del motor de asientos desde archivos CSV.
    Orden: eventos -> reglas -> mapeos.
    Idempotente: solo crea lo que no existe.
    """
    r1 = load_eventos_from_csv(db, company_id)
    r2 = load_reglas_from_csv(db, company_id)
    r3 = load_mapeos_from_csv(db, company_id)

    return {
        "eventos_creados": r1["created"],
        "reglas_creadas": r2["created"],
        "mapeos_creados": r3["created"],
        "mensaje": (
            f"Motor cargado desde CSV: {r1['created']} eventos, "
            f"{r2['created']} reglas, {r3['created']} mapeos."
        ),
    }
