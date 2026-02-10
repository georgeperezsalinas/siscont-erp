from decimal import Decimal
from typing import List
import csv
import os
from pathlib import Path
from sqlalchemy.orm import Session
from ..domain.models import Account, JournalEntry, EntryLine
from ..domain.events import AsientoRegistrado
from ..domain.enums import AccountType
from ..infrastructure.unit_of_work import UnitOfWork
from ..infrastructure.plugins import peru_igv
from .dtos import JournalEntryIn, TrialBalanceRow, LedgerRow

def ensure_accounts_for_demo(uow: UnitOfWork, company_id: int, replace_all: bool = False):
    # crea unas cuentas básicas si no existen (maneja duplicados de forma segura)
    from sqlalchemy.exc import IntegrityError
    
    # Si replace_all=True, eliminar todas las cuentas primero
    if replace_all:
        deleted_count, failed_deletions = delete_all_accounts(uow, company_id, force=False)
        if failed_deletions:
            # Si hay cuentas que no se pudieron eliminar, lanzar error
            raise ValueError(
                f"No se pueden eliminar {len(failed_deletions)} cuenta(s) porque tienen movimientos contables: "
                f"{', '.join(failed_deletions[:10])}{'...' if len(failed_deletions) > 10 else ''}. "
                f"Use 'Limpiar Datos' primero para eliminar los movimientos."
            )
    
    # Helper para extraer class_code del código
    def _extract_class_code(code: str) -> str | None:
        parts = code.split('.')
        return parts[0] if parts else None
    
    # Mapeo de códigos de clase a nombres
    class_names = {
        "10": "Caja y Bancos",
        "12": "Cuentas por Cobrar",
        "20": "Existencias",
        "40": "Tributos",
        "42": "Cuentas por Pagar",
        "60": "Gastos",
        "69": "Costos",
        "70": "Ingresos",
    }
    
    defaults = [
        # Caja y Bancos (clase 10)
        ("10.10", "Caja", AccountType.ASSET, 2, "10", "Caja y Bancos"),
        ("10.20", "Bancos", AccountType.ASSET, 2, "10", "Caja y Bancos"),
        ("10.21", "Banco Nacional", AccountType.ASSET, 3, "10", "Caja y Bancos"),
        ("10.22", "Banco Extranjero", AccountType.ASSET, 3, "10", "Caja y Bancos"),
        # Cuentas por Cobrar (clase 12)
        ("12.1", "Cuentas por cobrar comerciales – Terceros", AccountType.ASSET, 2, "12", "Cuentas por Cobrar"),
        ("12.10", "Clientes", AccountType.ASSET, 2, "12", "Cuentas por Cobrar"),
        ("12.20", "Detracciones por Cobrar", AccountType.ASSET, 2, "12", "Cuentas por Cobrar"),
        # Existencias (clase 20)
        ("20.10", "Mercaderías", AccountType.ASSET, 2, "20", "Existencias"),
        # Tributos (clase 40)
        ("40.10", "IGV Débito Fiscal (por pagar)", AccountType.LIABILITY, 2, "40", "Tributos"),  # IGV débito fiscal (Pasivo)
        ("40.11", "IGV Crédito Fiscal", AccountType.ASSET, 2, "40", "Tributos"),  # IGV crédito fiscal (Activo)
        # Cuentas por Pagar (clase 42)
        ("42.10", "Proveedores", AccountType.LIABILITY, 2, "42", "Cuentas por Pagar"),
        # Gastos (clase 60)
        ("60.11", "Gasto de compras", AccountType.EXPENSE, 2, "60", "Gastos"),
        # Costos (clase 69)
        ("69.10", "Costo de Ventas - Mercaderías", AccountType.EXPENSE, 2, "69", "Costos"),
        # Ingresos (clase 70)
        ("70.10", "Ventas", AccountType.INCOME, 2, "70", "Ingresos"),
    ]
    
    # Hacer flush primero para ver cambios pendientes en la sesión
    try:
        uow.db.flush()
    except:
        pass  # Ignorar errores en flush
    
    # Obtener todas las cuentas existentes de una vez
    existing_codes = {acc.code for acc in uow.accounts.list(company_id)}
    
    # Agregar cuentas una por una para manejar errores individualmente
    for item in defaults:
        if len(item) == 6:
            # Formato nuevo: (code, name, typ, level, class_code, class_name)
            code, name, typ, level, class_code, class_name = item
        else:
            # Compatibilidad con formato antiguo: (code, name, typ, level)
            code, name, typ, level = item
            class_code = _extract_class_code(code)
            class_name = class_names.get(class_code) if class_code else None
        # Verificar si ya existe en la lista cargada
        if code in existing_codes:
            continue
        
        # Verificar nuevamente por si hay cambios pendientes
        if uow.accounts.by_code(company_id, code):
            existing_codes.add(code)
            continue
        
        # Intentar agregar la cuenta individualmente
        try:
            acc = Account(
                company_id=company_id,
                code=code,
                name=name,
                type=typ,
                level=level,
                class_code=class_code,
                class_name=class_name
            )
            uow.accounts.add(acc)
            uow.db.flush()  # Flush inmediato para detectar duplicados
            existing_codes.add(code)
        except IntegrityError:
            # Si ya existe (race condition o inserción concurrente), simplemente continuar
            # Expungir el objeto fallido de la sesión para no interferir
            try:
                uow.db.expunge(acc)
            except:
                pass
            existing_codes.add(code)
            continue

