@echo off
REM Script para iniciar el sistema SISCONT en modo desarrollo (Windows)
REM Uso: start-dev.bat

echo.
echo 🚀 Iniciando SISCONT_PRO en modo desarrollo...
echo.

REM Verificar Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python no esta instalado
    pause
    exit /b 1
)

REM Verificar Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js no esta instalado
    pause
    exit /b 1
)

REM Backend
echo 📦 Configurando backend...
cd backend

if not exist ".venv" (
    echo   Creando entorno virtual...
    python -m venv .venv
)

echo   Activando entorno virtual...
call .venv\Scripts\activate.bat

echo   Instalando dependencias...
pip install -q -r requirements.txt

echo   Iniciando servidor backend en puerto 8000...
start "SISCONT Backend" cmd /k "uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

cd ..

REM Frontend
echo.
echo 📦 Configurando frontend...
cd frontend

if not exist "node_modules" (
    echo   Instalando dependencias...
    npm install
)

echo   Iniciando servidor frontend en puerto 5173...
start "SISCONT Frontend" cmd /k "npm run dev"

cd ..

echo.
echo ✅ Sistema iniciado correctamente!
echo.
echo 📍 URLs:
echo    Frontend: http://localhost:5173
echo    Backend:  http://localhost:8000
echo    API Docs: http://localhost:8000/docs
echo.
echo 🔑 Credenciales:
echo    Usuario: admin
echo    Contraseña: admin
echo.
echo ⚠️  Cierra las ventanas para detener los servidores
echo.

pause

