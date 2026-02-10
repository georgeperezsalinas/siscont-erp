"""
Servicio para mapeo automático de tipos de cuenta a cuentas reales
Usa patrones y coincidencias inteligentes para encontrar cuentas automáticamente
"""
from sqlalchemy.orm import Session
from typing import Dict, List, Optional, Tuple
from ..domain.models import Account
from ..domain.models_journal_engine import TipoCuentaMapeo, TipoCuentaContable
from ..domain.enums import AccountType


# Mapeo de tipos de cuenta a patrones de código y nombres
TIPO_CUENTA_PATTERNS: Dict[str, Dict] = {
    # Activos
    "CAJA": {
        "codigos": ["10.1", "10.10", "10.11"],
        "nombres": ["caja", "efectivo", "cash"],
        "account_type": AccountType.ASSET
    },
    "BANCO": {
        "codigos": ["10.2", "10.20", "10.21", "10.22"],
        "nombres": ["banco", "cuenta corriente", "cuenta ahorros", "bank"],
        "account_type": AccountType.ASSET
    },
    "CLIENTES": {
        "codigos": ["12.1", "12.11"],  # 12.1 es el código correcto según PCGE. 12.10 es Bancos, NO Clientes
        "nombres": ["clientes", "cuentas por cobrar comerciales", "cuentas por cobrar", "deudores comerciales"],
        "account_type": AccountType.ASSET
    },
    "INVENTARIO": {
        "codigos": ["20", "20.1", "20.10", "20.11"],
        "nombres": ["inventario", "mercaderías", "productos", "stock"],
        "account_type": AccountType.ASSET
    },
    "ACTIVO_FIJO": {
        "codigos": ["33", "33.1", "33.10"],
        "nombres": ["activo fijo", "inmuebles", "maquinaria", "equipos"],
        "account_type": AccountType.ASSET
    },
    
    # Pasivos
    "PROVEEDORES": {
        "codigos": ["42.1", "42.12", "42.11"],
        "nombres": ["proveedores", "cuentas por pagar", "acreedores"],
        "account_type": AccountType.LIABILITY
    },
    "IGV_CREDITO": {
        # ⚠️ CRÍTICO: IGV_CREDITO es Activo (crédito fiscal que puedes usar)
        # NO usar códigos hardcodeados - buscar solo por tipo y nombre
        "codigos": [],  # Sin códigos hardcodeados - el motor decide dinámicamente
        "nombres": ["igv crédito", "igv crédito fiscal", "crédito fiscal", "igv crédito fiscal por pagar"],
        "account_type": AccountType.ASSET  # ✅ CORREGIDO: Es Activo, NO Pasivo
    },
    #"IGV_DEBITO": {
        # IGV_DEBITO es Pasivo (débito fiscal que debes pagar)
        # NO usar códigos hardcodeados - buscar solo por tipo y nombre
    #    "codigos": [],  # Sin códigos hardcodeados - el motor decide dinámicamente
    #    "nombres": ["igv débito", "igv débito fiscal", "igv por cobrar", "débito fiscal", "igv débito fiscal por cobrar"],
    #    "account_type": AccountType.LIABILITY  # ✅ Correcto: Es Pasivo
    #},
    "IGV_DEBITO": {
        "codigos": [],
        "nombres": [
            "igv débito",
            "igv débito fiscal",
            "igv por pagar",
            "igv por pagar débito",
        ],
        "account_type": AccountType.LIABILITY
    },
    "DETRACCIONES": {
        "codigos": ["40.2", "40.20"],
        "nombres": ["detracciones", "detracción"],
        "account_type": AccountType.LIABILITY
    },
    
    # Patrimonio
    "CAPITAL": {
        "codigos": ["50", "50.1", "50.10"],
        "nombres": ["capital", "capital social"],
        "account_type": AccountType.EQUITY
    },
    "RESERVAS": {
        "codigos": ["51", "51.1"],
        "nombres": ["reservas"],
        "account_type": AccountType.EQUITY
    },
    "RESULTADOS": {
        "codigos": ["59", "59.1"],
        "nombres": ["resultados", "utilidades", "pérdidas"],
        "account_type": AccountType.EQUITY
    },
    
    # Ingresos
    "INGRESO_VENTAS": {
        "codigos": ["70", "70.1", "70.10", "70.11"],
        "nombres": ["ventas", "ingresos por ventas", "ingresos operacionales"],
        "account_type": AccountType.INCOME
    },
    "INGRESO_OTROS": {
        "codigos": ["75", "75.1"],
        "nombres": ["otros ingresos", "ingresos no operacionales"],
        "account_type": AccountType.INCOME
    },
    
    # Gastos
    "GASTO_COMPRAS": {
        "codigos": ["60", "60.1", "60.11", "60.10"],
        "nombres": ["compras", "gasto de compras", "costo de compras"],
        "account_type": AccountType.EXPENSE
    },
    "GASTO_VENTAS": {
        "codigos": ["63", "63.1"],
        "nombres": ["gastos de ventas", "gastos comerciales"],
        "account_type": AccountType.EXPENSE
    },
    "COSTO_VENTAS": {
        "codigos": ["69", "69.1", "69.10"],
        "nombres": ["costo de ventas", "costo de mercaderías vendidas"],
        "account_type": AccountType.EXPENSE
    },
    "GASTO_OTROS": {
        "codigos": ["61", "62", "64", "65", "66", "67", "68"],
        "nombres": ["gastos", "gastos administrativos", "gastos financieros"],
        "account_type": AccountType.EXPENSE
    }
}


