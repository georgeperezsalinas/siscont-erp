from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ...dependencies import get_db
from ...domain.models import Company, User
from ...security.auth import get_current_user
from ...domain.enums import UserRole
from ...infrastructure.unit_of_work import UnitOfWork
from ...application.services import load_plan_base_csv

router = APIRouter(prefix="/companies", tags=["companies"])

class CompanyIn(BaseModel):
    name: str  # Razón Social (obligatorio)
    ruc: str | None = None  # RUC (11 dígitos) - obligatorio para PLE
    commercial_name: str | None = None  # Nombre Comercial
    taxpayer_type: str | None = None  # Tipo de Contribuyente: Natural con negocio, Jurídica, EIRL
    fiscal_address: str | None = None  # Domicilio Fiscal
    ubigeo: str | None = None  # Ubigeo SUNAT (6 dígitos)
    phone: str | None = None  # Teléfono
    email: str | None = None  # Correo electrónico
    tax_regime: str | None = None  # Régimen Tributario: RMT, MYPE, Régimen General, etc.
    economic_activity_code: str | None = None  # Actividad Económica (CIIU) - código SUNAT/INEI
    sunat_status: str | None = None  # Estado SUNAT: Activo, Baja definitiva
    domicile_condition: str | None = None  # Condición Domicilio SUNAT: Habido, No habido
    legal_representative_name: str | None = None  # Nombres del representante legal
    legal_representative_dni: str | None = None  # DNI del representante legal
    legal_representative_position: str | None = None  # Cargo del representante legal

class CompanyUpdate(BaseModel):
    name: str | None = None
    ruc: str | None = None
    commercial_name: str | None = None
    taxpayer_type: str | None = None
    fiscal_address: str | None = None
    ubigeo: str | None = None
    phone: str | None = None
    email: str | None = None
    tax_regime: str | None = None
    economic_activity_code: str | None = None
    sunat_status: str | None = None
    domicile_condition: str | None = None
    legal_representative_name: str | None = None
    legal_representative_dni: str | None = None
    legal_representative_position: str | None = None

class CompanyOut(BaseModel):
    id: int
    name: str
    ruc: str | None
    commercial_name: str | None = None
    taxpayer_type: str | None = None
    fiscal_address: str | None = None
    ubigeo: str | None = None
    phone: str | None = None
    email: str | None = None
    tax_regime: str | None = None
    economic_activity_code: str | None = None
    sunat_status: str | None = None
    domicile_condition: str | None = None
    legal_representative_name: str | None = None
    legal_representative_dni: str | None = None
    legal_representative_position: str | None = None
    active: bool

    class Config:
        from_attributes = True

class CompanyPage(BaseModel):
    items: list[CompanyOut]
    total: int

