# Plan de QA - Pruebas Automatizadas SISCONT

**Última actualización:** Febrero 2026

## Objetivo

Definir un conjunto de pruebas automatizadas que aseguren la funcionalidad total del sistema contable SISCONT, cubriendo backend (FastAPI), frontend (React) e integración end-to-end.

---

## 1. Pirámide de Pruebas

```
           /\
          /  \    E2E (pocos, críticos)
         /____\
        /      \  Integration (API)
       /________\
      /          \  Unit (muchos, rápidos)
     /____________\
```

| Nivel | Herramienta | Ubicación | Objetivo |
|-------|-------------|-----------|----------|
| **Unit** | pytest | `backend/qa/`, `backend/app/tests/` | Lógica de negocio, servicios, validaciones |
| **Integration** | pytest + TestClient | `backend/qa/api/` | Endpoints FastAPI, flujos con BD |
| **E2E** | Playwright | `e2e/` | Flujos completos usuario-sistema |

---

## 2. Guía de pruebas implementadas (qué hace cada archivo)

### 2.0 Resumen

| Archivo | Tipo | ¿Qué prueba? | Tests |
|---------|------|--------------|-------|
| `backend/qa/test_motor_asientos.py` | Unit | Lógica del Motor de Asientos (mocks, sin BD) | 16 |
| `backend/qa/api/test_api_auth.py` | Integración | Endpoints de autenticación (app real) | 6 |
| `backend/qa/api/test_api_health.py` | Integración | Endpoint /health/ready | 2 |
| `e2e/tests/auth.spec.ts` | E2E | Formulario login y credenciales incorrectas en navegador | 2 |

---

### 2.0.1 `test_motor_asientos.py` — Pruebas unitarias del Motor

**Ubicación:** `backend/qa/test_motor_asientos.py`

**Tipo:** Unitarias (usa mocks, no toca BD real)

**Módulo probado:** `app.application.services_journal_engine` (MotorAsientos)

| Clase | Test | Qué valida |
|-------|------|------------|
| **TestMotorAsientosCOMPRA** | test_compra_con_igv | COMPRA con IGV genera asiento cuadrado (Debe = Haber) |
| | test_compra_sin_igv | COMPRA exonerada: no hay línea IGV |
| | test_compra_con_descuento | COMPRA con descuento usa base correcta |
| **TestMotorAsientosVENTA** | test_venta_con_igv | VENTA con IGV genera asiento cuadrado |
| | test_venta_sin_igv | VENTA exonerada: no hay línea IGV |
| **TestMotorAsientosPAGO** | test_pago_con_caja | PAGO con medio CAJA genera asiento correcto |
| | test_pago_con_banco | PAGO con medio BANCO genera asiento correcto |
| **TestMotorAsientosCOBRO** | test_cobro_con_caja | COBRO con CAJA genera asiento correcto |
| | test_cobro_con_banco | COBRO con BANCO genera asiento correcto |
| **TestPropertyTests** | test_todos_los_asientos_cuadran | COMPRA, VENTA, PAGO, COBRO: todos cuadran |
| **TestMapeos** | test_falta_mapeo_critico_lanza_error | Si falta mapeo de cuenta → CuentaNoMapeadaError |
| | test_mapeo_cliente_solo_activo | Placeholder (validación naturaleza) |
| **TestValidaciones** | test_igv_credito_es_activo | Placeholder |
| | test_igv_debito_es_pasivo | Placeholder |
| | test_periodo_cerrado_lanza_error | Período cerrado → PeriodoCerradoError |
| | test_cuenta_inactiva_lanza_error | Placeholder |

---

### 2.0.2 `test_api_auth.py` — Pruebas de integración Auth

**Ubicación:** `backend/qa/api/test_api_auth.py`

**Tipo:** Integración (TestClient contra la app FastAPI real)

| Test | Qué valida |
|------|------------|
| test_health_ready | GET /health/ready retorna 200 |
| test_login_sin_credenciales | POST /auth/login sin body → 422 |
| test_login_credenciales_vacias | Usuario vacío → 401 o 422 |
| test_login_credenciales_invalidas | Credenciales incorrectas → 401 |
| test_me_sin_token | GET /auth/me sin token → 401 |
| test_me_con_token_invalido | GET /auth/me con token inválido → 401 |

---

### 2.0.3 `test_api_health.py` — Pruebas de integración Health

**Ubicación:** `backend/qa/api/test_api_health.py`

| Test | Qué valida |
|------|------------|
| test_health_ready_returns_200 | GET /health/ready → 200 |
| test_health_ready_response_body | Respuesta tiene `{"status": "ok"}` |

---

### 2.0.4 `auth.spec.ts` — Pruebas E2E (Playwright)

**Ubicación:** `e2e/tests/auth.spec.ts`

**Tipo:** End-to-end (navegador real contra frontend + backend)

