"""add_aplicacion_documentos_table

Revision ID: 586d4f9de682
Revises: 4122d19398fe
Create Date: 2026-02-07 09:31:56.970832

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '586d4f9de682'
down_revision = '4122d19398fe'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Verificar si la tabla ya existe antes de crearla (idempotente)
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()
    
    if 'aplicacion_documentos' not in existing_tables:
        op.create_table(
            'aplicacion_documentos',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('company_id', sa.Integer(), nullable=False),
            sa.Column('movimiento_tesoreria_id', sa.Integer(), nullable=False),
            sa.Column('tipo_documento', sa.String(length=20), nullable=False),
            sa.Column('documento_id', sa.Integer(), nullable=False),
            sa.Column('monto_aplicado', sa.Numeric(12, 2), nullable=False),
            sa.Column('fecha', sa.Date(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.Column('created_by_id', sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['movimiento_tesoreria_id'], ['movimientos_tesoreria.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL'),
            sa.PrimaryKeyConstraint('id')
        )
        
        # Crear índices
        op.create_index('ix_aplicacion_documentos_company_id', 'aplicacion_documentos', ['company_id'])
        op.create_index('ix_aplicacion_documentos_movimiento_tesoreria_id', 'aplicacion_documentos', ['movimiento_tesoreria_id'])
        op.create_index('ix_aplicacion_documentos_documento_id', 'aplicacion_documentos', ['documento_id'])
        op.create_index('idx_aplicacion_documento', 'aplicacion_documentos', ['tipo_documento', 'documento_id'])
        op.create_index('idx_aplicacion_movimiento', 'aplicacion_documentos', ['movimiento_tesoreria_id'])


def downgrade() -> None:
    # Verificar si la tabla existe antes de eliminarla
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()
    
    if 'aplicacion_documentos' in existing_tables:
        op.drop_index('idx_aplicacion_movimiento', table_name='aplicacion_documentos')
        op.drop_index('idx_aplicacion_documento', table_name='aplicacion_documentos')
        op.drop_index('ix_aplicacion_documentos_documento_id', table_name='aplicacion_documentos')
        op.drop_index('ix_aplicacion_documentos_movimiento_tesoreria_id', table_name='aplicacion_documentos')
        op.drop_index('ix_aplicacion_documentos_company_id', table_name='aplicacion_documentos')
        op.drop_table('aplicacion_documentos')
