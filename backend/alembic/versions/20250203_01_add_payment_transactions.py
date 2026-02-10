"""add payment transactions table

Revision ID: 20250203_01
Revises: 20250202_02
Create Date: 2025-02-03

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20250203_01'
down_revision = '20250202_02'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Crear tabla payment_transactions
    op.create_table(
        'payment_transactions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('company_id', sa.Integer(), nullable=False),
        sa.Column('transaction_type', sa.String(length=20), nullable=False),
        sa.Column('purchase_id', sa.Integer(), nullable=True),
        sa.Column('sale_id', sa.Integer(), nullable=True),
        sa.Column('payment_date', sa.Date(), nullable=False),
        sa.Column('amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('currency', sa.String(length=3), nullable=False, server_default='PEN'),
        sa.Column('cash_account_code', sa.String(length=20), nullable=False, server_default='10.10'),
        sa.Column('payment_method', sa.String(length=50), nullable=False, server_default='EFECTIVO'),
        sa.Column('payment_reference', sa.String(length=100), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('journal_entry_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by', sa.String(length=100), nullable=True),
        sa.ForeignKeyConstraint(['purchase_id'], ['purchases.id'], ),
        sa.ForeignKeyConstraint(['sale_id'], ['sales.id'], ),
        sa.ForeignKeyConstraint(['journal_entry_id'], ['journal_entries.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Crear índices
    op.create_index('ix_payment_transactions_company_id', 'payment_transactions', ['company_id'])
    op.create_index('ix_payment_transactions_purchase_id', 'payment_transactions', ['purchase_id'])
    op.create_index('ix_payment_transactions_sale_id', 'payment_transactions', ['sale_id'])
    op.create_index('ix_payment_transactions_payment_date', 'payment_transactions', ['payment_date'])
    op.create_index('ix_payment_transactions_journal_entry_id', 'payment_transactions', ['journal_entry_id'])


def downgrade() -> None:
    op.drop_index('ix_payment_transactions_journal_entry_id', table_name='payment_transactions')
    op.drop_index('ix_payment_transactions_payment_date', table_name='payment_transactions')
    op.drop_index('ix_payment_transactions_sale_id', table_name='payment_transactions')
    op.drop_index('ix_payment_transactions_purchase_id', table_name='payment_transactions')
    op.drop_index('ix_payment_transactions_company_id', table_name='payment_transactions')
    op.drop_table('payment_transactions')

