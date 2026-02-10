"""
Gestión Dinámica de Roles
==========================
API para crear, editar y eliminar roles dinámicamente desde la interfaz.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from pydantic import BaseModel, Field
from fastapi import Query
from datetime import datetime
from ...dependencies import get_db
from ...domain.models import Role, RolePermission, User
from ...security.auth import get_current_user

router = APIRouter(prefix="/roles", tags=["roles"])

class RoleOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    active: bool
    is_system: bool
    created_at: datetime
    updated_at: datetime
    permissions: List[str] = []

    class Config:
        from_attributes = True

class RoleIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=50, description="Nombre del rol (ej: 'ADMINISTRADOR', 'CONTADOR')")
    description: Optional[str] = Field(None, max_length=500)
    active: bool = True
    permissions: List[str] = Field(default_factory=list, description="Lista de códigos de permisos")

class RoleUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=50)
    description: Optional[str] = Field(None, max_length=500)
    active: Optional[bool] = None
    permissions: Optional[List[str]] = None

@router.get("", response_model=List[RoleOut])
def list_roles(
    active: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista todos los roles del sistema. Solo administradores."""
    if current_user.role != "ADMINISTRADOR" and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Solo administradores pueden listar roles")
    
    query = db.query(Role).options(joinedload(Role.permissions))
    if active is not None:
        query = query.filter(Role.active == active)
    
    roles = query.order_by(Role.name).all()
    
    # Cargar permisos para cada rol
    result = []
    for role in roles:
        perms = [rp.permission for rp in role.permissions]
        # Construir RoleOut manualmente excluyendo permissions de la validación
        role_data = {
            "id": role.id,
            "name": role.name,
            "description": role.description,
            "active": role.active,
            "is_system": role.is_system,
            "created_at": role.created_at,
            "updated_at": role.updated_at,
            "permissions": perms
        }
        result.append(RoleOut(**role_data))
    
    return result

