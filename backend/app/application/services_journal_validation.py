"""
Validaciones contables tipo SAP para asientos manuales.

Este módulo implementa validaciones estrictas que garantizan la integridad contable,
siguiendo principios de sistemas ERP como SAP.
"""
from decimal import Decimal
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from ..domain.models import Account, EntryLine, JournalEntry, AccountType
from ..application.dtos import EntryLineIn, JournalEntryIn


class ValidationError(Exception):
    """Error de validación que bloquea el guardado"""
    pass


class ValidationWarning:
    """Advertencia que requiere confirmación explícita"""
    def __init__(self, code: str, message: str, requires_confirmation: bool = True):
        self.code = code
        self.message = message
        self.requires_confirmation = requires_confirmation


class JournalValidationResult:
    """Resultado de validación de asiento"""
    def __init__(self):
        self.errors: List[Dict[str, str]] = []
        self.warnings: List[ValidationWarning] = []
        self.is_valid: bool = True
    
    def add_error(self, code: str, message: str):
        """Agrega un error que bloquea el guardado"""
        self.errors.append({"code": code, "message": message})
        self.is_valid = False
    
    def add_warning(self, warning: ValidationWarning):
        """Agrega una advertencia que requiere confirmación"""
        self.warnings.append(warning)


def validate_journal_entry(
    db: Session,
    company_id: int,
    entry_data: JournalEntryIn,
    lines: List[EntryLineIn],
    existing_entry: Optional[JournalEntry] = None,
    user_id: Optional[int] = None
) -> JournalValidationResult:
    """
    Valida un asiento contable con todas las reglas tipo SAP.
    
    Args:
        db: Sesión de base de datos
        company_id: ID de la empresa
        entry_data: Datos del asiento
        lines: Líneas del asiento
        existing_entry: Asiento existente (si es edición)
        user_id: ID del usuario que realiza la operación
        
    Returns:
        JournalValidationResult con errores y advertencias
    """
    result = JournalValidationResult()
    
    # 1. Validaciones duras (bloquean guardado)
    _validate_double_entry(result, lines)
    _validate_accounts_exist_and_active(result, db, company_id, lines)
    _validate_igv_rules(result, db, company_id, lines)
    _validate_cash_bank_negative(result, db, company_id, lines)
    _validate_prohibited_mixes(result, db, company_id, lines, entry_data.origin or "MANUAL")
    _validate_posted_immutability(result, existing_entry)
    
    # 2. Validaciones con advertencia (requieren confirmación)
    _validate_result_accounts_without_document(result, db, company_id, lines, entry_data.origin)
    _validate_equity_accounts_outside_closing(result, db, company_id, lines)
    _validate_manual_igv_entries(result, db, company_id, lines, entry_data.origin)
    _validate_manual_detraction_entries(result, db, company_id, lines, entry_data.origin)
    
    return result


def _validate_double_entry(result: JournalValidationResult, lines: List[EntryLineIn]):
    """Valida que el asiento cuadre (Debe = Haber)"""
    total_debit = sum(Decimal(str(line.debit)) for line in lines)
    total_credit = sum(Decimal(str(line.credit)) for line in lines)
    
    if total_debit != total_credit:
        result.add_error(
            "DOUBLE_ENTRY_MISMATCH",
            f"El asiento no cuadra: Debe={total_debit} ≠ Haber={total_credit}. "
            f"Diferencia: {abs(total_debit - total_credit)}"
        )


