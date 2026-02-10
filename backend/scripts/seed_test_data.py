#!/usr/bin/env python3
"""
Script para cargar datos de prueba en SISCONT.

Uso:
  cd backend && python -m scripts.seed_test_data
  cd backend && python scripts/seed_test_data.py

Crea:
- Usuario admin (admin/admin) si no existe
- Empresa Demo, plan contable, motor, período
- Asociación admin ↔ Empresa Demo
- 2 proveedores, 2 clientes
- 2 compras con líneas
- 2 ventas con líneas

Ideal para pruebas funcionales y E2E.
"""
import sys
from pathlib import Path
from datetime import date
from decimal import Decimal

# Agregar backend al path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.db import SessionLocal, _import_all_models
from app.application.seed_demo import seed_demo_data, DEMO_COMPANY_NAME
from app.application.services_integration import registrar_compra_con_asiento, registrar_venta_con_asiento
from app.domain.models import Company, ThirdParty, User
from app.domain.models_ext import Purchase, Sale
from app.infrastructure.unit_of_work import UnitOfWork

# Cargar modelos
_import_all_models()


def ensure_admin_has_company(db):
    """Asocia el usuario admin con la Empresa Demo si no está vinculado."""
    user = db.query(User).filter(User.username == "admin").first()
    company = db.query(Company).filter(Company.name == DEMO_COMPANY_NAME).first()
    if not user or not company:
        return
    if company not in user.companies:
        user.companies.append(company)
        db.flush()
        print("   ✓ Admin asociado a Empresa Demo")


def seed_test_data(db, company_id: int, year: int, month: int):
    """Genera terceros, compras y ventas de prueba."""
    from app.domain.models import Period

    period = db.query(Period).filter(
        Period.company_id == company_id,
        Period.year == year,
        Period.month == month,
    ).first()
    if not period:
        print(f"   ⚠ Período {year}-{month:02d} no encontrado, saltando compras/ventas")
        return 0

    uow = UnitOfWork(db)
    count = 0

    # Proveedores
    suppliers = db.query(ThirdParty).filter(
        ThirdParty.company_id == company_id,
        ThirdParty.type == "PROVEEDOR",
    ).limit(2).all()
    n_suppliers = 2 - len(suppliers)
    if n_suppliers > 0:
        for i in range(n_suppliers):
            s = ThirdParty(
                company_id=company_id,
                tax_id=f"2012345678{i}",
                name=f"Proveedor Prueba {i+1} SAC",
                type="PROVEEDOR",
            )
            db.add(s)
            db.flush()
            suppliers.append(s)
            count += 1
        print(f"   ✓ {n_suppliers} proveedor(es) creado(s)")

    # Clientes
    customers = db.query(ThirdParty).filter(
        ThirdParty.company_id == company_id,
        ThirdParty.type == "CLIENTE",
    ).limit(2).all()
    n_customers = 2 - len(customers)
    if n_customers > 0:
        for i in range(n_customers):
            c = ThirdParty(
                company_id=company_id,
                tax_id=f"2012345679{i}",
                name=f"Cliente Prueba {i+1} SAC",
                type="CLIENTE",
            )
            db.add(c)
            db.flush()
            customers.append(c)
            count += 1
        print(f"   ✓ {n_customers} cliente(s) creado(s)")

    db.commit()

    # Compras
    compras_count = db.query(Purchase).filter(Purchase.company_id == company_id).count()
    if compras_count < 2:
        for i in range(2 - compras_count):
            try:
                supplier = suppliers[i % len(suppliers)]
                compra_date = date(year, month, min(15, 28))
                registrar_compra_con_asiento(
                    uow,
                    company_id=company_id,
                    doc_type="01",
                    series="F001",
                    number=f"TEST{i+1:04d}",
                    issue_date=compra_date,
                    supplier_id=supplier.id,
                    currency="PEN",
                    lines=[
                        {"description": f"Material prueba {i+1}", "quantity": Decimal("10"), "unit_price": Decimal("100")},
                    ],
                    glosa=f"Compra de prueba funcional {i+1}",
                )
                count += 1
            except Exception as e:
                print(f"   ⚠ Error compra {i+1}: {e}")
        uow.commit()
        print(f"   ✓ 2 compras de prueba creadas")

    # Ventas
    ventas_count = db.query(Sale).filter(Sale.company_id == company_id).count()
    if ventas_count < 2:
        for i in range(2 - ventas_count):
            try:
                customer = customers[i % len(customers)]
                venta_date = date(year, month, min(20, 28))
                registrar_venta_con_asiento(
                    uow,
                    company_id=company_id,
                    doc_type="01",
                    series="F001",
                    number=f"TEST{i+1:04d}",
                    issue_date=venta_date,
                    customer_id=customer.id,
                    currency="PEN",
                    lines=[
                        {"description": f"Servicio prueba {i+1}", "quantity": Decimal("5"), "unit_price": Decimal("200")},
                    ],
                    glosa=f"Venta de prueba funcional {i+1}",
                )
                count += 1
            except Exception as e:
                print(f"   ⚠ Error venta {i+1}: {e}")
        uow.commit()
        print(f"   ✓ 2 ventas de prueba creadas")

    uow.close()
    return count


def main():
    print("🌱 SISCONT - Carga de datos de prueba")
    print("=" * 50)

    db = SessionLocal()
    try:
        # 1. Seed demo (empresa, plan, motor, período, admin)
        print("\n1. Ejecutando seed demo...")
        result = seed_demo_data(db, admin_user="admin", admin_pass="admin")
        db.commit()

        if result.get("company"):
            print(f"   ✓ Empresa: {result['company']['name']} (id={result['company']['id']})")
        if result.get("period"):
            print(f"   ✓ Período: {result['period']['year']}-{result['period']['month']:02d} ABIERTO")
        if result.get("plan_loaded"):
            print("   ✓ Plan contable cargado")
        if result.get("motor_loaded"):
            print("   ✓ Motor de asientos cargado")

        # 2. Asociar admin con empresa
        ensure_admin_has_company(db)
        db.commit()

        # 3. Obtener empresa y período
        company = db.query(Company).filter(Company.name == DEMO_COMPANY_NAME).first()
        if not company:
            print("   ❌ Empresa Demo no encontrada")
            return 1

        today = date.today()
        print(f"\n2. Generando datos de prueba (terceros, compras, ventas)...")
        seed_test_data(db, company.id, today.year, today.month)

        print("\n✅ Datos de prueba listos.")
        print("   Usuario: admin / admin")
        print("   Empresa: Empresa Demo")
        print("   Puedes ejecutar pruebas E2E o funcionales.")

        return 0

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
