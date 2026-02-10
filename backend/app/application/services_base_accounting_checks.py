"""
Servicio para detectar asientos contables base faltantes.

Este servicio NO crea asientos automáticamente, solo detecta ausencias
y proporciona información para que el usuario decida crear los asientos.
"""
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from datetime import date, datetime
from decimal import Decimal
from typing import List, Dict, Optional
from enum import Enum

from ..domain.models import JournalEntry, EntryLine, Account, Period
from ..infrastructure.unit_of_work import UnitOfWork
from ..infrastructure.logging_config import get_logger

logger = get_logger("base_accounting_checks")


class BaseEntryType(str, Enum):
    """Tipos de asientos base que se pueden detectar"""
    OPENING = "OPENING"  # Asiento de Apertura
    CAPITAL = "CAPITAL"  # Aporte de Capital
    CLOSING = "CLOSING"  # Cierre de Resultados
    NEXT_PERIOD_OPENING = "NEXT_PERIOD_OPENING"  # Apertura del período siguiente
    INITIAL_ADJUSTMENTS = "INITIAL_ADJUSTMENTS"  # Ajustes iniciales


class Severity(str, Enum):
    """Niveles de severidad para las notificaciones"""
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"


class BaseEntryCheck:
    """Resultado de una verificación de asiento base"""
    def __init__(
        self,
        code: str,
        entry_type: BaseEntryType,
        message: str,
        severity: Severity,
        description: str,
        suggested_glosa: str,
        suggested_accounts: List[Dict[str, any]],
        period_id: Optional[int] = None,
        company_id: Optional[int] = None
    ):
        self.code = code
        self.entry_type = entry_type
        self.message = message
        self.severity = severity
        self.description = description
        self.suggested_glosa = suggested_glosa
        self.suggested_accounts = suggested_accounts  # [{code, name, side: 'debit'|'credit', suggested_amount}]
        self.period_id = period_id
        self.company_id = company_id
    
    def to_dict(self) -> Dict:
        """Convierte a diccionario para la API"""
        return {
            "code": self.code,
            "entry_type": self.entry_type.value,
            "message": self.message,
            "severity": self.severity.value,
            "description": self.description,
            "suggested_glosa": self.suggested_glosa,
            "suggested_accounts": self.suggested_accounts,
            "action": {
                "label": self._get_action_label(),
                "url": f"/journal/manual/new?type={self.entry_type.value}",
                "entry_type": self.entry_type.value
            },
            "period_id": self.period_id,
            "company_id": self.company_id
        }
    
    def _get_action_label(self) -> str:
        """Obtiene el label del botón según el tipo"""
        labels = {
            BaseEntryType.OPENING: "Crear Asiento de Apertura",
            BaseEntryType.CAPITAL: "Crear Aporte de Capital",
            BaseEntryType.CLOSING: "Crear Cierre de Resultados",
            BaseEntryType.NEXT_PERIOD_OPENING: "Crear Apertura del Período Siguiente",
            BaseEntryType.INITIAL_ADJUSTMENTS: "Crear Ajustes Iniciales"
        }
        return labels.get(self.entry_type, "Crear Asiento")


