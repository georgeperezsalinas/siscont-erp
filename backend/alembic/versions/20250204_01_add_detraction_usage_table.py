"""add detraction usage table

Revision ID: 20250204_01
Revises: 20250203_02
Create Date: 2025-02-04

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20250204_01'
down_revision = '20250203_02'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Verificar si la tabla ya existe (para idempotencia)
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    if 'detraction_usage' in inspector.get_table_names():
        return
    
    # Crear tabla detraction_usage
    op.create_table(
        'detraction_usage',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('company_id', sa.Integer(), nullable=False),
        sa.Column('usage_date', sa.Date(), nullable=False),
        sa.Column('amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('journal_entry_id', sa.Integer(), nullable=False),
        sa.Column('period_reference', sa.String(length=7), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], name='fk_detraction_usage_company'),
        sa.ForeignKeyConstraint(['journal_entry_id'], ['journal_entries.id'], name='fk_detraction_usage_journal_entry'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], name='fk_detraction_usage_created_by')
    )
    
    # Crear índices
    op.create_index('idx_detraction_usage_company_id', 'detraction_usage', ['company_id'])
    op.create_index('idx_detraction_usage_date', 'detraction_usage', ['usage_date'])
    op.create_index('idx_detraction_usage_journal_entry_id', 'detraction_usage', ['journal_entry_id'])


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    if 'detraction_usage' not in inspector.get_table_names():
        return
    
    # Eliminar índices
    op.drop_index('idx_detraction_usage_journal_entry_id', table_name='detraction_usage')
    op.drop_index('idx_detraction_usage_date', table_name='detraction_usage')
    op.drop_index('idx_detraction_usage_company_id', table_name='detraction_usage')
    
    # Eliminar tabla
    op.drop_table('detraction_usage')

