# 🚀 Guía de Despliegue Frontend – SISCONT ERP (Local → VPS)

Esta guía describe el **procedimiento oficial** para actualizar los cambios realizados en el **frontend local (React + Vite)** y desplegarlos correctamente en el **VPS**, sin afectar backend ni base de datos.

---

## 🧭 Flujo General

```text
Local (Frontend)
   ↓ commit / push
GitHub (main)
   ↓ git pull
VPS
   ↓ docker compose build frontend
   ↓ docker compose up -d frontend
Producción actualizada
