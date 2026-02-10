from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel, Field
from decimal import Decimal
from ...dependencies import get_db
from ...domain.models import SystemSettings, Company

router = APIRouter(prefix="/settings", tags=["settings"])

class SystemSettingsOut(BaseModel):
    id: int
    company_id: int
    number_thousand_separator: str
    number_decimal_separator: str
    number_decimal_places: int
    currency_code: str
    currency_symbol: str
    date_format: str
    default_igv_rate: Decimal
    fiscal_year_start_month: int
    allow_edit_closed_periods: bool
    auto_generate_journal_entries: bool
    require_period_validation: bool
    extra_settings: Optional[dict] = None

    class Config:
        from_attributes = True

class SystemSettingsIn(BaseModel):
    number_thousand_separator: str = Field(default=",", min_length=1, max_length=1)
    number_decimal_separator: str = Field(default=".", min_length=1, max_length=1)
    number_decimal_places: int = Field(default=2, ge=0, le=4)
    currency_code: str = Field(default="PEN", min_length=3, max_length=3)
    currency_symbol: str = Field(default="S/", max_length=5)
    date_format: str = Field(default="DD/MM/YYYY", max_length=20)
    default_igv_rate: Decimal = Field(default=Decimal("18.00"), ge=0, le=100)
    fiscal_year_start_month: int = Field(default=1, ge=1, le=12)
    allow_edit_closed_periods: bool = False
    auto_generate_journal_entries: bool = True
    require_period_validation: bool = True
    extra_settings: Optional[dict] = None

@router.get("/company/{company_id}", response_model=SystemSettingsOut)
def get_settings(company_id: int, db: Session = Depends(get_db)):
    """Obtener configuración del sistema para una empresa"""
    settings = db.query(SystemSettings).filter(SystemSettings.company_id == company_id).first()
    if not settings:
        # Retornar configuración por defecto si no existe
        company = db.query(Company).filter(Company.id == company_id).first()
        if not company:
            raise HTTPException(status_code=404, detail="Empresa no encontrada")
        # Crear configuración por defecto
        default_settings = SystemSettings(
            company_id=company_id,
            number_thousand_separator=",",
            number_decimal_separator=".",
            number_decimal_places=2,
            currency_code="PEN",
            currency_symbol="S/",
            date_format="DD/MM/YYYY",
            default_igv_rate=Decimal("18.00"),
            fiscal_year_start_month=1,
            allow_edit_closed_periods=False,
            auto_generate_journal_entries=True,
            require_period_validation=True
        )
        db.add(default_settings)
        db.commit()
        db.refresh(default_settings)
        return default_settings
    return settings

@router.put("/company/{company_id}", response_model=SystemSettingsOut)
def update_settings(company_id: int, payload: SystemSettingsIn, db: Session = Depends(get_db)):
    """Actualizar configuración del sistema para una empresa"""
    settings = db.query(SystemSettings).filter(SystemSettings.company_id == company_id).first()
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    
    if not settings:
        # Crear nueva configuración
        settings = SystemSettings(company_id=company_id, **payload.model_dump())
        db.add(settings)
    else:
        # Actualizar configuración existente
        update_data = payload.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(settings, key, value)
    
    db.commit()
    db.refresh(settings)
    return settings

