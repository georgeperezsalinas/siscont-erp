"""
Programa de Libros Electrónicos (PLE) - SUNAT Perú
===================================================

Genera archivos PLE según especificaciones SUNAT.
Módulo independiente que se acopla con datos contables.

Libros soportados:
- 5.1: Libro Diario
- 5.2: Libro Mayor
- 5.3: Plan de Cuentas
- 8.1: Registro de Compras
- 8.2: Registro de Ventas
"""
from datetime import date
from sqlalchemy.orm import Session, joinedload
from decimal import Decimal
from typing import List, Dict, Optional
from calendar import monthrange
from ..domain.models import Account, EntryLine, JournalEntry, Period, Company, ThirdParty, BankAccount, BankStatement, BankTransaction
from ..domain.models_ext import Purchase, Sale
from ..domain.enums import AccountType


def _period_bounds(period: str) -> tuple[date, date]:
    """Calcula fecha inicial y final del período"""
    y, m = map(int, period.split('-'))
    first = date(y, m, 1)
    last = date(y, m, monthrange(y, m)[1])
    return first, last


def ple_libro_diario(db: Session, company_id: int, period: str) -> List[List[str]]:
    """
    Libro Diario Electrónico (PLE 5.1).
    
    Formato según SUNAT:
    - Columna 1: Fecha (AAAAMMDD)
    - Columna 2: Glosa
    - Columna 3: Código de cuenta
    - Columna 4: Debe
    - Columna 5: Haber
    """
    ini, fin = _period_bounds(period)
    
    # Obtener período
    period_obj = db.query(Period).filter(
        Period.company_id == company_id,
        Period.year == int(period.split('-')[0]),
        Period.month == int(period.split('-')[1])
    ).first()
    
    if not period_obj:
        return []
    
    # Obtener asientos del período con eager loading de líneas y cuentas
    entries = (
        db.query(JournalEntry)
        .options(
            joinedload(JournalEntry.lines).joinedload(EntryLine.account)
        )
        .filter(
            JournalEntry.company_id == company_id,
            JournalEntry.period_id == period_obj.id,
            JournalEntry.date >= ini,
            JournalEntry.date <= fin,
            JournalEntry.status == "POSTED"
        )
        .order_by(JournalEntry.date, JournalEntry.id)
        .all()
    )
    
    out = []
    correlativo = 1
    
    for entry in entries:
        fecha_str = entry.date.strftime('%Y%m%d')
        glosa = (entry.glosa or "").replace('|', ' ').replace('\n', ' ').strip()
        
        # Una línea por cada línea del asiento
        for line in entry.lines:
            # Obtener código de cuenta (usando relación si está cargada, o consultando directamente)
            if line.account:
                account_code = line.account.code
            else:
                # Fallback: obtener cuenta directamente de la BD
                account = db.query(Account).filter(Account.id == line.account_id).first()
                account_code = account.code if account else ""
            
            out.append([
                fecha_str,                           # 1: Fecha
                glosa,                              # 2: Glosa
                account_code,                       # 3: Código de cuenta
                f"{float(line.debit):.2f}",        # 4: Debe
                f"{float(line.credit):.2f}",       # 5: Haber
            ])
            correlativo += 1
    
    return out


def ple_libro_mayor(db: Session, company_id: int, period: str) -> List[List[str]]:
    """
    Libro Mayor Electrónico (PLE 5.2).
    
    Formato según SUNAT:
    - Columna 1: Código de cuenta
    - Columna 2: Nombre de cuenta
    - Columna 3: Fecha
    - Columna 4: Debe
    - Columna 5: Haber
    - Columna 6: Saldo
    """
    ini, fin = _period_bounds(period)
    
    period_obj = db.query(Period).filter(
        Period.company_id == company_id,
        Period.year == int(period.split('-')[0]),
        Period.month == int(period.split('-')[1])
    ).first()
    
    if not period_obj:
        return []
    
    # Obtener todas las cuentas con movimiento
    accounts = (
        db.query(Account)
        .join(EntryLine, EntryLine.account_id == Account.id)
        .join(JournalEntry, JournalEntry.id == EntryLine.entry_id)
        .filter(
            Account.company_id == company_id,
            Account.active == True,
            JournalEntry.period_id == period_obj.id,
            JournalEntry.date >= ini,
            JournalEntry.date <= fin,
            JournalEntry.status == "POSTED"
        )
        .distinct()
        .order_by(Account.code)
        .all()
    )
    
    out = []
    
    for account in accounts:
        # Obtener movimientos de la cuenta
        movements = (
            db.query(EntryLine, JournalEntry)
            .join(JournalEntry, JournalEntry.id == EntryLine.entry_id)
            .filter(
                EntryLine.account_id == account.id,
                JournalEntry.period_id == period_obj.id,
                JournalEntry.date >= ini,
                JournalEntry.date <= fin,
                JournalEntry.status == "POSTED"
            )
            .order_by(JournalEntry.date, EntryLine.id)
            .all()
        )
        
        saldo_acumulado = Decimal('0')
        
        for line, entry in movements:
            saldo_acumulado += (line.debit - line.credit)
            
            out.append([
                account.code,                       # 1: Código de cuenta
                account.name.replace('|', ' '),   # 2: Nombre de cuenta
                entry.date.strftime('%Y%m%d'),      # 3: Fecha
                f"{float(line.debit):.2f}",       # 4: Debe
                f"{float(line.credit):.2f}",      # 5: Haber
                f"{float(saldo_acumulado):.2f}",   # 6: Saldo
            ])
    
    return out