def _validate_accounts_exist_and_active(
    result: JournalValidationResult,
    db: Session,
    company_id: int,
    lines: List[EntryLineIn]
):
    """Valida que todas las cuentas existan y estén activas"""
    # Limpiar y filtrar códigos de cuenta válidos
    account_codes = {
        line.account_code.strip() 
        for line in lines 
        if line.account_code and line.account_code.strip()
    }
    
    if not account_codes:
        result.add_error(
            "NO_ACCOUNTS",
            "El asiento debe tener al menos una cuenta válida"
        )
        return
    
    for account_code in account_codes:
        try:
            account = db.query(Account).filter(
                Account.company_id == company_id,
                Account.code == account_code
            ).first()
            
            if not account:
                result.add_error(
                    "ACCOUNT_NOT_FOUND",
                    f"La cuenta {account_code} no existe en la empresa"
                )
            elif not account.active:
                result.add_error(
                    "ACCOUNT_INACTIVE",
                    f"La cuenta {account_code} ({account.name}) está inactiva y no puede usarse"
                )
        except Exception as e:
            result.add_error(
                "ACCOUNT_VALIDATION_ERROR",
                f"Error al validar la cuenta {account_code}: {str(e)}"
            )


def _validate_igv_rules(
    result: JournalValidationResult,
    db: Session,
    company_id: int,
    lines: List[EntryLineIn]
):
    """
    Valida reglas estrictas de IGV:
    - IGV crédito NO puede estar en HABER
    - IGV débito NO puede estar en DEBE
    """
    # Buscar cuentas de IGV
    igv_accounts = db.query(Account).filter(
        Account.company_id == company_id,
        Account.code.like("40.1%"),  # Cuentas de IGV (40.10, 40.11, etc.)
        Account.active == True
    ).all()
    
    igv_account_ids = {acc.id for acc in igv_accounts}
    igv_account_codes = {acc.code for acc in igv_accounts}
    
    # Buscar mapeos de IGV para identificar tipo
    from ..domain.models_journal_engine import TipoCuentaMapeo
    mapeo_igv_debito = db.query(TipoCuentaMapeo).filter_by(
        tipo_cuenta="IGV_DEBITO",
        company_id=company_id,
        activo=True
    ).first()
    
    mapeo_igv_credito = db.query(TipoCuentaMapeo).filter_by(
        tipo_cuenta="IGV_CREDITO",
        company_id=company_id,
        activo=True
    ).first()
    
    igv_debito_codes = {mapeo_igv_debito.account.code} if mapeo_igv_debito else set()
    igv_credito_codes = {mapeo_igv_credito.account.code} if mapeo_igv_credito else set()
    
    for line in lines:
        if line.account_code in igv_debito_codes:
            # IGV débito debe estar en HABER (crédito)
            if line.debit > 0:
                result.add_error(
                    "IGV_DEBITO_IN_DEBE",
                    f"IGV débito ({line.account_code}) no puede estar en DEBE. "
                    f"Debe estar en HABER (crédito)."
                )
        
        if line.account_code in igv_credito_codes:
            # IGV crédito debe estar en DEBE
            if line.credit > 0:
                result.add_error(
                    "IGV_CREDITO_IN_HABER",
                    f"IGV crédito ({line.account_code}) no puede estar en HABER. "
                    f"Debe estar en DEBE."
                )


def _validate_cash_bank_negative(
    result: JournalValidationResult,
    db: Session,
    company_id: int,
    lines: List[EntryLineIn]
):
    """
    Valida que Caja y Banco no queden negativos.
    Nota: En un sistema real, esto requeriría calcular el saldo actual.
    Por ahora, validamos que no haya movimientos que claramente causen negativo.
    """
    # Buscar cuentas de Caja (10.1x) y Banco (10.2x)
    cash_bank_accounts = db.query(Account).filter(
        Account.company_id == company_id,
        Account.code.like("10.1%") | Account.code.like("10.2%"),
        Account.active == True
    ).all()
    
    cash_bank_codes = {acc.code for acc in cash_bank_accounts}
    
    for line in lines:
        if line.account_code in cash_bank_codes:
            # Si hay un crédito (salida) sin un debe correspondiente, podría causar negativo
            # Esta validación es básica; en producción se calcularía el saldo real
            if line.credit > 0 and line.debit == 0:
                result.add_warning(
                    ValidationWarning(
                        code="CASH_BANK_POTENTIAL_NEGATIVE",
                        message=f"Movimiento de salida en {line.account_code} podría causar saldo negativo. "
                                f"Verifique el saldo disponible antes de postear.",
                        requires_confirmation=True
                    )
                )


