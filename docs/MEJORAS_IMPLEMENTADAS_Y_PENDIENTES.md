# Mejoras Implementadas y Pendientes

**Última actualización:** Febrero 2026

## Funcionalidades Implementadas (SAP-style)

- **Motor de Asientos**: Centralizado, reglas configurables, multi-evento
- **Correlativos secuenciales**: Formato XX-XX-XXXXX, sin saltos
- **Trazabilidad**: created_by, posted_by, reversed_by, integrity_hash
- **Estados**: DRAFT, POSTED, REVERSED, CANCELLED
- **Validaciones**: Balance cuadrado, cuentas activas, IGV correcto, POSTED inmutable
- **Asientos manuales**: Crear borrador, postear, revertir
- **Asientos de sistema**: Patrimonio, Apertura, Cierre resultados
- **Detracciones**: Cálculo automático en ventas
- **Conciliación bancaria**: Matching manual, auto-match, historial, finalizar
- **Gestión documental**: Upload, asociación a compras/ventas, OCR/extracción on-demand

## Mejoras UX (ver MEJORAS_UX_SAP.md)

**Implementadas:** StatusBadge, TraceabilityPanel, correlativo, filtros (estado, fechas, glosa, correlativo, has_warnings, has_errors), postear/revertir con confirmación  
**Pendientes:** Modal de búsqueda avanzada completo, dashboard de asientos, validación en tiempo real en formulario

## Código Hardcodeado Pendiente

- **services_payments.py**: Fallback con 12.10, 42.12 (eliminar cuando motor configurado)
- **peru_igv.py**: Plantillas deprecated, usar MotorAsientos
- **peru_inventario.py**: plant_entrada/salida_inventario
- **services_inventario.py**: Migrar a motor
