"""
Router para el Módulo de Tesorería

Endpoints:
- POST /tesoreria/cobros - Registrar cobro de cliente
- POST /tesoreria/pagos - Registrar pago a proveedor
- GET  /tesoreria/movimientos - Listar movimientos
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from decimal import Decimal
from datetime import date
from typing import Optional, List

from ...dependencies import get_db
from ...security.auth import get_current_user
from ...domain.models import User
from ...domain.models_tesoreria import MovimientoTesoreria, MetodoPago
from ...infrastructure.unit_of_work import UnitOfWork
from ...application.services_tesoreria import (
    TesoreriaService, TesoreriaError, SaldoInsuficienteError,
    DocumentoNoEncontradoError, MetodoPagoInactivoError
)
from ...application.services_tesoreria_init import inicializar_metodos_pago_predeterminados

router = APIRouter(prefix="/tesoreria", tags=["Tesorería"])


# ===== PYDANTIC MODELS =====

class CobroIn(BaseModel):
    """Request para registrar un cobro"""
    company_id: int
    venta_id: int
    monto: float
    fecha: date
    metodo_pago_id: int
    glosa: Optional[str] = None
    usar_motor: bool = True


class PagoIn(BaseModel):
    """Request para registrar un pago"""
    company_id: int
    compra_id: int
    monto: float
    fecha: date
    metodo_pago_id: int
    glosa: Optional[str] = None
    usar_motor: bool = True


class MovimientoTesoreriaOut(BaseModel):
    """Response de un movimiento de tesorería"""
    id: int
    tipo: str
    referencia_tipo: str
    referencia_id: int
    monto: float
    fecha: date
    metodo_pago_id: int
    metodo_pago_codigo: str
    metodo_pago_descripcion: str
    estado: str
    journal_entry_id: Optional[int]
    glosa: Optional[str]
    created_at: str
    
    class Config:
        from_attributes = True


# ===== ENDPOINTS =====

@router.post("/cobros")
def registrar_cobro(
    payload: CobroIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Registra un cobro de cliente.
    
    Valida:
    - La venta existe
    - Hay saldo pendiente
    - El método de pago está activo
    - El período está abierto
    
    Genera asiento contable vía Motor de Asientos.
    """
    # Validar permisos
    if current_user.role not in ["ADMINISTRADOR", "CONTADOR", "OPERADOR"]:
        raise HTTPException(status_code=403, detail="No tiene permisos para registrar cobros")
    
    # Cargar companies si no están cargadas
    from sqlalchemy.orm import joinedload
    if not current_user.companies:
        user = db.query(User).options(joinedload(User.companies)).filter(User.id == current_user.id).first()
        if user:
            current_user.companies = user.companies
    
    # Validar company_id
    if payload.company_id not in [c.id for c in current_user.companies]:
        raise HTTPException(status_code=403, detail="No tiene acceso a esta empresa")
    
    uow = UnitOfWork(db)
    try:
        servicio = TesoreriaService(uow)
        
        movimiento, entry = servicio.registrar_cobro(
            company_id=payload.company_id,
            venta_id=payload.venta_id,
            monto=Decimal(str(payload.monto)),
            fecha=payload.fecha,
            metodo_pago_id=payload.metodo_pago_id,
            glosa=payload.glosa,
            usuario_id=current_user.id,
            usar_motor=payload.usar_motor
        )
        
        uow.commit()
        
        # Obtener método de pago para respuesta
        metodo_pago = db.query(MetodoPago).filter(MetodoPago.id == movimiento.metodo_pago_id).first()
        
        return {
            "success": True,
            "movimiento": {
                "id": movimiento.id,
                "tipo": movimiento.tipo,
                "referencia_tipo": movimiento.referencia_tipo,
                "referencia_id": movimiento.referencia_id,
                "monto": float(movimiento.monto),
                "fecha": movimiento.fecha.isoformat(),
                "metodo_pago_id": movimiento.metodo_pago_id,
                "metodo_pago_codigo": metodo_pago.codigo if metodo_pago else "",
                "metodo_pago_descripcion": metodo_pago.descripcion if metodo_pago else "",
                "estado": movimiento.estado,
                "journal_entry_id": movimiento.journal_entry_id,
                "glosa": movimiento.glosa,
                "created_at": movimiento.created_at.isoformat()
            },
            "journal_entry": {
                "id": entry.id,
                "origin": entry.origin,
                "glosa": entry.glosa
            } if entry else None
        }
    
    except DocumentoNoEncontradoError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except SaldoInsuficienteError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except MetodoPagoInactivoError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except TesoreriaError as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        uow.close()


