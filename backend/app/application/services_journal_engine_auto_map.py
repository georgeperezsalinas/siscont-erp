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

# ==========================
# FUNCIONES DE COMPATIBILIDAD (SAP SAFE)
# ==========================

def buscar_cuenta_con_score(db, company_id: int, tipo_cuenta: str):
    """
    SAP SAFE:
    - Devuelve (None, 0)
    - No decide, no auto-mapea
    - Mantiene compatibilidad con routers existentes
    """
    return None


def mapear_automaticamente_todos(db, company_id: int):
    """
    SAP SAFE:
    - En modo SAP_STRICT no se hace auto-mapeo masivo
    - Devuelve resultado vacío para compatibilidad
    """
    return {
        "mapeados": 0,
        "no_encontrados": [],
        "ya_existian": 0,
        "creados": 0,
    }


def sugerir_cuenta_para_tipo(db, company_id: int, tipo_cuenta: str):
    """
    SAP SAFE:
    - Devuelve lista vacía
    - La UI no recibe sugerencias automáticas
    """
    return []
