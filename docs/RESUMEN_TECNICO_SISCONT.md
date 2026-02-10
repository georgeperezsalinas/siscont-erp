# Resumen Técnico - SISCONT (Sistema Contable Peruano)

## 1. Visión General

SISCONT es un sistema de gestión contable profesional diseñado específicamente para empresas peruanas, cumpliendo con las normativas tributarias y contables del Perú, incluyendo la generación de archivos PLE (Programa de Libros Electrónicos) para SUNAT.

### Arquitectura
- **Backend**: FastAPI (Python) - Arquitectura en capas (Domain, Application, Infrastructure, API)
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Base de Datos**: SQLAlchemy ORM con soporte para PostgreSQL y SQLite
- **Autenticación**: JWT (JSON Web Tokens) con OAuth2
- **Migraciones**: Alembic para gestión de esquema de base de datos

---

## 2. Stack Tecnológico

### Backend
- **Framework**: FastAPI 0.115.5
- **ORM**: SQLAlchemy 2.0.36
- **Base de Datos**: PostgreSQL (psycopg 3.2.3) / SQLite
- **Autenticación**: PyJWT 2.9.0, passlib (bcrypt)
- **Validación**: Pydantic 2.9.2
- **Migraciones**: Alembic 1.13.2
- **Reportes**: ReportLab 4.2.5, openpyxl 3.1.5
- **Imágenes**: Pillow 10.4.0

### Frontend
- **Framework**: React 18.3.1
- **Lenguaje**: TypeScript 5.6.2
- **Build Tool**: Vite 5.4.8
- **UI**: Tailwind CSS 3.4.14
- **Routing**: React Router DOM 7.9.5
- **Estado**: Zustand 5.0.8
- **Tablas**: TanStack React Table 8.21.3
- **Gráficos**: Recharts 3.3.0
- **Iconos**: Lucide React 0.548.0

---

## 3. Arquitectura del Sistema

### 3.1 Estructura de Capas (Backend)

```
backend/app/
├── domain/           # Modelos de dominio y enums
│   ├── models.py     # Entidades principales
│   ├── enums.py      # Enumeraciones (AccountType, UserRole)
│   └── events.py     # Eventos de dominio
├── application/      # Lógica de negocio y servicios
│   ├── services.py   # Servicios principales
│   ├── services_pe.py        # Servicios específicos Perú (IGV, compras, ventas)
│   ├── services_cierre_periodo.py  # Lógica de cierre de períodos
│   ├── services_inventario.py      # Gestión de inventarios
│   ├── services_reportes.py        # Generación de reportes
│   ├── ple.py        # Generación PLE básico
│   ├── ple_completo.py  # Generación PLE completo (libros SUNAT)
│   └── dtos.py       # Data Transfer Objects
├── infrastructure/   # Implementaciones técnicas
│   ├── repositories.py    # Repositorios de datos
│   ├── unit_of_work.py    # Patrón Unit of Work
│   ├── plugins/           # Plugins de negocio
│   │   ├── peru_igv.py    # Cálculo IGV peruano
│   │   ├── peru_impuestos.py  # Impuestos Perú
│   │   └── peru_inventario.py # Inventario Perú
│   └── pdf_utils.py       # Utilidades PDF
├── api/              # Endpoints REST
│   └── routers/     # Routers por módulo
└── security/         # Autenticación y autorización
    └── auth.py       # JWT, hash de contraseñas
```

### 3.2 Principios de Diseño

- **Arquitectura en Capas**: Separación clara entre dominio, aplicación e infraestructura
- **Unit of Work**: Patrón para gestión de transacciones
- **Repository Pattern**: Abstracción de acceso a datos
- **Domain Events**: Eventos para integración entre módulos
- **Plugins**: Extensibilidad para reglas de negocio específicas (Perú)

---

## 4. Modelo de Datos

### 4.1 Entidades Principales

#### **Company (Empresa)**
- Información fiscal completa (RUC, razón social, nombre comercial)
- Datos SUNAT (tipo contribuyente, régimen tributario, ubigeo, estado)
- Representante legal
- Relación many-to-many con usuarios

