"""
Router para el Motor de Asientos Contables
Gestión de eventos, reglas y mapeos de tipos de cuenta
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import date
from decimal import Decimal

from ...dependencies import get_db
from ...domain.models_journal_engine import EventoContable, ReglaContable, TipoCuentaMapeo
from ...domain.models import Account
from ...security.auth import get_current_user
from ...domain.models import User
from ...domain.enums import UserRole
from ...infrastructure.unit_of_work import UnitOfWork
from ...application.services_journal_engine import MotorAsientos, MotorAsientosError, CuentaNoMapeadaError, AsientoDescuadradoError
from ...application.services_journal_engine_init import inicializar_eventos_y_reglas_predeterminadas
from ...application.services_journal_engine_auto_map import (
    buscar_cuenta_por_tipo, buscar_cuenta_con_score, mapear_automaticamente_todos, sugerir_cuenta_para_tipo
)

router = APIRouter(prefix="/journal-engine", tags=["journal-engine"])

# ===== DTOs =====

class EventoContableIn(BaseModel):
    tipo: str
    nombre: str
    descripcion: Optional[str] = None
    categoria: Optional[str] = None  # GENERAL, TESORERIA, INVENTARIO, COMPRAS, VENTAS

class EventoContableOut(BaseModel):
    id: int
    company_id: int
    tipo: str
    nombre: str
    descripcion: Optional[str]
    categoria: Optional[str]  # GENERAL, TESORERIA, INVENTARIO, COMPRAS, VENTAS
    activo: bool
    
    class Config:
        from_attributes = True

class ReglaContableIn(BaseModel):
    evento_id: int
    condicion: Optional[str] = None
    lado: str  # DEBE/HABER
    tipo_cuenta: str
    tipo_monto: str  # BASE, IGV, TOTAL, etc.
    orden: int = 0
    config: Optional[dict] = None
    activo: bool = True

class ReglaContableOut(BaseModel):
    id: int
    evento_id: int
    company_id: int
    condicion: Optional[str]
    lado: str
    tipo_cuenta: str
    tipo_monto: str
    orden: int
    config: Optional[dict]
    activo: bool
    
    class Config:
        from_attributes = True

class TipoCuentaMapeoIn(BaseModel):
    tipo_cuenta: str
    account_id: int
    config: Optional[dict] = None
    activo: bool = True

class TipoCuentaMapeoOut(BaseModel):
    id: int
    company_id: int
    tipo_cuenta: str
    account_id: int
    account_code: str
    account_name: str
    config: Optional[dict]
    activo: bool
    
    class Config:
        from_attributes = True

class GenerarAsientoRequest(BaseModel):
    evento_tipo: str
    datos_operacion: dict
    fecha: date
    glosa: str
    currency: str = "PEN"
    exchange_rate: float = 1.0

# ===== Endpoints =====

@router.get("/eventos", response_model=List[EventoContableOut])
def list_eventos(
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    auto_init: bool = Query(False, description="Inicializar eventos faltantes automáticamente")
):
    """
    Lista todos los eventos contables de una empresa.
    
    Si auto_init=True, inicializa todos los eventos, reglas y mapeos predeterminados.
    La inicialización es idempotente: solo crea lo que no existe.
    """
    # Inicializar todos los eventos/reglas predeterminados si se solicita
    if auto_init:
        try:
            inicializar_eventos_y_reglas_predeterminadas(db, company_id)
        except Exception as e:
            import logging
            logging.warning(f"Advertencia al inicializar eventos automáticamente: {e}")
    
    eventos = db.query(EventoContable).filter(
        EventoContable.company_id == company_id
    ).order_by(EventoContable.tipo).all()
    return eventos

@router.post("/eventos", response_model=EventoContableOut)
def create_evento(
    payload: EventoContableIn,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Crea un nuevo evento contable"""
    if current_user.role not in (UserRole.ADMINISTRADOR, UserRole.CONTADOR):
        raise HTTPException(403, "No autorizado")
    
    # Validar que el tipo no esté vacío
    if not payload.tipo or not payload.tipo.strip():
        raise HTTPException(400, detail="El tipo de evento es obligatorio")
    
    # Validar que el nombre no esté vacío
    if not payload.nombre or not payload.nombre.strip():
        raise HTTPException(400, detail="El nombre del evento es obligatorio")
    
    # Verificar que no exista ya un evento con el mismo tipo para esta empresa
    evento_existente = db.query(EventoContable).filter(
        EventoContable.company_id == company_id,
        EventoContable.tipo == payload.tipo.strip().upper()
    ).first()
    
    if evento_existente:
        raise HTTPException(400, detail=f"Ya existe un evento con el tipo '{payload.tipo}' para esta empresa")
    
    evento = EventoContable(
        company_id=company_id,
        tipo=payload.tipo.strip().upper(),
        nombre=payload.nombre.strip(),
        descripcion=payload.descripcion.strip() if payload.descripcion else None,
        categoria=payload.categoria.strip().upper() if payload.categoria else None,
        activo=True
    )
    db.add(evento)
    db.commit()
    db.refresh(evento)
    return evento