def buscar_cuenta_por_tipo(
    db: Session,
    company_id: int,
    tipo_cuenta: str
) -> Optional[Account]:
    """
    Busca automáticamente una cuenta real para un tipo de cuenta.
    
    Estrategia:
    1. Buscar por códigos comunes (ej: GASTO_COMPRAS → 60.11)
    2. Buscar por nombres similares (ej: "compras", "gasto de compras")
    3. Filtrar por tipo de cuenta contable (ASSET, LIABILITY, etc.)
    
    Returns:
        Account: Cuenta encontrada o None
    """
    if tipo_cuenta not in TIPO_CUENTA_PATTERNS:
        return None
    
    pattern = TIPO_CUENTA_PATTERNS[tipo_cuenta]
    accounts = db.query(Account).filter(
        Account.company_id == company_id,
        Account.active == True
    ).all()
    
    if not accounts:
        return None
    
    # 1. Buscar por código exacto o que empiece con el patrón (SOLO si hay códigos definidos)
    # Si no hay códigos definidos, saltar esta búsqueda (sistema dinámico)
    codigos_ordenados = pattern.get("codigos", [])
    tipo_account = pattern.get("account_type")
    
    # Solo buscar por código si hay códigos definidos (para backward compatibility)
    # Si no hay códigos, el sistema es completamente dinámico
    if codigos_ordenados:
        for codigo_patron in codigos_ordenados:
            # Buscar código exacto (máxima prioridad)
            cuenta_exacta = next((a for a in accounts if a.code == codigo_patron), None)
            if cuenta_exacta:
                # Validar tipo de cuenta antes de retornar (evita mapeos incorrectos)
                if tipo_account and cuenta_exacta.type == tipo_account:
                    return cuenta_exacta
                elif not tipo_account:
                    # Si no hay tipo definido, retornar igual
                    return cuenta_exacta
            
            # Buscar código que empiece con el patrón seguido de punto o más dígitos
            # Ej: patrón "10.1" debe encontrar "10.10", "10.11", "10.1.1", etc.
            for account in accounts:
                if account.code.startswith(codigo_patron) and account.code != codigo_patron:
                    # Verificar que después del patrón hay un punto o un dígito
                    resto = account.code[len(codigo_patron):]
                    if resto.startswith(".") or (resto and resto[0].isdigit()):
                        # Validar tipo de cuenta antes de retornar
                        if tipo_account and account.type == tipo_account:
                            return account
                        elif not tipo_account:
                            return account
    
    # 2. Buscar por nombre (coincidencia parcial, case-insensitive)
    # Esta es la búsqueda principal cuando no hay códigos hardcodeados (sistema dinámico)
    nombres_buscar = pattern.get("nombres", [])
    tipo_account = pattern.get("account_type")
    
    # Priorizar coincidencias exactas sobre parciales
    for nombre_buscar in nombres_buscar:
        nombre_lower = nombre_buscar.lower()
        
        # Primero buscar coincidencia exacta (mayor prioridad)
        for account in accounts:
            if tipo_account and account.type != tipo_account:
                continue
            if account.name.lower() == nombre_lower:
                return account
        
        # Luego buscar coincidencia parcial
        for account in accounts:
            if tipo_account and account.type != tipo_account:
                continue
            if nombre_lower in account.name.lower():
                return account
    
    # 3. Si hay tipo de cuenta definido pero no se encontró por nombre,
    # buscar cualquier cuenta de ese tipo (último recurso)
    # ⚠️ Esto es menos ideal, pero necesario para casos donde el nombre no coincide
    if tipo_account:
        cuenta_tipo = next((a for a in accounts if a.type == tipo_account), None)
        if cuenta_tipo:
            return cuenta_tipo
    
    return None


