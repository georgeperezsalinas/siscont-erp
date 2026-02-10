import { useState, useEffect } from 'react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Table, TableHeader, TableHeaderCell, TableBody, TableRow, TableCell } from '@/components/ui/Table'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { PageHeader } from '@/components/ui/PageHeader'
import { ActionBar } from '@/components/ui/ActionBar'
import { FilterBar } from '@/components/ui/FilterBar'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils'
import { Plus, Search, Filter, Download, Edit2, Trash2, FileText, CheckCircle, XCircle, Eye, ScrollText, AlertCircle, X, Building2, ShoppingCart, Paperclip, DollarSign, FileMinus, FilePlus, FileX } from 'lucide-react'
import { listCompras, createCompra, updateCompra, deleteCompra, getCompra, type CompraOut, type CompraIn, type CompraUpdate, type PurchaseLineIn, listThirdParties, createThirdParty, type ThirdParty, registrarPago, getSaldoPendienteCompra, listPagosCompra, deletePago, type PagoListItem, registrarPagoTesoreria, listMetodosPago, initMetodosPago, type MetodoPago, registrarNotaCreditoCompra, registrarNotaDebitoCompra, listNotasPorDocumento, type NotaDocumentoOut, eliminarNota, anularNota } from '@/api'
import { DocumentUpload, DocumentList, DocumentViewer, PaymentModal, type PaymentData } from '@/components/ui'
import { getPurchaseDocuments, uploadDocument, type Document } from '@/api'
import { useOrg } from '@/stores/org'
import { useAuth } from '@/stores/auth'
import { useSettings } from '@/stores/settings'

// Funciones helper fuera del componente
function getPeriodBounds(period: string): { start: string; end: string } {
  const [year, month] = period.split('-').map(Number)
  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 0) // Último día del mes
  return {
    start: startDate.toISOString().split('T')[0],
    end: endDate.toISOString().split('T')[0]
  }
}

function validateDateInPeriod(date: string, period: string): boolean {
  const bounds = getPeriodBounds(period)
  return date >= bounds.start && date <= bounds.end
}

function getPeriodFirstDay(period: string): string {
  return getPeriodBounds(period).start
}

