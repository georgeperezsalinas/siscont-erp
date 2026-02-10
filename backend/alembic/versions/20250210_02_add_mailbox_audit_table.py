"""add mailbox_audit_log (auditoría casilla)

Revision ID: 20250210_02
Revises: 20250210_01
Create Date: 2026-02-10

"""
from alembic import op
import sqlalchemy as sa

revision = '20250210_02'
down_revision = '20250210_01'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if 'mailbox_audit_log' not in inspector.get_table_names():
        op.create_table(
            'mailbox_audit_log',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('event_type', sa.String(50), nullable=False),  # MESSAGE_READ, RESPONSE_SENT, MESSAGE_SENT, etc.
            sa.Column('user_id', sa.Integer(), nullable=True),
            sa.Column('company_id', sa.Integer(), nullable=True),
            sa.Column('message_id', sa.Integer(), nullable=True),
            sa.Column('metadata', sa.JSON(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.PrimaryKeyConstraint('id'),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
            sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='SET NULL'),
        )
        op.create_index('idx_mailbox_audit_created_at', 'mailbox_audit_log', ['created_at'])
        op.create_index('idx_mailbox_audit_event', 'mailbox_audit_log', ['event_type'])


def downgrade():
    op.drop_table('mailbox_audit_log')
