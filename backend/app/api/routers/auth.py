from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from ...dependencies import get_db
from ...security.auth import create_access_token, get_password_hash, verify_password, get_current_user
from ...domain.models import User
from ...domain.enums import UserRole
from ...config import settings
from ...application.services_audit import log_audit, MODULE_AUTH, ACTION_LOGIN

router = APIRouter(prefix="/auth", tags=["auth"])


def _client_ip(request: Request) -> str | None:
    return (
        request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        or request.headers.get("X-Real-IP")
        or (request.client.host if request.client else None)
    )


def _user_agent(request: Request) -> str | None:
    return request.headers.get("User-Agent")


@router.post("/login")
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """
    Endpoint de autenticación.
    
    En desarrollo, permite crear usuario admin automáticamente si no existe.
    En producción, requiere que el usuario ya exista.
    """
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user:
        # Solo permitir bootstrap admin en desarrollo
        if settings.env == "dev" and form_data.username == settings.admin_user and form_data.password == settings.admin_pass:
            user = User(
                username=settings.admin_user,
                password_hash=get_password_hash(settings.admin_pass),
                is_admin=True,
                role=UserRole.ADMINISTRADOR
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            # En producción, no dar información sobre si el usuario existe o no
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Usuario/clave inválidos"
            )
    
    if not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario/clave inválidos"
        )

    token = create_access_token({"sub": user.username})
    log_audit(
        db,
        module=MODULE_AUTH,
        action=ACTION_LOGIN,
        entity_type="User",
        entity_id=user.id,
        summary=f"Login exitoso: {user.username}",
        user_id=user.id,
        user_role=user.role,
        company_id=None,
        ip_address=_client_ip(request),
        user_agent=_user_agent(request),
    )
    return {"access_token": token, "token_type": "bearer"}

@router.get("/me")
def me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from sqlalchemy.orm import joinedload
    # Recargar con companies
    user = db.query(User).options(joinedload(User.companies)).filter(User.id == current_user.id).first()
    return {
        "id": user.id,
        "username": user.username,
        "is_admin": user.is_admin,
        "role": user.role,
        "user_type": user.user_type,
        "nombre": user.nombre,
        "apellido": user.apellido,
        "correo": user.correo,
        "foto": user.foto,
        "companies": [{"id": c.id, "name": c.name, "ruc": c.ruc, "active": c.active} for c in user.companies]
    }
