"""
Validaciones para el Motor de Asientos Contables
Implementa todas las validaciones críticas del checklist
"""
from decimal import Decimal
from typing import Dict, List, Optional, Tuple
from sqlalchemy.orm import Session

from ..domain.models import Account, Period
from ..domain.models_journal_engine import TipoCuentaContable, LadoAsiento
from ..domain.enums import AccountType


class ValidacionNaturalezaError(Exception):
    """Error cuando la naturaleza de cuenta no coincide con el lado del asiento"""
    pass


class PeriodoCerradoError(Exception):
    """Error cuando se intenta crear un asiento en un período cerrado"""
    pass


class CuentaInactivaError(Exception):
    """Error cuando se intenta usar una cuenta inactiva"""
    pass


class MapeoInvalidoError(Exception):
    """Error cuando un mapeo no cumple con las restricciones de naturaleza"""
    pass


# Mapeo de tipos de cuenta a naturaleza esperada
TIPO_CUENTA_NATURALEZA: Dict[str, Dict[str, any]] = {
    # IGV - CRÍTICO: IGV_CREDITO es Activo, IGV_DEBITO es Pasivo
    # Pueden estar en ambos lados para reversiones (notas de crédito/débito)
    "IGV_CREDITO": {
        "account_type": AccountType.ASSET,
        "lados_permitidos": [LadoAsiento.DEBE.value, LadoAsiento.HABER.value],
        "descripcion": "IGV que debes pagar (Activo - Crédito Fiscal) - DEBE aumenta, HABER disminuye (reversión)"
    },
    "IGV_DEBITO": {
        "account_type": AccountType.LIABILITY,
        "lados_permitidos": [LadoAsiento.DEBE.value, LadoAsiento.HABER.value],
        "descripcion": "IGV que te deben (Pasivo - Débito Fiscal) - HABER aumenta, DEBE disminuye (reversión)"
    },
    
    # Ingresos - normalmente HABER, pero puede estar en DEBE para reversiones (notas de crédito)
    "INGRESO_VENTAS": {
        "account_type": AccountType.INCOME,
        "lados_permitidos": [LadoAsiento.DEBE.value, LadoAsiento.HABER.value],
        "descripcion": "Ingresos por ventas - HABER aumenta, DEBE disminuye (reversión)"
    },
    "INGRESO_OTROS": {
        "account_type": AccountType.INCOME,
        "lados_permitidos": [LadoAsiento.HABER.value],
        "descripcion": "Otros ingresos"
    },
    
    # Gastos - normalmente DEBE, pero puede estar en HABER para reversiones (notas de crédito)
    "GASTO_COMPRAS": {
        "account_type": AccountType.EXPENSE,
        "lados_permitidos": [LadoAsiento.DEBE.value, LadoAsiento.HABER.value],
        "descripcion": "Gastos de compras - DEBE aumenta, HABER disminuye (reversión)"
    },
    "GASTO_VENTAS": {
        "account_type": AccountType.EXPENSE,
        "lados_permitidos": [LadoAsiento.DEBE.value],
        "descripcion": "Gastos de ventas"
    },
    "GASTO_PERSONAL": {
        "account_type": AccountType.EXPENSE,
        "lados_permitidos": [LadoAsiento.DEBE.value],
        "descripcion": "Gastos de personal (planillas) - 62.10 Remuneraciones"
    },
    # Pasivos - Planillas
    "REMUNERACIONES_POR_PAGAR": {
        "account_type": AccountType.LIABILITY,
        "lados_permitidos": [LadoAsiento.DEBE.value, LadoAsiento.HABER.value],
        "descripcion": "Remuneraciones por pagar - 41.10 - Provisión y pago"
    },
    "TRIBUTOS_POR_PAGAR": {
        "account_type": AccountType.LIABILITY,
        "lados_permitidos": [LadoAsiento.DEBE.value, LadoAsiento.HABER.value],
        "descripcion": "Tributos laborales por pagar - 40.20"
    },
    "APORTES_POR_PAGAR": {
        "account_type": AccountType.LIABILITY,
        "lados_permitidos": [LadoAsiento.DEBE.value, LadoAsiento.HABER.value],
        "descripcion": "Aportes sociales por pagar - 46.10"
    },
    
    # Activos - normalmente DEBE
    "CAJA": {
        "account_type": AccountType.ASSET,
        "lados_permitidos": [LadoAsiento.DEBE.value, LadoAsiento.HABER.value],
        "descripcion": "Caja y efectivo - DEBE aumenta, HABER disminuye"
    },
    "BANCO": {
        "account_type": AccountType.ASSET,
        "lados_permitidos": [LadoAsiento.DEBE.value, LadoAsiento.HABER.value],
        "descripcion": "Cuentas bancarias - DEBE aumenta, HABER disminuye"
    },
    "CLIENTES": {
        "account_type": AccountType.ASSET,
        "lados_permitidos": [LadoAsiento.DEBE.value, LadoAsiento.HABER.value],
        "descripcion": "Cuentas por cobrar (Activo) - DEBE aumenta, HABER disminuye"
    },
    "INVENTARIO": {
        "account_type": AccountType.ASSET,
        "lados_permitidos": [LadoAsiento.DEBE.value, LadoAsiento.HABER.value],
        "descripcion": "Inventario - DEBE aumenta, HABER disminuye"
    },
    
    # Pasivos - normalmente HABER
    "PROVEEDORES": {
        "account_type": AccountType.LIABILITY,
        "lados_permitidos": [LadoAsiento.DEBE.value, LadoAsiento.HABER.value],
        "descripcion": "Cuentas por pagar (Pasivo) - HABER aumenta, DEBE disminuye"
    },
    "DETRACCIONES": {
        "account_type": AccountType.LIABILITY,
        "lados_permitidos": [LadoAsiento.HABER.value],
        "descripcion": "Detracciones por pagar"
    },
}


