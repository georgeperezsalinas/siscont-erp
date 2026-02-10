# Datos de Prueba para Pruebas Funcionales y E2E

## Resumen

SISCONT incluye un **script de seed** que carga datos de prueba para facilitar y automatizar las pruebas funcionales y E2E.

---

## 1. Script: `seed_test_data.py`

**Ubicación:** `backend/scripts/seed_test_data.py`

### Qué crea

| Dato | Cantidad | Descripción |
|------|----------|-------------|
| Usuario admin | 1 | admin / admin |
| Empresa Demo | 1 | Empresa Demo (RUC 20123456789) |
| Plan contable | 1 | Desde plan_base.csv |
| Motor de asientos | 1 | Eventos, reglas, mapeos |
| Período | 1 | Año-mes actual, ABIERTO |
| Proveedores | 2 | Proveedor Prueba 1/2 SAC |
| Clientes | 2 | Cliente Prueba 1/2 SAC |
| Compras | 2 | Con líneas e IGV, asientos generados |
| Ventas | 2 | Con líneas e IGV, asientos generados |

### Ejecución manual

```bash
cd backend
python -m scripts.seed_test_data
```

O con Make:

```bash
cd backend
make seed-test-data
```

---

## 2. Automatización E2E (Playwright)

El `globalSetup` de Playwright ejecuta el seed **antes** de los tests E2E:

```bash
cd e2e
npx playwright test
```

Flujo:
1. `global-setup.ts` ejecuta `python -m scripts.seed_test_data`
2. Se cargan los datos de prueba
3. Se ejecutan los tests E2E (login, etc.)

**Requisito:** La BD debe estar configurada y accesible (backend puede estar o no corriendo para el seed; para los tests sí debe estar corriendo el backend y frontend).

---

## 3. Flujo completo recomendado

### Opción A: Todo manual

```bash
# 1. Iniciar BD (si usas Docker)
docker compose up -d db

# 2. Cargar datos de prueba
cd backend && make seed-test-data

# 3. Iniciar backend y frontend
./start-dev.sh   # o en dos terminales

# 4. Ejecutar tests E2E
cd e2e && npx playwright test
```

### Opción B: Automatizado (seed en globalSetup)

```bash
# 1. Iniciar backend y frontend
./start-dev.sh

# 2. En otra terminal: E2E (el seed se ejecuta automáticamente)
cd e2e && npx playwright test
```

---

## 4. API: Generar más datos

Si necesitas más datos (más compras, ventas, asientos):

```bash
# Con backend corriendo y autenticado
curl -X POST "http://localhost:8000/setup/generate-test-data?company_id=1&period=2026-02&num_compras=10&num_ventas=10&num_asientos=20" \
  -H "Authorization: Bearer <token>"
```

O desde el frontend: **Mantenimiento de Datos** → **Generar datos de prueba**.

---

## 5. Credenciales de prueba

| Campo | Valor |
|-------|-------|
| Usuario | admin |
| Contraseña | admin |
| Empresa | Empresa Demo |

---

## 6. Reseteo

Para empezar de cero:

1. **Desde Mantenimiento de Datos:** Limpiar datos por empresa.
2. **O reinstalar:** Ejecutar el wizard de primera vez (setup inicial).

Luego ejecutar de nuevo `make seed-test-data` para repoblar.
