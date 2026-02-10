"""fix_missing_columns_from_dump

Agrega columnas faltantes cuando la BD fue restaurada de un dump antiguo.
Idempotente: verifica existencia antes de agregar.

Revision ID: 20250208_01
Revises: 20250207_01
Create Date: 2025-02-08

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = '20250208_01'
down_revision = '20250207_01'
branch_labels = None
depends_on = None


def _column_exists(conn, table: str, column: str) -> bool:
    insp = inspect(conn)
    cols = [c['name'] for c in insp.get_columns(table)]
    return column in cols


def upgrade() -> None:
    conn = op.get_bind()
    is_pg = conn.dialect.name == 'postgresql'

    # --- journal_entries: columnas faltantes ---
    je_cols = [
        ('correlative', sa.String(20)),
        ('motor_metadata', sa.JSON() if is_pg else sa.Text()),
        ('created_by', sa.Integer()),
        ('created_at', sa.DateTime()),
        ('updated_by', sa.Integer()),
        ('updated_at', sa.DateTime()),
        ('posted_by', sa.Integer()),
        ('posted_at', sa.DateTime()),
        ('reversed_entry_id', sa.Integer()),
        ('reversed_by', sa.Integer()),
        ('reversed_at', sa.DateTime()),
        ('integrity_hash', sa.String(64)),
        ('warning_confirmations', sa.JSON() if is_pg else sa.Text()),
    ]
    for col_name, col_type in je_cols:
        if not _column_exists(conn, 'journal_entries', col_name):
            op.add_column('journal_entries', sa.Column(col_name, col_type, nullable=True))

    # FKs para journal_entries (solo si la columna existe y no tiene FK)
    fk_specs = [
        ('created_by', 'users'),
        ('updated_by', 'users'),
        ('posted_by', 'users'),
        ('reversed_by', 'users'),
        ('reversed_entry_id', 'journal_entries'),
    ]
    for col_name, ref_table in fk_specs:
        if _column_exists(conn, 'journal_entries', col_name):
            try:
                op.create_foreign_key(
                    f'fk_je_{col_name}', 'journal_entries', ref_table,
                    [col_name], ['id']
                )
            except Exception:
                pass  # FK ya existe

    # Índices
    for idx_name, col in [
        ('ix_journal_entries_correlative', 'correlative'),
        ('ix_journal_entries_created_by', 'created_by'),
        ('ix_journal_entries_reversed_entry_id', 'reversed_entry_id'),
        ('ix_journal_entries_integrity_hash', 'integrity_hash'),
    ]:
        if _column_exists(conn, 'journal_entries', col):
            try:
                op.create_index(idx_name, 'journal_entries', [col], unique=False)
            except Exception:
                pass

    # --- accounts: class_code, class_name ---
    if not _column_exists(conn, 'accounts', 'class_code'):
        op.add_column('accounts', sa.Column('class_code', sa.String(2), nullable=True))
        op.create_index('ix_accounts_class_code', 'accounts', ['class_code'], unique=False)
    if not _column_exists(conn, 'accounts', 'class_name'):
        op.add_column('accounts', sa.Column('class_name', sa.String(100), nullable=True))


def downgrade() -> None:
    # No hacemos downgrade para no perder datos
    pass
