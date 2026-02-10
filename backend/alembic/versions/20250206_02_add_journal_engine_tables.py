"""add_journal_engine_tables

Revision ID: 20250206_02
Revises: 20250206_01
Create Date: 2025-02-06

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import sqlite

# revision identifiers, used by Alembic.
revision = '20250206_02'
down_revision = '20250206_01'
branch_labels = None
depends_on = None


def upgrade():
    # Verificar si las tablas ya existen antes de crearlas (idempotente)
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()
    
    # Crear tabla eventos_contables
    if 'eventos_contables' not in existing_tables:
        op.create_table(
            'eventos_contables',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('company_id', sa.Integer(), nullable=False),
            sa.Column('tipo', sa.String(length=50), nullable=False),
            sa.Column('nombre', sa.String(length=200), nullable=False),
            sa.Column('descripcion', sa.Text(), nullable=True),
            sa.Column('activo', sa.Boolean(), server_default='true', nullable=False),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
            sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_eventos_contables_company_id'), 'eventos_contables', ['company_id'], unique=False)
    
    # Crear tabla reglas_contables
    if 'reglas_contables' not in existing_tables:
        op.create_table(
            'reglas_contables',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('evento_id', sa.Integer(), nullable=False),
            sa.Column('company_id', sa.Integer(), nullable=False),
            sa.Column('condicion', sa.Text(), nullable=True),
            sa.Column('lado', sa.String(length=10), nullable=False),
            sa.Column('tipo_cuenta', sa.String(length=50), nullable=False),
            sa.Column('tipo_monto', sa.String(length=20), nullable=False),
            sa.Column('orden', sa.Integer(), server_default='0', nullable=False),
            sa.Column('config', sa.JSON(), nullable=True),
            sa.Column('activo', sa.Boolean(), server_default='true', nullable=False),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
            sa.ForeignKeyConstraint(['evento_id'], ['eventos_contables.id'], ),
            sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_reglas_contables_evento_id'), 'reglas_contables', ['evento_id'], unique=False)
        op.create_index(op.f('ix_reglas_contables_company_id'), 'reglas_contables', ['company_id'], unique=False)
    
    # Crear tabla tipo_cuenta_mapeos
    if 'tipo_cuenta_mapeos' not in existing_tables:
        op.create_table(
            'tipo_cuenta_mapeos',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('company_id', sa.Integer(), nullable=False),
            sa.Column('tipo_cuenta', sa.String(length=50), nullable=False),
            sa.Column('account_id', sa.Integer(), nullable=False),
            sa.Column('config', sa.JSON(), nullable=True),
            sa.Column('activo', sa.Boolean(), server_default='true', nullable=False),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
            sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ),
            sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('company_id', 'tipo_cuenta', name='uq_company_tipo_cuenta')
        )
        op.create_index(op.f('ix_tipo_cuenta_mapeos_company_id'), 'tipo_cuenta_mapeos', ['company_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_tipo_cuenta_mapeos_company_id'), table_name='tipo_cuenta_mapeos')
    op.drop_table('tipo_cuenta_mapeos')
    op.drop_index(op.f('ix_reglas_contables_company_id'), table_name='reglas_contables')
    op.drop_index(op.f('ix_reglas_contables_evento_id'), table_name='reglas_contables')
    op.drop_table('reglas_contables')
    op.drop_index(op.f('ix_eventos_contables_company_id'), table_name='eventos_contables')
    op.drop_table('eventos_contables')

