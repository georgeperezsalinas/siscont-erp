"""add user roles and companies

Revision ID: 20251031_02
Revises: 20251031_01
Create Date: 2025-10-31

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20251031_02'
down_revision = '20251031_01'
branch_labels = None
depends_on = None

def upgrade() -> None:
	# Agregar columna role a users
	op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'OPERADOR' NOT NULL")
	
	# Si existen usuarios admin, asignarles rol ADMINISTRADOR
	op.execute("UPDATE users SET role = 'ADMINISTRADOR' WHERE is_admin = true")
	
	# Crear tabla user_companies si no existe
	op.execute("""
		CREATE TABLE IF NOT EXISTS user_companies (
			user_id INTEGER NOT NULL,
			company_id INTEGER NOT NULL,
			PRIMARY KEY (user_id, company_id),
			FOREIGN KEY (user_id) REFERENCES users (id),
			FOREIGN KEY (company_id) REFERENCES companies (id)
		)
	""")


def downgrade() -> None:
	op.execute("DROP TABLE IF EXISTS user_companies")
	op.execute("ALTER TABLE users DROP COLUMN IF EXISTS role")

