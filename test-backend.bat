@echo off
REM Script para probar el backend paso a paso

echo.
echo ============================================
echo  Test de Backend
echo ============================================
echo.

echo [1] Probando health endpoint...
curl http://localhost:8000/health/ready
echo.
echo.

echo [2] Probando login endpoint...
curl -X POST http://localhost:8000/auth/login -H "Content-Type: application/x-www-form-urlencoded" -d "username=admin&password=admin"
echo.
echo.

echo ============================================
echo  Resumen
echo ============================================
echo.
echo Si ambos comandos funcionaron (no 404), el backend esta OK
echo Si alguno da 404, hay un problema con las rutas
echo.
pause