def _validate_prohibited_mixes(
    result: JournalValidationResult,
    db: Session,
    company_id: int,
    lines: List[EntryLineIn],
    origin: str = "MANUAL"
):
    """
    Valida que no se mezclen:
    - IGV con tesorería sin documento base
    - IGV con ingresos/gastos sin documento base
    
    Para asientos MANUALES, esto es una advertencia que requiere confirmación.
    Para asientos del MOTOR, esto es un error que bloquea.
    """
    # Identificar tipos de cuentas en el asiento
    account_codes = {line.account_code.strip() for line in lines if line.account_code and line.account_code.strip()}
    
    if not account_codes:
        return
    
    # Buscar cuentas de IGV
    from ..domain.models_journal_engine import TipoCuentaMapeo
    mapeo_igv = db.query(TipoCuentaMapeo).filter(
        TipoCuentaMapeo.company_id == company_id,
        TipoCuentaMapeo.tipo_cuenta.in_(["IGV_DEBITO", "IGV_CREDITO"]),
        TipoCuentaMapeo.activo == True
    ).all()
    
    igv_codes = {m.account.code for m in mapeo_igv}
    has_igv = bool(account_codes & igv_codes)
    
    if has_igv:
        # Buscar cuentas de tesorería (10.x)
        treasury_accounts = db.query(Account).filter(
            Account.company_id == company_id,
            Account.code.like("10.%"),
            Account.active == True
        ).all()
        treasury_codes = {acc.code for acc in treasury_accounts}
        has_treasury = bool(account_codes & treasury_codes)
        
        # Buscar cuentas de ingresos (70.x) y gastos (60.x, 90.x)
        income_expense_accounts = db.query(Account).filter(
            Account.company_id == company_id,
            (Account.code.like("70.%") | Account.code.like("60.%") | Account.code.like("90.%")),
            Account.active == True
        ).all()
        income_expense_codes = {acc.code for acc in income_expense_accounts}
        has_income_expense = bool(account_codes & income_expense_codes)
        
        if has_treasury:
            if origin == "MANUAL":
                # Para asientos manuales, es una advertencia que requiere confirmación
                result.add_warning(
                    ValidationWarning(
                        code="IGV_WITH_TREASURY",
                        message="Asiento manual mezcla IGV con cuentas de tesorería (Caja/Banco). "
                                "Asegúrese de que existe un documento base (factura, comprobante) que justifique este asiento. "
                                "Si no hay documento, considere usar el módulo de Ventas/Compras.",
                        requires_confirmation=True
                    )
                )
            else:
                # Para asientos del motor, es un error que bloquea
                result.add_error(
                    "IGV_WITH_TREASURY",
                    "No se permite mezclar IGV con cuentas de tesorería (Caja/Banco) "
                    "sin un documento base (factura, comprobante). Use el módulo de Ventas/Compras."
                )
        
        if has_income_expense:
            result.add_warning(
                ValidationWarning(
                    code="IGV_WITH_INCOME_EXPENSE",
                    message="Asiento manual mezcla IGV con ingresos/gastos. "
                            "Asegúrese de que existe un documento base (factura, comprobante) que justifique este asiento.",
                    requires_confirmation=True
                )
            )


def _validate_posted_immutability(
    result: JournalValidationResult,
    existing_entry: Optional[JournalEntry]
):
    """Valida que no se modifiquen asientos POSTED"""
    if existing_entry and existing_entry.status == "POSTED":
        result.add_error(
            "POSTED_IMMUTABLE",
            f"No se puede modificar el asiento #{existing_entry.id} porque está POSTED. "
            f"Para corregir, debe crear un asiento de reversión."
        )


