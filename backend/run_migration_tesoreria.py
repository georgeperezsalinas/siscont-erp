"""
Script para ejecutar la migración de tesorería manualmente
Ejecutar: python run_migration_tesoreria.py
"""
import sys
from sqlalchemy import inspect, text
from app.db import engine

def run_migration():
    """Ejecuta la migración para agregar tablas de tesorería"""
    print("Ejecutando migracion: agregar tablas de tesoreria...")
    
    with engine.connect() as conn:
        # Verificar si las tablas ya existen
        inspector = inspect(engine)
        existing_tables = inspector.get_table_names()
        
        # Detectar tipo de base de datos
        dialect_name = engine.dialect.name
        print(f"Tipo de base de datos: {dialect_name}")
        
        # Crear tabla metodos_pago
        if 'metodos_pago' not in existing_tables:
            print("Creando tabla metodos_pago...")
            if dialect_name == 'postgresql':
                conn.execute(text("""
                    CREATE TABLE metodos_pago (
                        id SERIAL PRIMARY KEY,
                        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                        codigo VARCHAR(50) NOT NULL UNIQUE,
                        descripcion VARCHAR(200) NOT NULL,
                        impacta_en VARCHAR(10) NOT NULL,
                        activo BOOLEAN NOT NULL DEFAULT true,
                        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                conn.execute(text("CREATE INDEX ix_metodos_pago_company_id ON metodos_pago(company_id)"))
                conn.commit()
                print("Tabla metodos_pago creada exitosamente!")
            else:
                print(f"Tipo de base de datos '{dialect_name}' requiere migración manual")
                return
        else:
            print("Tabla metodos_pago ya existe.")
        
        # Crear tabla movimientos_tesoreria
        if 'movimientos_tesoreria' not in existing_tables:
            print("Creando tabla movimientos_tesoreria...")
            if dialect_name == 'postgresql':
                conn.execute(text("""
                    CREATE TABLE movimientos_tesoreria (
                        id SERIAL PRIMARY KEY,
                        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                        tipo VARCHAR(20) NOT NULL,
                        referencia_tipo VARCHAR(20) NOT NULL,
                        referencia_id INTEGER NOT NULL,
                        monto NUMERIC(12, 2) NOT NULL,
                        fecha DATE NOT NULL,
                        metodo_pago_id INTEGER NOT NULL REFERENCES metodos_pago(id) ON DELETE RESTRICT,
                        estado VARCHAR(20) NOT NULL DEFAULT 'REGISTRADO',
                        journal_entry_id INTEGER REFERENCES journal_entries(id) ON DELETE SET NULL,
                        glosa TEXT,
                        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        created_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL
                    )
                """))
                conn.execute(text("CREATE INDEX ix_movimientos_tesoreria_company_id ON movimientos_tesoreria(company_id)"))
                conn.execute(text("CREATE INDEX ix_movimientos_tesoreria_referencia_id ON movimientos_tesoreria(referencia_id)"))
                conn.execute(text("CREATE INDEX ix_movimientos_tesoreria_journal_entry_id ON movimientos_tesoreria(journal_entry_id)"))
                conn.commit()
                print("Tabla movimientos_tesoreria creada exitosamente!")
            else:
                print(f"Tipo de base de datos '{dialect_name}' requiere migración manual")
                return
        else:
            print("Tabla movimientos_tesoreria ya existe.")
        
        print("Migracion completada exitosamente!")

if __name__ == "__main__":
    try:
        run_migration()
    except Exception as e:
        print(f"ERROR al ejecutar migracion: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

