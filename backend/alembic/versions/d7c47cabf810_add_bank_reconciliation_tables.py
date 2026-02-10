"""add_bank_reconciliation_tables

Revision ID: d7c47cabf810
Revises: add_period_closing
Create Date: 2025-11-01 03:36:27.311351

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'd7c47cabf810'
down_revision = 'add_period_closing'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Verificar si las tablas ya existen antes de crearlas
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()
    
    # Crear tabla bank_accounts
    if 'bank_accounts' not in existing_tables:
        op.create_table(
        'bank_accounts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('company_id', sa.Integer(), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('bank_name', sa.String(length=100), nullable=False),
        sa.Column('account_number', sa.String(length=50), nullable=False),
        sa.Column('currency', sa.String(length=3), nullable=False, server_default='PEN'),
        sa.Column('active', sa.Boolean(), nullable=False, server_default='true'),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], name='fk_bank_accounts_account_id'),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], name='fk_bank_accounts_company_id'),
        sa.PrimaryKeyConstraint('id', name='pk_bank_accounts')
    )
        op.create_index('ix_bank_accounts_company_id', 'bank_accounts', ['company_id'])
        op.create_index('ix_bank_accounts_account_id', 'bank_accounts', ['account_id'])
    
    # Crear tabla bank_statements
    if 'bank_statements' not in existing_tables:
        op.create_table(
        'bank_statements',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('bank_account_id', sa.Integer(), nullable=False),
        sa.Column('period_id', sa.Integer(), nullable=False),
        sa.Column('statement_date', sa.Date(), nullable=False),
        sa.Column('opening_balance', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('closing_balance', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('uploaded_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('uploaded_by', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='PENDIENTE'),
        sa.ForeignKeyConstraint(['bank_account_id'], ['bank_accounts.id'], name='fk_bank_statements_bank_account_id'),
        sa.ForeignKeyConstraint(['period_id'], ['periods.id'], name='fk_bank_statements_period_id'),
        sa.ForeignKeyConstraint(['uploaded_by'], ['users.id'], name='fk_bank_statements_uploaded_by'),
        sa.PrimaryKeyConstraint('id', name='pk_bank_statements')
    )
        op.create_index('ix_bank_statements_bank_account_id', 'bank_statements', ['bank_account_id'])
        op.create_index('ix_bank_statements_period_id', 'bank_statements', ['period_id'])
    
    # Crear tabla bank_transactions
    if 'bank_transactions' not in existing_tables:
        op.create_table(
        'bank_transactions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('statement_id', sa.Integer(), nullable=False),
        sa.Column('transaction_date', sa.Date(), nullable=False),
        sa.Column('description', sa.String(length=500), nullable=False),
        sa.Column('reference', sa.String(length=100), nullable=True),
        sa.Column('debit', sa.Numeric(precision=14, scale=2), nullable=False, server_default='0'),
        sa.Column('credit', sa.Numeric(precision=14, scale=2), nullable=False, server_default='0'),
        sa.Column('balance', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('reconciled', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('entry_line_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['statement_id'], ['bank_statements.id'], name='fk_bank_transactions_statement_id'),
        sa.ForeignKeyConstraint(['entry_line_id'], ['entry_lines.id'], name='fk_bank_transactions_entry_line_id'),
        sa.PrimaryKeyConstraint('id', name='pk_bank_transactions')
    )
        op.create_index('ix_bank_transactions_statement_id', 'bank_transactions', ['statement_id'])
    
    # Crear tabla bank_reconciliations
    if 'bank_reconciliations' not in existing_tables:
        op.create_table(
        'bank_reconciliations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('bank_account_id', sa.Integer(), nullable=False),
        sa.Column('period_id', sa.Integer(), nullable=False),
        sa.Column('statement_id', sa.Integer(), nullable=True),
        sa.Column('book_balance', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('bank_balance', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('pending_debits', sa.Numeric(precision=14, scale=2), nullable=False, server_default='0'),
        sa.Column('pending_credits', sa.Numeric(precision=14, scale=2), nullable=False, server_default='0'),
        sa.Column('reconciled_balance', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='PENDIENTE'),
        sa.Column('reconciled_at', sa.DateTime(), nullable=True),
        sa.Column('reconciled_by', sa.Integer(), nullable=True),
        sa.Column('notes', sa.String(length=500), nullable=True),
        sa.ForeignKeyConstraint(['bank_account_id'], ['bank_accounts.id'], name='fk_bank_reconciliations_bank_account_id'),
        sa.ForeignKeyConstraint(['period_id'], ['periods.id'], name='fk_bank_reconciliations_period_id'),
        sa.ForeignKeyConstraint(['statement_id'], ['bank_statements.id'], name='fk_bank_reconciliations_statement_id'),
        sa.ForeignKeyConstraint(['reconciled_by'], ['users.id'], name='fk_bank_reconciliations_reconciled_by'),
        sa.PrimaryKeyConstraint('id', name='pk_bank_reconciliations')
    )
        op.create_index('ix_bank_reconciliations_bank_account_id', 'bank_reconciliations', ['bank_account_id'])
        op.create_index('ix_bank_reconciliations_period_id', 'bank_reconciliations', ['period_id'])


def downgrade() -> None:
    op.drop_index('ix_bank_reconciliations_period_id', table_name='bank_reconciliations')
    op.drop_index('ix_bank_reconciliations_bank_account_id', table_name='bank_reconciliations')
    op.drop_table('bank_reconciliations')
    op.drop_index('ix_bank_transactions_statement_id', table_name='bank_transactions')
    op.drop_table('bank_transactions')
    op.drop_index('ix_bank_statements_period_id', table_name='bank_statements')
    op.drop_index('ix_bank_statements_bank_account_id', table_name='bank_statements')
    op.drop_table('bank_statements')
    op.drop_index('ix_bank_accounts_account_id', table_name='bank_accounts')
    op.drop_index('ix_bank_accounts_company_id', table_name='bank_accounts')
    op.drop_table('bank_accounts')