| Test | Qué valida |
|------|------------|
| debe mostrar formulario de login | Página /login muestra campos usuario y contraseña |
| login con credenciales incorrectas muestra error | Al enviar admin/wrongpass aparece mensaje de error |

---

## 3. Pruebas Unitarias (Backend) — Plan futuro

### 3.1 Motor de Asientos ✅ (parcialmente implementado)

**Ubicación:** `backend/qa/test_motor_asientos.py`

| Caso | Descripción | Estado |
|------|-------------|--------|
| COMPRA con IGV | Genera asiento balanceado | ✅ |
| COMPRA sin IGV | Exonerado, no hay línea IGV | ✅ |
| COMPRA con descuento | Base después de descuento | ✅ |
| VENTA con/sin IGV | Igual que compra | ✅ |
| PAGO/COBRO CAJA/BANCO | Medio de pago correcto | ✅ |
| Propiedad: Debe == Haber | Todos los asientos | ✅ |
| CuentaNoMapeadaError | Falta mapeo crítico | ✅ |
| PeriodoCerradoError | No crear en período cerrado | ✅ |
| PLANILLA_PROVISION | Cuadre total_gasto | 🔲 |
| ENTRADA/SALIDA_INVENTARIO | Con motor | 🔲 |
| NOTA_CREDITO/NOTA_DEBITO | Compras y ventas | 🔲 |

### 3.2 Servicios de Negocio

**Nuevos archivos:** `backend/qa/test_services_*.py`

| Archivo | Casos |
|---------|-------|
| `test_services_pe.py` | registrar_compra_con_lineas, registrar_venta_con_lineas, IGV correcto |
| `test_services_inventario.py` | registrar_entrada, registrar_salida, costeo |
| `test_services_tesoreria.py` | registrar_pago, registrar_cobro, transferencia |
| `test_services_reports.py` | getLibroDiario, getBalanceComprobacion, cuadratura |
| `test_services_igv.py` | Cálculo IGV 18%, redondeo |
| `test_validations.py` | Validaciones de período, cuenta, trazabilidad |

### 3.3 Dominio y Modelos

| Archivo | Casos |
|---------|-------|
| `test_models.py` | Enums, relaciones, constraints |
| `test_utils.py` | formatCurrency, formatDate, cálculos |

---

## 4. Pruebas de Integración (API)

### 4.1 Configuración

**Ubicación:** `backend/qa/api/`

- **conftest.py**: Fixture con BD de prueba (SQLite en memoria o PostgreSQL test), cliente autenticado
- **Base de datos**: Usar `DATABASE_URL` de test o crear esquema temporal

### 4.2 Endpoints por Módulo

| Módulo | Endpoints | Casos Prioritarios |
|--------|-----------|-------------------|
| **Auth** | POST /auth/login, GET /me | Login OK, Login fallido, Token inválido |
| **Companies** | CRUD | Listar, crear, actualizar |
| **Users** | CRUD | Crear usuario, asignar empresas |
| **Accounts** | CRUD, seed | Listar, crear, seed PCGE |
| **Periods** | CRUD | Abrir, cerrar período |
| **Journal** | POST asientos | Crear asiento manual, postear, revertir |
| **Compras** | POST compras | Crear compra con líneas, IGV |
| **Ventas** | POST ventas | Crear venta con líneas |
| **Setup** | seed-pcge, ensure-basic-accounts | Cargar plan, cuentas básicas |
| **Reports** | GET libro-diario, balance-comprobacion | Datos correctos, cuadratura |
| **Motor** | Eventos, reglas, mapeos | Cargar defaults, listar |

### 4.3 Flujos de Integración

| Flujo | Pasos |
|-------|-------|
| **Compra completa** | Crear tercero → Crear compra → Verificar asiento cuadrado → Verificar saldo proveedor |
| **Venta completa** | Crear tercero → Crear venta → Verificar asiento → Verificar saldo cliente |
| **Cobro** | Crear venta → Registrar cobro → Verificar saldo cliente 0 |
| **Pago** | Crear compra → Registrar pago → Verificar saldo proveedor 0 |
| **Cierre período** | Crear asientos → Cerrar período → Intentar crear asiento (debe fallar) |
| **Reporte Libro Diario** | Crear asientos → GET libro-diario → Verificar suma Debe = Haber |

---

## 5. Pruebas E2E (Frontend)

### 5.1 Herramienta: Playwright

```bash
cd frontend && npm install -D @playwright/test
npx playwright install
```

**Ubicación:** `e2e/` (raíz del proyecto)

### 5.2 Flujos E2E Prioritarios

