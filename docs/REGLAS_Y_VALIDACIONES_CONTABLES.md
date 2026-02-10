# Reglas y Validaciones Contables

## 1. Sistema de Reglas de Validación

Validación tipo IA para asientos: INCOMPATIBLE, REQUIRED_PAIR, SUGGESTION, WARNING.
Patrones: `10.*`, `10.11`, etc.
Reglas de compatibilidad: cuentas que se usan juntas frecuentemente.

## 2. Validaciones para Anular Asientos

| Caso | Bloquea | Acción |
|------|---------|--------|
| Ya anulado | Sí | "El asiento ya está anulado" |
| Período cerrado | Sí | Administrador debe reabrir período |
| Líneas conciliadas | Sí | Revertir conciliación primero |
| Relacionado con Compra | Sí | Eliminar/modificar compra primero |
| Relacionado con Venta | Sí | Eliminar/modificar venta primero |
| Relacionado con Inventario | Sí | Revertir movimiento primero |
| Sin permisos | Sí | Requiere ADMINISTRADOR o CONTADOR |
