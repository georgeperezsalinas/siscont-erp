#!/usr/bin/env python3
"""
Exporta eventos, reglas y mapeos desde la BD a archivos CSV de sistema.

Uso:
  1. Restaurar el dump (pg_restore para formato custom, psql para plain SQL)
  2. Desde backend/: python scripts/export_motor_base_csv.py [company_id]
     O: python -m scripts.export_motor_base_csv [company_id]

  Si no se pasa company_id, usa la primera empresa de la BD.

Los archivos se escriben en backend/data/:
  - eventos_contables_base.csv
  - reglas_contables_base.csv
  - tipo_cuenta_mapeos_base.csv
"""
import csv
import json
import os
import sys
from pathlib import Path

# Agregar backend al path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))
os.chdir(backend_dir)

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.config import settings
from app.domain.models import Account
from app.domain.models_journal_engine import EventoContable, ReglaContable, TipoCuentaMapeo


def main():
    company_id = int(sys.argv[1]) if len(sys.argv) > 1 else None

    engine = create_engine(settings.database_url, echo=False, future=True)
    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True)
    db = Session()

    try:
        if company_id is None:
            r = db.execute(text("SELECT id FROM companies ORDER BY id LIMIT 1"))
            row = r.fetchone()
            if not row:
                print("No hay empresas en la BD. Crea una o especifica company_id.")
                sys.exit(1)
            company_id = row[0]
            print(f"Usando empresa_id={company_id}")

        # Eventos
        eventos = db.query(EventoContable).filter(
            EventoContable.company_id == company_id
        ).order_by(EventoContable.tipo).all()

        data_dir = backend_dir / "data"
        data_dir.mkdir(exist_ok=True)

        eventos_path = data_dir / "eventos_contables_base.csv"
        with open(eventos_path, "w", encoding="utf-8", newline="") as f:
            w = csv.writer(f)
            w.writerow(["tipo", "nombre", "descripcion", "categoria", "activo"])
            for e in eventos:
                w.writerow([
                    e.tipo or "",
                    e.nombre or "",
                    e.descripcion or "",
                    e.categoria or "",
                    1 if e.activo else 0,
                ])
        print(f"Exportados {len(eventos)} eventos -> {eventos_path}")

        # Reglas (necesitamos evento_tipo para el CSV)
        tipo_by_id = {e.id: e.tipo for e in eventos}
        reglas = db.query(ReglaContable).filter(
            ReglaContable.company_id == company_id
        ).order_by(ReglaContable.evento_id, ReglaContable.orden).all()

        reglas_path = data_dir / "reglas_contables_base.csv"
        with open(reglas_path, "w", encoding="utf-8", newline="") as f:
            w = csv.writer(f)
            w.writerow(["evento_tipo", "condicion", "lado", "tipo_cuenta", "tipo_monto", "orden", "config", "activo"])
            for r in reglas:
                evento_tipo = tipo_by_id.get(r.evento_id, "")
                config_str = json.dumps(r.config) if r.config else ""
                w.writerow([
                    evento_tipo,
                    r.condicion or "",
                    r.lado or "",
                    r.tipo_cuenta or "",
                    r.tipo_monto or "",
                    r.orden or 0,
                    config_str,
                    1 if r.activo else 0,
                ])
        print(f"Exportados {len(reglas)} reglas -> {reglas_path}")

        # Mapeos (necesitamos account_code)
        code_by_id = {a.id: a.code for a in db.query(Account).filter(
            Account.company_id == company_id
        ).all()}

        mapeos = db.query(TipoCuentaMapeo).filter(
            TipoCuentaMapeo.company_id == company_id,
            TipoCuentaMapeo.activo == True,
        ).all()

        mapeos_path = data_dir / "tipo_cuenta_mapeos_base.csv"
        with open(mapeos_path, "w", encoding="utf-8", newline="") as f:
            w = csv.writer(f)
            w.writerow(["tipo_cuenta", "account_code", "activo"])
            for m in mapeos:
                code = code_by_id.get(m.account_id, "")
                if code:
                    w.writerow([m.tipo_cuenta or "", code, 1])
        print(f"Exportados {len(mapeos)} mapeos -> {mapeos_path}")

    finally:
        db.close()
        engine.dispose()


if __name__ == "__main__":
    main()
