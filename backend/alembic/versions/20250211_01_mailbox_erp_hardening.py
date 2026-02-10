"""Casilla Electrónica ERP: read_by_user_id, is_acknowledged, file_hash, status

Revision ID: 20250211_01
Revises: 20250210_02
Create Date: 2026-02-11

Objetivo: Cumplir requisitos ERP de inmutabilidad, trazabilidad y auditoría.
- read_by_user_id: quién leyó el mensaje
- is_acknowledged: constancia de recepción
- acknowledged_at, acknowledged_by: fecha y usuario
- file_hash (SHA256), file_size: integridad adjuntos
- message_status: ENVIADO, LEIDO, RESPONDIDO, VENCIDO (derivado, se persiste para consultas)
"""
from alembic import op
import sqlalchemy as sa

revision = '20250211_01'
down_revision = '20250210_02'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    # --- mailbox_messages ---
    if 'mailbox_messages' in inspector.get_table_names():
        cols = [c['name'] for c in inspector.get_columns('mailbox_messages')]
        if 'read_by_user_id' not in cols:
            op.add_column('mailbox_messages', sa.Column('read_by_user_id', sa.Integer(), nullable=True))
            op.create_foreign_key(
                'fk_mailbox_messages_read_by', 'mailbox_messages', 'users',
                ['read_by_user_id'], ['id'], ondelete='SET NULL'
            )
        if 'is_acknowledged' not in cols:
            op.add_column('mailbox_messages', sa.Column('is_acknowledged', sa.Boolean(), nullable=False, server_default='false'))
        if 'acknowledged_at' not in cols:
            op.add_column('mailbox_messages', sa.Column('acknowledged_at', sa.DateTime(), nullable=True))
        if 'acknowledged_by_user_id' not in cols:
            op.add_column('mailbox_messages', sa.Column('acknowledged_by_user_id', sa.Integer(), nullable=True))
            op.create_foreign_key(
                'fk_mailbox_messages_ack_by', 'mailbox_messages', 'users',
                ['acknowledged_by_user_id'], ['id'], ondelete='SET NULL'
            )
        if 'message_status' not in cols:
            op.add_column('mailbox_messages', sa.Column('message_status', sa.String(20), nullable=True, server_default='ENVIADO'))

    # --- company_to_admin_messages ---
    if 'company_to_admin_messages' in inspector.get_table_names():
        cols = [c['name'] for c in inspector.get_columns('company_to_admin_messages')]
        if 'read_by_user_id' not in cols:
            op.add_column('company_to_admin_messages', sa.Column('read_by_user_id', sa.Integer(), nullable=True))
            op.create_foreign_key(
                'fk_company_to_admin_read_by', 'company_to_admin_messages', 'users',
                ['read_by_user_id'], ['id'], ondelete='SET NULL'
            )
        if 'is_acknowledged' not in cols:
            op.add_column('company_to_admin_messages', sa.Column('is_acknowledged', sa.Boolean(), nullable=False, server_default='false'))
        if 'acknowledged_at' not in cols:
            op.add_column('company_to_admin_messages', sa.Column('acknowledged_at', sa.DateTime(), nullable=True))
        if 'acknowledged_by_user_id' not in cols:
            op.add_column('company_to_admin_messages', sa.Column('acknowledged_by_user_id', sa.Integer(), nullable=True))
            op.create_foreign_key(
                'fk_company_to_admin_ack_by', 'company_to_admin_messages', 'users',
                ['acknowledged_by_user_id'], ['id'], ondelete='SET NULL'
            )

    # --- mailbox_attachments ---
    if 'mailbox_attachments' in inspector.get_table_names():
        cols = [c['name'] for c in inspector.get_columns('mailbox_attachments')]
        if 'file_hash' not in cols:
            op.add_column('mailbox_attachments', sa.Column('file_hash', sa.String(64), nullable=True))
        if 'file_size_bytes' not in cols:
            op.add_column('mailbox_attachments', sa.Column('file_size_bytes', sa.BigInteger(), nullable=True))

    # --- mailbox_response_attachments ---
    if 'mailbox_response_attachments' in inspector.get_table_names():
        cols = [c['name'] for c in inspector.get_columns('mailbox_response_attachments')]
        if 'file_hash' not in cols:
            op.add_column('mailbox_response_attachments', sa.Column('file_hash', sa.String(64), nullable=True))
        if 'file_size_bytes' not in cols:
            op.add_column('mailbox_response_attachments', sa.Column('file_size_bytes', sa.BigInteger(), nullable=True))

    # --- company_to_admin_attachments ---
    if 'company_to_admin_attachments' in inspector.get_table_names():
        cols = [c['name'] for c in inspector.get_columns('company_to_admin_attachments')]
        if 'file_hash' not in cols:
            op.add_column('company_to_admin_attachments', sa.Column('file_hash', sa.String(64), nullable=True))
        if 'file_size_bytes' not in cols:
            op.add_column('company_to_admin_attachments', sa.Column('file_size_bytes', sa.BigInteger(), nullable=True))

    # --- mailbox_audit_log: ampliar metadata para attachment_id ---
    if 'mailbox_audit_log' in inspector.get_table_names():
        cols = [c['name'] for c in inspector.get_columns('mailbox_audit_log')]
        if 'attachment_id' not in cols:
            op.add_column('mailbox_audit_log', sa.Column('attachment_id', sa.Integer(), nullable=True))


def downgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if 'mailbox_audit_log' in tables:
        cols = [c['name'] for c in inspector.get_columns('mailbox_audit_log')]
        if 'attachment_id' in cols:
            op.drop_column('mailbox_audit_log', 'attachment_id')

    for tbl in ['mailbox_attachments', 'mailbox_response_attachments', 'company_to_admin_attachments']:
        if tbl not in tables:
            continue
        cols = [c['name'] for c in inspector.get_columns(tbl)]
        for col in ['file_hash', 'file_size_bytes']:
            if col in cols:
                op.drop_column(tbl, col)

    if 'mailbox_messages' in tables:
        cols = [c['name'] for c in inspector.get_columns('mailbox_messages')]
        for fk in ['fk_mailbox_messages_read_by', 'fk_mailbox_messages_ack_by']:
            try:
                op.drop_constraint(fk, 'mailbox_messages', type_='foreignkey')
            except Exception:
                pass
        for col in ['read_by_user_id', 'is_acknowledged', 'acknowledged_at', 'acknowledged_by_user_id', 'message_status']:
            if col in cols:
                op.drop_column('mailbox_messages', col)

    if 'company_to_admin_messages' in tables:
        cols = [c['name'] for c in inspector.get_columns('company_to_admin_messages')]
        for fk in ['fk_company_to_admin_read_by', 'fk_company_to_admin_ack_by']:
            try:
                op.drop_constraint(fk, 'company_to_admin_messages', type_='foreignkey')
            except Exception:
                pass
        for col in ['read_by_user_id', 'is_acknowledged', 'acknowledged_at', 'acknowledged_by_user_id']:
            if col in cols:
                op.drop_column('company_to_admin_messages', col)
