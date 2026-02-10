from datetime import date
from sqlalchemy.orm import Session
from decimal import Decimal
from ..domain.models_ext import Purchase, Sale

def _period_bounds(period:str):
    y, m = map(int, period.split('-'))
    from calendar import monthrange
    first = date(y, m, 1)
    last = date(y, m, monthrange(y, m)[1])
    return first, last

def ple_compras(db:Session, company_id:int, period:str)->list[list[str]]:
    ini, fin = _period_bounds(period)
    rows = db.query(Purchase).filter(Purchase.company_id==company_id, Purchase.issue_date>=ini, Purchase.issue_date<=fin).order_by(Purchase.issue_date).all()
    out = []
    for i, p in enumerate(rows, start=1):
        # Estructura muy simplificada del 8.1 (no oficial)
        out.append([
            period.replace('-',''),            # Periodo
            str(i).zfill(10),                 # Correlativo
            p.issue_date.isoformat(),         # Fecha
            p.doc_type,                       # Tipo comprobante
            f"{p.series}-{p.number}",        # Serie-Número
            str(p.supplier_id),               # RUC/DNI proveedor (placeholder)
            f"{float(p.base_amount):.2f}",   # Base
            f"{float(p.igv_amount):.2f}",    # IGV
            f"{float(p.total_amount):.2f}",  # Total
        ])
    return out

def ple_ventas(db:Session, company_id:int, period:str)->list[list[str]]:
    ini, fin = _period_bounds(period)
    rows = db.query(Sale).filter(Sale.company_id==company_id, Sale.issue_date>=ini, Sale.issue_date<=fin).order_by(Sale.issue_date).all()
    out = []
    for i, s in enumerate(rows, start=1):
        out.append([
            period.replace('-',''),
            str(i).zfill(10),
            s.issue_date.isoformat(),
            s.doc_type,
            f"{s.series}-{s.number}",
            str(s.customer_id),               # RUC/DNI cliente (placeholder)
            f"{float(s.base_amount):.2f}",
            f"{float(s.igv_amount):.2f}",
            f"{float(s.total_amount):.2f}",
        ])
    return out
