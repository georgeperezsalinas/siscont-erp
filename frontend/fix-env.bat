@echo off
REM Script para corregir el archivo .env.development

echo.
echo Corrigiendo configuracion...
echo.

cd frontend

REM Borrar el archivo si existe
if exist .env.development (
    del .env.development
    echo Archivo .env.development anterior eliminado
)

echo.
echo IMPORTANTE: NO debes usar VITE_API_BASE con URL absoluta
echo.
echo El archivo .env.development NO es necesario si usas npm run dev
echo.
echo El proxy de Vite ya configura automaticamente /api
echo.

echo Para solucionar el problema:
echo.
echo 1. Elimina el archivo .env.development:
del .env.development 2>nul
echo.
echo 2. Asegurate de usar npm run dev (NO npm run build)
echo.
echo 3. Reinicia el servidor dev:
echo    npm run dev
echo.

pause