def ple_plan_cuentas(db: Session, company_id: int, period: str) -> List[List[str]]:
    """
    Plan de Cuentas Electrónico (PLE 5.3).
    
    Formato según SUNAT:
    - Columna 1: Código de cuenta
    - Columna 2: Nombre de cuenta
    - Columna 3: Tipo de cuenta (A=Activo, P=Pasivo, PN=Patrimonio, I=Ingreso, G=Gasto)
    - Columna 4: Nivel (1-4)
    """
    period_obj = db.query(Period).filter(
        Period.company_id == company_id,
        Period.year == int(period.split('-')[0]),
        Period.month == int(period.split('-')[1])
    ).first()
    
    if not period_obj:
        return []
    
    # Mapeo de tipos de cuenta PCGE a PLE
    tipo_ple_map = {
        AccountType.ASSET: "A",
        AccountType.LIABILITY: "P",
        AccountType.EQUITY: "PN",
        AccountType.INCOME: "I",
        AccountType.EXPENSE: "G",
    }
    
    # Obtener todas las cuentas activas
    accounts = (
        db.query(Account)
        .filter(
            Account.company_id == company_id,
            Account.active == True
        )
        .order_by(Account.code)
        .all()
    )
    
    out = []
    
    for account in accounts:
        tipo_ple = tipo_ple_map.get(account.type, "A")
        
        out.append([
            account.code,                           # 1: Código de cuenta
            account.name.replace('|', ' '),        # 2: Nombre de cuenta
            tipo_ple,                              # 3: Tipo de cuenta
            str(account.level),                    # 4: Nivel
        ])
    
    return out


