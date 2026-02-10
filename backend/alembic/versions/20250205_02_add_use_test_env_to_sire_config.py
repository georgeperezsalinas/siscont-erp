"""add use_test_env to sire_configurations

Revision ID: 20250205_02
Revises: 20250205_01
Create Date: 2025-02-05

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20250205_02'
down_revision = '20250205_01'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Verificar si la columna ya existe
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    if 'sire_configurations' in inspector.get_table_names():
        existing_columns = [col['name'] for col in inspector.get_columns('sire_configurations')]
        
        if 'use_test_env' not in existing_columns:
            op.add_column('sire_configurations', 
                sa.Column('use_test_env', sa.Boolean(), nullable=False, server_default='true')
            )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    if 'sire_configurations' in inspector.get_table_names():
        existing_columns = [col['name'] for col in inspector.get_columns('sire_configurations')]
        
        if 'use_test_env' in existing_columns:
            op.drop_column('sire_configurations', 'use_test_env')

