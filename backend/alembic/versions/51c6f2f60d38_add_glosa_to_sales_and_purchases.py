"""add_glosa_to_sales_and_purchases

Revision ID: 51c6f2f60d38
Revises: 9ea22e65eded
Create Date: 2026-02-06 15:41:51.256822

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '51c6f2f60d38'
down_revision = '9ea22e65eded'
branch_labels = None
depends_on = None

def upgrade() -> None:
	# Agregar columna glosa a sales si no existe
	from sqlalchemy import inspect, text
	conn = op.get_bind()
	inspector = inspect(conn)
	
	# Verificar si la columna ya existe en sales
	sales_columns = [col['name'] for col in inspector.get_columns('sales')]
	if 'glosa' not in sales_columns:
		op.add_column('sales', sa.Column('glosa', sa.String(500), nullable=True))
	
	# Verificar si la columna ya existe en purchases
	purchases_columns = [col['name'] for col in inspector.get_columns('purchases')]
	if 'glosa' not in purchases_columns:
		op.add_column('purchases', sa.Column('glosa', sa.String(500), nullable=True))


def downgrade() -> None:
	# Eliminar columna glosa de sales y purchases
	op.drop_column('sales', 'glosa')
	op.drop_column('purchases', 'glosa')
