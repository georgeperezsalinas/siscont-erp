# Módulo de Asientos Manuales

## Estados (SAP Style)

- **DRAFT**: Editable, no contabilizado
- **POSTED**: Inmutable, contabilizado (solo reversible)
- **REVERSED**: Revertido
- **CANCELLED**: Cancelado

## Validaciones

**Hard:** Cuadre, cuentas activas, período abierto, IGV correcto, POSTED inmutable
**Warning:** Mezcla IGV/tesorería, cuentas resultado sin documento
**Archivo:** services_journal_validation.py

## Endpoints

- POST /journal/manual/draft, PUT /journal/manual/{id}, POST /journal/manual/{id}/post, POST /journal/manual/{id}/reverse
- Asientos sistema: /journal/system/equity, opening, bank-funds, results-closing

## Trazabilidad

created_by, posted_by, reversed_by, integrity_hash (SHA-256)
