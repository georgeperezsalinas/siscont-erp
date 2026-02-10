"""
API Endpoints para Aplicación de Cobros y Pagos a Documentos
"""
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ...dependencies import get_db
from ...security.auth import get_current_user
from ...infrastructure.unit_of_work import UnitOfWork
from ...application.services_aplicaciones import AplicacionPagosService, AplicacionPagosError

router = APIRouter(prefix="/aplicaciones", tags=["Aplicaciones"])


# DTOs
class AplicacionIn(BaseModel):
    """DTO para una aplicación individual"""
    tipo_documento: str  # "FACTURA"
    documento_id: int
    monto_aplicado: Decimal


class AplicarPagoIn(BaseModel):
    """DTO para aplicar un cobro/pago a documentos"""
    movimiento_tesoreria_id: int
    aplicaciones: List[AplicacionIn]


class AplicacionOut(BaseModel):
    """DTO para respuesta de aplicación"""
    id: int
    movimiento_tesoreria_id: int
    tipo_documento: str
    documento_id: int
    monto_aplicado: Decimal
    fecha: str
    
    class Config:
        from_attributes = True


@router.post("", response_model=List[AplicacionOut])
async def aplicar_pago(
    payload: AplicarPagoIn,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Aplica un cobro/pago a uno o múltiples documentos.
    
    Permite:
    - Aplicar un cobro/pago a múltiples documentos
    - Aplicar pagos parciales
    - Controlar que la suma aplicada no exceda el monto del movimiento
    
    Validaciones:
    - La suma aplicada ≤ monto del cobro/pago
    - El documento tenga saldo pendiente
    - No permitir aplicar más de lo pendiente
    - No permitir aplicar en periodo cerrado
    """
    uow = UnitOfWork(db)
    try:
        service = AplicacionPagosService(uow)
        
        # Convertir AplicacionIn a dict
        aplicaciones_dict = [
            {
                "tipo_documento": a.tipo_documento,
                "documento_id": a.documento_id,
                "monto_aplicado": a.monto_aplicado
            }
            for a in payload.aplicaciones
        ]
        
        aplicaciones_creadas = service.aplicar_pago(
            movimiento_tesoreria_id=payload.movimiento_tesoreria_id,
            aplicaciones=aplicaciones_dict,
            company_id=company_id,
            usuario_id=current_user.id if current_user else None
        )
        
        uow.commit()
        
        return [
            AplicacionOut(
                id=a.id,
                movimiento_tesoreria_id=a.movimiento_tesoreria_id,
                tipo_documento=a.tipo_documento,
                documento_id=a.documento_id,
                monto_aplicado=a.monto_aplicado,
                fecha=a.fecha.isoformat()
            )
            for a in aplicaciones_creadas
        ]
    except AplicacionPagosError as e:
        uow.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        uow.rollback()
        raise HTTPException(status_code=500, detail=f"Error inesperado: {str(e)}")
    finally:
        uow.close()


@router.delete("/{aplicacion_id}")
async def desaplicar_pago(
    aplicacion_id: int,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Desaplica un cobro/pago de un documento.
    
    Elimina la aplicación, liberando el saldo pendiente del documento.
    
    Validaciones:
    - La aplicación existe y pertenece a la empresa
    - No permitir desaplicar en periodo cerrado
    """
    uow = UnitOfWork(db)
    try:
        service = AplicacionPagosService(uow)
        
        service.desaplicar_pago(
            aplicacion_id=aplicacion_id,
            company_id=company_id,
            usuario_id=current_user.id if current_user else None
        )
        
        uow.commit()
        
        return {"message": "Aplicación desaplicada correctamente"}
    except AplicacionPagosError as e:
        uow.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        uow.rollback()
        raise HTTPException(status_code=500, detail=f"Error inesperado: {str(e)}")
    finally:
        uow.close()


@router.get("/movimiento/{movimiento_tesoreria_id}", response_model=List[AplicacionOut])
async def listar_aplicaciones_por_movimiento(
    movimiento_tesoreria_id: int,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Lista todas las aplicaciones de un movimiento de tesorería.
    """
    uow = UnitOfWork(db)
    try:
        service = AplicacionPagosService(uow)
        
        aplicaciones = service.listar_aplicaciones_por_movimiento(
            movimiento_tesoreria_id=movimiento_tesoreria_id,
            company_id=company_id
        )
        
        return [
            AplicacionOut(
                id=a.id,
                movimiento_tesoreria_id=a.movimiento_tesoreria_id,
                tipo_documento=a.tipo_documento,
                documento_id=a.documento_id,
                monto_aplicado=a.monto_aplicado,
                fecha=a.fecha.isoformat()
            )
            for a in aplicaciones
        ]
    finally:
        uow.close()


@router.get("/documento", response_model=List[AplicacionOut])
async def listar_aplicaciones_por_documento(
    tipo_documento: str = Query(..., description="Tipo de documento (FACTURA)"),
    documento_id: int = Query(..., description="ID del documento"),
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Lista todas las aplicaciones de un documento.
    """
    uow = UnitOfWork(db)
    try:
        service = AplicacionPagosService(uow)
        
        aplicaciones = service.listar_aplicaciones_por_documento(
            tipo_documento=tipo_documento,
            documento_id=documento_id,
            company_id=company_id
        )
        
        return [
            AplicacionOut(
                id=a.id,
                movimiento_tesoreria_id=a.movimiento_tesoreria_id,
                tipo_documento=a.tipo_documento,
                documento_id=a.documento_id,
                monto_aplicado=a.monto_aplicado,
                fecha=a.fecha.isoformat()
            )
            for a in aplicaciones
        ]
    finally:
        uow.close()

