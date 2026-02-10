"""
Gestión de Permisos y Roles
============================

Este módulo permite gestionar roles y sus permisos de manera dinámica.
Ahora soporta roles dinámicos desde la base de datos, con fallback a roles estáticos.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Dict
from ...dependencies import get_db
from ...security.auth import get_current_user
from ...domain.models import User, Role, RolePermission
from ...domain.enums import UserRole

router = APIRouter(prefix="/permissions", tags=["permissions"])

# Definición de permisos disponibles en el sistema
AVAILABLE_PERMISSIONS = [
    "dashboard.view",
    "empresas.view",
    "empresas.create",
    "empresas.edit",
    "empresas.delete",
    "usuarios.view",
    "usuarios.create",
    "usuarios.edit",
    "usuarios.delete",
    "plan.view",
    "plan.create",
    "plan.edit",
    "plan.delete",
    "periodos.view",
    "periodos.create",
    "periodos.edit",
    "periodos.delete",
    "asientos.view",
    "asientos.create",
    "asientos.edit",
    "asientos.delete",
    "asientos.void",
    "diarios.view",
    "compras.view",
    "compras.create",
    "compras.edit",
    "compras.delete",
    "ventas.view",
    "ventas.create",
    "ventas.edit",
    "ventas.delete",
    "inventarios.view",
    "inventarios.create",
    "inventarios.edit",
    "inventarios.delete",
    "reportes.view",
    "reportes.export",
    "ple.view",
    "ple.export",
    "casilla.view",
    "casilla.send",
]

# Configuración de permisos por rol (puede ser dinámico en el futuro)
ROLE_PERMISSIONS: Dict[str, List[str]] = {
    "ADMINISTRADOR": AVAILABLE_PERMISSIONS,  # Tiene todos los permisos
    "CONTADOR": [
        "dashboard.view",
        "plan.view",
        "plan.create",
        "plan.edit",
        "plan.delete",
        "periodos.view",
        "periodos.create",
        "periodos.edit",
        "periodos.delete",
        "asientos.view",
        "asientos.create",
        "asientos.edit",
        "asientos.delete",
        "asientos.void",
        "diarios.view",
        "compras.view",
        "compras.create",
        "compras.edit",
        "compras.delete",
        "ventas.view",
        "ventas.create",
        "ventas.edit",
        "ventas.delete",
        "reportes.view",
        "reportes.export",
        "ple.view",
        "ple.export",
        "casilla.view",
    ],
    "OPERADOR": [
        "dashboard.view",
        "asientos.view",
        "asientos.create",
        "asientos.edit",
        "diarios.view",
        "compras.view",
        "compras.create",
        "compras.edit",
        "compras.delete",
        "ventas.view",
        "ventas.create",
        "ventas.edit",
        "ventas.delete",
        "inventarios.view",
        "inventarios.create",
        "inventarios.edit",
        "inventarios.delete",
        "casilla.view",
    ],
    "AUDITOR": [
        "dashboard.view",
        "asientos.view",
        "diarios.view",
        "compras.view",
        "ventas.view",
        "reportes.view",
        "reportes.export",
        "ple.view",
        "ple.export",
        "casilla.view",
    ],
    # Usuario de empresa: Casilla Electrónica (ver bandeja + enviar mensajes a SISCONT)
    "USUARIO_EMPRESA": [
        "casilla.view",
        "casilla.send",  # Enviar mensajes a SISCONT (ej: notificación recibida en casa)
    ],
}

class PermissionOut(BaseModel):
    permission: str
    description: str

class RolePermissionOut(BaseModel):
    role: str
    permissions: List[str]
    
    class Config:
        from_attributes = True

@router.get("/available", response_model=List[PermissionOut])
def list_available_permissions():
    """
    Lista todos los permisos disponibles en el sistema.
    """
    permissions_descriptions = {
        "dashboard.view": "Ver Dashboard",
        "empresas.view": "Ver Empresas",
        "empresas.create": "Crear Empresas",
        "empresas.edit": "Editar Empresas",
        "empresas.delete": "Eliminar Empresas",
        "usuarios.view": "Ver Usuarios",
        "usuarios.create": "Crear Usuarios",
        "usuarios.edit": "Editar Usuarios",
        "usuarios.delete": "Eliminar Usuarios",
        "plan.view": "Ver Plan Contable",
        "plan.create": "Crear Cuentas",
        "plan.edit": "Editar Cuentas",
        "plan.delete": "Eliminar Cuentas",
        "periodos.view": "Ver Periodos",
        "periodos.create": "Crear Periodos",
        "periodos.edit": "Editar Periodos",
        "periodos.delete": "Eliminar Periodos",
        "asientos.view": "Ver Asientos",
        "asientos.create": "Crear Asientos",
        "asientos.edit": "Editar Asientos",
        "asientos.delete": "Eliminar Asientos",
        "asientos.void": "Anular Asientos",
        "diarios.view": "Ver Libro Diario",
        "compras.view": "Ver Compras",
        "compras.create": "Crear Compras",
        "compras.edit": "Editar Compras",
        "compras.delete": "Eliminar Compras",
        "ventas.view": "Ver Ventas",
        "ventas.create": "Crear Ventas",
        "ventas.edit": "Editar Ventas",
        "ventas.delete": "Eliminar Ventas",
        "inventarios.view": "Ver Inventarios",
        "inventarios.create": "Crear Movimientos de Inventario",
        "inventarios.edit": "Editar Movimientos de Inventario",
        "inventarios.delete": "Eliminar Movimientos de Inventario",
        "reportes.view": "Ver Reportes",
        "reportes.export": "Exportar Reportes",
        "ple.view": "Ver PLE",
        "ple.export": "Exportar PLE",
    }
    
    return [
        PermissionOut(permission=perm, description=permissions_descriptions.get(perm, perm))
        for perm in AVAILABLE_PERMISSIONS
    ]

@router.get("/roles", response_model=List[RolePermissionOut])
def list_role_permissions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Lista los permisos configurados para cada rol.
    
    Combina roles dinámicos de la base de datos con roles estáticos.
    Solo los administradores pueden ver esta información.
    """
    if current_user.role != "ADMINISTRADOR" and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo los administradores pueden ver los permisos de roles"
        )
    
    result = []
    
    # Obtener roles dinámicos de la base de datos
    db_roles = db.query(Role).filter(Role.active == True).all()
    for role in db_roles:
        perms = [rp.permission for rp in role.permissions]
        result.append(RolePermissionOut(role=role.name, permissions=perms))
    
    # Agregar roles estáticos que no existen en BD (compatibilidad)
    db_role_names = {r.name for r in db_roles}
    for role_name, perms in ROLE_PERMISSIONS.items():
        if role_name not in db_role_names:
            result.append(RolePermissionOut(role=role_name, permissions=perms))
    
    return result

