"""add glosa to journal entries

Revision ID: 20251031_03
Revises: 20251031_02
Create Date: 2025-10-31

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20251031_03'
down_revision = '20251031_02'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Agregar columna glosa a journal_entries
    op.execute("ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS glosa VARCHAR(500) DEFAULT '' NOT NULL")

def downgrade() -> None:
    op.execute("ALTER TABLE journal_entries DROP COLUMN IF EXISTS glosa")