def delete_all_accounts(uow: UnitOfWork, company_id: int, force: bool = False) -> tuple[int, list[str]]:
    """
    Elimina todas las cuentas de una empresa.
    
    Antes de eliminar cuentas, elimina tipo_cuenta_mapeos que referencian accounts
    para evitar violación de FK (tipo_cuenta_mapeos.account_id -> accounts.id).
    
    Args:
        uow: UnitOfWork
        company_id: ID de la empresa
        force: Si es True, elimina incluso cuentas con movimientos (peligroso)
        
    Returns:
        tuple[int, list[str]]: (número de cuentas eliminadas, lista de códigos de cuentas que no se pudieron eliminar)
    """
    from ..domain.models import EntryLine
    from ..domain.models_journal_engine import TipoCuentaMapeo

    # Eliminar mapeos del motor de asientos ANTES de borrar cuentas (FK account_id -> accounts.id)
    uow.db.query(TipoCuentaMapeo).filter(TipoCuentaMapeo.company_id == company_id).delete(synchronize_session=False)
    uow.db.flush()

    all_accounts = uow.accounts.list(company_id)
    deleted_count = 0
    failed_codes = []
    
    for acc in all_accounts:
        # Verificar si tiene movimientos contables
        has_movements = uow.db.query(EntryLine).filter(EntryLine.account_id == acc.id).first() is not None
        
        if has_movements and not force:
            failed_codes.append(acc.code)
            continue
        
        # Eliminar la cuenta
        try:
            uow.db.delete(acc)
            deleted_count += 1
        except Exception:
            failed_codes.append(acc.code)
    
    uow.db.flush()
    return deleted_count, failed_codes


def load_plan_base_csv(uow: UnitOfWork, company_id: int, replace_all: bool = False) -> dict:
    """
    Carga el plan de cuentas base (plan_base.csv) para una empresa.
    
    Esta función debe llamarse cuando se crea una nueva empresa para
    inicializar el plan de cuentas completo según el PCGE peruano.
    
    Args:
        uow: UnitOfWork
        company_id: ID de la empresa
        replace_all: Si es True, elimina todas las cuentas existentes antes de cargar
        
    Returns:
        dict: {
            "created": número de cuentas creadas,
            "deleted": número de cuentas eliminadas (si replace_all=True),
            "failed_deletions": lista de códigos que no se pudieron eliminar
        }
    """
    from sqlalchemy.exc import IntegrityError
    
    # Si replace_all=True, eliminar todas las cuentas primero
    deleted_count = 0
    failed_deletions = []
    if replace_all:
        deleted_count, failed_deletions = delete_all_accounts(uow, company_id, force=False)
        if failed_deletions:
            # Si hay cuentas que no se pudieron eliminar, lanzar error
            raise ValueError(
                f"No se pueden eliminar {len(failed_deletions)} cuenta(s) porque tienen movimientos contables: "
                f"{', '.join(failed_deletions[:10])}{'...' if len(failed_deletions) > 10 else ''}. "
                f"Use 'Limpiar Datos' primero para eliminar los movimientos."
            )
    
    # Ruta al archivo plan_base.csv
    # Buscar en backend/data/plan_base.csv
    base_dir = Path(__file__).parent.parent.parent
    csv_path = base_dir / "data" / "plan_base.csv"
    
    if not csv_path.exists():
        # Si no existe, intentar en la raíz del proyecto
        csv_path = base_dir / "plan_base.csv"
        if not csv_path.exists():
            raise FileNotFoundError(f"No se encontró plan_base.csv en {base_dir / 'data'} ni en {base_dir}")
    
    # Mapeo de tipos de string a AccountType
    type_mapping = {
        "ACTIVO": AccountType.ASSET,
        "PASIVO": AccountType.LIABILITY,
        "PATRIMONIO": AccountType.EQUITY,
        "INGRESO": AccountType.INCOME,
        "GASTO": AccountType.EXPENSE,
        "CONTROL": AccountType.CONTROL,  # Cuentas de orden
    }
    
    # Obtener cuentas existentes (después de la eliminación si replace_all=True)
    existing_codes = {acc.code for acc in uow.accounts.list(company_id)}
    
    accounts_created = 0
    
    # Leer CSV
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            code = row['code'].strip()
            name = row['name'].strip()
            level = int(row['level'])
            type_str = row['type'].strip()
            active = int(row['active']) == 1
            class_code = row.get('class_code', '').strip() or None
            class_name = row.get('class_name', '').strip() or None
            
            # Si la cuenta ya existe, saltarla
            if code in existing_codes:
                continue
            
            # Convertir tipo
            account_type = type_mapping.get(type_str)
            if not account_type:
                continue  # Saltar tipos desconocidos
            
            # Crear cuenta
            try:
                acc = Account(
                    company_id=company_id,
                    code=code,
                    name=name,
                    level=level,
                    type=account_type,
                    active=active,
                    class_code=class_code,
                    class_name=class_name
                )
                uow.accounts.add(acc)
                uow.db.flush()
                existing_codes.add(code)
                accounts_created += 1
            except IntegrityError:
                # Si ya existe (race condition), continuar
                try:
                    uow.db.expunge(acc)
                except:
                    pass
                existing_codes.add(code)
                continue
    
    return {
        "created": accounts_created,
        "deleted": deleted_count,
        "failed_deletions": failed_deletions
    }