@router.put("/eventos/{evento_id}", response_model=EventoContableOut)
def update_evento(
    evento_id: int,
    payload: EventoContableIn,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Actualiza un evento contable existente"""
    if current_user.role not in (UserRole.ADMINISTRADOR, UserRole.CONTADOR):
        raise HTTPException(403, "No autorizado")
    
    evento = db.query(EventoContable).filter(
        EventoContable.id == evento_id,
        EventoContable.company_id == company_id
    ).first()
    
    if not evento:
        raise HTTPException(404, detail="Evento no encontrado")
    
    # Validar que el tipo no esté vacío
    if not payload.tipo or not payload.tipo.strip():
        raise HTTPException(400, detail="El tipo de evento es obligatorio")
    
    # Validar que el nombre no esté vacío
    if not payload.nombre or not payload.nombre.strip():
        raise HTTPException(400, detail="El nombre del evento es obligatorio")
    
    # Si se cambió el tipo, verificar que no exista otro evento con ese tipo
    nuevo_tipo = payload.tipo.strip().upper()
    if nuevo_tipo != evento.tipo:
        evento_existente = db.query(EventoContable).filter(
            EventoContable.company_id == company_id,
            EventoContable.tipo == nuevo_tipo,
            EventoContable.id != evento_id
        ).first()
        
        if evento_existente:
            raise HTTPException(400, detail=f"Ya existe un evento con el tipo '{nuevo_tipo}' para esta empresa")
    
    # Actualizar campos
    evento.tipo = nuevo_tipo
    evento.nombre = payload.nombre.strip()
    evento.descripcion = payload.descripcion.strip() if payload.descripcion else None
    evento.categoria = payload.categoria.strip().upper() if payload.categoria else None
    
    db.commit()
    db.refresh(evento)
    return evento

@router.patch("/eventos/{evento_id}/toggle-activo")
def toggle_evento_activo(
    evento_id: int,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Activa o desactiva un evento contable"""
    if current_user.role not in (UserRole.ADMINISTRADOR, UserRole.CONTADOR):
        raise HTTPException(403, "No autorizado")
    
    evento = db.query(EventoContable).filter(
        EventoContable.id == evento_id,
        EventoContable.company_id == company_id
    ).first()
    
    if not evento:
        raise HTTPException(404, detail="Evento no encontrado")
    
    evento.activo = not evento.activo
    db.commit()
    db.refresh(evento)
    return evento

@router.get("/reglas", response_model=List[ReglaContableOut])
def list_reglas(
    company_id: int = Query(..., description="ID de la empresa"),
    evento_id: Optional[int] = Query(None, description="Filtrar por evento"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista reglas contables"""
    query = db.query(ReglaContable).filter(ReglaContable.company_id == company_id)
    if evento_id:
        query = query.filter(ReglaContable.evento_id == evento_id)
    reglas = query.order_by(ReglaContable.orden).all()
    return reglas

@router.post("/reglas", response_model=ReglaContableOut)
def create_regla(
    payload: ReglaContableIn,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Crea una nueva regla contable"""
    if current_user.role not in (UserRole.ADMINISTRADOR, UserRole.CONTADOR):
        raise HTTPException(403, "No autorizado")
    
    # Verificar que el evento existe
    evento = db.query(EventoContable).filter(
        EventoContable.id == payload.evento_id,
        EventoContable.company_id == company_id
    ).first()
    if not evento:
        raise HTTPException(404, "Evento no encontrado")
    
    regla = ReglaContable(
        evento_id=payload.evento_id,
        company_id=company_id,
        condicion=payload.condicion,
        lado=payload.lado,
        tipo_cuenta=payload.tipo_cuenta,
        tipo_monto=payload.tipo_monto,
        orden=payload.orden,
        config=payload.config,
        activo=payload.activo
    )
    db.add(regla)
    db.commit()
    db.refresh(regla)
    return regla

@router.put("/reglas/{regla_id}", response_model=ReglaContableOut)
def update_regla(
    regla_id: int,
    payload: ReglaContableIn,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Actualiza una regla contable"""
    if current_user.role not in (UserRole.ADMINISTRADOR, UserRole.CONTADOR):
        raise HTTPException(403, "No autorizado")
    
    regla = db.query(ReglaContable).filter(
        ReglaContable.id == regla_id,
        ReglaContable.company_id == company_id
    ).first()
    if not regla:
        raise HTTPException(404, "Regla no encontrada")
    
    regla.condicion = payload.condicion
    regla.lado = payload.lado
    regla.tipo_cuenta = payload.tipo_cuenta
    regla.tipo_monto = payload.tipo_monto
    regla.orden = payload.orden
    regla.config = payload.config
    regla.activo = payload.activo
    
    db.commit()
    db.refresh(regla)
    return regla

@router.delete("/reglas/{regla_id}")
def delete_regla(
    regla_id: int,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Elimina una regla contable"""
    if current_user.role not in (UserRole.ADMINISTRADOR, UserRole.CONTADOR):
        raise HTTPException(403, "No autorizado")
    
    regla = db.query(ReglaContable).filter(
        ReglaContable.id == regla_id,
        ReglaContable.company_id == company_id
    ).first()
    if not regla:
        raise HTTPException(404, "Regla no encontrada")
    
    db.delete(regla)
    db.commit()
    return {"success": True}

@router.get("/tipo-cuenta-mapeos", response_model=List[TipoCuentaMapeoOut])
def list_tipo_cuenta_mapeos(
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista mapeos de tipos de cuenta"""
    mapeos = db.query(TipoCuentaMapeo).filter(
        TipoCuentaMapeo.company_id == company_id
    ).all()
    
    result = []
    for mapeo in mapeos:
        account = db.query(Account).filter(Account.id == mapeo.account_id).first()
        result.append({
            "id": mapeo.id,
            "company_id": mapeo.company_id,
            "tipo_cuenta": mapeo.tipo_cuenta,
            "account_id": mapeo.account_id,
            "account_code": account.code if account else "",
            "account_name": account.name if account else "",
            "config": mapeo.config,
            "activo": mapeo.activo
        })
    return result

@router.post("/tipo-cuenta-mapeos", response_model=TipoCuentaMapeoOut)
def create_tipo_cuenta_mapeo(
    payload: TipoCuentaMapeoIn,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Crea o actualiza un mapeo de tipo de cuenta"""
    if current_user.role not in (UserRole.ADMINISTRADOR, UserRole.CONTADOR):
        raise HTTPException(403, "No autorizado")
    
    # Verificar que la cuenta existe
    account = db.query(Account).filter(
        Account.id == payload.account_id,
        Account.company_id == company_id
    ).first()
    if not account:
        raise HTTPException(404, "Cuenta no encontrada")
    
    # Buscar mapeo existente
    mapeo = db.query(TipoCuentaMapeo).filter(
        TipoCuentaMapeo.company_id == company_id,
        TipoCuentaMapeo.tipo_cuenta == payload.tipo_cuenta
    ).first()
    
    if mapeo:
        # Actualizar existente
        mapeo.account_id = payload.account_id
        mapeo.config = payload.config
        mapeo.activo = payload.activo
    else:
        # Crear nuevo
        mapeo = TipoCuentaMapeo(
            company_id=company_id,
            tipo_cuenta=payload.tipo_cuenta,
            account_id=payload.account_id,
            config=payload.config,
            activo=payload.activo
        )
        db.add(mapeo)
    
    db.commit()
    db.refresh(mapeo)
    
    return {
        "id": mapeo.id,
        "company_id": mapeo.company_id,
        "tipo_cuenta": mapeo.tipo_cuenta,
        "account_id": mapeo.account_id,
        "account_code": account.code,
        "account_name": account.name,
        "config": mapeo.config,
        "activo": mapeo.activo
    }

@router.post("/tipo-cuenta-mapeos/auto-map")
def auto_mapear_todos(
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Mapea automáticamente todos los tipos de cuenta posibles"""
    if current_user.role not in (UserRole.ADMINISTRADOR, UserRole.CONTADOR):
        raise HTTPException(403, "No autorizado")
    
    try:
        resultado = mapear_automaticamente_todos(db, company_id)
        
        mensaje = f"Mapeo automático completado. {resultado['creados']} mapeos creados, {resultado['ya_existian']} ya existían."
        if resultado['requieren_revision']:
            mensaje += f"\n\n⚠️ {len(resultado['requieren_revision'])} mapeo(s) requieren revisión manual (score < 80%):"
            for item in resultado['requieren_revision']:
                mensaje += f"\n  - {item['tipo_cuenta']} → {item['account_code']} ({item['score']}% confianza)"
        
        return {
            "success": True,
            "message": mensaje,
            "mapeados": resultado["mapeados"],
            "creados": resultado["creados"],
            "ya_existian": resultado["ya_existian"],
            "no_encontrados": resultado["no_encontrados"],
            "requieren_revision": resultado.get("requieren_revision", [])
        }
    except Exception as e:
        raise HTTPException(500, detail=f"Error en mapeo automático: {str(e)}")

@router.post("/tipo-cuenta-mapeos/auto-map/{tipo_cuenta}")
def auto_mapear_tipo(
    tipo_cuenta: str,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Mapea automáticamente un tipo de cuenta específico"""
    if current_user.role not in (UserRole.ADMINISTRADOR, UserRole.CONTADOR):
        raise HTTPException(403, "No autorizado")
    
    try:
        # Verificar si ya existe mapeo
        mapeo_existente = db.query(TipoCuentaMapeo).filter(
            TipoCuentaMapeo.company_id == company_id,
            TipoCuentaMapeo.tipo_cuenta == tipo_cuenta,
            TipoCuentaMapeo.activo == True
        ).first()
        
        if mapeo_existente:
            account = db.query(Account).filter(Account.id == mapeo_existente.account_id).first()
            return {
                "success": True,
                "message": f"El tipo de cuenta '{tipo_cuenta}' ya está mapeado a {account.code if account else 'N/A'}",
                "mapeo": {
                    "id": mapeo_existente.id,
                    "tipo_cuenta": mapeo_existente.tipo_cuenta,
                    "account_id": mapeo_existente.account_id,
                    "account_code": account.code if account else "",
                    "account_name": account.name if account else ""
                }
            }
        
        # Buscar cuenta automáticamente con score
        resultado_busqueda = buscar_cuenta_con_score(db, company_id, tipo_cuenta)
        
        if not resultado_busqueda:
            # Obtener sugerencias para mostrar al usuario
            sugerencias = sugerir_cuenta_para_tipo(db, company_id, tipo_cuenta)
            sugerencias_formateadas = [
                {
                    "account_id": acc.id,
                    "account_code": acc.code,
                    "account_name": acc.name,
                    "account_type": acc.type.value if hasattr(acc.type, 'value') else str(acc.type),
                    "score": s
                }
                for acc, s in sugerencias[:5]  # Top 5 sugerencias
            ]
            
            return {
                "success": False,
                "message": f"No se encontró automáticamente una cuenta para '{tipo_cuenta}'. Use las sugerencias para mapear manualmente.",
                "sugerencias": sugerencias_formateadas
            }
        
        cuenta, score = resultado_busqueda
        
        # Si score < 80%, pedir confirmación
        if score < 80.0:
            # Obtener sugerencias para mostrar al usuario
            sugerencias = sugerir_cuenta_para_tipo(db, company_id, tipo_cuenta)
            sugerencias_formateadas = [
                {
                    "account_id": acc.id,
                    "account_code": acc.code,
                    "account_name": acc.name,
                    "account_type": acc.type.value if hasattr(acc.type, 'value') else str(acc.type),
                    "score": s
                }
                for acc, s in sugerencias[:5]  # Top 5 sugerencias
            ]
            
            return {
                "success": False,
                "message": f"⚠️ Mapeo encontrado con baja confianza ({round(score, 1)}%). Se requiere confirmación manual.",
                "score": round(score, 1),
                "cuenta_sugerida": {
                    "account_id": cuenta.id,
                    "account_code": cuenta.code,
                    "account_name": cuenta.name,
                    "score": round(score, 1)
                },
                "sugerencias": sugerencias_formateadas
            }
        
        # Crear mapeo (score >= 80%)
        mapeo = TipoCuentaMapeo(
            company_id=company_id,
            tipo_cuenta=tipo_cuenta,
            account_id=cuenta.id,
            activo=True
        )
        db.add(mapeo)
        db.commit()
        db.refresh(mapeo)
        
        return {
            "success": True,
            "message": f"Tipo de cuenta '{tipo_cuenta}' mapeado automáticamente a {cuenta.code} - {cuenta.name} (confianza: {round(score, 1)}%)",
            "score": round(score, 1),
            "mapeo": {
                "id": mapeo.id,
                "tipo_cuenta": mapeo.tipo_cuenta,
                "account_id": mapeo.account_id,
                "account_code": cuenta.code,
                "account_name": cuenta.name
            }
        }
    except Exception as e:
        raise HTTPException(500, detail=f"Error en mapeo automático: {str(e)}")

@router.get("/tipo-cuenta-mapeos/sugerencias/{tipo_cuenta}")
def get_sugerencias_mapeo(
    tipo_cuenta: str,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtiene sugerencias de cuentas para un tipo de cuenta específico"""
    try:
        sugerencias = sugerir_cuenta_para_tipo(db, company_id, tipo_cuenta)
        sugerencias_formateadas = [
            {
                "account_id": acc.id,
                "account_code": acc.code,
                "account_name": acc.name,
                "account_type": acc.type.value if hasattr(acc.type, 'value') else str(acc.type),
                "score": score
            }
            for acc, score in sugerencias
        ]
        
        return {
            "tipo_cuenta": tipo_cuenta,
            "sugerencias": sugerencias_formateadas
        }
    except Exception as e:
        raise HTTPException(500, detail=f"Error obteniendo sugerencias: {str(e)}")

@router.post("/init-defaults")
def init_defaults(
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Inicializa eventos y reglas predeterminadas"""
    if current_user.role not in (UserRole.ADMINISTRADOR, UserRole.CONTADOR):
        raise HTTPException(403, "No autorizado")
    
    result = inicializar_eventos_y_reglas_predeterminadas(db, company_id)
    return result

@router.post("/simular-asiento")
def simular_asiento(
    payload: GenerarAsientoRequest,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Simula la generación de un asiento contable sin crearlo realmente.
    
    Útil para pruebas y validación antes de usar el motor en producción.
    No persiste ningún dato en la base de datos.
    """
    if current_user.role not in (UserRole.ADMINISTRADOR, UserRole.CONTADOR):
        raise HTTPException(403, "No autorizado")
    
    uow = UnitOfWork()
    try:
        motor = MotorAsientos(uow)
        resultado = motor.simular_asiento(
            evento_tipo=payload.evento_tipo,
            datos_operacion=payload.datos_operacion,
            company_id=company_id,
            fecha=payload.fecha,
            glosa=payload.glosa,
            currency=payload.currency,
            exchange_rate=Decimal(str(payload.exchange_rate))
        )
        
        return {
            "success": True,
            "simulacion": True,  # Indica que es una simulación
            "total_debit": resultado["total_debit"],
            "total_credit": resultado["total_credit"],
            "cuadra": resultado["cuadra"],
            "evento": resultado["evento"],
            "evento_nombre": resultado["evento_nombre"],
            "glosa": resultado["glosa"],
            "fecha": resultado["fecha"],
            "lineas": resultado["lineas"]
        }
    except CuentaNoMapeadaError as e:
        uow.close()
        raise HTTPException(400, detail=f"Error: {str(e)}. Configure los mapeos de tipos de cuenta primero.")
    except AsientoDescuadradoError as e:
        uow.close()
        raise HTTPException(400, detail=f"Error: {str(e)}")
    except MotorAsientosError as e:
        uow.close()
        raise HTTPException(400, detail=f"Error: {str(e)}")
    except Exception as e:
        import logging
        logging.exception("simular-asiento 500: %s", e)
        uow.close()
        raise HTTPException(500, detail=f"Error inesperado: {str(e)}")
    finally:
        uow.close()

@router.post("/generar-asiento")
def generar_asiento(
    payload: GenerarAsientoRequest,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Genera un asiento contable real usando el motor.
    
    ⚠️ ADVERTENCIA: Este endpoint crea asientos reales en la base de datos.
    Para pruebas, use /simular-asiento en su lugar.
    """
    if current_user.role not in (UserRole.ADMINISTRADOR, UserRole.CONTADOR):
        raise HTTPException(403, "No autorizado")
    
    uow = UnitOfWork()
    try:
        motor = MotorAsientos(uow)
        asiento = motor.generar_asiento(
            evento_tipo=payload.evento_tipo,
            datos_operacion=payload.datos_operacion,
            company_id=company_id,
            fecha=payload.fecha,
            glosa=payload.glosa,
            currency=payload.currency,
            exchange_rate=Decimal(str(payload.exchange_rate))
        )
        uow.commit()
        
        total_debit = float(sum(float(l.debit) for l in asiento.lines))
        total_credit = float(sum(float(l.credit) for l in asiento.lines))
        
        return {
            "success": True,
            "asiento_id": asiento.id,
            "total_debit": total_debit,
            "total_credit": total_credit,
            "cuadra": abs(total_debit - total_credit) < 0.01,
            "lineas": [
                {
                    "account_code": l.account.code,
                    "account_name": l.account.name,
                    "debit": float(l.debit),
                    "credit": float(l.credit),
                    "memo": l.memo
                }
                for l in asiento.lines
            ]
        }
    except CuentaNoMapeadaError as e:
        uow.close()
        raise HTTPException(400, detail=f"Error: {str(e)}. Configure los mapeos de tipos de cuenta primero.")
    except AsientoDescuadradoError as e:
        uow.close()
        raise HTTPException(400, detail=f"Error: {str(e)}")
    except MotorAsientosError as e:
        uow.close()
        raise HTTPException(400, detail=f"Error: {str(e)}")
    except Exception as e:
        uow.close()
        raise HTTPException(500, detail=f"Error inesperado: {str(e)}")
    finally:
        uow.close()

@router.post("/tipo-cuenta-mapeos/validar-y-corregir")
def validar_y_corregir_mapeos(
    company_id: int = Query(..., description="ID de la empresa"),
    auto_corregir: bool = Query(True, description="Corregir automáticamente los mapeos incorrectos"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Valida todos los mapeos de tipos de cuenta y corrige los incorrectos.
    
    Detecta problemas como:
    - IGV_CREDITO mapeado a una cuenta de Pasivo (debe ser Activo)
    - IGV_DEBITO mapeado a una cuenta de Activo (debe ser Pasivo)
    - Mapeos duplicados (múltiples tipos mapeados a la misma cuenta incorrecta)
    """
    if current_user.role not in (UserRole.ADMINISTRADOR, UserRole.CONTADOR):
        raise HTTPException(403, "No autorizado")
    
    from ...application.validations_journal_engine import validar_mapeo_sensible, MAPEOS_SENSIBLES
    
    mapeos = db.query(TipoCuentaMapeo).filter(
        TipoCuentaMapeo.company_id == company_id,
        TipoCuentaMapeo.activo == True
    ).all()
    
    problemas = []
    corregidos = []
    
    for mapeo in mapeos:
        account = db.query(Account).filter(Account.id == mapeo.account_id).first()
        if not account:
            problemas.append({
                "tipo_cuenta": mapeo.tipo_cuenta,
                "account_id": mapeo.account_id,
                "problema": "Cuenta no encontrada",
                "corregido": False
            })
            continue
        
        # Validar mapeo sensible
        if mapeo.tipo_cuenta in MAPEOS_SENSIBLES:
            es_valido, error = validar_mapeo_sensible(mapeo.tipo_cuenta, account)
            if not es_valido:
                problemas.append({
                    "tipo_cuenta": mapeo.tipo_cuenta,
                    "account_id": mapeo.account_id,
                    "account_code": account.code,
                    "account_name": account.name,
                    "account_type": account.type.value,
                    "problema": error,
                    "corregido": False
                })
                
                # Intentar corregir automáticamente
                if auto_corregir:
                    try:
                        cuenta_correcta = buscar_cuenta_por_tipo(db, company_id, mapeo.tipo_cuenta)
                        if cuenta_correcta and cuenta_correcta.id != account.id:
                            # Validar que la cuenta correcta sea válida
                            es_valida_correcta, _ = validar_mapeo_sensible(mapeo.tipo_cuenta, cuenta_correcta)
                            if es_valida_correcta:
                                mapeo.account_id = cuenta_correcta.id
                                db.flush()
                                corregidos.append({
                                    "tipo_cuenta": mapeo.tipo_cuenta,
                                    "account_anterior": {
                                        "id": account.id,
                                        "code": account.code,
                                        "name": account.name,
                                        "type": account.type.value
                                    },
                                    "account_nuevo": {
                                        "id": cuenta_correcta.id,
                                        "code": cuenta_correcta.code,
                                        "name": cuenta_correcta.name,
                                        "type": cuenta_correcta.type.value
                                    },
                                    "problema": error
                                })
                                problemas[-1]["corregido"] = True
                    except Exception as e:
                        import logging
                        logging.error(f"Error al corregir mapeo {mapeo.tipo_cuenta}: {e}")
    
    db.commit()
    
    return {
        "success": True,
        "total_mapeos": len(mapeos),
        "problemas_encontrados": len(problemas),
        "problemas_corregidos": len(corregidos),
        "problemas": problemas,
        "corregidos": corregidos
    }