| Flujo | Descripción | Criterios de Éxito |
|-------|-------------|-------------------|
| **Login** | Usuario admin, credenciales correctas | Redirección a Dashboard |
| **Login fallido** | Credenciales incorrectas | Mensaje de error |
| **Cambio de empresa** | Seleccionar otra empresa en topbar | Dashboard actualizado |
| **Cambio de período** | Seleccionar otro período | Datos filtrados |
| **Crear asiento manual** | Formulario asientos, llenar, guardar | Asiento en lista, cuadra |
| **Crear compra** | Formulario compras, datos, guardar | Compra en lista, asiento generado |
| **Crear venta** | Formulario ventas | Venta en lista |
| **Reporte Libro Diario** | Ir a Reportes, Libro Diario, aplicar | Tabla con datos |
| **Plan Contable** | Cargar plan base | Cuentas visibles |
| **Validación de datos** | Ejecutar validación | Resultados sin errores críticos |

### 5.3 Estructura E2E

```
e2e/
├── playwright.config.ts
├── tests/
│   ├── auth.spec.ts
│   ├── dashboard.spec.ts
│   ├── asientos.spec.ts
│   ├── compras.spec.ts
│   ├── ventas.spec.ts
│   ├── reportes.spec.ts
│   └── plan.spec.ts
├── fixtures/
│   └── test-data.ts
└── .env.test
```

---

## 6. Cobertura Objetivo

| Área | Cobertura Mínima |
|------|------------------|
| Motor de Asientos | 90% |
| Servicios PE (compras/ventas) | 85% |
| API routers | 80% |
| Validaciones | 95% |
| **Global backend** | **75%** |

---

## 7. CI/CD y Ejecución

### 7.1 Comandos

```bash
# Cargar datos de prueba (antes de E2E o pruebas funcionales)
cd backend && make seed-test-data
# o: python -m scripts.seed_test_data

# Unit + Integration (backend)
cd backend && pytest qa/ -v --cov=app --cov-report=html --cov-fail-under=70

# Solo unit (rápido)
pytest qa/test_motor_asientos.py qa/test_services_*.py -v

# E2E (requiere backend y frontend corriendo; globalSetup ejecuta seed automáticamente)
cd e2e && npx playwright test

# E2E con servicios (Docker)
docker compose -f docker-compose.test.yml up -d
npx playwright test
```

### 7.2 GitHub Actions / GitLab CI

```yaml
# .github/workflows/qa.yml (ejemplo)
jobs:
  backend-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: siscont_test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -r backend/requirements.txt backend/qa/requirements.txt
      - run: cd backend && pytest qa/ -v --cov=app --cov-report=xml
      - uses: codecov/codecov-action@v4

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cd backend && pip install -r requirements.txt && uvicorn app.main:app &
      - run: cd frontend && npm ci && npm run build && npx serve -s dist &
      - run: cd e2e && npm ci && npx playwright install --with-deps && npx playwright test
```

---

## 8. Plan de Implementación por Fases

### Fase 1: Fundamentos (1-2 semanas) ✅
- [x] Corregir imports en `test_motor_asientos.py` (LadoAsiento, TipoMonto)
- [x] Corregir mocks (filter_by, setup_todos_eventos, db.add, patch generate_correlative)
- [ ] Añadir tests faltantes Motor (PLANILLA_PROVISION, inventario)
- [x] Crear `conftest.py` con BD de test (`backend/qa/api/conftest.py`)
- [x] Tests API: auth, health

### Fase 2: API Core (2-3 semanas)
- [ ] Tests API: compras, ventas, journal
- [ ] Tests API: reports (libro-diario, balance-comprobacion)
- [ ] Tests de flujos: compra → asiento, venta → asiento
- [ ] Tests setup: seed-pcge, ensure-basic-accounts

### Fase 3: Servicios (1-2 semanas)
- [ ] test_services_pe.py
- [ ] test_services_inventario.py
- [ ] test_services_tesoreria.py
- [ ] test_services_reports.py

### Fase 4: E2E (2-3 semanas)
- [x] Configurar Playwright (`e2e/playwright.config.ts`, `e2e/tests/auth.spec.ts`)
- [ ] Tests: login, dashboard, cambio empresa/período
- [ ] Tests: asientos, compras, ventas
- [ ] Tests: reportes, plan contable

### Fase 5: CI/CD (1 semana)
- [ ] Workflow GitHub Actions
- [ ] Reportes de cobertura
- [ ] Notificaciones en fallos

---

## 9. Criterios de Aceptación QA

- [x] Todos los tests unitarios pasan (24 tests: motor + API auth/health)
- [ ] Cobertura backend ≥ 70%
- [ ] Tests de integración para flujos críticos (compra, venta, asiento)
- [ ] Al menos 5 flujos E2E implementados
- [ ] CI ejecuta tests en cada push/PR
- [ ] No hay regresiones en asientos descuadrados (partida doble)
- [ ] Reportes generan datos coherentes con los asientos

---

## 10. Referencias

- [pytest](https://docs.pytest.org/)
- [FastAPI Testing](https://fastapi.tiangolo.com/tutorial/testing/)
- [Playwright](https://playwright.dev/)
- [PCGE Perú](https://www.sunat.gob.pe/legislacion/contabilidad/) - Plan Contable General Empresarial
