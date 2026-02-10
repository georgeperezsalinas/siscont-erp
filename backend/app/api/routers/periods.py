from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
from ...dependencies import get_db
from ...domain.models import Period, Company, User
from ...security.auth import get_current_user
from ...domain.enums import UserRole
from ...application.services_cierre_periodo import (
    validate_period_before_close,
    close_period,
    reopen_period,
    can_modify_entry_in_period,
    PeriodValidationError
)

router = APIRouter(prefix="/periods", tags=["periods"])

class PeriodIn(BaseModel):
	empresa_id: int
	year: int
	month: int
	status: str = "ABIERTO"  # ABIERTO / CERRADO

class PeriodUpdate(BaseModel):
	status: str | None = None
	year: int | None = None
	month: int | None = None

class PeriodOut(BaseModel):
	id: int
	company_id: int
	year: int
	month: int
	status: str
	closed_at: Optional[datetime] = None
	closed_by: Optional[int] = None
	reopened_at: Optional[datetime] = None
	reopened_by: Optional[int] = None
	close_reason: Optional[str] = None
	reopen_reason: Optional[str] = None
	class Config:
		from_attributes = True

class ClosePeriodRequest(BaseModel):
	reason: Optional[str] = None

class ReopenPeriodRequest(BaseModel):
	reason: Optional[str] = None

@router.get("", response_model=list[PeriodOut])
def list_periods(company_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
	# Usuarios no admin solo pueden listar si la empresa está entre sus asignadas
	if current_user.role != UserRole.ADMINISTRADOR:
		if not any(c.id == company_id for c in current_user.companies):
			raise HTTPException(403, "No autorizado para ver periodos de esta empresa")
	return db.query(Period).filter(Period.company_id == company_id).order_by(Period.year.desc(), Period.month.desc()).all()

@router.post("", response_model=PeriodOut)
def create_period(payload: PeriodIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
	# Solo ADMIN y CONTADOR pueden crear periodos
	if current_user.role not in (UserRole.ADMINISTRADOR, UserRole.CONTADOR):
		raise HTTPException(403, "No autorizado a crear periodos")
	# Validar empresa
	company = db.get(Company, payload.empresa_id)
	if not company:
		raise HTTPException(404, "Empresa no encontrada")
	# Evitar duplicados año-mes
	exists = db.query(Period).filter(Period.company_id==payload.empresa_id, Period.year==payload.year, Period.month==payload.month).first()
	if exists:
		raise HTTPException(400, "Periodo ya existe")
	p = Period(company_id=payload.empresa_id, year=payload.year, month=payload.month, status=payload.status)
	db.add(p); db.commit(); db.refresh(p)
	return p

@router.patch("/{period_id}", response_model=PeriodOut)
def update_period(period_id: int, payload: PeriodUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
	# Solo ADMIN y CONTADOR pueden editar periodos
	if current_user.role not in (UserRole.ADMINISTRADOR, UserRole.CONTADOR):
		raise HTTPException(403, "No autorizado a editar periodos")
	p = db.get(Period, period_id)
	if not p: raise HTTPException(404, "Periodo no encontrado")
	if payload.status is not None: p.status = payload.status
	if payload.year is not None: p.year = payload.year
	if payload.month is not None: p.month = payload.month
	db.commit(); db.refresh(p)
	return p

@router.delete("/{period_id}", status_code=204)
def delete_period(period_id:int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
	# Solo ADMIN pueden eliminar periodos
	if current_user.role != UserRole.ADMINISTRADOR:
		raise HTTPException(403, "No autorizado a eliminar periodos")
	p = db.get(Period, period_id)
	if not p: raise HTTPException(404, "Periodo no encontrado")
	db.delete(p); db.commit()
	return

# ===== CIERRE DE PERÍODO =====

@router.get("/{period_id}/close-validation")
def get_close_validation(
	period_id: int,
	db: Session = Depends(get_db),
	current_user: User = Depends(get_current_user)
):
	"""
	Valida un período antes de cerrarlo.
	Retorna información detallada sobre las validaciones.
	"""
	# Solo ADMIN y CONTADOR pueden validar períodos para cierre
	if current_user.role not in (UserRole.ADMINISTRADOR, UserRole.CONTADOR):
		raise HTTPException(403, "No autorizado para validar cierre de períodos")
	
	try:
		validation = validate_period_before_close(db, period_id, current_user.id)
		return validation
	except PeriodValidationError as e:
		raise HTTPException(400, detail=str(e))

@router.post("/{period_id}/close", response_model=PeriodOut)
def close_period_endpoint(
	period_id: int,
	request: ClosePeriodRequest,
	db: Session = Depends(get_db),
	current_user: User = Depends(get_current_user)
):
	"""
	Cierra un período contable.
	Realiza todas las validaciones necesarias antes de cerrar.
	"""
	# Solo ADMIN y CONTADOR pueden cerrar períodos
	if current_user.role not in (UserRole.ADMINISTRADOR, UserRole.CONTADOR):
		raise HTTPException(403, "No autorizado para cerrar períodos")
	
	try:
		period = close_period(db, period_id, current_user.id, request.reason)
		return period
	except PeriodValidationError as e:
		raise HTTPException(400, detail=str(e))
	except Exception as e:
		raise HTTPException(500, detail=f"Error al cerrar período: {str(e)}")

@router.post("/{period_id}/reopen", response_model=PeriodOut)
def reopen_period_endpoint(
	period_id: int,
	request: ReopenPeriodRequest,
	db: Session = Depends(get_db),
	current_user: User = Depends(get_current_user)
):
	"""
	Reabre un período cerrado.
	SOLO ADMINISTRADOR puede reabrir períodos.
	"""
	# Solo ADMIN puede reabrir períodos
	if current_user.role != UserRole.ADMINISTRADOR:
		raise HTTPException(403, "Solo administradores pueden reabrir períodos cerrados")
	
	try:
		period = reopen_period(db, period_id, current_user.id, request.reason)
		return period
	except PeriodValidationError as e:
		raise HTTPException(400, detail=str(e))
	except Exception as e:
		raise HTTPException(500, detail=f"Error al reabrir período: {str(e)}")

