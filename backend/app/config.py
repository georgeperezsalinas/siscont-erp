from pathlib import Path
from pydantic_settings import BaseSettings
from pydantic import Field, model_validator, field_validator
import secrets

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/

class Settings(BaseSettings):
    # ===== ENTORNO =====
    environment: str = Field(default="development", env="ENVIRONMENT")
    debug: bool = Field(default=False, env="DEBUG")

    # ===== DATABASE =====
    database_url: str = Field(default="sqlite:///./data/siscont.db", env="DATABASE_URL")

    # ===== SECURITY =====
    secret_key: str = Field(
        default_factory=lambda: secrets.token_urlsafe(32),
        env="SECRET_KEY"
    )
    access_token_expire_minutes: int = Field(default=120, env="ACCESS_TOKEN_EXPIRE_MINUTES")

    # ===== ADMIN =====
    admin_user: str = Field(default="admin", env="ADMIN_USER")
    admin_pass: str = Field(default="admin", env="ADMIN_PASS")

    @field_validator("admin_user", "admin_pass", mode="after")
    @classmethod
    def empty_to_default(cls, v: str) -> str:
        return v.strip() if v and v.strip() else "admin"

    # ===== STORAGE =====
    # SOLO se usa directamente en producción (Docker)
    uploads_dir: str | None = Field(default=None, env="UPLOADS_DIR")
    max_upload_size_mb: int = Field(default=5, env="MAX_UPLOAD_SIZE_MB")

    # ===== CORS =====
    allowed_origins: str = Field(
        default="http://localhost:5173,http://localhost:3000",
        env="ALLOWED_ORIGINS"
    )

    # ===== RATE LIMIT =====
    rate_limit_enabled: bool = Field(default=True, env="RATE_LIMIT_ENABLED")
    rate_limit_per_minute: int = Field(default=60, env="RATE_LIMIT_PER_MINUTE")

    class Config:
        env_file = ".env"
        case_sensitive = False

    @model_validator(mode="after")
    def validate_secret_key(self):
        if self.environment == "production" and len(self.secret_key) < 32:
            raise ValueError("SECRET_KEY debe tener al menos 32 caracteres en producción.")
        return self

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def uploads_path(self) -> Path:
        """
        ÚNICA fuente de verdad para uploads.
        - Local: backend/data/uploads
        - Docker/VPS: /app/data/uploads
        """
        if self.environment == "production":
            return Path(self.uploads_dir or "/app/data/uploads")

        return BASE_DIR / "data" / "uploads"


settings = Settings()