def mapear_automaticamente_todos(
    db: Session,
    company_id: int
) -> Dict[str, any]:
    """
    Mapea automáticamente todos los tipos de cuenta posibles.
    
    Returns:
        Dict con estadísticas del mapeo:
        {
            "mapeados": int,
            "no_encontrados": List[str],
            "ya_existian": int,
            "creados": int
        }
    """
    resultado = {
        "mapeados": 0,
        "no_encontrados": [],
        "ya_existian": 0,
        "creados": 0
    }
    
    for tipo_cuenta in TIPO_CUENTA_PATTERNS.keys():
        # Verificar si ya existe mapeo
        mapeo_existente = db.query(TipoCuentaMapeo).filter(
            TipoCuentaMapeo.company_id == company_id,
            TipoCuentaMapeo.tipo_cuenta == tipo_cuenta,
            TipoCuentaMapeo.activo == True
        ).first()
        
        if mapeo_existente:
            resultado["ya_existian"] += 1
            continue
        
        # Buscar cuenta automáticamente
        cuenta = buscar_cuenta_por_tipo(db, company_id, tipo_cuenta)
        
        if not cuenta:
            resultado["no_encontrados"].append(tipo_cuenta)
            continue
        
        # Crear mapeo
        mapeo = TipoCuentaMapeo(
            company_id=company_id,
            tipo_cuenta=tipo_cuenta,
            account_id=cuenta.id,
            activo=True
        )
        db.add(mapeo)
        resultado["creados"] += 1
        resultado["mapeados"] += 1
    
    db.commit()
    return resultado


