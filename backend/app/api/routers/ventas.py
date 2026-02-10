from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from datetime import date
from decimal import Decimal
from sqlalchemy.orm import Session, selectinload
from typing import List, Optional
from ...dependencies import get_db
from ...security.auth import get_current_user
from ...domain.models import User
from ...infrastructure.unit_of_work import UnitOfWork
from ...application.services_integration import registrar_venta_con_asiento
from ...application.services import patch_journal_entry
from ...application.services_payments import registrar_cobro_venta, obtener_saldo_pendiente_venta
from ...domain.models_ext import Sale
from ...domain.models import JournalEntry, EntryLine
from ...application.dtos import JournalEntryIn, EntryLineIn

router = APIRouter(prefix="/ventas", tags=["ventas"])

class SaleLineIn(BaseModel):
    line_number: int = 1
    description: str
    quantity: Decimal
    unit_price: Decimal
    product_id: int | None = None  # Producto de inventario (opcional)

class VentaIn(BaseModel):
    company_id: int
    doc_type: str = "01"
    series: str
    number: str
    issue_date: date
    customer_id: int
    currency: str = "PEN"
    lines: list[SaleLineIn]  # Lista de líneas de la factura
    base_amount: Decimal | None = None  # Opcional: si se proporciona, se usa; si no, se calcula de lines
    glosa: str | None = None  # Opcional: se genera automáticamente
    detraction_rate: Decimal | None = None  # Tasa de detracción (ej: 0.12 para 12%, 0.06 para 6%)

class VentaUpdate(BaseModel):
    doc_type: str | None = None
    series: str | None = None
    number: str | None = None
    issue_date: date | None = None
    customer_id: int | None = None
    currency: str | None = None
    base_amount: Decimal | None = None
    lines: list[SaleLineIn] | None = None  # Líneas de detalle para actualizar
    glosa: str | None = None
    detraction_rate: Decimal | None = None  # Tasa de detracción (ej: 0.12 para 12%, 0.06 para 6%)

class VentaOut(BaseModel):
    venta_id: int
    journal_entry_id: int
    doc_type: str
    series: str
    number: str
    issue_date: date
    customer_id: int
    total_amount: Decimal
    glosa: str | None = None
    detraction_rate: Decimal | None = None
    detraction_amount: Decimal | None = None
    net_amount: Decimal | None = None
    has_journal_entry: bool = False
    journal_entry_status: str | None = None

class SaleLineOut(BaseModel):
    id: int
    line_number: int
    description: str
    quantity: Decimal
    unit_price: Decimal
    base_amount: Decimal
    igv_amount: Decimal
    total_amount: Decimal

class VentaConLineasOut(VentaOut):
    lines: list[SaleLineOut] = []

