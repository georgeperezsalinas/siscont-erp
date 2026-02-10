# Mejoras Pendientes - Motor de Asientos

## 🔴 PROBLEMA 3 - eval() en condiciones (Riesgo Controlado)

### Estado Actual
El método `_evaluar_condicion()` en `services_journal_engine.py` usa `eval()` para evaluar condiciones de reglas.

**Código actual:**
```python
def _evaluar_condicion(self, condicion: str, datos: Dict[str, Any]) -> bool:
    contexto = {k: v for k, v in datos.items()}
    return eval(condicion, {"__builtins__": {}}, contexto)
```

### Riesgo
- Aunque está aislado (`{"__builtins__": {}}`), sigue siendo `eval()`
- Las reglas vienen de la base de datos
- Riesgo aumenta con multi-tenant abierto

### Solución Recomendada

**Opción 1: Usar `asteval` (Recomendado)**
```python
from asteval import Interpreter

def _evaluar_condicion(self, condicion: str, datos: Dict[str, Any]) -> bool:
    aeval = Interpreter(usersyms=datos)
    try:
        return bool(aeval(condicion))
    except Exception:
        return False
```

**Opción 2: Mini DSL (Más seguro)**
```python
import re
import operator

OPERATORS = {
    '==': operator.eq,
    '!=': operator.ne,
    '>': operator.gt,
    '<': operator.lt,
    '>=': operator.ge,
    '<=': operator.le,
    'in': lambda a, b: a in b,
    'not in': lambda a, b: a not in b,
}

def _evaluar_condicion(self, condicion: str, datos: Dict[str, Any]) -> bool:
    # Parsear: "campo == valor", "campo > valor", etc.
    # Solo permitir operadores seguros
    # ...
```

**Opción 3: `simpleeval` (Balanceado)**
```python
from simpleeval import simple_eval

def _evaluar_condicion(self, condicion: str, datos: Dict[str, Any]) -> bool:
    try:
        return bool(simple_eval(condicion, names=datos))
    except Exception:
        return False
```

### Prioridad
- **No es crítico hoy** (está aislado)
- **Sí antes de multi-tenant abierto**
- **Recomendación:** Implementar en próxima iteración

---

## 🟡 MEJORAS CLAVE

### Mejora 1 - Cache de Reglas y Mapeos

**Problema:**
- Consultas a BD cada vez que se genera un asiento
- Impacto en rendimiento con muchos asientos

**Solución:**
```python
from functools import lru_cache
from typing import Tuple

class MotorAsientos:
    @lru_cache(maxsize=128)
    def _obtener_reglas_cached(self, evento_id: int, company_id: int) -> Tuple:
        # Retornar tupla para que sea cacheable
        reglas = self._obtener_reglas(evento_id, company_id)
        return tuple((r.id, r.orden, r.tipo_cuenta, r.lado, r.tipo_monto, r.condicion) for r in reglas)
    
    @lru_cache(maxsize=128)
    def _resolver_cuenta_cached(self, tipo_cuenta: str, company_id: int) -> Optional[int]:
        # Cachear account_id en lugar del objeto completo
        cuenta = self._resolver_cuenta(tipo_cuenta, company_id)
        return cuenta.id if cuenta else None
```

**Invalidación de cache:**
- Invalidar cuando se crea/edita/elimina regla
- Invalidar cuando se crea/edita/elimina mapeo
- TTL de 5 minutos como fallback

**Impacto:**
- ✅ Mejor rendimiento
- ✅ Menor carga en BD
- ⚠️ Requiere invalidación cuidadosa

---

### Mejora 2 - TipoCuentaMapeo con Metadata

**Problema:**
- No se puede auditar auto-mapeos
- No se puede pedir confirmación al usuario
- No se puede entrenar IA luego

**Solución:**
Agregar campos a `TipoCuentaMapeo`:

```python
class TipoCuentaMapeo(Base):
    # ... campos existentes ...
    score_origen: Mapped[float | None] = mapped_column(Float, nullable=True)  # Score del auto-mapeo
    auto_mapeado: Mapped[bool] = mapped_column(Boolean, default=False)  # Si fue auto-mapeado
    fecha_mapeo: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)  # Cuándo se mapeó
    confirmado_por_usuario: Mapped[bool] = mapped_column(Boolean, default=False)  # Si el usuario confirmó
    usuario_confirmacion_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
```

**Uso:**
- Al auto-mapear: guardar `score_origen`, `auto_mapeado=True`, `fecha_mapeo=now()`
- Si score < 80%: `confirmado_por_usuario=False`, pedir confirmación
- Al confirmar: `confirmado_por_usuario=True`, `usuario_confirmacion_id=user.id`

**Beneficios:**
- ✅ Auditoría completa
- ✅ Confirmación de usuario
- ✅ Datos para entrenar IA

---

### Mejora 3 - Diferenciar "Evento" vs "Documento"

**Problema Actual:**
- `evento = VENTA` (genérico)
- No se diferencia entre FACTURA, BOLETA, NOTA DE CRÉDITO

**Solución:**
Agregar campo `documento_tipo` a `EventoContable`:

```python
class EventoContable(Base):
    # ... campos existentes ...
    tipo: Mapped[str]  # COMPRA, VENTA, PAGO, COBRO
    documento_tipo: Mapped[str | None] = mapped_column(String(50), nullable=True)  # FACTURA, BOLETA, NC, ND, etc.
```

**Uso:**
- Evento: `VENTA`
- Documento: `FACTURA` | `BOLETA` | `NC` | `ND`
- Reglas pueden tener condiciones: `documento_tipo == 'FACTURA'`

**Beneficios:**
- ✅ Cumple con SUNAT/SIRE
- ✅ Permite reglas específicas por tipo de documento
- ✅ Mejor trazabilidad

**Migración:**
- Agregar campo `documento_tipo` nullable
- Para eventos existentes: `documento_tipo = None` (compatible)
- Nuevos eventos pueden especificar documento

---

## 📋 Checklist de Implementación

- [ ] **PROBLEMA 3:** Reemplazar `eval()` con `asteval` o `simpleeval`
- [ ] **MEJORA 1:** Implementar cache de reglas y mapeos
- [ ] **MEJORA 2:** Agregar metadata a `TipoCuentaMapeo`
- [ ] **MEJORA 3:** Agregar campo `documento_tipo` a `EventoContable`
- [ ] Tests para cada mejora
- [ ] Documentación actualizada

