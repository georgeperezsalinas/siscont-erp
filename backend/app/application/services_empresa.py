"""
Servicios para Dashboard Empresa
================================
Resumen financiero, estado casilla y accesos rápidos para usuarios de empresa.
"""
from decimal import Decimal
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import exists

from ..domain.models import User, Company, Period
from ..domain.models_mailbox import ElectronicMailbox, MailboxMessage, MailboxResponse
from ..infrastructure.unit_of_work import UnitOfWork
from .queries_reports import ReportQuery
from .services_mailbox import can_user_access_mailbox


def get_empresa_dashboard(
    db: Session,
    user: User,
    company_id: int,
    period: Optional[str] = None,
    period_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Obtiene el dashboard para usuarios de empresa.
    - Resumen financiero (solo lectura)
    - Estado de casilla (no leídos, pendientes)
    - Accesos rápidos
    """
    if not can_user_access_mailbox(user, company_id):
        raise PermissionError("No tiene acceso a esta empresa")

    # Resolver period_id si se pasa period (YYYY-MM)
    if period and not period_id:
        try:
            year, month = map(int, period.split("-"))
            period_obj = (
                db.query(Period)
                .filter(
                    Period.company_id == company_id,
                    Period.year == year,
                    Period.month == month,
                )
                .first()
            )
            if period_obj:
                period_id = period_obj.id
        except (ValueError, AttributeError):
            pass

    uow = UnitOfWork(db)
    try:
        report_query = ReportQuery(uow)
        # Resumen financiero (solo lectura, incluso si no hay mapeos - vendrá vacío)
        try:
            summary = report_query.get_dashboard_summary(
                company_id=company_id,
                period_id=period_id,
            )
        except Exception:
            summary = {
                "cash_and_banks": Decimal("0"),
                "igv_por_pagar": Decimal("0"),
                "accounts_receivable": Decimal("0"),
                "accounts_payable": Decimal("0"),
                "total_purchases": Decimal("0"),
                "total_sales": Decimal("0"),
            }

        # Serializar Decimal a float para JSON
        def to_float(v):
            if isinstance(v, Decimal):
                return float(v)
            return v

        financial = {
            "cash_and_banks": to_float(summary.get("cash_and_banks", 0)),
            "igv_por_pagar": to_float(summary.get("igv_por_pagar", 0)),
            "accounts_receivable": to_float(summary.get("accounts_receivable", 0)),
            "accounts_payable": to_float(summary.get("accounts_payable", 0)),
            "total_purchases": to_float(summary.get("total_purchases", 0)),
            "total_sales": to_float(summary.get("total_sales", 0)),
        }

        # Estado de casilla
        mailbox = db.query(ElectronicMailbox).filter(
            ElectronicMailbox.company_id == company_id
        ).first()

        unread_count = 0
        pending_response_count = 0

        if mailbox:
            unread_count = (
                db.query(MailboxMessage)
                .filter(
                    MailboxMessage.mailbox_id == mailbox.id,
                    MailboxMessage.is_read == False,
                )
                .count()
            )
            # Mensajes que requieren respuesta y aún no tienen respuesta
            has_response = exists().where(MailboxResponse.message_id == MailboxMessage.id)
            pending_response_count = (
                db.query(MailboxMessage)
                .filter(
                    MailboxMessage.mailbox_id == mailbox.id,
                    MailboxMessage.requires_response == True,
                    ~has_response,
                )
                .count()
            )

        mailbox_status = {
            "unread_count": unread_count,
            "pending_response_count": pending_response_count,
        }

        # Nombre de empresa
        company = db.query(Company).filter(Company.id == company_id).first()
        company_name = company.name if company else None

        return {
            "company_id": company_id,
            "company_name": company_name,
            "period": period,
            "period_id": period_id,
            "financial": financial,
            "mailbox_status": mailbox_status,
            "quick_links": [
                {"label": "Casilla Electrónica", "path": "/casilla-electronica"},
            ],
        }
    finally:
        uow.close()
