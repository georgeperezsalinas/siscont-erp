"""add electronic mailbox tables (Casilla Electrónica Empresarial)

Revision ID: 20250209_01
Revises: 20250208_02
Create Date: 2026-02-09

"""
from alembic import op
import sqlalchemy as sa

revision = '20250209_01'
down_revision = '20250208_02'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if 'electronic_mailboxes' not in existing_tables:
        op.create_table(
            'electronic_mailboxes',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('company_id', sa.Integer(), nullable=False),
            sa.Column('status', sa.String(20), nullable=False, server_default='ACTIVE'),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.PrimaryKeyConstraint('id'),
            sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='CASCADE'),
            sa.UniqueConstraint('company_id', name='uq_electronic_mailboxes_company_id'),
        )
        op.create_index('idx_electronic_mailboxes_company_id', 'electronic_mailboxes', ['company_id'])

    if 'mailbox_messages' not in existing_tables:
        op.create_table(
            'mailbox_messages',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('mailbox_id', sa.Integer(), nullable=False),
            sa.Column('subject', sa.String(500), nullable=False),
            sa.Column('body', sa.Text(), nullable=False),
            sa.Column('message_type', sa.String(50), nullable=False),
            sa.Column('priority', sa.String(20), nullable=False, server_default='NORMAL'),
            sa.Column('requires_response', sa.Boolean(), nullable=False, server_default='false'),
            sa.Column('due_date', sa.Date(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.Column('created_by', sa.Integer(), nullable=True),
            sa.Column('is_read', sa.Boolean(), nullable=False, server_default='false'),
            sa.Column('read_at', sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint('id'),
            sa.ForeignKeyConstraint(['mailbox_id'], ['electronic_mailboxes.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        )
        op.create_index('idx_mailbox_messages_mailbox_id', 'mailbox_messages', ['mailbox_id'])
        op.create_index('idx_mailbox_messages_created_at', 'mailbox_messages', ['created_at'])

    if 'mailbox_attachments' not in existing_tables:
        op.create_table(
            'mailbox_attachments',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('message_id', sa.Integer(), nullable=False),
            sa.Column('file_name', sa.String(500), nullable=False),
            sa.Column('file_path', sa.String(1000), nullable=False),
            sa.Column('file_type', sa.String(100), nullable=False),
            sa.Column('uploaded_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.PrimaryKeyConstraint('id'),
            sa.ForeignKeyConstraint(['message_id'], ['mailbox_messages.id'], ondelete='CASCADE'),
        )
        op.create_index('idx_mailbox_attachments_message_id', 'mailbox_attachments', ['message_id'])

    if 'mailbox_responses' not in existing_tables:
        op.create_table(
            'mailbox_responses',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('message_id', sa.Integer(), nullable=False),
            sa.Column('company_id', sa.Integer(), nullable=False),
            sa.Column('response_text', sa.Text(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.Column('created_by', sa.Integer(), nullable=True),
            sa.PrimaryKeyConstraint('id'),
            sa.ForeignKeyConstraint(['message_id'], ['mailbox_messages.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        )
        op.create_index('idx_mailbox_responses_message_id', 'mailbox_responses', ['message_id'])
        op.create_index('idx_mailbox_responses_company_id', 'mailbox_responses', ['company_id'])

    if 'mailbox_response_attachments' not in existing_tables:
        op.create_table(
            'mailbox_response_attachments',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('response_id', sa.Integer(), nullable=False),
            sa.Column('file_name', sa.String(500), nullable=False),
            sa.Column('file_path', sa.String(1000), nullable=False),
            sa.Column('file_type', sa.String(100), nullable=False),
            sa.Column('uploaded_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.PrimaryKeyConstraint('id'),
            sa.ForeignKeyConstraint(['response_id'], ['mailbox_responses.id'], ondelete='CASCADE'),
        )
        op.create_index('idx_mailbox_response_attachments_response_id', 'mailbox_response_attachments', ['response_id'])


def downgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = inspector.get_table_names()
    for t in ['mailbox_response_attachments', 'mailbox_responses', 'mailbox_attachments', 'mailbox_messages', 'electronic_mailboxes']:
        if t in existing:
            op.drop_table(t)
