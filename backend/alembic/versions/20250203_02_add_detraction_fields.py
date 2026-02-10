"""add detraction fields to sales

Revision ID: 20250203_02
Revises: 20250203_01
Create Date: 2025-02-03

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20250203_02'
down_revision = '20250203_01'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Verificar si las columnas ya existen (para idempotencia)
    conn = op.get_bind()
    
    # Verificar si la tabla sales existe
    inspector = sa.inspect(conn)
    if 'sales' not in inspector.get_table_names():
        return
    
    # Verificar si las columnas ya existen
    columns = [col['name'] for col in inspector.get_columns('sales')]
    
    # Agregar campos de detracción si no existen
    if 'detraction_rate' not in columns:
        op.add_column('sales', sa.Column('detraction_rate', sa.Numeric(precision=5, scale=2), nullable=True, server_default='0.00'))
    
    if 'detraction_amount' not in columns:
        op.add_column('sales', sa.Column('detraction_amount', sa.Numeric(precision=14, scale=2), nullable=True, server_default='0.00'))
    
    if 'net_amount' not in columns:
        op.add_column('sales', sa.Column('net_amount', sa.Numeric(precision=14, scale=2), nullable=True))
    
    # Actualizar net_amount para registros existentes (net_amount = total_amount - detraction_amount)
    op.execute("""
        UPDATE sales 
        SET net_amount = COALESCE(total_amount, 0) - COALESCE(detraction_amount, 0)
        WHERE net_amount IS NULL
    """)


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    if 'sales' not in inspector.get_table_names():
        return
    
    columns = [col['name'] for col in inspector.get_columns('sales')]
    
    if 'net_amount' in columns:
        op.drop_column('sales', 'net_amount')
    
    if 'detraction_amount' in columns:
        op.drop_column('sales', 'detraction_amount')
    
    if 'detraction_rate' in columns:
        op.drop_column('sales', 'detraction_rate')

