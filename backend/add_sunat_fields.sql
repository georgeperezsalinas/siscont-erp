-- Script SQL para agregar campos SUNAT/PLE faltantes a las tablas companies y third_parties
-- Ejecutar este script en la base de datos PostgreSQL

-- ============================================
-- TABLA: companies
-- ============================================
-- Agregar campos SUNAT/PLE si no existen

-- Nombre Comercial
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='companies' AND column_name='commercial_name') THEN
        ALTER TABLE companies ADD COLUMN commercial_name VARCHAR(200);
    END IF;
END $$;

-- Tipo de Contribuyente
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='companies' AND column_name='taxpayer_type') THEN
        ALTER TABLE companies ADD COLUMN taxpayer_type VARCHAR(50);
    END IF;
END $$;

-- Domicilio Fiscal
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='companies' AND column_name='fiscal_address') THEN
        ALTER TABLE companies ADD COLUMN fiscal_address VARCHAR(500);
    END IF;
END $$;

-- Ubigeo SUNAT
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='companies' AND column_name='ubigeo') THEN
        ALTER TABLE companies ADD COLUMN ubigeo VARCHAR(6);
    END IF;
END $$;

-- Teléfono
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='companies' AND column_name='phone') THEN
        ALTER TABLE companies ADD COLUMN phone VARCHAR(20);
    END IF;
END $$;

-- Correo electrónico
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='companies' AND column_name='email') THEN
        ALTER TABLE companies ADD COLUMN email VARCHAR(255);
    END IF;
END $$;

-- Régimen Tributario
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='companies' AND column_name='tax_regime') THEN
        ALTER TABLE companies ADD COLUMN tax_regime VARCHAR(100);
    END IF;
END $$;

-- Actividad Económica (CIIU)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='companies' AND column_name='economic_activity_code') THEN
        ALTER TABLE companies ADD COLUMN economic_activity_code VARCHAR(10);
    END IF;
END $$;

-- Estado SUNAT
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='companies' AND column_name='sunat_status') THEN
        ALTER TABLE companies ADD COLUMN sunat_status VARCHAR(50);
    END IF;
END $$;

-- Condición Domicilio SUNAT
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='companies' AND column_name='domicile_condition') THEN
        ALTER TABLE companies ADD COLUMN domicile_condition VARCHAR(50);
    END IF;
END $$;

-- Representante Legal - Nombres
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='companies' AND column_name='legal_representative_name') THEN
        ALTER TABLE companies ADD COLUMN legal_representative_name VARCHAR(200);
    END IF;
END $$;

-- Representante Legal - DNI
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='companies' AND column_name='legal_representative_dni') THEN
        ALTER TABLE companies ADD COLUMN legal_representative_dni VARCHAR(20);
    END IF;
END $$;

-- Representante Legal - Cargo
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='companies' AND column_name='legal_representative_position') THEN
        ALTER TABLE companies ADD COLUMN legal_representative_position VARCHAR(100);
    END IF;
END $$;

-- Timestamps (created_at y updated_at)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='companies' AND column_name='created_at') THEN
        ALTER TABLE companies ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='companies' AND column_name='updated_at') THEN
        ALTER TABLE companies ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

-- Crear función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column() 
RETURNS TRIGGER AS $$ 
BEGIN 
    NEW.updated_at = CURRENT_TIMESTAMP; 
    RETURN NEW; 
END; 
$$ language 'plpgsql';

-- Crear trigger para actualizar updated_at en companies
DROP TRIGGER IF EXISTS update_companies_updated_at ON companies;
CREATE TRIGGER update_companies_updated_at 
    BEFORE UPDATE ON companies 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- TABLA: third_parties
-- ============================================
-- Actualizar tax_id_type para usar códigos del Catálogo 06 SUNAT si tiene valores antiguos
-- Nota: Si ya tiene valores como 'RUC', 'DNI', etc., necesitarás convertirlos manualmente

-- País de Residencia (Catálogo 18 SUNAT)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='third_parties' AND column_name='country_code') THEN
        ALTER TABLE third_parties ADD COLUMN country_code VARCHAR(3) DEFAULT 'PE';
    END IF;
END $$;

-- Tipo de Tercero (Nacional, Extranjero, No domiciliado)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='third_parties' AND column_name='third_party_type') THEN
        ALTER TABLE third_parties ADD COLUMN third_party_type VARCHAR(20) DEFAULT 'Nacional';
    END IF;
END $$;

-- Estado SUNAT (solo para proveedores)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='third_parties' AND column_name='sunat_status') THEN
        ALTER TABLE third_parties ADD COLUMN sunat_status VARCHAR(50);
    END IF;
END $$;

-- Actualizar tax_id_type si tiene valores antiguos ('RUC', 'DNI', etc.)
-- Convertir a códigos del Catálogo 06 SUNAT: 1=DNI, 4=CE, 6=RUC, 7=PAS, 0=Extranjero
DO $$ 
BEGIN
    -- Actualizar solo si hay valores antiguos que no son numéricos
    UPDATE third_parties 
    SET tax_id_type = CASE 
        WHEN tax_id_type = 'RUC' THEN '6'
        WHEN tax_id_type = 'DNI' THEN '1'
        WHEN tax_id_type = 'CE' THEN '4'
        WHEN tax_id_type = 'PAS' THEN '7'
        ELSE tax_id_type  -- Mantener si ya es código numérico
    END
    WHERE tax_id_type NOT IN ('1', '4', '6', '7', '0');
    
    -- Si tax_id_type es NULL o vacío, establecer por defecto '6' (RUC)
    UPDATE third_parties 
    SET tax_id_type = '6'
    WHERE tax_id_type IS NULL OR tax_id_type = '';
END $$;

-- Actualizar el valor por defecto de tax_id_type a '6' (RUC)
ALTER TABLE third_parties ALTER COLUMN tax_id_type SET DEFAULT '6';

-- Comentarios para documentación
COMMENT ON COLUMN companies.commercial_name IS 'Nombre Comercial';
COMMENT ON COLUMN companies.taxpayer_type IS 'Tipo de Contribuyente: Natural con negocio, Jurídica, EIRL';
COMMENT ON COLUMN companies.fiscal_address IS 'Domicilio Fiscal';
COMMENT ON COLUMN companies.ubigeo IS 'Ubigeo SUNAT (6 dígitos)';
COMMENT ON COLUMN companies.tax_regime IS 'Régimen Tributario: RMT, MYPE, Régimen General, etc.';
COMMENT ON COLUMN companies.economic_activity_code IS 'Actividad Económica (CIIU) - código SUNAT/INEI';
COMMENT ON COLUMN companies.sunat_status IS 'Estado SUNAT: Activo, Baja definitiva';
COMMENT ON COLUMN companies.domicile_condition IS 'Condición Domicilio SUNAT: Habido, No habido';

COMMENT ON COLUMN third_parties.tax_id_type IS 'Catálogo 06 SUNAT: 1=DNI, 4=Carnet Extranjería, 6=RUC, 7=Pasaporte, 0=Doc. Identidad Extranjero';
COMMENT ON COLUMN third_parties.country_code IS 'País de residencia según Catálogo 18 SUNAT (PE=Perú)';
COMMENT ON COLUMN third_parties.third_party_type IS 'Tipo: Nacional, Extranjero, No domiciliado';
COMMENT ON COLUMN third_parties.sunat_status IS 'Estado SUNAT: Habido, No habido (solo para proveedores)';

