import os
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import sessionmaker
from app.config import settings

# Configuración de la base de datos
DATABASE_URL = settings.database_url
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def run_migration():
    print("Iniciando migración de tabla system_settings...")
    db = SessionLocal()
    inspector = inspect(engine)
    
    # Verificar si la tabla existe
    table_exists = inspector.has_table("system_settings")
    
    if not table_exists:
        print("La tabla 'system_settings' no existe. Creándola...")
        from app.db import Base
        from app.domain.models import SystemSettings  # Importar el modelo para que Base.metadata lo conozca
        Base.metadata.create_all(bind=engine, tables=[SystemSettings.__table__])
        print("✓ Tabla 'system_settings' creada.")
        db.close()
        return
    
    # Si la tabla existe, verificar columnas
    print("La tabla 'system_settings' ya existe. Verificando columnas...")
    existing_columns = {col['name'] for col in inspector.get_columns("system_settings")}
    
    required_columns = {
        'id', 'company_id', 'number_thousand_separator', 'number_decimal_separator',
        'number_decimal_places', 'currency_code', 'currency_symbol', 'date_format',
        'default_igv_rate', 'fiscal_year_start_month', 'allow_edit_closed_periods',
        'auto_generate_journal_entries', 'require_period_validation', 'extra_settings',
        'created_at', 'updated_at'
    }
    
    missing_columns = required_columns - existing_columns
    
    if missing_columns:
        print(f"Columnas faltantes: {missing_columns}")
        # En este caso, sería mejor recrear la tabla si hay cambios significativos
        # O agregar columnas manualmente según sea necesario
        print("⚠️  La tabla existe pero puede tener una estructura diferente.")
        print("   Si hay problemas, considere recrear la tabla o agregar las columnas manualmente.")
    else:
        print("✓ Todas las columnas requeridas están presentes.")
    
    db.close()
    print("\n✅ Migración completada!")

if __name__ == "__main__":
    run_migration()

