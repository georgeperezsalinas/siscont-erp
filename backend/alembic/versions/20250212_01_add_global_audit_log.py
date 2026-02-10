"""add audit_log (auditoría global ERP)

Revision ID: 20250212_01
Revises: 20250211_01
Create Date: 2026-02-12

Auditoría global tipo SAP/Oracle para todas las acciones relevantes.
Inmutable: solo INSERT, prohibido UPDATE/DELETE.
"""
from alembic import op
import sqlalchemy as sa

revision = '20250212_01'
down_revision = '20250211_01'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if 'audit_log' not in inspector.get_table_names():
        op.create_table(
            'audit_log',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('timestamp', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.Column('user_id', sa.Integer(), nullable=True),
            sa.Column('user_role', sa.String(50), nullable=True),
            sa.Column('company_id', sa.Integer(), nullable=True),
            sa.Column('module', sa.String(50), nullable=False),
            sa.Column('action', sa.String(50), nullable=False),
            sa.Column('entity_type', sa.String(100), nullable=True),
            sa.Column('entity_id', sa.Integer(), nullable=True),
            sa.Column('summary', sa.String(500), nullable=True),
            sa.Column('metadata', sa.JSON(), nullable=True),
            sa.Column('ip_address', sa.String(45), nullable=True),
            sa.Column('user_agent', sa.String(500), nullable=True),
            sa.PrimaryKeyConstraint('id'),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
            sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='SET NULL'),
        )
        op.create_index('idx_audit_log_timestamp', 'audit_log', ['timestamp'])
        op.create_index('idx_audit_log_company_module', 'audit_log', ['company_id', 'module'])
        op.create_index('idx_audit_log_user_id', 'audit_log', ['user_id'])
        op.create_index('idx_audit_log_module_action', 'audit_log', ['module', 'action'])


def downgrade():
    op.drop_table('audit_log')