@router.get("/{role_id}", response_model=RoleOut)
def get_role(
    role_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtiene un rol por ID. Solo administradores."""
    if current_user.role != "ADMINISTRADOR" and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Solo administradores pueden ver roles")
    
    role = db.query(Role).options(joinedload(Role.permissions)).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Rol no encontrado")
    
    perms = [rp.permission for rp in role.permissions]
    # Construir RoleOut manualmente excluyendo permissions de la validación
    role_data = {
        "id": role.id,
        "name": role.name,
        "description": role.description,
        "active": role.active,
        "is_system": role.is_system,
        "created_at": role.created_at,
        "updated_at": role.updated_at,
        "permissions": perms
    }
    return RoleOut(**role_data)

@router.post("", response_model=RoleOut)
def create_role(
    payload: RoleIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Crea un nuevo rol. Solo administradores."""
    if current_user.role != "ADMINISTRADOR" and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Solo administradores pueden crear roles")
    
    # Verificar que no exista un rol con el mismo nombre
    existing = db.query(Role).filter(Role.name == payload.name.upper()).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Ya existe un rol con el nombre '{payload.name}'")
    
    role = Role(
        name=payload.name.upper(),
        description=payload.description,
        active=payload.active,
        is_system=False
    )
    db.add(role)
    db.flush()  # Para obtener el ID
    
    # Agregar permisos
    for perm in payload.permissions:
        role_perm = RolePermission(role_id=role.id, permission=perm)
        db.add(role_perm)
    
    db.commit()
    # Recargar con permisos usando joinedload
    role = db.query(Role).options(joinedload(Role.permissions)).filter(Role.id == role.id).first()
    
    # Retornar con permisos
    perms = [rp.permission for rp in role.permissions]
    # Construir RoleOut manualmente excluyendo permissions de la validación
    role_data = {
        "id": role.id,
        "name": role.name,
        "description": role.description,
        "active": role.active,
        "is_system": role.is_system,
        "created_at": role.created_at,
        "updated_at": role.updated_at,
        "permissions": perms
    }
    return RoleOut(**role_data)

@router.patch("/{role_id}", response_model=RoleOut)
def update_role(
    role_id: int,
    payload: RoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Actualiza un rol. Solo administradores."""
    if current_user.role != "ADMINISTRADOR" and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Solo administradores pueden editar roles")
    
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Rol no encontrado")
    
    # No permitir editar roles del sistema (excepto descripción y permisos)
    if role.is_system and payload.name is not None:
        raise HTTPException(status_code=400, detail="No se puede cambiar el nombre de un rol del sistema")
    
    # Actualizar campos
    if payload.name is not None:
        # Verificar que no exista otro rol con el mismo nombre
        existing = db.query(Role).filter(Role.name == payload.name.upper(), Role.id != role_id).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Ya existe un rol con el nombre '{payload.name}'")
        role.name = payload.name.upper()
    
    if payload.description is not None:
        role.description = payload.description
    
    if payload.active is not None:
        role.active = payload.active
    
    # Actualizar permisos si se proporcionan
    if payload.permissions is not None:
        # Eliminar permisos existentes
        db.query(RolePermission).filter(RolePermission.role_id == role_id).delete()
        # Agregar nuevos permisos
        for perm in payload.permissions:
            role_perm = RolePermission(role_id=role_id, permission=perm)
            db.add(role_perm)
    
    db.commit()
    # Recargar con permisos usando joinedload
    role = db.query(Role).options(joinedload(Role.permissions)).filter(Role.id == role_id).first()
    
    # Retornar con permisos
    perms = [rp.permission for rp in role.permissions]
    # Construir RoleOut manualmente excluyendo permissions de la validación
    role_data = {
        "id": role.id,
        "name": role.name,
        "description": role.description,
        "active": role.active,
        "is_system": role.is_system,
        "created_at": role.created_at,
        "updated_at": role.updated_at,
        "permissions": perms
    }
    return RoleOut(**role_data)

@router.delete("/{role_id}", status_code=204)
def delete_role(
    role_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Elimina un rol. Solo administradores. No se pueden eliminar roles del sistema."""
    if current_user.role != "ADMINISTRADOR" and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Solo administradores pueden eliminar roles")
    
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Rol no encontrado")
    
    if role.is_system:
        raise HTTPException(status_code=400, detail="No se puede eliminar un rol del sistema")
    
    # Verificar si hay usuarios usando este rol
    users_count = db.query(User).filter(User.role_id == role_id).count()
    if users_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"No se puede eliminar el rol porque {users_count} usuario(s) lo están usando. Cambia los roles de los usuarios primero."
        )
    
    db.delete(role)
    db.commit()
    return None

@router.post("/{role_id}/permissions", response_model=RoleOut)
def add_permission_to_role(
    role_id: int,
    permission: str = Query(..., description="Código del permiso a agregar"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Agrega un permiso a un rol. Solo administradores."""
    if current_user.role != "ADMINISTRADOR" and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Solo administradores pueden modificar permisos")
    
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Rol no encontrado")
    
    # Verificar que no exista ya
    existing = db.query(RolePermission).filter(
        RolePermission.role_id == role_id,
        RolePermission.permission == permission
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="El permiso ya está asignado a este rol")
    
    role_perm = RolePermission(role_id=role_id, permission=permission)
    db.add(role_perm)
    db.commit()
    
    # Recargar con permisos usando joinedload
    role = db.query(Role).options(joinedload(Role.permissions)).filter(Role.id == role_id).first()
    perms = [rp.permission for rp in role.permissions]
    # Construir RoleOut manualmente excluyendo permissions de la validación
    role_data = {
        "id": role.id,
        "name": role.name,
        "description": role.description,
        "active": role.active,
        "is_system": role.is_system,
        "created_at": role.created_at,
        "updated_at": role.updated_at,
        "permissions": perms
    }
    return RoleOut(**role_data)

@router.delete("/{role_id}/permissions/{permission}", status_code=204)
def remove_permission_from_role(
    role_id: int,
    permission: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Elimina un permiso de un rol. Solo administradores."""
    if current_user.role != "ADMINISTRADOR" and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Solo administradores pueden modificar permisos")
    
    role_perm = db.query(RolePermission).filter(
        RolePermission.role_id == role_id,
        RolePermission.permission == permission
    ).first()
    
    if not role_perm:
        raise HTTPException(status_code=404, detail="Permiso no encontrado en este rol")
    
    db.delete(role_perm)
    db.commit()
    return None

