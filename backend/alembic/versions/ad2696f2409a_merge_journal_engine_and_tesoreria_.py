"""merge journal engine and tesoreria branches

Revision ID: ad2696f2409a
Revises: 20250206_02, 20250206_06
Create Date: 2026-02-06 09:52:28.939377

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'ad2696f2409a'
down_revision = ('20250206_02', '20250206_06')
branch_labels = None
depends_on = None

def upgrade() -> None:
	pass


def downgrade() -> None:
	pass