def _sum_lines(lines: List[EntryLine]) -> tuple[Decimal, Decimal]:
    d = sum(Decimal(str(x.debit)) for x in lines)
    c = sum(Decimal(str(x.credit)) for x in lines)
    return (d, c)

def post_journal_entry(uow: UnitOfWork, data: JournalEntryIn, user_id: int | None = None) -> JournalEntry:
    from .services_correlative import generate_correlative
    
    company = uow.companies.first_or_create()
    company_id = data.company_id or company.id
    ensure_accounts_for_demo(uow, company_id)

    # periodo YYYY-MM
    y, m = data.date.year, data.date.month
    period = uow.periods.get_or_open(company_id, y, m)

    lines_data = data.lines

    # plugin IGV para plantilla de compras
    if (data.tipo or "").lower() == "compra_igv" and not data.lines:
        lines_data = peru_igv.plantilla_compra(Decimal('1000.00'), "Compra base demo")  # ejemplo

    # Generar correlativo estructurado
    origin = data.origin or "MANUAL"
    correlative = generate_correlative(
        db=uow.db,
        company_id=company_id,
        origin=origin,
        entry_date=data.date
    )

    # Para asientos MANUAL, usar DRAFT por defecto (tipo SAP)
    # Para otros orígenes, usar POSTED (compatibilidad)
    default_status = "DRAFT" if origin == "MANUAL" else "POSTED"
    
    entry = JournalEntry(
        company_id=company_id,
        date=data.date,
        period_id=period.id,
        glosa=data.glosa or "",
        currency=data.currency,
        exchange_rate=data.exchange_rate,
        origin=origin,
        status=default_status,
        correlative=correlative,
        created_by=user_id,
    )

    # construir lines usando account_code
    # lines_data puede ser List[EntryLineIn] (Pydantic) o List[Dict] (plantillas)
    built_lines: List[EntryLine] = []
    for ln in lines_data:
        # Manejar tanto objetos Pydantic como dicts
        if isinstance(ln, dict):
            account_code = ln.get("account_code", "")
            debit_val = ln.get("debit", 0)
            credit_val = ln.get("credit", 0)
            memo_val = ln.get("memo")
        else:
            # Es un objeto Pydantic (EntryLineIn)
            account_code = ln.account_code
            debit_val = ln.debit
            credit_val = ln.credit
            memo_val = ln.memo
        
        if not account_code:
            continue
        
        acc = uow.accounts.by_code(company_id, account_code)
        if not acc:
            raise ValueError(f"Cuenta no existe: {account_code}")
        
        # Redondear a 2 decimales antes de crear la línea
        debit_decimal = Decimal(str(debit_val)).quantize(Decimal('0.01'))
        credit_decimal = Decimal(str(credit_val)).quantize(Decimal('0.01'))
        
        built_lines.append(EntryLine(
            account_id=acc.id,
            debit=debit_decimal,
            credit=credit_decimal,
            memo=memo_val
        ))

    d, c = _sum_lines(built_lines)
    if d != c:
        raise ValueError(f"Asiento no cuadra: debe={d} haber={c}")

    entry.lines = built_lines
    uow.journal.add_entry(entry)
    uow.db.flush()
    
    # Calcular hash de integridad si es POSTED
    if entry.status == "POSTED":
        from .services_journal_integrity import update_integrity_hash
        update_integrity_hash(entry)
        uow.db.flush()

    # publicar evento (placeholder)
    _ = AsientoRegistrado(journal_entry_id=entry.id, company_id=company_id)
    # Aquí podrías disparar PLE / auditoría

    return entry

