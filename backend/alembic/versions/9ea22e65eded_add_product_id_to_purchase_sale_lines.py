"""add_product_id_to_purchase_sale_lines

Revision ID: 9ea22e65eded
Revises: 9da787294829
Create Date: 2026-02-06 12:45:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '9ea22e65eded'
down_revision = '9da787294829'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Verificar si las columnas ya existen antes de agregarlas (idempotente)
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    # Agregar product_id a purchase_lines
    if 'purchase_lines' in inspector.get_table_names():
        existing_columns = [col['name'] for col in inspector.get_columns('purchase_lines')]
        if 'product_id' not in existing_columns:
            op.add_column('purchase_lines', sa.Column('product_id', sa.Integer(), nullable=True))
            op.create_foreign_key(
                'fk_purchase_lines_product_id',
                'purchase_lines', 'products',
                ['product_id'], ['id'],
                ondelete='SET NULL'
            )
            op.create_index('ix_purchase_lines_product_id', 'purchase_lines', ['product_id'])
    
    # Agregar product_id a sale_lines
    if 'sale_lines' in inspector.get_table_names():
        existing_columns = [col['name'] for col in inspector.get_columns('sale_lines')]
        if 'product_id' not in existing_columns:
            op.add_column('sale_lines', sa.Column('product_id', sa.Integer(), nullable=True))
            op.create_foreign_key(
                'fk_sale_lines_product_id',
                'sale_lines', 'products',
                ['product_id'], ['id'],
                ondelete='SET NULL'
            )
            op.create_index('ix_sale_lines_product_id', 'sale_lines', ['product_id'])

def downgrade() -> None:
    # Eliminar columnas en orden inverso
    if op.get_bind().dialect.has_table(op.get_bind(), 'sale_lines'):
        if op.get_bind().dialect.has_index(op.get_bind(), 'sale_lines', 'ix_sale_lines_product_id'):
            op.drop_index('ix_sale_lines_product_id', 'sale_lines')
        if op.get_bind().dialect.has_constraint(op.get_bind(), 'sale_lines', 'fk_sale_lines_product_id'):
            op.drop_constraint('fk_sale_lines_product_id', 'sale_lines', type_='foreignkey')
        op.drop_column('sale_lines', 'product_id')
    
    if op.get_bind().dialect.has_table(op.get_bind(), 'purchase_lines'):
        if op.get_bind().dialect.has_index(op.get_bind(), 'purchase_lines', 'ix_purchase_lines_product_id'):
            op.drop_index('ix_purchase_lines_product_id', 'purchase_lines')
        if op.get_bind().dialect.has_constraint(op.get_bind(), 'purchase_lines', 'fk_purchase_lines_product_id'):
            op.drop_constraint('fk_purchase_lines_product_id', 'purchase_lines', type_='foreignkey')
        op.drop_column('purchase_lines', 'product_id')