def ple_registro_compras(db: Session, company_id: int, period: str) -> List[List[str]]:
    """
    Registro de Compras Electrónico (PLE 8.1).
    
    Formato según SUNAT (versión completa según especificación oficial):
    Según formato 8.1 v5.0 de SUNAT:
    - Columna 1: Período (AAAAMM)
    - Columna 2: Fecha de emisión (AAAAMMDD)
    - Columna 3: Fecha de vencimiento o pago (AAAAMMDD)
    - Columna 4: Tipo de comprobante (tabla 10)
    - Columna 5: Serie del comprobante
    - Columna 6: Número del comprobante
    - Columna 7: Tipo de documento proveedor (tabla 6)
    - Columna 8: Número de documento proveedor
    - Columna 9: Denominación proveedor
    - Columna 10: Base imponible
    - Columna 11: IGV
    - Columna 12: Importe total
    - Columna : Otros campos según formato oficial...
    """
    ini, fin = _period_bounds(period)
    
    purchases = (
        db.query(Purchase)
        .filter(
            Purchase.company_id == company_id,
            Purchase.issue_date >= ini,
            Purchase.issue_date <= fin
        )
        .order_by(Purchase.issue_date, Purchase.id)
        .all()
    )
    
    out = []
    correlativo = 1
    
    # Mapeo de tipos de documento (Catálogo 10 SUNAT)
    doc_type_map = {
        "FACTURA": "01",
        "BOLETA": "03",
        "RECIBO_HONORARIOS": "03",
        "NOTA_CREDITO": "07",
        "NOTA_DEBITO": "08",
    }
    
    for p in purchases:
        # Obtener datos del proveedor desde ThirdParty
        supplier = db.query(ThirdParty).filter(
            ThirdParty.id == p.supplier_id,
            ThirdParty.company_id == company_id,
            ThirdParty.type == "PROVEEDOR"
        ).first()
        
        # Tipo de documento proveedor (Catálogo 06 SUNAT)
        tipo_doc_prov = supplier.tax_id_type if supplier else "6"  # Default: RUC
        
        # Número de documento proveedor
        num_doc_prov = supplier.tax_id if supplier else str(p.supplier_id or "").zfill(11)
        
        # Denominación proveedor
        denominacion = supplier.name if supplier else "PROVEEDOR NO IDENTIFICADO"
        denominacion = denominacion.replace('|', ' ').replace('\n', ' ').strip()
        
        # Separar serie y número
        serie = p.series or ""
        numero = str(p.number) if p.number else ""
        
        # Fecha de vencimiento: usar fecha_vencimiento del modelo si existe, sino usar fecha de emisión
        fecha_vencimiento = ""
        if hasattr(p, 'fecha_vencimiento') and p.fecha_vencimiento:
            fecha_vencimiento = p.fecha_vencimiento.isoformat().replace('-', '')
        else:
            fecha_vencimiento = p.issue_date.isoformat().replace('-', '')
        
        tipo_comp = doc_type_map.get(p.doc_type, "01")
        
        # Formato completo según especificación SUNAT 8.1
        out.append([
            period.replace('-', ''),                      # 1: Período (AAAAMM)
            p.issue_date.isoformat().replace('-', ''),   # 2: Fecha emisión (AAAAMMDD)
            fecha_vencimiento,                           # 3: Fecha vencimiento/pago (AAAAMMDD)
            tipo_comp,                                   # 4: Tipo comprobante (tabla 10)
            serie,                                       # 5: Serie
            numero,                                      # 6: Número
            tipo_doc_prov,                               # 7: Tipo documento proveedor (tabla 6)
            num_doc_prov.zfill(11) if tipo_doc_prov == "6" else num_doc_prov.zfill(8),  # 8: Número documento (11 para RUC, 8 para DNI)
            denominacion[:100],                          # 9: Denominación (máx 100 chars)
            f"{float(p.base_amount):.2f}",              # 10: Base imponible
            f"{float(p.igv_amount):.2f}",                # 11: IGV
            f"{float(p.total_amount):.2f}",             # 12: Importe total
        ])
        correlativo += 1
    
    return out


def ple_registro_ventas(db: Session, company_id: int, period: str) -> List[List[str]]:
    """
    Registro de Ventas e Ingresos Electrónico (PLE 14.1).
    
    Formato según SUNAT (versión completa según especificación oficial):
    Según formato 14.1 v5.0 de SUNAT:
    - Columna 1: Período (AAAAMM)
    - Columna 2: Fecha de emisión (AAAAMMDD)
    - Columna 3: Fecha de vencimiento o pago (AAAAMMDD)
    - Columna 4: Tipo de comprobante (tabla 10)
    - Columna 5: Serie del comprobante
    - Columna 6: Número del comprobante
    - Columna 7: Tipo de documento cliente (tabla 6)
    - Columna 8: Número de documento cliente
    - Columna 9: Denominación cliente
    - Columna 10: Base imponible
    - Columna 11: IGV
    - Columna 12: Importe total
    """
    ini, fin = _period_bounds(period)
    
    sales = (
        db.query(Sale)
        .filter(
            Sale.company_id == company_id,
            Sale.issue_date >= ini,
            Sale.issue_date <= fin
        )
        .order_by(Sale.issue_date, Sale.id)
        .all()
    )
    
    out = []
    correlativo = 1
    
    # Mapeo de tipos de documento (Catálogo 10 SUNAT)
    doc_type_map = {
        "FACTURA": "01",
        "BOLETA": "03",
        "NOTA_CREDITO": "07",
        "NOTA_DEBITO": "08",
    }
    
    for s in sales:
        # Obtener datos del cliente desde ThirdParty
        customer = db.query(ThirdParty).filter(
            ThirdParty.id == s.customer_id,
            ThirdParty.company_id == company_id,
            ThirdParty.type == "CLIENTE"
        ).first()
        
        # Tipo de documento cliente (Catálogo 06 SUNAT)
        tipo_doc_cli = customer.tax_id_type if customer else "6"  # Default: RUC
        
        # Número de documento cliente
        num_doc_cli = customer.tax_id if customer else str(s.customer_id or "").zfill(11)
        
        # Denominación cliente
        denominacion = customer.name if customer else "CLIENTE NO IDENTIFICADO"
        denominacion = denominacion.replace('|', ' ').replace('\n', ' ').strip()
        
        serie = s.series or ""
        numero = str(s.number) if s.number else ""
        
        # Fecha de vencimiento: usar fecha_vencimiento del modelo si existe, sino usar fecha de emisión
        fecha_vencimiento = ""
        if hasattr(s, 'fecha_vencimiento') and s.fecha_vencimiento:
            fecha_vencimiento = s.fecha_vencimiento.isoformat().replace('-', '')
        else:
            fecha_vencimiento = s.issue_date.isoformat().replace('-', '')
        
        tipo_comp = doc_type_map.get(s.doc_type, "01")
        
        # Formato completo según especificación SUNAT 14.1
        out.append([
            period.replace('-', ''),                      # 1: Período (AAAAMM)
            s.issue_date.isoformat().replace('-', ''),    # 2: Fecha emisión (AAAAMMDD)
            fecha_vencimiento,                           # 3: Fecha vencimiento/pago (AAAAMMDD)
            tipo_comp,                                   # 4: Tipo comprobante (tabla 10)
            serie,                                       # 5: Serie
            numero,                                      # 6: Número
            tipo_doc_cli,                                # 7: Tipo documento cliente (tabla 6)
            num_doc_cli.zfill(11) if tipo_doc_cli == "6" else num_doc_cli.zfill(8),  # 8: Número documento (11 para RUC, 8 para DNI)
            denominacion[:100],                          # 9: Denominación (máx 100 chars)
            f"{float(s.base_amount):.2f}",              # 10: Base imponible
            f"{float(s.igv_amount):.2f}",               # 11: IGV
            f"{float(s.total_amount):.2f}",            # 12: Importe total
        ])
        correlativo += 1
    
    return out


