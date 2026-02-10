"""add company_to_admin_messages (empresa envía a SISCONT)

Revision ID: 20250209_02
Revises: 20250209_01
Create Date: 2026-02-09

"""
from alembic import op
import sqlalchemy as sa

revision = '20250209_02'
down_revision = '20250209_01'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if 'company_to_admin_messages' not in existing_tables:
        op.create_table(
            'company_to_admin_messages',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('company_id', sa.Integer(), nullable=False),
            sa.Column('subject', sa.String(500), nullable=False),
            sa.Column('body', sa.Text(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.Column('created_by', sa.Integer(), nullable=True),
            sa.Column('is_read', sa.Boolean(), nullable=False, server_default='false'),
            sa.Column('read_at', sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint('id'),
            sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        )
        op.create_index('idx_company_to_admin_messages_company_id', 'company_to_admin_messages', ['company_id'])
        op.create_index('idx_company_to_admin_messages_created_at', 'company_to_admin_messages', ['created_at'])

    if 'company_to_admin_attachments' not in existing_tables:
        op.create_table(
            'company_to_admin_attachments',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('message_id', sa.Integer(), nullable=False),
            sa.Column('file_name', sa.String(500), nullable=False),
            sa.Column('file_path', sa.String(1000), nullable=False),
            sa.Column('file_type', sa.String(100), nullable=False),
            sa.Column('uploaded_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.PrimaryKeyConstraint('id'),
            sa.ForeignKeyConstraint(['message_id'], ['company_to_admin_messages.id'], ondelete='CASCADE'),
        )
        op.create_index('idx_company_to_admin_attachments_message_id', 'company_to_admin_attachments', ['message_id'])


def downgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = inspector.get_table_names()
    for t in ['company_to_admin_attachments', 'company_to_admin_messages']:
        if t in existing:
            op.drop_table(t)