@router.post("", response_model=VentaOut)
def post_venta(
    payload: VentaIn,
    current_user: User = Depends(get_current_user),
):
    """
    Crea una venta con su asiento contable automático.
    
    ✅ INTEGRACIÓN ACOPLADA: Al crear una venta, automáticamente se crea
       el asiento contable siguiendo la metodología de ensamblaje.
       
    ✅ SOPORTA MÚLTIPLES LÍNEAS: Puede recibir una lista de líneas (products/servicios)
       o un base_amount único (backward compatibility).
       
    El asiento se crea con:
    - Glosa: "Venta {doc_type}-{series}-{number}" (o la proporcionada)
    - Origen: "VENTAS"
    - Líneas: Según PCGE (12.1 Clientes Debe, 70.10 Ventas Crédito, 40.11 IGV Crédito)
    """
    uow = UnitOfWork()  # ← El "chassis" que une todo
    try:
        # Convertir SaleLineIn a dict para el servicio
        lines_dict = None
        if payload.lines and len(payload.lines) > 0:
            lines_dict = [
                {
                    'description': line.description,
                    'quantity': line.quantity,
                    'unit_price': line.unit_price,
                    'product_id': line.product_id  # Pasar product_id al servicio
                }
                for line in payload.lines
            ]
        
        # ✅ Servicio de integración: acopla Ventas + Asientos
        venta, entry = registrar_venta_con_asiento(
            uow,
            company_id=payload.company_id,
            doc_type=payload.doc_type,
            series=payload.series,
            number=payload.number,
            issue_date=payload.issue_date,
            customer_id=payload.customer_id,
            currency=payload.currency,
            base_amount=payload.base_amount,
            lines=lines_dict,
            glosa=payload.glosa,
            detraction_rate=payload.detraction_rate,
            user_id=current_user.id,
        )
        uow.commit()
        
        return VentaOut(
            venta_id=venta.id,
            journal_entry_id=entry.id,
            doc_type=venta.doc_type,
            series=venta.series,
            number=venta.number,
            issue_date=venta.issue_date,
            customer_id=venta.customer_id,
            total_amount=venta.total_amount,
            glosa=venta.glosa,
            detraction_rate=float(venta.detraction_rate) if venta.detraction_rate else None,
            detraction_amount=float(venta.detraction_amount) if venta.detraction_amount else None,
            net_amount=float(venta.net_amount) if venta.net_amount else None,
            has_journal_entry=True,
            journal_entry_status=entry.status
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        uow.close()


@router.get("", response_model=List[VentaOut])
def list_ventas(
    company_id: int = Query(..., description="ID de la empresa"),
    period: Optional[str] = Query(None, description="Período YYYY-MM (opcional)"),
    db: Session = Depends(get_db),
):
    """
    Lista todas las ventas de una empresa con su estado de asiento.
    
    ✅ Muestra claramente si cada venta tiene un asiento contable generado.
    Si se proporciona period (YYYY-MM), filtra las ventas por ese período.
    """
    from datetime import date
    from ...domain.models import Period
    
    ventas_query = db.query(Sale).filter(Sale.company_id == company_id)
    
    # Filtrar por período si se proporciona
    if period:
        try:
            year, month = map(int, period.split("-"))
            # Buscar el período correspondiente
            period_obj = db.query(Period).filter(
                Period.company_id == company_id,
                Period.year == year,
                Period.month == month
            ).first()
            
            if period_obj:
                # Filtrar por fecha dentro del período
                start_date = date(year, month, 1)
                if month == 12:
                    end_date = date(year + 1, 1, 1)
                else:
                    end_date = date(year, month + 1, 1)
                ventas_query = ventas_query.filter(
                    Sale.issue_date >= start_date,
                    Sale.issue_date < end_date
                )
        except:
            pass  # Si el formato es inválido, ignorar el filtro
    
    ventas = ventas_query.order_by(Sale.issue_date.desc(), Sale.id.desc()).all()
    
    result = []
    for venta in ventas:
        # Verificar si tiene asiento generado
        entry = None
        if venta.journal_entry_id:
            entry = db.query(JournalEntry).filter(JournalEntry.id == venta.journal_entry_id).first()
        
        result.append(VentaOut(
            venta_id=venta.id,
            journal_entry_id=venta.journal_entry_id or 0,
            doc_type=venta.doc_type,
            series=venta.series,
            number=venta.number,
            issue_date=venta.issue_date,
            customer_id=venta.customer_id,
            total_amount=venta.total_amount,
            glosa=venta.glosa,
            detraction_rate=float(venta.detraction_rate) if venta.detraction_rate else None,
            detraction_amount=float(venta.detraction_amount) if venta.detraction_amount else None,
            net_amount=float(venta.net_amount) if venta.net_amount else None,
            has_journal_entry=venta.journal_entry_id is not None,
            journal_entry_status=entry.status if entry else None,
        ))
    
    return result


@router.get("/{venta_id}", response_model=VentaConLineasOut)
def get_venta(venta_id: int, db: Session = Depends(get_db)):
    """Obtiene una venta específica con su estado de asiento y líneas de detalle"""
    from ...domain.models_ext import SaleLine
    
    venta = db.query(Sale).options(selectinload(Sale.lines)).filter(Sale.id == venta_id).first()
    if not venta:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    
    entry = None
    if venta.journal_entry_id:
        entry = db.query(JournalEntry).filter(JournalEntry.id == venta.journal_entry_id).first()
    
    # Convertir líneas a DTOs
    lines_out = []
    if venta.lines:
        for line in sorted(venta.lines, key=lambda l: l.line_number):
            lines_out.append(SaleLineOut(
                id=line.id,
                line_number=line.line_number,
                description=line.description,
                quantity=line.quantity,
                unit_price=line.unit_price,
                base_amount=line.base_amount,
                igv_amount=line.igv_amount,
                total_amount=line.total_amount
            ))
    
    return VentaConLineasOut(
        venta_id=venta.id,
        journal_entry_id=venta.journal_entry_id or 0,
        doc_type=venta.doc_type,
        series=venta.series,
        number=venta.number,
        issue_date=venta.issue_date,
        customer_id=venta.customer_id,
        total_amount=venta.total_amount,
        glosa=venta.glosa,
        detraction_rate=float(venta.detraction_rate) if venta.detraction_rate else None,
        detraction_amount=float(venta.detraction_amount) if venta.detraction_amount else None,
        net_amount=float(venta.net_amount) if venta.net_amount else None,
        has_journal_entry=venta.journal_entry_id is not None,
        journal_entry_status=entry.status if entry else None,
        lines=lines_out
    )


@router.patch("/{venta_id}", response_model=VentaOut)
def update_venta(venta_id: int, payload: VentaUpdate, db: Session = Depends(get_db)):
    """
    Actualiza una venta y su asiento contable asociado.
    
    ✅ Si cambia el monto base, fecha o glosa, se actualiza el asiento automáticamente.
    """
    venta = db.query(Sale).filter(Sale.id == venta_id).first()
    if not venta:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    
    uow = UnitOfWork()
    try:
        # Obtener venta dentro del UoW
        venta_uow = uow.db.query(Sale).filter(Sale.id == venta_id).first()
        if not venta_uow:
            raise HTTPException(status_code=404, detail="Venta no encontrada")
        
        # Actualizar campos de la venta
        update_data = payload.model_dump(exclude_unset=True)
        
        # Si se proporcionan líneas, actualizar las líneas de detalle
        if 'lines' in update_data and payload.lines is not None:
            from ...domain.models_ext import SaleLine
            
            # Eliminar líneas antiguas
            uow.db.query(SaleLine).filter(SaleLine.sale_id == venta_id).delete()
            
            # Crear nuevas líneas y calcular totales
            total_base = Decimal('0')
            total_igv = Decimal('0')
            total_total = Decimal('0')
            
            for idx, line_data in enumerate(payload.lines):
                quantity = Decimal(str(line_data.quantity)).quantize(Decimal('0.0001'))
                unit_price = Decimal(str(line_data.unit_price)).quantize(Decimal('0.01'))
                base = (quantity * unit_price).quantize(Decimal('0.01'))
                igv = (base * Decimal('0.18')).quantize(Decimal('0.01'))
                total = (base + igv).quantize(Decimal('0.01'))
                
                sale_line = SaleLine(
                    sale_id=venta_id,
                    line_number=idx + 1,
                    description=line_data.description,
                    quantity=quantity,
                    unit_price=unit_price,
                    base_amount=base,
                    igv_amount=igv,
                    total_amount=total
                )
                uow.db.add(sale_line)
                
                total_base += base
                total_igv += igv
                total_total += total
            
            # Actualizar montos de la venta desde las líneas
            venta_uow.base_amount = total_base
            venta_uow.igv_amount = total_igv
            venta_uow.total_amount = total_total
            
            # Calcular detracción si se proporciona tasa
            detraction_rate = payload.detraction_rate if payload.detraction_rate is not None else venta_uow.detraction_rate
            if detraction_rate and detraction_rate > 0:
                detraction_rate_decimal = Decimal(str(detraction_rate)).quantize(Decimal('0.0001'))
                detraction_amount = (total_total * detraction_rate_decimal).quantize(Decimal('0.01'))
                net_amount = (total_total - detraction_amount).quantize(Decimal('0.01'))
                venta_uow.detraction_rate = detraction_rate_decimal
                venta_uow.detraction_amount = detraction_amount
                venta_uow.net_amount = net_amount
            else:
                venta_uow.detraction_rate = None
                venta_uow.detraction_amount = None
                venta_uow.net_amount = total_total
            
            update_data.pop('lines')
        
        # Si cambia base_amount (sin líneas), recalcular IGV y total
        elif 'base_amount' in update_data:
            base = Decimal(str(update_data['base_amount'])).quantize(Decimal('0.01'))
            venta_uow.base_amount = base
            venta_uow.igv_amount = (base * Decimal('0.18')).quantize(Decimal('0.01'))
            total_total = (base * Decimal('1.18')).quantize(Decimal('0.01'))
            venta_uow.total_amount = total_total
            
            # Calcular detracción si se proporciona tasa
            detraction_rate = payload.detraction_rate if payload.detraction_rate is not None else venta_uow.detraction_rate
            if detraction_rate and detraction_rate > 0:
                detraction_rate_decimal = Decimal(str(detraction_rate)).quantize(Decimal('0.0001'))
                detraction_amount = (total_total * detraction_rate_decimal).quantize(Decimal('0.01'))
                net_amount = (total_total - detraction_amount).quantize(Decimal('0.01'))
                venta_uow.detraction_rate = detraction_rate_decimal
                venta_uow.detraction_amount = detraction_amount
                venta_uow.net_amount = net_amount
            else:
                venta_uow.detraction_rate = None
                venta_uow.detraction_amount = None
                venta_uow.net_amount = total_total
            
            update_data.pop('base_amount')
        
        # Si solo cambia la tasa de detracción, recalcular
        if 'detraction_rate' in update_data and 'lines' not in update_data and 'base_amount' not in update_data:
            detraction_rate = payload.detraction_rate
            total_total = venta_uow.total_amount
            if detraction_rate and detraction_rate > 0:
                detraction_rate_decimal = Decimal(str(detraction_rate)).quantize(Decimal('0.0001'))
                detraction_amount = (total_total * detraction_rate_decimal).quantize(Decimal('0.01'))
                net_amount = (total_total - detraction_amount).quantize(Decimal('0.01'))
                venta_uow.detraction_rate = detraction_rate_decimal
                venta_uow.detraction_amount = detraction_amount
                venta_uow.net_amount = net_amount
            else:
                venta_uow.detraction_rate = None
                venta_uow.detraction_amount = None
                venta_uow.net_amount = total_total
            update_data.pop('detraction_rate')
        
        # Actualizar otros campos
        if 'series' in update_data:
            venta_uow.series = update_data['series']
        if 'number' in update_data:
            venta_uow.number = update_data['number']
        if 'doc_type' in update_data:
            venta_uow.doc_type = update_data['doc_type']
        if 'issue_date' in update_data:
            venta_uow.issue_date = update_data['issue_date']
        if 'customer_id' in update_data:
            venta_uow.customer_id = update_data['customer_id']
        if 'currency' in update_data:
            venta_uow.currency = update_data['currency']
        if 'glosa' in update_data:
            venta_uow.glosa = update_data['glosa']
        
        # Actualizar asiento si existe y cambió algo que lo afecta
        if venta_uow.journal_entry_id:
            entry = uow.db.query(JournalEntry).filter(JournalEntry.id == venta_uow.journal_entry_id).first()
            if entry:
                # Regenerar líneas del asiento si cambió base_amount, líneas, detraction_rate, issue_date o glosa
                needs_update = (
                    'lines' in payload.model_dump(exclude_unset=True) or
                    'base_amount' in payload.model_dump(exclude_unset=True) or 
                    'detraction_rate' in payload.model_dump(exclude_unset=True) or
                    'issue_date' in payload.model_dump(exclude_unset=True) or 
                    payload.glosa is not None
                )
                
                if needs_update:
                    from ...application.services_journal_engine import MotorAsientos
                    from ...domain.models import EntryLine
                    
                    # Generar nueva glosa
                    glosa_final = payload.glosa if payload.glosa is not None else f"Venta {venta_uow.doc_type}-{venta_uow.series}-{venta_uow.number}"
                    
                    # Regenerar asiento usando el motor de asientos
                    base = venta_uow.base_amount
                    igv = venta_uow.igv_amount
                    total = venta_uow.total_amount
                    detraction_amount = venta_uow.detraction_amount or Decimal('0')
                    
                    # Eliminar líneas antiguas y hacer flush para asegurar que se eliminen
                    deleted_count = uow.db.query(EntryLine).filter(EntryLine.entry_id == entry.id).delete(synchronize_session=False)
                    uow.db.flush()  # Flush para asegurar que las líneas se eliminen antes de crear las nuevas
                    
                    # Usar savepoint para crear el asiento temporal sin consumir IDs
                    # Esto es crítico para auditoría: no se deben saltar números de asiento
                    lines_data = []  # Almacenar datos de líneas fuera del savepoint
                    motor_metadata_copy = None
                    
                    savepoint = uow.db.begin_nested()
                    try:
                        # Regenerar usando el motor (con soporte para detracciones)
                        motor = MotorAsientos(uow)
                        new_entry = motor.generar_asiento(
                            evento_tipo="VENTA",
                            datos_operacion={
                                "base": float(base),
                                "igv": float(igv),
                                "total": float(total),
                                "detraction_amount": float(detraction_amount) if detraction_amount > 0 else 0
                            },
                            company_id=venta_uow.company_id,
                            fecha=payload.issue_date if payload.issue_date else venta_uow.issue_date,
                            glosa=glosa_final,
                            origin="VENTAS"
                        )
                        
                        # Copiar DATOS de las líneas (no los objetos) antes del rollback
                        for line in new_entry.lines:
                            lines_data.append({
                                "account_id": line.account_id,
                                "debit": line.debit,
                                "credit": line.credit,
                                "memo": line.memo,
                                "third_party_id": line.third_party_id,
                                "cost_center": line.cost_center
                            })
                        
                        # Guardar metadatos antes del rollback
                        motor_metadata_copy = new_entry.motor_metadata
                        
                    finally:
                        # Hacer rollback del savepoint para eliminar el entry temporal
                        # Esto NO consume el ID del entry temporal (importante para auditoría)
                        savepoint.rollback()
                    
                    # Crear las nuevas líneas FUERA del savepoint usando los datos copiados
                    for line_data in lines_data:
                        new_line = EntryLine(
                            entry_id=entry.id,
                            account_id=line_data["account_id"],
                            debit=line_data["debit"],
                            credit=line_data["credit"],
                            memo=line_data["memo"],
                            third_party_id=line_data["third_party_id"],
                            cost_center=line_data["cost_center"]
                        )
                        uow.db.add(new_line)
                    
                    # Actualizar metadatos del asiento existente
                    entry.date = payload.issue_date if payload.issue_date else venta_uow.issue_date
                    entry.glosa = glosa_final
                    entry.currency = payload.currency if payload.currency else venta_uow.currency
                    entry.motor_metadata = motor_metadata_copy
                    
                    uow.db.flush()
        
        uow.commit()
        
        # Refrescar para obtener datos actualizados
        db.refresh(venta)
        
        entry = None
        if venta.journal_entry_id:
            entry = db.query(JournalEntry).filter(JournalEntry.id == venta.journal_entry_id).first()
        
        return VentaOut(
            venta_id=venta.id,
            journal_entry_id=venta.journal_entry_id or 0,
            doc_type=venta.doc_type,
            series=venta.series,
            number=venta.number,
            issue_date=venta.issue_date,
            customer_id=venta.customer_id,
            total_amount=venta.total_amount,
            detraction_rate=float(venta.detraction_rate) if venta.detraction_rate else None,
            detraction_amount=float(venta.detraction_amount) if venta.detraction_amount else None,
            net_amount=float(venta.net_amount) if venta.net_amount else None,
            has_journal_entry=venta.journal_entry_id is not None,
            journal_entry_status=entry.status if entry else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        uow.close()


@router.delete("/{venta_id}")
def delete_venta(venta_id: int, db: Session = Depends(get_db)):
    """
    Elimina una venta y su asiento contable asociado.
    
    ✅ Si la venta tiene un asiento, se elimina también (anulación contable).
    ✅ También elimina todos los cobros registrados y sus asientos contables.
    """
    from ...domain.models_payments import PaymentTransaction
    
    uow = UnitOfWork()
    try:
        # Obtener venta dentro del UoW para usar la misma sesión
        venta = uow.db.query(Sale).filter(Sale.id == venta_id).first()
        if not venta:
            raise HTTPException(status_code=404, detail="Venta no encontrada")
        
        # 1. Eliminar cobros asociados y sus asientos contables
        cobros = uow.db.query(PaymentTransaction).filter(
            PaymentTransaction.sale_id == venta_id
        ).all()
        
        for cobro in cobros:
            # Eliminar asiento contable del cobro si existe
            if cobro.journal_entry_id:
                entry = uow.db.query(JournalEntry).filter(JournalEntry.id == cobro.journal_entry_id).first()
                if entry:
                    # Eliminar líneas del asiento
                    uow.db.query(EntryLine).filter(EntryLine.entry_id == entry.id).delete()
                    # Eliminar asiento
                    uow.db.delete(entry)
            # Eliminar el cobro
            uow.db.delete(cobro)
        
        # 2. Guardar journal_entry_id antes de eliminar
        journal_entry_id = venta.journal_entry_id
        
        # 3. Eliminar asiento de la venta si existe
        if journal_entry_id:
            entry = uow.db.query(JournalEntry).filter(JournalEntry.id == journal_entry_id).first()
            if entry:
                # Eliminar líneas del asiento (usar entry_id, no journal_entry_id)
                uow.db.query(EntryLine).filter(EntryLine.entry_id == entry.id).delete()
                # Eliminar asiento
                uow.db.delete(entry)
        
        # 4. Eliminar líneas de la venta
        from ...domain.models_ext import SaleLine
        uow.db.query(SaleLine).filter(SaleLine.sale_id == venta_id).delete()
        
        # 5. Eliminar venta
        uow.db.delete(venta)
        uow.commit()
        
        return {"message": f"Venta, {len(cobros)} cobro(s) y todos los asientos contables asociados eliminados exitosamente"}
    finally:
        uow.close()


# ===== COBROS =====

class CobroIn(BaseModel):
    payment_date: date
    amount: Decimal
    cash_account_code: str | None = None  # Opcional: se determina automáticamente según payment_method
    payment_method: str = "EFECTIVO"
    payment_reference: str | None = None
    notes: str | None = None

class CobroOut(BaseModel):
    payment_id: int
    journal_entry_id: int
    payment_date: date
    amount: Decimal
    saldo_pendiente: Decimal

@router.post("/{venta_id}/cobros", response_model=CobroOut)
def registrar_cobro(
    venta_id: int,
    payload: CobroIn,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Registra un cobro de cliente por una venta.
    
    Genera automáticamente el asiento contable:
    - Débito: Caja/Bancos (10.x)
    - Crédito: Clientes (12.10)
    """
    uow = UnitOfWork()
    try:
        # Obtener company_id de la venta
        venta = db.query(Sale).filter(Sale.id == venta_id).first()
        if not venta:
            raise HTTPException(status_code=404, detail="Venta no encontrada")
        
        payment, entry = registrar_cobro_venta(
            uow,
            company_id=venta.company_id,
            sale_id=venta_id,
            payment_date=payload.payment_date,
            amount=payload.amount,
            cash_account_code=payload.cash_account_code,
            payment_method=payload.payment_method,
            payment_reference=payload.payment_reference,
            notes=payload.notes,
            created_by=current_user.username if current_user else None
        )
        uow.commit()
        
        saldo_pendiente = obtener_saldo_pendiente_venta(db, venta_id)
        
        return CobroOut(
            payment_id=payment.id,
            journal_entry_id=entry.id,
            payment_date=payment.payment_date,
            amount=payment.amount,
            saldo_pendiente=saldo_pendiente
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        uow.close()

@router.get("/{venta_id}/saldo-pendiente")
def get_saldo_pendiente_venta(venta_id: int, db: Session = Depends(get_db)):
    """Obtiene el saldo pendiente de cobro de una venta"""
    saldo = obtener_saldo_pendiente_venta(db, venta_id)
    return {"saldo_pendiente": float(saldo)}

@router.get("/{venta_id}/cobros")
def list_cobros_venta(
    venta_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Lista todos los cobros registrados para una venta.
    Incluye tanto PaymentTransaction (sistema legacy) como MovimientoTesoreria (sistema nuevo).
    """
    from ...domain.models_payments import PaymentTransaction
    from ...domain.models_tesoreria import MovimientoTesoreria, EstadoMovimiento, MetodoPago
    
    venta = db.query(Sale).filter(Sale.id == venta_id).first()
    if not venta:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    
    resultado = []
    
    # Cobros del sistema legacy (PaymentTransaction)
    cobros_legacy = db.query(PaymentTransaction).filter(
        PaymentTransaction.sale_id == venta_id,
        PaymentTransaction.company_id == venta.company_id,
        PaymentTransaction.transaction_type == 'COLLECTION'
    ).all()
    
    for cobro in cobros_legacy:
        resultado.append({
            "id": cobro.id,
            "payment_date": cobro.payment_date,
            "amount": float(cobro.amount),
            "payment_method": cobro.payment_method,
            "payment_reference": cobro.payment_reference,
            "notes": cobro.notes,
            "journal_entry_id": cobro.journal_entry_id,
            "created_at": cobro.created_at.isoformat() if cobro.created_at else None,
            "created_by": cobro.created_by,
            "sistema": "LEGACY"
        })
    
    # Cobros del sistema de Tesorería (MovimientoTesoreria)
    cobros_tesoreria = db.query(MovimientoTesoreria).filter(
        MovimientoTesoreria.company_id == venta.company_id,
        MovimientoTesoreria.referencia_tipo == "VENTA",
        MovimientoTesoreria.referencia_id == venta_id,
        MovimientoTesoreria.estado == EstadoMovimiento.REGISTRADO.value
    ).all()
    
    for movimiento in cobros_tesoreria:
        metodo_pago = db.query(MetodoPago).filter(MetodoPago.id == movimiento.metodo_pago_id).first()
        resultado.append({
            "id": movimiento.id,
            "payment_date": movimiento.fecha,
            "amount": float(movimiento.monto),
            "payment_method": metodo_pago.codigo if metodo_pago else "N/A",
            "payment_reference": None,
            "notes": movimiento.glosa,
            "journal_entry_id": movimiento.journal_entry_id,
            "created_at": movimiento.created_at.isoformat() if movimiento.created_at else None,
            "created_by": movimiento.created_by_id,
            "sistema": "TESORERIA"
        })
    
    # Ordenar por fecha descendente
    resultado.sort(key=lambda x: x["payment_date"], reverse=True)
    
    return resultado

@router.delete("/cobros/{cobro_id}")
def delete_cobro(
    cobro_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Elimina un cobro individual y su asiento contable asociado"""
    from ...domain.models_payments import PaymentTransaction
    
    uow = UnitOfWork()
    try:
        cobro = uow.db.query(PaymentTransaction).filter(
            PaymentTransaction.id == cobro_id,
            PaymentTransaction.transaction_type == 'COLLECTION'
        ).first()
        
        if not cobro:
            raise HTTPException(status_code=404, detail="Cobro no encontrado")
        
        # Verificar que el cobro pertenece a una venta de la empresa del usuario
        venta = uow.db.query(Sale).filter(Sale.id == cobro.sale_id).first()
        if venta and venta.company_id not in [c.id for c in current_user.companies]:
            raise HTTPException(status_code=403, detail="No autorizado para eliminar este cobro")
        
        # Eliminar asiento contable del cobro si existe
        if cobro.journal_entry_id:
            entry = uow.db.query(JournalEntry).filter(JournalEntry.id == cobro.journal_entry_id).first()
            if entry:
                # Eliminar líneas del asiento
                uow.db.query(EntryLine).filter(EntryLine.entry_id == entry.id).delete()
                # Eliminar asiento
                uow.db.delete(entry)
        
        # Guardar venta_id antes de eliminar para recargar saldo
        venta_id = cobro.sale_id
        
        # Eliminar el cobro
        uow.db.delete(cobro)
        uow.commit()
        
        # Recalcular saldo pendiente
        saldo_pendiente = obtener_saldo_pendiente_venta(db, venta_id)
        
        return {
            "message": "Cobro y asiento contable eliminados exitosamente",
            "saldo_pendiente": float(saldo_pendiente)
        }
    finally:
        uow.close()
