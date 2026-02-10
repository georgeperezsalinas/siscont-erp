"""
Script de migración para agregar las columnas nuevas a la tabla third_parties
Ejecutar una sola vez para actualizar la estructura de la base de datos
"""
import os
import sys
from sqlalchemy import create_engine, text
from app.config import settings

def migrate_third_parties():
    """Agrega las columnas nuevas a la tabla third_parties"""
    engine = create_engine(settings.database_url, echo=True)
    
    # Verificar si la tabla existe
    with engine.connect() as conn:
        # Lista de columnas nuevas a agregar
        migrations = [
            # Verificar y agregar tax_id_type
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'third_parties' AND column_name = 'tax_id_type'
                ) THEN
                    ALTER TABLE third_parties ADD COLUMN tax_id_type VARCHAR(3) DEFAULT 'RUC';
                END IF;
            END $$;
            """,
            # Verificar y agregar commercial_name
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'third_parties' AND column_name = 'commercial_name'
                ) THEN
                    ALTER TABLE third_parties ADD COLUMN commercial_name VARCHAR(200);
                END IF;
            END $$;
            """,
            # Verificar y agregar address
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'third_parties' AND column_name = 'address'
                ) THEN
                    ALTER TABLE third_parties ADD COLUMN address VARCHAR(500);
                END IF;
            END $$;
            """,
            # Verificar y agregar district
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'third_parties' AND column_name = 'district'
                ) THEN
                    ALTER TABLE third_parties ADD COLUMN district VARCHAR(100);
                END IF;
            END $$;
            """,
            # Verificar y agregar province
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'third_parties' AND column_name = 'province'
                ) THEN
                    ALTER TABLE third_parties ADD COLUMN province VARCHAR(100);
                END IF;
            END $$;
            """,
            # Verificar y agregar department
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'third_parties' AND column_name = 'department'
                ) THEN
                    ALTER TABLE third_parties ADD COLUMN department VARCHAR(100);
                END IF;
            END $$;
            """,
            # Verificar y agregar phone
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'third_parties' AND column_name = 'phone'
                ) THEN
                    ALTER TABLE third_parties ADD COLUMN phone VARCHAR(20);
                END IF;
            END $$;
            """,
            # Verificar y agregar email
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'third_parties' AND column_name = 'email'
                ) THEN
                    ALTER TABLE third_parties ADD COLUMN email VARCHAR(200);
                END IF;
            END $$;
            """,
            # Verificar y agregar website
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'third_parties' AND column_name = 'website'
                ) THEN
                    ALTER TABLE third_parties ADD COLUMN website VARCHAR(200);
                END IF;
            END $$;
            """,
            # Verificar y agregar contact_person
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'third_parties' AND column_name = 'contact_person'
                ) THEN
                    ALTER TABLE third_parties ADD COLUMN contact_person VARCHAR(200);
                END IF;
            END $$;
            """,
            # Verificar y agregar active
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'third_parties' AND column_name = 'active'
                ) THEN
                    ALTER TABLE third_parties ADD COLUMN active BOOLEAN DEFAULT TRUE;
                END IF;
            END $$;
            """,
            # Verificar y agregar notes
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'third_parties' AND column_name = 'notes'
                ) THEN
                    ALTER TABLE third_parties ADD COLUMN notes VARCHAR(1000);
                END IF;
            END $$;
            """,
            # Verificar y agregar created_at
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'third_parties' AND column_name = 'created_at'
                ) THEN
                    ALTER TABLE third_parties ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
                END IF;
            END $$;
            """,
            # Verificar y agregar updated_at
            """
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'third_parties' AND column_name = 'updated_at'
                ) THEN
                    ALTER TABLE third_parties ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
                END IF;
            END $$;
            """,
        ]
        
        print("Iniciando migración de tabla third_parties...")
        for i, migration_sql in enumerate(migrations, 1):
            try:
                conn.execute(text(migration_sql))
                conn.commit()
                print(f"✓ Migración {i}/{len(migrations)} completada")
            except Exception as e:
                print(f"⚠ Error en migración {i}: {e}")
                # Continuar con las siguientes migraciones
        
        print("\n✅ Migración completada!")
        print("\nNota: Si alguna columna ya existe, la migración la habrá omitido automáticamente.")

if __name__ == "__main__":
    migrate_third_parties()

