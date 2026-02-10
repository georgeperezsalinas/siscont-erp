from pydantic_settings import BaseSettings
from pydantic import Field, model_validator, field_validator
import secrets

class Settings(BaseSettings):
    database_url: str = Field(default="sqlite:///./data/siscont.db", env="DATABASE_URL")

    secret_key: str = Field(
        default_factory=lambda: secrets.token_urlsafe(32),
        env="SECRET_KEY"
    )

    access_token_expire_minutes: int = Field(default=120, env="ACCESS_TOKEN_EXPIRE_MINUTES")

    admin_user: str = Field(default="admin", env="ADMIN_USER")
    admin_pass: str = Field(default="admin", env="ADMIN_PASS")

    @field_validator("admin_user", "admin_pass", mode="after")
    @classmethod
    def empty_to_default(cls, v: str) -> str:
        if not v or not str(v).strip():
            return "admin"
        return v

    # 🔧 CLAVES DE ENTORNO
    environment: str = Field(default="development", env="ENVIRONMENT")
    debug: bool = Field(default=False, env="DEBUG")

    uploads_dir: str = Field(default="./data/uploads", env="UPLOADS_DIR")
    max_upload_size_mb: int = Field(default=5, env="MAX_UPLOAD_SIZE_MB")

    allowed_origins: str = Field(
        default="http://localhost:5173,http://localhost:3000",
        env="ALLOWED_ORIGINS"
    )

    rate_limit_enabled: bool = Field(default=True, env="RATE_LIMIT_ENABLED")
    rate_limit_per_minute: int = Field(default=60, env="RATE_LIMIT_PER_MINUTE")

    @model_validator(mode='after')
    def validate_secret_key(self):
        if self.environment == 'production' and (not self.secret_key or len(self.secret_key) < 32):
            raise ValueError(
                "SECRET_KEY debe tener al menos 32 caracteres en producción."
            )
        return self

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()
