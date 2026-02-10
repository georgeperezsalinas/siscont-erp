"""add_correlative_to_journal_entries

Revision ID: 20250207_01
Revises: 20250206_06
Create Date: 2025-02-07 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20250207_01'
down_revision = 'c5b0629eb3c7'  # Última migración conocida
branch_labels = None
depends_on = None


def upgrade():
    # Agregar columna correlative a journal_entries
    # Formato: XX-XX-XXXXX (Origen-Mes-Secuencial)
    
    # Verificar si la columna ya existe
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('journal_entries')]
    
    if 'correlative' not in columns:
        # PostgreSQL
        if conn.dialect.name == 'postgresql':
            op.add_column('journal_entries', sa.Column('correlative', sa.String(20), nullable=True))
            op.create_index('ix_journal_entries_correlative', 'journal_entries', ['correlative'])
        # SQLite
        else:
            op.add_column('journal_entries', sa.Column('correlative', sa.String(20), nullable=True))
            op.create_index('ix_journal_entries_correlative', 'journal_entries', ['correlative'])


def downgrade():
    # Eliminar columna correlative
    op.drop_index('ix_journal_entries_correlative', table_name='journal_entries')
    op.drop_column('journal_entries', 'correlative')

