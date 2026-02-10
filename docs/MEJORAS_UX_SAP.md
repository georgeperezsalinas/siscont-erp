# 🎨 Plan de Mejoras UX - Basado en SAP/Oracle Financials

**Última actualización:** Febrero 2026

## 📊 Estado de Implementación

| Mejora | Estado | Notas |
|--------|--------|-------|
| Badges de estado (DRAFT, POSTED, REVERSED) | ✅ Implementado | StatusBadge.tsx, en lista de asientos |
| Correlativo visible | ✅ Implementado | Formato XX-XXXXX en tabla |
| Filtros (estado, fecha, glosa, correlativo) | ✅ Implementado | Incluye has_warnings, has_errors |
| Panel de trazabilidad | ✅ Implementado | TraceabilityPanel.tsx, created_by, posted_by, integrity_hash |
| Búsqueda por correlativo | ✅ Implementado | correlative_search en filtros |
| Postear DRAFT, Revertir POSTED | ✅ Implementado | Modales de confirmación con advertencias |
| Tabs Detalle/Líneas/Trazabilidad/Validaciones | ✅ Implementado | En vista de asiento |
| Indicador de integridad (hash) | ✅ Implementado | En TraceabilityPanel |
| Búsqueda avanzada (modal completo) | ⏳ Parcial | Filtros básicos existentes, modal avanzado pendiente |
| Dashboard de asientos (resumen) | ❌ Pendiente | |
| Validación en tiempo real (balance al escribir) | ⏳ Parcial | validateJournalEntry existe, integración en formulario parcial |

---

## 📋 Objetivo

Mejorar la experiencia de usuario de la pantalla de Asientos para que sea comparable con los mejores sistemas contables del mundo (SAP, Oracle Financials, Dynamics 365).

---

## 🎯 Principios de Diseño SAP

1. **Información contextual visible**: Mostrar toda la información relevante sin necesidad de clics adicionales
2. **Indicadores visuales claros**: Estados, advertencias y errores deben ser inmediatamente visibles
3. **Trazabilidad accesible**: Información de auditoría siempre disponible
4. **Validación en tiempo real**: Feedback inmediato al usuario
5. **Navegación intuitiva**: Flujos claros y predecibles

---

## 🚀 Mejoras Propuestas

### 1. **Vista de Lista Mejorada**

#### Estado Actual
- Lista básica con información limitada
- Estados no muy visibles
- Trazabilidad oculta

#### Mejora Propuesta (SAP Style)
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 📊 ASIENTOS CONTABLES                                    [🔍 Buscar] [➕ Nuevo] │
├─────────────────────────────────────────────────────────────────────────────┤
│ Filtros: [Periodo ▼] [Fecha Desde] [Fecha Hasta] [Estado ▼] [Origen ▼]    │
│          [⚠️ Con Advertencias] [❌ Con Errores] [🔍 Búsqueda Avanzada]      │
├─────────────────────────────────────────────────────────────────────────────┤
│ #    │ Correlativo │ Fecha    │ Libro    │ Glosa              │ Total      │
│      │             │          │          │                    │            │
│ 548  │ 01-02-00012 │ 01/02/26 │ Ventas   │ Venta 01-F001-3    │ S/ 14,160  │
│      │             │          │          │                    │            │
│      │ 🟢 POSTED   │ 👤 Juan  │ 📅 08/02 │ ⚠️ 2 advertencias  │ [👁️] [📋] │
│      │             │          │          │                    │            │
│ 549  │ 01-02-00013 │ 01/02/26 │ Compras  │ Compra 01-F001-381 │ S/ 7,080   │
│      │             │          │          │                    │            │
│      │ 🟡 DRAFT    │ 👤 María │ 📅 08/02 │ ✅ Sin advertencias│ [✏️] [🗑️] │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Características:**
- ✅ **Badges de estado**: 🟢 POSTED, 🟡 DRAFT, 🔴 REVERSED, ⚫ CANCELLED
- ✅ **Trazabilidad visible**: Usuario creador, fecha de creación
- ✅ **Indicadores de validación**: ⚠️ Advertencias, ❌ Errores, ✅ OK
- ✅ **Correlativo destacado**: Número estructurado visible
- ✅ **Acciones contextuales**: Botones según estado (DRAFT: editar/eliminar, POSTED: ver/revertir)

