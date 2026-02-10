"""
Servicio para validar asientos contables usando reglas de cuentas
Sistema de ayuda tipo IA para validar y sugerir asientos
"""
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from ..domain.models import Account, JournalEntry, EntryLine
from ..domain.models_account_rules import AccountValidationRule, AccountCompatibilityRule
import re
from datetime import datetime

class AccountRuleValidationResult:
    """Resultado de la validación de reglas"""
    def __init__(self):
        self.errors: List[Dict[str, Any]] = []
        self.warnings: List[Dict[str, Any]] = []
        self.suggestions: List[Dict[str, Any]] = []
        self.compatible_accounts: List[Dict[str, Any]] = []
        self.is_valid: bool = True
    
    def add_error(self, rule_name: str, message: str, accounts: List[str]):
        self.errors.append({
            "rule": rule_name,
            "message": message,
            "accounts": accounts
        })
        self.is_valid = False
    
    def add_warning(self, rule_name: str, message: str, accounts: List[str]):
        self.warnings.append({
            "rule": rule_name,
            "message": message,
            "accounts": accounts
        })
    
    def add_suggestion(self, rule_name: str, message: str, suggested_accounts: List[str], suggested_glosa: Optional[str] = None):
        self.suggestions.append({
            "rule": rule_name,
            "message": message,
            "suggested_accounts": suggested_accounts,
            "suggested_glosa": suggested_glosa
        })
    
    def add_compatible_account(self, account_code: str, compatible_accounts: List[str], confidence: float):
        self.compatible_accounts.append({
            "account_code": account_code,
            "compatible_accounts": compatible_accounts,
            "confidence": confidence
        })

def match_account_pattern(pattern: str, account_code: str) -> bool:
    """
    Verifica si un código de cuenta coincide con un patrón.
    Soporta:
    - Códigos exactos: "10.11"
    - Patrones con wildcard: "10.*" (cualquier cuenta que empiece con 10.)
    - Patrones con nivel: "10.1*" (cuentas de nivel 2 que empiezan con 10.1)
    """
    # Convertir patrón a regex
    regex_pattern = pattern.replace(".", r"\.").replace("*", ".*")
    return bool(re.match(f"^{regex_pattern}$", account_code))

def get_account_codes_from_entry(entry_lines: List[Dict[str, Any]]) -> List[str]:
    """Extrae los códigos de cuenta de las líneas de un asiento"""
    account_codes = []
    for line in entry_lines:
        if isinstance(line, dict):
            account_code = line.get("account_code") or line.get("account_id")
            if account_code:
                # Si es un ID, necesitamos obtener el código
                if isinstance(account_code, int):
                    # Se debe pasar el código real, no el ID
                    continue
                account_codes.append(str(account_code))
    return account_codes