@router.post("/pagos")
def registrar_pago(
    payload: PagoIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Registra un pago a proveedor.
    
    Valida:
    - La compra existe
    - Hay saldo pendiente
    - El método de pago está activo
    - El período está abierto
    
    Genera asiento contable vía Motor de Asientos.
    """
    # Validar permisos
    if current_user.role not in ["ADMINISTRADOR", "CONTADOR", "OPERADOR"]:
        raise HTTPException(status_code=403, detail="No tiene permisos para registrar pagos")
    
    # Cargar companies si no están cargadas
    from sqlalchemy.orm import joinedload
    if not current_user.companies:
        user = db.query(User).options(joinedload(User.companies)).filter(User.id == current_user.id).first()
        if user:
            current_user.companies = user.companies
    
    # Validar company_id
    if payload.company_id not in [c.id for c in current_user.companies]:
        raise HTTPException(status_code=403, detail="No tiene acceso a esta empresa")
    
    uow = UnitOfWork(db)
    try:
        servicio = TesoreriaService(uow)
        
        movimiento, entry = servicio.registrar_pago(
            company_id=payload.company_id,
            compra_id=payload.compra_id,
            monto=Decimal(str(payload.monto)),
            fecha=payload.fecha,
            metodo_pago_id=payload.metodo_pago_id,
            glosa=payload.glosa,
            usuario_id=current_user.id,
            usar_motor=payload.usar_motor
        )
        
        uow.commit()
        
        # Obtener método de pago para respuesta
        metodo_pago = db.query(MetodoPago).filter(MetodoPago.id == movimiento.metodo_pago_id).first()
        
        return {
            "success": True,
            "movimiento": {
                "id": movimiento.id,
                "tipo": movimiento.tipo,
                "referencia_tipo": movimiento.referencia_tipo,
                "referencia_id": movimiento.referencia_id,
                "monto": float(movimiento.monto),
                "fecha": movimiento.fecha.isoformat(),
                "metodo_pago_id": movimiento.metodo_pago_id,
                "metodo_pago_codigo": metodo_pago.codigo if metodo_pago else "",
                "metodo_pago_descripcion": metodo_pago.descripcion if metodo_pago else "",
                "estado": movimiento.estado,
                "journal_entry_id": movimiento.journal_entry_id,
                "glosa": movimiento.glosa,
                "created_at": movimiento.created_at.isoformat()
            },
            "journal_entry": {
                "id": entry.id,
                "origin": entry.origin,
                "glosa": entry.glosa
            } if entry else None
        }
    
    except DocumentoNoEncontradoError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except SaldoInsuficienteError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except MetodoPagoInactivoError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except TesoreriaError as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        uow.close()


@router.get("/movimientos")
def listar_movimientos(
    company_id: int = Query(..., description="ID de la empresa"),
    tipo: Optional[str] = Query(None, description="Filtrar por tipo (COBRO, PAGO, TRANSFERENCIA)"),
    referencia_tipo: Optional[str] = Query(None, description="Filtrar por tipo de referencia (VENTA, COMPRA)"),
    referencia_id: Optional[int] = Query(None, description="Filtrar por ID de referencia"),
    fecha_desde: Optional[date] = Query(None, description="Fecha desde"),
    fecha_hasta: Optional[date] = Query(None, description="Fecha hasta"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Lista movimientos de tesorería con filtros opcionales.
    """
    # Validar permisos
    if current_user.role not in ["ADMINISTRADOR", "CONTADOR", "OPERADOR"]:
        raise HTTPException(status_code=403, detail="No tiene permisos para ver movimientos")
    
    # Cargar companies si no están cargadas
    from sqlalchemy.orm import joinedload
    if not current_user.companies:
        user = db.query(User).options(joinedload(User.companies)).filter(User.id == current_user.id).first()
        if user:
            current_user.companies = user.companies
    
    # Validar company_id
    if company_id not in [c.id for c in current_user.companies]:
        raise HTTPException(status_code=403, detail="No tiene acceso a esta empresa")
    
    query = db.query(MovimientoTesoreria).filter(
        MovimientoTesoreria.company_id == company_id
    )
    
    # Aplicar filtros
    if tipo:
        query = query.filter(MovimientoTesoreria.tipo == tipo)
    if referencia_tipo:
        query = query.filter(MovimientoTesoreria.referencia_tipo == referencia_tipo)
    if referencia_id:
        query = query.filter(MovimientoTesoreria.referencia_id == referencia_id)
    if fecha_desde:
        query = query.filter(MovimientoTesoreria.fecha >= fecha_desde)
    if fecha_hasta:
        query = query.filter(MovimientoTesoreria.fecha <= fecha_hasta)
    
    movimientos = query.order_by(MovimientoTesoreria.fecha.desc(), MovimientoTesoreria.id.desc()).all()
    
    # Formatear respuesta
    resultado = []
    for mov in movimientos:
        metodo_pago = db.query(MetodoPago).filter(MetodoPago.id == mov.metodo_pago_id).first()
        resultado.append({
            "id": mov.id,
            "tipo": mov.tipo,
            "referencia_tipo": mov.referencia_tipo,
            "referencia_id": mov.referencia_id,
            "monto": float(mov.monto),
            "fecha": mov.fecha.isoformat(),
            "metodo_pago_id": mov.metodo_pago_id,
            "metodo_pago_codigo": metodo_pago.codigo if metodo_pago else "",
            "metodo_pago_descripcion": metodo_pago.descripcion if metodo_pago else "",
            "estado": mov.estado,
            "journal_entry_id": mov.journal_entry_id,
            "glosa": mov.glosa,
            "created_at": mov.created_at.isoformat()
        })
    
    return {
        "success": True,
        "total": len(resultado),
        "movimientos": resultado
    }


@router.get("/metodos-pago")
def listar_metodos_pago(
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Lista métodos de pago disponibles para una empresa.
    """
    if company_id not in [c.id for c in current_user.companies]:
        raise HTTPException(status_code=403, detail="No tiene acceso a esta empresa")
    
    metodos = db.query(MetodoPago).filter(
        MetodoPago.company_id == company_id,
        MetodoPago.activo == True
    ).order_by(MetodoPago.codigo).all()
    
    return [
        {
            "id": m.id,
            "company_id": m.company_id,
            "codigo": m.codigo,
            "descripcion": m.descripcion,
            "impacta_en": m.impacta_en,
            "activo": m.activo
        }
        for m in metodos
    ]


@router.post("/init-metodos-pago")
def init_metodos_pago(
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Inicializa métodos de pago predeterminados para una empresa.
    
    Crea: EFECTIVO, TRANSFERENCIA, YAPE, PLIN, TARJETA
    
    También asegura que los eventos contables de Tesorería estén inicializados.
    
    Permite a OPERADOR para que pueda registrar cobros cuando los métodos aún no existen.
    """
    if current_user.role not in ["ADMINISTRADOR", "CONTADOR", "OPERADOR"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    
    # Cargar companies si no están cargadas
    from sqlalchemy.orm import joinedload
    if not current_user.companies:
        user = db.query(User).options(joinedload(User.companies)).filter(User.id == current_user.id).first()
        if user:
            current_user.companies = user.companies
    
    if company_id not in [c.id for c in current_user.companies]:
        raise HTTPException(status_code=403, detail="No tiene acceso a esta empresa")
    
    # Asegurar que los eventos contables de Tesorería estén inicializados
    from ...application.services_journal_engine_init import inicializar_eventos_y_reglas_predeterminadas
    try:
        inicializar_eventos_y_reglas_predeterminadas(db, company_id)
    except Exception as e:
        # Si falla, continuar de todas formas (puede que ya estén inicializados)
        # Pero registrar el error para debugging
        import logging
        logging.warning(f"No se pudieron inicializar eventos contables al inicializar métodos de pago: {e}")
    
    resultado = inicializar_metodos_pago_predeterminados(db, company_id)
    return resultado


@router.get("/saldo-pendiente-venta/{venta_id}")
def get_saldo_pendiente_venta_tesoreria(
    venta_id: int,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Calcula el saldo pendiente de una venta considerando los movimientos de tesorería.
    """
    # Validar permisos
    if current_user.role not in ["ADMINISTRADOR", "CONTADOR", "OPERADOR"]:
        raise HTTPException(status_code=403, detail="No tiene permisos")
    
    # Cargar companies si no están cargadas
    from sqlalchemy.orm import joinedload
    if not current_user.companies:
        user = db.query(User).options(joinedload(User.companies)).filter(User.id == current_user.id).first()
        if user:
            current_user.companies = user.companies
    
    # Validar company_id
    if company_id not in [c.id for c in current_user.companies]:
        raise HTTPException(status_code=403, detail="No tiene acceso a esta empresa")
    
    uow = UnitOfWork(db)
    try:
        servicio = TesoreriaService(uow)
        saldo = servicio._calcular_saldo_pendiente_venta(venta_id, company_id)
        return {"saldo_pendiente": float(saldo)}
    finally:
        uow.close()


@router.get("/saldo-pendiente-compra/{compra_id}")
def get_saldo_pendiente_compra_tesoreria(
    compra_id: int,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Calcula el saldo pendiente de una compra considerando los movimientos de tesorería.
    """
    # Validar permisos
    if current_user.role not in ["ADMINISTRADOR", "CONTADOR", "OPERADOR"]:
        raise HTTPException(status_code=403, detail="No tiene permisos")
    
    # Cargar companies si no están cargadas
    from sqlalchemy.orm import joinedload
    if not current_user.companies:
        user = db.query(User).options(joinedload(User.companies)).filter(User.id == current_user.id).first()
        if user:
            current_user.companies = user.companies
    
    # Validar company_id
    if company_id not in [c.id for c in current_user.companies]:
        raise HTTPException(status_code=403, detail="No tiene acceso a esta empresa")
    
    uow = UnitOfWork(db)
    try:
        servicio = TesoreriaService(uow)
        saldo = servicio._calcular_saldo_pendiente_compra(compra_id, company_id)
        return {"saldo_pendiente": float(saldo)}
    finally:
        uow.close()

@router.delete("/movimientos/bulk")
def eliminar_movimientos_masivo(
    movimiento_ids: List[int] = Query(..., description="IDs de movimientos a eliminar"),
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Elimina múltiples movimientos de tesorería y anula sus asientos contables.
    
    Similar a como se hace en compras/ventas al eliminar pagos.
    
    Args:
        movimiento_ids: Lista de IDs de movimientos a eliminar (puede ser uno o varios)
        company_id: ID de la empresa
    """
    # Validar permisos
    if current_user.role not in ["ADMINISTRADOR", "CONTADOR", "OPERADOR"]:
        raise HTTPException(status_code=403, detail="No tiene permisos para eliminar movimientos")
    
    # Validar que el usuario tiene acceso a la empresa
    from sqlalchemy.orm import joinedload
    if not current_user.companies:
        user = db.query(User).options(joinedload(User.companies)).filter(User.id == current_user.id).first()
        if user:
            current_user.companies = user.companies
    
    if company_id not in [c.id for c in current_user.companies]:
        raise HTTPException(status_code=403, detail="No tiene acceso a esta empresa")
    
    # Validar que hay IDs
    if not movimiento_ids or len(movimiento_ids) == 0:
        raise HTTPException(status_code=400, detail="No se proporcionaron IDs válidos")
    
    ids_list = movimiento_ids
    
    uow = UnitOfWork(db)
    try:
        servicio = TesoreriaService(uow)
        eliminados = 0
        errores = []
        
        for movimiento_id in ids_list:
            try:
                servicio.eliminar_movimiento(
                    movimiento_id=movimiento_id,
                    company_id=company_id,
                    usuario_id=current_user.id
                )
                eliminados += 1
            except TesoreriaError as e:
                errores.append(f"Movimiento {movimiento_id}: {str(e)}")
            except Exception as e:
                errores.append(f"Movimiento {movimiento_id}: Error inesperado - {str(e)}")
        
        uow.commit()
        
        return {
            "success": True,
            "eliminados": eliminados,
            "total_solicitados": len(ids_list),
            "errores": errores,
            "message": f"Se eliminaron {eliminados} de {len(ids_list)} movimiento(s) solicitados"
        }
    except Exception as e:
        uow.rollback()
        import logging
        logging.error(f"Error al eliminar movimientos masivamente: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error inesperado: {str(e)}")
    finally:
        uow.close()

# ⚠️ IMPORTANTE: Esta ruta debe ir DESPUÉS de /movimientos/bulk para evitar conflictos
@router.delete("/movimientos/{movimiento_id}")
def eliminar_movimiento(
    movimiento_id: int,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Elimina un movimiento de tesorería (cobro o pago) y anula su asiento contable.
    
    Similar a como se hace en compras/ventas al eliminar pagos.
    """
    # Validar permisos
    if current_user.role not in ["ADMINISTRADOR", "CONTADOR", "OPERADOR"]:
        raise HTTPException(status_code=403, detail="No tiene permisos para eliminar movimientos")
    
    # Validar que el usuario tiene acceso a la empresa
    from sqlalchemy.orm import joinedload
    if not current_user.companies:
        user = db.query(User).options(joinedload(User.companies)).filter(User.id == current_user.id).first()
        if user:
            current_user.companies = user.companies
    
    if company_id not in [c.id for c in current_user.companies]:
        raise HTTPException(status_code=403, detail="No tiene acceso a esta empresa")
    
    uow = UnitOfWork(db)
    try:
        servicio = TesoreriaService(uow)
        servicio.eliminar_movimiento(
            movimiento_id=movimiento_id,
            company_id=company_id,
            usuario_id=current_user.id
        )
        uow.commit()
        
        return {
            "success": True,
            "message": f"Movimiento {movimiento_id} eliminado y asiento contable anulado correctamente"
        }
    except TesoreriaError as e:
        uow.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        uow.rollback()
        import logging
        logging.error(f"Error al eliminar movimiento {movimiento_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error inesperado: {str(e)}")
    finally:
        uow.close()