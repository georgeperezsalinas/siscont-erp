"""increase tipo_monto reglas_contables

Aumenta longitud de tipo_monto de 20 a 50 para soportar
valores como DESCUENTOS_TRABAJADOR (21 chars) y otros tipos de planilla.

Revision ID: 20250208_02
Revises: 20250208_01
Create Date: 2025-02-08

"""
from alembic import op
import sqlalchemy as sa


revision = '20250208_02'
down_revision = '20250208_01'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        'reglas_contables',
        'tipo_monto',
        existing_type=sa.String(20),
        type_=sa.String(50),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        'reglas_contables',
        'tipo_monto',
        existing_type=sa.String(50),
        type_=sa.String(20),
        existing_nullable=False,
    )
