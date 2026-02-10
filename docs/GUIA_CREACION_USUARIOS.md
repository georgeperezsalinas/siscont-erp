# Guía de Creación de Usuarios

## Cambios Implementados

Con las migraciones `20250210_01` y `20250210_02`, el sistema ahora soporta:

1. **`user_type`** en la tabla `users`: `SISCONT_INTERNAL` o `COMPANY_USER`
2. **`role` e `is_active`** en la tabla `user_companies`: rol específico por empresa y estado activo/inactivo

## Cómo Crear Usuarios

### 1. Usuarios Internos de SISCONT (SISCONT_INTERNAL)

**Roles disponibles:**
- `ADMINISTRADOR` - Acceso completo al sistema
- `CONTADOR` - Acceso a módulos contables
- `AUDITOR` - Acceso de solo lectura y auditoría
- `OPERADOR` - Acceso básico

**Ejemplo de creación:**

```json
POST /api/users
{
  "username": "contador1",
  "password": "password123",
  "role": "CONTADOR",
  "nombre": "Juan",
  "apellido": "Pérez",
  "correo": "juan.perez@siscont.com",
  "company_ids": []  // Sin empresas asignadas
}
```

**Resultado:**
- `user_type` = `SISCONT_INTERNAL`
- `role` = `CONTADOR`
- Sin asignaciones en `user_companies`

### 2. Usuarios de Empresa (COMPANY_USER)

**Rol principal:** `USUARIO_EMPRESA`

**⚠️ RESTRICCIÓN IMPORTANTE:** Los usuarios con rol `USUARIO_EMPRESA` **solo pueden tener una empresa asignada**. El sistema validará esto automáticamente.

**Ejemplo de creación:**

```json
POST /api/users
{
  "username": "empresa_user1",
  "password": "password123",
  "role": "USUARIO_EMPRESA",
  "nombre": "María",
  "apellido": "García",
  "correo": "maria.garcia@empresa.com",
  "company_ids": [1]  // Solo UNA empresa permitida
}
```

**Resultado:**
- `user_type` = `COMPANY_USER`
- `role` = `USUARIO_EMPRESA`
- En `user_companies`:
  - `user_id` = ID del usuario
  - `company_id` = 1, `role` = `EMPRESA_USUARIO`, `is_active` = `true`

**❌ Error si se intenta asignar múltiples empresas:**

```json
POST /api/users
{
  "username": "empresa_user1",
  "password": "password123",
  "role": "USUARIO_EMPRESA",
  "company_ids": [1, 2]  // ❌ ERROR: Solo se permite una empresa
}
```

**Respuesta de error:**
```json
{
  "detail": "Los usuarios de empresa solo pueden tener una empresa asignada"
}
```

### 3. Roles por Empresa en `user_companies`

Los roles disponibles por empresa son:
- `EMPRESA_PROPIETARIO` - Propietario de la empresa
- `EMPRESA_ADMIN` - Administrador de la empresa
- `EMPRESA_USUARIO` - Usuario estándar (por defecto)
- `EMPRESA_LECTOR` - Solo lectura

**Nota:** Actualmente, al crear un usuario, se asigna `EMPRESA_USUARIO` por defecto. Para cambiar el rol por empresa, se debe actualizar manualmente la tabla `user_companies` o usar el endpoint de actualización.

### 4. Actualizar Rol por Empresa

Para cambiar el rol de un usuario en una empresa específica:

```sql
UPDATE user_companies 
SET role = 'EMPRESA_ADMIN', is_active = true
WHERE user_id = 5 AND company_id = 1;
```

O usando el endpoint de actualización (si está implementado):

```json
PATCH /api/users/{user_id}
{
  "company_ids": [1, 2],
  // El sistema actualizará las asignaciones
}
```

## Campos del Modelo

### User (`users`)

