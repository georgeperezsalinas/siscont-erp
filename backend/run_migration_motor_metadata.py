"""
Script para ejecutar la migración de motor_metadata manualmente
Ejecutar: python run_migration_motor_metadata.py
"""
import sys
from sqlalchemy import inspect, text
from app.db import engine

def run_migration():
    """Ejecuta la migración para agregar columna motor_metadata"""
    print("Ejecutando migracion: agregar motor_metadata a journal_entries...")
    
    with engine.connect() as conn:
        # Verificar si la columna ya existe
        inspector = inspect(engine)
        columns = [col['name'] for col in inspector.get_columns('journal_entries')]
        
        if 'motor_metadata' in columns:
            print("OK: La columna motor_metadata ya existe. No se requiere migracion.")
            return
        
        # Detectar tipo de base de datos
        dialect_name = engine.dialect.name
        print(f"Tipo de base de datos: {dialect_name}")
        
        # Ejecutar migración según el tipo de BD
        if dialect_name == 'postgresql':
            print("Agregando columna motor_metadata (JSON) en PostgreSQL...")
            conn.execute(text("ALTER TABLE journal_entries ADD COLUMN motor_metadata JSON"))
            conn.commit()
            print("Migracion completada exitosamente!")
        elif dialect_name == 'sqlite':
            print("Agregando columna motor_metadata (TEXT) en SQLite...")
            conn.execute(text("ALTER TABLE journal_entries ADD COLUMN motor_metadata TEXT"))
            conn.commit()
            print("Migracion completada exitosamente!")
        else:
            print(f"Tipo de base de datos '{dialect_name}' no soportado automaticamente.")
            print("Por favor, ejecuta manualmente:")
            if dialect_name in ['postgresql', 'mysql']:
                print("  ALTER TABLE journal_entries ADD COLUMN motor_metadata JSON;")
            else:
                print("  ALTER TABLE journal_entries ADD COLUMN motor_metadata TEXT;")

if __name__ == "__main__":
    try:
        run_migration()
    except Exception as e:
        print(f"ERROR al ejecutar migracion: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

