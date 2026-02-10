#!/usr/bin/env python3
"""
Resetea la base de datos para iniciar como si fuera la primera vez.
Después de ejecutar, al abrir la app aparecerá el wizard de configuración.

Uso: python reset_db_first_time.py
"""
import sys
from pathlib import Path

# Añadir el directorio del backend al path
sys.path.insert(0, str(Path(__file__).resolve().parent))

def main():
    from sqlalchemy import create_engine
    from app.config import settings
    from app.db import Base, _import_all_models

    print("Reseteando base de datos...")
    print("Se eliminarán todas las tablas y datos.")
    resp = input("Continuar? (s/n): ").strip().lower()
    if resp != "s":
        print("Cancelado.")
        return

    engine = create_engine(settings.database_url, echo=False)
    _import_all_models()

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    print("\nListo. Reinicia el backend y abre la app: verás el wizard de configuración inicial.")
    print("Credenciales por defecto: admin / Admin123")

if __name__ == "__main__":
    main()
