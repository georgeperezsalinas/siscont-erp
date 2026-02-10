@echo off
REM Script para configurar PostgreSQL en Windows
echo ========================================
echo Configurar PostgreSQL para SISCONT
echo ========================================
echo.

REM Verificar si existe .env
if exist .env (
    echo [ADVERTENCIA] El archivo .env ya existe.
    echo.
    choice /C SN /M "¿Deseas sobrescribirlo? (S/N)"
    if errorlevel 2 goto :end
    if errorlevel 1 goto :create
) else (
    goto :create
)

:create
echo.
echo Ingresa los datos de tu PostgreSQL:
echo.
set /p PG_USER="Usuario (default: postgres): "
if "%PG_USER%"=="" set PG_USER=postgres

set /p PG_PASS="Contraseña: "
if "%PG_PASS%"=="" (
    echo [ERROR] La contraseña es requerida
    goto :end
)

set /p PG_HOST="Host (default: localhost): "
if "%PG_HOST%"=="" set PG_HOST=localhost

set /p PG_PORT="Puerto (default: 5432): "
if "%PG_PORT%"=="" set PG_PORT=5432

set /p PG_DB="Base de datos (default: siscont): "
if "%PG_DB%"=="" set PG_DB=siscont

echo.
echo Creando archivo .env...
echo.

(
echo # Configuracion de Base de Datos PostgreSQL
echo DATABASE_URL=postgresql+psycopg://%PG_USER%:%PG_PASS%@%PG_HOST%:%PG_PORT%/%PG_DB%
echo.
echo # Configuracion de Seguridad
echo SECRET_KEY=changeme-please-generate-a-secure-key-here
echo ACCESS_TOKEN_EXPIRE_MINUTES=120
echo.
echo # Usuario Admin por defecto
echo ADMIN_USER=admin
echo ADMIN_PASS=admin
echo.
echo # Entorno
echo ENV=dev
) > .env

echo [OK] Archivo .env creado exitosamente!
echo.
echo Configuracion:
echo   Usuario: %PG_USER%
echo   Host: %PG_HOST%:%PG_PORT%
echo   Base de datos: %PG_DB%
echo.
echo Ahora ejecuta:
echo   uvicorn app.main:app --reload
echo.

:end
pause

