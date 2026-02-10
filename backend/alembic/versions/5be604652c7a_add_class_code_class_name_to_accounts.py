"""add_class_code_class_name_to_accounts

Revision ID: 5be604652c7a
Revises: 586d4f9de682
Create Date: 2026-02-07 11:27:13.262025

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '5be604652c7a'
down_revision = '586d4f9de682'
branch_labels = None
depends_on = None

# Mapeo de códigos de clase PCGE a nombres
CLASS_MAPPING = {
    "10": "Caja y Bancos",
    "12": "Cuentas por Cobrar",
    "20": "Existencias",
    "33": "Activo Fijo",
    "40": "Tributos",
    "41": "Remuneraciones",
    "42": "Cuentas por Pagar",
    "50": "Capital",
    "58": "Reservas",
    "59": "Resultados",
    "60": "Gastos",
    "65": "Ajustes",
    "68": "Gastos Financieros",
    "69": "Costos",
    "70": "Ingresos",
    "75": "Otros Ingresos",
    "90": "Orden",
}

def _extract_class_code(code: str) -> str | None:
    """
    Extrae el código de clase PCGE del código de cuenta.
    Ejemplos:
    - "10.10" -> "10"
    - "40.11" -> "40"
    - "12.20" -> "12"
    """
    if not code:
        return None
    # Separar por punto y tomar la primera parte
    parts = code.split('.')
    if parts:
        return parts[0]
    return None

def upgrade() -> None:
    # Agregar columnas class_code y class_name
    op.add_column('accounts', sa.Column('class_code', sa.String(length=2), nullable=True))
    op.add_column('accounts', sa.Column('class_name', sa.String(length=100), nullable=True))
    
    # Crear índice para class_code
    op.create_index(op.f('ix_accounts_class_code'), 'accounts', ['class_code'], unique=False)
    
    # Poblar class_code y class_name según el código de cuenta
    connection = op.get_bind()
    
    # Obtener todas las cuentas
    result = connection.execute(sa.text("SELECT id, code FROM accounts"))
    accounts = result.fetchall()
    
    for account_id, code in accounts:
        class_code = _extract_class_code(code)
        class_name = CLASS_MAPPING.get(class_code) if class_code else None
        
        if class_code:
            connection.execute(
                sa.text("UPDATE accounts SET class_code = :class_code, class_name = :class_name WHERE id = :id"),
                {"class_code": class_code, "class_name": class_name, "id": account_id}
            )


def downgrade() -> None:
    # Eliminar índice
    op.drop_index(op.f('ix_accounts_class_code'), table_name='accounts')
    
    # Eliminar columnas
    op.drop_column('accounts', 'class_name')
    op.drop_column('accounts', 'class_code')