@router.get("", response_model=CompanyPage)
def list_companies(
    db: Session = Depends(get_db),
    q: str | None = Query(default=None, description="Buscar por nombre o RUC"),
    active: bool | None = Query(default=None, description="Filtrar por estado activo"),
    order_by: str = Query(default="id", description="Ordenar por: id, name, ruc"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
):
    query = db.query(Company)
    if q:
        like = f"%{q}%"
        query = query.filter((Company.name.ilike(like)) | (Company.ruc.ilike(like)))
    if active is not None:
        query = query.filter(Company.active == active)
    # Ordenamiento
    order_map = {
        "id": Company.id,
        "name": Company.name,
        "ruc": Company.ruc,
    }
    order_col = order_map.get(order_by, Company.id)
    query = query.order_by(order_col)
    total = query.count()
    items = query.offset((page-1)*page_size).limit(page_size).all()
    return CompanyPage(items=items, total=total)

@router.get("/export")
def export_companies(
    db: Session = Depends(get_db),
    q: str | None = Query(default=None, description="Buscar por nombre o RUC"),
    active: bool | None = Query(default=None, description="Filtrar por estado activo"),
    format: str = Query(default="csv", description="Formato: csv o excel"),
):
    query = db.query(Company)
    if q:
        like = f"%{q}%"
        query = query.filter((Company.name.ilike(like)) | (Company.ruc.ilike(like)))
    if active is not None:
        query = query.filter(Company.active == active)
    rows = query.order_by(Company.id).all()
    
    if format == "excel":
        try:
            import openpyxl
            from io import BytesIO
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "Empresas"
            ws.append(["ID", "Razón Social", "RUC", "Activa"])
            for r in rows:
                ws.append([r.id, r.name, r.ruc or "", "Sí" if r.active else "No"])
            buffer = BytesIO()
            wb.save(buffer)
            buffer.seek(0)
            content = buffer.getvalue()
            headers = {
                "Content-Disposition": "attachment; filename=empresas.xlsx",
            }
            return Response(
                content=content,
                headers=headers,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            )
        except ImportError:
            raise HTTPException(status_code=500, detail="openpyxl no está instalado. Use: pip install openpyxl")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error generando Excel: {str(e)}")
    
    # CSV por defecto
    lines = ["id,name,ruc,active"]
    for r in rows:
        name = (r.name or '').replace('"', '""')
        ruc = (r.ruc or '').replace('"', '""')
        lines.append(f'{r.id},"{name}","{ruc}",{str(r.active).lower()}')
    csv = "\n".join(lines)
    headers = {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=empresas.csv",
    }
    return Response(content=csv, headers=headers, media_type="text/csv")

@router.post("", response_model=CompanyOut)
def create_company(payload: CompanyIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != UserRole.ADMINISTRADOR:
        raise HTTPException(status_code=403, detail="Solo administradores pueden crear empresas")
    if db.query(Company).filter(Company.name == payload.name).first():
        raise HTTPException(status_code=400, detail="La empresa ya existe")
    c = Company(
        name=payload.name,
        ruc=payload.ruc,
        commercial_name=payload.commercial_name,
        taxpayer_type=payload.taxpayer_type,
        fiscal_address=payload.fiscal_address,
        ubigeo=payload.ubigeo,
        phone=payload.phone,
        email=payload.email,
        tax_regime=payload.tax_regime,
        economic_activity_code=payload.economic_activity_code,
        sunat_status=payload.sunat_status,
        domicile_condition=payload.domicile_condition,
        legal_representative_name=payload.legal_representative_name,
        legal_representative_dni=payload.legal_representative_dni,
        legal_representative_position=payload.legal_representative_position
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    
    # Cargar plan de cuentas base automáticamente
    try:
        uow = UnitOfWork(db)
        result = load_plan_base_csv(uow, c.id, replace_all=False)
        accounts_created = result["created"] if isinstance(result, dict) else result
        uow.commit()
        # Log opcional: print(f"Plan base cargado: {accounts_created} cuentas creadas para empresa {c.id}")
    except Exception as e:
        # Si falla la carga del plan, no fallar la creación de la empresa
        # pero registrar el error
        print(f"Advertencia: No se pudo cargar plan_base.csv para empresa {c.id}: {e}")
        db.rollback()
        # Re-hacer commit de la empresa
        db.commit()
        db.refresh(c)
    
    return c

@router.patch("/{company_id}", response_model=CompanyOut)
def update_company(company_id:int, payload: CompanyUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != UserRole.ADMINISTRADOR:
        raise HTTPException(status_code=403, detail="Solo administradores pueden editar empresas")
    c = db.get(Company, company_id)
    if not c: raise HTTPException(404, detail="Empresa no encontrada")
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(c, key, value)
    db.commit(); db.refresh(c)
    return c

@router.patch("/{company_id}/deactivate", response_model=CompanyOut)
def deactivate_company(company_id:int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != UserRole.ADMINISTRADOR:
        raise HTTPException(status_code=403, detail="Solo administradores pueden desactivar empresas")
    c = db.get(Company, company_id)
    if not c: raise HTTPException(404, detail="Empresa no encontrada")
    c.active = False
    db.commit(); db.refresh(c)
    return c

@router.patch("/{company_id}/activate", response_model=CompanyOut)
def activate_company(company_id:int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != UserRole.ADMINISTRADOR:
        raise HTTPException(status_code=403, detail="Solo administradores pueden activar empresas")
    c = db.get(Company, company_id)
    if not c: raise HTTPException(404, detail="Empresa no encontrada")
    c.active = True
    db.commit(); db.refresh(c)
    return c

@router.delete("/{company_id}", status_code=204)
def delete_company(company_id:int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != UserRole.ADMINISTRADOR:
        raise HTTPException(status_code=403, detail="Solo administradores pueden eliminar empresas")
    c = db.get(Company, company_id)
    if not c: raise HTTPException(404, detail="Empresa no encontrada")
    db.delete(c); db.commit()
    return
