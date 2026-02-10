/**
 * Global setup para Playwright E2E.
 * Carga datos de prueba en la BD antes de ejecutar los tests.
 * Requiere: backend con BD configurada (puede estar o no corriendo).
 */
import { execSync } from 'child_process';
import * as path from 'path';

async function globalSetup() {
  const backendDir = path.resolve(__dirname, '..', 'backend');
  const isWin = process.platform === 'win32';
  const pythonCmd = path.join(backendDir, '.venv', isWin ? 'Scripts' : 'bin', isWin ? 'python.exe' : 'python');
  const cmd = `"${pythonCmd}" -m scripts.seed_test_data`;

  try {
    console.log('🌱 Cargando datos de prueba...');
    execSync(cmd, {
      cwd: backendDir,
      stdio: 'inherit',
      env: { ...process.env, PYTHONPATH: backendDir },
    });
  } catch (e) {
    console.warn('⚠ Seed de datos falló (puede que ya existan). Continuando con tests.');
    // No fallar: los tests de login pueden ejecutarse sin datos extra
  }
}

export default globalSetup;
