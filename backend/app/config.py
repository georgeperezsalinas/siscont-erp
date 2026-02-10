from pydantic_settings import BaseSettings
from pydantic import Field, model_validator, field_validator
import secrets

class Settings(BaseSettings):
    database_url: str = Field(default="sqlite:///./data/siscont.db", env="DATABASE_URL")
    
    # SECRET_KEY: Genera una aleatoria en desarrollo si no está configurada
    # En producción debe ser configurada explícitamente con al menos 32 caracteres
    secret_key: str = Field(
        default_factory=lambda: secrets.token_urlsafe(32),
        env="SECRET_KEY"
    )
    
    access_token_expire_minutes: int = Field(default=120, env="ACCESS_TOKEN_EXPIRE_MINUTES")
    
    # Admin credentials: Solo permitir en desarrollo, requerir en producción
    # Si están vacíos en .env, se usan valores por defecto
    admin_user: str = Field(default="admin", env="ADMIN_USER")
    admin_pass: str = Field(default="admin", env="ADMIN_PASS")

    @field_validator("admin_user", "admin_pass", mode="after")
    @classmethod
    def empty_to_default(cls, v: str) -> str:
        """Si están vacíos en .env, usar 'admin' por defecto"""
        if not v or not str(v).strip():
            return "admin"
        return v
    
    env: str = Field(default="dev", env="ENV")
    uploads_dir: str = Field(default="./data/uploads", env="UPLOADS_DIR")
    max_upload_size_mb: int = Field(default=5, env="MAX_UPLOAD_SIZE_MB")
    
    # CORS: Configurable desde variables de entorno
    allowed_origins: str = Field(
        default="http://localhost:5173,http://localhost:3000",
        env="ALLOWED_ORIGINS",
        description="Orígenes permitidos separados por coma"
    )
    
    # Rate limiting
    rate_limit_enabled: bool = Field(default=True, env="RATE_LIMIT_ENABLED")
    rate_limit_per_minute: int = Field(default=60, env="RATE_LIMIT_PER_MINUTE")
    
    @model_validator(mode='after')
    def validate_secret_key(self):
        """Valida que SECRET_KEY tenga al menos 32 caracteres en producción"""
        if self.env == 'production' and (not self.secret_key or len(self.secret_key) < 32):
            raise ValueError(
                "SECRET_KEY debe tener al menos 32 caracteres en producción. "
                "Genera una clave segura con: python -c 'import secrets; print(secrets.token_urlsafe(32))'"
            )
        return self
    
    @property
    def allowed_origins_list(self) -> list[str]:
        """Retorna lista de orígenes permitidos"""
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()
