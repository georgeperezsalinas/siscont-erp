# Documentación Completa del Sistema SISCONT

## Sistema Contable Peruano - Documentación Técnica Integral

**Versión:** 1.0  
**Última actualización:** Febrero 2026  
**Sistema:** SISCONT (Sistema Contable Peruano)
**Desarrollador:** JORGE PEREZ SALINAS
**Empresa:** QSD SOFT

---

## Índice

1. [Introducción](#1-introducción)
2. [Requisitos del Sistema](#2-requisitos-del-sistema)
3. [Arquitectura](#3-arquitectura)
4. [Instalación y Configuración](#4-instalación-y-configuración)
5. [Modelo de Datos](#5-modelo-de-datos)
6. [Módulos del Sistema](#6-módulos-del-sistema)
7. [API REST](#7-api-rest)
8. [Seguridad](#8-seguridad)
9. [Cumplimiento Normativo (Perú)](#9-cumplimiento-normativo-perú)
10. [Despliegue](#10-despliegue)
11. [Mantenimiento y Soporte](#11-mantenimiento-y-soporte)

---

## 1. Introducción

### 1.1 Descripción General

**SISCONT** es un sistema de gestión contable profesional diseñado específicamente para empresas peruanas. Cumple con las normativas tributarias y contables del Perú, incluyendo:

- **PCGE 2019**: Plan Contable General Empresarial
- **PLE**: Programa de Libros Electrónicos para SUNAT
- **IGV**: Impuesto General a las Ventas (18%)
- **SIRE**: Sistema Integrado de Registros Electrónicos SUNAT

### 1.2 Características Principales

| Característica | Descripción |
|---------------|-------------|
| **Multi-empresa** | Gestión de múltiples empresas en una sola instalación |
| **Multi-usuario** | Sistema de roles y permisos granulares |
| **Motor de Asientos** | Generación automática de asientos desde eventos de negocio |
| **Integración PLE** | Exportación de libros electrónicos en formato SUNAT |
| **Conciliación Bancaria** | Proceso de conciliación con extractos bancarios |
| **Tesorería** | Cobros, pagos y transferencias |
| **Inventarios** | Control de stock con costo promedio ponderado |

### 1.3 Público Objetivo

- Contadores y profesionales de contabilidad
- Empresas PYME y corporativas peruanas
- Desarrolladores que integran el sistema
- Administradores de sistemas

---

## 2. Requisitos del Sistema

### 2.1 Servidor

| Requisito | Mínimo |
|-----------|--------|
| **CPU** | 2 cores |
| **RAM** | 4 GB |
| **Disco** | 20 GB libres |
| **SO** | Linux (recomendado), Windows, macOS |

### 2.2 Software Base

| Componente | Versión |
|------------|---------|
| **Python** | 3.10+ |
| **Node.js** | 18+ |
| **PostgreSQL** | 14+ (o SQLite para desarrollo) |
| **Docker** | 24+ (opcional) |

### 2.3 Navegadores Soportados

- Chrome 90+
- Firefox 90+
- Edge 90+
- Safari 14+

---

## 3. Arquitectura

### 3.1 Stack Tecnológico

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND                                │
│  React 18 + TypeScript + Vite + Tailwind CSS + Zustand       │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTP/REST
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                      BACKEND                                 │
│  FastAPI + SQLAlchemy 2.0 + Pydantic + Alembic              │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    BASE DE DATOS                             │
│  PostgreSQL 16 / SQLite                                      │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Estructura de Capas (Backend)

```
backend/app/
├── domain/           # Modelos de dominio y enums
│   ├── models.py     # Entidades principales
│   ├── models_ext.py # Modelos extendidos (Product, etc.)
│   ├── enums.py      # Enumeraciones
│   └── models_*.py   # Modelos por dominio
├── application/      # Lógica de negocio
│   ├── services.py   # Servicios principales
│   ├── services_pe.py        # Servicios Perú (IGV)
│   ├── services_journal_engine.py  # Motor de asientos
│   ├── services_inventario.py      # Inventarios
│   ├── services_reports.py         # Reportes
│   └── ple_completo.py             # Generación PLE
├── infrastructure/   # Implementaciones técnicas
│   ├── unit_of_work.py    # Patrón Unit of Work
│   ├── plugins/           # Plugins Perú
│   │   ├── peru_igv.py
│   │   └── peru_impuestos.py
│   └── sire_client.py     # Cliente SIRE SUNAT
├── api/              # Endpoints REST
│   └── routers/      # Routers por módulo
└── security/         # Autenticación JWT
```

### 3.3 Principios de Diseño

- **Arquitectura en Capas**: Separación dominio → aplicación → infraestructura → API
- **Unit of Work**: Gestión transaccional
- **Repository Pattern**: Abstracción de acceso a datos
- **Domain Events**: Integración entre módulos

---

## 4. Instalación y Configuración

### 4.1 Instalación Rápida (Desarrollo)

```bash
# Clonar o navegar al proyecto
cd /ruta/siscont_pro

# Ejecutar script de inicio (crea venv, instala dependencias)
./start-dev.sh

# O manualmente:
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cd ../frontend && npm install
```

### 4.2 Variables de Entorno (Backend)

Crear `backend/.env`:

```env
# Base de datos
DATABASE_URL=postgresql+psycopg://siscont:s1scont@localhost:5432/siscont
# O para SQLite: sqlite:///./data/siscont.db

# Seguridad
SECRET_KEY=tu-clave-secreta-muy-larga-y-aleatoria
ACCESS_TOKEN_EXPIRE_MINUTES=60

# Entorno
ENV=development

# CORS (orígenes permitidos, separados por coma)
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# Directorios
UPLOADS_DIR=./data/uploads
DOCUMENTS_DIR=./data/documents
```

### 4.3 Variables de Entorno (Frontend)

Crear `frontend/.env` o `frontend/.env.local`:

```env
VITE_API_URL=http://localhost:8000
```

### 4.4 Migraciones de Base de Datos

```bash
cd backend
source .venv/bin/activate
alembic upgrade head
```

### 4.5 Iniciar Servicios

**Terminal 1 - Backend:**
```bash
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 - Frontend:**
```bash
cd frontend && npm run dev
```

**URLs:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- Documentación API: http://localhost:8000/docs

---

## 5. Modelo de Datos

### 5.1 Entidades Principales

| Entidad | Descripción |
|---------|-------------|
| **Company** | Empresa (multi-empresa) |
| **User** | Usuario del sistema |
| **Role** | Rol con permisos |
| **Account** | Cuenta contable (PCGE) |
| **Period** | Período contable (año-mes) |
| **JournalEntry** | Asiento contable |
| **EntryLine** | Línea de asiento |
| **ThirdParty** | Cliente o proveedor |
| **Purchase** | Compra |
| **Sale** | Venta |
| **Product** | Producto/servicio |
| **InventoryMovement** | Movimiento de inventario |
| **BankAccount** | Cuenta bancaria |
| **BankStatement** | Extracto bancario |
| **BankReconciliation** | Conciliación bancaria |

### 5.2 Estados y Enums

**Estado de Período:** ABIERTO, CERRADO, REABIERTO

**Estado de Asiento:** POSTED, VOIDED

**Origen de Asiento:** MANUAL, COMPRAS, VENTAS, INVENTARIOS, TESORERIA

**Tipo de Cuenta:** Activo (A), Pasivo (P), Patrimonio Neto (PN), Ingreso (I), Gasto (G)

---

## 6. Módulos del Sistema

### 6.1 Administración

| Módulo | Ruta | Descripción |
|--------|------|-------------|
| Empresas | `/empresas` | Gestión de empresas |
| Usuarios | `/usuarios` | Usuarios del sistema |
| Permisos | `/permisos` | Roles y permisos |
| Configuración | `/configuracion` | Parámetros por empresa |
| Motor de Asientos | `/motor-asientos` | Eventos, reglas y mapeos |
| Mantenimiento | `/mantenimiento-datos` | Limpieza y datos de prueba |

### 6.2 Contabilidad

| Módulo | Ruta | Descripción |
|--------|------|-------------|
| Dashboard | `/` | Resumen ejecutivo |
| Plan Contable | `/plan` | Catálogo de cuentas |
| Períodos | `/periodos` | Apertura y cierre |
| Asientos | `/asientos` | Registro de asientos |
| Diarios | `/diarios` | Libro diario |
| Conciliación Bancaria | `/conciliacion-bancaria` | Conciliación |
| Validación | `/validacion-datos` | Integridad contable |

### 6.3 Operaciones

| Módulo | Ruta | Descripción |
|--------|------|-------------|
| Terceros | `/terceros` | Clientes y proveedores |
| Compras | `/compras` | Registro de compras |
| Ventas | `/ventas` | Registro de ventas |
| Tesorería | `/tesoreria` | Cobros, pagos |
| Inventarios | `/inventarios` | Stock y movimientos |
| Notas | `/notas` | Notas de crédito/débito |

### 6.4 Reportes

| Módulo | Ruta | Descripción |
|--------|------|-------------|
| Reportes | `/reportes` | Hub de reportes |
| PLE | `/ple` | Libros electrónicos |
| SIRE | `/sire` | Sincronización SUNAT |

---

## 7. API REST

### 7.1 Autenticación

```
POST /auth/login     # Login (username, password)
GET  /auth/me        # Usuario actual
```

### 7.2 Grupos de Endpoints

- **/companies** - Empresas
- **/users** - Usuarios
- **/roles** - Roles
- **/permissions** - Permisos
- **/accounts** - Plan de cuentas
- **/periods** - Períodos
- **/journal/entries** - Asientos
- **/compras** - Compras
- **/ventas** - Ventas
- **/terceros** - Terceros
- **/inventarios** - Productos y movimientos
- **/reports** - Reportes
- **/ple** - PLE
- **/bank-reconciliation** - Conciliación bancaria
- **/journal-engine** - Motor de asientos

**Documentación interactiva:** `GET /docs` (Swagger UI)

---

## 8. Seguridad

### 8.1 Autenticación

- **JWT**: Tokens con expiración configurable
- **Bcrypt**: Hash de contraseñas
- **OAuth2**: Flujo Password

### 8.2 Autorización

- Permisos granulares por rol
- 60+ permisos configurables
- Roles: ADMINISTRADOR, CONTADOR, OPERADOR, AUDITOR

### 8.3 Headers de Seguridad

- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- CORS configurado

---

## 9. Cumplimiento Normativo (Perú)

### 9.1 PCGE 2019

Estructura jerárquica de cuentas según normativa.

### 9.2 IGV

- Tasa: 18%
- Cálculo automático en compras y ventas
- Cuentas 40.11 (IGV por pagar)

### 9.3 PLE

Libros generados:
- 5.1 Libro Diario
- 5.2 Libro Mayor
- 5.3 Plan de Cuentas
- 8.1 Registro de Compras
- 14.1 Registro de Ventas
- 1.1 Caja y Bancos
- 3.1 Inventarios y Balances

### 9.4 Catálogos SUNAT

- Catálogo 06: Tipos de documento
- Catálogo 18: Países
- Validación RUC con dígito verificador

---

## 10. Despliegue

### 10.1 Docker Compose

```bash
docker compose up -d
```

Servicios:
- **db**: PostgreSQL 16 (puerto 5432)
- **backend**: FastAPI (puerto 8000)
- **frontend**: Nginx (puerto 5173)

### 10.2 Volúmenes

- `pgdata`: Datos PostgreSQL
- `siscont_data`: Uploads, documentos, logs

### 10.3 Producción

1. Configurar `DATABASE_URL` con PostgreSQL
2. Configurar `SECRET_KEY` fuerte
3. Configurar `ALLOWED_ORIGINS` con dominio real
4. Build frontend: `npm run build`
5. Revisar `nginx.conf` para SPA

---

## 11. Mantenimiento y Soporte

### 11.1 Logs

- Ubicación: `backend/logs/`
- Niveles: INFO, WARNING, ERROR

### 11.2 Health Check

```
GET /health/ready
```

### 11.3 Backup

- Base de datos: `pg_dump` o backups programados
- Volumen `siscont_data`: Documentos y uploads

### 11.4 Actualizaciones

```bash
# Backend
cd backend && pip install -r requirements.txt
alembic upgrade head

# Frontend
cd frontend && npm install && npm run build
```

---

## Referencias

- [Resumen Técnico SISCONT](./RESUMEN_TECNICO_SISCONT.md)
- [Estado de Módulos](./ESTADO_MODULOS_SISCONT.md)
- [Guía Motor de Asientos](./GUIA_MOTOR_ASIENTOS.md)
- [Arquitectura Administración SAP](./ADMINISTRACION_SAP_STYLE.md)

---

*Documento generado para SISCONT - Sistema Contable Peruano*