#### Implementación
```tsx
// Componente mejorado de fila
const EntryRow = ({ entry }) => (
  <tr className="hover:bg-gray-50">
    <td>{entry.id}</td>
    <td>
      <Badge variant="outline" className="font-mono">
        {entry.correlative}
      </Badge>
    </td>
    <td>{formatDate(entry.date)}</td>
    <td>
      <Badge variant="secondary">{getLibroName(entry.origin)}</Badge>
    </td>
    <td className="max-w-md truncate">{entry.glosa}</td>
    <td className="text-right font-semibold">
      {formatCurrency(entry.total_debit)}
    </td>
    <td>
      <div className="flex items-center gap-2">
        <StatusBadge status={entry.status} />
        {entry.validation_warnings?.length > 0 && (
          <Tooltip>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            <TooltipContent>
              {entry.validation_warnings.length} advertencias
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </td>
    <td>
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <User className="h-3 w-3" />
        {entry.created_by?.name}
        <Calendar className="h-3 w-3 ml-2" />
        {formatDate(entry.created_at)}
      </div>
    </td>
    <td>
      <EntryActions entry={entry} />
    </td>
  </tr>
)
```

---

### 2. **Panel de Trazabilidad (SAP Style)**

#### Estado Actual
- Información de trazabilidad oculta o difícil de acceder

#### Mejora Propuesta
Panel lateral o modal con pestañas tipo SAP:

```
┌─────────────────────────────────────────────────────────┐
│ 📋 ASIENTO #548 - 01-02-00012                    [✕]   │
├─────────────────────────────────────────────────────────┤
│ [📝 Detalle] [🔍 Trazabilidad] [📊 Validaciones] [📜 Log]│
├─────────────────────────────────────────────────────────┤
│ 🔍 TRAZABILIDAD                                          │
│                                                          │
│ 👤 Creado por:     Juan Pérez                            │
│ 📅 Fecha creación: 08/02/2026 10:30:15                  │
│                                                          │
│ ✏️ Modificado por:  María García                        │
│ 📅 Última modificación: 08/02/2026 14:20:30             │
│                                                          │
│ ✅ Posteado por:    Juan Pérez                           │
│ 📅 Fecha posteo:    08/02/2026 14:25:00                 │
│                                                          │
│ 🔐 Hash de Integridad:                                   │
│    a3f5b2c1d4e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6 │
│    [🔍 Verificar Integridad]                             │
│                                                          │
│ 🔄 Reversión:                                            │
│    Este asiento no ha sido revertido                    │
│                                                          │
│ 📊 Historial de Cambios:                                 │
│    • 08/02/2026 14:20:30 - Modificado por María García  │
│    • 08/02/2026 10:30:15 - Creado por Juan Pérez         │
└─────────────────────────────────────────────────────────┘
```

**Características:**
- ✅ **Pestañas organizadas**: Detalle, Trazabilidad, Validaciones, Log
- ✅ **Información completa**: Todos los campos de trazabilidad visibles
- ✅ **Verificación de integridad**: Botón para verificar hash
- ✅ **Historial de cambios**: Timeline de modificaciones
- ✅ **Relación de reversión**: Si está revertido, mostrar asiento original

---

### 3. **Indicadores Visuales de Estado**

#### Badges de Estado (SAP Style)
```tsx
const StatusBadge = ({ status }) => {
  const variants = {
    DRAFT: { 
      icon: FileEdit, 
      color: "bg-yellow-100 text-yellow-800 border-yellow-300",
      label: "Borrador"
    },
    POSTED: { 
      icon: CheckCircle, 
      color: "bg-green-100 text-green-800 border-green-300",
      label: "Posteado"
    },
    REVERSED: { 
      icon: RotateCcw, 
      color: "bg-red-100 text-red-800 border-red-300",
      label: "Revertido"
    },
    CANCELLED: { 
      icon: XCircle, 
      color: "bg-gray-100 text-gray-800 border-gray-300",
      label: "Cancelado"
    }
  }
  
  const variant = variants[status] || variants.DRAFT
  
  return (
    <Badge className={`${variant.color} flex items-center gap-1`}>
      <variant.icon className="h-3 w-3" />
      {variant.label}
    </Badge>
  )
}
```

---

### 4. **Validación en Tiempo Real**

#### Estado Actual
- Validación solo al guardar