#### **User (Usuario)**
- Autenticación (username, password_hash)
- Perfil (nombre, apellido, correo, foto)
- Roles dinámicos (relación con tabla `roles`)
- Compatibilidad con roles estáticos (ADMINISTRADOR, CONTADOR, OPERADOR, AUDITOR)
- Relación many-to-many con empresas

#### **Role (Rol Dinámico)**
- Roles configurables desde la interfaz
- Permisos granulares por rol
- Roles del sistema (no eliminables)
- Relación con permisos a través de `RolePermission`

#### **Account (Cuenta Contable)**
- Código único por empresa (PCGE 2019)
- Tipo: Activo (A), Pasivo (P), Patrimonio Neto (PN), Ingreso (I), Gasto (G)
- Niveles jerárquicos (1-4)
- Estado activo/inactivo

#### **Period (Período Contable)**
- Año y mes
- Estados: ABIERTO, CERRADO, REABIERTO
- Auditoría de cierre (quién, cuándo, motivo)
- Validaciones antes de cerrar

#### **JournalEntry (Asiento Contable)**
- Fecha, glosa (descripción), moneda, tipo de cambio
- Origen: MANUAL, COMPRAS, VENTAS, INVENTARIOS
- Estado: POSTED, VOIDED
- Relación con período y líneas de asiento

#### **EntryLine (Línea de Asiento)**
- Partida doble (debe/haber)
- Cuenta contable, tercero (opcional), centro de costo
- Memo (descripción adicional)

#### **ThirdParty (Terceros)**
- Clientes y proveedores
- Datos fiscales (RUC/DNI, tipo documento según catálogo 06 SUNAT)
- Información SUNAT (estado habido/no habido)
- Datos de contacto y dirección

#### **Purchase / Sale (Compras / Ventas)**
- Documentos (tipo, serie, número)
- Base, IGV, total
- Líneas de detalle (PurchaseLine / SaleLine)
- Integración con asientos contables

#### **BankAccount / BankStatement / BankReconciliation**
- Cuentas bancarias asociadas a cuentas contables
- Extractos bancarios cargados
- Conciliación bancaria por período

#### **SystemSettings (Configuración del Sistema)**
- Configuración por empresa
- Formato numérico y de fecha
- Moneda y símbolo
- Tasa IGV por defecto
- Configuración de períodos y validaciones

### 4.2 Relaciones Clave

- **User ↔ Company**: Many-to-Many (usuarios pueden acceder a múltiples empresas)
- **User ↔ Role**: Many-to-One (un usuario tiene un rol)
- **Role ↔ Permission**: One-to-Many (un rol tiene múltiples permisos)
- **Company ↔ Account**: One-to-Many (una empresa tiene múltiples cuentas)
- **Period ↔ JournalEntry**: One-to-Many (un período tiene múltiples asientos)
- **JournalEntry ↔ EntryLine**: One-to-Many (un asiento tiene múltiples líneas)
- **Purchase/Sale ↔ JournalEntry**: One-to-One (cada compra/venta genera un asiento)

---

## 5. Reglas de Negocio

### 5.1 Asientos Contables

#### Validaciones Obligatorias
1. **Partida Doble**: Total Debe = Total Haber (tolerancia 0.01 para redondeo)
2. **Mínimo 2 Líneas**: Todo asiento debe tener al menos 2 líneas
3. **Glosa Obligatoria**: Descripción del asiento requerida
4. **Cuenta Válida**: Todas las cuentas deben existir en el plan contable
5. **Período Abierto**: No se pueden crear/editar asientos en períodos cerrados (excepto ADMINISTRADOR)
6. **Redondeo**: Valores redondeados a 2 decimales

#### Estados
- **POSTED**: Asiento registrado y contabilizado
- **VOIDED**: Asiento anulado (no se puede editar)

#### Orígenes
- **MANUAL**: Asiento creado manualmente
- **COMPRAS**: Generado desde módulo de compras
- **VENTAS**: Generado desde módulo de ventas
- **INVENTARIOS**: Generado desde movimientos de inventario

### 5.2 Cierre de Períodos