def patch_journal_entry(uow: UnitOfWork, entry_id: int, data: JournalEntryIn) -> JournalEntry:
    """Actualiza un asiento contable existente"""
    entry = uow.db.query(JournalEntry).filter(JournalEntry.id == entry_id).first()
    if not entry:
        raise ValueError(f"Asiento no encontrado: {entry_id}")
    
    if entry.status == "VOIDED":
        raise ValueError("No se puede modificar un asiento anulado")
    
    company_id = entry.company_id
    
    # Actualizar datos básicos
    entry.date = data.date
    entry.glosa = data.glosa or ""
    entry.currency = data.currency
    entry.exchange_rate = data.exchange_rate
    
    # Actualizar periodo si cambió la fecha
    y, m = data.date.year, data.date.month
    period = uow.periods.get_or_open(company_id, y, m)
    entry.period_id = period.id
    
    # Eliminar líneas antiguas
    uow.db.query(EntryLine).filter(EntryLine.entry_id == entry_id).delete()
    
    # Construir nuevas líneas
    lines_data = data.lines
    built_lines: List[EntryLine] = []
    for ln in lines_data:
        if isinstance(ln, dict):
            account_code = ln.get("account_code", "")
            debit_val = ln.get("debit", 0)
            credit_val = ln.get("credit", 0)
            memo_val = ln.get("memo")
        else:
            account_code = ln.account_code
            debit_val = ln.debit
            credit_val = ln.credit
            memo_val = ln.memo
        
        if not account_code:
            continue
        
        acc = uow.accounts.by_code(company_id, account_code)
        if not acc:
            raise ValueError(f"Cuenta no existe: {account_code}")
        
        # Redondear a 2 decimales antes de crear la línea
        debit_decimal = Decimal(str(debit_val)).quantize(Decimal('0.01'))
        credit_decimal = Decimal(str(credit_val)).quantize(Decimal('0.01'))
        
        built_lines.append(EntryLine(
            entry_id=entry.id,
            account_id=acc.id,
            debit=debit_decimal,
            credit=credit_decimal,
            memo=memo_val
        ))
    
    # Validar partida doble
    d, c = _sum_lines(built_lines)
    if d != c:
        raise ValueError(f"Asiento no cuadra: debe={d} haber={c}")
    
    entry.lines = built_lines
    uow.db.flush()
    
    return entry

def get_trial_balance(db: Session, company_id:int, year:int, month:int) -> List[TrialBalanceRow]:
    from sqlalchemy import func, select
    from ..domain.models import Account, EntryLine, JournalEntry

    q = (
        db.query(
            Account.code.label("account_code"),
            Account.name.label("name"),
            func.coalesce(func.sum(EntryLine.debit),0).label("debit"),
            func.coalesce(func.sum(EntryLine.credit),0).label("credit"),
        )
        .join(EntryLine, EntryLine.account_id == Account.id, isouter=True)
        .join(JournalEntry, JournalEntry.id == EntryLine.entry_id, isouter=True)
        .filter(Account.company_id==company_id)
        .filter(func.strftime('%Y', JournalEntry.date)==str(year))
        .filter(func.strftime('%m', JournalEntry.date)==f"{month:02d}")
        .group_by(Account.code, Account.name)
        .order_by(Account.code)
    )
    rows = []
    for r in q.all():
        bal = float(r.debit or 0) - float(r.credit or 0)
        rows.append(TrialBalanceRow(
            account_code=r.account_code, name=r.name,
            debit=float(r.debit or 0), credit=float(r.credit or 0),
            balance=bal
        ))
    return rows

def get_ledger(db: Session, company_id:int, account_code:str) -> List[LedgerRow]:
    from sqlalchemy import select
    from ..domain.models import Account, EntryLine, JournalEntry
    acc = db.query(Account).filter_by(company_id=company_id, code=account_code).first()
    if not acc: return []

    q = (
        db.query(EntryLine, JournalEntry)
        .join(JournalEntry, JournalEntry.id == EntryLine.entry_id)
        .filter(EntryLine.account_id==acc.id)
        .order_by(JournalEntry.date, EntryLine.id)
    )
    rows = []
    for line, entry in q.all():
        rows.append(LedgerRow(
            entry_id=entry.id, date=entry.date, account_code=account_code,
            debit=float(line.debit), credit=float(line.credit), memo=line.memo
        ))
    return rows