class BaseAccountingChecksService:
    """Servicio para detectar asientos contables base faltantes"""
    
    def __init__(self, uow: UnitOfWork):
        self.uow = uow
    
    def check_base_entries(
        self,
        company_id: int,
        period_id: Optional[int] = None
    ) -> List[BaseEntryCheck]:
        """
        Detecta asientos contables base faltantes.
        
        Args:
            company_id: ID de la empresa
            period_id: ID del período (opcional, si no se proporciona usa el período actual)
        
        Returns:
            Lista de checks con asientos faltantes
        """
        checks: List[BaseEntryCheck] = []
        
        # Obtener período
        if period_id:
            period = self.uow.db.query(Period).filter(Period.id == period_id).first()
        else:
            # Obtener período actual (más reciente abierto)
            period = self.uow.db.query(Period).filter(
                Period.company_id == company_id,
                Period.status == "ABIERTO"
            ).order_by(Period.year.desc(), Period.month.desc()).first()
        
        if not period:
            # Si no hay período, no se pueden hacer checks
            return checks
        
        # 1. Verificar Asiento de Apertura
        opening_check = self._check_opening_entry(company_id, period)
        if opening_check:
            checks.append(opening_check)
        
        # 2. Verificar Aporte de Capital
        capital_check = self._check_capital_entry(company_id, period)
        if capital_check:
            checks.append(capital_check)
        
        # 3. Verificar Cierre de Resultados (solo si hay actividad en el período)
        closing_check = self._check_closing_entry(company_id, period)
        if closing_check:
            checks.append(closing_check)
        
        # 4. Verificar Apertura del Período Siguiente (opcional)
        next_period_check = self._check_next_period_opening(company_id, period)
        if next_period_check:
            checks.append(next_period_check)
        
        return checks
    
    def _check_opening_entry(
        self,
        company_id: int,
        period: Period
    ) -> Optional[BaseEntryCheck]:
        """
        Verifica si existe un asiento de apertura.
        
        Regla: Si hay asientos POSTED en el período y NO existe un asiento
        con origin='SISTEMA_APERTURA' o motor_metadata indicando apertura.
        """
        # Buscar asientos de apertura
        # Primero buscar por origin
        opening_by_origin = self.uow.db.query(JournalEntry).filter(
            JournalEntry.company_id == company_id,
            JournalEntry.period_id == period.id,
            JournalEntry.status == "POSTED",
            JournalEntry.origin == "SISTEMA_APERTURA"
        ).count()
        
        # Luego buscar por motor_metadata (si no se encontró por origin)
        opening_by_metadata = 0
        if opening_by_origin == 0:
            # Buscar en motor_metadata usando una consulta separada
            entries_with_metadata = self.uow.db.query(JournalEntry).filter(
                JournalEntry.company_id == company_id,
                JournalEntry.period_id == period.id,
                JournalEntry.status == "POSTED",
                JournalEntry.motor_metadata.isnot(None)
            ).all()
            
            for entry in entries_with_metadata:
                if entry.motor_metadata and (
                    entry.motor_metadata.get('evento_tipo') == "APERTURA" or
                    entry.motor_metadata.get('entry_subtype') == "OPENING"
                ):
                    opening_by_metadata += 1
        
        opening_entries = opening_by_origin + opening_by_metadata
        
        # Contar asientos POSTED en el período
        total_posted = self.uow.db.query(JournalEntry).filter(
            JournalEntry.company_id == company_id,
            JournalEntry.period_id == period.id,
            JournalEntry.status == "POSTED"
        ).count()
        
        # Si hay asientos pero no hay apertura, es un warning
        if total_posted > 0 and opening_entries == 0:
            # Obtener cuentas sugeridas para apertura
            suggested_accounts = self._get_opening_suggested_accounts(company_id)
            
            return BaseEntryCheck(
                code="OPENING_ENTRY_MISSING",
                entry_type=BaseEntryType.OPENING,
                message="No se ha registrado el Asiento de Apertura para este período.",
                severity=Severity.WARNING,
                description=(
                    f"El período {period.year}-{period.month:02d} tiene {total_posted} asiento(s) registrado(s), "
                    "pero no se ha creado un asiento de apertura. Se recomienda crear el asiento de apertura "
                    "al inicio del ejercicio contable."
                ),
                suggested_glosa=f"Asiento de Apertura - Ejercicio {period.year}",
                suggested_accounts=suggested_accounts,
                period_id=period.id,
                company_id=company_id
            )
        
        return None
    
    def _check_capital_entry(
        self,
        company_id: int,
        period: Period
    ) -> Optional[BaseEntryCheck]:
        """
        Verifica si el saldo de capital está explicado por asientos de origen válidos.
        
        Regla mejorada: Compara el saldo contable de capital (50.xx) contra la suma
        de TODOS los asientos de origen válidos (OPENING, CAPITAL_APORTE, CAPITALIZACION, AJUSTE_PATRIMONIAL).
        Solo muestra advertencia si hay diferencia real.
        """
        # Buscar cuentas de capital (50.x)
        capital_accounts = self.uow.db.query(Account).filter(
            Account.company_id == company_id,
            Account.code.like('50.%'),
            Account.active == True
        ).all()
        
        if not capital_accounts:
            return None
        
        # Calcular saldo total de capital
        total_capital = Decimal('0.00')
        for account in capital_accounts:
            # Calcular saldo de la cuenta hasta el período actual
            debit_total = self.uow.db.query(func.coalesce(func.sum(EntryLine.debit), 0)).filter(
                EntryLine.account_id == account.id,
                EntryLine.entry_id.in_(
                    self.uow.db.query(JournalEntry.id).filter(
                        JournalEntry.company_id == company_id,
                        JournalEntry.period_id <= period.id,
                        JournalEntry.status == "POSTED"
                    )
                )
            ).scalar() or 0
            
            credit_total = self.uow.db.query(func.coalesce(func.sum(EntryLine.credit), 0)).filter(
                EntryLine.account_id == account.id,
                EntryLine.entry_id.in_(
                    self.uow.db.query(JournalEntry.id).filter(
                        JournalEntry.company_id == company_id,
                        JournalEntry.period_id <= period.id,
                        JournalEntry.status == "POSTED"
                    )
                )
            ).scalar() or 0
            
            # Para cuentas de capital, el saldo es crédito - débito
            account_balance = Decimal(str(credit_total)) - Decimal(str(debit_total))
            total_capital += account_balance
        
        # Si no hay saldo de capital, no hay nada que verificar
        if total_capital <= 0:
            return None
        
        # Obtener IDs de cuentas de capital
        capital_account_ids = [acc.id for acc in capital_accounts]
        
        # 2. Buscar TODOS los asientos de origen válido (MANUAL con subtipos específicos)
        # Nota: Incluimos variantes por compatibilidad:
        # - "OPENING" / "APERTURA" para asientos de apertura
        # - "CAPITAL" / "CAPITAL_APORTE" para aportes de capital
        valid_subtypes = ['OPENING', 'APERTURA', 'CAPITAL', 'CAPITAL_APORTE', 'CAPITALIZACION', 'AJUSTE_PATRIMONIAL']
        
        # Obtener todos los asientos POSTED con origin='MANUAL' y subtipos válidos
        origin_entries = self.uow.db.query(JournalEntry).filter(
            JournalEntry.company_id == company_id,
            JournalEntry.status == "POSTED",
            JournalEntry.origin == "MANUAL",
            JournalEntry.period_id <= period.id
        ).all()
        
        # Filtrar por subtipos válidos (en Python porque JSONB queries son complejas)
        valid_entries = []
        for entry in origin_entries:
            if entry.motor_metadata:
                entry_subtype = entry.motor_metadata.get('entry_subtype')
                # También verificar evento_tipo por compatibilidad con asientos antiguos
                evento_tipo = entry.motor_metadata.get('evento_tipo')
                
                if entry_subtype in valid_subtypes or evento_tipo == "APERTURA":
                    valid_entries.append(entry)
        
        # 3. Calcular capital explicado: suma de movimientos de capital en asientos de origen
        # SUM(HABER - DEBE) de cuentas 50.xx SOLO para asientos MANUAL con subtipos válidos
        capital_explained = Decimal('0.00')
        breakdown = {
            'OPENING': Decimal('0.00'),  # Incluye tanto "OPENING" como "APERTURA"
            'CAPITAL_APORTE': Decimal('0.00'),  # Incluye tanto "CAPITAL" como "CAPITAL_APORTE"
            'CAPITALIZACION': Decimal('0.00'),
            'AJUSTE_PATRIMONIAL': Decimal('0.00')
        }
        
        for entry in valid_entries:
            # Determinar el subtipo (puede estar en entry_subtype o evento_tipo)
            entry_subtype = entry.motor_metadata.get('entry_subtype', '') if entry.motor_metadata else ''
            evento_tipo = entry.motor_metadata.get('evento_tipo', '') if entry.motor_metadata else ''
            
            # Normalizar subtipos para el breakdown:
            # - "APERTURA" -> "OPENING"
            # - "CAPITAL" -> "CAPITAL_APORTE"
            normalized_subtype = entry_subtype
            if entry_subtype == 'APERTURA' or evento_tipo == 'APERTURA':
                normalized_subtype = 'OPENING'
            elif entry_subtype == 'CAPITAL':
                normalized_subtype = 'CAPITAL_APORTE'
            
            # Obtener líneas de capital de este asiento
            capital_lines = self.uow.db.query(EntryLine).filter(
                EntryLine.entry_id == entry.id,
                EntryLine.account_id.in_(capital_account_ids)
            ).all()
            
            # Calcular capital explicado: SUM(HABER - DEBE) de cuentas 50.xx
            entry_capital = Decimal('0.00')
            for line in capital_lines:
                # Capital explicado = crédito (HABER) - débito (DEBE) en cuentas de capital
                entry_capital += Decimal(str(line.credit or 0)) - Decimal(str(line.debit or 0))
            
            # Acumular capital explicado
            capital_explained += entry_capital
            
            # Acumular en breakdown según subtipo normalizado
            if normalized_subtype in breakdown:
                breakdown[normalized_subtype] += entry_capital
            elif entry_subtype in breakdown:
                breakdown[entry_subtype] += entry_capital
        
        # DEBUG: Calcular capital NO explicado (de otros asientos)
        # Obtener TODOS los asientos POSTED que afectan capital
        all_capital_entries = self.uow.db.query(JournalEntry).filter(
            JournalEntry.company_id == company_id,
            JournalEntry.status == "POSTED",
            JournalEntry.period_id <= period.id,
            JournalEntry.id.in_(
                self.uow.db.query(EntryLine.entry_id).filter(
                    EntryLine.account_id.in_(capital_account_ids)
                ).distinct()
            )
        ).all()
        
        # Calcular capital total de TODOS los asientos (para debugging)
        total_capital_from_all_entries = Decimal('0.00')
        unexplained_entries = []
        for entry in all_capital_entries:
            entry_capital_lines = self.uow.db.query(EntryLine).filter(
                EntryLine.entry_id == entry.id,
                EntryLine.account_id.in_(capital_account_ids)
            ).all()
            
            entry_capital_total = Decimal('0.00')
            for line in entry_capital_lines:
                entry_capital_total += Decimal(str(line.credit or 0)) - Decimal(str(line.debit or 0))
            
            total_capital_from_all_entries += entry_capital_total
            
            # Si este asiento NO está en valid_entries, es "no explicado"
            if entry not in valid_entries and abs(entry_capital_total) > Decimal('0.01'):
                unexplained_entries.append({
                    'entry_id': entry.id,
                    'origin': entry.origin,
                    'subtype': entry.motor_metadata.get('entry_subtype') if entry.motor_metadata else None,
                    'glosa': entry.glosa,
                    'capital_amount': float(entry_capital_total)
                })
        
        # Log para debugging
        logger.info(
            f"Capital check - Saldo contable: {total_capital}, "
            f"Capital explicado: {capital_explained}, "
            f"Capital de todos los asientos: {total_capital_from_all_entries}, "
            f"Asientos válidos encontrados: {len(valid_entries)}, "
            f"Asientos no explicados: {len(unexplained_entries)}"
        )
        
        # Log detallado de asientos válidos
        if valid_entries:
            logger.info(
                f"Capital check - Asientos válidos que explican capital: "
                f"{[(e.id, e.motor_metadata.get('entry_subtype') if e.motor_metadata else None, e.motor_metadata.get('evento_tipo') if e.motor_metadata else None) for e in valid_entries]}"
            )
        
        if unexplained_entries:
            logger.warning(
                f"Capital check - Asientos que afectan capital pero no tienen subtipo válido: "
                f"{unexplained_entries}"
            )
        
        # 4. Comparar saldo contable vs capital explicado
        difference = total_capital - capital_explained
        
        # Si está completamente explicado (diferencia < 0.01 para tolerar redondeos)
        if abs(difference) < Decimal('0.01'):
            # Mostrar INFO con desglose
            breakdown_parts = []
            if breakdown['OPENING'] > 0:
                breakdown_parts.append(f"Asiento de Apertura: S/ {breakdown['OPENING']:,.2f}")
            if breakdown['CAPITAL_APORTE'] > 0:
                breakdown_parts.append(f"Aportes de Capital: S/ {breakdown['CAPITAL_APORTE']:,.2f}")
            if breakdown['CAPITALIZACION'] > 0:
                breakdown_parts.append(f"Capitalizaciones: S/ {breakdown['CAPITALIZACION']:,.2f}")
            if breakdown['AJUSTE_PATRIMONIAL'] > 0:
                breakdown_parts.append(f"Ajustes Patrimoniales: S/ {breakdown['AJUSTE_PATRIMONIAL']:,.2f}")
            
            breakdown_text = "\n- ".join(breakdown_parts) if breakdown_parts else "Sin desglose disponible"
            
            return BaseEntryCheck(
                code="CAPITAL_ENTRY_VERIFIED",
                entry_type=BaseEntryType.CAPITAL,
                message=f"✅ El capital social (S/ {total_capital:,.2f}) está explicado correctamente.",
                severity=Severity.INFO,
                description=(
                    f"El capital social (S/ {total_capital:,.2f}) está explicado por:\n"
                    f"- {breakdown_text}"
                ),
                suggested_glosa="",
                suggested_accounts=[],
                period_id=period.id,
                company_id=company_id
            )
        
        # Si hay diferencia, mostrar WARNING
        suggested_accounts = [
            {
                "code": "10.10",  # Caja
                "name": "Caja",
                "side": "debit",
                "suggested_amount": None
            },
            {
                "code": "10.20",  # Bancos
                "name": "Bancos",
                "side": "debit",
                "suggested_amount": None
            },
            {
                "code": "50.10",  # Capital Social
                "name": "Capital Social",
                "side": "credit",
                "suggested_amount": float(difference)
            }
        ]
        
        # Construir descripción con desglose si hay asientos de origen
        description_parts = [
            f"El capital social presenta una diferencia de S/ {difference:,.2f} sin asiento de origen registrado."
        ]
        
        if capital_explained > 0:
            breakdown_parts = []
            if breakdown['OPENING'] > 0:
                breakdown_parts.append(f"Apertura: S/ {breakdown['OPENING']:,.2f}")
            if breakdown['CAPITAL_APORTE'] > 0:
                breakdown_parts.append(f"Aportes: S/ {breakdown['CAPITAL_APORTE']:,.2f}")
            if breakdown['CAPITALIZACION'] > 0:
                breakdown_parts.append(f"Capitalizaciones: S/ {breakdown['CAPITALIZACION']:,.2f}")
            if breakdown['AJUSTE_PATRIMONIAL'] > 0:
                breakdown_parts.append(f"Ajustes: S/ {breakdown['AJUSTE_PATRIMONIAL']:,.2f}")
            
            if breakdown_parts:
                description_parts.append(
                    f"\nCapital explicado por asientos de origen: S/ {capital_explained:,.2f} "
                    f"({', '.join(breakdown_parts)})"
                )
        
        # Agregar información sobre asientos no explicados si existen
        if unexplained_entries:
            description_parts.append(
                f"\n\n⚠️ Se detectaron {len(unexplained_entries)} asiento(s) que afectan el capital "
                f"pero no tienen subtipo válido (OPENING, CAPITAL_APORTE, etc.):"
            )
            for ue in unexplained_entries[:5]:  # Mostrar máximo 5
                description_parts.append(
                    f"\n- Asiento #{ue['entry_id']}: {ue['glosa']} "
                    f"(Origen: {ue['origin']}, Subtipo: {ue['subtype'] or 'N/A'}, "
                    f"Capital: S/ {ue['capital_amount']:,.2f})"
                )
            if len(unexplained_entries) > 5:
                description_parts.append(f"\n... y {len(unexplained_entries) - 5} asiento(s) más.")
            description_parts.append(
                "\nSolución: Marque estos asientos con el subtipo correcto (OPENING, CAPITAL_APORTE, etc.) "
                "o cree un nuevo asiento de aporte de capital para explicar la diferencia."
            )
        else:
            description_parts.append(
                "\nSe recomienda crear un asiento de aporte de capital para explicar esta diferencia."
            )
        
        return BaseEntryCheck(
            code="CAPITAL_ENTRY_MISSING",
            entry_type=BaseEntryType.CAPITAL,
            message=f"⚠️ El capital social presenta una diferencia de S/ {difference:,.2f} sin asiento de origen registrado.",
            severity=Severity.WARNING,
            description="".join(description_parts),
            suggested_glosa="Aporte de Capital" if difference > 0 else "Ajuste Patrimonial",
            suggested_accounts=suggested_accounts,
            period_id=period.id,
            company_id=company_id
        )
    
    def _check_closing_entry(
        self,
        company_id: int,
        period: Period
    ) -> Optional[BaseEntryCheck]:
        """
        Verifica si existe un asiento de cierre de resultados.
        
        Regla: Si hay actividad (ventas/gastos) en el período y NO existe cierre.
        """
        # Verificar si hay actividad en cuentas de resultado (7.x y 6.x)
        result_accounts = self.uow.db.query(Account).filter(
            Account.company_id == company_id,
            or_(
                Account.code.like('7.%'),  # Ingresos
                Account.code.like('6.%')   # Gastos
            ),
            Account.active == True
        ).all()
        
        if not result_accounts:
            return None
        
        # Verificar si hay movimientos en cuentas de resultado en este período
        has_activity = False
        for account in result_accounts:
            activity = self.uow.db.query(EntryLine).join(JournalEntry).filter(
                EntryLine.account_id == account.id,
                JournalEntry.company_id == company_id,
                JournalEntry.period_id == period.id,
                JournalEntry.status == "POSTED",
                or_(EntryLine.debit > 0, EntryLine.credit > 0)
            ).count()
            
            if activity > 0:
                has_activity = True
                break
        
        if not has_activity:
            return None
        
        # Verificar si existe asiento de cierre
        closing_by_origin = self.uow.db.query(JournalEntry).filter(
            JournalEntry.company_id == company_id,
            JournalEntry.period_id == period.id,
            JournalEntry.status == "POSTED",
            JournalEntry.origin == "SISTEMA_CIERRE"
        ).count()
        
        closing_by_metadata = 0
        if closing_by_origin == 0:
            entries_with_metadata = self.uow.db.query(JournalEntry).filter(
                JournalEntry.company_id == company_id,
                JournalEntry.period_id == period.id,
                JournalEntry.status == "POSTED",
                JournalEntry.motor_metadata.isnot(None)
            ).all()
            
            for entry in entries_with_metadata:
                if entry.motor_metadata and entry.motor_metadata.get('entry_subtype') == "CLOSING":
                    closing_by_metadata += 1
        
        closing_entries = closing_by_origin + closing_by_metadata
        
        if closing_entries == 0:
            # Verificar si el período está cerrado
            if period.status == "CERRADO":
                severity = Severity.WARNING
                message = "El período está cerrado pero no se registró el asiento de cierre de resultados."
            else:
                severity = Severity.INFO
                message = "El período tiene actividad pero aún no se ha registrado el cierre de resultados."
            
            return BaseEntryCheck(
                code="CLOSING_ENTRY_MISSING",
                entry_type=BaseEntryType.CLOSING,
                message=message,
                severity=severity,
                description=(
                    f"El período {period.year}-{period.month:02d} tiene actividad en cuentas de resultado "
                    "(ingresos/gastos), pero no se ha registrado el asiento de cierre. "
                    "Se recomienda crear el cierre antes de cerrar el período."
                ),
                suggested_glosa=f"Cierre de Resultados - {period.year}-{period.month:02d}",
                suggested_accounts=[],  # Se calculan automáticamente en el cierre
                period_id=period.id,
                company_id=company_id
            )
        
        return None
    
    def _check_next_period_opening(
        self,
        company_id: int,
        period: Period
    ) -> Optional[BaseEntryCheck]:
        """
        Verifica si existe apertura del período siguiente (opcional).
        
        Regla: Si el período actual está cerrado y existe el período siguiente,
        verificar si tiene asiento de apertura.
        """
        if period.status != "CERRADO":
            return None
        
        # Obtener período siguiente
        if period.month == 12:
            next_year = period.year + 1
            next_month = 1
        else:
            next_year = period.year
            next_month = period.month + 1
        
        next_period = self.uow.db.query(Period).filter(
            Period.company_id == company_id,
            Period.year == next_year,
            Period.month == next_month
        ).first()
        
        if not next_period:
            return None
        
        # Verificar si el período siguiente tiene asiento de apertura
        opening_by_origin = self.uow.db.query(JournalEntry).filter(
            JournalEntry.company_id == company_id,
            JournalEntry.period_id == next_period.id,
            JournalEntry.status == "POSTED",
            JournalEntry.origin == "SISTEMA_APERTURA"
        ).count()
        
        opening_by_metadata = 0
        if opening_by_origin == 0:
            entries_with_metadata = self.uow.db.query(JournalEntry).filter(
                JournalEntry.company_id == company_id,
                JournalEntry.period_id == next_period.id,
                JournalEntry.status == "POSTED",
                JournalEntry.motor_metadata.isnot(None)
            ).all()
            
            for entry in entries_with_metadata:
                if entry.motor_metadata and (
                    entry.motor_metadata.get('evento_tipo') == "APERTURA" or
                    entry.motor_metadata.get('entry_subtype') == "OPENING"
                ):
                    opening_by_metadata += 1
        
        opening_entries = opening_by_origin + opening_by_metadata
        
        if opening_entries == 0:
            suggested_accounts = self._get_opening_suggested_accounts(company_id)
            
            return BaseEntryCheck(
                code="NEXT_PERIOD_OPENING_MISSING",
                entry_type=BaseEntryType.NEXT_PERIOD_OPENING,
                message=f"No se ha registrado el asiento de apertura para el período {next_year}-{next_month:02d}.",
                severity=Severity.INFO,
                description=(
                    f"El período {period.year}-{period.month:02d} está cerrado, pero el período siguiente "
                    f"({next_year}-{next_month:02d}) no tiene asiento de apertura registrado."
                ),
                suggested_glosa=f"Asiento de Apertura - {next_year}-{next_month:02d}",
                suggested_accounts=suggested_accounts,
                period_id=next_period.id,
                company_id=company_id
            )
        
        return None
    
    def _get_opening_suggested_accounts(self, company_id: int) -> List[Dict]:
        """Obtiene cuentas sugeridas para un asiento de apertura"""
        suggested = []
        
        # Cuentas comunes de apertura
        common_accounts = [
            ("10.10", "Caja"),
            ("10.20", "Bancos"),
            ("12.10", "Clientes"),
            ("20.10", "Mercaderías"),
            ("40.10", "IGV Débito"),
            ("42.12", "Proveedores"),
            ("50.10", "Capital Social")
        ]
        
        for code, name in common_accounts:
            account = self.uow.accounts.by_code(company_id, code)
            if account:
                suggested.append({
                    "code": code,
                    "name": name,
                    "side": "debit" if code.startswith(("1", "2", "4")) else "credit",
                    "suggested_amount": None
                })
        
        return suggested



