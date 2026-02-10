"""
Plugin de Inventario - Metodología Contable Peruana
===================================================

Genera plantillas de asientos contables para movimientos de inventario
según el PCGE (Plan Contable General Empresarial) peruano.

Cuentas PCGE utilizadas:
- 20.x: Existencias (Inventarios)
- 69.x: Costo de Ventas
- 61.x: Variación de Existencias (para valorización)
"""
from decimal import Decimal
from typing import List, Dict

def plant_entrada_inventario(
    total_cost: Decimal,
    product_account_code: str,
    glosa: str = ""
) -> List[Dict]:
    """
    Genera plantilla de asiento para ENTRADA de inventario.
    
    Según PCGE peruano:
    - Debe a Inventario (20.x) por el costo total
    - Crédito según origen: Compras (60.11), Producción, Ajuste, etc.
    
    Args:
        total_cost: Costo total de la entrada (cantidad * costo unitario)
        product_account_code: Código de cuenta de inventario del producto (20.x)
        glosa: Descripción del movimiento
        
    Returns:
        Lista de líneas contables para el asiento
    """
    total_rounded = total_cost.quantize(Decimal('0.01'))
    
    return [
        {
            "account_code": product_account_code,  # Ej: "20.10" Mercaderías
            "debit": float(total_rounded),
            "credit": 0.0,
            "memo": glosa or "Entrada de inventario"
        },
        # El crédito se determina según el origen:
        # - Si es de compra: 60.11 (Compras) o 42.12 (Proveedores)
        # - Si es producción: 71.x (Producción)
        # - Si es ajuste: 69.x (Costo de Ventas) o cuenta específica
        # Por defecto, se usa 60.11 (Compras) y se puede ajustar en el servicio
    ]


def plant_salida_inventario(
    total_cost: Decimal,
    product_account_code: str,
    glosa: str = ""
) -> List[Dict]:
    """
    Genera plantilla de asiento para SALIDA de inventario.
    
    Según PCGE peruano:
    - Debe a Costo de Ventas (69.x) por el costo
    - Crédito a Inventario (20.x) por el mismo monto
    
    Args:
        total_cost: Costo total de la salida
        product_account_code: Código de cuenta de inventario del producto (20.x)
        glosa: Descripción del movimiento
        
    Returns:
        Lista de líneas contables para el asiento
    """
    total_rounded = total_cost.quantize(Decimal('0.01'))
    
    return [
        {
            "account_code": "69.10",  # Costo de Ventas - Mercaderías
            "debit": float(total_rounded),
            "credit": 0.0,
            "memo": glosa or "Costo de venta"
        },
        {
            "account_code": product_account_code,  # Ej: "20.10" Mercaderías
            "debit": 0.0,
            "credit": float(total_rounded),
            "memo": glosa or "Salida de inventario"
        },
    ]


def calcular_costo_promedio(
    stock_actual: Decimal,
    costo_actual: Decimal,
    cantidad_entrada: Decimal,
    costo_entrada: Decimal
) -> Decimal:
    """
    Calcula el costo promedio ponderado para valorización de inventario.
    
    Método usado comúnmente en Perú según PCGE.
    
    Fórmula:
    costo_promedio = (stock_actual * costo_actual + cantidad_entrada * costo_entrada) 
                     / (stock_actual + cantidad_entrada)
    
    Args:
        stock_actual: Cantidad actual en inventario
        costo_actual: Costo promedio actual
        cantidad_entrada: Cantidad que entra
        costo_entrada: Costo unitario de lo que entra
        
    Returns:
        Nuevo costo promedio redondeado a 2 decimales
    """
    if stock_actual + cantidad_entrada == 0:
        return Decimal('0.00')
    
    total_actual = stock_actual * costo_actual
    total_entrada = cantidad_entrada * costo_entrada
    nuevo_stock = stock_actual + cantidad_entrada
    
    costo_promedio = (total_actual + total_entrada) / nuevo_stock
    return costo_promedio.quantize(Decimal('0.01'))

