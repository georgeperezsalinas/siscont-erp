# Módulos SISCONT - Estructura SAP-style

## Objetivo

Organizar los módulos de SISCONT siguiendo buenas prácticas de sistemas contables multiempresa tipo SAP ERP.

---

# Administración

---

## Estructura del Menú Administración

Orden SAP-style: **Organización → Configuración → Motor → Mantenimiento**

| Orden | Ruta | Etiqueta | Descripción |
|-------|------|----------|-------------|
| 1 | `/empresas` | Empresas | Gestión de empresas (company codes) |
| 2 | `/usuarios` | Usuarios | Usuarios del sistema |
| 3 | `/permisos` | Permisos | Roles y permisos |
| 4 | `/configuracion` | Configuración | Parámetros contables por empresa |
| 5 | `/motor-asientos` | Motor de Asientos | Eventos, reglas y mapeos |
| 6 | `/mantenimiento-datos` | Mantenimiento de Datos | Limpieza, datos de prueba, BD |

---

## Configuración (`/configuracion`)

**Parámetros por empresa** – Cada empresa tiene su propia configuración.

- **Contexto visible**: Barra indicando la empresa activa.
- **Pestañas**:
  - **General**: Formato numérico, moneda, formato de fecha
  - **Impuestos**: Tasa IGV por defecto
  - **Períodos**: Mes de inicio del año fiscal
  - **Avanzado**: Editar períodos cerrados, auto-generar asientos, validar fechas

---

## Mantenimiento de Datos (`/mantenimiento-datos`)

Sustituye a "Setup Datos" con una estructura más clara.

### Pestaña: Datos por Empresa
- **Contexto visible**: Empresa seleccionada.
- **Limpiar Datos**: Asientos, compras, ventas, inventario, conciliaciones (por empresa).
- **Generar Datos de Prueba**: Asientos, compras, ventas, terceros, productos (por empresa y período).

### Pestaña: Sistema y Base de Datos
- **Zona de riesgo**: Operaciones que afectan toda la BD.
- **Resetear para Configuración Inicial**: Borra todo, muestra wizard de primera instalación.
- **Inicializar Base de Datos**: Recrea tablas desde modelos.
- **Restaurar desde Dump SQL**: Restaura desde archivo `.sql` en `db/`.

---

## Compatibilidad

- **`/setup-datos`** redirige a `/mantenimiento-datos` para mantener enlaces antiguos.
- **SetupDatos.tsx** se mantiene pero deja de usarse; puede eliminarse más adelante.

---

## Principios SAP Aplicados

1. **Organización clara**: Organización → Configuración → Motor → Mantenimiento.
2. **Contexto multiempresa visible**: Siempre se muestra la empresa activa.
3. **Separación de riesgos**: Operaciones por empresa vs operaciones de sistema.
4. **Pestañas por dominio**: General, Impuestos, Períodos, Avanzado en Configuración.

---

# Contabilidad

## Estructura SAP-style: Visión general → Plan → Operaciones → Control

| Subgrupo | Ruta | Etiqueta | Descripción |
|----------|------|----------|-------------|
| **Visión general** | `/` | Dashboard | Resumen ejecutivo por empresa/período |
| **Plan maestro** | `/plan` | Plan Contable | Catálogo de cuentas por empresa |
| | `/periodos` | Periodos | Apertura y cierre de períodos |
| **Operaciones contables** | `/asientos` | Asientos | Registro de asientos contables |
| | `/diarios` | Diarios | Libro diario por período |
| **Control** | `/conciliacion-bancaria` | Conciliación Bancaria | Conciliación bancaria |
| | `/validacion-datos` | Validación de Datos | Integridad contable |

---

# Operaciones

## Estructura SAP-style: Maestros → Compras/Ventas → Tesorería → Inventarios

| Subgrupo | Ruta | Etiqueta | Descripción |
|----------|------|----------|-------------|
| **Maestros** | `/terceros` | Proveedores y Clientes | Catálogo de terceros |
| **Compras y Ventas** | `/compras` | Compras | Compras con IGV |
| | `/ventas` | Ventas | Ventas con IGV |
| **Tesorería** | `/tesoreria` | Tesorería | Cobros, pagos, transferencias |
| **Inventarios** | `/inventarios` | Inventarios | Stock, entradas, salidas |

---

# Reportes

## Estructura SAP-style: Contables → Operativos → Control → Tributarios

| Subgrupo | Ruta | Etiqueta | Descripción |
|----------|------|----------|-------------|
| **Visión general** | `/reportes` | Todos los Reportes | Hub de reportes |
| **Contables** | `/reportes?tipo=libro-diario` | Libro Diario | Registro cronológico |
| | `/reportes?tipo=libro-mayor` | Libro Mayor | Saldos por cuenta |
| | `/reportes?tipo=balance-comprobacion` | Balance de Comprobación | Cuadratura |
| | `/reportes?tipo=estado-resultados` | Estado de Resultados | P&L |
| | `/reportes?tipo=balance-general` | Balance General | Activo/Pasivo/Patrimonio |
| **Operativos** | `/reportes?tipo=kardex-valorizado` | Kardex Valorizado | Inventarios |
| | `/reportes?tipo=saldos-por-cliente` | Cuentas por Cobrar | CxC |
| | `/reportes?tipo=saldos-por-proveedor` | Cuentas por Pagar | CxP |
| **Control** | `/reportes?tipo=asientos-descuadrados` | Asientos Descuadrados | Cuadratura |
| | `/reportes?tipo=movimientos-sin-asiento` | Movimientos sin Asiento | Trazabilidad |
| | `/reportes?tipo=trazabilidad-total` | Trazabilidad | Auditoría |
| | `/reportes?tipo=cambios-reversiones` | Cambios y Reversiones | Historial |
| **Tributarios** | `/ple` | PLE | Planilla Electrónica |
| | `/sire` | SIRE | SUNAT |

## Pestañas internas (página Reportes)

- **Libros Contables**: Libro Diario, Libro Mayor, Balance Comprobación
- **Estados Financieros**: Estado Resultados, Balance General
- **Reportes Operativos**: Kardex, CxC, CxP
- **Control y Cuadratura**: Asientos descuadrados, Movimientos sin asiento
- **Auditoría y Trazabilidad**: Trazabilidad, Cambios y reversiones

---

## Principios SAP Aplicados (todos los módulos)

1. **Organización clara**: Subgrupos lógicos dentro de cada módulo.
2. **Contexto multiempresa visible**: Topbar muestra empresa y período activos.
3. **Flujo predecible**: Visión general → Plan → Operaciones → Control.
4. **Reportes por categoría**: Contables, Operativos, Control, Tributarios.
