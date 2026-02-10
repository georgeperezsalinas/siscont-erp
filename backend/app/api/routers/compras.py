from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from datetime import date
from decimal import Decimal
from sqlalchemy.orm import Session, joinedload, selectinload
from typing import List, Optional
from ...dependencies import get_db
from ...security.auth import get_current_user
from ...domain.models import User
from ...infrastructure.unit_of_work import UnitOfWork
from ...application.services_integration import registrar_compra_con_asiento
from ...application.services import patch_journal_entry
from ...application.services_payments import registrar_pago_compra, obtener_saldo_pendiente_compra
from ...domain.models_ext import Purchase
from ...domain.models import JournalEntry, EntryLine
from ...application.dtos import JournalEntryIn, EntryLineIn

router = APIRouter(prefix="/compras", tags=["compras"])

class PurchaseLineIn(BaseModel):
    line_number: int = 1
    description: str
    quantity: Decimal
    unit_price: Decimal
    product_id: int | None = None  # Producto de inventario (opcional)
    # base_amount, igv_amount, total_amount se calculan automáticamente

class CompraIn(BaseModel):
    company_id: int
    doc_type: str = "01"
    series: str
    number: str
    issue_date: date
    supplier_id: int
    currency: str = "PEN"
    lines: list[PurchaseLineIn]  # Lista de líneas de la factura
    base_amount: Decimal | None = None  # Opcional: si se proporciona, se usa; si no, se calcula de lines
    glosa: str | None = None  # Opcional: se genera automáticamente

class CompraUpdate(BaseModel):
    doc_type: str | None = None
    series: str | None = None
    number: str | None = None
    issue_date: date | None = None
    supplier_id: int | None = None
    currency: str | None = None
    base_amount: Decimal | None = None
    lines: list[PurchaseLineIn] | None = None  # Líneas de detalle para actualizar
    glosa: str | None = None

class CompraOut(BaseModel):
    compra_id: int
    journal_entry_id: int
    doc_type: str
    series: str
    number: str
    issue_date: date
    supplier_id: int
    total_amount: Decimal
    glosa: str | None = None
    has_journal_entry: bool = False
    journal_entry_status: str | None = None

