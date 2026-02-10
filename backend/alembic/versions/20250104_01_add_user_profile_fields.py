"""add user profile fields

Revision ID: 20250104_01
Revises: add_ple_fields
Create Date: 2025-01-04

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20250104_01'
down_revision = 'add_ple_fields'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Verificar si las columnas ya existen antes de agregarlas (idempotente)
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    if 'users' in inspector.get_table_names():
        existing_columns = {col['name'] for col in inspector.get_columns('users')}
        
        # Agregar campos de perfil de usuario si no existen
        if 'nombre' not in existing_columns:
            op.add_column('users', sa.Column('nombre', sa.String(length=100), nullable=True))
        
        if 'apellido' not in existing_columns:
            op.add_column('users', sa.Column('apellido', sa.String(length=100), nullable=True))
        
        if 'correo' not in existing_columns:
            op.add_column('users', sa.Column('correo', sa.String(length=255), nullable=True))
        
        if 'foto' not in existing_columns:
            op.add_column('users', sa.Column('foto', sa.String(length=500), nullable=True))


def downgrade() -> None:
    # Eliminar campos de perfil de usuario
    op.drop_column('users', 'foto')
    op.drop_column('users', 'correo')
    op.drop_column('users', 'apellido')
    op.drop_column('users', 'nombre')

