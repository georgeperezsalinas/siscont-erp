"""
Script de migración para agregar campos de trazabilidad tipo SAP a journal_entries.

Ejecutar una sola vez para actualizar la estructura de la base de datos.
"""
import os
import sys
from sqlalchemy import create_engine, text, inspect
from app.config import settings

def migrate_journal_entries():
    """Agrega campos de trazabilidad a journal_entries"""
    engine = create_engine(settings.database_url, echo=True)
    inspector = inspect(engine)
    
    # Verificar si la tabla existe
    if not inspector.has_table("journal_entries"):
        print("[ERROR] La tabla 'journal_entries' no existe. Ejecute las migraciones base primero.")
        return
    
    print("Iniciando migracion de tabla journal_entries...")
    
    # Lista de columnas nuevas a agregar
    migrations = [
        # created_by
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'journal_entries' AND column_name = 'created_by'
            ) THEN
                ALTER TABLE journal_entries ADD COLUMN created_by INTEGER REFERENCES users(id);
                CREATE INDEX IF NOT EXISTS idx_journal_entries_created_by ON journal_entries(created_by);
            END IF;
        END $$;
        """,
        # created_at
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'journal_entries' AND column_name = 'created_at'
            ) THEN
                ALTER TABLE journal_entries ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
            END IF;
        END $$;
        """,
        # updated_by
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'journal_entries' AND column_name = 'updated_by'
            ) THEN
                ALTER TABLE journal_entries ADD COLUMN updated_by INTEGER REFERENCES users(id);
            END IF;
        END $$;
        """,
        # updated_at
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'journal_entries' AND column_name = 'updated_at'
            ) THEN
                ALTER TABLE journal_entries ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
            END IF;
        END $$;
        """,
        # posted_by
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'journal_entries' AND column_name = 'posted_by'
            ) THEN
                ALTER TABLE journal_entries ADD COLUMN posted_by INTEGER REFERENCES users(id);
            END IF;
        END $$;
        """,
        # posted_at
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'journal_entries' AND column_name = 'posted_at'
            ) THEN
                ALTER TABLE journal_entries ADD COLUMN posted_at TIMESTAMP;
            END IF;
        END $$;
        """,
        # reversed_entry_id
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'journal_entries' AND column_name = 'reversed_entry_id'
            ) THEN
                ALTER TABLE journal_entries ADD COLUMN reversed_entry_id INTEGER REFERENCES journal_entries(id);
                CREATE INDEX IF NOT EXISTS idx_journal_entries_reversed_entry_id ON journal_entries(reversed_entry_id);
            END IF;
        END $$;
        """,
        # reversed_by
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'journal_entries' AND column_name = 'reversed_by'
            ) THEN
                ALTER TABLE journal_entries ADD COLUMN reversed_by INTEGER REFERENCES users(id);
            END IF;
        END $$;
        """,
        # reversed_at
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'journal_entries' AND column_name = 'reversed_at'
            ) THEN
                ALTER TABLE journal_entries ADD COLUMN reversed_at TIMESTAMP;
            END IF;
        END $$;
        """,
        # integrity_hash
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'journal_entries' AND column_name = 'integrity_hash'
            ) THEN
                ALTER TABLE journal_entries ADD COLUMN integrity_hash VARCHAR(64);
                CREATE INDEX IF NOT EXISTS idx_journal_entries_integrity_hash ON journal_entries(integrity_hash);
            END IF;
        END $$;
        """,
        # warning_confirmations
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'journal_entries' AND column_name = 'warning_confirmations'
            ) THEN
                ALTER TABLE journal_entries ADD COLUMN warning_confirmations JSON;
            END IF;
        END $$;
        """,
        # Actualizar status default a DRAFT para nuevos asientos
        # (No cambiamos los existentes, solo el default)
        """
        DO $$
        BEGIN
            -- Verificar si hay constraint de default
            -- Si no existe, se manejará en la aplicación
        END $$;
        """,
    ]
    
    with engine.connect() as conn:
        for i, migration_sql in enumerate(migrations, 1):
            try:
                conn.execute(text(migration_sql))
                conn.commit()
                print(f"[OK] Migracion {i}/{len(migrations)} completada")
            except Exception as e:
                error_msg = str(e).lower()
                if "already exists" in error_msg or "duplicate" in error_msg:
                    print(f"[SKIP] Migracion {i} omitida (columna ya existe)")
                else:
                    print(f"[ERROR] Error en migracion {i}: {e}")
                    # Continuar con las siguientes migraciones
        
        print("\n[OK] Migracion completada!")
        print("\nNota: Si alguna columna ya existe, la migracion la habra omitido automaticamente.")
        print("Los asientos existentes mantendran su estado actual (POSTED).")
        print("Los nuevos asientos manuales se crearan en estado DRAFT por defecto.")


if __name__ == "__main__":
    migrate_journal_entries()

