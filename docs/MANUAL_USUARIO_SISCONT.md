# Manual de Usuario SISCONT

## Sistema Contable Peruano - Guía de Uso Completa

**Versión:** 1.0  
**Última actualización:** Febrero 2026

---

## Índice

1. [Introducción](#1-introducción)
2. [Acceso e Inicio de Sesión](#2-acceso-e-inicio-de-sesión)
3. [Interfaz Principal](#3-interfaz-principal)
4. [Configuración Inicial](#4-configuración-inicial)
5. [Módulo Contabilidad](#5-módulo-contabilidad)
6. [Módulo Operaciones](#6-módulo-operaciones)
7. [Módulo Reportes](#7-módulo-reportes)
8. [Módulo Administración](#8-módulo-administración)
9. [Flujos de Trabajo Comunes](#9-flujos-de-trabajo-comunes)
10. [Solución de Problemas](#10-solución-de-problemas)

---

## 1. Introducción

### 1.1 ¿Qué es SISCONT?

SISCONT es un sistema de gestión contable diseñado para empresas peruanas. Permite:

- Registrar compras y ventas con IGV
- Gestionar asientos contables
- Controlar inventarios
- Conciliar cuentas bancarias
- Generar reportes y libros electrónicos (PLE) para SUNAT

### 1.2 Roles de Usuario

| Rol | Permisos |
|-----|----------|
| **ADMINISTRADOR** | Acceso total. Gestiona empresas, usuarios, configuración, Casilla Electrónica (envía mensajes) y cierre de períodos. |
| **CONTADOR** | Plan de cuentas, asientos, cierre de períodos, reportes, PLE. |
| **OPERADOR** | Compras, ventas, inventarios, asientos (sin eliminar). No cierra períodos. |
| **AUDITOR** | Solo lectura. Ver reportes, asientos, documentos. |
| **USUARIO_EMPRESA** | Solo Casilla Electrónica. Usuario de empresa que consulta mensajes; no gestiona contabilidad. |

---

## 2. Acceso e Inicio de Sesión

### 2.1 Primera Vez - Configuración Inicial

Si es la primera vez que se accede al sistema:

1. Abra el navegador y vaya a la URL del sistema (ej: `http://localhost:5173`)
2. Se mostrará el **Asistente de Configuración** (Setup Wizard)
3. Complete los pasos:
   - **Paso 1**: Crear empresa (RUC, razón social, dirección)
   - **Paso 2**: Crear usuario administrador (usuario y contraseña)
   - **Paso 3**: Crear período contable inicial
   - **Paso 4**: Importar plan de cuentas (si aplica)
4. Al finalizar, se redirigirá al login

### 2.2 Iniciar Sesión

1. En la pantalla de login, ingrese su **usuario** y **contraseña**
2. Haga clic en **"Iniciar sesión"**
3. Si las credenciales son correctas, entrará al **Dashboard**

### 2.3 Recuperar Acceso

- Si olvidó la contraseña, contacte al administrador del sistema
- El administrador puede restablecer la contraseña desde **Usuarios** → Editar usuario

---

## 3. Interfaz Principal

### 3.1 Estructura de la Pantalla

```
┌─────────────────────────────────────────────────────────────┐
│  SISCONT    [Empresa ▼] [Período ▼] [Usuario] [Buscar]       │  ← Barra superior
├──────────┬──────────────────────────────────────────────────┤
│          │                                                    │
│  Menú    │  Contenido principal (Dashboard, módulos, etc.)     │
│  lateral │                                                    │
│          │                                                    │
└──────────┴────────────────────────────────────────────────────┘
```

### 3.2 Menú Lateral

El menú está organizado en secciones:

- **Administración**: Empresas, Usuarios, Permisos, Configuración, Motor de Asientos, Mantenimiento
- **Contabilidad**: Dashboard, Plan Contable, Períodos, Asientos, Diarios, Conciliación, Validación
- **Operaciones**: Terceros, Compras, Ventas, Tesorería, Inventarios, Notas
- **Comunicación**: Casilla Electrónica (notificaciones oficiales)
- **Reportes**: Todos los Reportes, Libro Diario, Balance, PLE, SIRE

Use **Ctrl+K** (o Cmd+K en Mac) para buscar en el menú.

### 3.3 Selector de Empresa y Período

En la barra superior:

- **Empresa activa**: Haga clic para cambiar de empresa (si tiene acceso a varias)
- **Período activo**: Haga clic para cambiar el período contable (ej: 2025-01)

⚠️ **Importante**: Todas las operaciones se realizan en el contexto de la empresa y período seleccionados.

### 3.4 Menú de Usuario

Haga clic en su avatar (esquina superior derecha) para:

- **Mi Perfil**: Ver y editar su perfil
- **Tema Oscuro/Claro**: Cambiar el tema visual
- **Cerrar sesión**: Salir del sistema

---

## 4. Configuración Inicial

### 4.1 Plan de Cuentas

**Ruta:** Contabilidad → Plan Contable

1. Para importar un plan existente: use el botón **Importar** y cargue un archivo CSV
2. Para crear manualmente: clic en **Nueva Cuenta**
3. Complete: Código, Nombre, Tipo (Activo, Pasivo, etc.), Nivel
4. El código debe ser único por empresa (ej: 10.10, 42.12)

### 4.2 Períodos Contables

**Ruta:** Contabilidad → Periodos

1. Clic en **Nuevo Período**
2. Seleccione **Año** y **Mes**
3. Guarde. El período quedará en estado **ABIERTO**

### 4.3 Configuración de la Empresa

**Ruta:** Administración → Configuración

Pestañas disponibles:

- **General**: Formato numérico, moneda, formato de fecha
- **Impuestos**: Tasa IGV por defecto (18%)
- **Períodos**: Mes de inicio del año fiscal
- **Avanzado**: Opciones de validación y auto-generación de asientos

### 4.4 Motor de Asientos (Opcional)

**Ruta:** Administración → Motor de Asientos

Para generar asientos automáticamente desde compras, ventas, pagos, etc.:

1. Pestaña **Eventos**: Clic en **Inicializar Predeterminados** (crea eventos COMPRA, VENTA, PAGO, COBRO)
2. Pestaña **Reglas**: Verifique las reglas creadas
3. Pestaña **Mapeos**: Clic en **Mapear Todos Automáticamente** para vincular tipos de cuenta con cuentas reales
4. Pestaña **Probar**: Pruebe la generación antes de usarla en producción

---

## 5. Módulo Contabilidad

### 5.1 Dashboard

**Ruta:** Contabilidad → Dashboard

Muestra un resumen ejecutivo del período activo:

- Totales de ingresos y gastos
- Ventas vs compras
- Asientos recientes
- Alertas (período por cerrar, etc.)

### 5.2 Crear un Asiento Manual

**Ruta:** Contabilidad → Asientos

1. Clic en **Nuevo Asiento**
2. Complete:
   - **Fecha**: Dentro del período activo
   - **Glosa**: Descripción del asiento (obligatorio)
   - **Moneda**: PEN o USD
3. En la tabla de líneas:
   - En cada fila: Cuenta, Debe o Haber, Monto, Memo (opcional)
   - **Mínimo 2 líneas**
   - **Total Debe = Total Haber**
4. Clic en **Guardar**

### 5.3 Diarios

**Ruta:** Contabilidad → Diarios

Visualice todos los asientos del período. Puede filtrar por fecha, cuenta o glosa.

### 5.4 Períodos - Cerrar Período

**Ruta:** Contabilidad → Periodos

Solo **ADMINISTRADOR** o **CONTADOR** pueden cerrar períodos.

1. Seleccione el período a cerrar
2. Clic en **Validar Cierre** (verifica que todo cuadre)
3. Si es correcto, clic en **Cerrar Período**
4. Ingrese el motivo del cierre
5. Confirmar

⚠️ Una vez cerrado, no se pueden crear ni editar asientos (excepto ADMINISTRADOR).

### 5.5 Conciliación Bancaria

**Ruta:** Contabilidad → Conciliación Bancaria

1. **Registrar cuenta bancaria** (si no existe): Asocie una cuenta contable (ej: 10.20)
2. **Cargar extracto**: Suba el archivo del banco (CSV/JSON) o ingrese manualmente
3. **Conciliar**: Relacione las transacciones del extracto con las líneas contables
4. **Finalizar**: Indique si concilió correctamente

### 5.6 Validación de Datos

**Ruta:** Contabilidad → Validación de Datos

Ejecute validaciones de integridad:

- Asientos descuadrados
- Cuentas inexistentes
- Fechas fuera de período

---

## 6. Módulo Operaciones

### 6.1 Terceros (Clientes y Proveedores)

**Ruta:** Operaciones → Proveedores y Clientes

**Crear un tercero:**

1. Clic en **Nuevo**
2. Complete: Tipo (Cliente/Proveedor), RUC o DNI, Razón Social, Dirección
3. El sistema valida el RUC automáticamente
4. Guardar

### 6.2 Compras

**Ruta:** Operaciones → Compras

**Registrar una compra:**

1. Clic en **Nueva Compra**
2. Complete:
   - **Tipo de documento**: Factura (01), Boleta (03), etc.
   - **Serie y número**: Ej. F001-00001234
   - **Fecha de emisión**
   - **Proveedor**: Seleccione o cree uno rápido
   - **Líneas**: Descripción, Cantidad, Precio unitario (el IGV se calcula automáticamente)
3. Si tiene múltiples ítems, use **Agregar línea**
4. **Glosa** (opcional): Se genera automáticamente si no la ingresa
5. Clic en **Guardar**

✅ El sistema genera automáticamente el asiento contable (si el Motor está configurado).

**Pagos:**

- En la lista de compras, clic en el ícono de pago para registrar un pago
- Seleccione método de pago y monto

**Notas de crédito/débito:**

- Desde la compra, use el menú de acciones para registrar notas

### 6.3 Ventas

**Ruta:** Operaciones → Ventas

Proceso similar a Compras:

1. **Nueva Venta**
2. Tipo documento, serie, número, fecha
3. **Cliente**: Seleccione o cree
4. **Líneas**: Producto/servicio, cantidad, precio
5. IGV automático
6. Guardar

**Cobros:**

- Registre cobros desde la venta o desde **Tesorería**

### 6.4 Tesorería

**Ruta:** Operaciones → Tesorería

- **Cobros**: Cobrar facturas de clientes
- **Pagos**: Pagar facturas a proveedores
- **Transferencias**: Entre cuentas (caja/bancos)

### 6.5 Inventarios

**Ruta:** Operaciones → Inventarios

**Pestañas:**

- **Productos**: CRUD de productos (código, descripción, unidad)
- **Movimientos**: Entradas y salidas de stock
- **Stock**: Consulta de stock actual

**Registrar movimiento:**

1. Clic en **Nuevo Movimiento**
2. Tipo: Entrada o Salida
3. Producto, cantidad, costo (en entradas)
4. Fecha y referencia
5. Guardar (se genera asiento si el Motor está configurado)

### 6.6 Notas de Crédito y Débito

**Ruta:** Operaciones → Notas

Gestionar notas de crédito y débito vinculadas a compras y ventas.

---

## 7. Módulo Reportes

### 7.1 Hub de Reportes

**Ruta:** Reportes → Todos los Reportes

Organizado en pestañas:

- **Libros Contables**: Libro Diario, Libro Mayor, Balance de Comprobación
- **Estados Financieros**: Estado de Resultados, Balance General
- **Reportes Operativos**: Kardex, Cuentas por Cobrar, Cuentas por Pagar
- **Control y Cuadratura**: Asientos descuadrados, Movimientos sin asiento
- **Auditoría**: Trazabilidad, Cambios y reversiones

### 7.2 Generar un Reporte

1. Seleccione el tipo de reporte
2. Elija **Período** (o rango de fechas según el reporte)
3. Para Libro Mayor: seleccione la **Cuenta**
4. Clic en **Generar** o **Buscar**
5. **Exportar**: Excel o PDF según el reporte

### 7.3 PLE (Programa de Libros Electrónicos)

**Ruta:** Reportes → PLE

1. Seleccione el **Período**
2. Elija el libro a generar:
   - Libro Diario (5.1)
   - Libro Mayor (5.2)
   - Plan de Cuentas (5.3)
   - Registro de Compras (8.1)
   - Registro de Ventas (14.1)
   - Caja y Bancos (1.1)
   - Inventarios y Balances (3.1)
3. Clic en **Descargar** (TXT o JSON según formato SUNAT)

### 7.4 SIRE

**Ruta:** Reportes → SIRE

Sincronización con el Sistema Integrado de Registros Electrónicos de SUNAT:

1. Configure credenciales SIRE (Administración)
2. En SIRE: sincronice períodos
3. Descargue propuestas de compras/ventas
4. Revise y acepte o complemente

### 7.5 Casilla Electrónica

**Ruta:** Comunicación → Casilla Electrónica

Notificaciones oficiales entre SISCONT y las empresas.

**Para administradores (SISCONT):**
- **Enviar**: Tab "Enviar" → Selecciona empresa destinataria → Completa asunto y contenido → Enviar.
- **Mensajes enviados**: Tab "Mensajes enviados" → Selecciona una empresa → Verás la bandeja de esa empresa (lo mismo que ve la empresa). Tras enviar, se cambia automáticamente a esta vista.

**Para la empresa:**
1. **Selecciona tu empresa** en el selector de empresa (barra superior).
2. Menú **Comunicación** → **Casilla Electrónica**.
3. Tab **Bandeja de entrada**: ahí aparecen los mensajes que SISCONT le ha enviado a tu empresa.
4. Haz clic en un mensaje para ver el detalle y responder (si requiere respuesta).

---

## 8. Módulo Administración

*Solo visible para ADMINISTRADOR*

### 8.1 Empresas

**Ruta:** Administración → Empresas

- Crear, editar, activar/desactivar empresas
- Datos fiscales: RUC, razón social, dirección, ubigeo

### 8.2 Usuarios

**Ruta:** Administración → Usuarios

- Crear usuarios
- Asignar rol (ADMINISTRADOR, CONTADOR, OPERADOR, AUDITOR, USUARIO_EMPRESA)
- Asignar empresas a las que puede acceder
- Restablecer contraseña

### 8.3 Permisos

**Ruta:** Administración → Permisos

- Crear roles personalizados
- Asignar permisos granulares a cada rol
- Los roles del sistema (ADMINISTRADOR, etc.) no se pueden eliminar

### 8.4 Mantenimiento de Datos

**Ruta:** Administración → Mantenimiento de Datos

**Pestaña Datos por Empresa:**

- Limpiar datos de prueba (asientos, compras, ventas, etc.)
- Generar datos de prueba

**Pestaña Sistema:**

- Resetear para configuración inicial (⚠️ borra todo)
- Restaurar desde dump SQL

---

## 9. Flujos de Trabajo Comunes

### 9.1 Flujo: Mes Contable Completo

1. **Inicio de mes**: Verificar que el período esté ABIERTO
2. **Registrar operaciones**: Compras, ventas, cobros, pagos durante el mes
3. **Asientos manuales**: Ajustes, provisiones, etc.
4. **Conciliación**: Conciliar cuentas bancarias
5. **Validación**: Ejecutar Validación de Datos
6. **Reportes**: Generar Balance de Comprobación, revisar
7. **Cierre**: Cerrar período (CONTADOR/ADMIN)
8. **PLE**: Generar archivos PLE para SUNAT

### 9.2 Flujo: Registrar una Compra con Pago

1. Compras → Nueva Compra
2. Ingrese datos del documento y proveedor
3. Agregue líneas (productos/servicios)
4. Guardar (se genera asiento)
5. En la lista, clic en ícono de pago
6. Registre el pago (monto, método, fecha)
7. Se genera asiento de pago automáticamente

### 9.3 Flujo: Nota de Crédito por Devolución

1. Vaya a Compras o Ventas
2. Seleccione el documento original
3. Acciones → Registrar Nota de Crédito
4. Ingrese serie, número, motivo, monto
5. Guardar

---

## 10. Solución de Problemas

### 10.1 No puedo iniciar sesión

- Verifique usuario y contraseña
- Si olvidó la contraseña, contacte al administrador
- Verifique que la empresa esté activa

### 10.2 "Período cerrado" al crear asiento

- El período está cerrado. Solo ADMINISTRADOR puede editar en períodos cerrados
- Si necesita modificar: ADMINISTRADOR debe **Reabrir** el período (Periodos → Reabrir)

### 10.3 El asiento no cuadra

- Debe = Haber. Revise los montos en cada línea
- El sistema muestra el total de Debe y Haber para facilitar la verificación

### 10.4 La fecha está fuera del período

- La fecha del asiento/compra/venta debe estar dentro del mes del período activo
- Cambie el período activo o la fecha

### 10.5 "Cuenta no mapeada" (Motor de Asientos)

- Vaya a Motor de Asientos → Mapeos
- Use "Mapear Todos Automáticamente" o mapee manualmente los tipos faltantes

### 10.6 No aparece un módulo en el menú

- Su rol puede no tener permiso. Contacte al administrador
- Verifique que la empresa y período estén seleccionados

### 10.7 Error al exportar PLE

- Verifique que existan datos en el período
- Revisar que las cuentas tengan códigos válidos según PCGE

---

## Atajos de Teclado

| Atajo | Acción |
|-------|--------|
| **Ctrl+K** (Cmd+K) | Abrir buscador del menú |

---

## Contacto y Soporte

Para soporte técnico o consultas sobre el sistema, contacte al administrador de su organización.

---

*Manual de Usuario SISCONT - Sistema Contable Peruano*
