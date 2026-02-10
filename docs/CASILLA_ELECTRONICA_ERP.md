# Casilla Electrónica - Verificación Nivel ERP

## Resumen de Implementación

La Casilla Electrónica de SISCONT cumple con los requisitos de nivel ERP empresarial (SAP/SUNAT/PJ): **inmutable, trazable, auditable y defendible**.

---

## 1. INMUTABILIDAD (CRÍTICO)

| Requisito | Estado | Implementación |
|-----------|--------|----------------|
| Ningún mensaje enviado pueda editarse | OK | No existen endpoints PUT/PATCH para mensajes |
| Ningún mensaje pueda eliminarse | OK | No existen endpoints DELETE |
| Ningún adjunto pueda reemplazarse | OK | Adjuntos se crean con nombre único (UUID), no se sobrescriben |
| No se permita "reenviar" alterando contenido | OK | Solo se crean mensajes nuevos |
| `is_read` | OK | `MailboxMessage`, `CompanyToAdminMessage` |
| `read_at` | OK | `MailboxMessage`, `CompanyToAdminMessage` |
| `read_by_user_id` | OK | Ambos modelos |
| `is_acknowledged` | OK | `MailboxMessage`, `CompanyToAdminMessage` |
| `acknowledged_at`, `acknowledged_by_user_id` | OK | Ambos modelos |

---

## 2. TRAZABILIDAD Y AUDITORÍA (OBLIGATORIO)

Tabla `mailbox_audit_log` (inmutable):

| Evento | Descripción | Cuándo |
|--------|-------------|--------|
| `MESSAGE_SENT` | Mensaje enviado SISCONT→empresa | Al crear mensaje |
| `MESSAGE_READ` | Mensaje leído | Al marcar como leído |
| `RESPONSE_SENT` | Respuesta enviada | Al crear respuesta |
| `ATTACHMENT_DOWNLOAD` | Adjunto descargado | En cada descarga |
| `COMPANY_MESSAGE_SENT` | Mensaje empresa→SISCONT | Al enviar desde empresa |
| `COMPANY_MESSAGE_READ` | Mensaje empresa→SISCONT leído | Al marcar admin |
| `ACKNOWLEDGED` | Confirmación de recepción | Al confirmar empresa |

Campos auditados: `event_type`, `user_id`, `company_id`, `message_id`, `attachment_id`, `extra_data`, `created_at`.

---

## 3. CLASIFICACIÓN DE MENSAJES (NIVEL ERP)

Tipos: `NOTIFICACION`, `MULTA`, `REQUERIMIENTO`, `AUDITORIA`, `RECORDATORIO`, `DOCUMENTO`, `COMUNICADO`.

Prioridades: `NORMAL`, `ALTA`, `CRITICA`.

Uso: orden, alertas, dashboard (critical_count, overdue_count).

---

## 4. CONTROL DE PLAZOS Y ESTADOS

| Campo | Implementación |
|-------|----------------|
| `due_date` | Opcional en `MailboxMessage` |
| `message_status` | `ENVIADO`, `LEIDO`, `RESPONDIDO`, `VENCIDO` |
| Marcar vencido automáticamente | Al consultar stats, mensajes con `due_date < today` sin respuesta |
| Alertas visuales | Badge prioridad CRITICA, indicadores en dashboard |
| `requires_response` | Validado en UI; no se permite cerrar sin responder |

---

## 5. CONFIRMACIÓN / CONSTANCIA

- Endpoint `POST /mailbox/messages/{id}/acknowledge`
- Botón "Confirmar recepción" en detalle de mensaje (empresa)
- `is_acknowledged`, `acknowledged_at`, `acknowledged_by_user_id`

---

## 6. ARCHIVOS ADJUNTOS (FORMAL)

| Requisito | Implementación |
|-----------|----------------|
| Hash SHA256 | `file_hash` en `MailboxAttachment`, `MailboxResponseAttachment`, `CompanyToAdminAttachment` |
| Tamaño máximo | 10 MB (`MAX_FILE_SIZE_MB`) |
| Tipos permitidos | PDF, DOCX, XLSX, ZIP, DOC, XLS |
| Descarga auditada | `ATTACHMENT_DOWNLOAD` en `mailbox_audit_log` |
| Prohibir sobrescritura | Nombre único con UUID |

---

## 7. SEPARACIÓN TOTAL DE ROLES

- `can_user_access_mailbox(user, company_id, as_admin)`:
  - Admin: accede a cualquier casilla
  - Empresa: solo si `user.companies` incluye `company_id`
- Todos los endpoints validan `company_id` y aplican scoping.

---

## 8. DASHBOARD DE ALERTAS

Endpoint `GET /mailbox/stats` (empresa) y `GET /mailbox/admin/incoming/stats` (admin):

- `unread_count`
- `critical_count`
- `overdue_count`
- `pending_response_count`

---

## 9. NOTIFICACIÓN EXTERNA (OPCIONAL)

No implementado. La notificación por correo es opcional; el contenido oficial vive solo en la Casilla.

---

## 10. VALIDACIONES FINALES

| Criterio | Estado |
|----------|--------|
| Todo es inmutable | Sí |
| Todo es trazable | Sí |
| Nada se borra | Sí |
| Evidencia de lectura | `is_read`, `read_at`, `read_by_user_id` |
| Evidencia de respuesta | `responses`, `RESPONSE_SENT` audit |
| Control de plazos | `due_date`, `message_status`, `VENCIDO` |
| Auditoría completa | `mailbox_audit_log` |

---

## Migración

Ejecutar: `alembic upgrade head`

Incluye: `20250211_01_mailbox_erp_hardening.py` (read_by_user_id, is_acknowledged, file_hash, message_status, attachment_id en audit).
