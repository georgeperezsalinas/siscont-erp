"""optimize document tables - separate OCR and extracted data

Revision ID: 20250202_02
Revises: 20250202_01
Create Date: 2026-02-02 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20250202_02'
down_revision = '20250202_01'
branch_labels = None
depends_on = None


def upgrade():
    # Verificar si las tablas ya existen antes de crearlas (idempotente)
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()
    
    # Crear tabla document_extracted_data
    if 'document_extracted_data' not in existing_tables:
        op.create_table(
        'document_extracted_data',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('document_id', sa.Integer(), nullable=False),
        sa.Column('extracted_data', postgresql.JSONB(), nullable=True),
        sa.Column('extraction_method', sa.String(length=50), nullable=True),
        sa.Column('extraction_date', sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('extraction_success', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('extraction_errors', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('document_id', name='uq_document_extracted_data')
        )
        
        existing_indexes = {idx['name'] for idx in inspector.get_indexes('document_extracted_data')}
        if 'idx_document_extracted_data_document_id' not in existing_indexes:
            op.create_index('idx_document_extracted_data_document_id', 'document_extracted_data', ['document_id'], unique=True)
    
    # Crear tabla document_ocr_data
    if 'document_ocr_data' not in existing_tables:
        op.create_table(
            'document_ocr_data',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('document_id', sa.Integer(), nullable=False),
            sa.Column('ocr_text', sa.Text(), nullable=True),
            sa.Column('ocr_confidence', sa.Numeric(precision=5, scale=2), nullable=True),
            sa.Column('ocr_engine', sa.String(length=50), nullable=True),
            sa.Column('ocr_date', sa.DateTime(), nullable=True),
            sa.Column('ocr_status', sa.String(length=20), nullable=False, server_default='PENDING'),
            sa.Column('ocr_processing_time_ms', sa.Integer(), nullable=True),
            sa.PrimaryKeyConstraint('id'),
            sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='CASCADE'),
            sa.UniqueConstraint('document_id', name='uq_document_ocr_data')
        )
        
        existing_indexes = {idx['name'] for idx in inspector.get_indexes('document_ocr_data')}
        if 'idx_document_ocr_data_document_id' not in existing_indexes:
            op.create_index('idx_document_ocr_data_document_id', 'document_ocr_data', ['document_id'], unique=True)
        if 'idx_document_ocr_data_status' not in existing_indexes:
            op.create_index('idx_document_ocr_data_status', 'document_ocr_data', ['ocr_status'])
    
    # Verificar índices si las tablas ya existen
    if 'document_extracted_data' in existing_tables:
        existing_indexes = {idx['name'] for idx in inspector.get_indexes('document_extracted_data')}
        if 'idx_document_extracted_data_document_id' not in existing_indexes:
            op.create_index('idx_document_extracted_data_document_id', 'document_extracted_data', ['document_id'], unique=True)
    
    if 'document_ocr_data' in existing_tables:
        existing_indexes = {idx['name'] for idx in inspector.get_indexes('document_ocr_data')}
        if 'idx_document_ocr_data_document_id' not in existing_indexes:
            op.create_index('idx_document_ocr_data_document_id', 'document_ocr_data', ['document_id'], unique=True)
        if 'idx_document_ocr_data_status' not in existing_indexes:
            op.create_index('idx_document_ocr_data_status', 'document_ocr_data', ['ocr_status'])
    
    # Migrar datos existentes de documents a las nuevas tablas (solo si las tablas y columnas existen)
    # Verificar que las columnas existan en documents antes de migrar
    if 'documents' in existing_tables:
        existing_columns = {col['name'] for col in inspector.get_columns('documents')}
        
        # Solo migrar si las columnas existen en documents
        if 'extracted_data' in existing_columns and 'document_extracted_data' in existing_tables:
            try:
                op.execute("""
                    INSERT INTO document_extracted_data (document_id, extracted_data, extraction_method, extraction_date, extraction_success)
                    SELECT id, extracted_data, 'MIGRATED', uploaded_at, true
                    FROM documents
                    WHERE extracted_data IS NOT NULL
                    ON CONFLICT (document_id) DO NOTHING
                """)
            except Exception as e:
                # Si falla, continuar (puede que ya estén migrados)
                pass
        
        if 'ocr_text' in existing_columns and 'document_ocr_data' in existing_tables:
            try:
                op.execute("""
                    INSERT INTO document_ocr_data (document_id, ocr_text, ocr_confidence, ocr_status, ocr_date)
                    SELECT id, ocr_text, ocr_confidence, 'COMPLETED', uploaded_at
                    FROM documents
                    WHERE ocr_text IS NOT NULL
                    ON CONFLICT (document_id) DO NOTHING
                """)
            except Exception as e:
                # Si falla, continuar (puede que ya estén migrados)
                pass
    
    # Agregar campos de deduplicación a documents (solo si no existen)
    existing_columns = {col['name'] for col in inspector.get_columns('documents')}
    existing_indexes = {idx['name'] for idx in inspector.get_indexes('documents')}
    existing_foreign_keys = {fk['name'] for fk in inspector.get_foreign_keys('documents')}
    
    if 'duplicate_of' not in existing_columns:
        op.add_column('documents', sa.Column('duplicate_of', sa.Integer(), nullable=True))
    if 'is_duplicate' not in existing_columns:
        op.add_column('documents', sa.Column('is_duplicate', sa.Boolean(), nullable=False, server_default='false'))
    
    if 'fk_documents_duplicate_of' not in existing_foreign_keys:
        op.create_foreign_key('fk_documents_duplicate_of', 'documents', 'documents', ['duplicate_of'], ['id'], ondelete='SET NULL')
    if 'idx_documents_is_duplicate' not in existing_indexes:
        op.create_index('idx_documents_is_duplicate', 'documents', ['is_duplicate'])
    if 'idx_documents_duplicate_of' not in existing_indexes:
        op.create_index('idx_documents_duplicate_of', 'documents', ['duplicate_of'])
    
    # Agregar índice full-text en title para PostgreSQL
    if 'idx_documents_title_fts' not in existing_indexes and 'idx_documents_title' not in existing_indexes:
        try:
            op.execute("CREATE INDEX IF NOT EXISTS idx_documents_title_fts ON documents USING GIN (to_tsvector('spanish', title))")
        except:
            # Si no es PostgreSQL o falla, crear índice simple
            op.create_index('idx_documents_title', 'documents', ['title'])
    
    # Eliminar columnas de documents (después de migrar)
    # NO eliminamos aún para mantener compatibilidad, se pueden eliminar en migración futura
    # op.drop_column('documents', 'ocr_text')
    # op.drop_column('documents', 'ocr_confidence')
    # op.drop_column('documents', 'extracted_data')


def downgrade():
    # Eliminar índices
    try:
        op.execute("DROP INDEX IF EXISTS idx_documents_title_fts")
    except:
        pass
    
    op.drop_index('idx_documents_duplicate_of', table_name='documents')
    op.drop_index('idx_documents_is_duplicate', table_name='documents')
    op.drop_constraint('fk_documents_duplicate_of', 'documents', type_='foreignkey')
    op.drop_column('documents', 'is_duplicate')
    op.drop_column('documents', 'duplicate_of')
    
    # Migrar datos de vuelta (si es necesario)
    # ...
    
    op.drop_index('idx_document_ocr_data_status', table_name='document_ocr_data')
    op.drop_index('idx_document_ocr_data_document_id', table_name='document_ocr_data')
    op.drop_table('document_ocr_data')
    
    op.drop_index('idx_document_extracted_data_document_id', table_name='document_extracted_data')
    op.drop_table('document_extracted_data')

