"""add sunat fields to companies and third_parties

Revision ID: 20250116_01_add_sunat_fields
Revises: 20250104_01_add_user_profile_fields
Create Date: 2025-01-16

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20250116_01_add_sunat_fields'
down_revision = '20250104_01'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Verificar si las columnas ya existen antes de agregarlas (idempotente)
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    # ============================================
    # TABLA: companies
    # ============================================
    if 'companies' in inspector.get_table_names():
        existing_columns = {col['name'] for col in inspector.get_columns('companies')}
        
        # Campos SUNAT/PLE para companies
        if 'commercial_name' not in existing_columns:
            op.add_column('companies', sa.Column('commercial_name', sa.String(length=200), nullable=True))
        
        if 'taxpayer_type' not in existing_columns:
            op.add_column('companies', sa.Column('taxpayer_type', sa.String(length=50), nullable=True))
        
        if 'fiscal_address' not in existing_columns:
            op.add_column('companies', sa.Column('fiscal_address', sa.String(length=500), nullable=True))
        
        if 'ubigeo' not in existing_columns:
            op.add_column('companies', sa.Column('ubigeo', sa.String(length=6), nullable=True))
        
        if 'phone' not in existing_columns:
            op.add_column('companies', sa.Column('phone', sa.String(length=20), nullable=True))
        
        if 'email' not in existing_columns:
            op.add_column('companies', sa.Column('email', sa.String(length=255), nullable=True))
        
        if 'tax_regime' not in existing_columns:
            op.add_column('companies', sa.Column('tax_regime', sa.String(length=100), nullable=True))
        
        if 'economic_activity_code' not in existing_columns:
            op.add_column('companies', sa.Column('economic_activity_code', sa.String(length=10), nullable=True))
        
        if 'sunat_status' not in existing_columns:
            op.add_column('companies', sa.Column('sunat_status', sa.String(length=50), nullable=True))
        
        if 'domicile_condition' not in existing_columns:
            op.add_column('companies', sa.Column('domicile_condition', sa.String(length=50), nullable=True))
        
        # Representante Legal
        if 'legal_representative_name' not in existing_columns:
            op.add_column('companies', sa.Column('legal_representative_name', sa.String(length=200), nullable=True))
        
        if 'legal_representative_dni' not in existing_columns:
            op.add_column('companies', sa.Column('legal_representative_dni', sa.String(length=20), nullable=True))
        
        if 'legal_representative_position' not in existing_columns:
            op.add_column('companies', sa.Column('legal_representative_position', sa.String(length=100), nullable=True))
    
    # ============================================
    # TABLA: third_parties
    # ============================================
    if 'third_parties' in inspector.get_table_names():
        existing_columns = {col['name'] for col in inspector.get_columns('third_parties')}
        
        # Campos SUNAT/PLE para third_parties
        if 'country_code' not in existing_columns:
            op.add_column('third_parties', sa.Column('country_code', sa.String(length=3), nullable=True, server_default='PE'))
        
        if 'third_party_type' not in existing_columns:
            op.add_column('third_parties', sa.Column('third_party_type', sa.String(length=20), nullable=True, server_default='Nacional'))
        
        if 'sunat_status' not in existing_columns:
            op.add_column('third_parties', sa.Column('sunat_status', sa.String(length=50), nullable=True))
        
        # Actualizar tax_id_type: convertir valores antiguos a códigos del Catálogo 06 SUNAT
        # 1=DNI, 4=Carnet Extranjería, 6=RUC, 7=Pasaporte, 0=Doc. Identidad Extranjero
        op.execute("""
            UPDATE third_parties 
            SET tax_id_type = CASE 
                WHEN tax_id_type = 'RUC' THEN '6'
                WHEN tax_id_type = 'DNI' THEN '1'
                WHEN tax_id_type = 'CE' THEN '4'
                WHEN tax_id_type = 'PAS' THEN '7'
                ELSE tax_id_type
            END
            WHERE tax_id_type NOT IN ('1', '4', '6', '7', '0')
        """)
        
        # Establecer por defecto '6' si es NULL o vacío
        op.execute("""
            UPDATE third_parties 
            SET tax_id_type = '6'
            WHERE tax_id_type IS NULL OR tax_id_type = ''
        """)
        
        # Cambiar el valor por defecto de tax_id_type a '6'
        op.alter_column('third_parties', 'tax_id_type', server_default='6')


def downgrade() -> None:
    # Eliminar campos de companies
    op.drop_column('companies', 'legal_representative_position')
    op.drop_column('companies', 'legal_representative_dni')
    op.drop_column('companies', 'legal_representative_name')
    op.drop_column('companies', 'domicile_condition')
    op.drop_column('companies', 'sunat_status')
    op.drop_column('companies', 'economic_activity_code')
    op.drop_column('companies', 'tax_regime')
    op.drop_column('companies', 'email')
    op.drop_column('companies', 'phone')
    op.drop_column('companies', 'ubigeo')
    op.drop_column('companies', 'fiscal_address')
    op.drop_column('companies', 'taxpayer_type')
    op.drop_column('companies', 'commercial_name')
    
    # Eliminar campos de third_parties
    op.drop_column('third_parties', 'sunat_status')
    op.drop_column('third_parties', 'third_party_type')
    op.drop_column('third_parties', 'country_code')
    
    # Restaurar valor por defecto de tax_id_type (si era diferente)
    op.alter_column('third_parties', 'tax_id_type', server_default=None)

