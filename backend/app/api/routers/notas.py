"""
Endpoints API para Notas de Crédito y Débito
Cumpliendo normativa SUNAT y arquitectura desacoplada
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session, joinedload
from decimal import Decimal
from datetime import date
from typing import List, Optional
from pydantic import BaseModel, Field

from ...dependencies import get_db
from ...security.auth import get_current_user
from ...infrastructure.unit_of_work import UnitOfWork
from ...application.services_notas import (
    NotasService, NotasError, DocumentoNoEncontradoError,
    DocumentoNoContabilizadoError, MontoExcedeSaldoError, StockInsuficienteError
)
from ...domain.models_notas import (
    NotaDocumento, NotaDetalle, TipoNota, OrigenNota,
    MotivoNotaCredito, MotivoNotaDebito
)

router = APIRouter(prefix="/notas", tags=["notas"])


# ===== DTOs =====

class NotaDetalleIn(BaseModel):
    producto_id: Optional[int] = None
    cantidad: Optional[Decimal] = None
    costo_unitario: Optional[Decimal] = None
    costo_total: Optional[Decimal] = None
    almacen_id: Optional[int] = None
    descripcion: Optional[str] = None


class NotaCreditoVentaIn(BaseModel):
    company_id: int
    venta_id: int
    serie: str = Field(..., min_length=1, max_length=10)
    numero: str = Field(..., min_length=1, max_length=20)
    fecha_emision: date
    motivo: str = Field(..., description="Motivo según SUNAT (ANULACION_OPERACION, DEVOLUCION_TOTAL, etc.)")
    monto_base: Decimal = Field(..., gt=0)
    detalles: Optional[List[NotaDetalleIn]] = None
    glosa: Optional[str] = None
    usar_motor: bool = True


class NotaDebitoVentaIn(BaseModel):
    company_id: int
    venta_id: int
    serie: str = Field(..., min_length=1, max_length=10)
    numero: str = Field(..., min_length=1, max_length=20)
    fecha_emision: date
    motivo: str = Field(..., description="Motivo según SUNAT (INTERESES, PENALIDADES, etc.)")
    monto_base: Decimal = Field(..., gt=0)
    glosa: Optional[str] = None
    usar_motor: bool = True


class NotaCreditoCompraIn(BaseModel):
    company_id: int
    compra_id: int
    serie: str = Field(..., min_length=1, max_length=10)
    numero: str = Field(..., min_length=1, max_length=20)
    fecha_emision: date
    motivo: str = Field(..., description="Motivo según SUNAT (ANULACION_OPERACION, DEVOLUCION_TOTAL, etc.)")
    monto_base: Decimal = Field(..., gt=0)
    detalles: Optional[List[NotaDetalleIn]] = None
    glosa: Optional[str] = None
    usar_motor: bool = True


class NotaDebitoCompraIn(BaseModel):
    company_id: int
    compra_id: int
    serie: str = Field(..., min_length=1, max_length=10)
    numero: str = Field(..., min_length=1, max_length=20)
    fecha_emision: date
    motivo: str = Field(..., description="Motivo según SUNAT (INTERESES, PENALIDADES, etc.)")
    monto_base: Decimal = Field(..., gt=0)
    glosa: Optional[str] = None
    usar_motor: bool = True


class NotaDetalleOut(BaseModel):
    id: int
    producto_id: Optional[int] = None
    cantidad: Optional[Decimal] = None
    costo_unitario: Optional[Decimal] = None
    costo_total: Optional[Decimal] = None
    descripcion: Optional[str] = None


class NotaDocumentoOut(BaseModel):
    id: int
    company_id: int
    tipo: str
    origen: str
    documento_ref_id: int
    documento_ref_tipo: str
    serie: str
    numero: str
    fecha_emision: date
    motivo: str
    monto_base: Decimal
    igv: Decimal
    total: Decimal
    afecta_inventario: bool
    estado: str
    journal_entry_id: Optional[int] = None
    created_at: str
    detalles: List[NotaDetalleOut] = []

    class Config:
        from_attributes = True


# ===== Endpoints =====

@router.post("/credito/venta", response_model=NotaDocumentoOut)
def registrar_nota_credito_venta(
    payload: NotaCreditoVentaIn,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Registra una Nota de Crédito para una venta.
    
    Valida:
    - Documento original existe y está contabilizado
    - Monto ≤ saldo pendiente
    - Período contable abierto
    - Stock suficiente (si afecta inventario)
    
    Genera asiento contable automáticamente.
    """
    uow = UnitOfWork(db)
    try:
        service = NotasService(uow)
        
        detalles_dict = None
        if payload.detalles:
            detalles_dict = [detalle.dict() for detalle in payload.detalles]
        
        nota, entry = service.registrar_nota_credito_venta(
            company_id=payload.company_id,
            venta_id=payload.venta_id,
            serie=payload.serie,
            numero=payload.numero,
            fecha_emision=payload.fecha_emision,
            motivo=payload.motivo,
            monto_base=payload.monto_base,
            detalles=detalles_dict,
            glosa=payload.glosa,
            usuario_id=current_user.id,
            usar_motor=payload.usar_motor
        )
        
        uow.commit()
        
        # Cargar detalles para la respuesta
        db.refresh(nota)
        detalles = db.query(NotaDetalle).filter(NotaDetalle.nota_id == nota.id).all()
        
        return NotaDocumentoOut(
            id=nota.id,
            company_id=nota.company_id,
            tipo=nota.tipo,
            origen=nota.origen,
            documento_ref_id=nota.documento_ref_id,
            documento_ref_tipo=nota.documento_ref_tipo,
            serie=nota.serie,
            numero=nota.numero,
            fecha_emision=nota.fecha_emision,
            motivo=nota.motivo,
            monto_base=nota.monto_base,
            igv=nota.igv,
            total=nota.total,
            afecta_inventario=nota.afecta_inventario,
            estado=nota.estado,
            journal_entry_id=nota.journal_entry_id,
            created_at=nota.created_at.isoformat(),
            detalles=[
                NotaDetalleOut(
                    id=d.id,
                    producto_id=d.producto_id,
                    cantidad=d.cantidad,
                    costo_unitario=d.costo_unitario,
                    costo_total=d.costo_total,
                    descripcion=d.descripcion
                )
                for d in detalles
            ]
        )
    except (DocumentoNoEncontradoError, DocumentoNoContabilizadoError, MontoExcedeSaldoError, StockInsuficienteError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except NotasError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        uow.rollback()
        raise HTTPException(status_code=500, detail=f"Error inesperado: {str(e)}")


@router.post("/debito/venta", response_model=NotaDocumentoOut)
def registrar_nota_debito_venta(
    payload: NotaDebitoVentaIn,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Registra una Nota de Débito para una venta.
    
    Notas de débito NO afectan inventario.
    """
    uow = UnitOfWork(db)
    try:
        service = NotasService(uow)
        
        nota, entry = service.registrar_nota_debito_venta(
            company_id=payload.company_id,
            venta_id=payload.venta_id,
            serie=payload.serie,
            numero=payload.numero,
            fecha_emision=payload.fecha_emision,
            motivo=payload.motivo,
            monto_base=payload.monto_base,
            glosa=payload.glosa,
            usuario_id=current_user.id,
            usar_motor=payload.usar_motor
        )
        
        uow.commit()
        
        db.refresh(nota)
        
        return NotaDocumentoOut(
            id=nota.id,
            company_id=nota.company_id,
            tipo=nota.tipo,
            origen=nota.origen,
            documento_ref_id=nota.documento_ref_id,
            documento_ref_tipo=nota.documento_ref_tipo,
            serie=nota.serie,
            numero=nota.numero,
            fecha_emision=nota.fecha_emision,
            motivo=nota.motivo,
            monto_base=nota.monto_base,
            igv=nota.igv,
            total=nota.total,
            afecta_inventario=nota.afecta_inventario,
            estado=nota.estado,
            journal_entry_id=nota.journal_entry_id,
            created_at=nota.created_at.isoformat(),
            detalles=[]
        )
    except (DocumentoNoEncontradoError, DocumentoNoContabilizadoError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except NotasError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        uow.rollback()
        raise HTTPException(status_code=500, detail=f"Error inesperado: {str(e)}")


@router.post("/credito/compra", response_model=NotaDocumentoOut)
def registrar_nota_credito_compra(
    payload: NotaCreditoCompraIn,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Registra una Nota de Crédito para una compra.
    
    Valida:
    - Documento original existe y está contabilizado
    - Monto ≤ saldo pendiente
    - Período contable abierto
    - Stock suficiente (si afecta inventario)
    
    Genera asiento contable automáticamente.
    """
    uow = UnitOfWork(db)
    try:
        service = NotasService(uow)
        
        detalles_dict = None
        if payload.detalles:
            detalles_dict = [detalle.dict() for detalle in payload.detalles]
        
        nota, entry = service.registrar_nota_credito_compra(
            company_id=payload.company_id,
            compra_id=payload.compra_id,
            serie=payload.serie,
            numero=payload.numero,
            fecha_emision=payload.fecha_emision,
            motivo=payload.motivo,
            monto_base=payload.monto_base,
            detalles=detalles_dict,
            glosa=payload.glosa,
            usuario_id=current_user.id,
            usar_motor=payload.usar_motor
        )
        
        uow.commit()
        
        db.refresh(nota)
        detalles = db.query(NotaDetalle).filter(NotaDetalle.nota_id == nota.id).all()
        
        return NotaDocumentoOut(
            id=nota.id,
            company_id=nota.company_id,
            tipo=nota.tipo,
            origen=nota.origen,
            documento_ref_id=nota.documento_ref_id,
            documento_ref_tipo=nota.documento_ref_tipo,
            serie=nota.serie,
            numero=nota.numero,
            fecha_emision=nota.fecha_emision,
            motivo=nota.motivo,
            monto_base=nota.monto_base,
            igv=nota.igv,
            total=nota.total,
            afecta_inventario=nota.afecta_inventario,
            estado=nota.estado,
            journal_entry_id=nota.journal_entry_id,
            created_at=nota.created_at.isoformat(),
            detalles=[
                NotaDetalleOut(
                    id=d.id,
                    producto_id=d.producto_id,
                    cantidad=d.cantidad,
                    costo_unitario=d.costo_unitario,
                    costo_total=d.costo_total,
                    descripcion=d.descripcion
                )
                for d in detalles
            ]
        )
    except (DocumentoNoEncontradoError, DocumentoNoContabilizadoError, MontoExcedeSaldoError, StockInsuficienteError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except NotasError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        uow.rollback()
        raise HTTPException(status_code=500, detail=f"Error inesperado: {str(e)}")


@router.post("/debito/compra", response_model=NotaDocumentoOut)
def registrar_nota_debito_compra(
    payload: NotaDebitoCompraIn,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Registra una Nota de Débito para una compra.
    
    Notas de débito NO afectan inventario.
    """
    uow = UnitOfWork(db)
    try:
        service = NotasService(uow)
        
        nota, entry = service.registrar_nota_debito_compra(
            company_id=payload.company_id,
            compra_id=payload.compra_id,
            serie=payload.serie,
            numero=payload.numero,
            fecha_emision=payload.fecha_emision,
            motivo=payload.motivo,
            monto_base=payload.monto_base,
            glosa=payload.glosa,
            usuario_id=current_user.id,
            usar_motor=payload.usar_motor
        )
        
        uow.commit()
        
        db.refresh(nota)
        
        return NotaDocumentoOut(
            id=nota.id,
            company_id=nota.company_id,
            tipo=nota.tipo,
            origen=nota.origen,
            documento_ref_id=nota.documento_ref_id,
            documento_ref_tipo=nota.documento_ref_tipo,
            serie=nota.serie,
            numero=nota.numero,
            fecha_emision=nota.fecha_emision,
            motivo=nota.motivo,
            monto_base=nota.monto_base,
            igv=nota.igv,
            total=nota.total,
            afecta_inventario=nota.afecta_inventario,
            estado=nota.estado,
            journal_entry_id=nota.journal_entry_id,
            created_at=nota.created_at.isoformat(),
            detalles=[]
        )
    except (DocumentoNoEncontradoError, DocumentoNoContabilizadoError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except NotasError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        uow.rollback()
        raise HTTPException(status_code=500, detail=f"Error inesperado: {str(e)}")


@router.get("/{nota_id}", response_model=NotaDocumentoOut)
def get_nota(
    nota_id: int,
    db: Session = Depends(get_db)
):
    """
    Obtiene una nota por su ID.
    """
    nota = db.query(NotaDocumento).options(
        joinedload(NotaDocumento.detalles)
    ).filter(NotaDocumento.id == nota_id).first()
    
    if not nota:
        raise HTTPException(status_code=404, detail="Nota no encontrada")
    
    return NotaDocumentoOut(
        id=nota.id,
        company_id=nota.company_id,
        tipo=nota.tipo,
        origen=nota.origen,
        documento_ref_id=nota.documento_ref_id,
        documento_ref_tipo=nota.documento_ref_tipo,
        serie=nota.serie,
        numero=nota.numero,
        fecha_emision=nota.fecha_emision,
        motivo=nota.motivo,
        monto_base=nota.monto_base,
        igv=nota.igv,
        total=nota.total,
        afecta_inventario=nota.afecta_inventario,
        estado=nota.estado,
        journal_entry_id=nota.journal_entry_id,
        created_at=nota.created_at.isoformat(),
        detalles=[
            NotaDetalleOut(
                id=d.id,
                producto_id=d.producto_id,
                cantidad=d.cantidad,
                costo_unitario=d.costo_unitario,
                costo_total=d.costo_total,
                descripcion=d.descripcion
            )
            for d in nota.detalles
        ]
    )


@router.get("/documento/{documento_tipo}/{documento_id}", response_model=List[NotaDocumentoOut])
def list_notas_por_documento(
    documento_tipo: str,
    documento_id: int,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db)
):
    """
    Lista todas las notas asociadas a un documento (venta o compra).
    """
    if documento_tipo not in ["VENTA", "COMPRA"]:
        raise HTTPException(status_code=400, detail="documento_tipo debe ser 'VENTA' o 'COMPRA'")
    
    notas = db.query(NotaDocumento).options(
        joinedload(NotaDocumento.detalles)
    ).filter(
        NotaDocumento.company_id == company_id,
        NotaDocumento.documento_ref_tipo == documento_tipo,
        NotaDocumento.documento_ref_id == documento_id
    ).order_by(NotaDocumento.fecha_emision.desc(), NotaDocumento.id.desc()).all()
    
    return [
        NotaDocumentoOut(
            id=nota.id,
            company_id=nota.company_id,
            tipo=nota.tipo,
            origen=nota.origen,
            documento_ref_id=nota.documento_ref_id,
            documento_ref_tipo=nota.documento_ref_tipo,
            serie=nota.serie,
            numero=nota.numero,
            fecha_emision=nota.fecha_emision,
            motivo=nota.motivo,
            monto_base=nota.monto_base,
            igv=nota.igv,
            total=nota.total,
            afecta_inventario=nota.afecta_inventario,
            estado=nota.estado,
            journal_entry_id=nota.journal_entry_id,
            created_at=nota.created_at.isoformat(),
            detalles=[
                NotaDetalleOut(
                    id=d.id,
                    producto_id=d.producto_id,
                    cantidad=d.cantidad,
                    costo_unitario=d.costo_unitario,
                    costo_total=d.costo_total,
                    descripcion=d.descripcion
                )
                for d in nota.detalles
            ]
        )
        for nota in notas
    ]


@router.post("/{nota_id}/anular")
def anular_nota(
    nota_id: int,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Anula una nota de crédito o débito.
    
    Esto anula el asiento contable asociado y cambia el estado de la nota a ANULADA.
    """
    from ...domain.models import JournalEntry
    from ...application.services_notas import NotasError
    from ...infrastructure.unit_of_work import UnitOfWork
    
    nota = db.query(NotaDocumento).filter(
        NotaDocumento.id == nota_id,
        NotaDocumento.company_id == company_id
    ).first()
    
    if not nota:
        raise HTTPException(status_code=404, detail="Nota no encontrada")
    
    if nota.estado == "ANULADA":
        raise HTTPException(status_code=400, detail="La nota ya está anulada")
    
    uow = UnitOfWork(db)
    try:
        # Anular asiento contable si existe
        if nota.journal_entry_id:
            entry = db.query(JournalEntry).filter(JournalEntry.id == nota.journal_entry_id).first()
            if entry and entry.status != "VOIDED":
                entry.status = "VOIDED"
                # Eliminar líneas del asiento
                from ...domain.models import EntryLine
                db.query(EntryLine).filter(EntryLine.entry_id == entry.id).delete()
        
        # Cambiar estado de la nota
        nota.estado = "ANULADA"
        
        uow.commit()
        
        return {
            "message": "Nota anulada exitosamente",
            "nota_id": nota_id,
            "journal_entry_id": nota.journal_entry_id
        }
    except Exception as e:
        uow.rollback()
        raise HTTPException(status_code=500, detail=f"Error al anular nota: {str(e)}")


@router.delete("/{nota_id}")
def eliminar_nota(
    nota_id: int,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Elimina una nota de crédito o débito.
    
    Esto elimina la nota y anula el asiento contable asociado.
    Similar a anular, pero elimina físicamente el registro.
    """
    from ...domain.models import JournalEntry
    from ...infrastructure.unit_of_work import UnitOfWork
    
    nota = db.query(NotaDocumento).filter(
        NotaDocumento.id == nota_id,
        NotaDocumento.company_id == company_id
    ).first()
    
    if not nota:
        raise HTTPException(status_code=404, detail="Nota no encontrada")
    
    uow = UnitOfWork(db)
    try:
        # Anular asiento contable si existe
        if nota.journal_entry_id:
            entry = db.query(JournalEntry).filter(JournalEntry.id == nota.journal_entry_id).first()
            if entry and entry.status != "VOIDED":
                entry.status = "VOIDED"
                # Eliminar líneas del asiento
                from ...domain.models import EntryLine
                db.query(EntryLine).filter(EntryLine.entry_id == entry.id).delete()
        
        # Eliminar detalles primero (cascade)
        from ...domain.models_notas import NotaDetalle
        db.query(NotaDetalle).filter(NotaDetalle.nota_id == nota_id).delete()
        
        # Eliminar la nota
        db.delete(nota)
        
        uow.commit()
        
        return {
            "message": "Nota eliminada exitosamente",
            "nota_id": nota_id,
            "journal_entry_id": nota.journal_entry_id
        }
    except Exception as e:
        uow.rollback()
        raise HTTPException(status_code=500, detail=f"Error al eliminar nota: {str(e)}")

