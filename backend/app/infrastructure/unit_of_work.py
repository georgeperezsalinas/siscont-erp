from contextlib import contextmanager
from sqlalchemy.orm import Session
from ..db import SessionLocal
from .repositories import AccountRepository, JournalRepository, CompanyRepository, PeriodRepository

class UnitOfWork:
    def __init__(self, db: Session = None):
        self.db: Session = db if db is not None else SessionLocal()
        self.accounts = AccountRepository(self.db)
        self.journal = JournalRepository(self.db)
        self.companies = CompanyRepository(self.db)
        self.periods = PeriodRepository(self.db)

    def commit(self): self.db.commit()
    def rollback(self): self.db.rollback()
    def close(self): self.db.close()

    @contextmanager
    def transaction(self):
        try:
            yield self
            self.commit()
        except:
            self.rollback()
            raise
        finally:
            self.close()
