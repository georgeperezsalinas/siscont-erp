# Evaluación del Módulo de Inventario

## Estado Actual vs Requisitos

### ✅ LO QUE ESTÁ IMPLEMENTADO

1. **Modelos básicos:**
   - ✅ Product (parcial - falta `maneja_stock`)
   - ✅ InventoryMovement (parcial - falta `almacen_id`, falta tipo AJUSTE)

2. **Servicios:**
   - ✅ `registrar_entrada_inventario` (usa motor de asientos)
   - ✅ `registrar_salida_inventario` (usa motor de asientos)
   - ✅ `calcular_stock_actual` (pero sin almacén)

3. **Motor de asientos:**
   - ✅ Integrado para ENTRADA_INVENTARIO
   - ✅ Integrado para SALIDA_INVENTARIO
   - ❌ Falta AJUSTE_INVENTARIO

### ❌ LO QUE FALTA

1. **Modelos:**
   - ❌ Almacén (Warehouse)
   - ❌ Stock (por producto y almacén)
   - ⚠️ Product.maneja_stock (agregado pero falta migración)
   - ⚠️ MovimientoInventario.almacen_id (agregado pero falta migración)
   - ⚠️ MovimientoInventario.tipo AJUSTE (agregado pero falta migración)

2. **Servicios:**
   - ❌ `ajustar_stock` (ajuste de inventario)
   - ❌ Cálculo de stock por almacén
   - ❌ Kardex (histórico de movimientos)
   - ⚠️ Refactorizar a `InventarioService` con métodos requeridos

3. **Eventos contables:**
   - ❌ AJUSTE_INVENTARIO (evento y reglas)

4. **Endpoints:**
   - ❌ POST /inventario/ajuste
   - ❌ GET /inventario/kardex
   - ❌ GET /inventario/stock (por almacén)

5. **Validaciones:**
   - ❌ Validar que producto maneja_stock
   - ❌ Validar que almacén existe
   - ❌ Validar stock suficiente en salidas
   - ❌ Validar periodo contable abierto

## Plan de Implementación

### Fase 1: Modelos y Migración ✅ (EN PROGRESO)
- [x] Crear modelo Almacén
- [x] Crear modelo Stock
- [x] Actualizar Product con maneja_stock
- [x] Actualizar MovimientoInventario con almacen_id y tipo AJUSTE
- [ ] Crear migración Alembic

### Fase 2: Eventos Contables
- [ ] Crear evento AJUSTE_INVENTARIO
- [ ] Crear reglas para AJUSTE_INVENTARIO (sobrante y faltante)

### Fase 3: Servicios Refactorizados
- [ ] Crear InventarioService
- [ ] Implementar registrar_entrada (con almacén)
- [ ] Implementar registrar_salida (con almacén)
- [ ] Implementar ajustar_stock
- [ ] Implementar cálculo de stock por almacén
- [ ] Implementar Kardex

### Fase 4: Endpoints API
- [ ] POST /inventario/entrada
- [ ] POST /inventario/salida
- [ ] POST /inventario/ajuste
- [ ] GET /inventario/kardex
- [ ] GET /inventario/stock

### Fase 5: Validaciones
- [ ] Validar maneja_stock
- [ ] Validar almacén existe
- [ ] Validar stock suficiente
- [ ] Validar periodo abierto

## Notas de Implementación

- Los modelos están creados pero necesitan migración
- Se mantiene compatibilidad con código existente usando aliases
- El motor de asientos ya está integrado para ENTRADA y SALIDA
- Falta implementar AJUSTE_INVENTARIO en el motor

