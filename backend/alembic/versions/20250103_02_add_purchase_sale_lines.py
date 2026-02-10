"""add_purchase_sale_lines

Revision ID: add_purchase_sale_lines
Revises: d7c47cabf810
Create Date: 2025-01-03 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_purchase_sale_lines'
down_revision = 'd7c47cabf810'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Verificar si las tablas ya existen antes de crearlas
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()
    
    # Crear tabla purchase_lines
    if 'purchase_lines' not in existing_tables:
        op.create_table(
            'purchase_lines',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('purchase_id', sa.Integer(), nullable=False),
            sa.Column('line_number', sa.Integer(), nullable=False, server_default='1'),
            sa.Column('description', sa.String(length=500), nullable=False),
            sa.Column('quantity', sa.Numeric(precision=12, scale=4), nullable=False, server_default='1'),
            sa.Column('unit_price', sa.Numeric(precision=14, scale=4), nullable=False),
            sa.Column('base_amount', sa.Numeric(precision=14, scale=2), nullable=False),
            sa.Column('igv_amount', sa.Numeric(precision=14, scale=2), nullable=False, server_default='0'),
            sa.Column('total_amount', sa.Numeric(precision=14, scale=2), nullable=False),
            sa.ForeignKeyConstraint(['purchase_id'], ['purchases.id'], ondelete='CASCADE', name='fk_purchase_lines_purchase_id'),
            sa.PrimaryKeyConstraint('id', name='pk_purchase_lines')
        )
        op.create_index('ix_purchase_lines_purchase_id', 'purchase_lines', ['purchase_id'])
    
    # Crear tabla sale_lines
    if 'sale_lines' not in existing_tables:
        op.create_table(
            'sale_lines',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('sale_id', sa.Integer(), nullable=False),
            sa.Column('line_number', sa.Integer(), nullable=False, server_default='1'),
            sa.Column('description', sa.String(length=500), nullable=False),
            sa.Column('quantity', sa.Numeric(precision=12, scale=4), nullable=False, server_default='1'),
            sa.Column('unit_price', sa.Numeric(precision=14, scale=4), nullable=False),
            sa.Column('base_amount', sa.Numeric(precision=14, scale=2), nullable=False),
            sa.Column('igv_amount', sa.Numeric(precision=14, scale=2), nullable=False, server_default='0'),
            sa.Column('total_amount', sa.Numeric(precision=14, scale=2), nullable=False),
            sa.ForeignKeyConstraint(['sale_id'], ['sales.id'], ondelete='CASCADE', name='fk_sale_lines_sale_id'),
            sa.PrimaryKeyConstraint('id', name='pk_sale_lines')
        )
        op.create_index('ix_sale_lines_sale_id', 'sale_lines', ['sale_id'])

def downgrade() -> None:
    op.drop_index('ix_sale_lines_sale_id', table_name='sale_lines')
    op.drop_table('sale_lines')
    op.drop_index('ix_purchase_lines_purchase_id', table_name='purchase_lines')
    op.drop_table('purchase_lines')

