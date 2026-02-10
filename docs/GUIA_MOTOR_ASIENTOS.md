# 🍎 Guía Completa del Motor de Asientos Contables

## 📋 Tabla de Contenidos
1. [¿Qué es el Motor de Asientos?](#qué-es-el-motor-de-asientos)
2. [¿Cómo Funciona?](#cómo-funciona)
3. [Configuración Paso a Paso](#configuración-paso-a-paso)
4. [Ejemplos Prácticos](#ejemplos-prácticos)
5. [Troubleshooting](#troubleshooting)

---

## 🍎 ¿Qué es el Motor de Asientos?

El **Motor de Asientos Contables** es un sistema inteligente que **genera automáticamente asientos contables** basándose en eventos de negocio (compras, ventas, pagos, etc.) y reglas configuradas.

### 🎯 Ventajas

✅ **Automatización**: No necesitas crear asientos manualmente  
✅ **Consistencia**: Todos los asientos siguen las mismas reglas  
✅ **Flexibilidad**: Puedes configurar tus propias reglas contables  
✅ **Mapeo Inteligente**: Encuentra automáticamente las cuentas correctas  

---

## 🍎 ¿Cómo Funciona?

El motor funciona en **3 pasos principales**:

```
┌─────────────────┐
│ 1. EVENTO        │  → Compra, Venta, Pago, Cobro, etc.
└────────┬─────────┘
         │
         ▼
┌─────────────────┐
│ 2. REGLAS        │  → Define qué cuentas usar y en qué lado
└────────┬─────────┘
         │
         ▼
┌─────────────────┐
│ 3. MAPEO         │  → Convierte tipos de cuenta a cuentas reales
└────────┬─────────┘
         │
         ▼
┌─────────────────┐
│ ASIENTO GENERADO│  → Listo para usar
└─────────────────┘
```

### Componentes del Sistema

#### 1️⃣ **Eventos Contables** 🎪
Son los **tipos de operaciones** que generan asientos:
- `COMPRA` - Compra de bienes/servicios
- `VENTA` - Venta de bienes/servicios
- `PAGO` - Pago a proveedores
- `COBRO` - Cobro de clientes
- `AJUSTE_INVENTARIO` - Ajustes de inventario
- `ENTRADA_INVENTARIO` - Entrada de mercaderías
- `SALIDA_INVENTARIO` - Salida de mercaderías
- `PLANILLA_PROVISION` - Provisión mensual de planilla (gastos y obligaciones)

#### 2️⃣ **Reglas Contables** ⚙️
Definen **cómo se genera cada línea** del asiento:
- **Lado**: DEBE o HABER
- **Tipo de Cuenta**: CAJA, PROVEEDORES, CLIENTES, etc.
- **Tipo de Monto**: BASE, IGV, TOTAL, etc.
- **Orden**: Secuencia de las líneas
- **Condición**: (Opcional) Reglas condicionales

#### 3️⃣ **Mapeos de Tipos de Cuenta** 🗺️
Conectan **tipos abstractos** con **cuentas reales** de tu plan contable:
- `CAJA` → `10.10 - Caja`
- `PROVEEDORES` → `42.12 - Proveedores`
- `CLIENTES` → `12.1 - Cuentas por cobrar comerciales – Terceros` ⚠️ **NO usar 12.10 (ese es Bancos)**
- etc.

---

## 🍎 Explicación Simple: Eventos y Reglas

### 🍎 ¿Qué es un Evento?

Un **evento** es algo que pasa en tu negocio y necesita un asiento contable.

**Ejemplos de eventos:**
- 🛒 **COMPRA**: Compraste algo a un proveedor
- 💰 **VENTA**: Vendiste algo a un cliente
- 💳 **PAGO**: Pagaste a un proveedor
- 💵 **COBRO**: Cobraste de un cliente

Cada evento necesita **reglas** que le dicen al sistema: "Cuando pase esto, crea un asiento así".

---

### 🍎 ¿Qué es una Regla?

Una **regla** es una instrucción que dice:
- **Qué cuenta usar** (ej: CAJA, PROVEEDORES, CLIENTES)
- **En qué lado ponerla** (DEBE o HABER)
- **Qué monto usar** (BASE, IGV, TOTAL, etc.)
- **En qué orden** (1, 2, 3...)

**Ejemplo de regla:**
> "Cuando haya una COMPRA, pon PROVEEDORES en el HABER con el TOTAL"

---

### 🍎 Conceptos Importantes Explicados

#### 1️⃣ **LADO: DEBE vs HABER**

En contabilidad, cada asiento tiene dos lados que deben ser iguales:

```
DEBE (Izquierda)          HABER (Derecha)
─────────────────        ─────────────────
Aumenta Activos          Disminuye Activos
Disminuye Pasivos        Aumenta Pasivos
Disminuye Ingresos       Aumenta Ingresos
Aumenta Gastos           Disminuye Gastos
```

**Regla simple:**
- **DEBE**: Lo que entra, lo que gastas, lo que debes
- **HABER**: Lo que sale, lo que ganas, lo que te deben

**Ejemplo práctico - COMPRA:**
```
DEBE:                    HABER:
─────────────────        ─────────────────
Gasto de compras 1000    Proveedores 1180
IGV por pagar 180
─────────────────        ─────────────────
Total: 1180              Total: 1180
```

---

#### 2️⃣ **TIPO DE CUENTA**

Es el **tipo abstracto** de cuenta que usarás. No es el código real, sino una categoría:

| Tipo de Cuenta | Significa | Ejemplo Real |
|----------------|-----------|--------------|
| `CAJA` | Dinero en efectivo | 10.10 - Caja |
| `BANCO` | Dinero en banco | 10.20 - Banco |
| `CLIENTES` | Te deben dinero | 12.1 - Cuentas por cobrar comerciales – Terceros |
| `PROVEEDORES` | Debes dinero | 42.12 - Proveedores |
| `IGV_CREDITO` | IGV que debes pagar | 40.11 - IGV por pagar |
| `IGV_DEBITO` | IGV que te deben | 40.11 - IGV por cobrar |
| `GASTO_COMPRAS` | Gasto por compras | 60.11 - Gasto de compras |
| `INGRESO_VENTAS` | Ingreso por ventas | 70.10 - Ventas |
| `GASTO_PERSONAL` | Gastos de personal (planillas) | 62.10 - Remuneraciones |
| `REMUNERACIONES_POR_PAGAR` | Sueldos por pagar | 41.10 - Sueldos por Pagar |
| `TRIBUTOS_POR_PAGAR` | Tributos laborales por pagar | 40.20 - Tributos laborales |
| `APORTES_POR_PAGAR` | Aportes empleador por pagar | 46.10 - Aportes sociales por pagar |

**Importante:** Estos tipos se **mapean** a cuentas reales de tu plan contable.

---

#### 3️⃣ **TIPO DE MONTO**

Es **qué valor usar** de los datos que le das al motor:

| Tipo de Monto | Significa | Ejemplo |
|---------------|-----------|---------|
| `BASE` | Monto sin IGV | Si total es 1180, base = 1000 |
| `IGV` | Solo el IGV | Si total es 1180, IGV = 180 |
| `TOTAL` | Base + IGV | Si total es 1180, total = 1180 |
| `DESCUENTO` | Descuento aplicado | 50, 100, etc. |
| `COSTO` | Costo de la operación | Para inventarios |
| `CANTIDAD` | Cantidad de unidades | 10, 20, 100 unidades |
| `TOTAL_GASTO` | Gasto total planilla | Provisión planilla |
| `NETO_TRABAJADOR` | Neto a pagar al trabajador | Provisión planilla |
| `DESCUENTOS_TRABAJADOR` | Tributos descontados (AFP, IR) | Provisión planilla |
| `APORTES_EMPLEADOR` | Aportes del empleador | Provisión planilla |

**Ejemplo práctico - COMPRA con total 1180:**
```
Regla 1: DEBE → GASTO_COMPRAS → BASE
  → Usa 1000 (el base sin IGV)

Regla 2: DEBE → IGV_CREDITO → IGV
  → Usa 180 (solo el IGV)

Regla 3: HABER → PROVEEDORES → TOTAL
  → Usa 1180 (el total completo)
```

---

#### 4️⃣ **ORDEN**

El **orden** es la secuencia en que se ejecutan las reglas. Es como los pasos de una receta:

```
Orden 1: Primero haz esto
Orden 2: Luego haz esto
Orden 3: Finalmente haz esto
```

**¿Por qué importa el orden?**
- Aunque técnicamente el orden no afecta el resultado final
- Es útil para organizar y entender el asiento
- Facilita la lectura del asiento generado

**Ejemplo - COMPRA:**
```
Orden 1: DEBE → GASTO_COMPRAS → BASE
Orden 2: DEBE → IGV_CREDITO → IGV
Orden 3: HABER → PROVEEDORES → TOTAL
```

---

#### 5️⃣ **CONDICIÓN (Opcional)**

Una **condición** es una regla que solo se aplica si se cumple algo.

**Ejemplo:**
```
Regla: DEBE → INVENTARIO → BASE
Condición: afecta_stock == True
```

Esto significa: "Solo aplica esta regla si `afecta_stock` es `True`"

**Casos de uso:**
- Si la compra afecta inventario → usa cuenta INVENTARIO
- Si no afecta inventario → usa cuenta GASTO_COMPRAS

---

## 🍎 Configuración Paso a Paso

### Paso 1: Acceder al Motor de Asientos

1. Ve al menú **Contabilidad** → **Motor de Asientos**
2. Verás 4 pestañas:
   - 📄 **Eventos**: Gestiona los tipos de eventos
   - ⚙️ **Reglas**: Define las reglas contables
   - 🗺️ **Mapeos**: Configura los mapeos de cuentas
   - 🧪 **Probar**: Prueba la generación de asientos

### Paso 2: Inicializar Eventos y Reglas Predeterminadas

Si es la primera vez, verás un botón **"Inicializar Motor de Asientos"**:

1. Haz clic en **"Inicializar Predeterminados"**
2. Esto creará automáticamente:
   - ✅ 4 eventos: COMPRA, VENTA, PAGO, COBRO
   - ✅ 10 reglas contables básicas

**Ejemplo de reglas creadas para COMPRA:**
```
Regla 1: DEBE → GASTO_COMPRAS → BASE (orden 1)
Regla 2: DEBE → IGV_CREDITO → IGV (orden 2)
Regla 3: HABER → PROVEEDORES → TOTAL (orden 3)
```

### Paso 3: Configurar Mapeos de Cuentas 🗺️

Los mapeos conectan tipos abstractos con tus cuentas reales.

⚠️ **IMPORTANTE - Corrección de Códigos PCGE:**
- `CLIENTES` debe mapearse a `12.1` (Cuentas por cobrar comerciales – Terceros)
- **NO** usar `12.10` para Clientes (ese código es para Bancos según PCGE)
- `BANCO` debe mapearse a `10.20`, `10.21`, etc. (NO a 12.10)

#### Opción A: Mapeo Automático (Recomendado) ⚡

1. Ve a la pestaña **"Mapeos"**
2. Haz clic en **"Mapear Todos Automáticamente"**
3. El sistema buscará automáticamente las cuentas por:
   - ✅ Código de cuenta (ej: busca "10.10" para CAJA)
   - ✅ Nombre de cuenta (ej: busca "caja" en el nombre)
   - ✅ Tipo de cuenta contable (Activo, Pasivo, etc.)

**Resultado esperado:**
```
✅ CAJA → 10.10 - Caja
✅ PROVEEDORES → 42.12 - Proveedores
✅ CLIENTES → 12.1 - Cuentas por cobrar comerciales – Terceros
✅ IGV_CREDITO → 40.11 - IGV por pagar
...
```

⚠️ **IMPORTANTE:** 
- `CLIENTES` debe mapearse a `12.1` (Cuentas por cobrar comerciales)
- **NO** usar `12.10` para Clientes (ese código es para Bancos según PCGE)

#### Opción B: Mapeo Manual 📝

Si el mapeo automático no encuentra una cuenta:

1. Haz clic en el botón **"+"** o **"Editar"** junto al tipo de cuenta
2. Selecciona la cuenta contable real de la lista
3. El sistema mostrará **sugerencias automáticas** ordenadas por relevancia
4. Haz clic en una sugerencia para seleccionarla
5. Guarda el mapeo

#### Opción C: Mapeo Individual Automático 🎯

Para un tipo específico:

1. Haz clic en el ícono **⚡** junto al tipo de cuenta sin mapear
2. El sistema intentará encontrarlo automáticamente
3. Si no lo encuentra, mostrará sugerencias

### Paso 4: Crear Reglas para un Evento ⚙️

Las reglas definen cómo se genera el asiento. Vamos a crear reglas paso a paso:

#### Ejemplo Completo: Crear Reglas para COMPRA

**Situación:** Cuando compras algo por 1180 (1000 base + 180 IGV), quieres:
- Registrar el gasto de compra (1000)
- Registrar el IGV (180)
- Registrar la deuda con el proveedor (1180)

**Paso 1: Crear Regla 1 - Gasto de Compras**
1. Ve a **Reglas** → Selecciona evento **COMPRA**
2. Haz clic en **"Nueva Regla"**
3. Completa:
   - **Lado:** `DEBE` (porque es un gasto)
   - **Tipo de Cuenta:** `GASTO_COMPRAS` (tipo abstracto)
   - **Tipo de Monto:** `BASE` (solo el monto sin IGV)
   - **Orden:** `1` (primera regla)
   - **Condición:** (deja vacío, siempre aplica)
4. Guarda

**Paso 2: Crear Regla 2 - IGV**
1. Haz clic en **"Nueva Regla"** nuevamente
2. Completa:
   - **Lado:** `DEBE` (el IGV también va al debe)
   - **Tipo de Cuenta:** `IGV_CREDITO` (IGV que debes pagar)
   - **Tipo de Monto:** `IGV` (solo el IGV)
   - **Orden:** `2` (segunda regla)
3. Guarda

**Paso 3: Crear Regla 3 - Proveedores**
1. Haz clic en **"Nueva Regla"** nuevamente
2. Completa:
   - **Lado:** `HABER` (porque aumentas tu deuda)
   - **Tipo de Cuenta:** `PROVEEDORES` (tipo abstracto)
   - **Tipo de Monto:** `TOTAL` (el monto completo que debes)
   - **Orden:** `3` (tercera regla)
3. Guarda

**Resultado:**
Cuando generes un asiento de COMPRA con base=1000, igv=180, total=1180:
```
DEBE:                    HABER:
─────────────────        ─────────────────
Gasto de compras 1000    Proveedores 1180
IGV por pagar 180
─────────────────        ─────────────────
Total: 1180              Total: 1180
✅ Cuadra perfectamente
```

---

### Paso 5: Verificar y Ajustar Reglas (Opcional) ⚙️

Si necesitas personalizar las reglas:

1. Ve a la pestaña **"Reglas"**
2. Filtra por evento (ej: COMPRA)
3. Edita o crea nuevas reglas según tus necesidades

**Ejemplo de regla con condición:**
```
Evento: COMPRA
Lado: DEBE
Tipo de Cuenta: INVENTARIO
Tipo de Monto: BASE
Orden: 1
Condición: afecta_stock == True
```

**Explicación:** Esta regla solo se aplica si en los datos de operación viene `afecta_stock: true`

### Paso 5: Probar el Motor 🧪

Antes de usar en producción, prueba la generación:

1. Ve a la pestaña **"Probar"**
2. Selecciona un evento (ej: COMPRA)
3. Ingresa los datos:
   - Base: 1000
   - IGV: 180
   - Total: 1180
   - Fecha: 2025-01-15
   - Glosa: "Prueba de compra"
4. Haz clic en **"Generar Asiento de Prueba"**
5. Verifica que:
   - ✅ El asiento se genera correctamente
   - ✅ Las cuentas son las correctas
   - ✅ El asiento cuadra (Debe = Haber)

---

## 🍎 Ejemplos Prácticos

### Ejemplo 1: Compra con IGV

**Datos de entrada:**
```python
evento_tipo = "COMPRA"
datos = {
    "base": 1000.00,
    "igv": 180.00,
    "total": 1180.00
}
```

**Asiento generado:**
```
DEBE:
  60.11 - Gasto de compras        1,000.00
  40.11 - IGV por pagar             180.00
HABER:
  42.12 - Proveedores             1,180.00
```

**Reglas aplicadas:**
1. DEBE → GASTO_COMPRAS → BASE (1000)
2. DEBE → IGV_CREDITO → IGV (180)
3. HABER → PROVEEDORES → TOTAL (1180)

---

### Ejemplo 2: Venta con IGV

**Datos de entrada:**
```python
evento_tipo = "VENTA"
datos = {
    "base": 2000.00,
    "igv": 360.00,
    "total": 2360.00
}
```

**Asiento generado:**
```
DEBE:
  12.1 - Cuentas por cobrar comerciales – Terceros  2,360.00
HABER:
  70.10 - Ventas                  2,000.00
  40.11 - IGV por cobrar            360.00
```

**Reglas aplicadas:**
1. DEBE → CLIENTES → TOTAL (2360)
2. HABER → INGRESO_VENTAS → BASE (2000)
3. HABER → IGV_DEBITO → IGV (360)

---

### Ejemplo 3: Pago a Proveedor

**Datos de entrada:**
```python
evento_tipo = "PAGO"
datos = {
    "total": 1180.00
}
```

**Asiento generado:**
```
DEBE:
  42.12 - Proveedores             1,180.00
HABER:
  10.10 - Caja                    1,180.00
```

**Reglas aplicadas:**
1. DEBE → PROVEEDORES → TOTAL (1180)
2. HABER → CAJA → TOTAL (1180)

---

## 🍎 Tipos de Cuenta Disponibles

El motor reconoce estos tipos de cuenta abstractos:

### Activos 💰
- `CAJA` - Caja y efectivo
- `BANCO` - Cuentas bancarias
- `CLIENTES` - Cuentas por cobrar
- `INVENTARIO` - Mercaderías
- `ACTIVO_FIJO` - Inmuebles, maquinaria, equipos

### Pasivos 📋
- `PROVEEDORES` - Cuentas por pagar
- `IGV_CREDITO` - IGV por pagar
- `IGV_DEBITO` - IGV por cobrar
- `DETRACCIONES` - Detracciones

### Patrimonio 🏛️
- `CAPITAL` - Capital social
- `RESERVAS` - Reservas
- `RESULTADOS` - Utilidades/Pérdidas

### Ingresos 📈
- `INGRESO_VENTAS` - Ventas
- `INGRESO_OTROS` - Otros ingresos

### Gastos 📉
- `GASTO_COMPRAS` - Compras
- `GASTO_VENTAS` - Gastos de ventas
- `COSTO_VENTAS` - Costo de ventas
- `GASTO_OTROS` - Otros gastos

---

## 🍎 Tipos de Monto

Los tipos de monto definen **qué valor usar** de los datos de entrada:

- `BASE` - Monto base (sin IGV)
- `IGV` - Monto del IGV
- `TOTAL` - Monto total (base + IGV)
- `DESCUENTO` - Descuento aplicado
- `COSTO` - Costo de la operación
- `CANTIDAD` - Cantidad de unidades

---

## 🍎 Uso en el Código

### Desde Python (Backend)

#### Uso Directo del Motor

```python
from app.infrastructure.unit_of_work import UnitOfWork
from app.application.services_journal_engine import MotorAsientos

# Crear motor
uow = UnitOfWork()
motor = MotorAsientos(uow)

# Generar asiento
asiento = motor.generar_asiento(
    evento_tipo="COMPRA",
    datos_operacion={
        "base": 1000.00,
        "igv": 180.00,
        "total": 1180.00
    },
    company_id=1,
    fecha="2025-01-15",
    glosa="Compra de mercaderías",
    currency="PEN",
    exchange_rate=1.0
)

# Guardar cambios
uow.commit()
```

#### Simulación (Sin Persistir)

```python
# Simular asiento sin guardarlo
resultado = motor.simular_asiento(
    evento_tipo="COMPRA",
    datos_operacion={"base": 1000.00, "igv": 180.00, "total": 1180.00},
    company_id=1,
    fecha="2025-01-15",
    glosa="Prueba"
)

print(f"Total Debe: {resultado['total_debit']}")
print(f"Total Haber: {resultado['total_credit']}")
print(f"Cuadra: {resultado['cuadra']}")
```

### Integración en Módulos del Sistema

El motor se integra automáticamente en los siguientes módulos:

#### 1. Compras (`backend/app/application/services_pe.py`)

```python
def registrar_compra(uow, *, company_id, doc_type, series, number, 
                     issue_date, supplier_id, currency, base, glosa, 
                     usar_motor=True):
    """
    Registra una compra con asiento automático.
    
    Si usar_motor=True (default), usa el Motor de Asientos.
    Si falla o usar_motor=False, usa método legacy (plantillas hardcodeadas).
    """
    if usar_motor:
        try:
            motor = MotorAsientos(uow)
            entry = motor.generar_asiento(
                evento_tipo="COMPRA",
                datos_operacion={
                    "base": float(base),
                    "igv": float(igv_amount),
                    "total": float(total_amount)
                },
                company_id=company_id,
                fecha=issue_date,
                glosa=glosa_final,
                currency=currency
            )
        except (MotorAsientosError, CuentaNoMapeadaError):
            # Fallback a método legacy
            lines = pe.plant_compra_igv(base, glosa)
            entry = _post(uow, company_id, issue_date, currency, lines, ...)
```

**Ubicación:** `backend/app/api/routers/compras.py` → `post_compra()`  
**Servicio:** `backend/app/application/services_integration.py` → `registrar_compra_con_asiento()`

#### 2. Ventas (`backend/app/application/services_pe.py`)

```python
def registrar_venta(uow, *, company_id, doc_type, series, number,
                   issue_date, customer_id, currency, base, glosa,
                   usar_motor=True):
    """
    Registra una venta con asiento automático.
    """
    if usar_motor:
        try:
            motor = MotorAsientos(uow)
            entry = motor.generar_asiento(
                evento_tipo="VENTA",
                datos_operacion={
                    "base": float(base),
                    "igv": float(igv_amount),
                    "total": float(total_amount)
                },
                company_id=company_id,
                fecha=issue_date,
                glosa=glosa_final,
                currency=currency
            )
        except (MotorAsientosError, CuentaNoMapeadaError):
            # Fallback a método legacy
            lines = pe.plant_venta_igv(base, glosa)
            entry = _post(uow, company_id, issue_date, currency, lines, ...)
```

**Ubicación:** `backend/app/api/routers/ventas.py` → `post_venta()`  
**Servicio:** `backend/app/application/services_integration.py` → `registrar_venta_con_asiento()`

#### 3. Pagos y Cobros (`backend/app/application/services_payments.py`)

```python
def registrar_cobro(uow, company_id, sale_id, amount, payment_date, ...):
    """
    Registra un cobro de cliente con asiento automático.
    """
    try:
        motor = MotorAsientos(uow)
        # Determinar tipo de cuenta según método de pago
        tipo_caja = "CAJA" if payment_method in ['EFECTIVO', 'YAPE', 'PLIN'] else "BANCO"
        
        entry = motor.generar_asiento(
            evento_tipo="COBRO",
            datos_operacion={
                "total": float(amount),
                "tipo_caja": tipo_caja,
                "cash_account_code": cash_account_code
            },
            company_id=company_id,
            fecha=payment_date,
            glosa=glosa,
            currency="PEN"
        )
    except (MotorAsientosError, CuentaNoMapeadaError):
        # Fallback a método legacy
        entry_lines = [...]
        entry = _post(uow, ...)
```

**Ubicación:** `backend/app/application/services_payments.py`  
**Funciones:** `registrar_cobro()`, `registrar_pago()`

#### 4. Inventarios (`backend/app/application/services_inventario.py`)

```python
def registrar_entrada_inventario(uow, company_id, product_id, quantity, 
                                 unit_cost, movement_date, ...):
    """
    Registra entrada de inventario con asiento automático.
    """
    # El motor se usa para eventos ENTRADA_INVENTARIO y SALIDA_INVENTARIO
    motor = MotorAsientos(uow)
    entry = motor.generar_asiento(
        evento_tipo="ENTRADA_INVENTARIO",
        datos_operacion={
            "costo": float(total_cost),
            "cantidad": float(quantity),
            "product_id": product_id
        },
        company_id=company_id,
        fecha=movement_date,
        glosa=f"Entrada de inventario - {reference}",
        currency="PEN"
    )
```

**Ubicación:** `backend/app/api/routers/inventarios.py` → `create_movimiento()`

### Patrón de Integración

Todos los módulos siguen el mismo patrón:

1. **Intento con Motor**: Intenta usar `MotorAsientos.generar_asiento()`
2. **Fallback Legacy**: Si falla (no hay reglas/mapeos), usa plantillas hardcodeadas
3. **Parámetro `usar_motor`**: Permite desactivar el motor si es necesario

```python
# Patrón estándar
if usar_motor:
    try:
        motor = MotorAsientos(uow)
        entry = motor.generar_asiento(...)
    except (MotorAsientosError, CuentaNoMapeadaError):
        # Fallback a legacy
        entry = metodo_legacy(...)
else:
    entry = metodo_legacy(...)
```

### Desde el Frontend (API)

#### Simulación de Asiento

```typescript
import { generarAsientoPrueba } from '@/api'

// Simula un asiento sin crearlo realmente
const result = await generarAsientoPrueba(
  empresaId,
  'COMPRA',
  {
    base: 1000,
    igv: 180,
    total: 1180
  },
  '2025-01-15',
  'Compra de mercaderías'
)

console.log(result.simulacion) // true
console.log(result.cuadra) // true/false
console.log(result.lineas) // Array de líneas
```

**Endpoint:** `POST /journal-engine/simular-asiento`  
**No persiste datos** - Solo simula la generación

---

## 🍎 Troubleshooting

### ❌ Error: "Cuenta no mapeada"

**Problema:** El tipo de cuenta no tiene un mapeo configurado.

**Solución:**
1. Ve a **Motor de Asientos** → **Mapeos**
2. Busca el tipo de cuenta sin mapear (aparecerá en rojo)
3. Haz clic en **⚡** para mapeo automático o **+** para mapeo manual
4. Selecciona la cuenta correcta

---

### ❌ Error: "Asiento no cuadra"

**Problema:** La suma del Debe no coincide con el Haber.

**Posibles causas:**
- Reglas mal configuradas
- Tipos de monto incorrectos
- Datos de entrada inconsistentes

**Solución:**
1. Revisa las reglas del evento en la pestaña **Reglas**
2. Verifica que los tipos de monto sean correctos
3. Usa la pestaña **Probar** para depurar

---

### ❌ Error: "Evento contable no encontrado"

**Problema:** El evento no existe para la empresa.

**Solución:**
1. Ve a **Motor de Asientos** → **Eventos**
2. Si no hay eventos, haz clic en **"Inicializar Predeterminados"**
3. O crea un nuevo evento manualmente

---

### ⚠️ El mapeo automático no encuentra cuentas

**Problema:** No hay cuentas que coincidan con los patrones.

**Solución:**
1. Verifica que tengas cuentas creadas en tu plan contable
2. Usa el mapeo manual y revisa las sugerencias
3. Asegúrate de que las cuentas estén activas

---

## 🍎 Mejores Prácticas

### ✅ DO (Hacer)

- ✅ Inicializa los eventos predeterminados primero
- ✅ Usa el mapeo automático como punto de partida
- ✅ Prueba el motor antes de usar en producción
- ✅ Revisa periódicamente que los mapeos sean correctos
- ✅ Documenta reglas personalizadas

### ❌ DON'T (No hacer)

- ❌ No modifiques reglas sin entenderlas
- ❌ No mapees tipos de cuenta a cuentas incorrectas
- ❌ No uses el motor sin configurar los mapeos
- ❌ No ignores errores de mapeo

---

## 🍎 Flujo de Trabajo Recomendado

```
1. Inicializar Motor
   └─> Crear eventos y reglas predeterminadas

2. Configurar Mapeos
   └─> Mapear automáticamente todos los tipos
   └─> Revisar y corregir mapeos manualmente si es necesario

3. Probar Motor
   └─> Generar asientos de prueba
   └─> Verificar que cuadren correctamente

4. Usar en Producción
   └─> Integrar con módulos de compras/ventas
   └─> Monitorear asientos generados
```

---

## 🍎 Cómo Agregar un Nuevo Tipo de Evento

### Método 1: Desde la Interfaz (Recomendado)

1. Ve a **Motor de Asientos** → Pestaña **Eventos**
2. Haz clic en el botón **"Nuevo Evento"**
3. Completa el formulario:
   - **Tipo**: 
     - Selecciona uno de los tipos predefinidos del menú desplegable, O
     - Escribe un tipo personalizado (ej: `DEVOLUCION_COMPRA`, `NOTA_CREDITO`, `AJUSTE_SALDO`)
     - ⚠️ **Importante**: Usa MAYÚSCULAS y guiones bajos (`_`) para separar palabras
   - **Nombre**: Nombre descriptivo (ej: "Devolución de Compra", "Nota de Crédito")
   - **Descripción**: (Opcional) Explicación detallada del evento
4. Haz clic en **"Guardar"**

### Método 2: Agregar al Enum (Para Desarrolladores)

Si quieres que el tipo aparezca en la lista predefinida:

1. Edita `backend/app/domain/models_journal_engine.py`
2. Agrega el nuevo tipo al enum `EventoContableType`:

```python
class EventoContableType(str, Enum):
    # ... tipos existentes ...
    DEVOLUCION_COMPRA = "DEVOLUCION_COMPRA"
    NOTA_CREDITO = "NOTA_CREDITO"
    # etc.
```

3. (Opcional) Agrega el tipo a `EVENTOS_PREDEFINIDOS` en `frontend/src/pages/MotorAsientos.tsx`:

```typescript
const EVENTOS_PREDEFINIDOS = [
  'COMPRA', 'VENTA', 'PAGO', 'COBRO', 
  'AJUSTE_INVENTARIO', 'ENTRADA_INVENTARIO', 'SALIDA_INVENTARIO',
  'DEVOLUCION_COMPRA', 'NOTA_CREDITO'  // Nuevos tipos
]
```

### Después de Crear el Evento

Una vez creado el evento, necesitas:

1. **Crear Reglas**: Ve a la pestaña **Reglas** y crea las reglas que definen cómo se genera el asiento
2. **Configurar Mapeos**: Asegúrate de que los tipos de cuenta usados en las reglas estén mapeados
3. **Probar**: Usa la pestaña **Probar** para verificar que el asiento se genera correctamente

### Ejemplo: Crear Evento "DEVOLUCION_COMPRA"

**Paso 1: Crear el Evento**
- Tipo: `DEVOLUCION_COMPRA`
- Nombre: "Devolución de Compra"
- Descripción: "Registra devoluciones de compras a proveedores"

**Paso 2: Crear Reglas**
```
Regla 1: HABER → PROVEEDORES → TOTAL (orden 1)
Regla 2: DEBE → GASTO_COMPRAS → BASE (orden 2)
Regla 3: DEBE → IGV_CREDITO → IGV (orden 3)
```

**Paso 3: Verificar Mapeos**
- Asegúrate de que PROVEEDORES, GASTO_COMPRAS e IGV_CREDITO estén mapeados

**Paso 4: Probar**
- Ve a la pestaña **Probar**
- Selecciona evento: `DEVOLUCION_COMPRA`
- Ingresa datos: base=1000, igv=180, total=1180
- Verifica que el asiento cuadre

---

## 🍎 Preguntas Frecuentes

### ¿Puedo crear eventos personalizados?

✅ Sí, puedes crear eventos personalizados desde la pestaña **Eventos**. Puedes usar tipos predefinidos o escribir tu propio tipo personalizado.

### ¿Puedo tener múltiples reglas para el mismo evento?

✅ Sí, puedes tener tantas reglas como necesites. El orden se define con el campo **Orden**.

### ¿Qué pasa si cambio un mapeo?

⚠️ Los asientos ya generados no se modifican. Solo afecta a los nuevos asientos.

### ¿Puedo desactivar una regla sin eliminarla?

✅ Sí, cada regla tiene un campo **Activo** que puedes desactivar.

### ¿El motor calcula el IGV automáticamente?

✅ Sí, si configuras el tipo de monto como `IGV` y proporcionas la tasa en la configuración.

---

## 🍎 Recursos Adicionales

- **Archivo de implementación:** `backend/app/application/services_journal_engine.py`
- **Servicio de mapeo automático:** `backend/app/application/services_journal_engine_auto_map.py`
- **Inicialización:** `backend/app/application/services_journal_engine_init.py`
- **Router API:** `backend/app/api/routers/journal_engine.py`
- **Interfaz:** `frontend/src/pages/MotorAsientos.tsx`

---

## 🍎 Conclusión

El Motor de Asientos es una herramienta poderosa que automatiza la generación de asientos contables. Con una configuración adecuada, puedes:

- ✅ Reducir errores manuales
- ✅ Ahorrar tiempo
- ✅ Mantener consistencia contable
- ✅ Escalar fácilmente

¡Configura el motor una vez y disfruta de asientos automáticos! 🎉

---

---

## Planillas (Provisiones)

SISCONT **no calcula** planillas; solo **registra contablemente** el resultado.

**Evento:** PLANILLA_PROVISION  
**Mapeos:** GASTO_PERSONAL→62.10, REMUNERACIONES_POR_PAGAR→41.10, TRIBUTOS_POR_PAGAR→40.20, APORTES_POR_PAGAR→46.10  
**Reglas:** DEBE GASTO_PERSONAL TOTAL_GASTO; HABER REMUNERACIONES_POR_PAGAR NETO_TRABAJADOR; HABER TRIBUTOS_POR_PAGAR DESCUENTOS_TRABAJADOR; HABER APORTES_POR_PAGAR APORTES_EMPLEADOR

---

**Última actualización:** Enero 2025  
**Versión:** 1.0

