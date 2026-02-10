from fastapi import APIRouter, HTTPException, Depends, Query, Body, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import delete, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker
from datetime import date, datetime, timedelta
from decimal import Decimal
from pydantic import BaseModel, Field
import csv
import random
import logging
import traceback
import subprocess
import os
import time
from pathlib import Path
from ...dependencies import get_db
from ...security.auth import get_current_user, get_current_user_optional
from ...config import settings

logger = logging.getLogger(__name__)

# Ruta base para dumps de BD (project root / db)
DB_DUMPS_DIR = Path(__file__).resolve().parents[4] / "db"
BACKEND_ROOT = Path(__file__).resolve().parents[3]
ENV_FILE = BACKEND_ROOT / ".env"

router = APIRouter(prefix="/setup", tags=["setup"])


class FirstTimeSetupIn(BaseModel):
    """Parámetros para configuración inicial del sistema."""
    db_host: str = Field(..., min_length=1, description="Host de PostgreSQL")
    db_port: int = Field(5432, ge=1, le=65535)
    db_user: str = Field(..., min_length=1)
    db_password: str = Field(..., min_length=1)
    db_name: str = Field(..., min_length=1)
    admin_user: str = Field(..., min_length=2, max_length=50)
    admin_pass: str = Field(..., min_length=4)


@router.get("/suggested-config")
def get_suggested_config():
    """
    Devuelve valores sugeridos para el wizard de configuración inicial,
    extraídos del .env actual. No incluye contraseñas por seguridad.
    No requiere autenticación.
    """
    try:
        from urllib.parse import urlparse
        u = urlparse(settings.database_url)
        if u.scheme and "postgresql" in u.scheme:
            return {
                "db_host": u.hostname or "localhost",
                "db_port": u.port or 5432,
                "db_user": u.username or "",
                "db_name": (u.path or "").lstrip("/") or "siscont",
                "admin_user": settings.admin_user or "admin",
            }
    except Exception:
        pass
    return {
        "db_host": "localhost",
        "db_port": 5432,
        "db_user": "",
        "db_name": "siscont",
        "admin_user": settings.admin_user or "admin",
    }


@router.get("/status")
def setup_status():
    """
    Indica si se requiere configuración inicial.
    No requiere autenticación. setup_required=True cuando:
    - No hay conexión a la BD, o
    - La BD está vacía (0 usuarios).
    """
    try:
        from ...db import engine
        with engine.connect() as conn:
            result = conn.execute(text("SELECT COUNT(*) FROM users"))
            count = result.scalar() or 0
        return {
            "setup_required": count == 0,
            "reason": "no_users" if count == 0 else None,
        }
    except Exception as e:
        logger.debug("Setup status check: %s", e)
        return {"setup_required": True, "reason": "no_connection"}


