"""
Servicios de Integración entre Módulos
========================================

Siguiendo la metodología de "ensamblaje de carro":
- Cada módulo es independiente (Compras, Ventas, Asientos)
- Se acoplan a través de interfaces claras definidas aquí
- UnitOfWork es el "chassis" que une todo
"""
from decimal import Decimal
from datetime import date
from typing import Tuple, Optional
from ..infrastructure.unit_of_work import UnitOfWork
from ..domain.models_ext import Purchase, Sale, PurchaseLine, SaleLine
from ..domain.models import JournalEntry
from .services_pe import registrar_compra, registrar_venta
from .services_audit import log_audit, MODULE_COMPRAS, MODULE_VENTAS, ACTION_CREATE


def registrar_compra_con_asiento(
    uow: UnitOfWork,
    company_id: int,
    doc_type: str,
    series: str,
    number: str,
    issue_date: date,
    supplier_id: int,
    currency: str,
    base_amount: Decimal | None = None,
    glosa: str | None = None,
    lines: list[dict] | None = None,  # Lista de líneas: [{description, quantity, unit_price}]
    user_id: Optional[int] = None,
) -> Tuple[Purchase, JournalEntry]:
    """
    Integración acoplada: Compra + Asiento Contable
    
    Este servicio integra dos módulos independientes:
    1. Módulo Compras: Crea el documento de compra (con o sin líneas)
    2. Módulo Asientos: Crea el asiento contable automáticamente
    
    Args:
        uow: UnitOfWork (el "chassis")
        base_amount: Base imponible (opcional si se proporcionan lines)
        lines: Lista de líneas de detalle (opcional, si no se usa base_amount)
        
    Returns:
        (Purchase, JournalEntry): Documento y asiento creados y enlazados
    """
    from ..application.services_pe import registrar_compra, registrar_compra_con_lineas
    
    glosa_final = glosa or f"Compra {doc_type}-{series}-{number}"
    
    # Si hay líneas, usar el servicio con líneas
    if lines and len(lines) > 0:
        compra, entry = registrar_compra_con_lineas(
            uow,
            company_id=company_id,
            doc_type=doc_type,
            series=series,
            number=number,
            issue_date=issue_date,
            supplier_id=supplier_id,
            currency=currency,
            purchase_lines=lines,
            glosa=glosa_final,
            user_id=user_id,
        )
    else:
        # Backward compatibility: usar base_amount único
        if base_amount is None:
            raise ValueError("Debe proporcionar base_amount o lines")
        compra, entry = registrar_compra(
            uow,
            company_id=company_id,
            doc_type=doc_type,
            series=series,
            number=number,
            issue_date=issue_date,
            supplier_id=supplier_id,
            currency=currency,
            base=base_amount,
            glosa=glosa_final,
            user_id=user_id,
        )

    log_audit(
        uow.db,
        module=MODULE_COMPRAS,
        action=ACTION_CREATE,
        entity_type="Purchase",
        entity_id=compra.id,
        summary=f"Compra registrada: {doc_type}-{series}-{number}",
        metadata_={"doc_type": doc_type, "series": series, "number": number, "supplier_id": supplier_id},
        user_id=user_id,
        company_id=company_id,
    )

    return compra, entry


def registrar_venta_con_asiento(
    uow: UnitOfWork,
    company_id: int,
    doc_type: str,
    series: str,
    number: str,
    issue_date: date,
    customer_id: int,
    currency: str,
    base_amount: Decimal | None = None,
    glosa: str | None = None,
    lines: list[dict] | None = None,  # Lista de líneas: [{description, quantity, unit_price}]
    detraction_rate: Decimal | None = None,  # Tasa de detracción (ej: 0.12 para 12%)
    user_id: Optional[int] = None,
) -> Tuple[Sale, JournalEntry]:
    """
    Integración acoplada: Venta + Asiento Contable
    
    Similar a registrar_compra_con_asiento pero para ventas.
    Soporta múltiples líneas de detalle y detracciones.
    """
    from ..application.services_pe import registrar_venta, registrar_venta_con_lineas
    
    glosa_final = glosa or f"Venta {doc_type}-{series}-{number}"
    
    # Si hay líneas, usar el servicio con líneas
    if lines and len(lines) > 0:
        venta, entry = registrar_venta_con_lineas(
            uow,
            company_id=company_id,
            doc_type=doc_type,
            series=series,
            number=number,
            issue_date=issue_date,
            customer_id=customer_id,
            currency=currency,
            sale_lines=lines,
            glosa=glosa_final,
            detraction_rate=detraction_rate,
            user_id=user_id,
        )
    else:
        # Backward compatibility: usar base_amount único
        if base_amount is None:
            raise ValueError("Debe proporcionar base_amount o lines")
        venta, entry = registrar_venta(
            uow,
            company_id=company_id,
            doc_type=doc_type,
            series=series,
            number=number,
            issue_date=issue_date,
            customer_id=customer_id,
            currency=currency,
            base=base_amount,
            glosa=glosa_final,
            user_id=user_id,
        )

    log_audit(
        uow.db,
        module=MODULE_VENTAS,
        action=ACTION_CREATE,
        entity_type="Sale",
        entity_id=venta.id,
        summary=f"Venta registrada: {doc_type}-{series}-{number}",
        metadata_={"doc_type": doc_type, "series": series, "number": number, "customer_id": customer_id},
        user_id=user_id,
        company_id=company_id,
    )

    return venta, entry


def crear_asiento_desde_documento(
    uow: UnitOfWork,
    documento_tipo: str,  # "COMPRA" o "VENTA"
    documento_id: int,
    company_id: int,
    issue_date: date,
    glosa: str,
    lines_data: list
) -> JournalEntry:
    """
    Crea un asiento contable desde cualquier documento.
    
    Esta es la interfaz genérica para acoplar cualquier módulo
    (Compras, Ventas, Inventarios, etc.) con Asientos.
    
    Args:
        uow: UnitOfWork
        documento_tipo: Tipo de documento origen ("COMPRA", "VENTA", etc.)
        documento_id: ID del documento que originó el asiento
        company_id: ID de la empresa
        issue_date: Fecha del documento
        glosa: Descripción del asiento
        lines_data: Lista de líneas contables (dicts o EntryLineIn)
        
    Returns:
        JournalEntry: Asiento creado
    """
    from .dtos import JournalEntryIn
    from .services import post_journal_entry
    
    dto = JournalEntryIn(
        company_id=company_id,
        date=issue_date,
        glosa=glosa,
        currency="PEN",
        exchange_rate=Decimal("1.0"),
        origin=documento_tipo.upper(),
        lines=lines_data
    )
    
    return post_journal_entry(uow, dto)

