"""add_account_validation_rules_tables

Revision ID: 20250206_01
Revises: 20250205_03
Create Date: 2025-02-06

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import sqlite

# revision identifiers, used by Alembic.
revision = '20250206_01'
down_revision = '20250205_03'
branch_labels = None
depends_on = None


def upgrade():
    # Verificar si las tablas ya existen antes de crearlas (idempotente)
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()
    
    # Crear tabla account_validation_rules
    if 'account_validation_rules' not in existing_tables:
        op.create_table(
            'account_validation_rules',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('company_id', sa.Integer(), nullable=False),
            sa.Column('rule_type', sa.String(length=50), nullable=False),
            sa.Column('name', sa.String(length=200), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('account_patterns', sa.JSON(), nullable=False),
            sa.Column('severity', sa.String(length=20), server_default='ERROR', nullable=False),
            sa.Column('message', sa.String(length=500), nullable=False),
            sa.Column('suggested_accounts', sa.JSON(), nullable=True),
            sa.Column('suggested_glosa', sa.String(length=500), nullable=True),
            sa.Column('conditions', sa.JSON(), nullable=True),
            sa.Column('active', sa.Boolean(), server_default='true', nullable=False),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
            sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_account_validation_rules_company_id'), 'account_validation_rules', ['company_id'], unique=False)
    
    # Crear tabla account_compatibility_rules
    if 'account_compatibility_rules' not in existing_tables:
        op.create_table(
            'account_compatibility_rules',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('company_id', sa.Integer(), nullable=False),
            sa.Column('account_code_pattern', sa.String(length=50), nullable=False),
            sa.Column('compatible_with', sa.JSON(), nullable=False),
            sa.Column('confidence', sa.Float(), server_default='0.8', nullable=False),
            sa.Column('usage_count', sa.Integer(), server_default='0', nullable=False),
            sa.Column('last_used', sa.DateTime(), nullable=True),
            sa.Column('active', sa.Boolean(), server_default='true', nullable=False),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
            sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('company_id', 'account_code_pattern', name='uq_company_account_compat')
        )
        op.create_index(op.f('ix_account_compatibility_rules_company_id'), 'account_compatibility_rules', ['company_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_account_compatibility_rules_company_id'), table_name='account_compatibility_rules')
    op.drop_table('account_compatibility_rules')
    op.drop_index(op.f('ix_account_validation_rules_company_id'), table_name='account_validation_rules')
    op.drop_table('account_validation_rules')

