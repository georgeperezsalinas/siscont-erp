"""add_inventario_models_almacen_stock_ajuste

Revision ID: 9da787294829
Revises: ad2696f2409a
Create Date: 2026-02-06 12:32:59.242661

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '9da787294829'
down_revision = 'ad2696f2409a'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Verificar si las tablas ya existen antes de crearlas (idempotente)
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()
    
    # ===== CREAR TABLA ALMACENES =====
    if 'almacenes' not in existing_tables:
        op.create_table(
            'almacenes',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('company_id', sa.Integer(), nullable=False),
            sa.Column('codigo', sa.String(length=50), nullable=False),
            sa.Column('nombre', sa.String(length=200), nullable=False),
            sa.Column('activo', sa.Boolean(), nullable=False, server_default='true'),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('company_id', 'codigo', name='uq_almacen_company_codigo')
        )
        op.create_index('ix_almacenes_company_id', 'almacenes', ['company_id'])
        op.create_index('ix_almacenes_codigo', 'almacenes', ['codigo'])
    
    # ===== CREAR TABLA STOCKS =====
    if 'stocks' not in existing_tables:
        op.create_table(
            'stocks',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('company_id', sa.Integer(), nullable=False),
            sa.Column('producto_id', sa.Integer(), nullable=False),
            sa.Column('almacen_id', sa.Integer(), nullable=False),
            sa.Column('cantidad_actual', sa.Numeric(12, 4), nullable=False, server_default='0'),
            sa.Column('costo_promedio', sa.Numeric(14, 2), nullable=False, server_default='0'),
            sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['producto_id'], ['products.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['almacen_id'], ['almacenes.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('company_id', 'producto_id', 'almacen_id', name='uq_stock_producto_almacen')
        )
        op.create_index('ix_stocks_company_id', 'stocks', ['company_id'])
        op.create_index('ix_stocks_producto_id', 'stocks', ['producto_id'])
        op.create_index('ix_stocks_almacen_id', 'stocks', ['almacen_id'])
    
    # ===== ACTUALIZAR TABLA PRODUCTS =====
    # Agregar columna maneja_stock si no existe
    existing_columns = [col['name'] for col in inspector.get_columns('products')] if 'products' in existing_tables else []
    if 'maneja_stock' not in existing_columns:
        op.add_column('products', sa.Column('maneja_stock', sa.Boolean(), nullable=False, server_default='true'))
    
    # ===== ACTUALIZAR TABLA INVENTORY_MOVEMENTS =====
    if 'inventory_movements' in existing_tables:
        existing_columns = [col['name'] for col in inspector.get_columns('inventory_movements')]
        
        # Agregar columna almacen_id si no existe
        if 'almacen_id' not in existing_columns:
            op.add_column('inventory_movements', sa.Column('almacen_id', sa.Integer(), nullable=True))
            op.create_foreign_key(
                'fk_inventory_movements_almacen_id',
                'inventory_movements', 'almacenes',
                ['almacen_id'], ['id'],
                ondelete='SET NULL'
            )
            op.create_index('ix_inventory_movements_almacen_id', 'inventory_movements', ['almacen_id'])
        
        # Agregar columna created_at si no existe
        if 'created_at' not in existing_columns:
            op.add_column('inventory_movements', sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')))
        
        # Renombrar columnas para alinearse con el nuevo modelo (mantener compatibilidad)
        # Si movement_type existe, crear columna tipo como alias
        if 'movement_type' in existing_columns and 'tipo' not in existing_columns:
            op.add_column('inventory_movements', sa.Column('tipo', sa.String(length=20), nullable=True))
            # Copiar datos de movement_type a tipo
            op.execute("UPDATE inventory_movements SET tipo = movement_type WHERE tipo IS NULL")
            # Hacer tipo NOT NULL después de copiar
            op.alter_column('inventory_movements', 'tipo', nullable=False)
        
        # Si quantity existe, crear columna cantidad como alias
        if 'quantity' in existing_columns and 'cantidad' not in existing_columns:
            op.add_column('inventory_movements', sa.Column('cantidad', sa.Numeric(12, 4), nullable=True))
            op.execute("UPDATE inventory_movements SET cantidad = quantity WHERE cantidad IS NULL")
            op.alter_column('inventory_movements', 'cantidad', nullable=False)
        
        # Si unit_cost existe, crear columna costo_unitario como alias
        if 'unit_cost' in existing_columns and 'costo_unitario' not in existing_columns:
            op.add_column('inventory_movements', sa.Column('costo_unitario', sa.Numeric(14, 2), nullable=True))
            op.execute("UPDATE inventory_movements SET costo_unitario = unit_cost WHERE costo_unitario IS NULL")
            op.alter_column('inventory_movements', 'costo_unitario', nullable=False)
        
        # Si total_cost existe, crear columna costo_total como alias
        if 'total_cost' in existing_columns and 'costo_total' not in existing_columns:
            op.add_column('inventory_movements', sa.Column('costo_total', sa.Numeric(14, 2), nullable=True))
            op.execute("UPDATE inventory_movements SET costo_total = total_cost WHERE costo_total IS NULL")
            op.alter_column('inventory_movements', 'costo_total', nullable=False)
        
        # Si movement_date existe, crear columna fecha como alias
        if 'movement_date' in existing_columns and 'fecha' not in existing_columns:
            op.add_column('inventory_movements', sa.Column('fecha', sa.Date(), nullable=True))
            op.execute("UPDATE inventory_movements SET fecha = movement_date WHERE fecha IS NULL")
            op.alter_column('inventory_movements', 'fecha', nullable=False)
            op.create_index('ix_inventory_movements_fecha', 'inventory_movements', ['fecha'])
        
        # Si reference_type existe, crear columna referencia_tipo como alias
        if 'reference_type' in existing_columns and 'referencia_tipo' not in existing_columns:
            op.add_column('inventory_movements', sa.Column('referencia_tipo', sa.String(length=50), nullable=True))
            op.execute("UPDATE inventory_movements SET referencia_tipo = reference_type WHERE referencia_tipo IS NULL")
        
        # Si reference_id existe, crear columna referencia_id como alias (ya existe, solo verificar)
        # reference_id ya existe, no necesita cambio


def downgrade() -> None:
    # Eliminar tablas en orden inverso (primero dependientes)
    if op.get_bind().dialect.has_table(op.get_bind(), 'stocks'):
        op.drop_table('stocks')
    if op.get_bind().dialect.has_table(op.get_bind(), 'almacenes'):
        op.drop_table('almacenes')
    
    # Revertir cambios en inventory_movements (opcional, mantener compatibilidad)
    # No revertimos las columnas nuevas para mantener compatibilidad hacia atrás
