"""add_ple_fields

Revision ID: add_ple_fields
Revises: 20250103_02_add_purchase_sale_lines
Create Date: 2025-01-15 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_ple_fields'
down_revision = 'add_purchase_sale_lines'
branch_labels = None
depends_on = None

def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()
    
    # ===== Tabla PURCHASES - Campos PLE =====
    if 'purchases' in existing_tables:
        existing_columns = {col['name'] for col in inspector.get_columns('purchases')}
        
        if 'fecha_vencimiento' not in existing_columns:
            op.add_column('purchases', sa.Column('fecha_vencimiento', sa.Date(), nullable=True))
        
        if 'tipo_documento_proveedor' not in existing_columns:
            op.add_column('purchases', sa.Column('tipo_documento_proveedor', sa.String(length=1), nullable=True))
        
        if 'tipo_cambio' not in existing_columns:
            op.add_column('purchases', sa.Column('tipo_cambio', sa.Numeric(precision=4, scale=3), nullable=True))
        
        if 'estado_operacion_ple' not in existing_columns:
            op.add_column('purchases', sa.Column('estado_operacion_ple', sa.String(length=1), nullable=False, server_default='1'))
        
        if 'cuo' not in existing_columns:
            op.add_column('purchases', sa.Column('cuo', sa.String(length=40), nullable=True))
            op.create_index('ix_purchases_cuo', 'purchases', ['cuo'], unique=False)
        
        if 'correlativo_asiento' not in existing_columns:
            op.add_column('purchases', sa.Column('correlativo_asiento', sa.String(length=10), nullable=True))
        
        if 'codigo_aduana' not in existing_columns:
            op.add_column('purchases', sa.Column('codigo_aduana', sa.String(length=30), nullable=True))
        
        if 'numero_dua' not in existing_columns:
            op.add_column('purchases', sa.Column('numero_dua', sa.String(length=20), nullable=True))
        
        if 'marca_retencion' not in existing_columns:
            op.add_column('purchases', sa.Column('marca_retencion', sa.Boolean(), nullable=False, server_default='0'))
        
        if 'clasificacion_bienes' not in existing_columns:
            op.add_column('purchases', sa.Column('clasificacion_bienes', sa.String(length=1), nullable=True))
        
        if 'indicador_medios_pago' not in existing_columns:
            op.add_column('purchases', sa.Column('indicador_medios_pago', sa.Boolean(), nullable=False, server_default='0'))
        
        # Campos para documentos modificados (NC/ND)
        if 'fecha_doc_modifica' not in existing_columns:
            op.add_column('purchases', sa.Column('fecha_doc_modifica', sa.Date(), nullable=True))
        
        if 'tipo_doc_modifica' not in existing_columns:
            op.add_column('purchases', sa.Column('tipo_doc_modifica', sa.String(length=2), nullable=True))
        
        if 'serie_doc_modifica' not in existing_columns:
            op.add_column('purchases', sa.Column('serie_doc_modifica', sa.String(length=20), nullable=True))
        
        if 'numero_doc_modifica' not in existing_columns:
            op.add_column('purchases', sa.Column('numero_doc_modifica', sa.String(length=20), nullable=True))
    
    # ===== Tabla SALES - Campos PLE =====
    if 'sales' in existing_tables:
        existing_columns = {col['name'] for col in inspector.get_columns('sales')}
        
        if 'fecha_vencimiento' not in existing_columns:
            op.add_column('sales', sa.Column('fecha_vencimiento', sa.Date(), nullable=True))
        
        if 'tipo_documento_cliente' not in existing_columns:
            op.add_column('sales', sa.Column('tipo_documento_cliente', sa.String(length=1), nullable=True))
        
        if 'tipo_cambio' not in existing_columns:
            op.add_column('sales', sa.Column('tipo_cambio', sa.Numeric(precision=4, scale=3), nullable=True))
        
        if 'estado_operacion_ple' not in existing_columns:
            op.add_column('sales', sa.Column('estado_operacion_ple', sa.String(length=1), nullable=False, server_default='1'))
        
        if 'cuo' not in existing_columns:
            op.add_column('sales', sa.Column('cuo', sa.String(length=40), nullable=True))
            op.create_index('ix_sales_cuo', 'sales', ['cuo'], unique=False)
        
        if 'correlativo_asiento' not in existing_columns:
            op.add_column('sales', sa.Column('correlativo_asiento', sa.String(length=10), nullable=True))
        
        if 'valor_facturado_exportacion' not in existing_columns:
            op.add_column('sales', sa.Column('valor_facturado_exportacion', sa.Numeric(precision=14, scale=2), nullable=True))
        
        if 'descuento_base_imponible' not in existing_columns:
            op.add_column('sales', sa.Column('descuento_base_imponible', sa.Numeric(precision=14, scale=2), nullable=True))
        
        if 'descuento_igv' not in existing_columns:
            op.add_column('sales', sa.Column('descuento_igv', sa.Numeric(precision=14, scale=2), nullable=True))
        
        if 'importe_exonerado' not in existing_columns:
            op.add_column('sales', sa.Column('importe_exonerado', sa.Numeric(precision=14, scale=2), nullable=True))
        
        if 'importe_inafecto' not in existing_columns:
            op.add_column('sales', sa.Column('importe_inafecto', sa.Numeric(precision=14, scale=2), nullable=True))
        
        if 'impuesto_selectivo_consumo' not in existing_columns:
            op.add_column('sales', sa.Column('impuesto_selectivo_consumo', sa.Numeric(precision=14, scale=2), nullable=True))
        
        if 'otros_conceptos' not in existing_columns:
            op.add_column('sales', sa.Column('otros_conceptos', sa.Numeric(precision=14, scale=2), nullable=True))
        
        if 'identificacion_contrato' not in existing_columns:
            op.add_column('sales', sa.Column('identificacion_contrato', sa.String(length=12), nullable=True))
        
        # Campos para documentos modificados (NC/ND)
        if 'fecha_doc_modifica' not in existing_columns:
            op.add_column('sales', sa.Column('fecha_doc_modifica', sa.Date(), nullable=True))
        
        if 'tipo_doc_modifica' not in existing_columns:
            op.add_column('sales', sa.Column('tipo_doc_modifica', sa.String(length=2), nullable=True))
        
        if 'serie_doc_modifica' not in existing_columns:
            op.add_column('sales', sa.Column('serie_doc_modifica', sa.String(length=20), nullable=True))
        
        if 'numero_doc_modifica' not in existing_columns:
            op.add_column('sales', sa.Column('numero_doc_modifica', sa.String(length=20), nullable=True))
    
    # ===== Tabla THIRD_PARTIES - Campos PLE =====
    if 'third_parties' in existing_tables:
        existing_columns = {col['name'] for col in inspector.get_columns('third_parties')}
        
        if 'tipo_documento' not in existing_columns:
            op.add_column('third_parties', sa.Column('tipo_documento', sa.String(length=1), nullable=True))
        
        if 'direccion' not in existing_columns:
            op.add_column('third_parties', sa.Column('direccion', sa.String(length=200), nullable=True))
        
        if 'activo' not in existing_columns:
            op.add_column('third_parties', sa.Column('activo', sa.Boolean(), nullable=False, server_default='1'))

def downgrade() -> None:
    # Eliminar campos de purchases
    op.drop_column('purchases', 'numero_doc_modifica')
    op.drop_column('purchases', 'serie_doc_modifica')
    op.drop_column('purchases', 'tipo_doc_modifica')
    op.drop_column('purchases', 'fecha_doc_modifica')
    op.drop_column('purchases', 'indicador_medios_pago')
    op.drop_column('purchases', 'clasificacion_bienes')
    op.drop_column('purchases', 'marca_retencion')
    op.drop_column('purchases', 'numero_dua')
    op.drop_column('purchases', 'codigo_aduana')
    op.drop_column('purchases', 'correlativo_asiento')
    op.drop_index('ix_purchases_cuo', table_name='purchases')
    op.drop_column('purchases', 'cuo')
    op.drop_column('purchases', 'estado_operacion_ple')
    op.drop_column('purchases', 'tipo_cambio')
    op.drop_column('purchases', 'tipo_documento_proveedor')
    op.drop_column('purchases', 'fecha_vencimiento')
    
    # Eliminar campos de sales
    op.drop_column('sales', 'numero_doc_modifica')
    op.drop_column('sales', 'serie_doc_modifica')
    op.drop_column('sales', 'tipo_doc_modifica')
    op.drop_column('sales', 'fecha_doc_modifica')
    op.drop_column('sales', 'identificacion_contrato')
    op.drop_column('sales', 'otros_conceptos')
    op.drop_column('sales', 'impuesto_selectivo_consumo')
    op.drop_column('sales', 'importe_inafecto')
    op.drop_column('sales', 'importe_exonerado')
    op.drop_column('sales', 'descuento_igv')
    op.drop_column('sales', 'descuento_base_imponible')
    op.drop_column('sales', 'valor_facturado_exportacion')
    op.drop_column('sales', 'correlativo_asiento')
    op.drop_index('ix_sales_cuo', table_name='sales')
    op.drop_column('sales', 'cuo')
    op.drop_column('sales', 'estado_operacion_ple')
    op.drop_column('sales', 'tipo_cambio')
    op.drop_column('sales', 'tipo_documento_cliente')
    op.drop_column('sales', 'fecha_vencimiento')
    
    # Eliminar campos de third_parties
    op.drop_column('third_parties', 'activo')
    op.drop_column('third_parties', 'direccion')
    op.drop_column('third_parties', 'tipo_documento')


