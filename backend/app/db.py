import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from .config import settings

os.makedirs("./data", exist_ok=True)

engine = create_engine(settings.database_url, echo=False, future=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)
Base = declarative_base()


def _import_all_models():
    """Importa todos los modelos para que Base.metadata los registre."""
    from .domain import models  # noqa: F401 - user_companies, Company, User, Role, RolePermission, Account, etc.
    from .domain import models_ext  # noqa: F401 - CostCenter, Purchase, Sale, Product, etc.
    from .domain import models_documents_v2  # noqa: F401 - Document, DocumentExtractedData, etc.
    from .domain import models_inventario  # noqa: F401 - Almacen, Stock
    from .domain import models_tesoreria  # noqa: F401 - MovimientoTesoreria, MetodoPago
    from .domain import models_account_rules  # noqa: F401
    from .domain import models_journal_engine  # noqa: F401
    from .domain import models_sire  # noqa: F401
    from .domain import models_notas  # noqa: F401
    from .domain import models_aplicaciones  # noqa: F401
    from .domain import models_payments  # noqa: F401
    from .domain import models_mailbox  # noqa: F401 - ElectronicMailbox, MailboxMessage, etc.
    from .domain import models_audit  # noqa: F401 - AuditLog (auditoría global ERP)


def init_db():
    """Crear tablas si no existen (arranque normal)."""
    _import_all_models()
    Base.metadata.create_all(bind=engine)


def recreate_schema_from_models():
    """Elimina todas las tablas y las recrea desde los modelos. Usar para iniciar como sistema nuevo."""
    _import_all_models()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
