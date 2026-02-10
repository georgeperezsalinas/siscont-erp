# Quality Assurance - Motor de Asientos

Esta carpeta contiene los tests unitarios y de integración para el Motor de Asientos Contables.

## Estructura

```
qa/
├── __init__.py
├── conftest.py              # Configuración global de pytest
├── test_motor_asientos.py   # Tests principales del motor
└── README.md                # Este archivo
```

## Tests Implementados

### ✅ Tests de Eventos

1. **COMPRA**
   - ✅ Con IGV
   - ✅ Sin IGV (exonerado)
   - ✅ Con descuento

2. **VENTA**
   - ✅ Con IGV
   - ✅ Sin IGV (exonerado)

3. **PAGO**
   - ✅ Con CAJA
   - ✅ Con BANCO

4. **COBRO**
   - ✅ Con CAJA
   - ✅ Con BANCO

### ✅ Property Tests

- ✅ **Test de Partida Doble**: Todos los asientos generados deben cuadrar (Debe == Haber)
- ✅ **Test de Mapeo**: Si falta un tipo crítico → `CuentaNoMapeadaError`

### ✅ Tests de Validaciones

- ✅ Período cerrado → `PeriodoCerradoError`
- ✅ Cuenta inactiva → `CuentaInactivaError`
- ✅ Naturaleza incorrecta → `ValidacionNaturalezaError`
- ✅ IGV_CREDITO solo Activo
- ✅ IGV_DEBITO solo Pasivo

## Ejecutar Tests

```bash
# Desde el directorio backend/
pytest qa/ -v

# Ejecutar un test específico
pytest qa/test_motor_asientos.py::TestMotorAsientosCOMPRA::test_compra_con_igv -v

# Con cobertura
pytest qa/ --cov=app.application.services_journal_engine --cov-report=html
```

## Cobertura Objetivo

- **Mínimo**: 80% de cobertura en `services_journal_engine.py`
- **Ideal**: 90%+ de cobertura

## Notas

- Los tests usan mocks para no requerir una base de datos real
- Los fixtures configuran eventos, reglas y mapeos de prueba
- Todos los tests validan que los asientos cuadren (partida doble)

## Próximos Tests a Agregar

- [ ] Tests de integración con base de datos real
- [ ] Tests de rendimiento (carga de muchos asientos)
- [ ] Tests de reglas con condiciones complejas
- [ ] Tests de mapeo automático con scores
- [ ] Tests de trazabilidad (metadata, hash_contexto)

