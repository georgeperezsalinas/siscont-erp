# SISCONT — Sistema Contable Modular en Python

**Moderno y profesional**: FastAPI + SQLAlchemy + JWT + Docker + plugins (IGV Perú), pruebas básicas y reportes iniciales.

## Características
- Arquitectura por capas: `domain`, `application`, `infrastructure`, `api` y `security`.
- **Plugins** para plantillas de asientos (ej: IGV Perú).
- **JWT** con roles simples.
- **Reportes** iniciales: balance de comprobación (trial balance) y mayor por cuenta.
- **Docker** (PostgreSQL + App). Usa driver `psycopg` (psycopg3) compatible con Python 3.13.
- **.env** para configuración.
- Base sencilla **multiempresa** por `company_id`.
- Listo para crecer hacia **PLE**, conciliación bancaria, y EEFF.

## Requisitos
- Python 3.10+
- (Opcional) Docker & Docker Compose

## Instalación (local)
```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.sample .env
# Edita DATABASE_URL si usarás Postgres; por defecto usa SQLite en ./data/siscont.db
uvicorn app.main:app --reload
```

Abre: http://127.0.0.1:8000/docs

## Docker
```bash
cp .env.sample .env
docker compose up -d --build
```

## Endpoints clave
- `POST /auth/login` → obtiene token JWT (admin/admin)
- `POST /accounts` → crea cuenta
- `GET /accounts` → lista
- `POST /journal/entries` → registra asiento (usa plugin IGV si mandas `tipo="compra_igv"`)
- `GET /reports/trial-balance?period=2025-10` → balance de comprobación
- `GET /reports/ledger?account_code=60.11` → mayor de una cuenta

## Estructura
```
app/
  api/routers/        # endpoints FastAPI
  application/        # casos de uso / servicios
  domain/             # entidades, eventos, enums
  infrastructure/     # repos, UoW, DB, plugins
  security/           # auth JWT
  tests/              # pruebas básicas
```

## Siguientes pasos
- Añadir PLE (SUNAT) como suscriptor de `AsientoRegistrado`.
- Validaciones avanzadas por país.
- UI web (React/Next) consumiendo la API.
- Alembic para migraciones (si cambias a Postgres).


## Extensiones Perú (MVP)
- **PCGE**: endpoint `/setup/seed-pcge` carga cuentas básicas de ejemplo.
- **Compras**: `POST /compras` → registra la compra y el asiento (IGV crédito).
- **Ventas**: `POST /ventas` → registra la venta y el asiento (IGV débito).
- **PLE simplificado**: `GET /ple/compras(.csv)` y `GET /ple/ventas(.csv)` por periodo `YYYY-MM`.
- **Centros de costo / Tipo de cambio**: modelos incluidos (endpoints a ampliar).
- **Metodología “auto”**: cada módulo es una pieza montada al chasis.
