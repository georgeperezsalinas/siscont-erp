"""
DEPRECATED: Este módulo contiene plantillas hardcodeadas de asientos contables.
Se recomienda usar el Motor de Asientos (MotorAsientos) en su lugar, que permite
configurar reglas y tipos de cuenta sin hardcodear códigos.

Para migrar:
- Usar MotorAsientos.generar_asiento() con evento_tipo="COMPRA" o "VENTA"
- Configurar reglas contables desde el frontend o API
"""
from decimal import Decimal
from typing import List, Dict

IGV = Decimal('0.18')

# DEPRECATED: Usar MotorAsientos en su lugar
def plantilla_compra(base: Decimal, glosa: str) -> List[Dict]:
    total = (base * (Decimal('1.00') + IGV)).quantize(Decimal('0.01'))
    return [
        {"account_code": "60.11", "debit": float(base), "credit": 0.0, "memo": glosa},
        {"account_code": "40.11", "debit": float((base*IGV).quantize(Decimal('0.01'))), "credit": 0.0, "memo": "IGV Crédito"},
        {"account_code": "42.12", "debit": 0.0, "credit": float(total), "memo": "Por pagar proveedores"}
    ]