#### Mejora Propuesta
```tsx
// Validación mientras se escribe
const [validationState, setValidationState] = useState({
  isBalanced: false,
  errors: [],
  warnings: [],
  suggestions: []
})

useEffect(() => {
  if (form.lines.length >= 2) {
    validateEntryDebounced(form)
  }
}, [form.lines])

// Indicador visual en tiempo real
<div className="flex items-center gap-2">
  {validationState.isBalanced ? (
    <CheckCircle className="h-5 w-5 text-green-500" />
  ) : (
    <AlertCircle className="h-5 w-5 text-red-500" />
  )}
  <span className={validationState.isBalanced ? "text-green-600" : "text-red-600"}>
    {validationState.isBalanced ? "Balanceado" : "No balanceado"}
  </span>
</div>

// Panel de advertencias visible
{validationState.warnings.length > 0 && (
  <Alert variant="warning">
    <AlertTriangle className="h-4 w-4" />
    <AlertTitle>Advertencias</AlertTitle>
    <AlertDescription>
      <ul>
        {validationState.warnings.map((w, i) => (
          <li key={i}>{w.message}</li>
        ))}
      </ul>
    </AlertDescription>
  </Alert>
)}
```

---

### 5. **Vista de Detalle Mejorada con Tabs**

#### Estructura SAP Style
```tsx
<Tabs defaultValue="detail" className="w-full">
  <TabsList>
    <TabsTrigger value="detail">
      <FileText className="h-4 w-4 mr-2" />
      Detalle
    </TabsTrigger>
    <TabsTrigger value="lines">
      <List className="h-4 w-4 mr-2" />
      Líneas ({entry.lines.length})
    </TabsTrigger>
    <TabsTrigger value="traceability">
      <User className="h-4 w-4 mr-2" />
      Trazabilidad
    </TabsTrigger>
    <TabsTrigger value="validation">
      <Shield className="h-4 w-4 mr-2" />
      Validaciones
      {entry.validation_warnings?.length > 0 && (
        <Badge variant="warning" className="ml-2">
          {entry.validation_warnings.length}
        </Badge>
      )}
    </TabsTrigger>
    <TabsTrigger value="log">
      <FileCode className="h-4 w-4 mr-2" />
      Log del Motor
      {entry.motor_metadata?.engine_log && (
        <Badge variant="info" className="ml-2">Disponible</Badge>
      )}
    </TabsTrigger>
</Tabs>
```

---

### 6. **Búsqueda Avanzada (SAP Style)**

#### Modal de Búsqueda Avanzada
```
┌─────────────────────────────────────────────────────────┐
│ 🔍 BÚSQUEDA AVANZADA DE ASIENTOS                  [✕]   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ 📅 Rango de Fechas:                                      │
│    Desde: [01/01/2026]  Hasta: [31/12/2026]             │
│                                                          │
│ 👤 Usuario:                                              │
│    Creado por: [Todos ▼]                                 │
│    Posteado por: [Todos ▼]                              │
│                                                          │
│ 📊 Estado:                                               │
│    ☑ DRAFT  ☑ POSTED  ☐ REVERSED  ☐ CANCELLED          │
│                                                          │
│ 📁 Origen:                                               │
│    ☑ VENTAS  ☑ COMPRAS  ☑ MANUAL  ☑ TESORERIA          │
│                                                          │
│ 💰 Monto:                                                │
│    Desde: [_______]  Hasta: [_______]                   │
│                                                          │
│ 🔍 Texto:                                                │
│    Buscar en glosa: [________________]                   │
│    Buscar en correlativo: [________]                     │
│                                                          │
│ ⚠️ Filtros Especiales:                                   │
│    ☐ Solo con advertencias                              │
│    ☐ Solo con errores                                   │
│    ☐ Solo reversiones                                   │
│    ☐ Solo asientos manuales                             │
│                                                          │
│           [Limpiar]              [Buscar]                 │
└─────────────────────────────────────────────────────────┘
```

---

### 7. **Indicadores de Integridad**

#### Verificación de Hash
```tsx
const IntegrityIndicator = ({ entry }) => {
  const [verified, setVerified] = useState<boolean | null>(null)
  
  const verifyIntegrity = async () => {
    const result = await verifyEntryIntegrity(entry.id)
    setVerified(result.isValid)
  }
  
  return (
    <div className="flex items-center gap-2">
      {verified === null ? (
        <>
          <Shield className="h-4 w-4 text-gray-400" />
          <Button variant="ghost" size="sm" onClick={verifyIntegrity}>
            Verificar Integridad
          </Button>
        </>
      ) : verified ? (
        <>
          <CheckCircle className="h-4 w-4 text-green-500" />
          <span className="text-green-600 text-sm">Integridad verificada</span>
        </>
      ) : (
        <>
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <span className="text-red-600 text-sm">Integridad comprometida</span>
        </>
      )}
    </div>
  )
}
```

---

### 8. **Vista de Reversiones**