def validar_naturaleza_cuenta(
    tipo_cuenta: str,
    lado: str,
    account: Account
) -> Tuple[bool, Optional[str]]:
    """
    Valida que la naturaleza de la cuenta coincida con el tipo y lado esperado.
    
    Args:
        tipo_cuenta: Tipo de cuenta contable (TipoCuentaContable)
        lado: Lado del asiento (DEBE o HABER)
        account: Cuenta contable real
    
    Returns:
        Tuple[bool, Optional[str]]: (es_valido, mensaje_error)
    
    Raises:
        ValidacionNaturalezaError: Si la validación falla
    """
    if tipo_cuenta not in TIPO_CUENTA_NATURALEZA:
        # Si no está en el diccionario, no validamos (tipo personalizado)
        return True, None
    
    reglas = TIPO_CUENTA_NATURALEZA[tipo_cuenta]
    
    # 1. Validar tipo de cuenta contable
    tipo_esperado = reglas["account_type"]
    if account.type != tipo_esperado:
        return False, (
            f"Tipo de cuenta incorrecto: '{tipo_cuenta}' debe ser {tipo_esperado.value}, "
            f"pero la cuenta {account.code} es {account.type.value}"
        )
    
    # 2. Validar lado permitido
    lados_permitidos = reglas["lados_permitidos"]
    if lado not in lados_permitidos:
        return False, (
            f"Lado incorrecto: '{tipo_cuenta}' solo puede estar en {lados_permitidos}, "
            f"pero se intentó usar en {lado}"
        )
    
    return True, None


