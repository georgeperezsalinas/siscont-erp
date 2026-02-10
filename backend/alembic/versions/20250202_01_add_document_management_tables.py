"""add document management tables

Revision ID: 20250202_01
Revises: 20250116_01_add_sunat_fields
Create Date: 2026-02-02 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20250202_01'
down_revision = '20250116_01_add_sunat_fields'
branch_labels = None
depends_on = None


def upgrade():
    # Verificar si las tablas ya existen antes de crearlas (idempotente)
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()
    
    # Crear tabla documents
    if 'documents' not in existing_tables:
        op.create_table(
        'documents',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('company_id', sa.Integer(), nullable=False),
        
        # Información del archivo
        sa.Column('original_filename', sa.String(length=500), nullable=False),
        sa.Column('stored_filename', sa.String(length=255), nullable=False),
        sa.Column('file_path', sa.Text(), nullable=False),
        sa.Column('file_size', sa.BigInteger(), nullable=False),
        sa.Column('mime_type', sa.String(length=100), nullable=False),
        sa.Column('file_hash', sa.String(length=64), nullable=False),
        
        # Metadatos del documento
        sa.Column('document_type', sa.String(length=50), nullable=False),
        sa.Column('document_category', sa.String(length=100), nullable=True),
        sa.Column('title', sa.String(length=500), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        
        # Relaciones con entidades del sistema
        sa.Column('related_entity_type', sa.String(length=50), nullable=True),
        sa.Column('related_entity_id', sa.Integer(), nullable=True),
        
        # Metadatos adicionales (JSON)
        sa.Column('metadata', postgresql.JSONB(), nullable=True),
        
        # Control de versiones
        sa.Column('version', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('parent_document_id', sa.Integer(), nullable=True),
        
        # Estado y validación
        sa.Column('status', sa.String(length=20), nullable=False, server_default='ACTIVE'),
        sa.Column('is_verified', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('verification_date', sa.DateTime(), nullable=True),
        sa.Column('verified_by', sa.Integer(), nullable=True),
        
        # OCR y extracción
        sa.Column('ocr_text', sa.Text(), nullable=True),
        sa.Column('ocr_confidence', sa.Numeric(precision=5, scale=2), nullable=True),
        sa.Column('extracted_data', postgresql.JSONB(), nullable=True),
        
        # Auditoría
        sa.Column('uploaded_by', sa.Integer(), nullable=False),
        sa.Column('uploaded_at', sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['parent_document_id'], ['documents.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['uploaded_by'], ['users.id']),
        sa.ForeignKeyConstraint(['verified_by'], ['users.id']),
        )
        
        # Índices para documents
        existing_indexes = {idx['name'] for idx in inspector.get_indexes('documents')}
        
        if 'idx_documents_company_id' not in existing_indexes:
            op.create_index('idx_documents_company_id', 'documents', ['company_id'])
        if 'idx_documents_related_entity' not in existing_indexes:
            op.create_index('idx_documents_related_entity', 'documents', ['related_entity_type', 'related_entity_id'])
        if 'idx_documents_document_type' not in existing_indexes:
            op.create_index('idx_documents_document_type', 'documents', ['document_type'])
        if 'idx_documents_status' not in existing_indexes:
            op.create_index('idx_documents_status', 'documents', ['status'])
        if 'idx_documents_uploaded_at' not in existing_indexes:
            op.create_index('idx_documents_uploaded_at', 'documents', ['uploaded_at'])
        if 'idx_documents_file_hash' not in existing_indexes:
            op.create_index('idx_documents_file_hash', 'documents', ['file_hash'])
        if 'idx_documents_stored_filename' not in existing_indexes:
            op.create_index('idx_documents_stored_filename', 'documents', ['stored_filename'], unique=True)
        
        # Índice GIN para búsqueda en JSONB (PostgreSQL)
        # Solo si las columnas existen (pueden no existir si ya se ejecutó la migración optimizada)
        existing_columns = {col['name'] for col in inspector.get_columns('documents')}
        
        if 'metadata' in existing_columns:
            try:
                if 'idx_documents_metadata' not in existing_indexes:
                    op.execute("CREATE INDEX IF NOT EXISTS idx_documents_metadata ON documents USING GIN (metadata)")
            except:
                if 'idx_documents_metadata' not in existing_indexes:
                    op.create_index('idx_documents_metadata', 'documents', ['metadata'])
        
        if 'extracted_data' in existing_columns:
            try:
                if 'idx_documents_extracted_data' not in existing_indexes:
                    op.execute("CREATE INDEX IF NOT EXISTS idx_documents_extracted_data ON documents USING GIN (extracted_data)")
            except:
                if 'idx_documents_extracted_data' not in existing_indexes:
                    op.create_index('idx_documents_extracted_data', 'documents', ['extracted_data'])
        
        # Índice full-text para OCR (PostgreSQL)
        if 'ocr_text' in existing_columns:
            try:
                if 'idx_documents_ocr_text' not in existing_indexes:
                    op.execute("CREATE INDEX IF NOT EXISTS idx_documents_ocr_text ON documents USING GIN (to_tsvector('spanish', ocr_text))")
            except:
                if 'idx_documents_ocr_text' not in existing_indexes:
                    op.create_index('idx_documents_ocr_text', 'documents', ['ocr_text'])
    
    # Verificar índices de documents si la tabla ya existe
    if 'documents' in existing_tables:
        existing_indexes = {idx['name'] for idx in inspector.get_indexes('documents')}
        
        if 'idx_documents_company_id' not in existing_indexes:
            op.create_index('idx_documents_company_id', 'documents', ['company_id'])
        if 'idx_documents_related_entity' not in existing_indexes:
            op.create_index('idx_documents_related_entity', 'documents', ['related_entity_type', 'related_entity_id'])
        if 'idx_documents_document_type' not in existing_indexes:
            op.create_index('idx_documents_document_type', 'documents', ['document_type'])
        if 'idx_documents_status' not in existing_indexes:
            op.create_index('idx_documents_status', 'documents', ['status'])
        if 'idx_documents_uploaded_at' not in existing_indexes:
            op.create_index('idx_documents_uploaded_at', 'documents', ['uploaded_at'])
        if 'idx_documents_file_hash' not in existing_indexes:
            op.create_index('idx_documents_file_hash', 'documents', ['file_hash'])
        if 'idx_documents_stored_filename' not in existing_indexes:
            op.create_index('idx_documents_stored_filename', 'documents', ['stored_filename'], unique=True)
        
        # Índice GIN para búsqueda en JSONB (PostgreSQL)
        # Solo si las columnas existen (pueden no existir si ya se ejecutó la migración optimizada)
        existing_columns = {col['name'] for col in inspector.get_columns('documents')}
        
        if 'metadata' in existing_columns:
            try:
                if 'idx_documents_metadata' not in existing_indexes:
                    op.execute("CREATE INDEX IF NOT EXISTS idx_documents_metadata ON documents USING GIN (metadata)")
            except:
                if 'idx_documents_metadata' not in existing_indexes:
                    op.create_index('idx_documents_metadata', 'documents', ['metadata'])
        
        if 'extracted_data' in existing_columns:
            try:
                if 'idx_documents_extracted_data' not in existing_indexes:
                    op.execute("CREATE INDEX IF NOT EXISTS idx_documents_extracted_data ON documents USING GIN (extracted_data)")
            except:
                if 'idx_documents_extracted_data' not in existing_indexes:
                    op.create_index('idx_documents_extracted_data', 'documents', ['extracted_data'])
        
        # Índice full-text para OCR (PostgreSQL)
        if 'ocr_text' in existing_columns:
            try:
                if 'idx_documents_ocr_text' not in existing_indexes:
                    op.execute("CREATE INDEX IF NOT EXISTS idx_documents_ocr_text ON documents USING GIN (to_tsvector('spanish', ocr_text))")
            except:
                if 'idx_documents_ocr_text' not in existing_indexes:
                    op.create_index('idx_documents_ocr_text', 'documents', ['ocr_text'])
    
    # Crear tabla document_tags
    if 'document_tags' not in existing_tables:
        op.create_table(
        'document_tags',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('document_id', sa.Integer(), nullable=False),
        sa.Column('tag', sa.String(length=100), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('document_id', 'tag', name='uq_document_tag'),
        )
        
        existing_indexes = {idx['name'] for idx in inspector.get_indexes('document_tags')}
        if 'idx_document_tags_document_id' not in existing_indexes:
            op.create_index('idx_document_tags_document_id', 'document_tags', ['document_id'])
        if 'idx_document_tags_tag' not in existing_indexes:
            op.create_index('idx_document_tags_tag', 'document_tags', ['tag'])
    
    # Verificar índices de document_tags si la tabla ya existe
    if 'document_tags' in existing_tables:
        existing_indexes = {idx['name'] for idx in inspector.get_indexes('document_tags')}
        if 'idx_document_tags_document_id' not in existing_indexes:
            op.create_index('idx_document_tags_document_id', 'document_tags', ['document_id'])
        if 'idx_document_tags_tag' not in existing_indexes:
            op.create_index('idx_document_tags_tag', 'document_tags', ['tag'])
    
    # Crear tabla document_access_log
    if 'document_access_log' not in existing_tables:
        op.create_table(
        'document_access_log',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('document_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('action', sa.String(length=50), nullable=False),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.Column('accessed_at', sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        )
        
        existing_indexes = {idx['name'] for idx in inspector.get_indexes('document_access_log')}
        if 'idx_document_access_log_document_id' not in existing_indexes:
            op.create_index('idx_document_access_log_document_id', 'document_access_log', ['document_id'])
        if 'idx_document_access_log_user_id' not in existing_indexes:
            op.create_index('idx_document_access_log_user_id', 'document_access_log', ['user_id'])
        if 'idx_document_access_log_accessed_at' not in existing_indexes:
            op.create_index('idx_document_access_log_accessed_at', 'document_access_log', ['accessed_at'])
    
    # Verificar índices de document_access_log si la tabla ya existe
    if 'document_access_log' in existing_tables:
        existing_indexes = {idx['name'] for idx in inspector.get_indexes('document_access_log')}
        if 'idx_document_access_log_document_id' not in existing_indexes:
            op.create_index('idx_document_access_log_document_id', 'document_access_log', ['document_id'])
        if 'idx_document_access_log_user_id' not in existing_indexes:
            op.create_index('idx_document_access_log_user_id', 'document_access_log', ['user_id'])
        if 'idx_document_access_log_accessed_at' not in existing_indexes:
            op.create_index('idx_document_access_log_accessed_at', 'document_access_log', ['accessed_at'])
    
    # Crear tabla document_versions
    if 'document_versions' not in existing_tables:
        op.create_table(
        'document_versions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('document_id', sa.Integer(), nullable=False),
        sa.Column('version_number', sa.Integer(), nullable=False),
        sa.Column('file_path', sa.Text(), nullable=False),
        sa.Column('file_size', sa.BigInteger(), nullable=False),
        sa.Column('file_hash', sa.String(length=64), nullable=False),
        sa.Column('change_description', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.UniqueConstraint('document_id', 'version_number', name='uq_document_version'),
        )
        
        existing_indexes = {idx['name'] for idx in inspector.get_indexes('document_versions')}
        if 'idx_document_versions_document_id' not in existing_indexes:
            op.create_index('idx_document_versions_document_id', 'document_versions', ['document_id'])
    
    # Verificar índices de document_versions si la tabla ya existe
    if 'document_versions' in existing_tables:
        existing_indexes = {idx['name'] for idx in inspector.get_indexes('document_versions')}
        if 'idx_document_versions_document_id' not in existing_indexes:
            op.create_index('idx_document_versions_document_id', 'document_versions', ['document_id'])


def downgrade():
    op.drop_index('idx_document_versions_document_id', table_name='document_versions')
    op.drop_table('document_versions')
    
    op.drop_index('idx_document_access_log_accessed_at', table_name='document_access_log')
    op.drop_index('idx_document_access_log_user_id', table_name='document_access_log')
    op.drop_index('idx_document_access_log_document_id', table_name='document_access_log')
    op.drop_table('document_access_log')
    
    op.drop_index('idx_document_tags_tag', table_name='document_tags')
    op.drop_index('idx_document_tags_document_id', table_name='document_tags')
    op.drop_table('document_tags')
    
    # Eliminar índices de documents
    try:
        op.execute("DROP INDEX IF EXISTS idx_documents_ocr_text")
        op.execute("DROP INDEX IF EXISTS idx_documents_extracted_data")
        op.execute("DROP INDEX IF EXISTS idx_documents_metadata")
    except:
        pass
    
    op.drop_index('idx_documents_stored_filename', table_name='documents')
    op.drop_index('idx_documents_file_hash', table_name='documents')
    op.drop_index('idx_documents_uploaded_at', table_name='documents')
    op.drop_index('idx_documents_status', table_name='documents')
    op.drop_index('idx_documents_document_type', table_name='documents')
    op.drop_index('idx_documents_related_entity', table_name='documents')
    op.drop_index('idx_documents_company_id', table_name='documents')
    op.drop_table('documents')

