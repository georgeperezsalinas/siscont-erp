import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .db import init_db
from .infrastructure.logging_config import setup_logging
from .config import settings

# Routers
from .api.routers import (
    health, accounts, journal, reports, auth, compras, ventas, ple, setup,
    inventarios, companies, users, periods, permissions, bank_reconciliation,
    terceros, settings as settings_router, roles, documents,
    documents_processing, sire, account_rules, journal_engine,
    tesoreria, notas, aplicaciones, journal_manual,
    journal_system_entries, accounting, mailbox, empresa, audit
)

# ======================================================
# 📁 DIRECTORIOS OFICIALES SISCONT (ÚNICA FUENTE) ------
# ======================================================
BASE_DATA_DIR = settings.uploads_path.parent   # data/
UPLOADS_DIR = settings.uploads_path
PROFILES_DIR = UPLOADS_DIR / "profiles"
DOCUMENTS_DIR = BASE_DATA_DIR / "documents"
MAILBOX_DIR = BASE_DATA_DIR / "mailbox"
LOGS_DIR = BASE_DATA_DIR / "logs"

for d in [UPLOADS_DIR, PROFILES_DIR, DOCUMENTS_DIR, MAILBOX_DIR, LOGS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# ======================================================
# 📝 LOGGING
# ======================================================
setup_logging()
logger = logging.getLogger(__name__)

# ======================================================
# 🗄️ DB INIT (NO BLOQUEA ARRANQUE)
# ======================================================
try:
    init_db()
except Exception as e:
    logger.warning(
        "No se pudo inicializar la base de datos: %s. Puede requerir configuración inicial.",
        e
    )

# ======================================================
# 🚀 FASTAPI APP
# ======================================================
app = FastAPI(
    title="SISCONT - Sistema Contable",
    version="0.1.0",
    description="Sistema de gestión contable profesional para empresas peruanas",
    docs_url="/docs" if settings.environment == "development" else None,
    redoc_url="/redoc" if settings.environment == "development" else None,
)

# ======================================================
# 🌐 CORS
# ======================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
    expose_headers=["X-Total-Count"],
)

# ======================================================
# 🔐 SECURITY HEADERS
# ======================================================
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)

    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

    if settings.environment == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline'"
        )

    return response

# ======================================================
# 📦 ROUTERS
# ======================================================
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(accounts.router)
app.include_router(journal.router)
app.include_router(journal_manual.router)
app.include_router(journal_system_entries.router)
app.include_router(accounting.router)
app.include_router(reports.router)
app.include_router(compras.router)
app.include_router(ventas.router)
app.include_router(ple.router)
app.include_router(setup.router)
app.include_router(inventarios.router)
app.include_router(companies.router)
app.include_router(users.router)
app.include_router(periods.router)
app.include_router(permissions.router)
app.include_router(bank_reconciliation.router)
app.include_router(terceros.router)
app.include_router(settings_router.router)
app.include_router(roles.router)
app.include_router(documents.router)
app.include_router(documents_processing.router)
app.include_router(sire.router)
app.include_router(account_rules.router)
app.include_router(journal_engine.router)
app.include_router(tesoreria.router)
app.include_router(notas.router)
app.include_router(aplicaciones.router)
app.include_router(mailbox.router)
app.include_router(empresa.router)
app.include_router(audit.router)
