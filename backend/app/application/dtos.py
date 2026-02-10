from pydantic import BaseModel, Field, constr
from typing import List, Optional, Dict, Any
from datetime import date

class AccountIn(BaseModel):
    company_id: int = Field(..., description="ID de la empresa")
    code: constr(strip_whitespace=True, min_length=1) = ""
    name: str
    level: int = 4
    type: str
    class_code: Optional[str] = None  # Clase PCGE (ej: "10", "40")
    class_name: Optional[str] = None  # Nombre de clase (ej: "Caja y Bancos", "Tributos")

class AccountUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    level: Optional[int] = None
    type: Optional[str] = None
    class_code: Optional[str] = None
    class_name: Optional[str] = None
    active: Optional[bool] = None

class AccountOut(BaseModel):
    id: int
    company_id: int
    code: str
    name: str
    level: int
    type: str
    class_code: Optional[str] = None
    class_name: Optional[str] = None
    active: bool
    is_base: bool = False  # Indica si es una cuenta base del plan_base.csv (no se puede eliminar)

class EntryLineIn(BaseModel):
    account_code: str
    third_party_id: Optional[int] = None
    cost_center: Optional[str] = None
    debit: float = 0.0
    credit: float = 0.0
    memo: Optional[str] = None

class JournalEntryIn(BaseModel):
    company_id: int
    date: date
    glosa: str = ""  # Descripción del asiento (obligatorio en Perú)
    currency: str = "PEN"
    exchange_rate: float = 1.0
    origin: str = "MANUAL"
    lines: List[EntryLineIn]
    tipo: Optional[str] = None  # ej: "compra_igv" para usar plantilla

class EntryLineOut(BaseModel):
    id: int
    account_code: str
    account_name: str
    debit: float
    credit: float
    memo: Optional[str] = None
    third_party_id: Optional[int] = None
    cost_center: Optional[str] = None

class JournalEntryOut(BaseModel):
    id: int
    company_id: int
    date: date
    glosa: str
    currency: str
    origin: str
    status: str
    total_debit: float
    total_credit: float
    period_id: Optional[int] = None  # Agregado para filtrado en frontend
    correlative: Optional[str] = None  # Correlativo estructurado: XX-XX-XXXXX
    reversed_entry_id: Optional[int] = None  # ID del asiento de reversión (si fue revertido)
    motor_metadata: Optional[Dict[str, Any]] = None  # Metadatos del motor de asientos (incluye engine_log)

class JournalEntryDetailOut(JournalEntryOut):
    period_id: int
    period_year: int
    period_month: int
    exchange_rate: float
    lines: List[EntryLineOut]
    # Trazabilidad (auditoría)
    created_by_id: Optional[int] = None
    created_by_name: Optional[str] = None
    created_at: Optional[str] = None
    updated_by_id: Optional[int] = None
    updated_by_name: Optional[str] = None
    updated_at: Optional[str] = None
    posted_by_id: Optional[int] = None
    posted_by_name: Optional[str] = None
    posted_at: Optional[str] = None
    reversed_by_id: Optional[int] = None
    reversed_by_name: Optional[str] = None
    reversed_at: Optional[str] = None
    integrity_hash: Optional[str] = None

class TrialBalanceRow(BaseModel):
    account_code: str
    name: str
    debit: float
    credit: float
    balance: float

class LedgerRow(BaseModel):
    entry_id: int
    date: date
    account_code: str
    debit: float
    credit: float
    memo: str | None = None
