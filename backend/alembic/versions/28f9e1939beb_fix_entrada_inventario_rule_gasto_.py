"""fix_entrada_inventario_rule_gasto_compras

Revision ID: 28f9e1939beb
Revises: 97eb00658bba
Create Date: 2026-02-06 16:19:48.497320

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '28f9e1939beb'
down_revision = '97eb00658bba'
branch_labels = None
depends_on = None

def upgrade() -> None:
	# Corregir reglas de ENTRADA_INVENTARIO que usan GASTO_COMPRAS en HABER
	# Deben usar PROVEEDORES en HABER en su lugar
	from sqlalchemy import text
	
	# Actualizar reglas existentes
	op.execute(text("""
		UPDATE reglas_contables
		SET tipo_cuenta = 'PROVEEDORES'
		WHERE tipo_cuenta = 'GASTO_COMPRAS'
		AND lado = 'HABER'
		AND evento_id IN (
			SELECT id FROM eventos_contables 
			WHERE tipo = 'ENTRADA_INVENTARIO'
		)
	"""))


def downgrade() -> None:
	# Revertir cambio (opcional)
	from sqlalchemy import text
	
	op.execute(text("""
		UPDATE reglas_contables
		SET tipo_cuenta = 'GASTO_COMPRAS'
		WHERE tipo_cuenta = 'PROVEEDORES'
		AND lado = 'HABER'
		AND evento_id IN (
			SELECT id FROM eventos_contables 
			WHERE tipo = 'ENTRADA_INVENTARIO'
		)
	"""))
