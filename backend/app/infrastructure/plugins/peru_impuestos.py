from decimal import Decimal
from typing import List, Dict

IGV = Decimal('0.18')

def plant_compra_igv(base: Decimal, glosa:str) -> List[Dict]:
    # Asegurar que base esté redondeada a 2 decimales
    base_rounded = base.quantize(Decimal('0.01'))
    igv = (base_rounded * IGV).quantize(Decimal('0.01'))
    total = (base_rounded + igv).quantize(Decimal('0.01'))
    return [
        {"account_code":"60.11","debit":float(base_rounded),"credit":0.0,"memo":glosa},
        {"account_code":"40.11","debit":float(igv),"credit":0.0,"memo":"IGV Crédito"},
        {"account_code":"42.12","debit":0.0,"credit":float(total),"memo":"Por pagar proveedores"}
    ]

def plant_venta_igv(base: Decimal, glosa:str) -> List[Dict]:
    # Asegurar que base esté redondeada a 2 decimales
    base_rounded = base.quantize(Decimal('0.01'))
    igv = (base_rounded * IGV).quantize(Decimal('0.01'))
    total = (base_rounded + igv).quantize(Decimal('0.01'))
    return [
        {"account_code":"12.10","debit":float(total),"credit":0.0,"memo":"Por cobrar clientes"},
        {"account_code":"70.10","debit":0.0,"credit":float(base_rounded),"memo":glosa},
        {"account_code":"40.10","debit":0.0,"credit":float(igv),"memo":"IGV Débito"}  # CORREGIDO: usar 40.10 (IGV Débito) no 40.11 (IGV Crédito)
    ]

def plant_venta_igv_con_detraccion(base: Decimal, total: Decimal, detraction_amount: Decimal, glosa:str) -> List[Dict]:
    """
    Plantilla de asiento contable para venta con IGV y detracción.
    
    Asiento:
    - DEBE: Clientes (12.10) = Total factura - Detracción (monto neto a recibir)
    - DEBE: Detracciones por Cobrar (12.20) = Monto detracción
    - CRÉDITO: Ventas (70.10) = Base
    - CRÉDITO: IGV Débito (40.10) = IGV
    
    Args:
        base: Base imponible (sin IGV)
        total: Total de la factura (base + IGV)
        detraction_amount: Monto de detracción retenido
        glosa: Descripción del asiento
    """
    base_rounded = base.quantize(Decimal('0.01'))
    total_rounded = total.quantize(Decimal('0.01'))
    detraction_rounded = detraction_amount.quantize(Decimal('0.01'))
    net_to_receive = (total_rounded - detraction_rounded).quantize(Decimal('0.01'))
    
    lines = [
        {"account_code":"12.10","debit":float(net_to_receive),"credit":0.0,"memo":"Por cobrar clientes (neto)"},
        {"account_code":"12.20","debit":float(detraction_rounded),"credit":0.0,"memo":"Detracciones por cobrar"},
        {"account_code":"70.10","debit":0.0,"credit":float(base_rounded),"memo":glosa},
        {"account_code":"40.10","debit":0.0,"credit":float(total_rounded - base_rounded),"memo":"IGV Débito"}  # CORREGIDO: usar 40.10 (IGV Débito) no 40.11 (IGV Crédito)
    ]
    return lines

def aplicar_detraccion(total: Decimal, tasa: Decimal) -> Dict:
    det = (total * tasa).quantize(Decimal('0.01'))
    return {"monto_detraccion": float(det), "neto_pago": float((total - det).quantize(Decimal('0.01')))}
