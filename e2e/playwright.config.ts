import { defineConfig, devices } from '@playwright/test';

/**
 * Configuración Playwright para E2E SISCONT
 * Requiere backend y frontend corriendo. Por defecto:
 * - Base URL: http://localhost:5173 (Vite dev)
 * - API: http://localhost:8000
 */
export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  timeout: 30000,
  expect: { timeout: 5000 },
});