#### Mostrar Relación de Reversión
```tsx
const ReversalInfo = ({ entry }) => {
  if (!entry.reversed_entry_id) return null
  
  return (
    <Alert>
      <RotateCcw className="h-4 w-4" />
      <AlertTitle>Asiento Revertido</AlertTitle>
      <AlertDescription>
        Este asiento revierte el asiento #{entry.reversed_entry_id}
        <Button variant="link" onClick={() => viewEntry(entry.reversed_entry_id)}>
          Ver asiento original
        </Button>
      </AlertDescription>
    </Alert>
  )
}
```

---

### 9. **Mejoras en Formulario de Creación/Edición**

#### Indicadores Visuales
- ✅ **Balance en tiempo real**: Mostrar diferencia Debe - Haber
- ✅ **Validación de cuentas**: Autocompletado con validación
- ✅ **Sugerencias inteligentes**: Basadas en asientos similares
- ✅ **Plantillas visuales**: Preview de plantillas antes de aplicar
- ✅ **Confirmación de advertencias**: Modal para confirmar advertencias antes de postear

---

### 10. **Dashboard de Asientos (Opcional)**

#### Vista Resumen Tipo SAP
```
┌─────────────────────────────────────────────────────────┐
│ 📊 RESUMEN DE ASIENTOS - Febrero 2026                  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ 📈 Estadísticas:                                        │
│    Total de asientos: 125                               │
│    🟢 Posteados: 120  🟡 Borradores: 5                  │
│    Total Debe: S/ 1,250,000                            │
│    Total Haber: S/ 1,250,000                            │
│                                                          │
│ ⚠️ Advertencias:                                        │
│    Asientos con advertencias: 8                         │
│    [Ver detalles]                                       │
│                                                          │
│ 📅 Por Origen:                                           │
│    Ventas: 45  Compras: 30  Manual: 20  Otros: 30      │
│                                                          │
│ 👤 Por Usuario:                                          │
│    Juan Pérez: 50  María García: 40  Otros: 35         │
└─────────────────────────────────────────────────────────┘
```

---

## 🛠️ Implementación Técnica

### Componentes Nuevos a Crear

1. **`StatusBadge.tsx`**: Badge de estado con iconos
2. **`TraceabilityPanel.tsx`**: Panel de trazabilidad completo
3. **`IntegrityIndicator.tsx`**: Indicador de integridad
4. **`AdvancedSearchModal.tsx`**: Modal de búsqueda avanzada
5. **`EntryDetailTabs.tsx`**: Tabs para vista de detalle
6. **`ReversalInfo.tsx`**: Información de reversión
7. **`RealTimeValidation.tsx`**: Validación en tiempo real
8. **`EntryDashboard.tsx`**: Dashboard de resumen

### APIs Necesarias

1. **`GET /journal/entries/{id}/traceability`**: Trazabilidad completa
2. **`POST /journal/entries/{id}/verify-integrity`**: Verificar hash
3. **`GET /journal/entries/advanced-search`**: Búsqueda avanzada
4. **`GET /journal/entries/stats`**: Estadísticas de asientos

---

## 📊 Priorización

### Fase 1 (Alta Prioridad)
1. ✅ Badges de estado visuales
2. ✅ Panel de trazabilidad
3. ✅ Validación en tiempo real
4. ✅ Indicadores de advertencias/errores

### Fase 2 (Media Prioridad)
5. ✅ Búsqueda avanzada
6. ✅ Vista de detalle con tabs
7. ✅ Indicadores de integridad
8. ✅ Vista de reversiones

### Fase 3 (Baja Prioridad)
9. ✅ Dashboard de asientos
10. ✅ Mejoras adicionales de UX

---

## 🎨 Guía de Estilos

### Colores de Estado
- **DRAFT**: Amarillo (`yellow-100`, `yellow-800`)
- **POSTED**: Verde (`green-100`, `green-800`)
- **REVERSED**: Rojo (`red-100`, `red-800`)
- **CANCELLED**: Gris (`gray-100`, `gray-800`)

### Iconos (Lucide React)
- **DRAFT**: `FileEdit`
- **POSTED**: `CheckCircle`
- **REVERSED**: `RotateCcw`
- **CANCELLED**: `XCircle`
- **Advertencia**: `AlertTriangle`
- **Error**: `AlertCircle`
- **Trazabilidad**: `User`, `Calendar`
- **Integridad**: `Shield`

---

## 📝 Notas

- Todas las mejoras deben mantener la funcionalidad existente
- Los componentes deben ser reutilizables
- La UX debe ser consistente con el resto de la aplicación
- Considerar accesibilidad (ARIA labels, keyboard navigation)

