"""
Migración de Roles: Crea roles dinámicos desde roles estáticos
===============================================================
Este script migra los roles estáticos del sistema a roles dinámicos en la base de datos.
"""
import os
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import sessionmaker
from app.config import settings

# Configuración de la base de datos
DATABASE_URL = settings.database_url
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Roles estáticos del sistema con sus permisos
ROLES_DATA = {
    "ADMINISTRADOR": {
        "description": "Acceso completo al sistema. Puede gestionar usuarios, empresas, roles y permisos.",
        "permissions": [
            "dashboard.view",
            "empresas.view", "empresas.create", "empresas.edit", "empresas.delete",
            "usuarios.view", "usuarios.create", "usuarios.edit", "usuarios.delete",
            "plan.view", "plan.create", "plan.edit", "plan.delete",
            "periodos.view", "periodos.create", "periodos.edit", "periodos.delete",
            "asientos.view", "asientos.create", "asientos.edit", "asientos.delete", "asientos.void",
            "diarios.view",
            "compras.view", "compras.create", "compras.edit", "compras.delete",
            "ventas.view", "ventas.create", "ventas.edit", "ventas.delete",
            "inventarios.view", "inventarios.create", "inventarios.edit", "inventarios.delete",
            "reportes.view", "reportes.export",
            "ple.view", "ple.export",
            "terceros.view", "terceros.create", "terceros.edit", "terceros.delete",
            "configuracion.view", "configuracion.edit",
            "casilla.view", "casilla.send",
        ]
    },
    "CONTADOR": {
        "description": "Acceso a módulos contables y operativos. Puede crear y editar asientos, compras y ventas.",
        "permissions": [
            "dashboard.view",
            "plan.view", "plan.create", "plan.edit", "plan.delete",
            "periodos.view", "periodos.create", "periodos.edit", "periodos.delete",
            "asientos.view", "asientos.create", "asientos.edit", "asientos.delete", "asientos.void",
            "diarios.view",
            "compras.view", "compras.create", "compras.edit", "compras.delete",
            "ventas.view", "ventas.create", "ventas.edit", "ventas.delete",
            "reportes.view", "reportes.export",
            "ple.view", "ple.export",
            "terceros.view", "terceros.create", "terceros.edit", "terceros.delete",
            "validacion-datos.view",
        ]
    },
    "OPERADOR": {
        "description": "Acceso a módulos operativos. Puede registrar compras, ventas e inventarios.",
        "permissions": [
            "dashboard.view",
            "asientos.view", "asientos.create", "asientos.edit",
            "diarios.view",
            "compras.view", "compras.create", "compras.edit", "compras.delete",
            "ventas.view", "ventas.create", "ventas.edit", "ventas.delete",
            "inventarios.view", "inventarios.create", "inventarios.edit", "inventarios.delete",
            "terceros.view", "terceros.create", "terceros.edit",
        ]
    },
    "AUDITOR": {
        "description": "Acceso de solo lectura. Puede ver reportes y datos contables pero no modificar.",
        "permissions": [
            "dashboard.view",
            "asientos.view",
            "diarios.view",
            "compras.view",
            "ventas.view",
            "reportes.view", "reportes.export",
            "ple.view", "ple.export",
        ]
    },
    "USUARIO_EMPRESA": {
        "description": "Casilla Electrónica. Usuario de empresa que consulta mensajes y puede enviar notificaciones a SISCONT (ej: notificación recibida en casa). No gestiona contabilidad.",
        "permissions": [
            "casilla.view",
            "casilla.send",
        ]
    }
}

def run_migration():
    print("Iniciando migración de roles dinámicos...")
    db = SessionLocal()
    inspector = inspect(engine)
    
    # Verificar si la tabla roles existe
    if not inspector.has_table("roles"):
        print("Creando tabla 'roles'...")
        from app.db import Base
        from app.domain.models import Role, RolePermission
        Base.metadata.create_all(bind=engine, tables=[Role.__table__, RolePermission.__table__])
        print("✓ Tablas 'roles' y 'role_permissions' creadas.")
    else:
        print("✓ Tablas 'roles' y 'role_permissions' ya existen.")
    
    # Verificar si existe columna role_id en users
    if inspector.has_table("users"):
        user_columns = {col['name'] for col in inspector.get_columns("users")}
        if 'role_id' not in user_columns:
            print("Agregando columna 'role_id' a tabla 'users'...")
            try:
                db.execute(text("ALTER TABLE users ADD COLUMN role_id INTEGER REFERENCES roles(id)"))
                db.commit()
                print("✓ Columna 'role_id' agregada.")
            except Exception as e:
                db.rollback()
                if "already exists" not in str(e).lower():
                    print(f"⚠️  Error agregando columna: {e}")
                else:
                    print("✓ Columna 'role_id' ya existe.")
    
    # Crear o actualizar roles estáticos
    from app.domain.models import Role, RolePermission
    
    for role_name, role_data in ROLES_DATA.items():
        # Buscar si ya existe
        existing_role = db.query(Role).filter(Role.name == role_name).first()
        
        if existing_role:
            print(f"📝 Actualizando rol '{role_name}'...")
            # Actualizar descripción si cambió
            if existing_role.description != role_data["description"]:
                existing_role.description = role_data["description"]
            existing_role.is_system = True
            existing_role.active = True
            
            # Eliminar permisos actuales y agregar nuevos
            db.query(RolePermission).filter(RolePermission.role_id == existing_role.id).delete()
            
            # Agregar nuevos permisos
            for perm in role_data["permissions"]:
                role_perm = RolePermission(role_id=existing_role.id, permission=perm)
                db.add(role_perm)
        else:
            print(f"✨ Creando rol '{role_name}'...")
            role = Role(
                name=role_name,
                description=role_data["description"],
                active=True,
                is_system=True
            )
            db.add(role)
            db.flush()  # Para obtener el ID
            
            # Agregar permisos
            for perm in role_data["permissions"]:
                role_perm = RolePermission(role_id=role.id, permission=perm)
                db.add(role_perm)
        
        db.commit()
        print(f"  ✓ Permisos: {len(role_data['permissions'])}")
    
    print("\n✅ Migración completada!")
    print("\nRoles creados/actualizados:")
    roles = db.query(Role).filter(Role.active == True).all()
    for role in roles:
        perm_count = db.query(RolePermission).filter(RolePermission.role_id == role.id).count()
        print(f"  - {role.name}: {perm_count} permisos")
    
    db.close()

if __name__ == "__main__":
    run_migration()