- `id`: ID único
- `username`: Nombre de usuario (único)
- `password_hash`: Hash de la contraseña
- `user_type`: `SISCONT_INTERNAL` | `COMPANY_USER` (se establece automáticamente)
- `role`: Rol principal del usuario (ADMINISTRADOR, CONTADOR, USUARIO_EMPRESA, etc.)
- `role_id`: ID del rol dinámico (opcional)
- `is_admin`: Boolean (true si es ADMINISTRADOR)
- `nombre`, `apellido`, `correo`, `foto`: Datos personales

### user_companies (tabla intermedia)

- `user_id`: FK a `users.id`
- `company_id`: FK a `companies.id`
- `role`: Rol específico por empresa (`EMPRESA_USUARIO`, `EMPRESA_ADMIN`, etc.)
- `is_active`: Boolean (si el usuario está activo en esa empresa)

## Flujo de Creación

1. **Validar permisos**: Solo administradores pueden crear usuarios
2. **Validar rol**: Debe especificarse `role` o `role_id`
3. **Validar empresas para USUARIO_EMPRESA**:
   - Si `role == "USUARIO_EMPRESA"`:
     - Debe tener exactamente 1 empresa asignada (`company_ids` debe tener longitud 1)
     - Si no tiene empresas o tiene más de una, se rechaza con error 400
4. **Determinar `user_type`**:
   - Si `role == "USUARIO_EMPRESA"` → `user_type = "COMPANY_USER"`
   - En caso contrario → `user_type = "SISCONT_INTERNAL"`
5. **Crear usuario** con `user_type` establecido
6. **Asignar empresas**:
   - Si `company_ids` está presente, insertar en `user_companies` con:
     - `role = "EMPRESA_USUARIO"` (por defecto)
     - `is_active = true`

## Permisos y Acceso

- **Usuarios SISCONT_INTERNAL**: Acceden según su rol (ADMINISTRADOR, CONTADOR, etc.)
- **Usuarios COMPANY_USER**: 
  - Solo pueden acceder a empresas donde están asignados en `user_companies` con `is_active = true`
  - Tienen acceso a la Casilla Electrónica de sus empresas
  - Pueden ver el Dashboard Empresa (`/empresa/dashboard`)

## Ejemplos de Uso

### Crear Administrador SISCONT

```bash
curl -X POST http://localhost:8000/api/users \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123",
    "role": "ADMINISTRADOR",
    "nombre": "Admin",
    "apellido": "Sistema"
  }'
```

### Crear Usuario de Empresa

**⚠️ IMPORTANTE: Solo se puede asignar UNA empresa**

```bash
curl -X POST http://localhost:8000/api/users \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "empresa1_user",
    "password": "empresa123",
    "role": "USUARIO_EMPRESA",
    "nombre": "Juan",
    "apellido": "Empresa",
    "correo": "juan@empresa.com",
    "company_ids": [1]
  }'
```

**Nota:** Si intentas asignar múltiples empresas (`company_ids: [1, 2]`), recibirás un error 400.

## Notas Importantes

1. **`user_type` se establece automáticamente** basado en el rol. No es necesario especificarlo manualmente.

2. **`role` en `user_companies`** es diferente del `role` en `users`:
   - `users.role`: Rol principal del usuario (ADMINISTRADOR, USUARIO_EMPRESA, etc.)
   - `user_companies.role`: Rol específico por empresa (EMPRESA_USUARIO, EMPRESA_ADMIN, etc.)

3. **⚠️ RESTRICCIÓN: Usuarios USUARIO_EMPRESA solo pueden tener UNA empresa asignada**. Esta validación se aplica tanto en creación como en actualización.

4. **Usuarios SISCONT_INTERNAL pueden tener múltiples empresas** con diferentes roles en cada una.

5. **Para desactivar un usuario en una empresa**, actualizar `is_active = false` en `user_companies`.

6. **Migración automática**: Los usuarios existentes con `role = "USUARIO_EMPRESA"` fueron migrados a `user_type = "COMPANY_USER"` por la migración `20250210_01`.

7. **Al cambiar un usuario a rol USUARIO_EMPRESA**: Si el usuario ya tiene múltiples empresas asignadas, el sistema rechazará el cambio. Primero debe reducir las empresas a una sola antes de cambiar el rol.
