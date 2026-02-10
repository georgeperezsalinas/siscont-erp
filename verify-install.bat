@echo off
REM Script para verificar la instalación de SISCONT

echo.
echo ============================================
echo  Verificacion de Instalacion SISCONT
echo ============================================
echo.

REM Verificar Python
echo [1] Verificando Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo    ❌ Python NO instalado
    echo    ➡️  Instala desde: https://www.python.org/downloads/
    set PYTHON_OK=0
) else (
    echo    ✅ Python instalado
    python --version
    set PYTHON_OK=1
)
echo.

REM Verificar Node.js
echo [2] Verificando Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo    ❌ Node.js NO instalado
    echo    ➡️  Instala desde: https://nodejs.org/
    set NODE_OK=0
) else (
    echo    ✅ Node.js instalado
    node --version
    set NODE_OK=1
)
echo.

REM Verificar backend
echo [3] Verificando Backend...
if exist "backend\data\siscont.db" (
    echo    ✅ Base de datos existe
) else (
    echo    ⚠️  Base de datos NO existe (se creará al iniciar)
)
echo.

if %PYTHON_OK%==1 (
    echo [4] Verificando dependencias del backend...
    if exist "backend\.venv" (
        echo    ✅ Entorno virtual existe
        cd backend
        call .venv\Scripts\activate.bat
        pip show fastapi >nul 2>&1
        if errorlevel 1 (
            echo    ⚠️  Dependencias NO instaladas
            echo    ➡️  Ejecuta: pip install -r requirements.txt
        ) else (
            echo    ✅ Dependencias instaladas
        )
        cd ..
    ) else (
        echo    ⚠️  Entorno virtual NO existe
        echo    ➡️  Ejecuta: python -m venv .venv
    )
) else (
    echo [4] ⏭️  Saltando verificacion de backend (Python no instalado)
)
echo.

REM Verificar frontend
echo [5] Verificando Frontend...
if exist "frontend\node_modules" (
    echo    ✅ node_modules existe
    echo    ✅ Frontend instalado
) else (
    echo    ⚠️  Frontend NO instalado
    echo    ➡️  Ejecuta: cd frontend && npm install
)
echo.

REM Verificar si los servidores están corriendo
echo [6] Verificando servidores activos...
curl -s http://localhost:8000/health/ready >nul 2>&1
if errorlevel 1 (
    echo    ❌ Backend NO corriendo
    echo    ➡️  Inicia con: uvicorn app.main:app --reload --port 8000
) else (
    echo    ✅ Backend corriendo en puerto 8000
)

curl -s http://localhost:5173 >nul 2>&1
if errorlevel 1 (
    echo    ❌ Frontend NO corriendo
    echo    ➡️  Inicia con: npm run dev
) else (
    echo    ✅ Frontend corriendo en puerto 5173
)
echo.

echo ============================================
echo  Resumen
echo ============================================
echo.

if %PYTHON_OK%==1 if %NODE_OK%==1 (
    echo ✅ Sistema listo para iniciar
    echo.
    echo Para iniciar el sistema:
    echo   1. Abre DOS terminales
    echo   2. Terminal 1 (backend):
    echo      cd backend
    echo      .venv\Scripts\activate
    echo      uvicorn app.main:app --reload --port 8000
    echo   3. Terminal 2 (frontend):
    echo      cd frontend
    echo      npm run dev
    echo.
    echo O ejecuta: .\start-dev.bat
) else (
    echo ⚠️  Instala las dependencias faltantes antes de continuar
)
echo.

pause

