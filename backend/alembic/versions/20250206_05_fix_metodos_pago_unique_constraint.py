"""fix metodos_pago unique constraint

Revision ID: 20250206_05
Revises: 20250206_04
Create Date: 2025-02-06

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20250206_05'
down_revision = '20250206_04'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    # Verificar si la tabla existe
    if 'metodos_pago' in inspector.get_table_names():
        # Verificar si existe la restricción única incorrecta (solo codigo)
        constraints = inspector.get_unique_constraints('metodos_pago')
        has_wrong_constraint = any(c['name'] == 'metodos_pago_codigo_key' or 
                                   (len(c['column_names']) == 1 and c['column_names'][0] == 'codigo')
                                   for c in constraints)
        
        if has_wrong_constraint:
            # Eliminar la restricción única incorrecta (solo codigo)
            try:
                op.drop_constraint('metodos_pago_codigo_key', 'metodos_pago', type_='unique')
            except:
                # Si no existe con ese nombre, buscar el nombre real
                for constraint in constraints:
                    if len(constraint['column_names']) == 1 and constraint['column_names'][0] == 'codigo':
                        op.drop_constraint(constraint['name'], 'metodos_pago', type_='unique')
                        break
        
        # Verificar si ya existe la restricción correcta
        constraints_after = inspector.get_unique_constraints('metodos_pago')
        has_correct_constraint = any(
            len(c['column_names']) == 2 and 
            'company_id' in c['column_names'] and 
            'codigo' in c['column_names']
            for c in constraints_after
        )
        
        if not has_correct_constraint:
            # Crear la restricción única correcta (company_id, codigo)
            op.create_unique_constraint(
                'uq_company_metodo_pago_codigo',
                'metodos_pago',
                ['company_id', 'codigo']
            )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    if 'metodos_pago' in inspector.get_table_names():
        # Eliminar la restricción correcta
        try:
            op.drop_constraint('uq_company_metodo_pago_codigo', 'metodos_pago', type_='unique')
        except:
            pass
        
        # Restaurar la restricción incorrecta (solo codigo) - solo si no hay datos duplicados
        try:
            op.create_unique_constraint(
                'metodos_pago_codigo_key',
                'metodos_pago',
                ['codigo']
            )
        except:
            # Si hay datos duplicados, no se puede restaurar
            pass

