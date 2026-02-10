#!/bin/bash

# Script para iniciar SISCONT en modo desarrollo
# Uso: ./start-dev.sh
# Ejecuta backend y frontend en DOS terminales separadas para ver los logs de cada uno.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🚀 Iniciando SISCONT_PRO en modo desarrollo..."
echo ""

# Verificar Python
PYTHON_CMD=""
if command -v python &> /dev/null; then
    PYTHON_CMD="python"
elif command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
else
    echo "❌ Python no está instalado"
    exit 1
fi

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js no está instalado"
    exit 1
fi

# Iniciar PostgreSQL si está configurado Docker
if command -v docker &> /dev/null; then
    echo "📦 Verificando PostgreSQL..."
    if docker compose ps db 2>/dev/null | grep -q "Up"; then
        echo "   PostgreSQL ya está corriendo"
    else
        echo "   Iniciando PostgreSQL..."
        docker compose up -d db 2>/dev/null || docker-compose up -d db 2>/dev/null
        sleep 2
    fi
fi

# Preparar backend
echo "📦 Configurando backend..."
cd backend
if [ ! -d ".venv" ]; then
    echo "   Creando entorno virtual..."
    $PYTHON_CMD -m venv .venv
fi
source .venv/bin/activate
pip install -q -r requirements.txt
cd ..

# Preparar frontend
echo "📦 Configurando frontend..."
cd frontend
if [ ! -d "node_modules" ]; then
    echo "   Instalando dependencias..."
    npm install
fi
cd ..

# Crear .env de ejemplo si no existe
if [ ! -f backend/.env ]; then
    echo "   Creando backend/.env desde template..."
    cp backend/.env.sample backend/.env 2>/dev/null || cp -n backend/.env.sample backend/.env 2>/dev/null
fi

echo ""
echo "✅ Configuración lista. Iniciando en dos terminales..."
echo ""

# Usar tmux si está disponible (dos panes en una ventana)
if command -v tmux &> /dev/null; then
    BACKEND_CMD="cd '$SCRIPT_DIR/backend' && source .venv/bin/activate && echo '🔧 Backend - puerto 8000' && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
    FRONTEND_CMD="cd '$SCRIPT_DIR/frontend' && echo '🌐 Frontend - puerto 5173' && npm run dev"
    tmux new-session -d -s siscont -n dev
    tmux send-keys -t siscont:dev "$BACKEND_CMD" C-m
    tmux split-window -h -t siscont:dev
    tmux send-keys -t siscont:dev "$FRONTEND_CMD" C-m
    tmux select-pane -t siscont:dev.0
    echo "   Abriendo sesión tmux 'siscont' con backend (izq) y frontend (der)"
    echo ""
    echo "   Comandos tmux:"
    echo "   - tmux attach -t siscont   (para ver/entrar a la sesión)"
    echo "   - Ctrl+b d                 (detach - salir sin cerrar)"
    echo "   - Ctrl+b x                 (cerrar y cerrar todo)"
    echo ""
    tmux attach -t siscont
else
    # Sin tmux: instrucciones para abrir dos terminales manualmente
    echo "   Ejecuta en dos terminales separadas:"
    echo ""
    echo "   📟 Terminal 1 (Backend):"
    echo "   cd $SCRIPT_DIR/backend && source .venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
    echo ""
    echo "   📟 Terminal 2 (Frontend):"
    echo "   cd $SCRIPT_DIR/frontend && npm run dev"
    echo ""
    echo "   URLs: Frontend http://localhost:5173 | Backend http://localhost:8000"
fi