#### Validaciones Antes de Cerrar
1. **Balance Cuadrado**: Todos los asientos deben cuadrar (debe = haber)
2. **Sin Asientos Pendientes**: No debe haber asientos en estado borrador o pendiente
3. **Integridad de Datos**: Todas las cuentas referenciadas deben existir
4. **Consistencia de Fechas**: Fechas de asientos dentro del período

#### Reglas de Cierre
- Solo **ADMINISTRADOR** o **CONTADOR** pueden cerrar períodos
- El período debe pasar todas las validaciones
- Se registra quién cerró, cuándo y el motivo
- Períodos cerrados bloquean creación/edición de asientos (excepto ADMINISTRADOR)

#### Reapertura
- Solo **ADMINISTRADOR** puede reabrir períodos
- Se registra motivo de reapertura
- Auditoría completa de cambios

### 5.3 Compras y Ventas

#### Cálculo de IGV
- Tasa IGV: 18% (configurable por empresa)
- Fórmula: `IGV = Base × 0.18`
- Total: `Base + IGV`
- Redondeo a 2 decimales en todos los cálculos

#### Plantilla de Asientos (Compras)
- **Débito**: Cuenta de gasto (60.11) = Base
- **Débito**: IGV Crédito Fiscal (40.11) = IGV
- **Crédito**: Proveedores (42.12) = Total

#### Plantilla de Asientos (Ventas)
- **Débito**: Clientes (12.10) = Total
- **Crédito**: Ventas (70.10) = Base
- **Crédito**: IGV por Pagar (40.11) = IGV

#### Múltiples Líneas
- Soporte para compras/ventas con múltiples líneas
- Cálculo automático de base, IGV y total por línea
- Consolidación en un solo asiento contable

### 5.4 Inventarios

#### Método de Costeo
- **Costo Promedio Ponderado**: Cálculo automático al registrar entradas
- Fórmula: `Costo Promedio = (Stock Anterior × Costo Anterior + Entrada × Costo Entrada) / Stock Total`

#### Movimientos
- **Entradas**: Aumentan stock y actualizan costo promedio
- **Salidas**: Disminuyen stock al costo promedio actual
- Integración automática con asientos contables

#### Cuentas Contables
- Cuenta de inventario: 20.10 (Mercaderías - PCGE)
- Cuenta de costo de ventas: 69.10 (Costo de Ventas - Mercaderías)

### 5.5 Conciliación Bancaria

#### Proceso
1. Carga de extracto bancario (fecha, saldo inicial, saldo final)
2. Registro de transacciones del extracto
3. Conciliación manual con líneas contables
4. Cálculo de saldo conciliado

#### Estados
- **PENDIENTE**: Extracto cargado, sin conciliar
- **EN_PROCESO**: Conciliación en curso
- **CONCILIADO**: Conciliación completada

### 5.6 Validación de Documentos (Perú)

#### RUC
- Validación de dígito verificador (algoritmo SUNAT)
- Formato: 11 dígitos

#### DNI
- Validación de formato
- 8 dígitos numéricos

#### Tipos de Documento (Catálogo 06 SUNAT)
- **1**: DNI
- **4**: Carnet de Extranjería
- **6**: RUC
- **7**: Pasaporte
- **0**: Documento de Identidad Extranjero

---

## 6. Perfiles y Permisos

### 6.1 Roles del Sistema

#### ADMINISTRADOR
- **Acceso Total**: Todos los permisos del sistema
- **Funciones Especiales**:
  - Crear/editar/eliminar empresas
  - Gestionar usuarios y roles
  - Cerrar/reabrir períodos
  - Editar asientos en períodos cerrados
  - Configuración del sistema

#### CONTADOR
- **Permisos Contables Completos**:
  - Gestión de plan de cuentas
  - Crear/editar/eliminar asientos
  - Anular asientos
  - Cerrar períodos
  - Ver reportes y exportar
  - Generar PLE

#### OPERADOR
- **Permisos Operativos**:
  - Ver dashboard
  - Crear/editar asientos (no eliminar)
  - Ver diarios
  - Gestionar compras y ventas
  - Gestionar inventarios
  - **No puede**: Cerrar períodos, ver reportes financieros, generar PLE

