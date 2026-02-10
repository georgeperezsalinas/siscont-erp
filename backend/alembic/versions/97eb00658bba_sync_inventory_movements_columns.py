"""sync_inventory_movements_columns

Revision ID: 97eb00658bba
Revises: 51c6f2f60d38
Create Date: 2026-02-06 16:12:42.082757

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '97eb00658bba'
down_revision = '51c6f2f60d38'
branch_labels = None
depends_on = None

def upgrade() -> None:
	# Sincronizar columnas de inventory_movements
	# Las columnas nuevas (tipo, cantidad, etc.) deben tener los mismos valores que las antiguas (movement_type, quantity, etc.)
	
	# 1. Sincronizar datos existentes
	op.execute("""
		UPDATE inventory_movements 
		SET tipo = movement_type 
		WHERE tipo IS NULL AND movement_type IS NOT NULL
	""")
	
	op.execute("""
		UPDATE inventory_movements 
		SET cantidad = quantity 
		WHERE cantidad IS NULL AND quantity IS NOT NULL
	""")
	
	op.execute("""
		UPDATE inventory_movements 
		SET costo_unitario = unit_cost 
		WHERE costo_unitario IS NULL AND unit_cost IS NOT NULL
	""")
	
	op.execute("""
		UPDATE inventory_movements 
		SET costo_total = total_cost 
		WHERE costo_total IS NULL AND total_cost IS NOT NULL
	""")
	
	op.execute("""
		UPDATE inventory_movements 
		SET fecha = movement_date 
		WHERE fecha IS NULL AND movement_date IS NOT NULL
	""")
	
	op.execute("""
		UPDATE inventory_movements 
		SET referencia_tipo = reference_type 
		WHERE referencia_tipo IS NULL AND reference_type IS NOT NULL
	""")
	
	# 2. Crear triggers para sincronizar automáticamente en futuros inserts/updates
	# Trigger para sincronizar movement_type -> tipo
	op.execute("""
		CREATE OR REPLACE FUNCTION sync_inventory_movements_columns()
		RETURNS TRIGGER AS $$
		BEGIN
			-- Sincronizar movement_type -> tipo
			IF NEW.movement_type IS NOT NULL AND (NEW.tipo IS NULL OR NEW.tipo != NEW.movement_type) THEN
				NEW.tipo := NEW.movement_type;
			END IF;
			
			-- Sincronizar quantity -> cantidad
			IF NEW.quantity IS NOT NULL AND (NEW.cantidad IS NULL OR NEW.cantidad != NEW.quantity) THEN
				NEW.cantidad := NEW.quantity;
			END IF;
			
			-- Sincronizar unit_cost -> costo_unitario
			IF NEW.unit_cost IS NOT NULL AND (NEW.costo_unitario IS NULL OR NEW.costo_unitario != NEW.unit_cost) THEN
				NEW.costo_unitario := NEW.unit_cost;
			END IF;
			
			-- Sincronizar total_cost -> costo_total
			IF NEW.total_cost IS NOT NULL AND (NEW.costo_total IS NULL OR NEW.costo_total != NEW.total_cost) THEN
				NEW.costo_total := NEW.total_cost;
			END IF;
			
			-- Sincronizar movement_date -> fecha
			IF NEW.movement_date IS NOT NULL AND (NEW.fecha IS NULL OR NEW.fecha != NEW.movement_date) THEN
				NEW.fecha := NEW.movement_date;
			END IF;
			
			-- Sincronizar reference_type -> referencia_tipo
			IF NEW.reference_type IS NOT NULL AND (NEW.referencia_tipo IS NULL OR NEW.referencia_tipo != NEW.reference_type) THEN
				NEW.referencia_tipo := NEW.reference_type;
			END IF;
			
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql;
	""")
	
	# Crear el trigger
	op.execute("""
		DROP TRIGGER IF EXISTS trigger_sync_inventory_movements_columns ON inventory_movements;
		CREATE TRIGGER trigger_sync_inventory_movements_columns
		BEFORE INSERT OR UPDATE ON inventory_movements
		FOR EACH ROW
		EXECUTE FUNCTION sync_inventory_movements_columns();
	""")


def downgrade() -> None:
	# Eliminar trigger y función
	op.execute("DROP TRIGGER IF EXISTS trigger_sync_inventory_movements_columns ON inventory_movements;")
	op.execute("DROP FUNCTION IF EXISTS sync_inventory_movements_columns();")