@router.post("/first-time-setup")
def first_time_setup(payload: FirstTimeSetupIn = Body(...)):
    """
    Configuración inicial: crea la BD desde modelos y el usuario admin.
    Solo funciona cuando setup_required=True. Escribe .env con los parámetros.
    Requiere reiniciar el backend para que cargue la nueva configuración.
    """
    database_url = f"postgresql+psycopg://{payload.db_user}:{payload.db_password}@{payload.db_host}:{payload.db_port}/{payload.db_name}"

    try:
        from ...db import Base, _import_all_models, SessionLocal
        from ...domain.models import User, Role
        from ...security.auth import get_password_hash

        _import_all_models()
        engine_new = create_engine(database_url, echo=False, future=True)
        Base.metadata.drop_all(bind=engine_new)
        Base.metadata.create_all(bind=engine_new)

        SessionNew = sessionmaker(bind=engine_new, autocommit=False, autoflush=False, future=True)
        db = SessionNew()
        try:
            from ...domain.models import RolePermission
            from ...api.routers.permissions import AVAILABLE_PERMISSIONS

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

            admin_user = User(
                username=payload.admin_user,
                password_hash=get_password_hash(payload.admin_pass),
                is_admin=True,
                role="ADMINISTRADOR",
                role_id=admin_role.id,
            )
            db.add(admin_user)
            db.flush()

            # Seed demo: empresa, plan, motor, periodo
            from ...application.seed_demo import seed_demo_data
            try:
                seed_demo_data(db, admin_user=payload.admin_user, admin_pass=payload.admin_pass)
            except Exception as se:
                logger.warning("Seed demo no aplicado: %s", se)
            db.commit()
        finally:
            db.close()

        # Escribir .env
        _update_env_file(
            database_url=database_url,
            admin_user=payload.admin_user,
            admin_pass=payload.admin_pass,
        )

        return {
            "message": "Configuración completada. Reinicia el backend y recarga la página para iniciar sesión.",
            "admin_user": payload.admin_user,
            "restart_required": True,
        }
    except Exception as e:
        logger.exception("Error en first-time-setup: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


def _update_env_file(database_url: str, admin_user: str, admin_pass: str):
    """Actualiza o crea .env con las variables de conexión y admin."""
    env_path = ENV_FILE
    lines = []
    if env_path.exists():
        lines = env_path.read_text(encoding="utf-8").splitlines()
    updates = {"DATABASE_URL": database_url, "ADMIN_USER": admin_user, "ADMIN_PASS": admin_pass}
    new_lines = []
    replaced = set()
    for line in lines:
        for key in updates:
            if line.strip().startswith(f"{key}="):
                new_lines.append(f"{key}={updates[key]}")
                replaced.add(key)
                break
        else:
            new_lines.append(line)
    for key in updates:
        if key not in replaced:
            new_lines.append(f"{key}={updates[key]}")
    env_path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")


from ...domain.models import (
    Account, JournalEntry, EntryLine, Period, Company, ThirdParty,
    BankAccount, BankStatement, BankTransaction, BankReconciliation
)
from ...domain.models_ext import Purchase, Sale, Product, InventoryMovement, PurchaseLine, SaleLine
from ...domain.models_tesoreria import MovimientoTesoreria
from ...domain.models_payments import PaymentTransaction
from ...domain.models_inventario import Almacen, Stock
from ...domain.models_notas import NotaDocumento, NotaDetalle
from ...domain.enums import AccountType
from ...infrastructure.unit_of_work import UnitOfWork
from ...application.services import ensure_accounts_for_demo, post_journal_entry, load_plan_base_csv
from ...application.services_integration import registrar_compra_con_asiento, registrar_venta_con_asiento
from ...application.dtos import JournalEntryIn, EntryLineIn

@router.post("/seed-pcge")
def seed_pcge(
    company_id: int = Query(..., description="ID de la empresa"),
    replace_all: bool = Query(False, description="Eliminar todas las cuentas existentes antes de cargar"),
    db: Session = Depends(get_db)
):
    """
    Sembrar Plan Contable General Empresarial (PCGE) completo desde plan_base.csv.
    
    Este endpoint carga el plan de cuentas base completo con todas las cuentas
    del PCGE 2019, incluyendo class_code y class_name para agrupación.
    
    Si replace_all=True, elimina TODAS las cuentas existentes antes de cargar.
    ⚠️ ADVERTENCIA: Esto eliminará todas las cuentas personalizadas y solo dejará las del plan_base.csv.
    
    Usa load_plan_base_csv que carga desde backend/data/plan_base.csv.
    """
    uow = UnitOfWork(db)
    try:
        result = load_plan_base_csv(uow, company_id, replace_all=replace_all)
        uow.commit()
        return {
            "created": result["created"],
            "deleted": result.get("deleted", 0),
            "failed_deletions": result.get("failed_deletions", [])
        }
    except ValueError as e:
        uow.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError as e:
        uow.rollback()
        raise HTTPException(status_code=500, detail=f"Archivo plan_base.csv no encontrado: {str(e)}")
    except Exception as e:
        uow.rollback()
        raise HTTPException(status_code=500, detail=f"Error al sembrar PCGE: {str(e)}")
    finally:
        uow.close()

@router.post("/ensure-basic-accounts")
def ensure_basic_accounts(
    company_id: int = Query(..., description="ID de la empresa"),
    replace_all: bool = Query(False, description="Eliminar todas las cuentas existentes antes de cargar"),
    db: Session = Depends(get_db)
):
    """
    Asegura que las cuentas básicas necesarias para el sistema existan para una empresa.
    Útil cuando una empresa no tiene cuentas pero necesita usar el sistema.
    Crea las siguientes cuentas esenciales:
    - 10.10 (Caja), 10.20 (Bancos), 10.21 (Banco Nacional), 10.22 (Banco Extranjero)
    - 12.1, 12.10 (Clientes), 12.20 (Detracciones por Cobrar)
    - 20.10 (Mercaderías)
    - 40.10 (IGV Débito), 40.11 (IGV Crédito)
    - 42.10 (Proveedores)
    - 60.11 (Gasto de compras), 69.10 (Costo de Ventas), 70.10 (Ventas)
    
    Si replace_all=True, elimina TODAS las cuentas existentes antes de cargar.
    ⚠️ ADVERTENCIA: Esto eliminará todas las cuentas personalizadas y solo dejará las cuentas básicas.
    
    Todas las cuentas se crean con class_code y class_name según PCGE.
    """
    uow = UnitOfWork(db)
    accounts_before = 0
    try:
        # Contar cuentas antes
        accounts_before = len(uow.accounts.list(company_id))
        
        # Crear cuentas básicas (con opción de reemplazar todas)
        ensure_accounts_for_demo(uow, company_id, replace_all=replace_all)
        uow.commit()
        
        # Contar cuentas después
        accounts_after = len(uow.accounts.list(company_id))
        accounts_created = accounts_after - accounts_before
        
        return {
            "message": "Cuentas básicas aseguradas" if accounts_created > 0 else "Todas las cuentas básicas ya existen",
            "company_id": company_id,
            "accounts_created": accounts_created,
            "total_accounts": accounts_after,
            "deleted": accounts_before - (accounts_after - accounts_created) if replace_all else 0
        }
    except ValueError as e:
        uow.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        uow.rollback()
        raise HTTPException(status_code=500, detail=f"Error al crear cuentas básicas: {str(e)}")
    finally:
        uow.close()

@router.post("/cleanup-data")
def cleanup_accounting_data(
    company_id: int = Query(..., description="ID de la empresa"),
    keep_companies: bool = Query(True, description="Mantener empresas, usuarios, cuentas y períodos"),
    keep_third_parties: bool = Query(True, description="Mantener terceros (proveedores/clientes)"),
    keep_products: bool = Query(False, description="Mantener productos"),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Limpia toda la data contable y operaciones de una empresa.
    
    Por defecto elimina:
    - Asientos contables y sus líneas
    - Líneas de compras y compras
    - Líneas de ventas y ventas
    - Movimientos de tesorería
    - Transacciones de pago (legacy)
    - Movimientos de inventario
    - Conciliaciones bancarias
    
    Opcionalmente puede eliminar:
    - Terceros (proveedores/clientes)
    - Productos, almacenes y stocks (si no se mantienen productos)
    
    NO elimina:
    - Empresas, usuarios, cuentas contables, períodos (por defecto)
    - Configuración del motor de asientos (eventos, reglas, mapeos)
    """
    if not current_user.is_admin and current_user.role != "ADMINISTRADOR":
        raise HTTPException(status_code=403, detail="Solo administradores pueden limpiar datos")
    
    counts = {
        "entry_lines": 0,
        "journal_entries": 0,
        "purchase_lines": 0,
        "purchases": 0,
        "sale_lines": 0,
        "sales": 0,
        "movimientos_tesoreria": 0,
        "payment_transactions": 0,
        "inventory_movements": 0,
        "stocks": 0,
        "almacenes": 0,
        "products": 0,
        "third_parties": 0,
        "bank_reconciliations": 0,
        "bank_transactions": 0,
        "bank_statements": 0,
        "bank_accounts": 0,
        "nota_detalles": 0,
        "nota_documentos": 0,
    }
    
    try:
        # 1. Eliminar transacciones bancarias PRIMERO (referencian entry_lines)
        bank_account_ids = db.query(BankAccount.id).filter(BankAccount.company_id == company_id).all()
        bank_account_ids = [row[0] for row in bank_account_ids]
        
        if bank_account_ids:
            statement_ids = db.query(BankStatement.id).filter(
                BankStatement.bank_account_id.in_(bank_account_ids)
            ).all()
            statement_ids = [row[0] for row in statement_ids]
            
            if statement_ids:
                # Eliminar transacciones bancarias que referencian entry_lines
                counts["bank_transactions"] = db.execute(
                    delete(BankTransaction).where(BankTransaction.statement_id.in_(statement_ids))
                ).rowcount
        
        # 2. Eliminar notas de crédito/débito (referencian journal_entries)
        # Primero eliminar detalles de notas
        counts["nota_detalles"] = db.execute(
            delete(NotaDetalle).where(
                NotaDetalle.nota_id.in_(
                    db.query(NotaDocumento.id).filter(NotaDocumento.company_id == company_id)
                )
            )
        ).rowcount
        
        # Luego eliminar notas
        counts["nota_documentos"] = db.execute(
            delete(NotaDocumento).where(NotaDocumento.company_id == company_id)
        ).rowcount
        
        # 3. Eliminar líneas de asientos (debe ir antes que asientos por foreign key)
        counts["entry_lines"] = db.execute(
            delete(EntryLine).where(
                EntryLine.entry_id.in_(
                    db.query(JournalEntry.id).filter(JournalEntry.company_id == company_id)
                )
            )
        ).rowcount
        
        # 4. Eliminar asientos contables
        counts["journal_entries"] = db.execute(
            delete(JournalEntry).where(JournalEntry.company_id == company_id)
        ).rowcount
        
        # 5. Eliminar líneas de compras (antes de eliminar compras por foreign key)
        counts["purchase_lines"] = db.execute(
            delete(PurchaseLine).where(
                PurchaseLine.purchase_id.in_(
                    db.query(Purchase.id).filter(Purchase.company_id == company_id)
                )
            )
        ).rowcount
        
        # 6. Eliminar compras
        counts["purchases"] = db.execute(
            delete(Purchase).where(Purchase.company_id == company_id)
        ).rowcount
        
        # 7. Eliminar líneas de ventas (antes de eliminar ventas por foreign key)
        counts["sale_lines"] = db.execute(
            delete(SaleLine).where(
                SaleLine.sale_id.in_(
                    db.query(Sale.id).filter(Sale.company_id == company_id)
                )
            )
        ).rowcount
        
        # 8. Eliminar ventas
        counts["sales"] = db.execute(
            delete(Sale).where(Sale.company_id == company_id)
        ).rowcount
        
        # 9. Eliminar movimientos de tesorería
        counts["movimientos_tesoreria"] = db.execute(
            delete(MovimientoTesoreria).where(MovimientoTesoreria.company_id == company_id)
        ).rowcount
        
        # 10. Eliminar transacciones de pago legacy
        counts["payment_transactions"] = db.execute(
            delete(PaymentTransaction).where(PaymentTransaction.company_id == company_id)
        ).rowcount
        
        # 11. Eliminar movimientos de inventario
        counts["inventory_movements"] = db.execute(
            delete(InventoryMovement).where(InventoryMovement.company_id == company_id)
        ).rowcount
        
        # 12. Eliminar conciliaciones bancarias (bank_transactions ya fue eliminado arriba)
        if bank_account_ids:
            # Eliminar reconciliaciones PRIMERO (referencian bank_statements)
            counts["bank_reconciliations"] = db.execute(
                delete(BankReconciliation).where(BankReconciliation.bank_account_id.in_(bank_account_ids))
            ).rowcount
            
            # Eliminar extractos bancarios (después de reconciliaciones)
            counts["bank_statements"] = db.execute(
                delete(BankStatement).where(BankStatement.bank_account_id.in_(bank_account_ids))
            ).rowcount
            
            # Eliminar cuentas bancarias
            counts["bank_accounts"] = db.execute(
                delete(BankAccount).where(BankAccount.company_id == company_id)
            ).rowcount
        
        # 13. Opcional: Eliminar productos y datos relacionados
        if not keep_products:
            # Eliminar stocks (antes de productos por foreign key)
            counts["stocks"] = db.execute(
                delete(Stock).where(Stock.company_id == company_id)
            ).rowcount
            
            # Eliminar almacenes (antes de productos por foreign key en movimientos)
            counts["almacenes"] = db.execute(
                delete(Almacen).where(Almacen.company_id == company_id)
            ).rowcount
            
            # Eliminar productos
            counts["products"] = db.execute(
                delete(Product).where(Product.company_id == company_id)
            ).rowcount
        
        # 14. Opcional: Eliminar terceros
        if not keep_third_parties:
            counts["third_parties"] = db.execute(
                delete(ThirdParty).where(ThirdParty.company_id == company_id)
            ).rowcount
        
        db.commit()
        
        return {
            "message": "Datos contables y operaciones eliminados exitosamente",
            "company_id": company_id,
            "deleted": counts
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al limpiar datos: {str(e)}")

@router.post("/generate-test-data")
def generate_test_data(
    company_id: int = Query(..., description="ID de la empresa"),
    period: str = Query(..., description="Periodo YYYY-MM (ej: 2025-01)"),
    num_asientos: int = Query(10, description="Número de asientos contables a generar"),
    num_compras: int = Query(5, description="Número de compras a generar"),
    num_ventas: int = Query(5, description="Número de ventas a generar"),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Genera datos de prueba para una empresa y período.
    
    Genera:
    - Asientos contables variados (pagos, cobros, ajustes)
    - Compras con IGV automático
    - Ventas con IGV automático
    - Proveedores y clientes de prueba
    - Productos de prueba (si no existen)
    
    Todo siguiendo las reglas del PCGE peruano.
    """
    if not current_user.is_admin and current_user.role != "ADMINISTRADOR":
        raise HTTPException(status_code=403, detail="Solo administradores pueden generar datos de prueba")
    
    try:
        # Validar empresa
        company = db.query(Company).filter(Company.id == company_id).first()
        if not company:
            raise HTTPException(status_code=404, detail=f"Empresa {company_id} no encontrada")
        
        # Validar período
        year, month = map(int, period.split('-'))
        period_obj = db.query(Period).filter(
            Period.company_id == company_id,
            Period.year == year,
            Period.month == month
        ).first()
        if not period_obj:
            raise HTTPException(status_code=404, detail=f"Período {period} no encontrado para esta empresa")
        
        # Asegurar cuentas básicas (incluye crear las faltantes)
        uow = UnitOfWork(db)
        ensure_accounts_for_demo(uow, company_id)
        
        # Crear cuentas adicionales que puedan faltar
        default_accounts = [
            ("12.1", "Cuentas por cobrar comerciales – Terceros", AccountType.ASSET, 2),  # Clientes - PCGE correcto
            ("65.10", "Gastos de servicios", AccountType.EXPENSE, 2),
        ]
        for code, name, typ, level in default_accounts:
            if not uow.accounts.by_code(company_id, code):
                uow.accounts.add(Account(company_id=company_id, code=code, name=name, type=typ, level=level))
        
        uow.commit()
        uow.close()
        
        # Obtener cuentas necesarias
        accounts = db.query(Account).filter(Account.company_id == company_id).all()
        account_dict = {acc.code: acc for acc in accounts}
        
        # Funciones helper
        def get_account(code: str):
            acc = account_dict.get(code)
            if not acc:
                raise HTTPException(status_code=404, detail=f"Cuenta {code} no encontrada. Ejecuta /setup/ensure-basic-accounts primero.")
            return acc
        
        def random_date_in_period(year: int, month: int):
            """Genera una fecha aleatoria dentro del período"""
            start_date = date(year, month, 1)
            if month == 12:
                end_date = date(year + 1, 1, 1) - timedelta(days=1)
            else:
                end_date = date(year, month + 1, 1) - timedelta(days=1)
            days_between = (end_date - start_date).days
            random_days = random.randint(0, days_between)
            return start_date + timedelta(days=random_days)
        
        generated = {
            "journal_entries": 0,
            "purchases": 0,
            "sales": 0,
            "third_parties": 0,
            "products": 0,
        }
        
        uow = UnitOfWork(db)
        
        # 1. Crear terceros de prueba si no existen
        suppliers = db.query(ThirdParty).filter(
            ThirdParty.company_id == company_id,
            ThirdParty.type == "PROVEEDOR"
        ).limit(3).all()
        
        if len(suppliers) < 3:
            for i in range(3 - len(suppliers)):
                supplier = ThirdParty(
                    company_id=company_id,
                    tax_id=f"20{random.randint(10000000, 99999999)}",
                    name=f"Proveedor Test {i+1} SAC",
                    type="PROVEEDOR"
                )
                db.add(supplier)
                suppliers.append(supplier)
                generated["third_parties"] += 1
        
        customers = db.query(ThirdParty).filter(
            ThirdParty.company_id == company_id,
            ThirdParty.type == "CLIENTE"
        ).limit(3).all()
        
        if len(customers) < 3:
            for i in range(3 - len(customers)):
                customer = ThirdParty(
                    company_id=company_id,
                    tax_id=f"20{random.randint(10000000, 99999999)}",
                    name=f"Cliente Test {i+1} SAC",
                    type="CLIENTE"
                )
                db.add(customer)
                customers.append(customer)
                generated["third_parties"] += 1
        
        db.commit()
        
        # 2. Crear productos de prueba si no existen
        products = db.query(Product).filter(Product.company_id == company_id).limit(5).all()
        if len(products) < 3:
            for i in range(3 - len(products)):
                product = Product(
                    company_id=company_id,
                    code=f"PROD{i+1:03d}",
                    name=f"Producto de Prueba {i+1}",
                    unit_of_measure="UN",
                    account_code="20.10",
                    active=True
                )
                db.add(product)
                products.append(product)
                generated["products"] += 1
        db.commit()
        
        # 3. Generar asientos contables
        # Estrategia: Asegurar saldos positivos balanceados
        # 1. Primero un asiento inicial de capital/inversión para tener fondos
        # 2. Luego generar asientos balanceados (más cobros que pagos/gastos)
        
        # 3.1 Asiento inicial de capital para asegurar fondos en caja/bancos
        initial_date = date(year, month, 1)
        initial_amount = Decimal('50000.00')  # Capital inicial para tener fondos
        
        # Buscar cuenta de capital (49.x) o patrimonio (3.x)
        capital_account = None
        for code in ["49.10", "49.11", "30.10", "30.11", "39.10"]:
            if code in account_dict:
                capital_account = code
                break
        
        if capital_account:
            initial_entry = JournalEntryIn(
                company_id=company_id,
                date=initial_date,
                glosa="Capital inicial para datos de prueba",
                currency="PEN",
                exchange_rate=1.0,
                origin="MANUAL",
                lines=[
                    EntryLineIn(account_code="10.10", debit=initial_amount * Decimal('0.6'), credit=0),  # 60% en caja
                    EntryLineIn(account_code="10.20", debit=initial_amount * Decimal('0.4'), credit=0),  # 40% en banco (10.20 es Bancos, NO 12.10)
                    EntryLineIn(account_code=capital_account, debit=0, credit=initial_amount),
                ]
            )
            try:
                post_journal_entry(uow, initial_entry)
                generated["journal_entries"] += 1
            except Exception as e:
                print(f"Error creando asiento inicial: {e}")
        
        # 3.2 Generar asientos balanceados (asegurar más ingresos que egresos)
        # Calcular distribución: 40% cobros, 25% pagos, 20% ajustes, 15% gastos
        entry_types = (
            ["cobro"] * int(num_asientos * 0.4) +
            ["pago"] * int(num_asientos * 0.25) +
            ["ajuste"] * int(num_asientos * 0.2) +
            ["gasto"] * int(num_asientos * 0.15)
        )
        
        # Completar hasta num_asientos si hay diferencia por redondeo
        while len(entry_types) < num_asientos:
            entry_types.append(random.choice(["cobro", "ajuste"]))  # Agregar más cobros o ajustes
        
        # Mezclar para aleatoriedad
        random.shuffle(entry_types)
        
        for i, tipo in enumerate(entry_types[:num_asientos]):
            entry_date = random_date_in_period(year, month)
            
            lines = []
            if tipo == "pago":
                # Pago a proveedor: Debe 42.12 (Proveedores), Crédito 10.10 (Caja)
                monto = round(Decimal(random.uniform(100, 3000)), 2)
                lines = [
                    EntryLineIn(account_code="42.12", debit=monto, credit=0),
                    EntryLineIn(account_code="10.10", debit=0, credit=monto),
                ]
                glosa = f"Pago a proveedor - Test {i+1}"
            
            elif tipo == "cobro":
                # Cobro de cliente: Debe 10.10 (Caja), Crédito 12.20 (Clientes)
                monto = round(Decimal(random.uniform(1000, 8000)), 2)  # Montos más altos para cobros
                # Usar 12.20 si existe, sino 12.10 (cuentas por cobrar)
                clientes_account = "12.20" if "12.20" in account_dict else "12.10"
                lines = [
                    EntryLineIn(account_code="10.10", debit=monto, credit=0),
                    EntryLineIn(account_code=clientes_account, debit=0, credit=monto),
                ]
                glosa = f"Cobro de cliente - Test {i+1}"
            
            elif tipo == "ajuste":
                # Ajuste: Transferencia de Caja a Banco (no afecta el total)
                monto = round(Decimal(random.uniform(500, 5000)), 2)
                lines = [
                    EntryLineIn(account_code="12.10", debit=monto, credit=0),
                    EntryLineIn(account_code="10.10", debit=0, credit=monto),
                ]
                glosa = f"Ajuste de transferencia - Test {i+1}"
            
            else:  # gasto
                # Gasto: Debe gasto, Crédito Caja (usar 65.10 si existe, sino 63.10)
                monto = round(Decimal(random.uniform(50, 800)), 2)  # Gastos más pequeños
                gasto_account = "65.10" if "65.10" in account_dict else "63.10"
                lines = [
                    EntryLineIn(account_code=gasto_account, debit=monto, credit=0),
                    EntryLineIn(account_code="10.10", debit=0, credit=monto),
                ]
                glosa = f"Gasto operativo - Test {i+1}"
            
            entry_data = JournalEntryIn(
                company_id=company_id,
                date=entry_date,
                glosa=glosa,
                currency="PEN",
                exchange_rate=1.0,
                origin="MANUAL",
                lines=lines
            )
            
            try:
                post_journal_entry(uow, entry_data)
                generated["journal_entries"] += 1
            except Exception as e:
                print(f"Error creando asiento {i+1}: {e}")
        
        uow.commit()
        
        # 4. Generar compras con múltiples líneas
        productos_descripciones = [
            "Materiales de oficina",
            "Servicios de consultoría",
            "Herramientas industriales",
            "Insumos de producción",
            "Equipos de cómputo",
            "Servicios de mantenimiento",
            "Materias primas",
            "Servicios de limpieza",
            "Repuestos y accesorios",
            "Servicios profesionales"
        ]
        
        for i in range(num_compras):
            try:
                supplier = random.choice(suppliers)
                compra_date = random_date_in_period(year, month)
                
                # Generar 1-4 líneas por compra
                num_lineas = random.randint(1, 4)
                purchase_lines = []
                
                for j in range(num_lineas):
                    descripcion = random.choice(productos_descripciones)
                    cantidad = round(Decimal(random.uniform(1, 100)), 2)
                    precio_unitario = round(Decimal(random.uniform(10, 500)), 2)
                    
                    purchase_lines.append({
                        'description': f"{descripcion} - Línea {j+1}",
                        'quantity': cantidad,
                        'unit_price': precio_unitario
                    })
                
                compra, entry = registrar_compra_con_asiento(
                    uow,
                    company_id=company_id,
                    doc_type="01",
                    series="F001",
                    number=f"{i+1:06d}",
                    issue_date=compra_date,
                    supplier_id=supplier.id,
                    currency="PEN",
                    lines=purchase_lines,
                    glosa=f"Compra de prueba {i+1}"
                )
                generated["purchases"] += 1
            except Exception as e:
                logger.error(f"Error creando compra {i+1}: {str(e)}\n{traceback.format_exc()}")
        
        uow.commit()
        
        # 5. Generar ventas con múltiples líneas
        productos_venta = [
            "Servicio de desarrollo de software",
            "Producto terminado - Lote A",
            "Servicio de asesoría contable",
            "Producto terminado - Lote B",
            "Servicio de capacitación",
            "Producto terminado - Lote C",
            "Servicio de diseño gráfico",
            "Producto terminado - Lote D",
            "Servicio de implementación",
            "Producto terminado - Lote E"
        ]
        
        for i in range(num_ventas):
            try:
                customer = random.choice(customers)
                venta_date = random_date_in_period(year, month)
                
                # Generar 1-5 líneas por venta
                num_lineas = random.randint(1, 5)
                sale_lines = []
                
                for j in range(num_lineas):
                    descripcion = random.choice(productos_venta)
                    cantidad = round(Decimal(random.uniform(1, 50)), 2)
                    precio_unitario = round(Decimal(random.uniform(50, 2000)), 2)
                    
                    sale_lines.append({
                        'description': f"{descripcion} - Línea {j+1}",
                        'quantity': cantidad,
                        'unit_price': precio_unitario
                    })
                
                venta, entry = registrar_venta_con_asiento(
                    uow,
                    company_id=company_id,
                    doc_type="01",
                    series="F001",
                    number=f"{i+1:06d}",
                    issue_date=venta_date,
                    customer_id=customer.id,
                    currency="PEN",
                    lines=sale_lines,
                    glosa=f"Venta de prueba {i+1}"
                )
                generated["sales"] += 1
            except Exception as e:
                logger.error(f"Error creando venta {i+1}: {str(e)}\n{traceback.format_exc()}")
        
        uow.commit()
        uow.close()
        
        return {
            "message": "Datos de prueba generados exitosamente",
            "company_id": company_id,
            "period": period,
            "generated": generated,
            "summary": {
                "total_entries": generated["journal_entries"],
                "total_purchases": generated["purchases"],
                "total_sales": generated["sales"],
                "total_third_parties": generated["third_parties"],
                "total_products": generated["products"],
            }
        }
        
    except Exception as e:
        if 'uow' in locals():
            uow.rollback()
            uow.close()
        raise HTTPException(status_code=500, detail=f"Error al generar datos de prueba: {str(e)}")

@router.post("/init-database")
def init_database(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_optional),
):
    """
    Crea la base de datos completa desde los modelos (tablas, secuencias, FKs).
    Elimina todas las tablas existentes y las recrea. Luego crea el usuario admin.
    Si ya hay usuarios: solo administradores. Si la BD está vacía: permite sin autenticación.
    """
    from ...db import recreate_schema_from_models, SessionLocal
    from ...domain.models import User, Role
    from ...security.auth import get_password_hash
    # Permitir sin auth solo si no hay usuarios (primer arranque)
    try:
        user_count = db.query(User).count()
    except Exception:
        user_count = 0  # Tabla puede no existir aún
    if user_count > 0:
        if not current_user:
            raise HTTPException(status_code=401, detail="Debe iniciar sesión para reinicializar la base de datos")
        if not current_user.is_admin and current_user.role != "ADMINISTRADOR":
            raise HTTPException(status_code=403, detail="Solo administradores pueden reinicializar la base de datos")

    try:
        db.close()
        recreate_schema_from_models()

        db_new = SessionLocal()
        try:
            from ...domain.models import RolePermission
            from ...api.routers.permissions import AVAILABLE_PERMISSIONS

            admin_role = Role(
                name="ADMINISTRADOR",
                description="Administrador del sistema",
                active=True,
                is_system=True,
            )
            db_new.add(admin_role)
            db_new.flush()
            for perm in AVAILABLE_PERMISSIONS:
                db_new.add(RolePermission(role_id=admin_role.id, permission=perm))

            admin_user = User(
                username=settings.admin_user,
                password_hash=get_password_hash(settings.admin_pass),
                is_admin=True,
                role="ADMINISTRADOR",
                role_id=admin_role.id,
            )
            db_new.add(admin_user)
            db_new.commit()
        finally:
            db_new.close()

        return {
            "message": "Base de datos inicializada correctamente. Tablas, secuencias y datos iniciales creados.",
            "admin_user": settings.admin_user,
            "hint": "Inicia sesión con las credenciales de ADMIN_USER y ADMIN_PASS configuradas en .env",
        }
    except Exception as e:
        logger.exception("Error al inicializar base de datos")
        raise HTTPException(status_code=500, detail=str(e))


def _do_reset_database():
    """Ejecuta el reset real. Se llama en background después de liberar la conexión."""
    time.sleep(3)  # Esperar a que se liberen las conexiones del request
    try:
        from ...db import Base, _import_all_models, engine, SessionLocal
        from ...application.seed_demo import seed_demo_data
        _import_all_models()
        engine_reset = create_engine(settings.database_url, echo=False, future=True, pool_pre_ping=True)
        Base.metadata.drop_all(bind=engine_reset)
        Base.metadata.create_all(bind=engine_reset)
        engine_reset.dispose()
        engine.dispose()

        # Seed demo: admin, empresa demo, plan, motor, periodo
        db = SessionLocal()
        try:
            admin_user = settings.admin_user or "admin"
            admin_pass = settings.admin_pass or "admin"
            seed_demo_data(db, admin_user=admin_user, admin_pass=admin_pass)
            db.commit()
            logger.info("Seed demo aplicado tras reset")
        except Exception as se:
            logger.warning("Seed demo no aplicado: %s", se)
            db.rollback()
        finally:
            db.close()

        logger.info("Reset para primera vez completado correctamente")
    except Exception as e:
        logger.exception("Error en background al resetear: %s", e)


@router.post("/reset-for-first-time")
def reset_for_first_time(
    background_tasks: BackgroundTasks,
    current_user=Depends(get_current_user),
):
    """
    Resetea la base de datos para iniciar como si fuera la primera vez.
    Ejecuta el reset en segundo plano para evitar bloqueos por conexiones activas.
    Solo administradores.
    """
    if not current_user.is_admin and current_user.role != "ADMINISTRADOR":
        raise HTTPException(status_code=403, detail="Solo administradores pueden ejecutar esta acción")

    background_tasks.add_task(_do_reset_database)
    return {
        "message": "Reset iniciado. Se está ejecutando en segundo plano.",
        "hint": "Espera 10-15 segundos, luego recarga la página. Verás el wizard de configuración inicial.",
    }


@router.get("/db-dumps")
def list_db_dumps(current_user=Depends(get_current_user)):
    """
    Lista los archivos .sql disponibles en db/ para restaurar la base de datos.
    Solo administradores.
    """
    if not current_user.is_admin and current_user.role != "ADMINISTRADOR":
        raise HTTPException(status_code=403, detail="Solo administradores pueden listar dumps")
    if not DB_DUMPS_DIR.exists():
        return {"dumps": [], "message": "Carpeta db/ no encontrada"}
    dumps = []
    for f in sorted(DB_DUMPS_DIR.glob("*.sql"), key=lambda x: x.stat().st_mtime, reverse=True):
        dumps.append({
            "filename": f.name,
            "size_mb": round(f.stat().st_size / (1024 * 1024), 2),
            "modified": datetime.fromtimestamp(f.stat().st_mtime).isoformat(),
        })
    return {"dumps": dumps}


@router.post("/restore-database")
def restore_database(
    filename: str = Query(..., description="Nombre del archivo .sql en db/ (ej: dump-siscont2-202602081223.sql)"),
    current_user=Depends(get_current_user),
):
    """
    Restaura la base de datos completa desde un dump SQL.
    Solo PostgreSQL. Requiere que psql esté instalado.
    ⚠️ ADVERTENCIA: Reemplaza TODOS los datos actuales. La sesión se cerrará tras restaurar.
    """
    if not current_user.is_admin and current_user.role != "ADMINISTRADOR":
        raise HTTPException(status_code=403, detail="Solo administradores pueden restaurar la base de datos")

    # Validar que sea PostgreSQL
    if not settings.database_url.startswith("postgresql"):
        raise HTTPException(
            status_code=400,
            detail="Solo se puede restaurar en PostgreSQL. Configura DATABASE_URL con PostgreSQL."
        )

    # Validar nombre de archivo (seguridad: evitar path traversal)
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Nombre de archivo no válido")
    if not filename.endswith(".sql"):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos .sql")

    dump_path = DB_DUMPS_DIR / filename
    if not dump_path.exists():
        raise HTTPException(status_code=404, detail=f"Archivo no encontrado: {filename}")

    try:
        url = make_url(settings.database_url)
        host = url.host or "localhost"
        port = url.port or 5432
        user = url.username
        password = url.password
        dbname = url.database.lstrip("/") if url.database else "siscont"

        env = os.environ.copy()
        if password:
            env["PGPASSWORD"] = password

        cmd = [
            "psql",
            "-h", str(host),
            "-p", str(port),
            "-U", str(user),
            "-d", str(dbname),
            "-f", str(dump_path),
            "-v", "ON_ERROR_STOP=1",
        ]

        result = subprocess.run(
            cmd,
            env=env,
            capture_output=True,
            text=True,
            timeout=300,  # 5 minutos máximo
        )

        if result.returncode != 0:
            err_msg = result.stderr or result.stdout or "Error desconocido"
            logger.error(f"Restore failed: {err_msg}")
            raise HTTPException(
                status_code=500,
                detail=f"Error al restaurar: {err_msg[:500]}"
            )

        return {
            "message": "Base de datos restaurada correctamente. Recarga la página para continuar.",
            "filename": filename,
            "stdout_preview": (result.stdout or "")[-500:] if result.stdout else "",
        }
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Timeout: la restauración tardó más de 5 minutos")
    except FileNotFoundError:
        raise HTTPException(
            status_code=500,
            detail="psql no está instalado. Instale postgresql-client: sudo apt install postgresql-client"
        )


@router.get("/validate-data")
def validate_accounting_data(
    company_id: int = Query(..., description="ID de la empresa"),
    period_id: int = Query(None, description="ID del período (opcional)"),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Valida la integridad contable de los datos generados.
    
    Verifica:
    1. Partida doble: Suma Debe = Suma Haber en todos los asientos
    2. Balance de comprobación: Suma total Debe = Suma total Haber
    3. Saldos de cuentas principales según PCGE
    4. Consistencia de compras/ventas con asientos contables
    """
    from sqlalchemy import func, case
    from decimal import Decimal
    
    # Permitir acceso a administradores y contadores
    if current_user.role not in ["ADMINISTRADOR", "CONTADOR"]:
        raise HTTPException(status_code=403, detail="Solo administradores y contadores pueden validar datos")
    
    validation_results = {
        "partida_doble_asientos": [],
        "balance_comprobacion": {},
        "saldo_caja_bancos": 0.0,
        "saldo_clientes": 0.0,
        "saldo_proveedores": 0.0,
        "igv_por_pagar": 0.0,
        "total_debe_periodo": 0.0,
        "total_haber_periodo": 0.0,
        "compras_con_asiento": 0,
        "ventas_con_asiento": 0,
        # Validaciones específicas peruanas
        "validaciones_peruanas": {
            "igv_compras": [],
            "igv_ventas": [],
            "comprobantes_sunat": [],
            "ruc_terceros": [],
            "fechas_periodo": [],
            "periodos_cerrados": [],
            "saldos_negativos": [],
            "correlatividad_comprobantes": [],
        },
        "errors": [],
        "warnings": []
    }
    
    try:
        # 1. Verificar partida doble por asiento
        entries_query = db.query(JournalEntry).filter(
            JournalEntry.company_id == company_id,
            JournalEntry.status == "POSTED"
        )
        if period_id:
            entries_query = entries_query.filter(JournalEntry.period_id == period_id)
        
        entries = entries_query.all()
        
        for entry in entries:
            total_debit = Decimal('0')
            total_credit = Decimal('0')
            
            for line in entry.lines:
                total_debit += Decimal(str(line.debit or 0))
                total_credit += Decimal(str(line.credit or 0))
            
            diff = abs(total_debit - total_credit)
            is_balanced = diff < Decimal('0.01')  # Tolerancia para redondeo
            
            validation_results["partida_doble_asientos"].append({
                "entry_id": entry.id,
                "date": entry.date.isoformat(),
                "glosa": entry.glosa,
                "debit": float(total_debit),
                "credit": float(total_credit),
                "difference": float(diff),
                "balanced": is_balanced
            })
            
            if not is_balanced:
                validation_results["errors"].append(
                    f"Asiento #{entry.id} ({entry.date}) no cuadra: Debe={total_debit}, Haber={total_credit}, Diferencia={diff}"
                )
        
        # 2. Balance de comprobación (suma total)
        all_lines = db.query(
            func.sum(EntryLine.debit).label('total_debit'),
            func.sum(EntryLine.credit).label('total_credit')
        ).join(JournalEntry).filter(
            JournalEntry.company_id == company_id,
            JournalEntry.status == "POSTED"
        )
        if period_id:
            all_lines = all_lines.filter(JournalEntry.period_id == period_id)
        
        totals = all_lines.first()
        total_debit = float(totals.total_debit or 0)
        total_credit = float(totals.total_credit or 0)
        diff_balance = abs(total_debit - total_credit)
        
        validation_results["balance_comprobacion"] = {
            "total_debit": total_debit,
            "total_credit": total_credit,
            "difference": diff_balance,
            "is_balanced": diff_balance < 0.01
        }
        
        if diff_balance >= 0.01:
            validation_results["errors"].append(
                f"Balance de comprobación no cuadra: Total Debe={total_debit}, Total Haber={total_credit}, Diferencia={diff_balance}"
            )
        
        validation_results["total_debe_periodo"] = total_debit
        validation_results["total_haber_periodo"] = total_credit
        
        # 3. Saldos de cuentas principales
        # Caja + Bancos (10.x)
        cash_banks = db.query(
            func.coalesce(func.sum(EntryLine.debit) - func.sum(EntryLine.credit), Decimal('0'))
        ).join(Account).join(JournalEntry).filter(
            Account.company_id == company_id,
            Account.code.like('10%'),
            Account.active == True,
            JournalEntry.status == "POSTED"
        )
        if period_id:
            cash_banks = cash_banks.filter(JournalEntry.period_id == period_id)
        validation_results["saldo_caja_bancos"] = float(cash_banks.scalar() or 0)
        
        # Clientes (12.x)
        clients = db.query(
            func.coalesce(func.sum(EntryLine.debit) - func.sum(EntryLine.credit), Decimal('0'))
        ).join(Account).join(JournalEntry).filter(
            Account.company_id == company_id,
            Account.code.like('12%'),
            Account.active == True,
            JournalEntry.status == "POSTED"
        )
        if period_id:
            clients = clients.filter(JournalEntry.period_id == period_id)
        validation_results["saldo_clientes"] = float(clients.scalar() or 0)
        
        # Proveedores (42.x) - Pasivo: Haber - Debe
        suppliers = db.query(
            func.coalesce(func.sum(EntryLine.credit) - func.sum(EntryLine.debit), Decimal('0'))
        ).join(Account).join(JournalEntry).filter(
            Account.company_id == company_id,
            Account.code.like('42%'),
            Account.active == True,
            JournalEntry.status == "POSTED"
        )
        if period_id:
            suppliers = suppliers.filter(JournalEntry.period_id == period_id)
        validation_results["saldo_proveedores"] = float(suppliers.scalar() or 0)
        
        # IGV por Pagar (40.11) - Pasivo: Haber - Debe
        igv_account = db.query(Account).filter(
            Account.company_id == company_id,
            Account.code == '40.11'
        ).first()
        
        if igv_account:
            igv_query = db.query(
                func.coalesce(func.sum(EntryLine.credit) - func.sum(EntryLine.debit), Decimal('0'))
            ).join(JournalEntry).filter(
                EntryLine.account_id == igv_account.id,
                JournalEntry.status == "POSTED"
            )
            if period_id:
                igv_query = igv_query.filter(JournalEntry.period_id == period_id)
            validation_results["igv_por_pagar"] = float(igv_query.scalar() or 0)
        
        # 4. Verificar compras y ventas con asientos
        purchases = db.query(Purchase).filter(Purchase.company_id == company_id)
        if period_id:
            period_obj = db.query(Period).filter(Period.id == period_id).first()
            if period_obj:
                start_date = date(period_obj.year, period_obj.month, 1)
                if period_obj.month == 12:
                    end_date = date(period_obj.year + 1, 1, 1) - timedelta(days=1)
                else:
                    end_date = date(period_obj.year, period_obj.month + 1, 1) - timedelta(days=1)
                purchases = purchases.filter(Purchase.issue_date >= start_date, Purchase.issue_date <= end_date)
        
        purchases_with_entry = purchases.filter(Purchase.journal_entry_id.isnot(None)).count()
        total_purchases = purchases.count()
        validation_results["compras_con_asiento"] = purchases_with_entry
        if total_purchases > 0 and purchases_with_entry < total_purchases:
            validation_results["warnings"].append(
                f"{total_purchases - purchases_with_entry} compras sin asiento contable asociado"
            )
        
        sales = db.query(Sale).filter(Sale.company_id == company_id)
        if period_id:
            period_obj = db.query(Period).filter(Period.id == period_id).first()
            if period_obj:
                start_date = date(period_obj.year, period_obj.month, 1)
                if period_obj.month == 12:
                    end_date = date(period_obj.year + 1, 1, 1) - timedelta(days=1)
                else:
                    end_date = date(period_obj.year, period_obj.month + 1, 1) - timedelta(days=1)
                sales = sales.filter(Sale.issue_date >= start_date, Sale.issue_date <= end_date)
        
        sales_with_entry = sales.filter(Sale.journal_entry_id.isnot(None)).count()
        total_sales = sales.count()
        validation_results["ventas_con_asiento"] = sales_with_entry
        if total_sales > 0 and sales_with_entry < total_sales:
            validation_results["warnings"].append(
                f"{total_sales - sales_with_entry} ventas sin asiento contable asociado"
            )
        
        # 5. VALIDACIONES ESPECÍFICAS PERUANAS
        
        # 5.1 Validar IGV en compras (debe ser 18% de la base)
        IGV_RATE = Decimal('0.18')
        all_purchases = purchases.all()
        for compra in all_purchases:
            if compra.base_amount > 0:
                expected_igv = (compra.base_amount * IGV_RATE).quantize(Decimal('0.01'))
                actual_igv = compra.igv_amount or Decimal('0')
                diff_igv = abs(expected_igv - actual_igv)
                
                if diff_igv >= Decimal('0.01'):
                    validation_results["validaciones_peruanas"]["igv_compras"].append({
                        "compra_id": compra.id,
                        "doc": f"{compra.doc_type}-{compra.series}-{compra.number}",
                        "base": float(compra.base_amount),
                        "igv_calculado": float(expected_igv),
                        "igv_registrado": float(actual_igv),
                        "diferencia": float(diff_igv)
                    })
                    validation_results["errors"].append(
                        f"Compra {compra.doc_type}-{compra.series}-{compra.number}: IGV incorrecto. "
                        f"Esperado: S/ {expected_igv} (18% de {compra.base_amount}), Registrado: S/ {actual_igv}"
                    )
                
                # Validar que total = base + IGV
                expected_total = (compra.base_amount + expected_igv).quantize(Decimal('0.01'))
                if abs(compra.total_amount - expected_total) >= Decimal('0.01'):
                    validation_results["errors"].append(
                        f"Compra {compra.doc_type}-{compra.series}-{compra.number}: Total incorrecto. "
                        f"Base: {compra.base_amount} + IGV: {expected_igv} = {expected_total}, "
                        f"pero está registrado: {compra.total_amount}"
                    )
        
        # 5.2 Validar IGV en ventas
        all_sales = sales.all()
        for venta in all_sales:
            if venta.base_amount > 0:
                expected_igv = (venta.base_amount * IGV_RATE).quantize(Decimal('0.01'))
                actual_igv = venta.igv_amount or Decimal('0')
                diff_igv = abs(expected_igv - actual_igv)
                
                if diff_igv >= Decimal('0.01'):
                    validation_results["validaciones_peruanas"]["igv_ventas"].append({
                        "venta_id": venta.id,
                        "doc": f"{venta.doc_type}-{venta.series}-{venta.number}",
                        "base": float(venta.base_amount),
                        "igv_calculado": float(expected_igv),
                        "igv_registrado": float(actual_igv),
                        "diferencia": float(diff_igv)
                    })
                    validation_results["errors"].append(
                        f"Venta {venta.doc_type}-{venta.series}-{venta.number}: IGV incorrecto. "
                        f"Esperado: S/ {expected_igv} (18% de {venta.base_amount}), Registrado: S/ {actual_igv}"
                    )
        
        # 5.3 Validar comprobantes SUNAT (series y números)
        # Validar que series y números no estén duplicados
        purchase_docs = {}
        for compra in all_purchases:
            key = f"{compra.doc_type}-{compra.series}-{compra.number}"
            if key in purchase_docs:
                validation_results["errors"].append(
                    f"Comprobante de compra duplicado: {key} (IDs: {purchase_docs[key]}, {compra.id})"
                )
            purchase_docs[key] = compra.id
            
            # Validar formato de serie y número
            if not compra.series or len(compra.series.strip()) == 0:
                validation_results["warnings"].append(
                    f"Compra ID {compra.id}: Serie vacía"
                )
            if not compra.number or len(compra.number.strip()) == 0:
                validation_results["warnings"].append(
                    f"Compra ID {compra.id}: Número vacío"
                )
        
        sale_docs = {}
        for venta in all_sales:
            key = f"{venta.doc_type}-{venta.series}-{venta.number}"
            if key in sale_docs:
                validation_results["errors"].append(
                    f"Comprobante de venta duplicado: {key} (IDs: {sale_docs[key]}, {venta.id})"
                )
            sale_docs[key] = venta.id
        
        validation_results["validaciones_peruanas"]["comprobantes_sunat"] = {
            "compras_duplicadas": len([k for k in purchase_docs if purchase_docs[k] != purchase_docs.get(k, -1)]),
            "ventas_duplicadas": len([k for k in sale_docs if sale_docs[k] != sale_docs.get(k, -1)])
        }
        
        # 5.4 Validar RUC de terceros (checksum SUNAT)
        third_parties = db.query(ThirdParty).filter(ThirdParty.company_id == company_id).all()
        for tp in third_parties:
            if tp.tax_id and len(tp.tax_id) == 11:
                # Validar checksum RUC
                digits = [int(d) for d in tp.tax_id]
                if len(digits) == 11:
                    weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
                    sum_check = sum(digits[i] * weights[i] for i in range(10))
                    mod = sum_check % 11
                    check_digit = (11 - mod) % 10
                    if check_digit != digits[10]:
                        validation_results["validaciones_peruanas"]["ruc_terceros"].append({
                            "tercero_id": tp.id,
                            "tipo": tp.type,
                            "nombre": tp.name,
                            "ruc": tp.tax_id,
                            "error": "Checksum RUC inválido"
                        })
                        validation_results["warnings"].append(
                            f"{tp.type} '{tp.name}' (ID {tp.id}): RUC {tp.tax_id} tiene checksum inválido"
                        )
        
        # 5.5 Validar fechas dentro del período (si se especifica período)
        if period_id:
            period_obj = db.query(Period).filter(Period.id == period_id).first()
            if period_obj:
                period_start = date(period_obj.year, period_obj.month, 1)
                if period_obj.month == 12:
                    period_end = date(period_obj.year + 1, 1, 1) - timedelta(days=1)
                else:
                    period_end = date(period_obj.year, period_obj.month + 1, 1) - timedelta(days=1)
                
                # Validar asientos
                for entry in entries:
                    if entry.date < period_start or entry.date > period_end:
                        validation_results["validaciones_peruanas"]["fechas_periodo"].append({
                            "tipo": "asiento",
                            "id": entry.id,
                            "fecha": entry.date.isoformat(),
                            "periodo": f"{period_obj.year}-{period_obj.month:02d}"
                        })
                        validation_results["errors"].append(
                            f"Asiento #{entry.id}: Fecha {entry.date} fuera del período {period_obj.year}-{period_obj.month:02d}"
                        )
                
                # Validar compras
                for compra in all_purchases:
                    if compra.issue_date < period_start or compra.issue_date > period_end:
                        validation_results["warnings"].append(
                            f"Compra {compra.doc_type}-{compra.series}-{compra.number}: "
                            f"Fecha {compra.issue_date} fuera del período seleccionado"
                        )
                
                # Validar ventas
                for venta in all_sales:
                    if venta.issue_date < period_start or venta.issue_date > period_end:
                        validation_results["warnings"].append(
                            f"Venta {venta.doc_type}-{venta.series}-{venta.number}: "
                            f"Fecha {venta.issue_date} fuera del período seleccionado"
                        )
                
                # Validar períodos cerrados
                if period_obj.status == "CERRADO":
                    # Verificar si hay asientos después del cierre
                    entries_after_close = db.query(JournalEntry).filter(
                        JournalEntry.company_id == company_id,
                        JournalEntry.period_id == period_id,
                        JournalEntry.date > period_end,
                        JournalEntry.status == "POSTED"
                    ).count()
                    if entries_after_close > 0:
                        validation_results["validaciones_peruanas"]["periodos_cerrados"].append({
                            "periodo": f"{period_obj.year}-{period_obj.month:02d}",
                            "asientos_despues_cierre": entries_after_close
                        })
                        validation_results["errors"].append(
                            f"Período {period_obj.year}-{period_obj.month:02d} está cerrado pero tiene "
                            f"{entries_after_close} asiento(s) con fecha después del cierre"
                        )
        
        # 5.6 Validar saldos negativos en activos (no deberían existir normalmente)
        negative_assets = db.query(
            Account.code, Account.name,
            func.coalesce(func.sum(EntryLine.debit) - func.sum(EntryLine.credit), Decimal('0')).label('saldo')
        ).join(EntryLine).join(JournalEntry).filter(
            Account.company_id == company_id,
            Account.code.like('1%'),  # Activos
            Account.active == True,
            JournalEntry.status == "POSTED"
        ).group_by(Account.id, Account.code, Account.name).having(
            func.coalesce(func.sum(EntryLine.debit) - func.sum(EntryLine.credit), Decimal('0')) < Decimal('0')
        )
        if period_id:
            negative_assets = negative_assets.filter(JournalEntry.period_id == period_id)
        
        for row in negative_assets.all():
            validation_results["validaciones_peruanas"]["saldos_negativos"].append({
                "cuenta": row.code,
                "nombre": row.name,
                "saldo": float(row.saldo)
            })
            validation_results["warnings"].append(
                f"Cuenta de Activo {row.code} ({row.name}): Saldo negativo S/ {row.saldo:.2f}"
            )
        
        # 5.7 Validar correlatividad de comprobantes (series consecutivas)
        # Agrupar por serie y validar que no haya saltos
        purchase_series = {}
        for compra in sorted(all_purchases, key=lambda x: (x.series, x.number)):
            if compra.series not in purchase_series:
                purchase_series[compra.series] = []
            try:
                num = int(compra.number)
                purchase_series[compra.series].append(num)
            except:
                pass
        
        for series, numbers in purchase_series.items():
            if len(numbers) > 1:
                numbers_sorted = sorted(numbers)
                gaps = []
                for i in range(len(numbers_sorted) - 1):
                    if numbers_sorted[i+1] - numbers_sorted[i] > 1:
                        gaps.append(f"{numbers_sorted[i]} -> {numbers_sorted[i+1]}")
                if gaps:
                    validation_results["validaciones_peruanas"]["correlatividad_comprobantes"].append({
                        "tipo": "compra",
                        "serie": series,
                        "saltos": gaps
                    })
                    validation_results["warnings"].append(
                        f"Compras serie {series}: Hay saltos en la numeración: {', '.join(gaps)}"
                    )
        
        sale_series = {}
        for venta in sorted(all_sales, key=lambda x: (x.series, x.number)):
            if venta.series not in sale_series:
                sale_series[venta.series] = []
            try:
                num = int(venta.number)
                sale_series[venta.series].append(num)
            except:
                pass
        
        for series, numbers in sale_series.items():
            if len(numbers) > 1:
                numbers_sorted = sorted(numbers)
                gaps = []
                for i in range(len(numbers_sorted) - 1):
                    if numbers_sorted[i+1] - numbers_sorted[i] > 1:
                        gaps.append(f"{numbers_sorted[i]} -> {numbers_sorted[i+1]}")
                if gaps:
                    validation_results["validaciones_peruanas"]["correlatividad_comprobantes"].append({
                        "tipo": "venta",
                        "serie": series,
                        "saltos": gaps
                    })
                    validation_results["warnings"].append(
                        f"Ventas serie {series}: Hay saltos en la numeración: {', '.join(gaps)}"
                    )
        
        # Resumen
        validation_results["summary"] = {
            "total_entries_checked": len(entries),
            "balanced_entries": sum(1 for e in validation_results["partida_doble_asientos"] if e["balanced"]),
            "unbalanced_entries": sum(1 for e in validation_results["partida_doble_asientos"] if not e["balanced"]),
            "total_errors": len(validation_results["errors"]),
            "total_warnings": len(validation_results["warnings"]),
            "is_valid": len(validation_results["errors"]) == 0 and validation_results["balance_comprobacion"]["is_balanced"]
        }
        
        return validation_results
        
    except Exception as e:
        import traceback
        logger.error(f"Error validando datos: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error al validar datos: {str(e)}")
