"""add period closing fields

Revision ID: add_period_closing
Revises: 20251031_03
Create Date: 2025-01-03

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_period_closing'
down_revision = '20251031_03'
branch_labels = None
depends_on = None


def upgrade():
    # Agregar campos de cierre de período
    op.add_column('periods', sa.Column('closed_at', sa.DateTime(), nullable=True))
    op.add_column('periods', sa.Column('closed_by', sa.Integer(), nullable=True))
    op.add_column('periods', sa.Column('reopened_at', sa.DateTime(), nullable=True))
    op.add_column('periods', sa.Column('reopened_by', sa.Integer(), nullable=True))
    op.add_column('periods', sa.Column('close_reason', sa.String(length=500), nullable=True))
    op.add_column('periods', sa.Column('reopen_reason', sa.String(length=500), nullable=True))
    
    # Agregar foreign keys
    op.create_foreign_key('fk_periods_closed_by', 'periods', 'users', ['closed_by'], ['id'])
    op.create_foreign_key('fk_periods_reopened_by', 'periods', 'users', ['reopened_by'], ['id'])


def downgrade():
    # Eliminar foreign keys primero
    op.drop_constraint('fk_periods_reopened_by', 'periods', type_='foreignkey')
    op.drop_constraint('fk_periods_closed_by', 'periods', type_='foreignkey')
    
    # Eliminar columnas
    op.drop_column('periods', 'reopen_reason')
    op.drop_column('periods', 'close_reason')
    op.drop_column('periods', 'reopened_by')
    op.drop_column('periods', 'reopened_at')
    op.drop_column('periods', 'closed_by')
    op.drop_column('periods', 'closed_at')

