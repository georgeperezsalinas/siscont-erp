import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List
from PIL import Image
from ...dependencies import get_db
from ...security.auth import get_current_user, get_password_hash
from ...domain.models import User, Company, Role, user_companies
from ...domain.enums import UserRole
from ...config import settings
from sqlalchemy import insert, delete

router = APIRouter(prefix="/users", tags=["users"])

class UserIn(BaseModel):
	username: str
	password: str
	role: str | None = None  # Nombre del rol (string) - compatibilidad
	role_id: int | None = None  # ID del rol dinámico
	company_ids: List[int] = []
	nombre: str | None = None
	apellido: str | None = None
	correo: str | None = None
	foto: str | None = None

class UserUpdate(BaseModel):
	username: str | None = None
	password: str | None = None
	role: str | None = None  # Nombre del rol (string) - compatibilidad
	role_id: int | None = None  # ID del rol dinámico
	company_ids: List[int] | None = None
	nombre: str | None = None
	apellido: str | None = None
	correo: str | None = None
	foto: str | None = None

class CompanyOut(BaseModel):
	id: int
	name: str
	ruc: str | None
	active: bool
	
	class Config:
		from_attributes = True

class UserOut(BaseModel):
	id: int
	username: str
	role: str
	is_admin: bool
	nombre: str | None = None
	apellido: str | None = None
	correo: str | None = None
	foto: str | None = None
	companies: List[CompanyOut] = []
	
	class Config:
		from_attributes = True

@router.get("", response_model=List[UserOut])
def list_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
	if current_user.role != "ADMINISTRADOR" and not current_user.is_admin:
		raise HTTPException(403, "Solo administradores pueden listar usuarios")
	users = db.query(User).all()
	return users