def ple_caja_bancos(db: Session, company_id: int, period: str) -> List[List[str]]:
    """
    Libro Caja y Bancos Electrónico (PLE 1.1).
    
    Formato según SUNAT:
    - Columna 1: Período (AAAAMM)
    - Columna 2: Fecha (AAAAMMDD)
    - Columna 3: Código de cuenta (10.x)
    - Columna 4: Nombre de cuenta
    - Columna 5: Tipo de documento (tabla 6)
    - Columna 6: Número de documento
    - Columna 7: Descripción/Glosa
    - Columna 8: Ingresos (Cargo)
    - Columna 9: Egresos (Abono)
    - Columna 10: Saldo
    """
    ini, fin = _period_bounds(period)
    
    period_obj = db.query(Period).filter(
        Period.company_id == company_id,
        Period.year == int(period.split('-')[0]),
        Period.month == int(period.split('-')[1])
    ).first()
    
    if not period_obj:
        return []
    
    # Obtener cuentas bancarias y de caja (10.x)
    bank_accounts = (
        db.query(BankAccount)
        .join(Account, Account.id == BankAccount.account_id)
        .filter(
            BankAccount.company_id == company_id,
            BankAccount.active == True,
            Account.code.like('10%')  # Cuentas de efectivo y equivalentes
        )
        .all()
    )
    
    out = []
    
    for bank_acc in bank_accounts:
        account = bank_acc.account
        
        # Obtener movimientos desde EntryLine asociados a esta cuenta
        movements = (
            db.query(EntryLine, JournalEntry)
            .join(JournalEntry, JournalEntry.id == EntryLine.entry_id)
            .filter(
                EntryLine.account_id == account.id,
                JournalEntry.period_id == period_obj.id,
                JournalEntry.date >= ini,
                JournalEntry.date <= fin,
                JournalEntry.status == "POSTED"
            )
            .order_by(JournalEntry.date, EntryLine.id)
            .all()
        )
        
        saldo_acumulado = Decimal('0')
        
        for line, entry in movements:
            saldo_acumulado += (line.debit - line.credit)
            
            # Descripción/Glosa
            descripcion = (line.memo or entry.glosa or "").replace('|', ' ').replace('\n', ' ').strip()
            
            out.append([
                period.replace('-', ''),                # 1: Período
                entry.date.strftime('%Y%m%d'),          # 2: Fecha
                account.code,                           # 3: Código de cuenta
                account.name.replace('|', ' ')[:100],   # 4: Nombre de cuenta (máx 100 chars)
                "",                                    # 5: Tipo documento (opcional)
                "",                                    # 6: Número documento (opcional)
                descripcion[:200],                     # 7: Descripción (máx 200 chars)
                f"{float(line.debit):.2f}",            # 8: Ingresos (Cargo)
                f"{float(line.credit):.2f}",           # 9: Egresos (Abono)
                f"{float(saldo_acumulado):.2f}",       # 10: Saldo acumulado
            ])
    
    return out