#### AUDITOR
- **Solo Lectura**:
  - Ver dashboard
  - Ver asientos y diarios
  - Ver compras y ventas
  - Ver reportes y exportar
  - Ver PLE y exportar
  - **No puede**: Crear, editar o eliminar registros

### 6.2 Sistema de Permisos Granulares

#### Permisos Disponibles (60+ permisos)
```
dashboard.view
empresas.view | create | edit | delete
usuarios.view | create | edit | delete
plan.view | create | edit | delete
periodos.view | create | edit | delete
asientos.view | create | edit | delete | void
diarios.view
compras.view | create | edit | delete
ventas.view | create | edit | delete
inventarios.view | create | edit | delete
reportes.view | export
ple.view | export
```

### 6.3 Roles Dinámicos

- **Creación desde Interfaz**: Los administradores pueden crear roles personalizados
- **Asignación de Permisos**: Selección granular de permisos por rol
- **Roles del Sistema**: No se pueden eliminar ni renombrar
- **Validación**: No se puede eliminar un rol si tiene usuarios asignados

### 6.4 Multi-Empresa

- **Usuarios Multi-Empresa**: Un usuario puede acceder a múltiples empresas
- **Selección de Contexto**: El usuario selecciona empresa y período activo
- **Aislamiento de Datos**: Todos los datos están asociados a una empresa específica
- **Permisos por Empresa**: Futuro: permisos específicos por empresa

---

## 7. Funcionalidades Principales

### 7.1 Gestión Contable

#### Plan de Cuentas
- Estructura jerárquica PCGE 2019
- Importación desde CSV
- Niveles 1-4
- Validación de códigos únicos por empresa

#### Asientos Contables
- Creación manual de asientos
- Plantillas para compras con IGV
- Validación de partida doble
- Búsqueda y filtrado avanzado
- Edición y anulación

#### Libro Diario
- Visualización de todos los asientos
- Filtros por fecha, cuenta, período
- Exportación a Excel/PDF

#### Períodos Contables
- Apertura automática de períodos
- Cierre con validaciones
- Reapertura por administradores
- Estados: ABIERTO, CERRADO, REABIERTO

### 7.2 Compras y Ventas

#### Compras
- Registro de facturas de compra
- Cálculo automático de IGV
- Múltiples líneas por compra
- Integración con asientos contables
- Relación con proveedores

#### Ventas
- Registro de facturas de venta
- Cálculo automático de IGV
- Múltiples líneas por venta
- Integración con asientos contables
- Relación con clientes

### 7.3 Inventarios

#### Productos
- Gestión de productos/servicios
- Código, descripción, unidad de medida
- Cuenta contable asociada

#### Movimientos
- Entradas de inventario
- Salidas de inventario
- Cálculo automático de costo promedio
- Integración contable automática

#### Consultas
- Stock actual por producto
- Costo promedio actual
- Historial de movimientos

### 7.4 Terceros (Clientes/Proveedores)

#### Gestión
- Registro de clientes y proveedores
- Validación de RUC/DNI
- Datos fiscales completos
- Información de contacto
- Estado SUNAT (habido/no habido)

#### Catálogos SUNAT
- Tipo de documento (Catálogo 06)
- País de residencia (Catálogo 18)
- Tipo de tercero (Nacional, Extranjero, No domiciliado)

### 7.5 Reportes

#### Balance de Comprobación
- Saldos por cuenta
- Totales de debe y haber
- Filtro por período
- Exportación a Excel/PDF

#### Libro Mayor
- Movimientos por cuenta
- Saldos iniciales y finales
- Filtro por rango de fechas

#### Reportes Adicionales (Futuro)
- Estado de Resultados
- Balance General
- Flujo de Efectivo

### 7.6 PLE (Programa de Libros Electrónicos)

#### Libros Generados
- **5.1**: Libro Diario
- **5.2**: Libro Mayor
- **6.1**: Plan de Cuentas
- **8.1**: Registro de Compras
- **8.2**: Registro de Ventas
- **14.1**: Caja y Bancos
- **14.2**: Inventarios y Balances