@router.post("", response_model=CompraOut)
def post_compra(
    payload: CompraIn,
    current_user: User = Depends(get_current_user),
):
    """
    Crea una compra con su asiento contable automático.
    
    ✅ INTEGRACIÓN ACOPLADA: Al crear una compra, automáticamente se crea
       el asiento contable siguiendo la metodología de ensamblaje.
       
    ✅ SOPORTA MÚLTIPLES LÍNEAS: Puede recibir una lista de líneas (products/servicios)
       o un base_amount único (backward compatibility).
       
    El asiento se crea con:
    - Glosa: "Compra {doc_type}-{series}-{number}" (o la proporcionada)
    - Origen: "COMPRAS"
    - Líneas: Según PCGE (60.11 Debe, 40.11 IGV Debe, 42.12 Crédito)
    """
    uow = UnitOfWork()  # ← El "chassis" que une todo
    try:
        # Convertir PurchaseLineIn a dict para el servicio
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
        
        # ✅ Servicio de integración: acopla Compras + Asientos
        compra, entry = registrar_compra_con_asiento(
            uow,
            company_id=payload.company_id,
            doc_type=payload.doc_type,
            series=payload.series,
            number=payload.number,
            issue_date=payload.issue_date,
            supplier_id=payload.supplier_id,
            currency=payload.currency,
            base_amount=payload.base_amount,
            lines=lines_dict,
            glosa=payload.glosa,
            user_id=current_user.id,
        )
        uow.commit()
        
        return CompraOut(
            compra_id=compra.id,
            journal_entry_id=entry.id,
            doc_type=compra.doc_type,
            series=compra.series,
            number=compra.number,
            issue_date=compra.issue_date,
            supplier_id=compra.supplier_id,
            total_amount=compra.total_amount,
            glosa=compra.glosa,
            has_journal_entry=True,
            journal_entry_status=entry.status
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        uow.close()


@router.get("", response_model=List[CompraOut])
def list_compras(
    company_id: int = Query(..., description="ID de la empresa"),
    period: Optional[str] = Query(None, description="Período YYYY-MM (opcional)"),
    db: Session = Depends(get_db),
):
    """
    Lista todas las compras de una empresa con su estado de asiento.
    
    ✅ Muestra claramente si cada compra tiene un asiento contable generado.
    Si se proporciona period (YYYY-MM), filtra las compras por ese período.
    """
    from datetime import date
    from ...domain.models import Period
    
    compras_query = db.query(Purchase).filter(Purchase.company_id == company_id)
    
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
                compras_query = compras_query.filter(
                    Purchase.issue_date >= start_date,
                    Purchase.issue_date < end_date
                )
        except:
            pass  # Si el formato es inválido, ignorar el filtro
    
    compras = compras_query.order_by(Purchase.issue_date.desc(), Purchase.id.desc()).all()
    
    result = []
    for compra in compras:
        # Verificar si tiene asiento generado
        entry = None
        if compra.journal_entry_id:
            entry = db.query(JournalEntry).filter(JournalEntry.id == compra.journal_entry_id).first()
        
        result.append(CompraOut(
            compra_id=compra.id,
            journal_entry_id=compra.journal_entry_id or 0,  # 0 si no tiene
            doc_type=compra.doc_type,
            series=compra.series,
            number=compra.number,
            issue_date=compra.issue_date,
            supplier_id=compra.supplier_id,
            total_amount=compra.total_amount,
            has_journal_entry=compra.journal_entry_id is not None,
            journal_entry_status=entry.status if entry else None,
        ))
    
    return result


class PurchaseLineOut(BaseModel):
    id: int
    line_number: int
    description: str
    quantity: Decimal
    unit_price: Decimal
    base_amount: Decimal
    igv_amount: Decimal
    total_amount: Decimal

class CompraConLineasOut(CompraOut):
    lines: list[PurchaseLineOut] = []

@router.get("/{compra_id}", response_model=CompraConLineasOut)
def get_compra(compra_id: int, db: Session = Depends(get_db)):
    """Obtiene una compra específica con su estado de asiento y líneas de detalle"""
    from ...domain.models_ext import PurchaseLine
    
    compra = db.query(Purchase).options(selectinload(Purchase.lines)).filter(Purchase.id == compra_id).first()
    if not compra:
        raise HTTPException(status_code=404, detail="Compra no encontrada")
    
    entry = None
    if compra.journal_entry_id:
        entry = db.query(JournalEntry).filter(JournalEntry.id == compra.journal_entry_id).first()
    
    # Convertir líneas a DTOs
    lines_out = []
    if compra.lines:
        for line in sorted(compra.lines, key=lambda l: l.line_number):
            lines_out.append(PurchaseLineOut(
                id=line.id,
                line_number=line.line_number,
                description=line.description,
                quantity=line.quantity,
                unit_price=line.unit_price,
                base_amount=line.base_amount,
                igv_amount=line.igv_amount,
                total_amount=line.total_amount
            ))
    
    return CompraConLineasOut(
        compra_id=compra.id,
        journal_entry_id=compra.journal_entry_id or 0,
        doc_type=compra.doc_type,
        series=compra.series,
        number=compra.number,
        issue_date=compra.issue_date,
        supplier_id=compra.supplier_id,
        total_amount=compra.total_amount,
        glosa=compra.glosa,
        has_journal_entry=compra.journal_entry_id is not None,
        journal_entry_status=entry.status if entry else None,
        lines=lines_out
    )


@router.patch("/{compra_id}", response_model=CompraOut)
def update_compra(compra_id: int, payload: CompraUpdate, db: Session = Depends(get_db)):
    """
    Actualiza una compra y su asiento contable asociado.
    
    ✅ Si cambia el monto base, fecha o glosa, se actualiza el asiento automáticamente.
    """
    compra = db.query(Purchase).filter(Purchase.id == compra_id).first()
    if not compra:
        raise HTTPException(status_code=404, detail="Compra no encontrada")
    
    uow = UnitOfWork()
    try:
        # Obtener compra dentro del UoW
        compra_uow = uow.db.query(Purchase).filter(Purchase.id == compra_id).first()
        if not compra_uow:
            raise HTTPException(status_code=404, detail="Compra no encontrada")
        
        # Actualizar campos de la compra
        update_data = payload.model_dump(exclude_unset=True)
        
        # Si se proporcionan líneas, actualizar las líneas de detalle
        if 'lines' in update_data and payload.lines is not None:
            from ...domain.models_ext import PurchaseLine
            
            # Eliminar líneas antiguas
            uow.db.query(PurchaseLine).filter(PurchaseLine.purchase_id == compra_id).delete()
            
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
                
                purchase_line = PurchaseLine(
                    purchase_id=compra_id,
                    line_number=idx + 1,
                    description=line_data.description,
                    quantity=quantity,
                    unit_price=unit_price,
                    base_amount=base,
                    igv_amount=igv,
                    total_amount=total
                )
                uow.db.add(purchase_line)
                
                total_base += base
                total_igv += igv
                total_total += total
            
            # Actualizar montos de la compra desde las líneas
            compra_uow.base_amount = total_base
            compra_uow.igv_amount = total_igv
            compra_uow.total_amount = total_total
            update_data.pop('lines')
        
        # Si cambia base_amount (sin líneas), recalcular IGV y total
        elif 'base_amount' in update_data:
            base = Decimal(str(update_data['base_amount'])).quantize(Decimal('0.01'))
            compra_uow.base_amount = base
            compra_uow.igv_amount = (base * Decimal('0.18')).quantize(Decimal('0.01'))
            compra_uow.total_amount = (base * Decimal('1.18')).quantize(Decimal('0.01'))
            update_data.pop('base_amount')
        
        # Actualizar otros campos
        if 'series' in update_data:
            compra_uow.series = update_data['series']
        if 'number' in update_data:
            compra_uow.number = update_data['number']
        if 'doc_type' in update_data:
            compra_uow.doc_type = update_data['doc_type']
        if 'issue_date' in update_data:
            compra_uow.issue_date = update_data['issue_date']
        if 'supplier_id' in update_data:
            compra_uow.supplier_id = update_data['supplier_id']
        if 'currency' in update_data:
            compra_uow.currency = update_data['currency']
        if 'glosa' in update_data:
            compra_uow.glosa = update_data['glosa']
        
        # Actualizar asiento si existe y cambió algo que lo afecta
        if compra_uow.journal_entry_id:
            entry = uow.db.query(JournalEntry).filter(JournalEntry.id == compra_uow.journal_entry_id).first()
            if entry:
                # Regenerar líneas del asiento si cambió base_amount, líneas, issue_date o glosa
                needs_update = (
                    'lines' in payload.model_dump(exclude_unset=True) or
                    'base_amount' in payload.model_dump(exclude_unset=True) or 
                    'issue_date' in payload.model_dump(exclude_unset=True) or 
                    payload.glosa is not None
                )
                
                if needs_update:
                    from ...application.services_journal_engine import MotorAsientos
                    from ...domain.models import EntryLine
                    
                    # Generar nueva glosa
                    glosa_final = payload.glosa if payload.glosa is not None else f"Compra {compra_uow.doc_type}-{compra_uow.series}-{compra_uow.number}"
                    
                    # Regenerar asiento usando el motor de asientos
                    base = compra_uow.base_amount
                    igv = compra_uow.igv_amount
                    total = compra_uow.total_amount
                    
                    # Eliminar líneas antiguas y hacer flush para asegurar que se eliminen
                    deleted_count = uow.db.query(EntryLine).filter(EntryLine.entry_id == entry.id).delete(synchronize_session=False)
                    uow.db.flush()  # Flush para asegurar que las líneas se eliminen antes de crear las nuevas
                    
                    # Usar savepoint para crear el asiento temporal sin consumir IDs
                    # Esto es crítico para auditoría: no se deben saltar números de asiento
                    lines_data = []  # Almacenar datos de líneas fuera del savepoint
                    motor_metadata_copy = None
                    
                    savepoint = uow.db.begin_nested()
                    try:
                        # Regenerar usando el motor
                        motor = MotorAsientos(uow)
                        new_entry = motor.generar_asiento(
                            evento_tipo="COMPRA",
                            datos_operacion={
                                "base": float(base),
                                "igv": float(igv),
                                "total": float(total)
                            },
                            company_id=compra_uow.company_id,
                            fecha=payload.issue_date if payload.issue_date else compra_uow.issue_date,
                            glosa=glosa_final,
                            origin="COMPRAS"
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
                    entry.date = payload.issue_date if payload.issue_date else compra_uow.issue_date
                    entry.glosa = glosa_final
                    entry.currency = payload.currency if payload.currency else compra_uow.currency
                    entry.motor_metadata = motor_metadata_copy
                    
                    uow.db.flush()
        
        uow.commit()
        
        # Refrescar para obtener datos actualizados
        db.refresh(compra)
        
        entry = None
        if compra.journal_entry_id:
            entry = db.query(JournalEntry).filter(JournalEntry.id == compra.journal_entry_id).first()
        
        return CompraOut(
            compra_id=compra.id,
            journal_entry_id=compra.journal_entry_id or 0,
            doc_type=compra.doc_type,
            series=compra.series,
            number=compra.number,
            issue_date=compra.issue_date,
            supplier_id=compra.supplier_id,
            total_amount=compra.total_amount,
            glosa=compra.glosa,
            has_journal_entry=compra.journal_entry_id is not None,
            journal_entry_status=entry.status if entry else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        uow.close()


@router.delete("/{compra_id}")
def delete_compra(compra_id: int, db: Session = Depends(get_db)):
    """
    Elimina una compra y su asiento contable asociado.
    
    ✅ Si la compra tiene un asiento, se elimina también (anulación contable).
    ✅ También elimina todos los pagos registrados y sus asientos contables.
    """
    from ...domain.models_payments import PaymentTransaction
    
    uow = UnitOfWork()
    try:
        # Obtener compra dentro del UoW para usar la misma sesión
        compra = uow.db.query(Purchase).filter(Purchase.id == compra_id).first()
        if not compra:
            raise HTTPException(status_code=404, detail="Compra no encontrada")
        
        # 1. Eliminar pagos asociados y sus asientos contables
        pagos = uow.db.query(PaymentTransaction).filter(
            PaymentTransaction.purchase_id == compra_id
        ).all()
        
        for pago in pagos:
            # Eliminar asiento contable del pago si existe
            if pago.journal_entry_id:
                entry = uow.db.query(JournalEntry).filter(JournalEntry.id == pago.journal_entry_id).first()
                if entry:
                    # Eliminar líneas del asiento
                    uow.db.query(EntryLine).filter(EntryLine.entry_id == entry.id).delete()
                    # Eliminar asiento
                    uow.db.delete(entry)
            # Eliminar el pago
            uow.db.delete(pago)
        
        # 2. Guardar journal_entry_id antes de eliminar
        journal_entry_id = compra.journal_entry_id
        
        # 3. Eliminar asiento de la compra si existe
        if journal_entry_id:
            entry = uow.db.query(JournalEntry).filter(JournalEntry.id == journal_entry_id).first()
            if entry:
                # Eliminar líneas del asiento (usar entry_id, no journal_entry_id)
                uow.db.query(EntryLine).filter(EntryLine.entry_id == entry.id).delete()
                # Eliminar asiento
                uow.db.delete(entry)
        
        # 4. Eliminar líneas de la compra
        from ...domain.models_ext import PurchaseLine
        uow.db.query(PurchaseLine).filter(PurchaseLine.purchase_id == compra_id).delete()
        
        # 5. Eliminar compra
        uow.db.delete(compra)
        uow.commit()
        
        return {"message": f"Compra, {len(pagos)} pago(s) y todos los asientos contables asociados eliminados exitosamente"}
    finally:
        uow.close()


# ===== PAGOS =====

class PagoIn(BaseModel):
    payment_date: date
    amount: Decimal
    cash_account_code: str | None = None  # Opcional: se determina automáticamente según payment_method
    payment_method: str = "EFECTIVO"
    payment_reference: str | None = None
    notes: str | None = None

class PagoOut(BaseModel):
    payment_id: int
    journal_entry_id: int
    payment_date: date
    amount: Decimal
    saldo_pendiente: Decimal

@router.post("/{compra_id}/pagos", response_model=PagoOut)
def registrar_pago(
    compra_id: int,
    payload: PagoIn,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Registra un pago a proveedor por una compra.
    
    Genera automáticamente el asiento contable:
    - Débito: Proveedores (42.12)
    - Crédito: Caja/Bancos (10.x)
    """
    uow = UnitOfWork()
    try:
        # Obtener company_id de la compra
        compra = db.query(Purchase).filter(Purchase.id == compra_id).first()
        if not compra:
            raise HTTPException(status_code=404, detail="Compra no encontrada")
        
        payment, entry = registrar_pago_compra(
            uow,
            company_id=compra.company_id,
            purchase_id=compra_id,
            payment_date=payload.payment_date,
            amount=payload.amount,
            cash_account_code=payload.cash_account_code,
            payment_method=payload.payment_method,
            payment_reference=payload.payment_reference,
            notes=payload.notes,
            created_by=current_user.username if current_user else None
        )
        uow.commit()
        
        saldo_pendiente = obtener_saldo_pendiente_compra(db, compra_id)
        
        return PagoOut(
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

@router.get("/{compra_id}/saldo-pendiente")
def get_saldo_pendiente_compra(compra_id: int, db: Session = Depends(get_db)):
    """Obtiene el saldo pendiente de pago de una compra"""
    saldo = obtener_saldo_pendiente_compra(db, compra_id)
    return {"saldo_pendiente": float(saldo)}

@router.get("/{compra_id}/pagos")
def list_pagos_compra(
    compra_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Lista todos los pagos registrados para una compra.
    Incluye tanto PaymentTransaction (sistema legacy) como MovimientoTesoreria (sistema nuevo).
    """
    from ...domain.models_payments import PaymentTransaction
    from ...domain.models_tesoreria import MovimientoTesoreria, EstadoMovimiento, MetodoPago
    
    compra = db.query(Purchase).filter(Purchase.id == compra_id).first()
    if not compra:
        raise HTTPException(status_code=404, detail="Compra no encontrada")
    
    resultado = []
    
    # Pagos del sistema legacy (PaymentTransaction)
    pagos_legacy = db.query(PaymentTransaction).filter(
        PaymentTransaction.purchase_id == compra_id,
        PaymentTransaction.company_id == compra.company_id,
        PaymentTransaction.transaction_type == 'PAYMENT'
    ).all()
    
    for pago in pagos_legacy:
        resultado.append({
            "id": pago.id,
            "payment_date": pago.payment_date,
            "amount": float(pago.amount),
            "payment_method": pago.payment_method,
            "payment_reference": pago.payment_reference,
            "notes": pago.notes,
            "journal_entry_id": pago.journal_entry_id,
            "created_at": pago.created_at.isoformat() if pago.created_at else None,
            "created_by": pago.created_by,
            "sistema": "LEGACY"
        })
    
    # Pagos del sistema de Tesorería (MovimientoTesoreria)
    pagos_tesoreria = db.query(MovimientoTesoreria).filter(
        MovimientoTesoreria.company_id == compra.company_id,
        MovimientoTesoreria.referencia_tipo == "COMPRA",
        MovimientoTesoreria.referencia_id == compra_id,
        MovimientoTesoreria.estado == EstadoMovimiento.REGISTRADO.value
    ).all()
    
    for movimiento in pagos_tesoreria:
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

@router.delete("/pagos/{pago_id}")
def delete_pago(
    pago_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Elimina un pago individual y su asiento contable asociado"""
    from ...domain.models_payments import PaymentTransaction
    
    uow = UnitOfWork()
    try:
        pago = uow.db.query(PaymentTransaction).filter(
            PaymentTransaction.id == pago_id,
            PaymentTransaction.transaction_type == 'PAYMENT'
        ).first()
        
        if pago:
            # Verificar que el pago pertenece a una compra de la empresa del usuario
            compra = uow.db.query(Purchase).filter(Purchase.id == pago.purchase_id).first()
            if compra and compra.company_id not in [c.id for c in current_user.companies]:
                raise HTTPException(status_code=403, detail="No autorizado para eliminar este pago")
        
        if not pago:
            raise HTTPException(status_code=404, detail="Pago no encontrado")
        
        # Eliminar asiento contable del pago si existe
        if pago.journal_entry_id:
            entry = uow.db.query(JournalEntry).filter(JournalEntry.id == pago.journal_entry_id).first()
            if entry:
                # Eliminar líneas del asiento
                uow.db.query(EntryLine).filter(EntryLine.entry_id == entry.id).delete()
                # Eliminar asiento
                uow.db.delete(entry)
        
        # Guardar compra_id antes de eliminar para recargar saldo
        compra_id = pago.purchase_id
        
        # Eliminar el pago
        uow.db.delete(pago)
        uow.commit()
        
        # Recalcular saldo pendiente
        saldo_pendiente = obtener_saldo_pendiente_compra(db, compra_id)
        
        return {
            "message": "Pago y asiento contable eliminados exitosamente",
            "saldo_pendiente": float(saldo_pendiente)
        }
    finally:
        uow.close()
