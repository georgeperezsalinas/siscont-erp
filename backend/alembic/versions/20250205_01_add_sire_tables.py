"""add SIRE tables

Revision ID: 20250205_01
Revises: 20250204_01
Create Date: 2025-02-05

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20250205_01'
down_revision = '20250204_01'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Verificar si las tablas ya existen (para idempotencia)
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()
    
    # Crear enum types para PostgreSQL si no existen
    # Usamos DO $$ BEGIN ... EXCEPTION para manejar tipos que ya existen
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE sireproposalstatus AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'COMPLEMENTED', 'REPLACED', 'SYNCED');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)
    
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE sireproposaltype AS ENUM ('RVIE', 'RCE');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)
    
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE siresyncstatus AS ENUM ('SUCCESS', 'ERROR', 'PARTIAL');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)
    
    # Tabla sire_rvie_proposals
    if 'sire_rvie_proposals' not in existing_tables:
        # Crear tabla usando SQL directo para evitar problemas con enum
        op.execute("""
            CREATE TABLE sire_rvie_proposals (
                id SERIAL PRIMARY KEY,
                company_id INTEGER NOT NULL,
                sunat_proposal_id VARCHAR(100) NOT NULL UNIQUE,
                sunat_correlative VARCHAR(20),
                proposal_date DATE NOT NULL,
                sunat_created_at TIMESTAMP,
                proposal_data JSONB NOT NULL,
                status sireproposalstatus NOT NULL DEFAULT 'PENDING',
                response_data JSONB,
                response_date TIMESTAMP,
                sale_id INTEGER,
                notes TEXT,
                rejection_reason TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_by INTEGER,
                responded_by INTEGER,
                CONSTRAINT fk_sire_rvie_company FOREIGN KEY (company_id) REFERENCES companies(id),
                CONSTRAINT fk_sire_rvie_sale FOREIGN KEY (sale_id) REFERENCES sales(id),
                CONSTRAINT fk_sire_rvie_created_by FOREIGN KEY (created_by) REFERENCES users(id),
                CONSTRAINT fk_sire_rvie_responded_by FOREIGN KEY (responded_by) REFERENCES users(id)
            )
        """)
        
        # Índices para sire_rvie_proposals
        op.create_index('ix_sire_rvie_proposals_company_id', 'sire_rvie_proposals', ['company_id'])
        op.create_index('ix_sire_rvie_proposals_sunat_proposal_id', 'sire_rvie_proposals', ['sunat_proposal_id'])
        op.create_index('ix_sire_rvie_proposals_proposal_date', 'sire_rvie_proposals', ['proposal_date'])
        op.create_index('ix_sire_rvie_proposals_status', 'sire_rvie_proposals', ['status'])
        op.create_index('ix_sire_rvie_proposals_sale_id', 'sire_rvie_proposals', ['sale_id'])
        op.create_index('idx_sire_rvie_company_status', 'sire_rvie_proposals', ['company_id', 'status'])
        op.create_index('idx_sire_rvie_company_date', 'sire_rvie_proposals', ['company_id', 'proposal_date'])
    
    # Tabla sire_rce_proposals
    if 'sire_rce_proposals' not in existing_tables:
        op.execute("""
            CREATE TABLE sire_rce_proposals (
                id SERIAL PRIMARY KEY,
                company_id INTEGER NOT NULL,
                sunat_proposal_id VARCHAR(100) NOT NULL UNIQUE,
                sunat_correlative VARCHAR(20),
                proposal_date DATE NOT NULL,
                sunat_created_at TIMESTAMP,
                proposal_data JSONB NOT NULL,
                status sireproposalstatus NOT NULL DEFAULT 'PENDING',
                response_data JSONB,
                response_date TIMESTAMP,
                purchase_id INTEGER,
                notes TEXT,
                rejection_reason TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_by INTEGER,
                responded_by INTEGER,
                CONSTRAINT fk_sire_rce_company FOREIGN KEY (company_id) REFERENCES companies(id),
                CONSTRAINT fk_sire_rce_purchase FOREIGN KEY (purchase_id) REFERENCES purchases(id),
                CONSTRAINT fk_sire_rce_created_by FOREIGN KEY (created_by) REFERENCES users(id),
                CONSTRAINT fk_sire_rce_responded_by FOREIGN KEY (responded_by) REFERENCES users(id)
            )
        """)
        
        # Índices para sire_rce_proposals
        op.create_index('ix_sire_rce_proposals_company_id', 'sire_rce_proposals', ['company_id'])
        op.create_index('ix_sire_rce_proposals_sunat_proposal_id', 'sire_rce_proposals', ['sunat_proposal_id'])
        op.create_index('ix_sire_rce_proposals_proposal_date', 'sire_rce_proposals', ['proposal_date'])
        op.create_index('ix_sire_rce_proposals_status', 'sire_rce_proposals', ['status'])
        op.create_index('ix_sire_rce_proposals_purchase_id', 'sire_rce_proposals', ['purchase_id'])
        op.create_index('idx_sire_rce_company_status', 'sire_rce_proposals', ['company_id', 'status'])
        op.create_index('idx_sire_rce_company_date', 'sire_rce_proposals', ['company_id', 'proposal_date'])
    
    # Tabla sire_sync_log
    if 'sire_sync_log' not in existing_tables:
        op.execute("""
            CREATE TABLE sire_sync_log (
                id SERIAL PRIMARY KEY,
                company_id INTEGER NOT NULL,
                sync_type sireproposaltype NOT NULL,
                sync_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                records_processed INTEGER NOT NULL DEFAULT 0,
                records_success INTEGER NOT NULL DEFAULT 0,
                records_failed INTEGER NOT NULL DEFAULT 0,
                status siresyncstatus NOT NULL,
                error_message TEXT,
                error_details JSONB,
                sunat_response JSONB,
                created_by INTEGER,
                CONSTRAINT fk_sire_sync_company FOREIGN KEY (company_id) REFERENCES companies(id),
                CONSTRAINT fk_sire_sync_created_by FOREIGN KEY (created_by) REFERENCES users(id)
            )
        """)
        
        # Índices para sire_sync_log
        op.create_index('ix_sire_sync_log_company_id', 'sire_sync_log', ['company_id'])
        op.create_index('ix_sire_sync_log_sync_type', 'sire_sync_log', ['sync_type'])
        op.create_index('ix_sire_sync_log_sync_date', 'sire_sync_log', ['sync_date'])
        op.create_index('ix_sire_sync_log_status', 'sire_sync_log', ['status'])
        op.create_index('idx_sire_sync_company_type_date', 'sire_sync_log', ['company_id', 'sync_type', 'sync_date'])
    
    # Tabla sire_configurations
    if 'sire_configurations' not in existing_tables:
        op.create_table(
            'sire_configurations',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('company_id', sa.Integer(), nullable=False),
            sa.Column('oauth_client_id', sa.String(length=255), nullable=True),
            sa.Column('oauth_client_secret', sa.String(length=255), nullable=True),
            sa.Column('oauth_token', sa.Text(), nullable=True),
            sa.Column('oauth_refresh_token', sa.Text(), nullable=True),
            sa.Column('oauth_token_expires_at', sa.DateTime(), nullable=True),
            sa.Column('auto_sync_enabled', sa.Boolean(), nullable=False, server_default='false'),
            sa.Column('sync_frequency_hours', sa.Integer(), nullable=False, server_default='24'),
            sa.Column('last_sync_date', sa.DateTime(), nullable=True),
            sa.Column('email_notifications', sa.Boolean(), nullable=False, server_default='true'),
            sa.Column('notification_emails', sa.Text(), nullable=True),
            sa.Column('settings', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.Column('created_by', sa.Integer(), nullable=True),
            sa.PrimaryKeyConstraint('id'),
            sa.ForeignKeyConstraint(['company_id'], ['companies.id'], name='fk_sire_config_company'),
            sa.ForeignKeyConstraint(['created_by'], ['users.id'], name='fk_sire_config_created_by'),
            sa.UniqueConstraint('company_id', name='uq_sire_config_company')
        )
        
        # Índices para sire_configurations
        op.create_index('ix_sire_configurations_company_id', 'sire_configurations', ['company_id'])


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()
    
    # Eliminar tablas en orden inverso
    if 'sire_configurations' in existing_tables:
        op.drop_index('ix_sire_configurations_company_id', table_name='sire_configurations')
        op.drop_table('sire_configurations')
    
    if 'sire_sync_log' in existing_tables:
        op.drop_index('idx_sire_sync_company_type_date', table_name='sire_sync_log')
        op.drop_index('ix_sire_sync_log_status', table_name='sire_sync_log')
        op.drop_index('ix_sire_sync_log_sync_date', table_name='sire_sync_log')
        op.drop_index('ix_sire_sync_log_sync_type', table_name='sire_sync_log')
        op.drop_index('ix_sire_sync_log_company_id', table_name='sire_sync_log')
        op.drop_table('sire_sync_log')
    
    if 'sire_rce_proposals' in existing_tables:
        op.drop_index('idx_sire_rce_company_date', table_name='sire_rce_proposals')
        op.drop_index('idx_sire_rce_company_status', table_name='sire_rce_proposals')
        op.drop_index('ix_sire_rce_proposals_purchase_id', table_name='sire_rce_proposals')
        op.drop_index('ix_sire_rce_proposals_status', table_name='sire_rce_proposals')
        op.drop_index('ix_sire_rce_proposals_proposal_date', table_name='sire_rce_proposals')
        op.drop_index('ix_sire_rce_proposals_sunat_proposal_id', table_name='sire_rce_proposals')
        op.drop_index('ix_sire_rce_proposals_company_id', table_name='sire_rce_proposals')
        op.drop_table('sire_rce_proposals')
    
    if 'sire_rvie_proposals' in existing_tables:
        op.drop_index('idx_sire_rvie_company_date', table_name='sire_rvie_proposals')
        op.drop_index('idx_sire_rvie_company_status', table_name='sire_rvie_proposals')
        op.drop_index('ix_sire_rvie_proposals_sale_id', table_name='sire_rvie_proposals')
        op.drop_index('ix_sire_rvie_proposals_status', table_name='sire_rvie_proposals')
        op.drop_index('ix_sire_rvie_proposals_proposal_date', table_name='sire_rvie_proposals')
        op.drop_index('ix_sire_rvie_proposals_sunat_proposal_id', table_name='sire_rvie_proposals')
        op.drop_index('ix_sire_rvie_proposals_company_id', table_name='sire_rvie_proposals')
        op.drop_table('sire_rvie_proposals')
    
    # Eliminar enum types (solo si no hay otras tablas usándolos)
    op.execute("DROP TYPE IF EXISTS siresyncstatus CASCADE")
    op.execute("DROP TYPE IF EXISTS sireproposaltype CASCADE")
    op.execute("DROP TYPE IF EXISTS sireproposalstatus CASCADE")

