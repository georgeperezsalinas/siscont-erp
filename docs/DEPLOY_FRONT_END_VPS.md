# 🚀 Guía de Despliegue Frontend – SISCONT ERP (Local → VPS)

Esta guía describe el **procedimiento oficial** para actualizar los cambios realizados en el **frontend local (React + Vite)** y desplegarlos correctamente en el **VPS**, sin afectar backend ni base de datos.

---

## 🧭 Flujo General

```text
Local (Frontend)
   ↓ commit / push

   git add docs/DEPLOY_FRONT_END_VPS.md
   git commit -m "docs(deploy): guía para actualizar frontend en VPS"
   git push
   git status



VPS GitHub (main)
   ↓ git pull
     git status

   
VPS
   docker compose build backend
   docker compose up -d backend
   
   Ó
   
   ↓ docker compose build frontend
   ↓ docker compose up -d frontend

   docker compose ps

Producción actualizada
