from datetime import datetime, timedelta
from typing import Optional
import jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session, joinedload

from ..config import settings
from ..dependencies import get_db
from ..domain.models import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_minutes: int = settings.access_token_expire_minutes):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=expires_minutes)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm="HS256")
    return encoded_jwt

def get_current_user(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)) -> User:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    user = db.query(User).options(joinedload(User.companies)).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    return user


def get_current_user_optional(
    db: Session = Depends(get_db),
    token: Optional[str] = Depends(oauth2_scheme_optional),
) -> Optional[User]:
    """Devuelve el usuario actual o None si no hay token."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        username = payload.get("sub")
        if not username:
            return None
        return db.query(User).options(joinedload(User.companies)).filter(User.username == username).first()
    except jwt.PyJWTError:
        return None