#### Formatos
- **TXT**: Formato plano para carga SUNAT
- **JSON**: Formato estructurado para visualización
- Validación de estructura según especificaciones SUNAT

### 7.7 Conciliación Bancaria

#### Funcionalidades
- Registro de cuentas bancarias
- Carga de extractos bancarios
- Conciliación manual con asientos
- Cálculo de diferencias
- Estados de conciliación

### 7.8 Configuración

#### Sistema
- Configuración por empresa
- Formato numérico (separadores, decimales)
- Formato de fecha
- Moneda y símbolo
- Tasa IGV por defecto
- Configuración de año fiscal

#### Validaciones
- Permitir edición de períodos cerrados
- Auto-generar asientos desde compras/ventas
- Validar fechas dentro del período

---

## 8. API REST

### 8.1 Autenticación
```
POST   /auth/login          # Login (OAuth2)
GET    /auth/me             # Usuario actual
```

### 8.2 Empresas
```
GET    /companies           # Listar empresas
POST   /companies           # Crear empresa
GET    /companies/{id}      # Obtener empresa
PATCH  /companies/{id}      # Actualizar empresa
DELETE /companies/{id}      # Eliminar empresa
```

### 8.3 Usuarios
```
GET    /users               # Listar usuarios
POST   /users               # Crear usuario
GET    /users/{id}          # Obtener usuario
PATCH  /users/{id}          # Actualizar usuario
DELETE /users/{id}         # Eliminar usuario
```

### 8.4 Roles y Permisos
```
GET    /roles               # Listar roles
POST   /roles               # Crear rol
GET    /roles/{id}          # Obtener rol
PATCH  /roles/{id}         # Actualizar rol
DELETE /roles/{id}         # Eliminar rol
GET    /permissions/available      # Permisos disponibles
GET    /permissions/roles          # Permisos por rol
GET    /permissions/my-permissions # Mis permisos
```

### 8.5 Plan de Cuentas
```
GET    /accounts            # Listar cuentas
POST   /accounts            # Crear cuenta
GET    /accounts/{id}       # Obtener cuenta
PATCH  /accounts/{id}      # Actualizar cuenta
DELETE /accounts/{id}      # Eliminar cuenta
```

### 8.6 Asientos Contables
```
GET    /journal/entries     # Listar asientos
POST   /journal/entries     # Crear asiento
GET    /journal/entries/{id} # Obtener asiento
PATCH  /journal/entries/{id} # Actualizar asiento
DELETE /journal/entries/{id} # Eliminar asiento
```

### 8.7 Períodos
```
GET    /periods             # Listar períodos
POST   /periods             # Crear período
GET    /periods/{id}        # Obtener período
PATCH  /periods/{id}        # Actualizar período
DELETE /periods/{id}        # Eliminar período
GET    /periods/{id}/close-validation  # Validar antes de cerrar
POST   /periods/{id}/close  # Cerrar período
POST   /periods/{id}/reopen # Reabrir período
```

### 8.8 Compras
```
GET    /compras             # Listar compras
POST   /compras             # Crear compra
GET    /compras/{id}        # Obtener compra
PATCH  /compras/{id}        # Actualizar compra
DELETE /compras/{id}        # Eliminar compra
```

### 8.9 Ventas
```
GET    /ventas              # Listar ventas
POST   /ventas              # Crear venta
GET    /ventas/{id}         # Obtener venta
PATCH  /ventas/{id}         # Actualizar venta
DELETE /ventas/{id}         # Eliminar venta
```

### 8.10 Inventarios
```
GET    /inventarios/products      # Listar productos
POST   /inventarios/products      # Crear producto
GET    /inventarios/products/{id} # Obtener producto
PATCH  /inventarios/products/{id} # Actualizar producto
DELETE /inventarios/products/{id} # Eliminar producto
GET    /inventarios/movements     # Listar movimientos
POST   /inventarios/movements     # Registrar movimiento
GET    /inventarios/stock/{id}    # Consultar stock
```

### 8.11 Terceros
```
GET    /terceros            # Listar terceros
POST   /terceros            # Crear tercero
GET    /terceros/{id}       # Obtener tercero
PATCH  /terceros/{id}       # Actualizar tercero
DELETE /terceros/{id}       # Eliminar tercero
```

