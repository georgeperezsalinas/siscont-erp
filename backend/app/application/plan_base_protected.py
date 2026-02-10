"""
Funciones para identificar y proteger cuentas base del plan_base.csv.

Las cuentas base son aquellas que vienen del plan_base.csv y no deben
ser eliminadas por el usuario, ya que son parte del plan contable base.
"""

from pathlib import Path
from typing import Set


def get_base_account_codes() -> Set[str]:
    """
    Obtiene el conjunto de códigos de cuentas base del plan_base.csv.
    
    Returns:
        Set[str]: Conjunto de códigos de cuentas base (ej: {"10", "10.10", "10.20", ...})
    """
    base_dir = Path(__file__).parent.parent.parent
    csv_path = base_dir / "data" / "plan_base.csv"
    
    if not csv_path.exists():
        csv_path = base_dir / "plan_base.csv"
        if not csv_path.exists():
            # Si no existe el archivo, retornar conjunto vacío
            return set()
    
    import csv
    base_codes = set()
    
    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                code = row.get('code', '').strip()
                if code:
                    base_codes.add(code)
    except Exception:
        # Si hay error leyendo el archivo, retornar conjunto vacío
        pass
    
    return base_codes


def is_base_account(code: str) -> bool:
    """
    Verifica si un código de cuenta es una cuenta base (del plan_base.csv).
    
    Args:
        code: Código de cuenta a verificar
        
    Returns:
        bool: True si es una cuenta base, False en caso contrario
    """
    base_codes = get_base_account_codes()
    return code in base_codes


def can_delete_account(code: str) -> tuple[bool, str]:
    """
    Verifica si una cuenta puede ser eliminada.
    
    Args:
        code: Código de cuenta a verificar
        
    Returns:
        tuple[bool, str]: (puede_eliminar, mensaje_error)
    """
    if is_base_account(code):
        return False, f"La cuenta {code} es una cuenta base del plan contable y no puede ser eliminada. Solo puede desactivarse."
    return True, ""

