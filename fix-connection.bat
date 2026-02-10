@echo off
REM Script para solucionar el problema de conexión del frontend

echo.
echo ============================================
echo  Solucionando Error de Conexion
echo ============================================
echo.

echo [1] Creando archivo .env.development...
cd frontend

echo VITE_API_BASE=http://localhost:8000/api > .env.development

echo.
echo [2] Verificando contenido...
type .env.development

echo.
echo [3] Verificando que el archivo existe...
if exist .env.development (
    echo    ✅ Archivo creado correctamente
) else (
    echo    ❌ Error al crear archivo
    pause
    exit /b 1
)

echo.
echo ============================================
echo  Resumen
echo ============================================
echo.
echo ✅ Configuración completada
echo.
echo Siguiente paso:
echo    1. Asegúrate de que el backend esté corriendo (puerto 8000)
echo    2. Ejecuta: cd frontend
echo    3. Ejecuta: npm run dev
echo    4. Abre: http://localhost:5173
echo    5. Login con: admin / admin
echo.
echo Si el backend NO está corriendo, ejecuta:
echo    cd backend
echo    .venv\Scripts\activate
echo    uvicorn app.main:app --reload --port 8000
echo.
echo ============================================
echo.

pause

