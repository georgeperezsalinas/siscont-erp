#!/usr/bin/env python3
"""
Script para agregar campos SUNAT/PLE faltantes a las tablas companies y third_parties.
Ejecutar desde el directorio backend con: python add_sunat_fields.py
"""
import sys
import os

# Agregar el directorio raíz al path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text, inspect
from app.db import engine, Base
from app.domain.models import Company, ThirdParty

def column_exists(table_name: str, column_name: str) -> bool:
    """Verifica si una columna existe en una tabla"""
    inspector = inspect(engine)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns

def add_column_if_not_exists(table_name: str, column_name: str, column_type: str, default=None):
    """Agrega una columna si no existe"""
    if column_exists(table_name, column_name):
        print(f"  ✓ Columna {table_name}.{column_name} ya existe")
        return False
    
    with engine.connect() as conn:
        query = f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"
        if default is not None:
            query += f" DEFAULT {default}"
        conn.execute(text(query))
        conn.commit()
        print(f"  ✓ Columna {table_name}.{column_name} agregada")
        return True

def update_tax_id_type_values():
    """Convierte valores antiguos de tax_id_type a códigos del Catálogo 06 SUNAT"""
    with engine.connect() as conn:
        # Verificar si hay valores antiguos
        result = conn.execute(text("""
            SELECT COUNT(*) as count 
            FROM third_parties 
            WHERE tax_id_type NOT IN ('1', '4', '6', '7', '0') 
            OR tax_id_type IS NULL 
            OR tax_id_type = ''
        """))
        count = result.scalar()
        
        if count > 0:
            print(f"  → Actualizando {count} registros con valores antiguos de tax_id_type...")
            
            # Actualizar valores antiguos
            conn.execute(text("""
                UPDATE third_parties 
                SET tax_id_type = CASE 
                    WHEN tax_id_type = 'RUC' THEN '6'
                    WHEN tax_id_type = 'DNI' THEN '1'
                    WHEN tax_id_type = 'CE' THEN '4'
                    WHEN tax_id_type = 'PAS' THEN '7'
                    ELSE tax_id_type
                END
                WHERE tax_id_type NOT IN ('1', '4', '6', '7', '0')
            """))
            
            # Establecer por defecto '6' si es NULL o vacío
            conn.execute(text("""
                UPDATE third_parties 
                SET tax_id_type = '6'
                WHERE tax_id_type IS NULL OR tax_id_type = ''
            """))
            
            conn.commit()
            print(f"  ✓ Valores de tax_id_type actualizados")
        else:
            print(f"  ✓ No hay valores antiguos de tax_id_type para actualizar")

def main():
    print("=" * 60)
    print("Agregando campos SUNAT/PLE a las tablas")
    print("=" * 60)
    
    # Verificar que las tablas existen
    inspector = inspect(engine)
    if 'companies' not in inspector.get_table_names():
        print("❌ Error: La tabla 'companies' no existe")
        return
    if 'third_parties' not in inspector.get_table_names():
        print("❌ Error: La tabla 'third_parties' no existe")
        return
    
    print("\n📋 Tabla: companies")
    print("-" * 60)
    
    # Campos para companies
    company_fields = [
        ('commercial_name', 'VARCHAR(200)', None),
        ('taxpayer_type', 'VARCHAR(50)', None),
        ('fiscal_address', 'VARCHAR(500)', None),
        ('ubigeo', 'VARCHAR(6)', None),
        ('phone', 'VARCHAR(20)', None),
        ('email', 'VARCHAR(255)', None),
        ('tax_regime', 'VARCHAR(100)', None),
        ('economic_activity_code', 'VARCHAR(10)', None),
        ('sunat_status', 'VARCHAR(50)', None),
        ('domicile_condition', 'VARCHAR(50)', None),
        ('legal_representative_name', 'VARCHAR(200)', None),
        ('legal_representative_dni', 'VARCHAR(20)', None),
        ('legal_representative_position', 'VARCHAR(100)', None),
        ('created_at', 'TIMESTAMP', 'CURRENT_TIMESTAMP'),
        ('updated_at', 'TIMESTAMP', 'CURRENT_TIMESTAMP'),
    ]
    
    added_count = 0
    for field_name, field_type, default in company_fields:
        if add_column_if_not_exists('companies', field_name, field_type, default):
            added_count += 1
    
    print(f"\n  Total: {added_count} campos nuevos agregados")
    
    print("\n📋 Tabla: third_parties")
    print("-" * 60)
    
    # Campos para third_parties
    third_party_fields = [
        ('country_code', 'VARCHAR(3)', "'PE'"),
        ('third_party_type', 'VARCHAR(20)', "'Nacional'"),
        ('sunat_status', 'VARCHAR(50)', None),
    ]
    
    added_count = 0
    for field_name, field_type, default in third_party_fields:
        if add_column_if_not_exists('third_parties', field_name, field_type, default):
            added_count += 1
    
    print(f"\n  Total: {added_count} campos nuevos agregados")
    
    # Actualizar valores de tax_id_type si es necesario
    print("\n🔄 Actualizando valores de tax_id_type...")
    print("-" * 60)
    update_tax_id_type_values()
    
    # Actualizar valor por defecto de tax_id_type
    try:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE third_parties ALTER COLUMN tax_id_type SET DEFAULT '6'"))
            conn.commit()
            print("  ✓ Valor por defecto de tax_id_type actualizado a '6'")
    except Exception as e:
        print(f"  ⚠ No se pudo actualizar el valor por defecto (puede que ya esté configurado): {e}")
    
    print("\n🔄 Creando trigger para updated_at...")
    print("-" * 60)
    try:
        with engine.connect() as conn:
            # Crear función para actualizar updated_at
            conn.execute(text("""
                CREATE OR REPLACE FUNCTION update_updated_at_column() 
                RETURNS TRIGGER AS $$ 
                BEGIN 
                    NEW.updated_at = CURRENT_TIMESTAMP; 
                    RETURN NEW; 
                END; 
                $$ language 'plpgsql';
            """))
            
            # Crear trigger para companies
            conn.execute(text("DROP TRIGGER IF EXISTS update_companies_updated_at ON companies;"))
            conn.execute(text("""
                CREATE TRIGGER update_companies_updated_at 
                BEFORE UPDATE ON companies 
                FOR EACH ROW 
                EXECUTE FUNCTION update_updated_at_column();
            """))
            
            conn.commit()
            print("  ✓ Trigger para updated_at creado en companies")
    except Exception as e:
        print(f"  ⚠ No se pudo crear el trigger (puede que ya exista): {e}")
    
    print("\n" + "=" * 60)
    print("✅ Migración completada exitosamente")
    print("=" * 60)

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f"\n❌ Error durante la migración: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

