"""add_notas_credito_debito_tables

Revision ID: 37b2df797a49
Revises: 28f9e1939beb
Create Date: 2026-02-06 17:36:07.683788

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '37b2df797a49'
down_revision = '28f9e1939beb'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Verificar si las tablas ya existen antes de crearlas (idempotente)
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()
    
    # ===== CREAR TABLA NOTA_DOCUMENTOS =====
    if 'nota_documentos' not in existing_tables:
        op.create_table(
            'nota_documentos',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('company_id', sa.Integer(), nullable=False),
            sa.Column('tipo', sa.String(length=20), nullable=False),  # CREDITO | DEBITO
            sa.Column('origen', sa.String(length=20), nullable=False),  # VENTA | COMPRA
            sa.Column('documento_ref_id', sa.Integer(), nullable=False),
            sa.Column('documento_ref_tipo', sa.String(length=20), nullable=False),  # VENTA | COMPRA
            sa.Column('serie', sa.String(length=10), nullable=False),
            sa.Column('numero', sa.String(length=20), nullable=False),
            sa.Column('fecha_emision', sa.Date(), nullable=False),
            sa.Column('motivo', sa.String(length=50), nullable=False),
            sa.Column('monto_base', sa.Numeric(14, 2), nullable=False, server_default='0'),
            sa.Column('igv', sa.Numeric(14, 2), nullable=False, server_default='0'),
            sa.Column('total', sa.Numeric(14, 2), nullable=False, server_default='0'),
            sa.Column('afecta_inventario', sa.Boolean(), nullable=False, server_default='false'),
            sa.Column('estado', sa.String(length=20), nullable=False, server_default='REGISTRADA'),
            sa.Column('journal_entry_id', sa.Integer(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.Column('created_by', sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['journal_entry_id'], ['journal_entries.id'], ondelete='SET NULL'),
            sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('company_id', 'serie', 'numero', name='uq_nota_company_serie_numero')
        )
        op.create_index('ix_nota_documentos_company_id', 'nota_documentos', ['company_id'])
        op.create_index('ix_nota_documentos_documento_ref_id', 'nota_documentos', ['documento_ref_id'])
        op.create_index('ix_nota_documentos_serie', 'nota_documentos', ['serie'])
        op.create_index('ix_nota_documentos_fecha_emision', 'nota_documentos', ['fecha_emision'])
        op.create_index('ix_nota_documentos_journal_entry_id', 'nota_documentos', ['journal_entry_id'])
    
    # ===== CREAR TABLA NOTA_DETALLES =====
    if 'nota_detalles' not in existing_tables:
        op.create_table(
            'nota_detalles',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('nota_id', sa.Integer(), nullable=False),
            sa.Column('producto_id', sa.Integer(), nullable=True),
            sa.Column('cantidad', sa.Numeric(12, 4), nullable=True),
            sa.Column('costo_unitario', sa.Numeric(14, 2), nullable=True),
            sa.Column('costo_total', sa.Numeric(14, 2), nullable=True),
            sa.Column('descripcion', sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(['nota_id'], ['nota_documentos.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['producto_id'], ['products.id'], ondelete='SET NULL'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_nota_detalles_nota_id', 'nota_detalles', ['nota_id'])
        op.create_index('ix_nota_detalles_producto_id', 'nota_detalles', ['producto_id'])


def downgrade() -> None:
    # Eliminar tablas en orden inverso (primero detalles, luego documentos)
    op.drop_table('nota_detalles')
    op.drop_table('nota_documentos')
