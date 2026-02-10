"""add_control_to_accounttype_enum

Revision ID: c5b0629eb3c7
Revises: 5be604652c7a
Create Date: 2026-02-07 11:45:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c5b0629eb3c7'
down_revision = '5be604652c7a'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Agregar valor 'C' (CONTROL) al enum accounttype en PostgreSQL
    op.execute("ALTER TYPE accounttype ADD VALUE IF NOT EXISTS 'C'")


def downgrade() -> None:
    # No se puede eliminar un valor de un enum en PostgreSQL fácilmente
    # Se dejaría como está, ya que no afecta la funcionalidad
    pass