@router.get("/roles/{role}", response_model=RolePermissionOut)
def get_role_permissions(
    role: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Obtiene los permisos de un rol específico.
    
    Busca primero en roles dinámicos, luego en roles estáticos.
    Solo los administradores pueden ver esta información.
    """
    if current_user.role != "ADMINISTRADOR" and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo los administradores pueden ver los permisos de roles"
        )
    
    # Buscar en roles dinámicos primero
    db_role = db.query(Role).filter(Role.name == role.upper(), Role.active == True).first()
    if db_role:
        perms = [rp.permission for rp in db_role.permissions]
        return RolePermissionOut(role=db_role.name, permissions=perms)
    
    # Fallback a roles estáticos
    if role.upper() in ROLE_PERMISSIONS:
        return RolePermissionOut(role=role.upper(), permissions=ROLE_PERMISSIONS[role.upper()])
    
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Rol '{role}' no encontrado"
    )

@router.get("/my-permissions", response_model=List[str])
def get_my_permissions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Obtiene los permisos del usuario actual.
    
    Busca primero en roles dinámicos, luego en roles estáticos.
    Todos los usuarios autenticados pueden ver sus propios permisos.
    """
    # Si el usuario tiene un role_id, usar el rol dinámico
    if current_user.role_id:
        role = db.query(Role).filter(Role.id == current_user.role_id, Role.active == True).first()
        if role:
            perms = [rp.permission for rp in role.permissions]
            # Si ADMINISTRADOR tiene permisos vacíos (creado antes del seed), usar fallback
            if not perms and role.name == "ADMINISTRADOR":
                return ROLE_PERMISSIONS.get("ADMINISTRADOR", AVAILABLE_PERMISSIONS)
            return perms

    # Si no, usar el campo role (string) - compatibilidad con roles estáticos
    role_name = current_user.role.upper() if isinstance(current_user.role, str) else current_user.role.value

    # Si es admin por is_admin y no tiene role_id, dar todos los permisos
    if current_user.is_admin:
        return ROLE_PERMISSIONS.get("ADMINISTRADOR", AVAILABLE_PERMISSIONS)

    # Buscar en roles dinámicos por nombre
    db_role = db.query(Role).filter(Role.name == role_name, Role.active == True).first()
    if db_role:
        perms = [rp.permission for rp in db_role.permissions]
        if not perms and role_name == "ADMINISTRADOR":
            return ROLE_PERMISSIONS.get("ADMINISTRADOR", AVAILABLE_PERMISSIONS)
        return perms

    # Fallback a roles estáticos
    return ROLE_PERMISSIONS.get(role_name, [])

