"""add categoria to eventos_contables

Revision ID: 20250206_06
Revises: 20250206_05
Create Date: 2026-02-06 22:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20250206_06'
down_revision = '20250206_05'
branch_labels = None
depends_on = None


def upgrade():
    # Verificar si la tabla existe y si la columna ya existe (idempotente)
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()
    
    if 'eventos_contables' in existing_tables:
        # Verificar si la columna ya existe
        columns = [col['name'] for col in inspector.get_columns('eventos_contables')]
        
        if 'categoria' not in columns:
            # Agregar columna categoria a eventos_contables
            op.add_column('eventos_contables', 
                sa.Column('categoria', sa.String(length=50), nullable=True)
            )
            
            # Actualizar eventos existentes con categorías según su tipo
            # Eventos generales (transversales)
            op.execute("""
                UPDATE eventos_contables 
                SET categoria = 'GENERAL' 
                WHERE tipo IN ('COMPRA', 'VENTA', 'PAGO', 'COBRO')
                AND categoria IS NULL
            """)
            
            # Eventos de Tesorería
            op.execute("""
                UPDATE eventos_contables 
                SET categoria = 'TESORERIA' 
                WHERE tipo IN ('COBRO_CAJA', 'COBRO_BANCO', 'PAGO_CAJA', 'PAGO_BANCO', 'TRANSFERENCIA')
                AND categoria IS NULL
            """)
        
        # Verificar si el índice ya existe antes de crearlo
        indexes = [idx['name'] for idx in inspector.get_indexes('eventos_contables')]
        if 'ix_eventos_contables_categoria' not in indexes:
            # Crear índice para mejorar búsquedas por categoría
            op.create_index('ix_eventos_contables_categoria', 'eventos_contables', ['categoria'])


def downgrade():
    # Eliminar índice
    op.drop_index('ix_eventos_contables_categoria', table_name='eventos_contables')
    
    # Eliminar columna
    op.drop_column('eventos_contables', 'categoria')