export default function Compras() {
  const { empresaId, periodo } = useOrg()
  const { user } = useAuth()
  const [compras, setCompras] = useState<CompraOut[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingCompra, setEditingCompra] = useState<CompraOut | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<CompraOut | null>(null)
  const [messageModal, setMessageModal] = useState<{ type: 'success' | 'error'; title: string; message: string } | null>(null)

  const [form, setForm] = useState<CompraIn>({
    company_id: empresaId,
    doc_type: '01',
    series: 'F001',
    number: '',
    issue_date: periodo ? getPeriodFirstDay(periodo) : new Date().toISOString().split('T')[0],
    supplier_id: 1, // TODO: Implementar selector de proveedores
    currency: 'PEN',
    lines: [{ description: '', quantity: 1, unit_price: 0 }],
    glosa: undefined, // Se genera automáticamente
  })
  const [dateError, setDateError] = useState<string>('')
  const [searchTerm, setSearchTerm] = useState('')
  const [proveedores, setProveedores] = useState<ThirdParty[]>([])
  const [showQuickAddSupplier, setShowQuickAddSupplier] = useState(false)
  const [quickSupplierForm, setQuickSupplierForm] = useState({
    tax_id: '',
    tax_id_type: 'RUC' as 'RUC' | 'DNI' | 'CE' | 'PAS',
    name: '',
  })
  const [quickSupplierErrors, setQuickSupplierErrors] = useState<Record<string, string>>({})
  const [showDocuments, setShowDocuments] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)
  const [documentListRefreshKey, setDocumentListRefreshKey] = useState(0)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedCompraForPayment, setSelectedCompraForPayment] = useState<CompraOut | null>(null)
  const [saldoPendiente, setSaldoPendiente] = useState<number | null>(null)
  const [saldosPendientes, setSaldosPendientes] = useState<Record<number, number>>({}) // compra_id -> saldo_pendiente
  const [showDocumentsModal, setShowDocumentsModal] = useState(false)
  const [selectedCompraForDocuments, setSelectedCompraForDocuments] = useState<CompraOut | null>(null)
  const [registerPaymentImmediately, setRegisterPaymentImmediately] = useState(false) // Registrar pago automáticamente al crear
  const [showPagosModal, setShowPagosModal] = useState(false)
  const [selectedCompraForPagos, setSelectedCompraForPagos] = useState<CompraOut | null>(null)
  const [pagos, setPagos] = useState<PagoListItem[]>([])
  const [loadingPagos, setLoadingPagos] = useState(false)
  const [metodosPago, setMetodosPago] = useState<MetodoPago[]>([])
  const [showNotaModal, setShowNotaModal] = useState(false)
  const [notaTipo, setNotaTipo] = useState<'CREDITO' | 'DEBITO' | null>(null)
  const [selectedCompraForNota, setSelectedCompraForNota] = useState<CompraOut | null>(null)
  const [notas, setNotas] = useState<NotaDocumentoOut[]>([])
  const [notasPorCompra, setNotasPorCompra] = useState<Record<number, NotaDocumentoOut[]>>({}) // compra_id -> notas
  const [showNotasModal, setShowNotasModal] = useState(false)
  const [selectedCompraForNotas, setSelectedCompraForNotas] = useState<CompraOut | null>(null)
  const [notaForm, setNotaForm] = useState({
    serie: '',
    numero: '',
    fecha_emision: new Date().toISOString().split('T')[0],
    motivo: '',
    monto_base: 0,
    glosa: ''
  })

  useEffect(() => {
    if (empresaId) {
      reload()
      loadProveedores()
      loadMetodosPago()
      // Cargar configuración del sistema
      useSettings.getState().loadSettings(empresaId)
    }
  }, [empresaId, periodo])
  
  async function loadMetodosPago() {
    if (!empresaId) return
    try {
      const metodos = await listMetodosPago(empresaId)
      setMetodosPago(metodos)
      
      // Si no hay métodos, inicializar (esto también inicializará los eventos contables)
      if (metodos.length === 0 && (user?.role === 'ADMINISTRADOR' || user?.role === 'CONTADOR')) {
        try {
          await initMetodosPago(empresaId)
          const nuevosMetodos = await listMetodosPago(empresaId)
          setMetodosPago(nuevosMetodos)
        } catch (initErr: any) {
          console.error('Error inicializando métodos de pago:', initErr)
          // Si falla, intentar inicializar eventos contables directamente
          try {
            const { initJournalEngineDefaults } = await import('@/api')
            await initJournalEngineDefaults(empresaId)
          } catch (e) {
            console.error('Error inicializando eventos contables:', e)
          }
        }
      }
    } catch (err: any) {
      console.error('Error cargando métodos de pago:', err)
    }
  }

  // Cargar saldos pendientes cuando cambian las compras
  useEffect(() => {
    if (compras.length > 0) {
      loadSaldosPendientes()
      loadNotasPorCompras()
    }
  }, [compras])

  // Cargar notas para todas las compras
  async function loadNotasPorCompras() {
    if (!empresaId || compras.length === 0) return
    try {
      const notasMap: Record<number, NotaDocumentoOut[]> = {}
      await Promise.all(
        compras
          .filter(c => c.has_journal_entry)
          .map(async (compra) => {
            try {
              const notasList = await listNotasPorDocumento('COMPRA', compra.compra_id, empresaId!)
              notasMap[compra.compra_id] = notasList
            } catch (err) {
              console.error(`Error cargando notas para compra ${compra.compra_id}:`, err)
            }
          })
      )
      setNotasPorCompra(notasMap)
    } catch (err) {
      console.error('Error cargando notas:', err)
    }
  }

  // Atajos de teclado globales cuando el formulario está abierto
  useEffect(() => {
    if (!showForm) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar si estamos en un input, textarea o select (excepto ESC y Ctrl+Enter)
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
      
      // Ctrl/Cmd + Enter: Guardar (funciona siempre)
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        // Llamar a save usando una referencia actualizada
        save().catch(err => console.error('Error guardando:', err))
        return
      }

      // Si estamos en un input, solo procesar ESC y F2
      if (isInput) {
        // F2: Agregar nueva línea
        if (e.key === 'F2') {
          e.preventDefault()
          e.stopPropagation()
          addLine()
        }
        // ESC: Cancelar
        if (e.key === 'Escape' && !showQuickAddSupplier) {
          e.preventDefault()
          e.stopPropagation()
          setShowForm(false)
          setEditingCompra(null)
          setQuantityInputs({})
          setPriceInputs({})
          setDateError('')
        }
        return
      }

      // Para otros elementos:
      // F2: Agregar nueva línea
      if (e.key === 'F2') {
        e.preventDefault()
        e.stopPropagation()
        addLine()
      }
      // ESC: Cancelar
      if (e.key === 'Escape' && !showQuickAddSupplier) {
        e.preventDefault()
        e.stopPropagation()
        setShowForm(false)
        setEditingCompra(null)
        setQuantityInputs({})
        setPriceInputs({})
        setDateError('')
      }
    }

    document.addEventListener('keydown', handleKeyDown, true) // Usar capture phase
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [showForm, showQuickAddSupplier])

  async function loadProveedores() {
    if (!empresaId) return
    try {
      const data = await listThirdParties(empresaId, 'PROVEEDOR', true)
      setProveedores(data)
      // Si el supplier_id actual no está en la lista y hay proveedores, ajustar
      if (data.length > 0 && form.supplier_id === 1) {
        const exists = data.find(p => p.id === form.supplier_id)
        if (!exists) {
          setForm(f => ({ ...f, supplier_id: data[0].id }))
        }
      }
    } catch (err) {
      console.error('Error cargando proveedores:', err)
      setProveedores([])
    }
  }

  // Validaciones rápidas para crear proveedor
  function validateQuickSupplier(): boolean {
    const errors: Record<string, string> = {}
    
    if (!quickSupplierForm.tax_id || quickSupplierForm.tax_id.trim() === '') {
      errors.tax_id = `${quickSupplierForm.tax_id_type} es obligatorio`
    } else {
      if (quickSupplierForm.tax_id_type === 'RUC' && quickSupplierForm.tax_id.length !== 11) {
        errors.tax_id = 'RUC debe tener 11 dígitos'
      } else if (quickSupplierForm.tax_id_type === 'DNI' && quickSupplierForm.tax_id.length !== 8) {
        errors.tax_id = 'DNI debe tener 8 dígitos'
      }
    }
    
    if (!quickSupplierForm.name || quickSupplierForm.name.trim() === '') {
      errors.name = 'Nombre es obligatorio'
    } else if (quickSupplierForm.name.trim().length < 3) {
      errors.name = 'El nombre debe tener al menos 3 caracteres'
    }
    
    setQuickSupplierErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleQuickCreateSupplier() {
    if (!validateQuickSupplier()) {
      return
    }

    try {
      // Convertir tax_id_type a código del Catálogo 06 SUNAT
      const taxIdTypeMap: Record<string, string> = {
        'RUC': '6',
        'DNI': '1',
        'CE': '4',
        'PAS': '7'
      }
      
      const nuevoProveedor = await createThirdParty({
        company_id: empresaId,
        tax_id: quickSupplierForm.tax_id,
        tax_id_type: taxIdTypeMap[quickSupplierForm.tax_id_type] || '6',
        name: quickSupplierForm.name.trim(),
        type: 'PROVEEDOR',
        active: true,
      })
      
      // Recargar lista de proveedores
      await loadProveedores()
      
      // Seleccionar el nuevo proveedor
      setForm(f => ({ ...f, supplier_id: nuevoProveedor.id }))
      
      // Cerrar modal y limpiar
      setShowQuickAddSupplier(false)
      setQuickSupplierForm({ tax_id: '', tax_id_type: 'RUC', name: '' })
      setQuickSupplierErrors({})
      
      showMessage('success', 'Proveedor Creado', `Proveedor "${nuevoProveedor.name}" creado exitosamente. Puedes completar sus datos más tarde en la sección de Proveedores y Clientes.`)
    } catch (err: any) {
      const errorMsg = err.message || 'Error al crear proveedor'
      if (errorMsg.includes('RUC inválido') || errorMsg.includes('DNI inválido')) {
        setQuickSupplierErrors({ tax_id: errorMsg })
      } else if (errorMsg.includes('ya existe')) {
        setQuickSupplierErrors({ tax_id: errorMsg })
      } else {
        showMessage('error', 'Error', errorMsg)
      }
    }
  }

  async function reload() {
    try {
      setLoading(true)
      const data = await listCompras(empresaId, periodo)
      setCompras(data)
    } catch (err: any) {
      console.error('Error cargando compras:', err)
      setCompras([])
    } finally {
      setLoading(false)
    }
  }

  async function loadSaldosPendientes() {
    try {
      const saldos: Record<number, number> = {}
      await Promise.all(
        compras.map(async (compra) => {
          try {
            const saldo = await getSaldoPendienteCompra(compra.compra_id)
            saldos[compra.compra_id] = saldo.saldo_pendiente
          } catch (err) {
            // Si falla, asumir que el saldo es el total
            saldos[compra.compra_id] = compra.total_amount
          }
        })
      )
      setSaldosPendientes(saldos)
    } catch (err) {
      console.error('Error cargando saldos pendientes:', err)
    }
  }

  async function openEdit(compra: CompraOut) {
    setEditingCompra(compra)
    // Cargar compra completa con líneas
    try {
      const compraCompleta = await getCompra(compra.compra_id)
      setForm({
        company_id: empresaId,
        doc_type: compraCompleta.doc_type,
        series: compraCompleta.series,
        number: compraCompleta.number,
        issue_date: compraCompleta.issue_date,
        supplier_id: compraCompleta.supplier_id || (proveedores.length > 0 ? proveedores[0].id : 1),
        currency: 'PEN',
        lines: compraCompleta.lines?.map(l => ({
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price
        })) || [{ description: '', quantity: 1, unit_price: 0 }],
        glosa: undefined,
      })
    } catch (err) {
      // Fallback si no hay líneas o error al cargar
      setForm({
        company_id: empresaId,
        doc_type: compra.doc_type,
        series: compra.series,
        number: compra.number,
        issue_date: compra.issue_date,
        supplier_id: compra.supplier_id || (proveedores.length > 0 ? proveedores[0].id : 1),
        currency: 'PEN',
        lines: [{ description: 'Producto/Servicio', quantity: 1, unit_price: Number(compra.total_amount) / 1.18 }],
        glosa: undefined,
      })
    }
    setShowForm(true)
  }

  async function openDelete(compra: CompraOut) {
    setConfirmDelete(compra)
  }

  function showMessage(type: 'success' | 'error', title: string, message: string) {
    setMessageModal({ type, title, message })
  }

  async function doDelete() {
    if (!confirmDelete) return
    try {
      await deleteCompra(confirmDelete.compra_id)
      setConfirmDelete(null)
      await reload()
      showMessage('success', 'Compra Eliminada', 'La compra y su asiento contable se eliminaron exitosamente.')
    } catch (err: any) {
      showMessage('error', 'Error al Eliminar', `Error al eliminar compra: ${err.message || err}`)
    }
  }

  // Calcular totales desde líneas
  const calculateTotals = (lines: PurchaseLineIn[]) => {
    let totalBase = 0
    let totalIGV = 0
    let totalTotal = 0
    
    lines.forEach(line => {
      if (line.description.trim() && line.quantity > 0 && line.unit_price > 0) {
        const base = Math.round((line.quantity * line.unit_price) * 100) / 100
        const igv = Math.round((base * 0.18) * 100) / 100
        const total = Math.round((base + igv) * 100) / 100
        totalBase += base
        totalIGV += igv
        totalTotal += total
      }
    })
    
    return { totalBase: Math.round(totalBase * 100) / 100, totalIGV: Math.round(totalIGV * 100) / 100, totalTotal: Math.round(totalTotal * 100) / 100 }
  }

  function addLine() {
    setForm(f => ({
      ...f,
      lines: [...(f.lines || []), { description: '', quantity: 1, unit_price: 0 }]
    }))
  }

  function removeLine(index: number) {
    setForm(f => ({
      ...f,
      lines: (f.lines || []).filter((_, i) => i !== index)
    }))
  }

  function updateLine(index: number, field: keyof PurchaseLineIn, value: any) {
    setForm(f => ({
      ...f,
      lines: (f.lines || []).map((line, i) => 
        i === index ? { ...line, [field]: value } : line
      )
    }))
  }

  // Estado para valores de input en texto (para permitir escribir decimales fácilmente)
  const [quantityInputs, setQuantityInputs] = useState<Record<number, string>>({})
  const [priceInputs, setPriceInputs] = useState<Record<number, string>>({})


  // Usar la función centralizada de formateo
  function formatNumberForDisplay(value: number | undefined | null): string {
    return formatNumber(value) || ''
  }

  // Parsear número desde string usando la configuración del sistema
  function parseNumericInput(value: string): number {
    if (!value || value.trim() === '') return 0
    const { getNumberFormat } = useSettings.getState()
    const format = getNumberFormat()
    
    // Remover espacios
    let cleaned = value.replace(/\s/g, '')
    
    // Si tiene el separador decimal configurado, separar por él
    if (cleaned.includes(format.decimal)) {
      // Separar por separador decimal: parte entera (con separadores de miles) y decimal
      const [integerPart, decimalPart] = cleaned.split(format.decimal)
      // Remover separadores de miles de la parte entera
      const integerCleaned = integerPart.replace(new RegExp(`\\${format.thousand}`, 'g'), '')
      // Combinar: entero + punto + decimal
      cleaned = integerCleaned + '.' + (decimalPart || '0')
    } else if (cleaned.includes(format.thousand)) {
      // Solo tiene separadores de miles, removerlos todos
      cleaned = cleaned.replace(new RegExp(`\\${format.thousand}`, 'g'), '')
    }
    
    if (cleaned === '' || cleaned === '.' || cleaned === '-') return 0
    const parsed = parseFloat(cleaned)
    return isNaN(parsed) ? 0 : parsed
  }

  async function save() {
    if (!form.number.trim() || !form.series.trim()) {
      showMessage('error', 'Campos Requeridos', 'Debe ingresar serie y número de documento')
      return
    }

    // Validar que la fecha esté dentro del período
    if (!validateDateInPeriod(form.issue_date, periodo)) {
      const bounds = getPeriodBounds(periodo)
      setDateError(`La fecha debe estar entre ${formatDate(bounds.start)} y ${formatDate(bounds.end)} (período ${periodo})`)
      showMessage('error', 'Fecha Inválida', `La fecha de emisión debe estar dentro del período ${periodo}.\nRango válido: ${formatDate(bounds.start)} a ${formatDate(bounds.end)}`)
      return
    }
    setDateError('')
    
    // Validar líneas
    if (!form.lines || form.lines.length === 0) {
      showMessage('error', 'Líneas Requeridas', 'Debe agregar al menos una línea de detalle')
      return
    }
    
    const validLines = form.lines.filter(l => l.description.trim() && l.quantity > 0 && l.unit_price > 0)
    if (validLines.length === 0) {
      showMessage('error', 'Líneas Inválidas', 'Debe tener al menos una línea válida con descripción, cantidad y precio')
      return
    }

    try {
      if (editingCompra) {
        // Actualizar con líneas
        const updateData: CompraUpdate = {
          doc_type: form.doc_type,
          series: form.series,
          number: form.number,
          issue_date: form.issue_date,
          supplier_id: form.supplier_id,
          currency: form.currency,
          glosa: form.glosa,
          lines: validLines.map((l, idx) => ({
            line_number: idx + 1,
            description: l.description.trim(),
            quantity: l.quantity,
            unit_price: l.unit_price
          }))
        }
        await updateCompra(editingCompra.compra_id, updateData)
        setShowForm(false)
        setEditingCompra(null)
        setQuantityInputs({})
        setPriceInputs({})
        await reload()
        showMessage('success', 'Compra Actualizada', 'Compra actualizada exitosamente.')
      } else {
        // Crear con líneas
        const nuevaCompra = await createCompra({
          ...form,
          company_id: empresaId,
          lines: validLines.map((l, idx) => ({
            line_number: idx + 1,
            description: l.description.trim(),
            quantity: l.quantity,
            unit_price: l.unit_price
          }))
        })
        
        // Si está marcado registrar pago inmediatamente, hacerlo
        if (registerPaymentImmediately) {
          try {
            await registrarPago(nuevaCompra.compra_id, {
              payment_date: form.issue_date, // Usar la misma fecha de la compra
              amount: nuevaCompra.total_amount,
              cash_account_code: null, // El backend lo determinará automáticamente
              payment_method: 'EFECTIVO',
              payment_reference: null,
              notes: 'Pago registrado automáticamente al crear la compra'
            })
            await reload()
            await loadSaldosPendientes()
            showMessage('success', 'Compra y Pago Registrados', `Compra registrada exitosamente!\n\nAsiento contable generado automáticamente: #${nuevaCompra.journal_entry_id}\nPago registrado automáticamente por el monto total.\nDocumento: ${nuevaCompra.doc_type}-${nuevaCompra.series}-${nuevaCompra.number}`)
          } catch (err: any) {
            console.error('Error registrando pago automático:', err)
            showMessage('warning', 'Compra Registrada, Pago No Registrado', `Compra registrada exitosamente!\n\nAsiento contable generado automáticamente: #${nuevaCompra.journal_entry_id}\nDocumento: ${nuevaCompra.doc_type}-${nuevaCompra.series}-${nuevaCompra.number}\n\nError al registrar pago automático: ${err.message || err}`)
          }
        } else {
          // Establecer la compra creada como editingCompra para poder subir documentos
          setEditingCompra(nuevaCompra)
          // Mostrar automáticamente la sección de documentos
          setShowDocuments(true)
          // No cerrar el formulario, permitir subir documentos
          setQuantityInputs({})
          setPriceInputs({})
          setDateError('')
          await reload()
          // Usar setTimeout para asegurar que el estado se actualice antes de mostrar el mensaje
          setTimeout(() => {
            showMessage('success', 'Compra Registrada', `Compra registrada exitosamente!\n\nAsiento contable generado automáticamente: #${nuevaCompra.journal_entry_id}\nDocumento: ${nuevaCompra.doc_type}-${nuevaCompra.series}-${nuevaCompra.number}\n\nAhora puedes subir documentos adjuntos.`)
          }, 100)
        }
        
        // Resetear el checkbox
        setRegisterPaymentImmediately(false)
      }
    } catch (err: any) {
      showMessage('error', 'Error', `Error al procesar compra: ${err.message || err}`)
    }
  }

  const filteredCompras = compras.filter(c => {
    if (!searchTerm) return true
    const searchLower = searchTerm.toLowerCase()
    return (
      `${c.doc_type}-${c.series}-${c.number}`.toLowerCase().includes(searchLower) ||
      String(c.compra_id).includes(searchLower)
    )
  })

  // Mapear compras para agregar campo id que requiere DataTable
  const comprasForTable = filteredCompras.map(c => ({ ...c, id: c.compra_id })) as (CompraOut & { id: number })[]

  const total = filteredCompras.reduce((sum, c) => sum + Number(c.total_amount), 0)
  const totalIGV = filteredCompras.reduce((sum, c) => {
    const base = Number(c.total_amount) / 1.18
    return sum + (Number(c.total_amount) - base)
  }, 0)
  const comprasConAsiento = filteredCompras.filter(c => c.has_journal_entry).length

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumbs */}
      <Breadcrumbs />

      {/* Page Header */}
      <PageHeader
        title="Compras"
        subtitle="Gestiona tus compras. ✅ Los asientos contables se generan automáticamente"
        icon={ShoppingCart}
        iconColor="primary"
        actions={
          <ActionBar
            onNew={() => setShowForm(true)}
            onRefresh={reload}
            loading={loading}
            newLabel="Nueva Compra"
          >
            <Button variant="outline">
              <Download className="w-4 h-4" />
              Exportar
            </Button>
          </ActionBar>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-100 text-blue-600">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm text-gray-600">Total Compras</div>
              <div className="text-2xl font-bold text-gray-900">{formatCurrency(total)}</div>
            </div>
          </div>
        </Card>
        
        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-100 text-amber-600">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm text-gray-600">IGV Crédito</div>
              <div className="text-2xl font-bold text-gray-900">{formatCurrency(totalIGV)}</div>
            </div>
          </div>
        </Card>
        
        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-100 text-emerald-600">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm text-gray-600">Registros</div>
              <div className="text-2xl font-bold text-gray-900">{filteredCompras.length}</div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-green-100 text-green-600">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm text-gray-600">Con Asiento</div>
              <div className="text-2xl font-bold text-gray-900">{comprasConAsiento}</div>
              <div className="text-xs text-gray-500">{filteredCompras.length > 0 ? Math.round((comprasConAsiento / filteredCompras.length) * 100) : 0}%</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Filter Bar */}
      <FilterBar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Buscar por documento o ID..."
      />

      {/* Compras Table */}
      <Card>
        <CardHeader 
          title={`Registro de Compras${filteredCompras.length > 0 ? ` (${filteredCompras.length} compra${filteredCompras.length !== 1 ? 's' : ''})` : ''}`}
          icon={<ShoppingCart className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
        />
        <DataTable
          data={comprasForTable}
          loading={loading}
          emptyMessage="No hay compras registradas. Crea una nueva para comenzar."
          pageSize={10}
          columns={[
            {
              key: 'documento',
              label: 'Documento',
              render: (compra) => (
                <div>
                  <div className="font-medium text-primary-600 dark:text-primary-400">
                    {compra.doc_type}-{compra.series}-{compra.number}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">ID: {compra.compra_id}</div>
                </div>
              ),
            },
            {
              key: 'fecha',
              label: 'Fecha',
              render: (compra) => formatDate(compra.issue_date),
            },
            {
              key: 'total',
              label: 'Total',
              render: (compra) => (
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {formatCurrency(compra.total_amount)}
                </span>
              ),
              className: 'text-right',
            },
            {
              key: 'igv',
              label: 'IGV',
              render: (compra) => (
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  {formatCurrency(Number(compra.total_amount) * 0.18 / 1.18)}
                </span>
              ),
              className: 'text-right',
            },
            {
              key: 'asiento',
              label: 'Asiento Contable',
              render: (compra) =>
                compra.has_journal_entry && compra.journal_entry_id ? (
                  <a 
                    href={`/asientos?entry_id=${compra.journal_entry_id}`} 
                    className="text-blue-600 hover:underline dark:text-blue-400"
                    onClick={(e) => {
                      e.preventDefault()
                      window.location.href = `/asientos?entry_id=${compra.journal_entry_id}`
                    }}
                  >
                    #{compra.journal_entry_id}
                  </a>
                ) : (
                  <span className="text-gray-400">-</span>
                ),
            },
            {
              key: 'notas',
              label: 'Notas',
              render: (compra) => {
                const notasCompra = notasPorCompra[compra.compra_id] || []
                if (notasCompra.length === 0) {
                  return <span className="text-gray-400 text-sm">-</span>
                }
                const totalNC = notasCompra
                  .filter(n => n.tipo === 'CREDITO')
                  .reduce((sum, n) => sum + Number(n.total), 0)
                const totalND = notasCompra
                  .filter(n => n.tipo === 'DEBITO')
                  .reduce((sum, n) => sum + Number(n.total), 0)
                const totalAjuste = totalND - totalNC
                return (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-xs">
                      {totalNC > 0 && (
                        <span className="text-orange-600 dark:text-orange-400">
                          NC: -{formatCurrency(totalNC)}
                        </span>
                      )}
                      {totalND > 0 && (
                        <span className="text-indigo-600 dark:text-indigo-400">
                          ND: +{formatCurrency(totalND)}
                        </span>
                      )}
                    </div>
                    {totalAjuste !== 0 && (
                      <span className={`text-xs font-medium ${totalAjuste > 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-orange-600 dark:text-orange-400'}`}>
                        {totalAjuste > 0 ? '+' : ''}{formatCurrency(totalAjuste)}
                      </span>
                    )}
                  </div>
                )
              },
            },
            {
              key: 'pago',
              label: 'Estado de Pago',
              render: (compra) => {
                const saldo = saldosPendientes[compra.compra_id] ?? compra.total_amount
                const isPagado = saldo < 0.01
                return (
                  <div className="flex items-center gap-2">
                    {isPagado ? (
                      <>
                        <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                        <span className="text-sm font-medium text-green-700 dark:text-green-400">Pagado</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-amber-700 dark:text-amber-400">Pendiente</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{formatCurrency(saldo)}</span>
                        </div>
                      </>
                    )}
                  </div>
                )
              },
            },
            {
              key: 'acciones',
              label: 'Acciones',
              render: (compra) => {
                const saldo = saldosPendientes[compra.compra_id] ?? compra.total_amount
                const isPagado = saldo < 0.01
                return (
                  <div className="flex items-center justify-end gap-3">
                    <Button
                      variant="ghost"
                      size="md"
                      onClick={async () => {
                        try {
                          setLoadingPagos(true)
                          const pagosList = await listPagosCompra(compra.compra_id)
                          setPagos(pagosList)
                          setSelectedCompraForPagos(compra)
                          setShowPagosModal(true)
                        } catch (err) {
                          console.error('Error cargando pagos:', err)
                          showMessage('error', 'Error', 'No se pudieron cargar los pagos')
                        } finally {
                          setLoadingPagos(false)
                        }
                      }}
                      title="Gestionar pagos"
                      className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20 p-2 border border-green-300 dark:border-green-700 rounded-lg hover:border-green-500 dark:hover:border-green-500 hover:shadow-sm transition-all"
                    >
                      <DollarSign className="w-6 h-6" />
                    </Button>
                  {compra.has_journal_entry && (
                    <Button
                      variant="ghost"
                      size="md"
                      onClick={async () => {
                        try {
                          setLoading(true)
                          const notasList = await listNotasPorDocumento('COMPRA', compra.compra_id, empresaId!)
                          setNotas(notasList)
                          setSelectedCompraForNotas(compra)
                          setShowNotasModal(true)
                        } catch (err) {
                          console.error('Error cargando notas:', err)
                          showMessage('error', 'Error', 'No se pudieron cargar las notas')
                        } finally {
                          setLoading(false)
                        }
                      }}
                      title="Gestionar Notas"
                      className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 p-2 border border-orange-300 dark:border-orange-700 rounded-lg hover:border-orange-500 dark:hover:border-orange-500 hover:shadow-sm transition-all"
                    >
                      <FileText className="w-6 h-6" />
                    </Button>
                  )}
                    <Button
                      variant="ghost"
                      size="md"
                      onClick={() => {
                        setSelectedCompraForDocuments(compra)
                        setShowDocumentsModal(true)
                      }}
                      title="Ver documentos adjuntos"
                      className="text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-900/20 p-2 border border-purple-300 dark:border-purple-700 rounded-lg hover:border-purple-500 dark:hover:border-purple-500 hover:shadow-sm transition-all"
                    >
                      <Paperclip className="w-6 h-6" />
                    </Button>
                    <Button variant="ghost" size="md" onClick={() => openEdit(compra)} title="Editar compra" className="hover:bg-gray-100 dark:hover:bg-gray-700 p-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:border-gray-400 dark:hover:border-gray-500 hover:shadow-sm transition-all">
                      <Edit2 className="w-6 h-6" />
                    </Button>
                    <Button variant="ghost" size="md" className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 border border-red-300 dark:border-red-700 rounded-lg hover:border-red-500 dark:hover:border-red-500 hover:shadow-sm transition-all" onClick={() => openDelete(compra)} title="Eliminar compra">
                      <Trash2 className="w-6 h-6" />
                    </Button>
                  </div>
                )
              },
              className: 'text-right',
            },
          ]}
        />
      </Card>

      {/* Modal de Confirmar Eliminación */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setConfirmDelete(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="text-lg font-bold mb-2 text-red-600">Eliminar Compra</div>
            <div className="text-sm text-gray-700">
              Esta acción es <span className="font-semibold text-red-600">irreversible</span>. 
              Se eliminará la compra y su asiento contable asociado.
              <br /><br />
              ¿Eliminar compra <span className="font-medium">{confirmDelete.doc_type}-{confirmDelete.series}-{confirmDelete.number}</span> (ID {confirmDelete.compra_id})?
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
              <Button className="bg-red-600 hover:bg-red-700" onClick={doDelete}>Eliminar</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Crear/Editar Compra */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => { 
            setShowForm(false)
            setEditingCompra(null)
            setQuantityInputs({})
            setPriceInputs({})
            setDateError('')
          }}></div>
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white p-6 rounded-t-2xl sticky top-0 z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">
                      {editingCompra ? 'Editar Compra' : 'Nueva Compra'}
                    </h2>
                    <p className="text-sm text-primary-100">
                      {editingCompra ? `ID: ${editingCompra.compra_id} - Modifica la compra y su asiento contable` : 'Registra una compra. El asiento contable se generará automáticamente'}
                      <span className="ml-2 px-2 py-1 bg-white/20 rounded text-xs font-medium">
                        📅 Período: {periodo}
                      </span>
                    </p>
                  </div>
                </div>
                <button onClick={() => { setShowForm(false); setEditingCompra(null) }} className="text-white hover:text-gray-200">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                <div className="text-sm text-blue-900">
                  <strong>💡 Asiento automático:</strong> Al registrar la compra, se generará automáticamente 
                  el asiento contable según el PCGE peruano (60.11 Debe, 40.11 IGV Debe, 42.12 Crédito).
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-600">Tipo Documento</label>
                <select
                  value={form.doc_type}
                  onChange={e => setForm(f => ({ ...f, doc_type: e.target.value }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                >
                  <option value="01">Factura (01)</option>
                  <option value="03">Boleta (03)</option>
                  <option value="07">Nota de Crédito (07)</option>
                  <option value="08">Nota de Débito (08)</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-600">Serie</label>
                <input
                  type="text"
                  value={form.series}
                  onChange={e => setForm(f => ({ ...f, series: e.target.value.toUpperCase() }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                  placeholder="F001"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Número <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.number}
                  onChange={e => setForm(f => ({ ...f, number: e.target.value }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                  placeholder="000001"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-2 block">
                  Fecha <span className="text-red-500">*</span>
                  <span className="text-xs text-gray-500 ml-2">(Período: {periodo})</span>
                </label>
                <input
                  type="date"
                  value={form.issue_date}
                  min={getPeriodBounds(periodo).start}
                  max={getPeriodBounds(periodo).end}
                  onChange={e => {
                    const newDate = e.target.value
                    if (validateDateInPeriod(newDate, periodo)) {
                      setDateError('')
                    } else {
                      const bounds = getPeriodBounds(periodo)
                      setDateError(`La fecha debe estar entre ${formatDate(bounds.start)} y ${formatDate(bounds.end)}`)
                    }
                    setForm(f => ({ ...f, issue_date: newDate }))
                  }}
                  className={`mt-1 w-full border rounded-xl px-4 py-2 ${
                    dateError ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {dateError && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">{dateError}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Período válido: {formatDate(getPeriodBounds(periodo).start)} a {formatDate(getPeriodBounds(periodo).end)}
                </p>
              </div>
              <div className="col-span-2">
                <label className="text-sm text-gray-600 mb-2 block">
                  Proveedor <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <select
                    value={form.supplier_id}
                    onChange={e => {
                      const value = e.target.value
                      if (value === 'NEW') {
                        setShowQuickAddSupplier(true)
                        setQuickSupplierForm({ tax_id: '', tax_id_type: 'RUC', name: '' })
                        setQuickSupplierErrors({})
                      } else {
                        setForm(f => ({ ...f, supplier_id: Number(value) }))
                      }
                    }}
                    className="flex-1 border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    {proveedores.length === 0 ? (
                      <option value={1}>No hay proveedores registrados</option>
                    ) : (
                      proveedores.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.tax_id} - {p.name}
                          {p.commercial_name ? ` (${p.commercial_name})` : ''}
                        </option>
                      ))
                    )}
                    <option value="NEW" className="font-semibold text-primary-600">
                      ➕ Crear nuevo proveedor
                    </option>
                  </select>
                </div>
                {proveedores.length === 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    ⚠️ Puedes crear un proveedor rápidamente desde aquí o ir a <a href="/terceros" className="underline font-medium">Proveedores y Clientes</a>
                  </p>
                )}
              </div>
              <div className="col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-gray-700">Líneas de Detalle <span className="text-red-500">*</span></label>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    onClick={addLine} 
                    onKeyDown={(e) => {
                      if (e.key === 'F2') {
                        e.preventDefault()
                        addLine()
                      }
                    }}
                    title="Agregar línea (F2)"
                  >
                    <Plus className="w-4 h-4" /> Agregar Línea <span className="text-xs ml-1 opacity-70">(F2)</span>
                  </Button>
                </div>
                <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-gray-200 dark:bg-gray-700 border-b-2 border-gray-400 dark:border-gray-500">
                          <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700" style={{ minWidth: '300px' }}>Descripción</th>
                          <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700" style={{ width: '100px' }}>Cantidad</th>
                          <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700" style={{ width: '120px' }}>Precio Unit.</th>
                          <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700" style={{ width: '120px' }}>Base</th>
                          <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700" style={{ width: '100px' }}>IGV</th>
                          <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700" style={{ width: '120px' }}>Total</th>
                          <th className="px-3 py-2.5 text-center text-xs font-bold text-gray-900 dark:text-gray-100 bg-gray-200 dark:bg-gray-700" style={{ width: '60px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                      {form.lines?.map((line, idx) => {
                        const base = Math.round((line.quantity * line.unit_price) * 100) / 100
                        const igv = Math.round((base * 0.18) * 100) / 100
                        const total = Math.round((base + igv) * 100) / 100
                        return (
                          <tr key={idx} className={`${idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/70'} border-b border-gray-300 dark:border-gray-600`}>
                            <td className="px-3 py-2 border-r border-gray-300 dark:border-gray-600">
                              <input
                                type="text"
                                value={line.description}
                                onChange={e => updateLine(idx, 'description', e.target.value)}
                                className="w-full min-w-[280px] border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                placeholder="Producto/Servicio"
                              />
                            </td>
                            <td className="px-3 py-2 text-right border-r border-gray-300 dark:border-gray-600">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={
                                  quantityInputs[idx] !== undefined && quantityInputs[idx] !== '' 
                                    ? quantityInputs[idx] 
                                    : formatNumberForDisplay(line.quantity)
                                }
                                onChange={e => {
                                  const inputValue = e.target.value
                                  // Permitir escribir libremente (números, coma para miles, punto para decimales)
                                  const cleaned = inputValue.replace(/[^\d.,\-]/g, '')
                                  setQuantityInputs({ ...quantityInputs, [idx]: cleaned })
                                  const numValue = parseNumericInput(cleaned)
                                  updateLine(idx, 'quantity', numValue)
                                }}
                                onFocus={e => {
                                  // Al hacer foco, mostrar el valor en formato peruano para edición
                                  if (line.quantity && line.quantity > 0) {
                                    // Convertir a formato peruano (coma miles, punto decimal)
                                    const formatted = formatNumberForDisplay(line.quantity)
                                    setQuantityInputs({ ...quantityInputs, [idx]: formatted })
                                  } else {
                                    setQuantityInputs({ ...quantityInputs, [idx]: '' })
                                  }
                                }}
                                onBlur={e => {
                                  // Al perder foco, guardar el valor parseado
                                  const inputValue = e.target.value.trim()
                                  if (inputValue === '' || inputValue === '.' || inputValue === '-') {
                                    // Si está vacío, mantener valor mínimo de 1
                                    updateLine(idx, 'quantity', 1)
                                  } else {
                                    const numValue = parseNumericInput(inputValue)
                                    if (numValue > 0) {
                                      updateLine(idx, 'quantity', numValue)
                                    } else {
                                      // Si el parseo da 0 pero había texto, mantener 1
                                      updateLine(idx, 'quantity', 1)
                                    }
                                  }
                                  // Limpiar input temporal para que muestre el formato
                                  delete quantityInputs[idx]
                                  setQuantityInputs({ ...quantityInputs })
                                }}
                                className="w-full border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-right"
                                placeholder="0"
                              />
                            </td>
                            <td className="px-3 py-2 text-right border-r border-gray-300 dark:border-gray-600">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={
                                  priceInputs[idx] !== undefined && priceInputs[idx] !== ''
                                    ? priceInputs[idx]
                                    : formatNumberForDisplay(line.unit_price)
                                }
                                onChange={e => {
                                  const inputValue = e.target.value
                                  // Permitir escribir libremente (números, coma para miles, punto para decimales)
                                  const cleaned = inputValue.replace(/[^\d.,\-]/g, '')
                                  setPriceInputs({ ...priceInputs, [idx]: cleaned })
                                  const numValue = parseNumericInput(cleaned)
                                  updateLine(idx, 'unit_price', numValue)
                                }}
                                onFocus={e => {
                                  // Al hacer foco, mostrar el valor en formato peruano para edición
                                  if (line.unit_price && line.unit_price > 0) {
                                    // Convertir a formato peruano (coma miles, punto decimal)
                                    const formatted = formatNumberForDisplay(line.unit_price)
                                    setPriceInputs({ ...priceInputs, [idx]: formatted })
                                  } else {
                                    setPriceInputs({ ...priceInputs, [idx]: '' })
                                  }
                                }}
                                onBlur={e => {
                                  // Al perder foco, guardar el valor parseado
                                  const inputValue = e.target.value.trim()
                                  if (inputValue === '' || inputValue === '.' || inputValue === '-') {
                                    updateLine(idx, 'unit_price', 0)
                                  } else {
                                    const numValue = parseNumericInput(inputValue)
                                    updateLine(idx, 'unit_price', numValue >= 0 ? numValue : 0)
                                  }
                                  // Limpiar input temporal para que muestre el formato
                                  delete priceInputs[idx]
                                  setPriceInputs({ ...priceInputs })
                                }}
                                className="w-full border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-right"
                                placeholder="0.00"
                              />
                            </td>
                            <td className="px-3 py-2 text-sm font-medium text-right border-r border-gray-300 dark:border-gray-600">{formatCurrency(base)}</td>
                            <td className="px-3 py-2 text-sm font-medium text-amber-600 text-right border-r border-gray-300 dark:border-gray-600">{formatCurrency(igv)}</td>
                            <td className="px-3 py-2 text-sm font-semibold text-green-600 text-right border-r border-gray-300 dark:border-gray-600">{formatCurrency(total)}</td>
                            <td className="px-3 py-2 text-center">
                              {form.lines && form.lines.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-300 dark:border-red-600"
                                  onClick={() => removeLine(idx)}
                                  title="Eliminar línea"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    </table>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700/50 border-t border-gray-300 dark:border-gray-600 p-3">
                    <div className="flex justify-end items-center gap-4">
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Total:</span>
                      <span className="text-lg font-bold text-green-600 dark:text-green-500">{formatCurrency(calculateTotals(form.lines || []).totalTotal)}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-span-2">
                <label className="text-sm text-gray-600">Glosa (opcional - se genera automáticamente)</label>
                <input
                  type="text"
                  value={form.glosa || ''}
                  onChange={e => setForm(f => ({ ...f, glosa: e.target.value || undefined }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                  placeholder={`Compra ${form.doc_type}-${form.series}-${form.number || 'XXXX'}`}
                />
                <div className="mt-1 text-xs text-gray-500">
                  Si no se especifica, se generará: &quot;Compra {form.doc_type}-{form.series}-{form.number || 'XXXX'}&quot;
                </div>
              </div>

              {/* Opción de registrar pago automáticamente - Solo al crear */}
              {!editingCompra && (
                <div className="col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={registerPaymentImmediately}
                      onChange={(e) => setRegisterPaymentImmediately(e.target.checked)}
                      className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Registrar pago automáticamente (misma fecha, monto total, método: Efectivo)
                    </span>
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
                    Si está marcado, se registrará el pago completo automáticamente al guardar la compra.
                  </p>
                </div>
              )}

              {/* Sección de Documentos - Disponible al crear y editar */}
              <div className="col-span-2 border-t border-gray-200 dark:border-gray-700 pt-6 mt-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Paperclip className="w-5 h-5 text-primary-600" />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Documentos Adjuntos
                    </h3>
                    {!editingCompra && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        (Guarda la compra primero para asociar documentos)
                      </span>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!editingCompra) {
                        showMessage('info', 'Información', 'Guarda la compra primero para poder subir documentos adjuntos.')
                        return
                      }
                      setShowDocuments(!showDocuments)
                    }}
                  >
                    {showDocuments ? 'Ocultar' : 'Ver Documentos'}
                  </Button>
                </div>

                {showDocuments && editingCompra && (
                  <div className="space-y-4">
                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                        Subir Comprobante
                      </h4>
                      <DocumentUpload
                        companyId={empresaId}
                        documentType="COMPROBANTE_COMPRA"
                        relatedEntityType="PURCHASE"
                        relatedEntityId={editingCompra.compra_id}
                        title={`Comprobante ${editingCompra.doc_type}-${editingCompra.series}-${editingCompra.number}`}
                        onUploadSuccess={() => {
                          showMessage('success', 'Documento Subido', 'El comprobante se subió correctamente')
                        }}
                        onUploadError={(error) => {
                          showMessage('error', 'Error al Subir', error)
                        }}
                        onUploadComplete={() => {
                          // Forzar recarga de la lista de documentos
                          setDocumentListRefreshKey(prev => prev + 1)
                        }}
                      />
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                        Documentos Asociados
                      </h4>
                      <DocumentList
                        companyId={empresaId}
                        documentType="COMPROBANTE_COMPRA"
                        relatedEntityType="PURCHASE"
                        relatedEntityId={editingCompra.compra_id}
                        refreshKey={documentListRefreshKey}
                        onDocumentSelect={(doc) => {
                          // Mostrar viewer para PDFs, descargar otros tipos
                          if (doc.mime_type === 'application/pdf') {
                            setSelectedDocument(doc)
                          } else {
                            // Para otros tipos, descargar directamente
                            const link = document.createElement('a')
                            link.href = `/api/documents/${doc.id}/download`
                            link.download = doc.original_filename
                            link.click()
                          }
                        }}
                        onDocumentDelete={() => {
                          showMessage('success', 'Documento Eliminado', 'El documento se eliminó correctamente')
                          // Recargar lista después de eliminar
                          setDocumentListRefreshKey(prev => prev + 1)
                        }}
                      />
                    </div>
                  </div>
                )}

                {!editingCompra && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      💡 Guarda la compra primero para poder subir y asociar documentos adjuntos.
                    </p>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => { 
                setShowForm(false)
                setEditingCompra(null)
                setQuantityInputs({})
                setPriceInputs({})
                setDateError('')
              }}>
                Cancelar <span className="text-xs ml-1 opacity-70">(ESC)</span>
              </Button>
              <Button onClick={save}>
                {editingCompra ? 'Actualizar Compra y Asiento' : 'Registrar Compra y Generar Asiento'}
                <span className="text-xs ml-1 opacity-70">(Ctrl+Enter)</span>
              </Button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Crear Proveedor Rápido */}
      {showQuickAddSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowQuickAddSupplier(false)}></div>
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Building2 className="w-5 h-5" />
                  <h3 className="text-lg font-bold">Crear Proveedor Rápido</h3>
                </div>
                <button onClick={() => setShowQuickAddSupplier(false)} className="text-white hover:text-gray-200">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Ingresa los datos básicos. Podrás completar la información más tarde en <strong>Proveedores y Clientes</strong>.
              </p>
              
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                  Tipo de Documento <span className="text-red-500">*</span>
                </label>
                <select
                  value={quickSupplierForm.tax_id_type}
                  onChange={e => {
                    setQuickSupplierForm({ ...quickSupplierForm, tax_id_type: e.target.value as 'RUC' | 'DNI' | 'CE' | 'PAS', tax_id: '' })
                    setQuickSupplierErrors({ ...quickSupplierErrors, tax_id: '', tax_id_type: '' })
                  }}
                  className={`w-full border rounded-xl px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 ${
                    quickSupplierErrors.tax_id_type ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                  }`}
                >
                  <option value="RUC">RUC (11 dígitos)</option>
                  <option value="DNI">DNI (8 dígitos)</option>
                  <option value="CE">Carné de Extranjería</option>
                  <option value="PAS">Pasaporte</option>
                </select>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                  {quickSupplierForm.tax_id_type === 'RUC' ? 'RUC' : quickSupplierForm.tax_id_type === 'DNI' ? 'DNI' : quickSupplierForm.tax_id_type} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  maxLength={quickSupplierForm.tax_id_type === 'RUC' ? 11 : quickSupplierForm.tax_id_type === 'DNI' ? 8 : 20}
                  value={quickSupplierForm.tax_id}
                  onChange={e => {
                    const value = e.target.value.replace(/\D/g, '')
                    setQuickSupplierForm({ ...quickSupplierForm, tax_id: value })
                    setQuickSupplierErrors({ ...quickSupplierErrors, tax_id: '' })
                  }}
                  placeholder={quickSupplierForm.tax_id_type === 'RUC' ? '20123456789' : quickSupplierForm.tax_id_type === 'DNI' ? '12345678' : ''}
                  className={`w-full border rounded-xl px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono ${
                    quickSupplierErrors.tax_id ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                  }`}
                />
                {quickSupplierErrors.tax_id && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">{quickSupplierErrors.tax_id}</p>
                )}
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                  Razón Social / Nombre <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={quickSupplierForm.name}
                  onChange={e => {
                    setQuickSupplierForm({ ...quickSupplierForm, name: e.target.value })
                    setQuickSupplierErrors({ ...quickSupplierErrors, name: '' })
                  }}
                  className={`w-full border rounded-xl px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 ${
                    quickSupplierErrors.name ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                  }`}
                  placeholder="Nombre o razón social"
                />
                {quickSupplierErrors.name && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">{quickSupplierErrors.name}</p>
                )}
              </div>
              
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <Button variant="outline" onClick={() => setShowQuickAddSupplier(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleQuickCreateSupplier} className="bg-blue-600 hover:bg-blue-700 text-white">
                  Crear y Usar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Visor de Documentos PDF */}
      {selectedDocument && (
        <DocumentViewer
          document={selectedDocument}
          onClose={() => setSelectedDocument(null)}
        />
      )}

      {/* Modal de Pagos */}
      {showPagosModal && selectedCompraForPagos && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => {
            setShowPagosModal(false)
            setSelectedCompraForPagos(null)
            setPagos([])
          }}></div>
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6 rounded-t-2xl z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <DollarSign className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                      Pagos Registrados
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {selectedCompraForPagos.doc_type}-{selectedCompraForPagos.series}-{selectedCompraForPagos.number}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {(() => {
                    const saldo = saldosPendientes[selectedCompraForPagos.compra_id] ?? selectedCompraForPagos.total_amount
                    const isPagado = saldo < 0.01
                    return (
                      <div className="text-right">
                        <div className="text-xs text-gray-500 dark:text-gray-400">Saldo Pendiente</div>
                        <div className={`text-lg font-bold ${isPagado ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                          {formatCurrency(saldo)}
                        </div>
                      </div>
                    )
                  })()}
                  <button
                    onClick={() => {
                      setShowPagosModal(false)
                      setSelectedCompraForPagos(null)
                      setPagos([])
                    }}
                    className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>
            </div>
            <div className="p-6">
              {loadingPagos ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Cargando pagos...</p>
                </div>
              ) : pagos.length === 0 ? (
                <div className="text-center py-8">
                  <DollarSign className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600 dark:text-gray-400">No hay pagos registrados para esta compra</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pagos.map((pago) => (
                    <div key={pago.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
                              <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
                            </div>
                            <div>
                              <div className="font-semibold text-gray-900 dark:text-gray-100">
                                {formatCurrency(pago.amount)}
                              </div>
                              <div className="text-sm text-gray-600 dark:text-gray-400">
                                {formatDate(pago.payment_date)} • {pago.payment_method}
                              </div>
                            </div>
                          </div>
                          {pago.payment_reference && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 ml-14">
                              Referencia: {pago.payment_reference}
                            </div>
                          )}
                          {pago.notes && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 ml-14 mt-1">
                              {pago.notes}
                            </div>
                          )}
                          {pago.journal_entry_id && (
                            <div className="text-xs text-blue-600 dark:text-blue-400 ml-14 mt-1">
                              Asiento: #{pago.journal_entry_id}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {pago.journal_entry_id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                window.location.href = `/asientos?entry_id=${pago.journal_entry_id}`
                              }}
                              title="Ver asiento contable"
                              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 p-2 border border-blue-300 dark:border-blue-700 rounded-lg"
                            >
                              <ScrollText className="w-5 h-5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              if (confirm(`¿Está seguro de eliminar este pago de ${formatCurrency(pago.amount)}?\n\nSe eliminará también el asiento contable asociado.`)) {
                                try {
                                  setLoadingPagos(true)
                                  const result = await deletePago(pago.id)
                                  await reload()
                                  await loadSaldosPendientes()
                                  // Recargar lista de pagos
                                  const pagosList = await listPagosCompra(selectedCompraForPagos.compra_id)
                                  setPagos(pagosList)
                                  showMessage('success', 'Pago Eliminado', result.message)
                                } catch (err: any) {
                                  showMessage('error', 'Error', `Error al eliminar pago: ${err.message || err}`)
                                } finally {
                                  setLoadingPagos(false)
                                }
                              }
                            }}
                            title="Eliminar pago"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 border border-red-300 dark:border-red-700 rounded-lg"
                          >
                            <Trash2 className="w-5 h-5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowPagosModal(false)
                    const saldo = saldosPendientes[selectedCompraForPagos.compra_id] ?? selectedCompraForPagos.total_amount
                    if (saldo >= 0.01) {
                      setSaldoPendiente(saldo)
                      setSelectedCompraForPayment(selectedCompraForPagos)
                      setShowPaymentModal(true)
                    } else {
                      showMessage('info', 'Compra Pagada', 'Esta compra ya está completamente pagada.')
                    }
                  }}
                  className="w-full"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Registrar Nuevo Pago
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Documentos */}
      {showDocumentsModal && selectedCompraForDocuments && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => {
            setShowDocumentsModal(false)
            setSelectedCompraForDocuments(null)
          }}></div>
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6 rounded-t-2xl z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Paperclip className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                      Documentos Adjuntos
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {selectedCompraForDocuments.doc_type}-{selectedCompraForDocuments.series}-{selectedCompraForDocuments.number}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowDocumentsModal(false)
                    setSelectedCompraForDocuments(null)
                  }}
                  className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="p-6">
              <DocumentList
                companyId={empresaId}
                documentType="COMPROBANTE_COMPRA"
                relatedEntityType="PURCHASE"
                relatedEntityId={selectedCompraForDocuments.compra_id}
                onDocumentSelect={(doc) => setSelectedDocument(doc)}
                onDocumentDelete={() => {
                  setDocumentListRefreshKey(prev => prev + 1)
                }}
                refreshKey={documentListRefreshKey}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal de Pago */}
      {showPaymentModal && selectedCompraForPayment && (
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => {
            setShowPaymentModal(false)
            setSelectedCompraForPayment(null)
            setSaldoPendiente(null)
          }}
          onConfirm={async (data: PaymentData) => {
            try {
              // Obtener métodos de pago si no están cargados
              let metodos = metodosPago
              if (metodos.length === 0) {
                metodos = await listMetodosPago(empresaId)
                setMetodosPago(metodos)
              }
              
              // Buscar método de pago por código o usar el primero disponible
              let metodoPagoId = metodos.find(m => m.codigo === data.payment_method)?.id || metodos[0]?.id
              if (!metodoPagoId) {
                // Si no hay métodos, inicializar
                await initMetodosPago(empresaId)
                const nuevosMetodos = await listMetodosPago(empresaId)
                setMetodosPago(nuevosMetodos)
                metodoPagoId = nuevosMetodos[0]?.id
              }
              
              if (!metodoPagoId) {
                throw new Error('No hay métodos de pago configurados. Por favor, inicializa los métodos de pago primero.')
              }
              
              // Usar el nuevo módulo de Tesorería
              await registrarPagoTesoreria({
                company_id: empresaId,
                compra_id: selectedCompraForPayment.compra_id,
                monto: data.amount,
                fecha: data.payment_date,
                metodo_pago_id: metodoPagoId,
                glosa: data.notes || `Pago ${selectedCompraForPayment.doc_type} ${selectedCompraForPayment.series}-${selectedCompraForPayment.number}`,
                usar_motor: true
              })
              
              showMessage('success', 'Pago Registrado', `Pago de ${formatCurrency(data.amount)} registrado exitosamente.\n\nAsiento contable generado automáticamente por el Motor de Asientos.`)
              await reload()
            } catch (err: any) {
              showMessage('error', 'Error al Registrar Pago', err.message || 'Error desconocido')
            }
          }}
          type="PAYMENT"
          totalAmount={selectedCompraForPayment.total_amount}
          saldoPendiente={saldoPendiente || undefined}
          documentNumber={`${selectedCompraForPayment.doc_type}-${selectedCompraForPayment.series}-${selectedCompraForPayment.number}`}
        />
      )}

      {/* Modal de Mensajes (Éxito/Error) - Siempre por encima de todo */}
      {messageModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setMessageModal(null)}></div>
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6 z-[100000]">
            <div className={`flex items-center gap-3 mb-4 ${messageModal.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {messageModal.type === 'success' ? (
                <CheckCircle className="w-8 h-8" />
              ) : (
                <AlertCircle className="w-8 h-8" />
              )}
              <div className="text-xl font-bold">{messageModal.title}</div>
            </div>
            <div className="text-sm text-gray-700 whitespace-pre-line mb-6">
              {messageModal.message}
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setMessageModal(null)}>
                {messageModal.type === 'success' ? 'Aceptar' : 'Cerrar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Gestión de Notas */}
      {showNotasModal && selectedCompraForNotas && (
        <div className="fixed inset-0 z-[50] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => {
            setShowNotasModal(false)
            setSelectedCompraForNotas(null)
            setNotas([])
          }}></div>
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6 rounded-t-2xl z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                      Notas de Crédito y Débito
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {selectedCompraForNotas.doc_type}-{selectedCompraForNotas.series}-{selectedCompraForNotas.number}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowNotasModal(false)
                    setSelectedCompraForNotas(null)
                    setNotas([])
                  }}
                  className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="p-6">
              {loading ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Cargando notas...</p>
                </div>
              ) : (
                <>
                  <div className="space-y-3 mb-6">
                    {notas.length === 0 ? (
                      <div className="text-center py-8">
                        <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                        <p className="text-gray-600 dark:text-gray-400">No hay notas registradas para esta compra</p>
                      </div>
                    ) : (
                      notas.map((nota) => (
                        <div key={nota.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <div className={`p-2 rounded-lg ${nota.tipo === 'CREDITO' ? 'bg-orange-100 dark:bg-orange-900/20' : 'bg-indigo-100 dark:bg-indigo-900/20'}`}>
                                  {nota.tipo === 'CREDITO' ? (
                                    <FileMinus className={`w-5 h-5 ${nota.tipo === 'CREDITO' ? 'text-orange-600 dark:text-orange-400' : 'text-indigo-600 dark:text-indigo-400'}`} />
                                  ) : (
                                    <FilePlus className={`w-5 h-5 ${nota.tipo === 'CREDITO' ? 'text-orange-600 dark:text-orange-400' : 'text-indigo-600 dark:text-indigo-400'}`} />
                                  )}
                                </div>
                                <div>
                                  <div className="font-semibold text-gray-900 dark:text-gray-100">
                                    {nota.tipo === 'CREDITO' ? 'NC' : 'ND'} {nota.serie}-{nota.numero} • {formatCurrency(nota.total)}
                                  </div>
                                  <div className="text-sm text-gray-600 dark:text-gray-400">
                                    {formatDate(nota.fecha_emision)} • {nota.motivo}
                                  </div>
                                </div>
                              </div>
                              {nota.glosa && (
                                <div className="text-xs text-gray-500 dark:text-gray-400 ml-14 mt-1">
                                  {nota.glosa}
                                </div>
                              )}
                              {nota.journal_entry_id && (
                                <div className="text-xs text-blue-600 dark:text-blue-400 ml-14 mt-1">
                                  Asiento: #{nota.journal_entry_id}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={async () => {
                                  if (confirm(`¿Está seguro de eliminar esta ${nota.tipo === 'CREDITO' ? 'Nota de Crédito' : 'Nota de Débito'} ${nota.serie}-${nota.numero}?\n\nSe eliminará también el asiento contable asociado.`)) {
                                    try {
                                      setLoading(true)
                                      await eliminarNota(nota.id, empresaId!)
                                      await reload()
                                      await loadSaldosPendientes()
                                      await loadNotasPorCompras()
                                      const notasList = await listNotasPorDocumento('COMPRA', selectedCompraForNotas.compra_id, empresaId!)
                                      setNotas(notasList)
                                      showMessage('success', 'Nota Eliminada', 'La nota ha sido eliminada exitosamente.')
                                    } catch (err: any) {
                                      showMessage('error', 'Error', `Error al eliminar nota: ${err.message || err}`)
                                    } finally {
                                      setLoading(false)
                                    }
                                  }
                                }}
                                title="Eliminar nota"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 border border-red-300 dark:border-red-700 rounded-lg"
                              >
                                <Trash2 className="w-5 h-5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
                    <Button
                      variant="outline"
                      onClick={async () => {
                        setSelectedCompraForNota(selectedCompraForNotas)
                        setNotaTipo('CREDITO')
                        // Sugerir serie y número
                        const serieSugerida = 'NC01'
                        const maxNumero = notas
                          .filter(n => n.tipo === 'CREDITO' && n.serie === serieSugerida)
                          .map(n => parseInt(n.numero) || 0)
                          .reduce((max, num) => Math.max(max, num), 0)
                        const numeroSugerido = String(maxNumero + 1).padStart(6, '0')
                        const glosaSugerida = `Nota de Crédito ${serieSugerida}-${numeroSugerido} relacionada a ${selectedCompraForNotas.doc_type} ${selectedCompraForNotas.series}-${selectedCompraForNotas.number}`
                        setNotaForm({
                          serie: serieSugerida,
                          numero: numeroSugerido,
                          fecha_emision: new Date().toISOString().split('T')[0],
                          motivo: '',
                          monto_base: 0,
                          glosa: glosaSugerida
                        })
                        setShowNotaModal(true)
                      }}
                      className="w-full"
                    >
                      <FileMinus className="w-4 h-4 mr-2" />
                      Crear Nota de Crédito
                    </Button>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        setSelectedCompraForNota(selectedCompraForNotas)
                        setNotaTipo('DEBITO')
                        // Sugerir serie y número
                        const serieSugerida = 'ND01'
                        const maxNumero = notas
                          .filter(n => n.tipo === 'DEBITO' && n.serie === serieSugerida)
                          .map(n => parseInt(n.numero) || 0)
                          .reduce((max, num) => Math.max(max, num), 0)
                        const numeroSugerido = String(maxNumero + 1).padStart(6, '0')
                        const glosaSugerida = `Nota de Débito ${serieSugerida}-${numeroSugerido} relacionada a ${selectedCompraForNotas.doc_type} ${selectedCompraForNotas.series}-${selectedCompraForNotas.number}`
                        setNotaForm({
                          serie: serieSugerida,
                          numero: numeroSugerido,
                          fecha_emision: new Date().toISOString().split('T')[0],
                          motivo: '',
                          monto_base: 0,
                          glosa: glosaSugerida
                        })
                        setShowNotaModal(true)
                      }}
                      className="w-full"
                    >
                      <FilePlus className="w-4 h-4 mr-2" />
                      Crear Nota de Débito
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Crear Nota de Crédito/Débito */}
      {showNotaModal && selectedCompraForNota && notaTipo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => {
            setShowNotaModal(false)
            setSelectedCompraForNota(null)
            setNotaTipo(null)
          }}></div>
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {notaTipo === 'CREDITO' ? (
                  <FileMinus className="w-6 h-6 text-orange-600" />
                ) : (
                  <FilePlus className="w-6 h-6 text-indigo-600" />
                )}
                <div>
                  <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    {notaTipo === 'CREDITO' ? 'Nota de Crédito' : 'Nota de Débito'} - Compra
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {selectedCompraForNota.doc_type}-{selectedCompraForNota.series}-{selectedCompraForNota.number}
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => {
                setShowNotaModal(false)
                setSelectedCompraForNota(null)
                setNotaTipo(null)
              }}>
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="p-6 space-y-4">
              {/* Lista de notas existentes */}
              {notas.length > 0 && (
                <div className="mb-6">
                  <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Notas existentes:</div>
                  <div className="space-y-2">
                    {notas.map(nota => (
                      <div key={nota.id} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg flex items-center justify-between">
                        <div>
                          <div className="font-medium text-gray-900 dark:text-gray-100">
                            {nota.tipo === 'CREDITO' ? 'NC' : 'ND'} {nota.serie}-{nota.numero}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {formatDate(nota.fecha_emision)} - {formatCurrency(nota.total)} - {nota.motivo}
                          </div>
                        </div>
                        {nota.journal_entry_id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.location.href = `/asientos?entry_id=${nota.journal_entry_id}`}
                          >
                            <ScrollText className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Formulario - Similar al de Ventas */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Serie</label>
                    <input
                      type="text"
                      value={notaForm.serie}
                      onChange={(e) => setNotaForm({ ...notaForm, serie: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      placeholder="FC01"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Número</label>
                    <input
                      type="text"
                      value={notaForm.numero}
                      onChange={(e) => setNotaForm({ ...notaForm, numero: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      placeholder="000001"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha de Emisión</label>
                  <input
                    type="date"
                    value={notaForm.fecha_emision}
                    onChange={(e) => setNotaForm({ ...notaForm, fecha_emision: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Motivo</label>
                  <select
                    value={notaForm.motivo}
                    onChange={(e) => {
                      const motivo = e.target.value
                      const motivoText = e.target.options[e.target.selectedIndex].text
                      const glosaActualizada = notaForm.glosa || `Nota de ${notaTipo === 'CREDITO' ? 'Crédito' : 'Débito'} ${notaForm.serie}-${notaForm.numero} relacionada a ${selectedCompraForNota.doc_type} ${selectedCompraForNota.series}-${selectedCompraForNota.number}. Motivo: ${motivoText}`
                      setNotaForm({ ...notaForm, motivo, glosa: glosaActualizada })
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">Seleccionar motivo</option>
                    {notaTipo === 'CREDITO' ? (
                      <>
                        <option value="ANULACION_OPERACION">Anulación de la operación</option>
                        <option value="DEVOLUCION_TOTAL">Devolución total</option>
                        <option value="DEVOLUCION_PARCIAL">Devolución parcial</option>
                        <option value="DESCUENTO_POSTERIOR">Descuento posterior</option>
                        <option value="ERROR_PRECIO">Error en el precio</option>
                        <option value="ERROR_CANTIDAD">Error en la cantidad</option>
                      </>
                    ) : (
                      <>
                        <option value="INTERESES">Intereses</option>
                        <option value="PENALIDADES">Penalidades</option>
                        <option value="INCREMENTO_VALOR">Incremento de valor</option>
                        <option value="GASTOS_ADICIONALES">Gastos adicionales</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Monto Base</label>
                  <input
                    type="number"
                    step="0.01"
                    value={notaForm.monto_base}
                    onChange={(e) => setNotaForm({ ...notaForm, monto_base: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Glosa (Opcional)</label>
                  <textarea
                    value={notaForm.glosa}
                    onChange={(e) => setNotaForm({ ...notaForm, glosa: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    rows={3}
                    placeholder="Descripción adicional..."
                  />
                </div>

                {notaForm.monto_base > 0 && (
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Resumen:</div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Base:</span>
                        <span className="font-medium">{formatCurrency(notaForm.monto_base)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">IGV (18%):</span>
                        <span className="font-medium">{formatCurrency(notaForm.monto_base * 0.18)}</span>
                      </div>
                      <div className="flex justify-between border-t border-gray-300 dark:border-gray-600 pt-1 mt-1">
                        <span className="font-semibold text-gray-900 dark:text-gray-100">Total:</span>
                        <span className="font-bold text-lg">{formatCurrency(notaForm.monto_base * 1.18)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <Button variant="outline" onClick={() => {
                  setShowNotaModal(false)
                  setSelectedCompraForNota(null)
                  setNotaTipo(null)
                }}>
                  Cancelar
                </Button>
                <Button
                  onClick={async () => {
                    if (!notaForm.serie || !notaForm.numero || !notaForm.motivo || notaForm.monto_base <= 0) {
                      showMessage('error', 'Error', 'Por favor completa todos los campos requeridos')
                      return
                    }

                    try {
                      setLoading(true)
                      if (notaTipo === 'CREDITO') {
                        await registrarNotaCreditoCompra({
                          company_id: empresaId!,
                          compra_id: selectedCompraForNota.compra_id,
                          serie: notaForm.serie,
                          numero: notaForm.numero,
                          fecha_emision: notaForm.fecha_emision,
                          motivo: notaForm.motivo,
                          monto_base: notaForm.monto_base,
                          glosa: notaForm.glosa || undefined,
                          usar_motor: true
                        })
                      } else {
                        await registrarNotaDebitoCompra({
                          company_id: empresaId!,
                          compra_id: selectedCompraForNota.compra_id,
                          serie: notaForm.serie,
                          numero: notaForm.numero,
                          fecha_emision: notaForm.fecha_emision,
                          motivo: notaForm.motivo,
                          monto_base: notaForm.monto_base,
                          glosa: notaForm.glosa || undefined,
                          usar_motor: true
                        })
                      }
                      
                      showMessage('success', 'Nota Registrada', `La ${notaTipo === 'CREDITO' ? 'Nota de Crédito' : 'Nota de Débito'} ha sido registrada exitosamente y se ha generado el asiento contable automáticamente.`)
                      setShowNotaModal(false)
                      setSelectedCompraForNota(null)
                      setNotaTipo(null)
                      await reload()
                      await loadSaldosPendientes()
                      await loadNotasPorCompras()
                      // Recargar notas en el modal si está abierto
                      if (showNotasModal && selectedCompraForNotas) {
                        const notasList = await listNotasPorDocumento('COMPRA', selectedCompraForNotas.compra_id, empresaId!)
                        setNotas(notasList)
                      }
                    } catch (err: any) {
                      showMessage('error', 'Error', err.message || 'Error al registrar la nota')
                    } finally {
                      setLoading(false)
                    }
                  }}
                  disabled={loading}
                  className={notaTipo === 'CREDITO' ? 'bg-orange-600 hover:bg-orange-700' : 'bg-indigo-600 hover:bg-indigo-700'}
                >
                  {loading ? 'Registrando...' : 'Registrar Nota'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
