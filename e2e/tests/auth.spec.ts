import { test, expect } from '@playwright/test';

test.describe('Autenticación', () => {
  test('debe mostrar formulario de login', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/login/);
    await expect(page.getByPlaceholder(/usuario/i)).toBeVisible();
    await expect(page.getByPlaceholder(/contraseña/i)).toBeVisible();
  });

  test('login con credenciales incorrectas muestra error', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder(/usuario/i).fill('admin');
    await page.getByPlaceholder(/contraseña/i).fill('wrongpass');
    await page.getByRole('button', { name: /ingresar/i }).click();
    await expect(page.getByText(/credenciales|incorrecto|inválidos|error/i)).toBeVisible({ timeout: 5000 });
  });

  test('login con credenciales correctas redirige al dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder(/usuario/i).fill('admin');
    await page.getByPlaceholder(/contraseña/i).fill('admin');
    await page.getByRole('button', { name: /ingresar/i }).click();
    // Debe redirigir a / (Dashboard) y dejar de estar en /login
    await expect(page).not.toHaveURL(/login/);
    await expect(page).toHaveURL(/\//);
    // Verificar que vemos algo del Dashboard (ej. breadcrumb o título)
    await expect(page.getByText(/dashboard|inicio|resumen/i).first()).toBeVisible({ timeout: 5000 });
  });
});