def ple_inventarios_balances(db: Session, company_id: int, period: str) -> List[List[str]]:
    """
    Libro de Inventarios y Balances Electrónico (PLE 3.1).
    
    Formato según SUNAT:
    - Columna 1: Período (AAAAMM)
    - Columna 2: Código de cuenta
    - Columna 3: Nombre de cuenta
    - Columna 4: Tipo de cuenta (A=Activo, P=Pasivo, PN=Patrimonio)
    - Columna 5: Saldo inicial (Debe)
    - Columna 6: Saldo inicial (Haber)
    - Columna 7: Movimientos del período (Debe)
    - Columna 8: Movimientos del período (Haber)
    - Columna 9: Saldo final (Debe)
    - Columna 10: Saldo final (Haber)
    """
    ini, fin = _period_bounds(period)
    
    period_obj = db.query(Period).filter(
        Period.company_id == company_id,
        Period.year == int(period.split('-')[0]),
        Period.month == int(period.split('-')[1])
    ).first()
    
    if not period_obj:
        return []
    
    # Obtener todas las cuentas activas
    accounts = (
        db.query(Account)
        .filter(
            Account.company_id == company_id,
            Account.active == True
        )
        .order_by(Account.code)
        .all()
    )
    
    # Mapeo de tipos de cuenta
    tipo_ple_map = {
        AccountType.ASSET: "A",
        AccountType.LIABILITY: "P",
        AccountType.EQUITY: "PN",
        AccountType.INCOME: "I",
        AccountType.EXPENSE: "G",
    }
    
    out = []
    
    for account in accounts:
        # Obtener movimientos del período
        movements = (
            db.query(EntryLine)
            .join(JournalEntry, JournalEntry.id == EntryLine.entry_id)
            .filter(
                EntryLine.account_id == account.id,
                JournalEntry.period_id == period_obj.id,
                JournalEntry.date >= ini,
                JournalEntry.date <= fin,
                JournalEntry.status == "POSTED"
            )
            .all()
        )
        
        # Calcular saldos
        debe_periodo = sum(float(line.debit) for line in movements)
        haber_periodo = sum(float(line.credit) for line in movements)
        
        # Obtener saldo inicial (del período anterior o desde el inicio del año)
        initial_movements = (
            db.query(EntryLine)
            .join(JournalEntry, JournalEntry.id == EntryLine.entry_id)
            .join(Period, Period.id == JournalEntry.period_id)
            .filter(
                EntryLine.account_id == account.id,
                Period.company_id == company_id,
                Period.year == period_obj.year,
                Period.month < period_obj.month,
                JournalEntry.status == "POSTED"
            )
            .all()
        )
        
        debe_inicial = sum(float(line.debit) for line in initial_movements)
        haber_inicial = sum(float(line.credit) for line in initial_movements)
        
        # Calcular saldos finales
        debe_final = debe_inicial + debe_periodo
        haber_final = haber_inicial + haber_periodo
        
        # Determinar saldo (Debe o Haber según naturaleza de la cuenta)
        tipo_ple = tipo_ple_map.get(account.type, "A")
        
        # Para cuentas de Activo y Gastos: saldo = Debe - Haber
        # Para cuentas de Pasivo, Patrimonio e Ingresos: saldo = Haber - Debe
        if tipo_ple in ["A", "G"]:
            saldo_inicial_debe = max(0, debe_inicial - haber_inicial)
            saldo_inicial_haber = max(0, haber_inicial - debe_inicial)
            saldo_final_debe = max(0, debe_final - haber_final)
            saldo_final_haber = max(0, haber_final - debe_final)
        else:
            saldo_inicial_haber = max(0, haber_inicial - debe_inicial)
            saldo_inicial_debe = max(0, debe_inicial - haber_inicial)
            saldo_final_haber = max(0, haber_final - debe_final)
            saldo_final_debe = max(0, debe_final - haber_final)
        
        out.append([
            period.replace('-', ''),                    # 1: Período
            account.code,                               # 2: Código de cuenta
            account.name.replace('|', ' ')[:100],       # 3: Nombre de cuenta
            tipo_ple,                                   # 4: Tipo de cuenta
            f"{saldo_inicial_debe:.2f}",               # 5: Saldo inicial (Debe)
            f"{saldo_inicial_haber:.2f}",              # 6: Saldo inicial (Haber)
            f"{debe_periodo:.2f}",                     # 7: Movimientos período (Debe)
            f"{haber_periodo:.2f}",                    # 8: Movimientos período (Haber)
            f"{saldo_final_debe:.2f}",                 # 9: Saldo final (Debe)
            f"{saldo_final_haber:.2f}",                # 10: Saldo final (Haber)
        ])
    
    return out

