"""add active to companies

Revision ID: 20251031_01
Revises: 
Create Date: 2025-10-31

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20251031_01'
down_revision = None
branch_labels = None
depends_on = None

def upgrade() -> None:
	# Hacer idempotente: si la columna ya existe, no falla
	op.execute("ALTER TABLE companies ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE NOT NULL")


def downgrade() -> None:
	# Solo si existe
	op.execute("ALTER TABLE companies DROP COLUMN IF EXISTS active")
