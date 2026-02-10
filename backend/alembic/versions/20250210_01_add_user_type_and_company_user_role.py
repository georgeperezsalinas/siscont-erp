"""add user_type and company_user role

Revision ID: 20250210_01
Revises: 20250209_02
Create Date: 2026-02-10

"""
from alembic import op
import sqlalchemy as sa

revision = '20250210_01'
down_revision = '20250209_02'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    dialect = conn.dialect.name

    # user_type en users
    if 'users' in inspector.get_table_names():
        user_columns = {c['name'] for c in inspector.get_columns('users')}
        if 'user_type' not in user_columns:
            op.add_column('users', sa.Column('user_type', sa.String(30), nullable=True, server_default='SISCONT_INTERNAL'))
            op.execute(sa.text("UPDATE users SET user_type = 'COMPANY_USER' WHERE role = 'USUARIO_EMPRESA'"))
            op.execute(sa.text("UPDATE users SET user_type = 'SISCONT_INTERNAL' WHERE user_type IS NULL"))
            op.alter_column('users', 'user_type', nullable=False)

    # role y is_active en user_companies (solo PostgreSQL – SQLite no soporta ADD en PK table fácilmente)
    if 'user_companies' in inspector.get_table_names():
        uc_columns = {c['name'] for c in inspector.get_columns('user_companies')}
        if 'role' not in uc_columns:
            op.add_column('user_companies', sa.Column('role', sa.String(50), nullable=True, server_default='EMPRESA_USUARIO'))
        if 'is_active' not in uc_columns:
            op.add_column('user_companies', sa.Column('is_active', sa.Boolean(), nullable=True, server_default='1'))


def downgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if 'users' in inspector.get_table_names():
        if 'user_type' in {c['name'] for c in inspector.get_columns('users')}:
            op.drop_column('users', 'user_type')
    if 'user_companies' in inspector.get_table_names():
        uc_cols = {c['name'] for c in inspector.get_columns('user_companies')}
        if 'role' in uc_cols:
            op.drop_column('user_companies', 'role')
        if 'is_active' in uc_cols:
            op.drop_column('user_companies', 'is_active')
