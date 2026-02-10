"""
API de Gestión de Terceros (Proveedores y Clientes) - Contabilidad Peruana
===========================================================================

Gestión completa de proveedores y clientes según normativa peruana.
Incluye validación de RUC/DNI y campos requeridos para compras y ventas.
"""
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy.orm import Session
from typing import List, Optional
from ...dependencies import get_db
from ...security.auth import get_current_user
from ...domain.models import ThirdParty, Company

router = APIRouter(prefix="/terceros", tags=["terceros"])

# Validación de RUC peruano
def validate_ruc(ruc: str) -> bool:
    """Valida el checksum del RUC según algoritmo SUNAT"""
    if not ruc or len(ruc) != 11 or not ruc.isdigit():
        return False
    digits = [int(d) for d in ruc]
    weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
    sum_check = sum(digits[i] * weights[i] for i in range(10))
    mod = sum_check % 11
    check_digit = (11 - mod) % 10
    return check_digit == digits[10]

# Validación de DNI peruano (8 dígitos)
def validate_dni(dni: str) -> bool:
    """Valida formato básico de DNI (8 dígitos)"""
    return dni and len(dni) == 8 and dni.isdigit()

class ThirdPartyIn(BaseModel):
    company_id: int
    tax_id: str  # RUC o DNI
    tax_id_type: str = "6"  # Catálogo 06 SUNAT: 1=DNI, 6=RUC, 7=Pasaporte, 4=Carnet de Extranjería
    name: str  # Razón Social / Nombres y Apellidos
    type: str = "PROVEEDOR"  # CLIENTE o PROVEEDOR
    commercial_name: Optional[str] = None  # Nombre comercial
    address: Optional[str] = None  # Dirección fiscal/comercial
    district: Optional[str] = None
    province: Optional[str] = None
    department: Optional[str] = None
    phone: Optional[str] = None  # Teléfono / Celular
    email: Optional[EmailStr] = None  # Correo electrónico (para envío de comprobantes)
    website: Optional[str] = None
    contact_person: Optional[str] = None
    country_code: Optional[str] = "PE"  # País de residencia según Catálogo 18 SUNAT (PE=Perú)
    third_party_type: Optional[str] = "Nacional"  # Nacional, Extranjero, No domiciliado
    sunat_status: Optional[str] = None  # Estado SUNAT: Habido, No habido (solo para proveedores)
    active: bool = True
    notes: Optional[str] = None

    @field_validator('type')
    @classmethod
    def validate_type(cls, v):
        if v not in ['PROVEEDOR', 'CLIENTE']:
            raise ValueError('type debe ser PROVEEDOR o CLIENTE')
        return v

    @field_validator('tax_id_type')
    @classmethod
    def validate_tax_id_type(cls, v):
        # Catálogo 06 SUNAT: 1=DNI, 4=Carnet Extranjería, 6=RUC, 7=Pasaporte, 0=Doc. Identidad Extranjero
        valid_types = ['1', '4', '6', '7', '0']
        if v not in valid_types:
            raise ValueError(f'tax_id_type debe ser uno de: {", ".join(valid_types)} (Catálogo 06 SUNAT)')
        return v

    @field_validator('tax_id')
    @classmethod
    def validate_tax_id(cls, v, info):
        tax_id_type = info.data.get('tax_id_type', '6')  # Por defecto RUC
        if tax_id_type == '6':  # RUC
            if not validate_ruc(v):
                raise ValueError('RUC inválido: el checksum no es correcto')
        elif tax_id_type == '1':  # DNI
            if not validate_dni(v):
                raise ValueError('DNI inválido: debe tener 8 dígitos')
        # Para otros tipos (CE, Pasaporte, Doc. Extranjero) no validamos formato específico
        return v

class ThirdPartyUpdate(BaseModel):
    tax_id: Optional[str] = None
    tax_id_type: Optional[str] = None
    name: Optional[str] = None
    type: Optional[str] = None
    commercial_name: Optional[str] = None
    address: Optional[str] = None
    district: Optional[str] = None
    province: Optional[str] = None
    department: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    website: Optional[str] = None
    contact_person: Optional[str] = None
    country_code: Optional[str] = None
    third_party_type: Optional[str] = None
    sunat_status: Optional[str] = None
    active: Optional[bool] = None
    notes: Optional[str] = None

class ThirdPartyOut(BaseModel):
    id: int
    company_id: int
    tax_id: str
    tax_id_type: str
    name: str
    type: str
    commercial_name: Optional[str] = None
    address: Optional[str] = None
    district: Optional[str] = None
    province: Optional[str] = None
    department: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    contact_person: Optional[str] = None
    country_code: Optional[str] = None
    third_party_type: Optional[str] = None
    sunat_status: Optional[str] = None
    active: bool
    notes: Optional[str] = None

    class Config:
        from_attributes = True

