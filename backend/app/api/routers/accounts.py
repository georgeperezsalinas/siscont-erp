from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ...dependencies import get_db
from ...domain.models import Account
from ...domain.enums import AccountType
from ...application.dtos import AccountIn, AccountOut, AccountUpdate

router = APIRouter(prefix="/accounts", tags=["accounts"])

# Helper para extraer class_code del código
def _extract_class_code(code: str) -> str | None:
    parts = code.split('.')
    return parts[0] if parts else None

# Mapeo de códigos de clase a nombres
CLASS_NAMES = {
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

@router.post("", response_model=AccountOut)
def create_account(payload: AccountIn, db: Session = Depends(get_db)):
    from ...infrastructure.repositories import AccountRepository
    repo = AccountRepository(db)
    if repo.by_code(payload.company_id, payload.code):
        raise HTTPException(400, detail="La cuenta ya existe")
    
    # Calcular class_code y class_name si no se proporcionan
    class_code = payload.class_code
    class_name = payload.class_name
    if not class_code:
        class_code = _extract_class_code(payload.code)
        if class_code and not class_name:
            class_name = CLASS_NAMES.get(class_code)
    
    acc = Account(
        company_id=payload.company_id,
        code=payload.code,
        name=payload.name,
        level=payload.level,
        type=AccountType(payload.type),
        class_code=class_code,
        class_name=class_name
    )
    repo.add(acc)
    db.commit()
    db.refresh(acc)
    from ...application.plan_base_protected import is_base_account
    return AccountOut(
        id=acc.id,
        company_id=acc.company_id,
        code=acc.code,
        name=acc.name,
        level=acc.level,
        type=acc.type.value,
        class_code=acc.class_code,
        class_name=acc.class_name,
        active=acc.active,
        is_base=is_base_account(acc.code)
    )

@router.get("", response_model=list[AccountOut])
def list_accounts(company_id:int, db: Session = Depends(get_db)):
    from ...infrastructure.repositories import AccountRepository
    from ...application.plan_base_protected import is_base_account
    repo = AccountRepository(db)
    rows = repo.list(company_id)
    return [
        AccountOut(
            id=a.id,
            company_id=a.company_id,
            code=a.code,
            name=a.name,
            level=a.level,
            type=a.type.value,
            class_code=a.class_code,
            class_name=a.class_name,
            active=a.active,
            is_base=is_base_account(a.code)  # Agregar flag is_base
        ) for a in rows
    ]

@router.patch("/{account_id}", response_model=AccountOut)
def update_account(account_id: int, payload: AccountUpdate, db: Session = Depends(get_db)):
    acc = db.get(Account, account_id)
    if not acc:
        raise HTTPException(404, detail="Cuenta no encontrada")
    
    # Si se actualiza el código, recalcular class_code y class_name
    code_changed = False
    if payload.code is not None:
        # Verificar que el código no esté duplicado en la misma empresa
        existing = db.query(Account).filter(Account.company_id == acc.company_id, Account.code == payload.code, Account.id != account_id).first()
        if existing:
            raise HTTPException(400, detail="El código de cuenta ya existe")
        acc.code = payload.code
        code_changed = True
    
    if payload.name is not None:
        acc.name = payload.name
    if payload.level is not None:
        acc.level = payload.level
    if payload.type is not None:
        acc.type = AccountType(payload.type)
    if payload.class_code is not None:
        acc.class_code = payload.class_code
    if payload.class_name is not None:
        acc.class_name = payload.class_name
    if payload.active is not None:
        acc.active = payload.active
    
    # Si cambió el código y no se proporcionaron class_code/class_name, calcularlos
    if code_changed and payload.class_code is None:
        new_class_code = _extract_class_code(acc.code)
        if new_class_code:
            acc.class_code = new_class_code
            if payload.class_name is None:
                acc.class_name = CLASS_NAMES.get(new_class_code)
    
    db.commit()
    db.refresh(acc)
    from ...application.plan_base_protected import is_base_account
    return AccountOut(
        id=acc.id,
        company_id=acc.company_id,
        code=acc.code,
        name=acc.name,
        level=acc.level,
        type=acc.type.value,
        class_code=acc.class_code,
        class_name=acc.class_name,
        active=acc.active,
        is_base=is_base_account(acc.code)
    )

@router.delete("/{account_id}", status_code=204)
def delete_account(account_id: int, db: Session = Depends(get_db)):
    from ...application.plan_base_protected import can_delete_account
    
    acc = db.get(Account, account_id)
    if not acc:
        raise HTTPException(404, detail="Cuenta no encontrada")
    
    # Verificar si es una cuenta base (del plan_base.csv)
    puede_eliminar, mensaje_error = can_delete_account(acc.code)
    if not puede_eliminar:
        raise HTTPException(400, detail=mensaje_error)
    
    # Verificar si la cuenta tiene movimientos (asientos contables)
    from ...domain.models import EntryLine
    tiene_movimientos = db.query(EntryLine).filter(EntryLine.account_id == account_id).first()
    if tiene_movimientos:
        raise HTTPException(400, detail=f"La cuenta {acc.code} tiene movimientos contables y no puede ser eliminada. Solo puede desactivarse.")
    
    db.delete(acc)
    db.commit()
    return
