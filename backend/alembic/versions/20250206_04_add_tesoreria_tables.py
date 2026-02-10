"""add tesoreria tables

Revision ID: 20250206_04
Revises: 20250206_03
Create Date: 2025-02-06

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20250206_04'
down_revision = '20250206_03'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Verificar si las tablas ya existen antes de crearlas (idempotente)
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()
    
    # Crear tabla metodos_pago
    if 'metodos_pago' not in existing_tables:
        op.create_table(
            'metodos_pago',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('company_id', sa.Integer(), nullable=False),
            sa.Column('codigo', sa.String(length=50), nullable=False),
            sa.Column('descripcion', sa.String(length=200), nullable=False),
            sa.Column('impacta_en', sa.String(length=10), nullable=False),  # CAJA o BANCO
            sa.Column('activo', sa.Boolean(), nullable=False, server_default='true'),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('codigo')
        )
        op.create_index('ix_metodos_pago_company_id', 'metodos_pago', ['company_id'])
    
    # Crear tabla movimientos_tesoreria
    if 'movimientos_tesoreria' not in existing_tables:
        op.create_table(
            'movimientos_tesoreria',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('company_id', sa.Integer(), nullable=False),
            sa.Column('tipo', sa.String(length=20), nullable=False),  # COBRO, PAGO, TRANSFERENCIA
            sa.Column('referencia_tipo', sa.String(length=20), nullable=False),  # VENTA, COMPRA
            sa.Column('referencia_id', sa.Integer(), nullable=False),
            sa.Column('monto', sa.Numeric(12, 2), nullable=False),
            sa.Column('fecha', sa.Date(), nullable=False),
            sa.Column('metodo_pago_id', sa.Integer(), nullable=False),
            sa.Column('estado', sa.String(length=20), nullable=False, server_default='REGISTRADO'),
            sa.Column('journal_entry_id', sa.Integer(), nullable=True),
            sa.Column('glosa', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.Column('created_by_id', sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['metodo_pago_id'], ['metodos_pago.id'], ondelete='RESTRICT'),
            sa.ForeignKeyConstraint(['journal_entry_id'], ['journal_entries.id'], ondelete='SET NULL'),
            sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_movimientos_tesoreria_company_id', 'movimientos_tesoreria', ['company_id'])
        op.create_index('ix_movimientos_tesoreria_referencia_id', 'movimientos_tesoreria', ['referencia_id'])
        op.create_index('ix_movimientos_tesoreria_journal_entry_id', 'movimientos_tesoreria', ['journal_entry_id'])


def downgrade() -> None:
    # Eliminar tablas en orden inverso (primero dependientes)
    op.drop_table('movimientos_tesoreria')
    op.drop_table('metodos_pago')

