from sqlalchemy.orm import Session
from ..domain.models import Account, JournalEntry, EntryLine, ThirdParty, Period, Company

class AccountRepository:
    def __init__(self, db: Session): self.db = db
    def add(self, acc: Account): self.db.add(acc); return acc
    def by_code(self, company_id:int, code:str): 
        return self.db.query(Account).filter(Account.company_id==company_id, Account.code==code).first()
    def list(self, company_id:int): 
        return self.db.query(Account).filter(Account.company_id==company_id).order_by(Account.code).all()

class JournalRepository:
    def __init__(self, db: Session): self.db = db
    def add_entry(self, e: JournalEntry): self.db.add(e); return e
    def get(self, id:int): return self.db.get(JournalEntry, id)

class CompanyRepository:
    def __init__(self, db: Session): self.db = db
    def first_or_create(self, name:str="Demo Company"):
        c = self.db.query(Company).filter_by(name=name).first()
        if not c:
            c = Company(name=name, ruc="00000000000")
            self.db.add(c); self.db.flush()
        return c

class PeriodRepository:
    def __init__(self, db: Session): self.db = db
    def get_or_open(self, company_id:int, year:int, month:int):
        p = self.db.query(Period).filter_by(company_id=company_id, year=year, month=month).first()
        if not p:
            p = Period(company_id=company_id, year=year, month=month, status="ABIERTO")
            self.db.add(p); self.db.flush()
        return p
