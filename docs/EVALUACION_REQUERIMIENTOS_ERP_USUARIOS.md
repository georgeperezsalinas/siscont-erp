# Evaluación: Requerimientos ERP Multiempresa (Usuarios y Casilla)

## Estado actual vs. Requerido

### 1. Modelo de usuarios

| Requerido | Estado actual | Notas |
|-----------|---------------|-------|
| user_type: SISCONT_INTERNAL / COMPANY_USER | ✅ | Migración 20250210_01 |
| user_companies con role por empresa | ✅ | role, is_active en user_companies |
| CompanyUser con role, is_active | ✅ | |

### 2. Roles

| Requerido | Estado actual | Mapeo |
|-----------|---------------|-------|
| SISCONT_ADMIN | ✅ ADMINISTRADOR | Equivalente |
| SISCONT_CONTADOR | ✅ CONTADOR | Equivalente |
| SISCONT_AUDITOR | ✅ AUDITOR | Equivalente |
| SISCONT_OPERADOR | ✅ OPERADOR | Equivalente |
| EMPRESA_PROPIETARIO | ✅ USUARIO_EMPRESA | Dashboard empresa |
| EMPRESA_ADMIN | ⚠️ | role en user_companies |
| EMPRESA_USUARIO | ✅ | role por empresa |
| EMPRESA_LECTOR | ❌ | No definido |

### 3. Casilla electrónica

| Requerido | Estado actual |
|-----------|---------------|
| Casilla por empresa | ✅ ElectronicMailbox |
| Admin envía a empresas | ✅ |
| Empresa responde | ✅ |
| Empresa envía a SISCONT | ✅ company_to_admin_messages |
| No borrar mensajes | ✅ (no hay endpoint delete) |
| Diseño unificado estilo correo | ✅ Implementado |

### 4. Dashboard del propietario

| Requerido | Estado actual |
|-----------|---------------|
| Ruta /empresa/dashboard | ✅ |
| Resumen financiero (solo lectura) | ✅ |
| Estado Casilla (no leídos, pendientes) | ✅ |
| Recordatorios SUNAT | ❌ |
| Accesos rápidos | ✅ |

### 5. Seguridad y rutas

| Requerido | Estado actual |
|-----------|---------------|
| /admin/* → SISCONT | ⚠️ Rutas mezcladas |
| /empresa/* → Empresas | ✅ /empresa/dashboard |
| Validar company_id desde token | ✅ can_user_access_mailbox |
| Bloqueo acceso cruzado | ✅ |

### 6. Auditoría

| Requerido | Estado actual |
|-----------|---------------|
| Alta empresa | ⚠️ Parcial (logs) |
| Alta usuario | ⚠️ Parcial |
| Lectura mensajes | ✅ mailbox_audit_log MESSAGE_READ |
| Respuesta enviada | ✅ mailbox_audit_log RESPONSE_SENT |

---

## Prioridades de implementación

1. **Dashboard empresa** (/empresa/dashboard) – Alto impacto
2. **user_type** en User – Claridad del modelo
3. **CompanyUser con role** – Sustituir user_companies
4. **Prefijo rutas** /empresa/* – Organización
5. **Auditoría** – Trazabilidad

---

## Implementado en esta sesión

- ✅ Diseño unificado Casilla (split view en todas las pestañas)
- ✅ Iconos y títulos alineados a la izquierda
- ✅ Tabs alineados a la izquierda
- ✅ Componente MailboxSplitView reutilizable
- ✅ Dashboard Empresa (`/empresa/dashboard`): resumen financiero, estado casilla, accesos rápidos
- ✅ Prefijo rutas `/empresa/*`
- ✅ Modelo `user_companies` con `role` e `is_active`
- ✅ Auditoría casilla: `mailbox_audit_log` para MESSAGE_READ y RESPONSE_SENT
- ✅ Redirección usuarios solo-casilla a `/empresa/dashboard`