@router.post("", response_model=UserOut)
def create_user(payload: UserIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
	if current_user.role != "ADMINISTRADOR" and not current_user.is_admin:
		raise HTTPException(403, "Solo administradores pueden crear usuarios")
	if db.query(User).filter(User.username == payload.username).first():
		raise HTTPException(400, "El usuario ya existe")
	
	# Determinar rol y role_id
	role_name = None
	role_id = payload.role_id
	
	if role_id:
		# Verificar que el rol dinámico existe
		role_obj = db.query(Role).filter(Role.id == role_id, Role.active == True).first()
		if not role_obj:
			raise HTTPException(400, f"Rol dinámico con ID {role_id} no encontrado o inactivo")
		role_name = role_obj.name
	elif payload.role:
		# Usar nombre de rol (buscar en roles dinámicos primero)
		role_obj = db.query(Role).filter(Role.name == payload.role.upper(), Role.active == True).first()
		if role_obj:
			role_id = role_obj.id
			role_name = role_obj.name
		else:
			# Fallback a roles estáticos
			try:
				role_enum = UserRole(payload.role.upper())
				role_name = role_enum.value
			except ValueError:
				raise HTTPException(400, f"Rol inválido: {payload.role}")
	else:
		raise HTTPException(400, "Debe especificar 'role' o 'role_id'")
	
	# Determinar user_type basado en el rol
	user_type = "COMPANY_USER" if role_name == "USUARIO_EMPRESA" else "SISCONT_INTERNAL"
	
	# Validar: usuarios USUARIO_EMPRESA solo pueden tener una empresa asignada
	if role_name == "USUARIO_EMPRESA":
		if not payload.company_ids:
			raise HTTPException(400, "Los usuarios de empresa deben tener al menos una empresa asignada")
		if len(payload.company_ids) > 1:
			raise HTTPException(400, "Los usuarios de empresa solo pueden tener una empresa asignada")
	
	u = User(
		username=payload.username,
		password_hash=get_password_hash(payload.password),
		role=role_name,
		role_id=role_id,
		is_admin=(role_name == "ADMINISTRADOR"),
		user_type=user_type,
		nombre=payload.nombre,
		apellido=payload.apellido,
		correo=payload.correo,
		foto=payload.foto
	)
	db.add(u)
	db.flush()
	# Asignar empresas con role e is_active en user_companies
	if payload.company_ids:
		companies = db.query(Company).filter(Company.id.in_(payload.company_ids)).all()
		# Insertar directamente en user_companies para establecer role e is_active
		for company in companies:
			db.execute(
				insert(user_companies).values(
					user_id=u.id,
					company_id=company.id,
					role="EMPRESA_USUARIO",  # Por defecto, puede cambiarse después
					is_active=True
				)
			)
	db.commit()
	db.refresh(u)
	return u

@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: int, payload: UserUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
	# Permitir que un usuario se edite a sí mismo (solo campos básicos) o que administradores editen cualquier usuario
	is_self_edit = user_id == current_user.id
	is_admin = current_user.role == "ADMINISTRADOR" or current_user.is_admin
	
	if not is_self_edit and not is_admin:
		raise HTTPException(403, "Solo administradores pueden editar otros usuarios")
	
	u = db.get(User, user_id)
	if not u: raise HTTPException(404, "Usuario no encontrado")
	
	# Campos que cualquier usuario puede actualizar en su propio perfil
	if payload.nombre is not None: u.nombre = payload.nombre
	if payload.apellido is not None: u.apellido = payload.apellido
	if payload.correo is not None: u.correo = payload.correo
	
	# Campos que solo administradores pueden actualizar
	if is_admin:
		if payload.username: u.username = payload.username
		if payload.password: u.password_hash = get_password_hash(payload.password)
		if payload.foto is not None: u.foto = payload.foto
		
		# Determinar el nuevo rol si se está actualizando
		new_role_name = u.role  # Mantener el rol actual por defecto
		
		# Validar: si se cambia a USUARIO_EMPRESA y ya tiene múltiples empresas, rechazar
		if payload.role_id is not None or payload.role is not None:
			# Determinar el nuevo rol antes de validar
			if payload.role_id is not None:
				role_obj = db.query(Role).filter(Role.id == payload.role_id, Role.active == True).first()
				if role_obj:
					new_role_name = role_obj.name
			elif payload.role is not None:
				role_obj = db.query(Role).filter(Role.name == payload.role.upper(), Role.active == True).first()
				if role_obj:
					new_role_name = role_obj.name
				else:
					try:
						role_enum = UserRole(payload.role.upper())
						new_role_name = role_enum.value
					except ValueError:
						pass  # Se validará después
			
			# Si el nuevo rol es USUARIO_EMPRESA, validar empresas existentes
			if new_role_name == "USUARIO_EMPRESA":
				current_companies_count = len(u.companies) if u.companies else 0
				# Si no se están actualizando las empresas y ya tiene más de una, rechazar
				if payload.company_ids is None and current_companies_count > 1:
					raise HTTPException(400, "No se puede cambiar a rol USUARIO_EMPRESA: el usuario tiene múltiples empresas asignadas. Debe asignar solo una empresa.")
		
		# Actualizar rol si se proporciona
		if payload.role_id is not None:
			role_obj = db.query(Role).filter(Role.id == payload.role_id, Role.active == True).first()
			if not role_obj:
				raise HTTPException(400, f"Rol dinámico con ID {payload.role_id} no encontrado o inactivo")
			u.role_id = role_obj.id
			u.role = role_obj.name
			u.is_admin = (role_obj.name == "ADMINISTRADOR")
			# Actualizar user_type basado en el nuevo rol
			u.user_type = "COMPANY_USER" if role_obj.name == "USUARIO_EMPRESA" else "SISCONT_INTERNAL"
			new_role_name = role_obj.name
		elif payload.role is not None:
			# Buscar en roles dinámicos primero
			role_obj = db.query(Role).filter(Role.name == payload.role.upper(), Role.active == True).first()
			if role_obj:
				u.role_id = role_obj.id
				u.role = role_obj.name
				u.is_admin = (role_obj.name == "ADMINISTRADOR")
				# Actualizar user_type basado en el nuevo rol
				u.user_type = "COMPANY_USER" if role_obj.name == "USUARIO_EMPRESA" else "SISCONT_INTERNAL"
				new_role_name = role_obj.name
			else:
				# Fallback a roles estáticos
				try:
					role_enum = UserRole(payload.role.upper())
					u.role = role_enum.value
					u.role_id = None  # Sin rol dinámico
					u.is_admin = (role_enum == UserRole.ADMINISTRADOR)
					# Actualizar user_type basado en el nuevo rol
					u.user_type = "COMPANY_USER" if role_enum.value == "USUARIO_EMPRESA" else "SISCONT_INTERNAL"
					new_role_name = role_enum.value
				except ValueError:
					raise HTTPException(400, f"Rol inválido: {payload.role}")
		
		# Validar empresas: usuarios USUARIO_EMPRESA solo pueden tener una empresa
		if payload.company_ids is not None:
			if new_role_name == "USUARIO_EMPRESA":
				if len(payload.company_ids) == 0:
					raise HTTPException(400, "Los usuarios de empresa deben tener al menos una empresa asignada")
				if len(payload.company_ids) > 1:
					raise HTTPException(400, "Los usuarios de empresa solo pueden tener una empresa asignada")
			
			# Eliminar asignaciones existentes
			db.execute(delete(user_companies).where(user_companies.c.user_id == user_id))
			# Insertar nuevas asignaciones con role e is_active
			companies = db.query(Company).filter(Company.id.in_(payload.company_ids)).all()
			for company in companies:
				db.execute(
					insert(user_companies).values(
						user_id=user_id,
						company_id=company.id,
						role="EMPRESA_USUARIO",  # Por defecto
						is_active=True
					)
				)
	db.commit()
	db.refresh(u)
	return u

@router.patch("/{user_id}/activate", response_model=UserOut)
def activate_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
	if current_user.role != "ADMINISTRADOR" and not current_user.is_admin:
		raise HTTPException(403, "Solo administradores pueden activar usuarios")
	u = db.get(User, user_id)
	if not u: raise HTTPException(404, "Usuario no encontrado")
	# Activar = asignar a todas las empresas activas si no tiene ninguna
	if not u.companies:
		u.companies = db.query(Company).filter(Company.active == True).all()
	db.commit()
	db.refresh(u)
	return u

@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
	return current_user

@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
	if current_user.role != "ADMINISTRADOR" and not current_user.is_admin:
		raise HTTPException(403, "Solo administradores pueden eliminar usuarios")
	u = db.get(User, user_id)
	if not u: raise HTTPException(404, "Usuario no encontrado")
	if u.id == current_user.id:
		raise HTTPException(400, "No puedes eliminarte a ti mismo")
	
	# Eliminar foto del usuario si existe
	if u.foto:
		foto_path = Path(settings.uploads_dir) / "profiles" / Path(u.foto).name
		if foto_path.exists():
			foto_path.unlink()
	
	db.delete(u)
	db.commit()
	return

@router.post("/{user_id}/photo", response_model=UserOut)
async def upload_user_photo(
	user_id: int,
	file: UploadFile = File(...),
	db: Session = Depends(get_db),
	current_user: User = Depends(get_current_user)
):
	"""Sube una foto de perfil para un usuario. Solo el usuario puede subir su propia foto o un administrador."""
	if user_id != current_user.id and current_user.role != "ADMINISTRADOR" and not current_user.is_admin:
		raise HTTPException(403, "Solo puedes subir tu propia foto o ser administrador")
	
	u = db.get(User, user_id)
	if not u:
		raise HTTPException(404, "Usuario no encontrado")
	
	# Validar tipo de archivo
	allowed_types = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]
	if file.content_type not in allowed_types:
		raise HTTPException(400, f"Tipo de archivo no permitido. Permitidos: {', '.join(allowed_types)}")
	
	# Validar tamaño (max_upload_size_mb en MB)
	max_size_bytes = settings.max_upload_size_mb * 1024 * 1024
	file_content = await file.read()
	if len(file_content) > max_size_bytes:
		raise HTTPException(400, f"Archivo demasiado grande. Máximo: {settings.max_upload_size_mb}MB")
	
	# Crear directorio si no existe
	upload_dir = Path(settings.uploads_dir) / "profiles"
	upload_dir.mkdir(parents=True, exist_ok=True)
	
	# Generar nombre único para el archivo
	file_ext = Path(file.filename).suffix.lower() or ".jpg"
	filename = f"{user_id}_{uuid.uuid4().hex}{file_ext}"
	file_path = upload_dir / filename
	
	# Guardar archivo temporalmente para validar que es una imagen válida
	with open(file_path, "wb") as f:
		f.write(file_content)
	
	# Validar que es una imagen válida usando PIL
	try:
		img = Image.open(file_path)
		img.verify()  # Verificar que es una imagen válida
		img.close()
		
		# Opcional: redimensionar imagen si es muy grande (ej: máximo 800x800)
		img = Image.open(file_path)
		img.thumbnail((800, 800), Image.Resampling.LANCZOS)
		img.save(file_path, optimize=True, quality=85)
	except Exception as e:
		file_path.unlink(missing_ok=True)
		raise HTTPException(400, f"Archivo de imagen inválido: {str(e)}")
	
	# Eliminar foto anterior si existe
	if u.foto:
		old_foto_path = Path(settings.uploads_dir) / u.foto
		if old_foto_path.exists() and old_foto_path != file_path:
			old_foto_path.unlink(missing_ok=True)
	
	# Guardar ruta relativa en la base de datos (ej: "profiles/filename.jpg")
	u.foto = f"profiles/{filename}"
	db.commit()
	db.refresh(u)
	
	return u

@router.get("/{user_id}/photo")
def get_user_photo(user_id: int, db: Session = Depends(get_db)):
	"""Obtiene la foto de perfil de un usuario."""
	u = db.get(User, user_id)
	if not u or not u.foto:
		raise HTTPException(404, "Foto no encontrada")
	
	file_path = Path(settings.uploads_dir) / u.foto
	if not file_path.exists():
		raise HTTPException(404, "Archivo de foto no encontrado")
	
	return FileResponse(
		file_path,
		media_type="image/jpeg",
		filename=Path(u.foto).name
	)

@router.delete("/{user_id}/photo", response_model=UserOut)
def delete_user_photo(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
	"""Elimina la foto de perfil de un usuario."""
	if user_id != current_user.id and current_user.role != "ADMINISTRADOR" and not current_user.is_admin:
		raise HTTPException(403, "Solo puedes eliminar tu propia foto o ser administrador")
	
	u = db.get(User, user_id)
	if not u:
		raise HTTPException(404, "Usuario no encontrado")
	
	if u.foto:
		foto_path = Path(settings.uploads_dir) / u.foto
		if foto_path.exists():
			foto_path.unlink()
		u.foto = None
		db.commit()
		db.refresh(u)
	
	return u

