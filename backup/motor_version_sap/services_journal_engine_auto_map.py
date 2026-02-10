# services_journal_engine_auto_map_SAP.py
# VERSION SAP – Auto-map seguro (sin último recurso)

from sqlalchemy.orm import Session
from typing import Optional
from ..domain.models import Account
from ..domain.models_journal_engine import TipoCuentaMapeo
from ..domain.enums import AccountType

def buscar_cuenta_por_tipo(db: Session, company_id: int, tipo_cuenta: str) -> Optional[Account]:
    # SAP_RULE: solo match explícito por nombre/código confiable.
    accounts = db.query(Account).filter_by(company_id=company_id, active=True).all()
    tipo = (tipo_cuenta or "").upper().strip()

    keywords = {
        "IGV_CREDITO": ["igv crédito", "crédito fiscal"],
        "IGV_DEBITO": ["igv débito", "igv por pagar"],
    }

    for acc in accounts:
        for kw in keywords.get(tipo, []):
            if kw in (acc.name or "").lower():
                return acc
    return None
