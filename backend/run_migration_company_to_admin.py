#!/usr/bin/env python
"""Ejecuta la migración 20250209_02 (company_to_admin_messages) sin alembic."""
import sys
from pathlib import Path

# Asegurar que app está en el path
sys.path.insert(0, str(Path(__file__).parent))

from sqlalchemy import create_engine, text, inspect
from app.config import settings

def run():
    engine = create_engine(settings.database_url)
    inspector = inspect(engine)
    existing = inspector.get_table_names()

    with engine.connect() as conn:
        if 'company_to_admin_messages' not in existing:
            print("Creando tabla company_to_admin_messages...")
            conn.execute(text("""
                CREATE TABLE company_to_admin_messages (
                    id INTEGER NOT NULL PRIMARY KEY,
                    company_id INTEGER NOT NULL,
                    subject VARCHAR(500) NOT NULL,
                    body TEXT NOT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    created_by INTEGER,
                    is_read BOOLEAN NOT NULL DEFAULT 0,
                    read_at DATETIME,
                    FOREIGN KEY(company_id) REFERENCES companies (id) ON DELETE CASCADE,
                    FOREIGN KEY(created_by) REFERENCES users (id) ON DELETE SET NULL
                )
            """))
            conn.execute(text("CREATE INDEX idx_company_to_admin_messages_company_id ON company_to_admin_messages (company_id)"))
            conn.execute(text("CREATE INDEX idx_company_to_admin_messages_created_at ON company_to_admin_messages (created_at)"))
            conn.commit()
            print("  ✓ company_to_admin_messages creada")
        else:
            print("  - company_to_admin_messages ya existe")

        if 'company_to_admin_attachments' not in existing:
            print("Creando tabla company_to_admin_attachments...")
            conn.execute(text("""
                CREATE TABLE company_to_admin_attachments (
                    id INTEGER NOT NULL PRIMARY KEY,
                    message_id INTEGER NOT NULL,
                    file_name VARCHAR(500) NOT NULL,
                    file_path VARCHAR(1000) NOT NULL,
                    file_type VARCHAR(100) NOT NULL,
                    uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(message_id) REFERENCES company_to_admin_messages (id) ON DELETE CASCADE
                )
            """))
            conn.execute(text("CREATE INDEX idx_company_to_admin_attachments_message_id ON company_to_admin_attachments (message_id)"))
            conn.commit()
            print("  ✓ company_to_admin_attachments creada")
        else:
            print("  - company_to_admin_attachments ya existe")

    print("\n✅ Migración completada")


if __name__ == "__main__":
    run()