def sugerir_cuenta_para_tipo(
    db: Session,
    company_id: int,
    tipo_cuenta: str
) -> List[Tuple[Account, float]]:
    """
    Sugiere cuentas para un tipo de cuenta, ordenadas por relevancia.
    
    Returns:
        List[Tuple[Account, float]]: Lista de (cuenta, score) ordenada por score descendente
    """
    if tipo_cuenta not in TIPO_CUENTA_PATTERNS:
        return []
    
    pattern = TIPO_CUENTA_PATTERNS[tipo_cuenta]
    accounts = db.query(Account).filter(
        Account.company_id == company_id,
        Account.active == True
    ).all()
    
    sugerencias: List[Tuple[Account, float]] = []
    
    for account in accounts:
        score = 0.0
        
        # Puntos por código exacto
        if account.code in pattern.get("codigos", []):
            score += 100.0
        # Puntos por código que empiece con patrón seguido de punto o dígito
        else:
            for codigo_patron in pattern.get("codigos", []):
                if account.code.startswith(codigo_patron) and account.code != codigo_patron:
                    resto = account.code[len(codigo_patron):]
                    if resto.startswith(".") or (resto and resto[0].isdigit()):
                        score += 50.0
                        break
        
        # Puntos por nombre (coincidencia exacta = más puntos)
        for nombre_buscar in pattern.get("nombres", []):
            if nombre_buscar.lower() == account.name.lower():
                score += 80.0
            elif nombre_buscar.lower() in account.name.lower():
                score += 30.0
        
        # Puntos por tipo de cuenta
        tipo_account = pattern.get("account_type")
        if tipo_account and account.type == tipo_account:
            score += 20.0
        elif tipo_account and account.type != tipo_account:
            # Penalizar significativamente si el tipo no coincide (evita mapeos incorrectos)
            score -= 50.0
        
        if score > 0:
            sugerencias.append((account, score))
    
    # Ordenar por score descendente
    sugerencias.sort(key=lambda x: x[1], reverse=True)
    return sugerencias


def buscar_cuenta_con_score(
    db: Session,
    company_id: int,
    tipo_cuenta: str
) -> Optional[Tuple[Account, float]]:
    """
    Busca automáticamente una cuenta para un tipo de cuenta y retorna la mejor opción con su score.
    
    Similar a buscar_cuenta_por_tipo, pero retorna también el score de confianza.
    Usa la misma lógica de scoring que sugerir_cuenta_para_tipo.
    
    Args:
        db: Sesión de base de datos
        company_id: ID de la empresa
        tipo_cuenta: Tipo de cuenta contable (TipoCuentaContable)
    
    Returns:
        Optional[Tuple[Account, float]]: (Cuenta, score) de la mejor opción, o None si no se encuentra
    """
    if tipo_cuenta not in TIPO_CUENTA_PATTERNS:
        return None
    
    pattern = TIPO_CUENTA_PATTERNS[tipo_cuenta]
    accounts = db.query(Account).filter(
        Account.company_id == company_id,
        Account.active == True
    ).all()
    
    if not accounts:
        return None
    
    mejor_cuenta = None
    mejor_score = 0.0
    
    for account in accounts:
        score = 0.0
        
        # Puntos por código exacto (máxima prioridad)
        if account.code in pattern.get("codigos", []):
            score += 100.0
        # Puntos por código que empiece con patrón seguido de punto o dígito
        else:
            for codigo_patron in pattern.get("codigos", []):
                if account.code.startswith(codigo_patron) and account.code != codigo_patron:
                    resto = account.code[len(codigo_patron):]
                    if resto.startswith(".") or (resto and resto[0].isdigit()):
                        score += 50.0
                        break
        
        # Puntos por nombre (coincidencia exacta = más puntos)
        for nombre_buscar in pattern.get("nombres", []):
            if nombre_buscar.lower() == account.name.lower():
                score += 80.0
            elif nombre_buscar.lower() in account.name.lower():
                score += 30.0
        
        # Puntos por tipo de cuenta
        tipo_account = pattern.get("account_type")
        if tipo_account and account.type == tipo_account:
            score += 20.0
        elif tipo_account and account.type != tipo_account:
            # Penalizar significativamente si el tipo no coincide (evita mapeos incorrectos)
            score -= 50.0
        
        # Validar tipo de cuenta antes de considerar (evita mapeos incorrectos)
        if tipo_account and account.type != tipo_account:
            # Si el tipo no coincide, no considerar esta cuenta
            continue
        
        if score > mejor_score:
            mejor_score = score
            mejor_cuenta = account
    
    if mejor_cuenta and mejor_score > 0:
        return (mejor_cuenta, mejor_score)
    
    return None

