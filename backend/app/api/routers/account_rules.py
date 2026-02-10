"""
Router para gestionar reglas de validación de cuentas contables
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel

from ...dependencies import get_db
from ...domain.models_account_rules import AccountValidationRule, AccountCompatibilityRule
from ...security.auth import get_current_user
from ...domain.models import User, Company
from ...domain.enums import UserRole

router = APIRouter(prefix="/account-rules", tags=["account-rules"])

# ===== DTOs =====

class AccountValidationRuleIn(BaseModel):
    company_id: int
    rule_type: str  # INCOMPATIBLE, REQUIRED_PAIR, SUGGESTION, WARNING
    name: str
    description: Optional[str] = None
    account_patterns: List[str]  # Lista de patrones de cuentas
    severity: str = "ERROR"  # ERROR, WARNING, INFO
    message: str
    suggested_accounts: Optional[List[str]] = None
    suggested_glosa: Optional[str] = None
    conditions: Optional[dict] = None
    active: bool = True

class AccountValidationRuleOut(BaseModel):
    id: int
    company_id: int
    rule_type: str
    name: str
    description: Optional[str]
    account_patterns: List[str]
    severity: str
    message: str
    suggested_accounts: Optional[List[str]]
    suggested_glosa: Optional[str]
    conditions: Optional[dict]
    active: bool
    
    class Config:
        from_attributes = True

class AccountCompatibilityRuleIn(BaseModel):
    company_id: int
    account_code_pattern: str
    compatible_with: List[str]
    confidence: float = 0.8
    active: bool = True

class AccountCompatibilityRuleOut(BaseModel):
    id: int
    company_id: int
    account_code_pattern: str
    compatible_with: List[str]
    confidence: float
    usage_count: int
    last_used: Optional[str]
    active: bool
    
    class Config:
        from_attributes = True

# ===== Endpoints =====

@router.get("/validation-rules", response_model=List[AccountValidationRuleOut])
def list_validation_rules(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista todas las reglas de validación de una empresa"""
    rules = db.query(AccountValidationRule).filter(
        AccountValidationRule.company_id == company_id
    ).all()
    return rules

@router.post("/validation-rules", response_model=AccountValidationRuleOut)
def create_validation_rule(
    payload: AccountValidationRuleIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Crea una nueva regla de validación"""
    if current_user.role not in (UserRole.ADMINISTRADOR, UserRole.CONTADOR):
        raise HTTPException(403, "No autorizado")
    
    rule = AccountValidationRule(
        company_id=payload.company_id,
        rule_type=payload.rule_type,
        name=payload.name,
        description=payload.description,
        account_patterns=payload.account_patterns,
        severity=payload.severity,
        message=payload.message,
        suggested_accounts=payload.suggested_accounts,
        suggested_glosa=payload.suggested_glosa,
        conditions=payload.conditions,
        active=payload.active
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule

@router.put("/validation-rules/{rule_id}", response_model=AccountValidationRuleOut)
def update_validation_rule(
    rule_id: int,
    payload: AccountValidationRuleIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Actualiza una regla de validación"""
    if current_user.role not in (UserRole.ADMINISTRADOR, UserRole.CONTADOR):
        raise HTTPException(403, "No autorizado")
    
    rule = db.query(AccountValidationRule).filter(AccountValidationRule.id == rule_id).first()
    if not rule:
        raise HTTPException(404, "Regla no encontrada")
    
    rule.rule_type = payload.rule_type
    rule.name = payload.name
    rule.description = payload.description
    rule.account_patterns = payload.account_patterns
    rule.severity = payload.severity
    rule.message = payload.message
    rule.suggested_accounts = payload.suggested_accounts
    rule.suggested_glosa = payload.suggested_glosa
    rule.conditions = payload.conditions
    rule.active = payload.active
    
    db.commit()
    db.refresh(rule)
    return rule

@router.delete("/validation-rules/{rule_id}")
def delete_validation_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Elimina una regla de validación"""
    if current_user.role not in (UserRole.ADMINISTRADOR, UserRole.CONTADOR):
        raise HTTPException(403, "No autorizado")
    
    rule = db.query(AccountValidationRule).filter(AccountValidationRule.id == rule_id).first()
    if not rule:
        raise HTTPException(404, "Regla no encontrada")
    
    db.delete(rule)
    db.commit()
    return {"success": True}

@router.post("/validation-rules/load-defaults")
def load_default_rules(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Carga reglas predeterminadas para una empresa"""
    if current_user.role not in (UserRole.ADMINISTRADOR, UserRole.CONTADOR):
        raise HTTPException(403, "No autorizado")
    
    from ...application.services_account_rules import get_default_rules
    
    default_rules = get_default_rules()
    created_count = 0
    
    for rule_data in default_rules:
        # Verificar si ya existe una regla similar
        existing = db.query(AccountValidationRule).filter(
            AccountValidationRule.company_id == company_id,
            AccountValidationRule.name == rule_data["name"]
        ).first()
        
        if not existing:
            rule = AccountValidationRule(
                company_id=company_id,
                rule_type=rule_data["rule_type"],
                name=rule_data["name"],
                description=rule_data.get("description"),
                account_patterns=rule_data["account_patterns"],
                severity=rule_data["severity"],
                message=rule_data["message"],
                suggested_accounts=rule_data.get("suggested_accounts"),
                suggested_glosa=rule_data.get("suggested_glosa"),
                active=True
            )
            db.add(rule)
            created_count += 1
    
    db.commit()
    return {"success": True, "created_count": created_count}

@router.get("/compatibility-rules", response_model=List[AccountCompatibilityRuleOut])
def list_compatibility_rules(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista reglas de compatibilidad de cuentas"""
    rules = db.query(AccountCompatibilityRule).filter(
        AccountCompatibilityRule.company_id == company_id
    ).all()
    return rules

