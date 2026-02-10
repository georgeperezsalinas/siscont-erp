import { test, expect } from '@playwright/test';

/**
 * Helper: login como admin
 * Uso: await loginAsAdmin(page);
 */
async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByPlaceholder(/usuario/i).fill('admin');
  await page.getByPlaceholder(/contraseña/i).fill('admin');
  await page.getByRole('button', { name: /ingresar/i }).click();
  await expect(page).not.toHaveURL(/login/);
}

test.describe('Compras E2E', () => {
  test('crear compra completa', async ({ page }) => {
    // 1. Login
    await loginAsAdmin(page);

    // 2. Ir a Compras
    await page.goto('/compras');
    await page.waitForLoadState('networkidle');

    // 3. Clic en "Nueva Compra"
    await page.getByRole('button', { name: /nueva compra/i }).click();

    // 4. Esperar que el modal esté visible
    await expect(page.getByRole('heading', { name: /nueva compra/i })).toBeVisible({ timeout: 5000 });

    // 5. Llenar número (único para el test)
    const numCompra = `E2E${Date.now().toString().slice(-6)}`;
    await page.getByPlaceholder(/000001/i).fill(numCompra);

    // 6. Seleccionar proveedor (2º select del form: doc_type=0, proveedor=1)
    const selectProv = page.locator('select').nth(1);
    const opts = await selectProv.locator('option:not([value="NEW"])').count();
    if (opts > 0) {
      await selectProv.selectOption({ index: 1 });
    }

    // 7. Llenar línea: descripción, cantidad, precio
    await page.getByPlaceholder(/producto\/servicio/i).first().fill('Producto E2E Prueba');
    // Cantidad y precio: hay inputs con inputmode="decimal"
    const decimalInputs = page.locator('input[inputmode="decimal"]');
    await decimalInputs.nth(0).fill('10');
    await decimalInputs.nth(1).fill('100');

    // 8. Registrar
    await page.getByRole('button', { name: /registrar compra/i }).click();

    // 9. Verificar éxito: modal "Compra Registrada" o mensaje de éxito
    await expect(
      page.getByText(/compra registrada|registrada exitosamente|asiento contable generado/i)
    ).toBeVisible({ timeout: 10000 });
  });
});