### 8.12 Reportes
```
GET    /reports/trial-balance     # Balance de comprobación
GET    /reports/ledger             # Libro mayor
GET    /reports/trial-balance.xlsx # Exportar Excel
```

### 8.13 PLE
```
GET    /ple/libro-diario          # Libro Diario (JSON)
GET    /ple/libro-diario.txt      # Libro Diario (TXT)
GET    /ple/libro-mayor            # Libro Mayor
GET    /ple/plan-cuentas           # Plan de Cuentas
GET    /ple/registro-compras       # Registro de Compras
GET    /ple/registro-ventas        # Registro de Ventas
GET    /ple/caja-bancos            # Caja y Bancos
GET    /ple/inventarios-balances   # Inventarios y Balances
```

### 8.14 Conciliación Bancaria
```
GET    /bank-reconciliation/accounts      # Listar cuentas bancarias
POST   /bank-reconciliation/accounts      # Crear cuenta bancaria
GET    /bank-reconciliation/statements    # Listar extractos
POST   /bank-reconciliation/statements    # Cargar extracto
GET    /bank-reconciliation/reconciliations # Listar conciliaciones
POST   /bank-reconciliation/reconciliations # Crear conciliación
```

### 8.15 Configuración
```
GET    /settings             # Obtener configuración
PATCH  /settings             # Actualizar configuración
```

---

## 9. Seguridad

### 9.1 Autenticación
- **JWT Tokens**: Tokens con expiración configurable
- **Bcrypt**: Hash de contraseñas con bcrypt
- **OAuth2**: Flujo estándar OAuth2 Password

### 9.2 Autorización
- **Middleware de Autenticación**: Verificación de token en cada request
- **Verificación de Permisos**: Validación de permisos por endpoint
- **Roles Dinámicos**: Sistema flexible de roles y permisos