def _validate_result_accounts_without_document(
    result: JournalValidationResult,
    db: Session,
    company_id: int,
    lines: List[EntryLineIn],
    origin: str
):
    """Advierte sobre uso de cuentas de resultado sin documento"""
    if origin != "MANUAL":
        return  # Solo validar asientos manuales
    
    # Buscar cuentas de resultado (70.x ingresos, 60.x/90.x gastos)
    result_accounts = db.query(Account).filter(
        Account.company_id == company_id,
        (Account.code.like("70.%") | Account.code.like("60.%") | Account.code.like("90.%")),
        Account.active == True
    ).all()
    
    result_codes = {acc.code for acc in result_accounts}
    account_codes = {line.account_code for line in lines}
    
    if account_codes & result_codes:
        result.add_warning(
            ValidationWarning(
                code="RESULT_ACCOUNTS_WITHOUT_DOCUMENT",
                message="Asiento manual afecta cuentas de resultado (ingresos/gastos) sin documento base. "
                        "Asegúrese de que existe justificación documental.",
                requires_confirmation=True
            )
        )


def _validate_equity_accounts_outside_closing(
    result: JournalValidationResult,
    db: Session,
    company_id: int,
    lines: List[EntryLineIn]
):
    """Advierte sobre uso de cuentas patrimoniales fuera de cierre"""
    # Buscar cuentas patrimoniales (50.x, 51.x, 52.x)
    equity_accounts = db.query(Account).filter(
        Account.company_id == company_id,
        (Account.code.like("50.%") | Account.code.like("51.%") | Account.code.like("52.%")),
        Account.active == True
    ).all()
    
    equity_codes = {acc.code for acc in equity_accounts}
    account_codes = {line.account_code for line in lines}
    
    if account_codes & equity_codes:
        result.add_warning(
            ValidationWarning(
                code="EQUITY_ACCOUNTS_OUTSIDE_CLOSING",
                message="Asiento afecta cuentas patrimoniales fuera del proceso de cierre. "
                        "Estas cuentas normalmente se ajustan solo en cierre de ejercicio.",
                requires_confirmation=True
            )
        )


def _validate_manual_igv_entries(
    result: JournalValidationResult,
    db: Session,
    company_id: int,
    lines: List[EntryLineIn],
    origin: str
):
    """Advierte sobre asientos manuales que afectan IGV"""
    if origin != "MANUAL":
        return
    
    # Buscar cuentas de IGV
    from ..domain.models_journal_engine import TipoCuentaMapeo
    mapeo_igv = db.query(TipoCuentaMapeo).filter(
        TipoCuentaMapeo.company_id == company_id,
        TipoCuentaMapeo.tipo_cuenta.in_(["IGV_DEBITO", "IGV_CREDITO"]),
        TipoCuentaMapeo.activo == True
    ).all()
    
    igv_codes = {m.account.code for m in mapeo_igv}
    account_codes = {line.account_code for line in lines}
    
    if account_codes & igv_codes:
        result.add_warning(
            ValidationWarning(
                code="MANUAL_IGV_ENTRY",
                message="Asiento manual afecta IGV. Los asientos de IGV normalmente se generan "
                        "automáticamente desde facturas/compras. Asegúrese de que este asiento es necesario.",
                requires_confirmation=True
            )
        )


def _validate_manual_detraction_entries(
    result: JournalValidationResult,
    db: Session,
    company_id: int,
    lines: List[EntryLineIn],
    origin: str
):
    """Advierte sobre asientos manuales que afectan detracciones"""
    if origin != "MANUAL":
        return
    
    # Buscar cuentas de detracciones
    from ..domain.models_journal_engine import TipoCuentaMapeo
    mapeo_detracciones = db.query(TipoCuentaMapeo).filter_by(
        tipo_cuenta="DETRACCIONES",
        company_id=company_id,
        activo=True
    ).first()
    
    if mapeo_detracciones:
        detraction_code = mapeo_detracciones.account.code
        account_codes = {line.account_code for line in lines}
        
        if detraction_code in account_codes:
            result.add_warning(
                ValidationWarning(
                    code="MANUAL_DETRACTION_ENTRY",
                    message="Asiento manual afecta detracciones. Las detracciones normalmente se generan "
                            "automáticamente desde ventas con detracción. Asegúrese de que este asiento es necesario.",
                    requires_confirmation=True
                )
            )

