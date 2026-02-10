import { test, expect } from '@playwright/test';

/**
 * Helper: login como admin
 */
async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByPlaceholder(/usuario/i).fill('admin');
  await page.getByPlaceholder(/contraseña/i).fill('admin');
  await page.getByRole('button', { name: /ingresar/i }).click();
  await expect(page).not.toHaveURL(/login/);
}

test.describe('Ventas E2E', () => {
  test('crear venta completa', async ({ page }) => {
    // 1. Login
    await loginAsAdmin(page);

    // 2. Ir a Ventas
    await page.goto('/ventas');
    await page.waitForLoadState('networkidle');

    // 3. Clic en "Nueva Venta"
    await page.getByRole('button', { name: /nueva venta/i }).click();

    // 4. Esperar que el modal esté visible
    await expect(page.getByRole('heading', { name: /nueva venta/i })).toBeVisible({ timeout: 5000 });

    // 5. Llenar número (único para el test)
    const numVenta = `E2E${Date.now().toString().slice(-6)}`;
    await page.getByPlaceholder(/000001/i).fill(numVenta);

    // 6. Seleccionar cliente (2º select del form: doc_type=0, cliente=1)
    const selectCliente = page.locator('select').nth(1);
    const opts = await selectCliente.locator('option:not([value="NEW"])').count();
    if (opts > 0) {
      await selectCliente.selectOption({ index: 1 });
    }

    // 7. Llenar línea: descripción, cantidad, precio
    await page.getByPlaceholder(/producto\/servicio/i).first().fill('Servicio E2E Prueba');
    const decimalInputs = page.locator('input[inputmode="decimal"]');
    await decimalInputs.nth(0).fill('5');
    await decimalInputs.nth(1).fill('200');

    // 8. Registrar
    await page.getByRole('button', { name: /registrar venta/i }).click();

    // 9. Verificar éxito: modal "Venta Registrada" o mensaje de éxito
    await expect(
      page.getByText(/venta registrada|registrada exitosamente|asiento contable generado/i)
    ).toBeVisible({ timeout: 10000 });
  });
});
