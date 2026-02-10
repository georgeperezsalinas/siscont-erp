# Guía Completa de Conciliación Bancaria

## 1. Configurar Cuenta Bancaria

1. **Conciliación Bancaria** → **Nueva Cuenta Bancaria**
2. **Cuenta Contable:** Selecciona 10.10, 10.11, etc. (no usar nivel 1)
3. **Nombre del Banco, Número de Cuenta, Moneda**
4. Crear

**Importante:** La cuenta debe coincidir con la usada en pagos/cobros.

---

## 2. Selección de Cuenta en Pagos y Cobros

**Automática:** EFECTIVO/YAPE/PLIN → Caja (10.1x). TRANSFERENCIA/CHEQUE/TARJETA → Bancos (10.2x).

**Manual (múltiples cuentas):** Selecciona la cuenta específica en el formulario de pago/cobro para que coincida con Conciliación Bancaria.

---

## 3. Cargar Extracto y Conciliar

1. Selecciona cuenta bancaria y período
2. **Cargar Extracto** (JSON o manual)
3. Realiza el **matching** entre transacciones bancarias y líneas contables
4. **Finalizar** conciliación

---

## 4. Historial y Reversión

- **Ver historial:** Botón "Mostrar Historial" en la sección de conciliaciones
- **Detalle:** Clic en "Ver" para ver transacción + línea contable
- **Revertir:** Botón "Revertir" → la transacción vuelve a pendiente
- **Indicadores:** ⚠ diferencia de montos (amarillo)

---

## 5. Solución de Problemas

| Problema | Solución |
|----------|----------|
| Asientos no aparecen | Verificar que la cuenta del pago/cobro coincida con la cuenta bancaria configurada |
| Diferencia de montos | Revisar si es redondeo (<0.01) o error de registro |
| Transacciones duplicadas | El sistema previene: una transacción solo con una línea |

---

## 6. Endpoints API

- `GET /bank-reconciliation/reconciled-matches/{bank_account_id}?period_id={id}`
- `GET /bank-reconciliation/reconciled-match-detail/{bank_transaction_id}`
- `DELETE /bank-reconciliation/match/{bank_transaction_id}` (revertir)

---

## 7. Datos de Prueba

```
POST /bank-reconciliation/generate-test-data?bank_account_id=1&period_id=1
```

Crea asientos y extracto para probar el matching.