def validate_entry_with_rules(
    db: Session,
    company_id: int,
    entry_lines: List[Dict[str, Any]],
    account_codes: Optional[List[str]] = None
) -> AccountRuleValidationResult:
    """
    Valida un asiento contable usando las reglas configuradas.
    
    Args:
        db: Sesión de base de datos
        company_id: ID de la empresa
        entry_lines: Lista de líneas del asiento (con account_code o account_id)
        account_codes: Lista opcional de códigos de cuenta ya extraídos
    
    Returns:
        AccountRuleValidationResult con errores, advertencias y sugerencias
    """
    result = AccountRuleValidationResult()
    
    # Obtener códigos de cuenta si no se proporcionaron
    if account_codes is None:
        account_codes = get_account_codes_from_entry(entry_lines)
    
    if not account_codes:
        return result
    
    # Obtener reglas activas de la empresa
    rules = db.query(AccountValidationRule).filter(
        AccountValidationRule.company_id == company_id,
        AccountValidationRule.active == True
    ).all()
    
    # Validar cada regla
    for rule in rules:
        if not rule.account_patterns:
            continue
        
        # Verificar si las cuentas del asiento coinciden con los patrones de la regla
        matched_patterns = []
        for pattern in rule.account_patterns:
            for account_code in account_codes:
                if match_account_pattern(pattern, account_code):
                    matched_patterns.append((pattern, account_code))
        
        # Si se encontraron coincidencias, aplicar la regla
        if matched_patterns:
            matched_accounts = [acc for _, acc in matched_patterns]
            
            if rule.rule_type == "INCOMPATIBLE":
                # Verificar si hay múltiples cuentas que coinciden con patrones incompatibles
                if len(matched_accounts) >= 2:
                    if rule.severity == "ERROR":
                        result.add_error(rule.name, rule.message, matched_accounts)
                    else:
                        result.add_warning(rule.name, rule.message, matched_accounts)
            
            elif rule.rule_type == "REQUIRED_PAIR":
                # Verificar si falta alguna cuenta requerida
                required_patterns = set(rule.account_patterns)
                found_patterns = set([pattern for pattern, _ in matched_patterns])
                missing_patterns = required_patterns - found_patterns
                
                if missing_patterns:
                    if rule.severity == "ERROR":
                        result.add_error(
                            rule.name,
                            f"{rule.message}. Faltan cuentas: {', '.join(missing_patterns)}",
                            matched_accounts
                        )
                    else:
                        result.add_warning(
                            rule.name,
                            f"{rule.message}. Faltan cuentas: {', '.join(missing_patterns)}",
                            matched_accounts
                        )
            
            elif rule.rule_type == "SUGGESTION":
                # Agregar sugerencia
                suggested = rule.suggested_accounts or []
                result.add_suggestion(
                    rule.name,
                    rule.message,
                    suggested,
                    rule.suggested_glosa
                )
            
            elif rule.rule_type == "WARNING":
                # Agregar advertencia
                result.add_warning(rule.name, rule.message, matched_accounts)
    
    # Obtener sugerencias de compatibilidad
    for account_code in account_codes:
        compat_rules = db.query(AccountCompatibilityRule).filter(
            AccountCompatibilityRule.company_id == company_id,
            AccountCompatibilityRule.active == True
        ).all()
        
        for compat_rule in compat_rules:
            if match_account_pattern(compat_rule.account_code_pattern, account_code):
                # Verificar si alguna cuenta compatible ya está en el asiento
                compatible_found = False
                for compat_pattern in compat_rule.compatible_with:
                    for existing_code in account_codes:
                        if match_account_pattern(compat_pattern, existing_code):
                            compatible_found = True
                            break
                    if compatible_found:
                        break
                
                # Si no se encontró ninguna cuenta compatible, sugerir
                if not compatible_found:
                    # Obtener códigos reales de cuentas que coinciden con los patrones
                    compatible_accounts = []
                    for compat_pattern in compat_rule.compatible_with:
                        # Buscar cuentas que coincidan con el patrón
                        accounts = db.query(Account).filter(
                            Account.company_id == company_id,
                            Account.active == True
                        ).all()
                        for acc in accounts:
                            if match_account_pattern(compat_pattern, acc.code):
                                compatible_accounts.append(acc.code)
                    
                    if compatible_accounts:
                        result.add_compatible_account(
                            account_code,
                            compatible_accounts,
                            float(compat_rule.confidence)
                        )
    
    return result

def get_default_rules() -> List[Dict[str, Any]]:
    """
    Retorna reglas predeterminadas comunes para el PCGE peruano.
    Estas reglas se pueden cargar automáticamente al crear una empresa.
    """
    return [
        {
            "rule_type": "INCOMPATIBLE",
            "name": "No usar cuenta 10 con cuenta 10",
            "description": "No se debe usar una cuenta bancaria (10.x) con otra cuenta bancaria (10.x) en el mismo asiento",
            "account_patterns": ["10.*", "10.*"],
            "severity": "ERROR",
            "message": "No se puede usar una cuenta bancaria (10.x) con otra cuenta bancaria (10.x) en el mismo asiento. Use una cuenta de origen diferente (ej: 12.x Caja, 40.x Ingresos, etc.)"
        },
        {
            "rule_type": "INCOMPATIBLE",
            "name": "No usar cuenta 12 con cuenta 12",
            "description": "No se debe usar una cuenta de caja (12.x) con otra cuenta de caja (12.x)",
            "account_patterns": ["12.*", "12.*"],
            "severity": "ERROR",
            "message": "No se puede usar una cuenta de caja (12.x) con otra cuenta de caja (12.x) en el mismo asiento"
        },
        {
            "rule_type": "REQUIRED_PAIR",
            "name": "IGV requiere cuenta 40",
            "description": "Si se usa cuenta 20 (IGV por Pagar), generalmente requiere una cuenta 40 (Ingresos)",
            "account_patterns": ["20.*", "40.*"],
            "severity": "WARNING",
            "message": "Cuando se registra IGV (20.x), generalmente se debe registrar también un ingreso (40.x)"
        },
        {
            "rule_type": "SUGGESTION",
            "name": "Sugerencia: Pago a proveedor",
            "description": "Sugiere cuentas comunes para pagos a proveedores",
            "account_patterns": ["42.*"],
            "severity": "INFO",
            "message": "Para pagar a proveedores, considere usar: 10.x (Banco) o 12.x (Caja) en el debe",
            "suggested_accounts": ["10.*", "12.*"],
            "suggested_glosa": "Pago a proveedor"
        }
    ]

