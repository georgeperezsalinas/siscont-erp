# Guía E2E Paso a Paso (con manzanitas 🍎)

Guía simple para entender y crear pruebas E2E en SISCONT.

---

## 1. ¿Qué es una prueba E2E?

Imagina que tienes un **robot** que:

1. Abre el navegador (Chrome, Firefox...)
2. Escribe como si fuera un usuario
3. Hace clic en botones
4. Verifica que la página muestre lo correcto

**E2E = End-to-End** = de punta a punta = prueba todo el flujo como un usuario real.

```
Usuario → Navegador → Frontend → API → Base de datos → Respuesta
         ↑_____________________________________________________|
                    El test verifica todo esto
```

---

## 2. Cómo funciona una prueba E2E (idea general)

Cada test es una **receta**:

```
PASO 1: Ir a la página de login
PASO 2: Escribir "admin" en el campo usuario
PASO 3: Escribir "admin" en el campo contraseña
PASO 4: Hacer clic en "Ingresar"
PASO 5: Verificar que estamos en el Dashboard (URL = /)
```

Si todos los pasos pasan → ✅ Test OK  
Si algo falla → ❌ Test falla (ej: el login no redirige)

---

## 3. Estructura de un test en Playwright

```typescript
import { test, expect } from '@playwright/test';

test('nombre del test', async ({ page }) => {
  // page = la pestaña del navegador que controlamos

  await page.goto('/login');           // Ir a la URL
  await page.getByPlaceholder('Usuario').fill('admin');  // Escribir en un campo
  await page.getByRole('button', { name: 'Ingresar' }).click();  // Clic en botón
  await expect(page).toHaveURL('/');   // Verificar que la URL sea /
});
```

**Conceptos:**

- `page.goto(url)` → Navegar a una URL
- `page.getByPlaceholder('texto')` → Buscar input por placeholder
- `page.getByRole('button', { name: 'Ingresar' })` → Buscar botón por nombre
- `.fill('texto')` → Escribir en un campo
- `.click()` → Hacer clic
- `expect(page).toHaveURL('/')` → Verificar la URL

---

## 4. Test: Login correcto (paso a paso)

### Lo que hace el usuario

1. Ir a http://localhost:5173/login
2. Escribir "admin" en Usuario
3. Escribir "admin" en Contraseña
4. Clic en "Ingresar"
5. Debe ir al Dashboard (página principal)

### Código equivalente

```typescript
test('login con credenciales correctas redirige al Dashboard', async ({ page }) => {
  // 1. Ir al login
  await page.goto('/login');

  // 2. Llenar credenciales
  await page.getByPlaceholder(/usuario/i).fill('admin');
  await page.getByPlaceholder(/contraseña/i).fill('admin');

  // 3. Clic en Ingresar
  await page.getByRole('button', { name: /ingresar/i }).click();

  // 4. Esperar y verificar que estamos en Dashboard (/)
  await expect(page).toHaveURL(/\/(dashboard)?\/?$/);
  // O más simple: que ya no estamos en /login
  await expect(page).not.toHaveURL(/login/);
});
```

### Cómo encontrar los elementos

| Qué buscar | Cómo encontrarlo |
|------------|------------------|
| Campo usuario | `placeholder="Ingresa tu usuario"` → `getByPlaceholder(/usuario/i)` |
| Campo contraseña | `placeholder="Ingresa tu contraseña"` → `getByPlaceholder(/contraseña/i)` |
| Botón Ingresar | Texto del botón → `getByRole('button', { name: /ingresar/i })` |

---

## 5. Test: Crear compra (paso a paso)

### Lo que hace el usuario

1. Estar logueado (ir al login y loguearse)
2. Ir a Compras
3. Clic en "Nueva Compra"
4. Llenar: Número, Fecha, Proveedor, Línea (descripción, cantidad, precio)
5. Clic en "Registrar Compra y Generar Asiento"
6. Verificar que la compra aparece en la lista

### Código (idea general)

