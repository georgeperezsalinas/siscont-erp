"""
Seed de datos demo para iniciar el sistema desde cero.

Crea:
- Empresa Demo
- Plan de cuentas (plan_base.csv)
- Motor de asientos (eventos, reglas, mapeos desde CSV)
- Periodo contable del año actual
"""
from datetime import date
from pathlib import Path
from sqlalchemy.orm import Session
from ..domain.models import Company, Period, User, Role
from ..security.auth import get_password_hash
from ..infrastructure.unit_of_work import UnitOfWork
from .services import load_plan_base_csv
from .services_motor_base import load_motor_base_csv
from .services_tesoreria_init import inicializar_metodos_pago_predeterminados

DEMO_COMPANY_NAME = "Empresa Demo"
DEMO_COMPANY_RUC = "20123456789"


def seed_demo_data(db: Session, admin_user: str = "admin", admin_pass: str = "admin") -> dict:
    """
    Crea datos demo: empresa, plan, motor, periodo.
    Si ya existe empresa demo, no duplica.
    """
    from ..domain.models import RolePermission
    from ..api.routers.permissions import AVAILABLE_PERMISSIONS

    result = {"company": None, "period": None, "plan_loaded": False, "motor_loaded": False, "roles": False}

    # Roles y usuario admin (si no existen)
    admin_role = db.query(Role).filter(Role.name == "ADMINISTRADOR").first()
    if not admin_role:
        admin_role = Role(
            name="ADMINISTRADOR",
            description="Administrador del sistema",
            active=True,
            is_system=True,
        )
        db.add(admin_role)
        db.flush()
        for perm in AVAILABLE_PERMISSIONS:
            db.add(RolePermission(role_id=admin_role.id, permission=perm))
        result["roles"] = True

    admin = db.query(User).filter(User.username == admin_user).first()
    if not admin:
        admin = User(
            username=admin_user,
            password_hash=get_password_hash(admin_pass),
            is_admin=True,
            role="ADMINISTRADOR",
            role_id=admin_role.id,
        )
        db.add(admin)
        db.flush()

    # Empresa Demo
    company = db.query(Company).filter(Company.name == DEMO_COMPANY_NAME).first()
    if not company:
        company = Company(
            name=DEMO_COMPANY_NAME,
            ruc=DEMO_COMPANY_RUC,
            commercial_name="Demo S.A.C.",
            taxpayer_type="Persona Jurídica",
            fiscal_address="Av. Ejemplo 123",
            tax_regime="Régimen General",
            active=True,
        )
        db.add(company)
        db.flush()
        result["company"] = {"id": company.id, "name": company.name}

    # Plan de cuentas
    try:
        uow = UnitOfWork(db)
        r = load_plan_base_csv(uow, company.id, replace_all=False)
        result["plan_loaded"] = True
        result["plan_created"] = r.get("created", 0)
    except FileNotFoundError:
        pass  # plan_base.csv no existe
    except Exception as e:
        import logging
        logging.warning(f"Seed: No se pudo cargar plan_base: {e}")

    # Motor de asientos (eventos, reglas, mapeos)
    try:
        r = load_motor_base_csv(db, company.id)
        result["motor_loaded"] = True
        result["motor_eventos"] = r.get("eventos_creados", 0)
        result["motor_reglas"] = r.get("reglas_creadas", 0)
        result["motor_mapeos"] = r.get("mapeos_creados", 0)
    except FileNotFoundError:
        pass  # CSV del motor no existen
    except Exception as e:
        import logging
        logging.warning(f"Seed: No se pudo cargar motor base: {e}")

    # Periodo actual
    today = date.today()
    period = db.query(Period).filter(
        Period.company_id == company.id,
        Period.year == today.year,
        Period.month == today.month,
    ).first()
    if not period:
        period = Period(
            company_id=company.id,
            year=today.year,
            month=today.month,
            status="ABIERTO",
        )
        db.add(period)
        db.flush()
        result["period"] = {"id": period.id, "year": period.year, "month": period.month}

    # Métodos de pago (tesorería)
    try:
        inicializar_metodos_pago_predeterminados(db, company.id)
    except Exception as e:
        import logging
        logging.warning(f"Seed: No se pudieron inicializar métodos de pago: {e}")

    return result