### 9.3 Headers de Seguridad
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security` (en producción)
- `Content-Security-Policy` (en producción)

### 9.4 CORS
- Configuración dinámica de orígenes permitidos
- Credenciales habilitadas
- Métodos HTTP permitidos: GET, POST, PUT, PATCH, DELETE, OPTIONS

---

## 10. Cumplimiento Normativo (Perú)

### 10.1 PCGE 2019
- Plan Contable General Empresarial 2019
- Estructura jerárquica de cuentas
- Códigos de cuenta según normativa

### 10.2 IGV (Impuesto General a las Ventas)
- Tasa: 18%
- Cálculo automático en compras y ventas
- Cuentas contables según PCGE:
  - 40.11: IGV por pagar / crédito fiscal

### 10.3 PLE (Programa de Libros Electrónicos)
- Generación de archivos según especificaciones SUNAT
- Formatos: TXT (carga) y JSON (visualización)
- Libros implementados:
  - Libro Diario (5.1)
  - Libro Mayor (5.2)
  - Plan de Cuentas (6.1)
  - Registro de Compras (8.1)
  - Registro de Ventas (8.2)
  - Caja y Bancos (14.1)
  - Inventarios y Balances (14.2)

### 10.4 Catálogos SUNAT
- **Catálogo 06**: Tipos de documento de identidad
- **Catálogo 18**: Países
- Validación de RUC con dígito verificador
- Estado SUNAT (habido/no habido)

### 10.5 Datos Fiscales
- RUC, razón social, nombre comercial
- Domicilio fiscal, ubigeo
- Tipo de contribuyente
- Régimen tributario
- Representante legal

---

## 11. Migraciones de Base de Datos

### Migraciones Principales (Alembic)
- `20250103_01`: Campos de cierre de período
- `20250103_02`: Líneas de compras y ventas
- `20250104_01`: Campos de perfil de usuario
- `20250115_01`: Campos PLE
- `20250116_01`: Campos SUNAT
- `20251031_01`: Campo activo en empresas
- `20251031_02`: Roles y empresas de usuarios
- `20251031_03`: Glosa en asientos contables
- `d7c47cabf810`: Tablas de conciliación bancaria

---

## 12. Frontend - Componentes y Páginas

### 12.1 Páginas Principales
- **Login**: Autenticación de usuarios
- **Dashboard**: Resumen ejecutivo con métricas
- **Empresas**: Gestión de empresas
- **Usuarios**: Gestión de usuarios
- **Permisos**: Configuración de roles y permisos
- **Plan**: Plan de cuentas
- **Periodos**: Gestión de períodos contables
- **Asientos**: Creación y edición de asientos
- **Diarios**: Visualización del libro diario
- **Compras**: Registro de compras
- **Ventas**: Registro de ventas
- **Inventarios**: Gestión de inventarios
- **Terceros**: Clientes y proveedores
- **Reportes**: Reportes contables
- **PLE**: Generación de archivos PLE
- **ConciliacionBancaria**: Conciliación bancaria
- **Configuracion**: Configuración del sistema
- **MiPerfil**: Perfil del usuario actual
- **SetupDatos**: Configuración inicial
- **ValidacionDatos**: Validación de datos contables

### 12.2 Componentes UI
- **Button**: Botones con variantes (primary, secondary, outline, ghost)
- **Card**: Tarjetas con header y contenido
- **Table**: Tablas con header, body, rows, cells
- **Input**: Campos de entrada con validación
- **Select**: Selectores desplegables
- **Tabs**: Pestañas
- **Toast**: Notificaciones
- **Loading**: Indicadores de carga
- **DataTable**: Tabla de datos avanzada
- **Charts**: Gráficos (Recharts)

### 12.3 Stores (Zustand)
- **auth**: Estado de autenticación
- **org**: Organización (empresa y período activo)
- **settings**: Configuración de la aplicación
- **theme**: Tema (futuro: dark mode)

---

## 13. Despliegue y Configuración

### 13.1 Variables de Entorno (Backend)
- `DATABASE_URL`: URL de conexión a base de datos
- `SECRET_KEY`: Clave secreta para JWT
- `ACCESS_TOKEN_EXPIRE_MINUTES`: Expiración de tokens
- `ENV`: Entorno (dev/production)
- `ALLOWED_ORIGINS`: Orígenes CORS permitidos
- `UPLOADS_DIR`: Directorio de uploads

### 13.2 Variables de Entorno (Frontend)
- `VITE_API_URL`: URL del backend API

### 13.3 Docker
- `docker-compose.yml`: Configuración para desarrollo y producción
- `Dockerfile`: Imagen del backend
- Soporte para PostgreSQL y servicios auxiliares

---

## 14. Logging y Monitoreo

### 14.1 Logging
- Sistema de logging configurado
- Archivos de log por fecha
- Niveles: INFO, WARNING, ERROR
- Ubicación: `backend/logs/`

### 14.2 Health Checks
- Endpoint `/health/ready`: Verificación de disponibilidad
- Validación de conexión a base de datos

---

## 15. Próximas Mejoras Sugeridas

### Funcionalidades
- Estado de Resultados
- Balance General
- Flujo de Efectivo
- Integración con facturación electrónica
- Dashboard con gráficos avanzados
- Exportación de reportes a PDF mejorada

### Técnicas
- Dark mode
- Internacionalización (i18n)
- Mejoras de accesibilidad (ARIA)
- Notificaciones en tiempo real
- Caché de consultas frecuentes
- Optimización de consultas SQL

---

## 16. Conclusión

SISCONT es un sistema contable completo y robusto diseñado específicamente para el mercado peruano, con:

- ✅ Arquitectura moderna y escalable
- ✅ Cumplimiento normativo peruano (PCGE, PLE, SUNAT)
- ✅ Sistema de permisos granular y flexible
- ✅ Multi-empresa y multi-usuario
- ✅ Validaciones de negocio robustas
- ✅ Interfaz moderna y responsive
- ✅ API REST completa y documentada
- ✅ Seguridad implementada (JWT, bcrypt, headers)

El sistema está preparado para producción y puede extenderse fácilmente con nuevas funcionalidades gracias a su arquitectura modular y uso de plugins para reglas de negocio específicas.

---

**Versión del Documento**: 1.0  
**Fecha**: Febrero 2026  
**Autor**: Resumen técnico generado automáticamente