```typescript
test('crear compra completa', async ({ page }) => {
  // 1. Login primero
  await page.goto('/login');
  await page.getByPlaceholder(/usuario/i).fill('admin');
  await page.getByPlaceholder(/contraseña/i).fill('admin');
  await page.getByRole('button', { name: /ingresar/i }).click();
  await expect(page).not.toHaveURL(/login/);

  // 2. Ir a Compras
  await page.goto('/compras');
  await page.waitForLoadState('networkidle');  // Esperar que cargue

  // 3. Clic en "Nueva Compra"
  await page.getByRole('button', { name: /nueva compra/i }).click();

  // 4. Llenar el formulario
  await page.getByPlaceholder(/número|000001/i).fill('E2E001');
  // Seleccionar primer proveedor del dropdown
  await page.getByLabel(/proveedor/i).selectOption({ index: 1 });
  // Línea: descripción, cantidad, precio
  await page.locator('input[placeholder*="Producto"]').first().fill('Producto E2E');
  await page.locator('input[inputmode="decimal"]').first().fill('10');
  await page.locator('input[inputmode="decimal"]').nth(1).fill('100');

  // 5. Clic en Registrar
  await page.getByRole('button', { name: /registrar compra/i }).click();

  // 6. Verificar que aparece en la lista (o mensaje de éxito)
  await expect(page.getByText(/E2E001|registrada|éxito/i)).toBeVisible({ timeout: 10000 });
});
```

**Nota:** Los selectores exactos pueden variar según la estructura HTML. Usa `npx playwright codegen` para generar selectores automáticamente mientras navegas.

---

## 6. Test: Crear venta (paso a paso)

Es igual que compra, pero:

- Ruta: `/ventas`
- Botón: "Nueva Venta"
- Cliente en lugar de Proveedor
- Botón: "Registrar Venta"

```typescript
test('crear venta completa', async ({ page }) => {
  // 1. Login
  await loginAsAdmin(page);

  // 2. Ir a Ventas
  await page.goto('/ventas');

  // 3. Clic "Nueva Venta"
  await page.getByRole('button', { name: /nueva venta/i }).click();

  // 4. Llenar formulario (similar a compra)
  // ...

  // 5. Registrar
  await page.getByRole('button', { name: /registrar venta/i }).click();

  // 6. Verificar éxito
  await expect(page.getByText(/registrada|éxito/i)).toBeVisible({ timeout: 10000 });
});
```

---

## 7. Cómo ejecutar los tests

```bash
# 1. Backend y frontend deben estar corriendo
./start-dev.sh

# 2. En otra terminal
cd e2e
npm install
npx playwright install    # ← IMPORTANTE: descarga Chromium, Firefox, etc.
npx playwright test
```

**Nota:** Si ves "Executable doesn't exist", ejecuta `npx playwright install` para descargar los navegadores.

---

## 8. Herramienta: codegen (generar tests automáticamente)

Para descubrir los selectores correctos:

```bash
cd e2e
npx playwright codegen http://localhost:5173
```

Se abre un navegador. Navega manualmente (login, compra, etc.) y Playwright genera el código del test automáticamente.

---

## 9. Resumen visual

```
┌─────────────────────────────────────────────────────────────┐
│  TEST E2E LOGIN                                               │
├─────────────────────────────────────────────────────────────┤
│  1. goto /login          →  Ir a la página                    │
│  2. fill usuario         →  Escribir "admin"                  │
│  3. fill contraseña      →  Escribir "admin"                  │
│  4. click Ingresar       →  Enviar formulario                 │
│  5. expect URL = /       →  Verificar que llegamos al Dashboard │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  TEST E2E COMPRA                                             │
├─────────────────────────────────────────────────────────────┤
│  1. login                 →  (reusar pasos 1-5 del login)   │
│  2. goto /compras         →  Ir a Compras                   │
│  3. click Nueva Compra    →  Abrir modal                    │
│  4. fill número, etc.     →  Llenar formulario              │
│  5. click Registrar       →  Guardar                        │
│  6. expect en lista       →  Verificar que aparece la compra │
└─────────────────────────────────────────────────────────────┘
```

---

## 10. Tests implementados en SISCONT

| Archivo | Tests | Descripción |
|---------|-------|-------------|
| `auth.spec.ts` | 3 | Formulario login, credenciales incorrectas, **login correcto → Dashboard** |
| `compra.spec.ts` | 1 | Login → Compras → Nueva Compra → Llenar → Registrar → Verificar éxito |
| `venta.spec.ts` | 1 | Login → Ventas → Nueva Venta → Llenar → Registrar → Verificar éxito |

Ejecutar todos:

```bash
cd e2e && npx playwright test
```

---

## 11. Checklist para crear un nuevo test E2E

- [ ] Definir qué hace el usuario (paso a paso)
- [ ] Traducir cada paso a código Playwright
- [ ] Usar selectores estables (getByRole, getByLabel, getByPlaceholder)
- [ ] Añadir `timeout` si hay operaciones lentas
- [ ] Ejecutar el test y ajustar selectores si falla
- [ ] Usar `npx playwright codegen` si hay dudas con los selectores
