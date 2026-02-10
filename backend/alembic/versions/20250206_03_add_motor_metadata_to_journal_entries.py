"""add_motor_metadata_to_journal_entries

Revision ID: 20250206_03
Revises: 20251031_03
Create Date: 2025-02-06

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20250206_03'
down_revision = '20251031_03'  # Última migración conocida
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Agregar columna motor_metadata (JSON) a journal_entries para trazabilidad del Motor de Asientos
    # Compatible con PostgreSQL (JSON) y SQLite (TEXT)
    from sqlalchemy import inspect
    conn = op.get_bind()
    inspector = inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('journal_entries')]
    
    if 'motor_metadata' not in columns:
        # Detectar tipo de base de datos
        if conn.dialect.name == 'postgresql':
            op.execute("ALTER TABLE journal_entries ADD COLUMN motor_metadata JSON")
        else:
            # SQLite u otros - usar TEXT para almacenar JSON como string
            op.execute("ALTER TABLE journal_entries ADD COLUMN motor_metadata TEXT")


def downgrade() -> None:
    # Eliminar columna motor_metadata
    op.drop_column('journal_entries', 'motor_metadata')