def validar_mapeo_sensible(
    tipo_cuenta: str,
    account: Account
) -> Tuple[bool, Optional[str]]:
    """
    Valida mapeos sensibles con restricciones estrictas.
    
    Mapeos sensibles:
    - CLIENTES solo Activo/CxC
    - PROVEEDORES solo Pasivo/CxP
    - IGV_CREDITO solo Activo
    - IGV_DEBITO solo Pasivo
    
    Args:
        tipo_cuenta: Tipo de cuenta contable
        account: Cuenta contable real
    
    Returns:
        Tuple[bool, Optional[str]]: (es_valido, mensaje_error)
    """
    validaciones_sensibles = {
        "CLIENTES": {
            "tipos_permitidos": [AccountType.ASSET],
            "codigos_esperados": [],  # Sin códigos hardcodeados - validar solo por tipo
            "mensaje": "CLIENTES debe mapear a una cuenta de Activo (Cuentas por cobrar)"
        },
        "PROVEEDORES": {
            "tipos_permitidos": [AccountType.LIABILITY],
            "codigos_esperados": [],  # Sin códigos hardcodeados - validar solo por tipo
            "mensaje": "PROVEEDORES debe mapear a una cuenta de Pasivo (Cuentas por pagar)"
        },
        "IGV_CREDITO": {
            "tipos_permitidos": [AccountType.ASSET],
            "codigos_esperados": [],  # Sin códigos hardcodeados - validar solo por tipo
            "mensaje": "IGV_CREDITO debe mapear a una cuenta de Activo (IGV crédito fiscal)"
        },
        "IGV_DEBITO": {
            "tipos_permitidos": [AccountType.LIABILITY],
            "codigos_esperados": [],  # Sin códigos hardcodeados - validar solo por tipo
            "mensaje": "IGV_DEBITO debe mapear a una cuenta de Pasivo (IGV débito fiscal)"
        }
    }
    
    if tipo_cuenta not in validaciones_sensibles:
        return True, None
    
    regla = validaciones_sensibles[tipo_cuenta]
    
    # Validar SOLO tipo de cuenta (sin códigos hardcodeados)
    # El motor de asientos decide dinámicamente qué cuenta usar basándose en los mapeos configurados
    if account.type not in regla["tipos_permitidos"]:
        return False, f"{regla['mensaje']}. Cuenta actual: {account.code} ({account.name}) es de tipo {account.type.value}, pero se requiere {regla['tipos_permitidos'][0].value}"
    
    # ✅ Validación exitosa - el tipo de cuenta es correcto
    # No validamos códigos específicos - el sistema es dinámico
    return True, None


def validar_periodo_abierto(period: Period) -> Tuple[bool, Optional[str]]:
    """
    Valida que el período esté abierto.
    
    Args:
        period: Período contable
    
    Returns:
        Tuple[bool, Optional[str]]: (es_valido, mensaje_error)
    """
    if period.status == "CERRADO":
        return False, f"El período {period.year}-{period.month:02d} está cerrado. No se pueden crear asientos."
    
    return True, None


def validar_cuenta_activa(account: Account) -> Tuple[bool, Optional[str]]:
    """
    Valida que la cuenta esté activa (permite_movimiento).
    
    Args:
        account: Cuenta contable
    
    Returns:
        Tuple[bool, Optional[str]]: (es_valido, mensaje_error)
    """
    if not account.active:
        return False, f"La cuenta {account.code} - {account.name} está inactiva. No se pueden registrar movimientos."
    
    return True, None


def validar_asiento_cuadra(
    total_debe: Decimal,
    total_haber: Decimal,
    tolerancia: Decimal = Decimal("0.01")
) -> Tuple[bool, Optional[str]]:
    """
    Valida que el asiento cuadre (Debe == Haber) con tolerancia por redondeo.
    
    Args:
        total_debe: Total del debe
        total_haber: Total del haber
        tolerancia: Tolerancia permitida (default: 0.01)
    
    Returns:
        Tuple[bool, Optional[str]]: (es_valido, mensaje_error)
    """
    diferencia = abs(total_debe - total_haber)
    
    if diferencia > tolerancia:
        return False, (
            f"Asiento no cuadra: Debe={total_debe} != Haber={total_haber}. "
            f"Diferencia: {diferencia} (tolerancia: {tolerancia})"
        )
    
    return True, None

