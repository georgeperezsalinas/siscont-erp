# Guía: Crear Eventos y Reglas de Tesorería

Esta guía explica cómo crear manualmente los eventos contables y reglas necesarias para el módulo de Tesorería.

## Eventos Requeridos

El módulo de Tesorería requiere los siguientes eventos contables:

1. **COBRO_CAJA** - Cobro de clientes en efectivo
2. **COBRO_BANCO** - Cobro de clientes por transferencia bancaria
3. **PAGO_CAJA** - Pago a proveedores en efectivo
4. **PAGO_BANCO** - Pago a proveedores por transferencia bancaria
5. **TRANSFERENCIA** - Transferencia entre cuentas (opcional, para uso futuro)

## Crear Eventos Manualmente

### 1. Ir al Motor de Asientos

Navega a: **Configuración → Motor de Asientos → Pestaña "Eventos"**

### 2. Crear Evento: COBRO_CAJA

1. Click en **"Nuevo Evento"**
2. Seleccionar **"Crear tipo personalizado"**
3. Completar:
   - **Tipo**: `COBRO_CAJA`
   - **Nombre**: `Cobro en Caja`
   - **Descripción**: `Registra cobros de clientes en efectivo (caja)`
4. Click en **"Guardar"**

### 3. Crear Reglas para COBRO_CAJA

1. Ir a la pestaña **"Reglas"**
2. Filtrar por el evento **"Cobro en Caja"**
3. Click en **"Nueva Regla"**
4. Crear **Regla 1**:
   - **Lado**: `DEBE`
   - **Tipo de Cuenta**: `CAJA`
   - **Tipo de Monto**: `TOTAL`
   - **Orden**: `1`
   - **Activo**: ✅
5. Click en **"Guardar"**
6. Crear **Regla 2**:
   - **Lado**: `HABER`
   - **Tipo de Cuenta**: `CLIENTES`
   - **Tipo de Monto**: `TOTAL`
   - **Orden**: `2`
   - **Activo**: ✅
7. Click en **"Guardar"**

### 4. Crear Evento: COBRO_BANCO

1. Click en **"Nuevo Evento"**
2. Seleccionar **"Crear tipo personalizado"**
3. Completar:
   - **Tipo**: `COBRO_BANCO`
   - **Nombre**: `Cobro en Banco`
   - **Descripción**: `Registra cobros de clientes por transferencia bancaria`
4. Click en **"Guardar"**

### 5. Crear Reglas para COBRO_BANCO

1. Ir a la pestaña **"Reglas"**
2. Filtrar por el evento **"Cobro en Banco"**
3. Click en **"Nueva Regla"**
4. Crear **Regla 1**:
   - **Lado**: `DEBE`
   - **Tipo de Cuenta**: `BANCO`
   - **Tipo de Monto**: `TOTAL`
   - **Orden**: `1`
   - **Activo**: ✅
5. Click en **"Guardar"**
6. Crear **Regla 2**:
   - **Lado**: `HABER`
   - **Tipo de Cuenta**: `CLIENTES`
   - **Tipo de Monto**: `TOTAL`
   - **Orden**: `2`
   - **Activo**: ✅
7. Click en **"Guardar"**

### 6. Crear Evento: PAGO_CAJA

1. Click en **"Nuevo Evento"**
2. Seleccionar **"Crear tipo personalizado"**
3. Completar:
   - **Tipo**: `PAGO_CAJA`
   - **Nombre**: `Pago en Caja`
   - **Descripción**: `Registra pagos a proveedores en efectivo (caja)`
4. Click en **"Guardar"**

### 7. Crear Reglas para PAGO_CAJA

1. Ir a la pestaña **"Reglas"**
2. Filtrar por el evento **"Pago en Caja"**
3. Click en **"Nueva Regla"**
4. Crear **Regla 1**:
   - **Lado**: `DEBE`
   - **Tipo de Cuenta**: `PROVEEDORES`
   - **Tipo de Monto**: `TOTAL`
   - **Orden**: `1`
   - **Activo**: ✅
5. Click en **"Guardar"**
6. Crear **Regla 2**:
   - **Lado**: `HABER`
   - **Tipo de Cuenta**: `CAJA`
   - **Tipo de Monto**: `TOTAL`
   - **Orden**: `2`
   - **Activo**: ✅
7. Click en **"Guardar"**

### 8. Crear Evento: PAGO_BANCO

1. Click en **"Nuevo Evento"**
2. Seleccionar **"Crear tipo personalizado"**
3. Completar:
   - **Tipo**: `PAGO_BANCO`
   - **Nombre**: `Pago en Banco`
   - **Descripción**: `Registra pagos a proveedores por transferencia bancaria`
4. Click en **"Guardar"**

### 9. Crear Reglas para PAGO_BANCO

1. Ir a la pestaña **"Reglas"**
2. Filtrar por el evento **"Pago en Banco"**
3. Click en **"Nueva Regla"**
4. Crear **Regla 1**:
   - **Lado**: `DEBE`
   - **Tipo de Cuenta**: `PROVEEDORES`
   - **Tipo de Monto**: `TOTAL`
   - **Orden**: `1`
   - **Activo**: ✅
5. Click en **"Guardar"**
6. Crear **Regla 2**:
   - **Lado**: `HABER`
   - **Tipo de Cuenta**: `BANCO`
   - **Tipo de Monto**: `TOTAL`
   - **Orden**: `2`
   - **Activo**: ✅
7. Click en **"Guardar"**

## Resumen de Reglas

| Evento | Regla | Lado | Tipo de Cuenta | Tipo de Monto | Orden |
|--------|-------|------|----------------|---------------|-------|
| COBRO_CAJA | 1 | DEBE | CAJA | TOTAL | 1 |
| COBRO_CAJA | 2 | HABER | CLIENTES | TOTAL | 2 |
| COBRO_BANCO | 1 | DEBE | BANCO | TOTAL | 1 |
| COBRO_BANCO | 2 | HABER | CLIENTES | TOTAL | 2 |
| PAGO_CAJA | 1 | DEBE | PROVEEDORES | TOTAL | 1 |
| PAGO_CAJA | 2 | HABER | CAJA | TOTAL | 2 |
| PAGO_BANCO | 1 | DEBE | PROVEEDORES | TOTAL | 1 |
| PAGO_BANCO | 2 | HABER | BANCO | TOTAL | 2 |

## Inicialización Automática

**Nota**: El sistema ahora inicializa automáticamente estos eventos cuando:
- Se carga la página del Motor de Asientos
- Se accede al módulo de Tesorería
- Se inicializan los métodos de pago

Si los eventos no se crean automáticamente, puedes usar esta guía para crearlos manualmente.

## Verificación

Para verificar que los eventos están creados correctamente:

1. Ir a **Motor de Asientos → Pestaña "Eventos"**
2. Buscar los eventos:
   - ✅ Cobro en Caja (COBRO_CAJA)
   - ✅ Cobro en Banco (COBRO_BANCO)
   - ✅ Pago en Caja (PAGO_CAJA)
   - ✅ Pago en Banco (PAGO_BANCO)

3. Verificar las reglas en la pestaña **"Reglas"**
4. Verificar los mapeos en la pestaña **"Mapeos"** (asegurarse de que CAJA, BANCO, CLIENTES y PROVEEDORES estén mapeados)

## Solución Rápida (API)

Si prefieres usar la API directamente:

```bash
POST /api/journal-engine/init-defaults?company_id=1
```

Esto creará todos los eventos y reglas predeterminados, incluyendo los de Tesorería.

