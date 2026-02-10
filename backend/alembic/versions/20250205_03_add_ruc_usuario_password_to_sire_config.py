"""add ruc usuario password to sire_configurations

Revision ID: 20250205_03
Revises: 20250205_02
Create Date: 2025-02-05 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20250205_03'
down_revision = '20250205_02'
branch_labels = None
depends_on = None


def upgrade():
    # Agregar campos RUC, usuario_generador y password_generador a sire_configurations
    op.add_column('sire_configurations', sa.Column('ruc', sa.String(length=20), nullable=True))
    op.add_column('sire_configurations', sa.Column('usuario_generador', sa.String(length=100), nullable=True))
    op.add_column('sire_configurations', sa.Column('password_generador', sa.String(length=255), nullable=True))


def downgrade():
    # Eliminar campos agregados
    op.drop_column('sire_configurations', 'password_generador')
    op.drop_column('sire_configurations', 'usuario_generador')
    op.drop_column('sire_configurations', 'ruc')

