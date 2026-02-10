import os
import logging
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from .db import init_db
from .api.routers import health, accounts, journal, reports, auth, compras, ventas, ple, setup, inventarios, companies, users, periods, permissions, bank_reconciliation, terceros, settings, roles, documents, documents_processing, sire, account_rules, journal_engine, tesoreria, notas, aplicaciones, journal_manual, journal_system_entries, accounting, mailbox, empresa, audit
from .infrastructure.logging_config import setup_logging
from .config import settings as app_settings

# Configurar logging al iniciar la aplicación
setup_logging()
logger = logging.getLogger(__name__)

os.makedirs('./data', exist_ok=True)
os.makedirs(app_settings.uploads_dir, exist_ok=True)
os.makedirs(os.path.join(app_settings.uploads_dir, 'profiles'), exist_ok=True)
# Crear directorio de documentos
documents_dir = app_settings.uploads_dir.replace('/uploads', '/documents') if '/uploads' in app_settings.uploads_dir else os.path.join('./data', 'documents')
os.makedirs(documents_dir, exist_ok=True)
mailbox_dir = os.getenv("MAILBOX_UPLOAD_DIR", "./data/mailbox")
os.makedirs(mailbox_dir, exist_ok=True)

# Inicializar BD (no fallar si conexión no está configurada - primer arranque)
try:
    init_db()
except Exception as e:
    logger.warning("No se pudo inicializar la base de datos: %s. Puede requerir configuración inicial.", e)

app = FastAPI(
    title="SISCONT - Sistema Contable",
    version="0.1.0",
    description="Sistema de gestión contable profesional para empresas peruanas",
    docs_url="/docs" if app_settings.env == "dev" else None,  # Deshabilitar docs en producción
    redoc_url="/redoc" if app_settings.env == "dev" else None,
)

# Configurar CORS dinámicamente
app.add_middleware(
    CORSMiddleware,
    allow_origins=app_settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
    expose_headers=["X-Total-Count"],
)

# Middleware para agregar headers de seguridad HTTP
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    
    # Headers de seguridad
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    
    # Solo agregar HSTS en producción con HTTPS
    if app_settings.env == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
    
    return response

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(accounts.router)
app.include_router(journal.router)
app.include_router(journal_manual.router)  # Endpoints específicos para asientos manuales tipo SAP
app.include_router(journal_system_entries.router)  # Endpoints para asientos principales del sistema
app.include_router(accounting.router)  # Endpoints para verificaciones contables base
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
app.include_router(settings.router)
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