@router.post("", response_model=ThirdPartyOut)
def create_third_party(
    payload: ThirdPartyIn,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Crea un nuevo tercero (proveedor o cliente)"""
    # Verificar que la empresa existe
    company = db.query(Company).filter(Company.id == payload.company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail=f"Empresa {payload.company_id} no encontrada")
    
    # Verificar que no exista otro tercero con el mismo RUC/DNI en la misma empresa
    existing = db.query(ThirdParty).filter(
        ThirdParty.company_id == payload.company_id,
        ThirdParty.tax_id == payload.tax_id,
        ThirdParty.tax_id_type == payload.tax_id_type
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Ya existe un {existing.type.lower()} con {payload.tax_id_type} {payload.tax_id} en esta empresa"
        )
    
    tercero = ThirdParty(
        company_id=payload.company_id,
        tax_id=payload.tax_id,
        tax_id_type=payload.tax_id_type,
        name=payload.name,
        type=payload.type,
        commercial_name=payload.commercial_name,
        address=payload.address,
        district=payload.district,
        province=payload.province,
        department=payload.department,
        phone=payload.phone,
        email=payload.email,
        website=payload.website,
        contact_person=payload.contact_person,
        country_code=payload.country_code,
        third_party_type=payload.third_party_type,
        sunat_status=payload.sunat_status,
        active=payload.active,
        notes=payload.notes
    )
    
    db.add(tercero)
    db.commit()
    db.refresh(tercero)
    
    return ThirdPartyOut.model_validate(tercero)

@router.get("", response_model=List[ThirdPartyOut])
def list_third_parties(
    company_id: int = Query(..., description="ID de la empresa"),
    type: Optional[str] = Query(None, description="Filtrar por tipo: PROVEEDOR o CLIENTE"),
    active: Optional[bool] = Query(None, description="Filtrar por estado activo"),
    search: Optional[str] = Query(None, description="Buscar por nombre o RUC/DNI"),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Lista terceros (proveedores y clientes) de una empresa"""
    query = db.query(ThirdParty).filter(ThirdParty.company_id == company_id)
    
    if type:
        if type not in ['PROVEEDOR', 'CLIENTE']:
            raise HTTPException(status_code=400, detail="type debe ser PROVEEDOR o CLIENTE")
        query = query.filter(ThirdParty.type == type)
    
    if active is not None:
        query = query.filter(ThirdParty.active == active)
    
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (ThirdParty.name.ilike(search_term)) |
            (ThirdParty.tax_id.ilike(search_term)) |
            (ThirdParty.commercial_name.ilike(search_term))
        )
    
    terceros = query.order_by(ThirdParty.name).all()
    return [ThirdPartyOut.model_validate(t) for t in terceros]

@router.get("/{tercero_id}", response_model=ThirdPartyOut)
def get_third_party(
    tercero_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Obtiene un tercero por ID"""
    tercero = db.query(ThirdParty).filter(ThirdParty.id == tercero_id).first()
    if not tercero:
        raise HTTPException(status_code=404, detail="Tercero no encontrado")
    return ThirdPartyOut.model_validate(tercero)

@router.patch("/{tercero_id}", response_model=ThirdPartyOut)
def update_third_party(
    tercero_id: int,
    payload: ThirdPartyUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Actualiza un tercero"""
    tercero = db.query(ThirdParty).filter(ThirdParty.id == tercero_id).first()
    if not tercero:
        raise HTTPException(status_code=404, detail="Tercero no encontrado")
    
    # Validar RUC/DNI si se actualiza
    if payload.tax_id is not None:
        tax_id_type = payload.tax_id_type or tercero.tax_id_type
        if tax_id_type == '6':  # RUC
            if not validate_ruc(payload.tax_id):
                raise HTTPException(status_code=400, detail="RUC inválido: el checksum no es correcto")
        elif tax_id_type == '1':  # DNI
            if not validate_dni(payload.tax_id):
                raise HTTPException(status_code=400, detail="DNI inválido: debe tener 8 dígitos")
        
        # Verificar duplicados si cambia el RUC/DNI
        if payload.tax_id != tercero.tax_id:
            existing = db.query(ThirdParty).filter(
                ThirdParty.company_id == tercero.company_id,
                ThirdParty.tax_id == payload.tax_id,
                ThirdParty.tax_id_type == tax_id_type,
                ThirdParty.id != tercero_id
            ).first()
            if existing:
                raise HTTPException(
                    status_code=400,
                    detail=f"Ya existe otro tercero con {tax_id_type} {payload.tax_id} en esta empresa"
                )
    
    # Actualizar campos
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(tercero, key, value)
    
    db.commit()
    db.refresh(tercero)
    
    return ThirdPartyOut.model_validate(tercero)

@router.delete("/{tercero_id}")
def delete_third_party(
    tercero_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Elimina un tercero (solo si no tiene compras/ventas asociadas)"""
    tercero = db.query(ThirdParty).filter(ThirdParty.id == tercero_id).first()
    if not tercero:
        raise HTTPException(status_code=404, detail="Tercero no encontrado")
    
    # Verificar si tiene compras o ventas asociadas
    from ...domain.models_ext import Purchase, Sale
    
    purchases_count = db.query(Purchase).filter(Purchase.supplier_id == tercero_id).count()
    sales_count = db.query(Sale).filter(Sale.customer_id == tercero_id).count()
    
    if purchases_count > 0 or sales_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"No se puede eliminar: el tercero tiene {purchases_count} compra(s) y {sales_count} venta(s) asociadas"
        )
    
    db.delete(tercero)
    db.commit()
    
    return {"message": "Tercero eliminado exitosamente"}

@router.get("/stats/{company_id}")
def get_third_parties_stats(
    company_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Obtiene estadísticas de terceros para una empresa"""
    total = db.query(ThirdParty).filter(ThirdParty.company_id == company_id).count()
    proveedores = db.query(ThirdParty).filter(
        ThirdParty.company_id == company_id,
        ThirdParty.type == "PROVEEDOR"
    ).count()
    clientes = db.query(ThirdParty).filter(
        ThirdParty.company_id == company_id,
        ThirdParty.type == "CLIENTE"
    ).count()
    activos = db.query(ThirdParty).filter(
        ThirdParty.company_id == company_id,
        ThirdParty.active == True
    ).count()
    
    return {
        "total": total,
        "proveedores": proveedores,
        "clientes": clientes,
        "activos": activos,
        "inactivos": total - activos
    }

