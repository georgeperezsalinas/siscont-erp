# Instrucciones para Cargar Extractos Bancarios

## Formatos Soportados

El sistema acepta extractos bancarios en dos formatos:

### 1. Formato JSON (Recomendado)

El formato JSON es el más completo y permite especificar todos los detalles del extracto.

**Estructura del archivo JSON:**

```json
{
  "bank_account_id": 1,
  "period_id": 1,
  "statement_date": "2025-01-31",
  "opening_balance": 10000.00,
  "closing_balance": 13050.00,
  "transactions": [
    {
      "transaction_date": "2025-01-05",
      "description": "Pago a proveedor ABC SAC",
      "reference": "CHQ-001",
      "debit": 1500.00,
      "credit": 0.00,
      "balance": 8500.00
    }
  ]
}
```

**Campos requeridos:**

- `bank_account_id`: ID de la cuenta bancaria configurada en el sistema
- `period_id`: ID del período contable (ej: Enero 2025)
- `statement_date`: Fecha del extracto (formato: YYYY-MM-DD)
- `opening_balance`: Saldo inicial del extracto
- `closing_balance`: Saldo final del extracto
- `transactions`: Array de transacciones

**Para cada transacción:**

- `transaction_date`: Fecha de la transacción (formato: YYYY-MM-DD)
- `description`: Descripción de la transacción
- `reference`: Referencia (número de cheque, transferencia, etc.) - Opcional (puede ser `null`)
- `debit`: Monto del débito (retiro) - 0.00 si es crédito
- `credit`: Monto del crédito (depósito) - 0.00 si es débito
- `balance`: Saldo después de la transacción

**Ejemplo completo:** Ver archivo `extracto_bancario_ejemplo.json`

### 2. Formato CSV

El formato CSV es más simple y fácil de exportar desde Excel o sistemas bancarios.

**Estructura del archivo CSV:**

```csv
Fecha,Descripción,Referencia,Débito,Crédito,Saldo
2025-01-05,Pago a proveedor ABC SAC,CHQ-001,1500.00,0.00,8500.00
2025-01-08,Cobro de cliente XYZ EIRL,TRF-001,0.00,2500.00,11000.00
```

**Columnas requeridas (en este orden):**

1. `Fecha`: Fecha de la transacción (formato: YYYY-MM-DD)
2. `Descripción`: Descripción de la transacción
3. `Referencia`: Referencia (puede estar vacía)
4. `Débito`: Monto del débito (0.00 si es crédito)
5. `Crédito`: Monto del crédito (0.00 si es débito)
6. `Saldo`: Saldo después de la transacción

**Notas importantes para CSV:**

- La primera fila debe contener los encabezados
- Las fechas deben estar en formato YYYY-MM-DD
- Los montos deben usar punto (.) como separador decimal
- Si una referencia está vacía, déjala en blanco
- El archivo debe estar codificado en UTF-8

**Ejemplo completo:** Ver archivo `extracto_bancario_ejemplo.csv`

## Cómo Obtener los IDs Necesarios

### Obtener `bank_account_id`:

1. Ve a la página de **Conciliación Bancaria**
2. Selecciona la cuenta bancaria que quieres usar
3. El ID aparece en la URL o puedes verlo en la consola del navegador (F12)

### Obtener `period_id`:

1. Ve a la página de **Períodos** o **Asientos Contables**
2. Busca el período correspondiente (ej: Enero 2025)
3. El ID aparece en la URL o en la lista de períodos

**Alternativa:** Puedes usar la API para obtener estos IDs:

```bash
# Obtener cuentas bancarias
GET /bank-reconciliation/bank-accounts?company_id=1

# Obtener períodos
GET /periods?company_id=1
```

## Pasos para Cargar un Extracto

### Opción 1: Desde la Interfaz Web (Recomendado)

1. Ve a **Conciliación Bancaria**
2. Selecciona la cuenta bancaria y el período
3. Haz clic en **"Cargar Extracto Bancario"**
4. Selecciona el formato (JSON o CSV)
5. Sube el archivo o pega el contenido
6. Completa los campos adicionales si es necesario:
   - Fecha del extracto
   - Saldo inicial
   - Saldo final
7. Haz clic en **"Cargar Extracto"**

### Opción 2: Usando la API Directamente

**Para JSON:**

```bash
POST /bank-reconciliation/upload-statement
Content-Type: application/json

{
  "bank_account_id": 1,
  "period_id": 1,
  "statement_date": "2025-01-31",
  "opening_balance": 10000.00,
  "closing_balance": 13050.00,
  "transactions": [...]
}
```

**Para CSV:**

1. Convierte el CSV a JSON usando un script o herramienta
2. O usa el endpoint de carga de archivos (si está implementado)

## Validaciones

El sistema valida:

- ✅ Que la cuenta bancaria exista
- ✅ Que el período exista y esté abierto
- ✅ Que las fechas estén en formato correcto
- ✅ Que los montos sean números válidos
- ✅ Que el saldo final coincida con el último saldo calculado (tolerancia de 0.01)

## Errores Comunes

### Error: "Cuenta bancaria no encontrada"
- Verifica que el `bank_account_id` sea correcto
- Asegúrate de que la cuenta bancaria esté activa

### Error: "Período no encontrado"
- Verifica que el `period_id` sea correcto
- Asegúrate de que el período esté abierto (no cerrado)

### Error: "Formato de fecha inválido"
- Usa el formato YYYY-MM-DD (ej: 2025-01-31)
- No uses formatos como DD/MM/YYYY o MM-DD-YYYY

### Error: "Saldo no coincide"
- Verifica que el saldo final del extracto coincida con el último saldo calculado
- Revisa que todas las transacciones estén correctamente registradas
- El sistema permite una tolerancia de 0.01 para diferencias de redondeo

## Consejos

1. **Exporta desde tu banco**: La mayoría de bancos permiten exportar extractos en CSV o Excel
2. **Revisa antes de cargar**: Verifica que todas las transacciones estén correctas
3. **Usa referencias**: Incluye números de cheque, transferencias, etc. para facilitar el matching
4. **Mantén consistencia**: Usa el mismo formato de descripción para facilitar el matching automático
5. **Carga periódicamente**: Carga los extractos mensualmente para mantener la conciliación al día

## Ejemplos de Descripciones

Para facilitar el matching automático, usa descripciones consistentes:

**Buenas descripciones:**
- "Pago a proveedor ABC SAC - Factura F001-0001"
- "Cobro de cliente XYZ EIRL - Factura E001-0005"
- "Transferencia recibida - Cliente ABC"
- "Cheque 001234 - Pago servicios"

**Descripciones a evitar:**
- "PAGO" (muy genérico)
- "TRANSFERENCIA" (sin detalles)
- "DEPOSITO" (sin referencia)

## Soporte

Si tienes problemas al cargar un extracto:

1. Verifica el formato del archivo
2. Revisa los logs del sistema
3. Contacta al administrador del sistema

