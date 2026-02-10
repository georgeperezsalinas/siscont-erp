# Guía Completa SIRE (Sistema Integrado de Registros Electrónicos)

## ¿Qué es SIRE?

**SIRE** es un sistema de SUNAT que:
- Genera propuestas automáticamente de compras y ventas basadas en información que SUNAT recibe de proveedores y clientes
- Permite validar y aceptar esas propuestas para que queden registradas en tus libros contables
- Reduce errores al sincronizar información directamente desde SUNAT

### Flujo de SIRE

```
SUNAT recibe información de proveedores/clientes → Genera propuestas (RVIE/RCE)
→ Tu sistema sincroniza y descarga → Revisas y aceptas/complementas/reemplazas
→ La información queda registrada en tu sistema contable
```

---

## 1. Obtener Credenciales OAuth

### ⚠️ Error 401 Unauthorized

Si recibes `401 Unauthorized` al sincronizar, las **credenciales OAuth no son correctas** o no están configuradas.

### Pasos para obtener credenciales

1. **Accede a SUNAT Operaciones en Línea (SOL)**
   - URL: https://www.sunat.gob.pe/ol-tss-it/usuarios/login
   - Usa tu RUC, código de usuario SOL y clave SOL

2. **Solicita credenciales para API SIRE**
   - Busca "Servicios Web" o "API" en SOL
   - Solicita credenciales habilitantes para SIRE
   - Obtendrás: **Client ID** y **Client Secret**

**⚠️ IMPORTANTE:** Las credenciales OAuth son **diferentes** a usuario/clave SOL. Son específicas para la API.

---

## 2. Configurar SIRE en el Sistema

### Campos requeridos

1. **Ir a Reportes → SIRE** (o `/sire`)
2. **Clic en "Configurar SIRE"**
3. **Completar TODOS los campos:**
   - **Credenciales del Generador:** RUC, Usuario del Generador, Password del Generador
   - **Credenciales OAuth:** Client ID, Client Secret
4. **Guardar**

### Formato según manual SUNAT

- **URL de Token:** `https://api-seguridad.sunat.gob.pe/v1/clientessol/{client_id}/oauth2/token/`
- **grant_type:** `password` (no `client_credentials`)
- **scope:** `https://api-sire.sunat.gob.pe`
- **username:** Concatenación RUC+Usuario (ej: `2060741019542806085`)
- **password:** Password del generador

### Error "RUC: N/A" o "Usuario: N/A"

La configuración no tiene estos valores. Completa todos los campos y guarda.

---

## 3. Multiempresa

**Cada empresa necesita sus propias credenciales OAuth** porque:
- Cada empresa tiene su propio RUC
- Las credenciales están asociadas al RUC
- Las propuestas RVIE/RCE son específicas de cada empresa

**Flujo:** Selecciona empresa en el header → Ve a SIRE → Configura para esa empresa → Sincroniza.

---

## 4. Sincronización y Uso

1. **Sincronizar:** Clic en "Sincronizar" en pestaña RVIE o RCE
2. **Revisar propuestas** en la tabla
3. **Aceptar, Complementar o Reemplazar** según corresponda

---

## 5. Solución de Problemas

| Error | Solución |
|-------|----------|
| 401 Unauthorized | Verificar credenciales OAuth, que el servicio esté habilitado para tu RUC |
| RUC: N/A | Completar todos los campos de configuración |
| 400 Bad Request | Verificar RUC (11 dígitos), Usuario, Password, Client ID y Secret |
| No hay propuestas | Verificar rango de fechas, que haya propuestas en SUNAT |

---

## 6. Componentes Implementados (Referencia Técnica)

- **Modelos:** SireRVIEProposal, SireRCEProposal, SireConfiguration, SireSyncLog
- **Cliente:** sire_client.py, sire_auth.py
- **Endpoints:** /sire/configuration, /sire/sync, /sire/rvie/proposals, /sire/rce/proposals

---

## Documentación de Referencia

- Manual SIRE Compras v22 (PDF en docs/)
- Portal SUNAT: https://sire.sunat.gob.pe/
- Documentación API: https://docs.apisunat.pe/
