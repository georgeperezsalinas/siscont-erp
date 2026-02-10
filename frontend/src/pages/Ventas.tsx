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
import { Plus, Search, Filter, Download, Edit2, Trash2, TrendingUp, FileText, CheckCircle, XCircle, ScrollText, AlertCircle, X, User, Paperclip, Info, DollarSign, FileMinus, FilePlus, FileX } from 'lucide-react'
import { listVentas, createVenta, updateVenta, deleteVenta, getVenta, type VentaOut, type VentaIn, type VentaUpdate, type SaleLineIn, listThirdParties, createThirdParty, type ThirdParty, registrarCobro, getSaldoPendienteVenta, listCobrosVenta, deleteCobro, type CobroListItem, registrarCobroTesoreria, listMetodosPago, initMetodosPago, type MetodoPago, registrarNotaCreditoVenta, registrarNotaDebitoVenta, listNotasPorDocumento, type NotaDocumentoOut, eliminarNota, anularNota } from '@/api'
import { DocumentUpload, DocumentList, DocumentViewer, PaymentModal, type PaymentData } from '@/components/ui'
import { InfoTooltip } from '@/components/ui/Tooltip'
import { getSaleDocuments, uploadDocument, type Document } from '@/api'
import { useOrg } from '@/stores/org'
import { useSettings } from '@/stores/settings'
import { useAuth } from '@/stores/auth'

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

export default function Ventas() {
  const { empresaId, periodo } = useOrg()
  const { user } = useAuth()
  const [ventas, setVentas] = useState<VentaOut[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingVenta, setEditingVenta] = useState<VentaOut | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<VentaOut | null>(null)
  const [messageModal, setMessageModal] = useState<{ type: 'success' | 'error'; title: string; message: string } | null>(null)

  const [form, setForm] = useState<VentaIn>({
    company_id: empresaId,
    doc_type: '01',
    series: 'F001',
    number: '',
    issue_date: periodo ? getPeriodFirstDay(periodo) : new Date().toISOString().split('T')[0],
    customer_id: 1,
    currency: 'PEN',
    lines: [{ description: '', quantity: 1, unit_price: 0 }],
    glosa: undefined,
    detraction_rate: null,
  })
  const [dateError, setDateError] = useState<string>('')
  const [searchTerm, setSearchTerm] = useState('')
  const [clientes, setClientes] = useState<ThirdParty[]>([])
  const [showQuickAddCustomer, setShowQuickAddCustomer] = useState(false)
  const [quickCustomerForm, setQuickCustomerForm] = useState({
    tax_id: '',
    tax_id_type: 'RUC' as 'RUC' | 'DNI' | 'CE' | 'PAS',
    name: '',
  })
  const [quickCustomerErrors, setQuickCustomerErrors] = useState<Record<string, string>>({})
  const [showDocuments, setShowDocuments] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)
  const [documentListRefreshKey, setDocumentListRefreshKey] = useState(0)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedVentaForPayment, setSelectedVentaForPayment] = useState<VentaOut | null>(null)
  const [saldoPendiente, setSaldoPendiente] = useState<number | null>(null)
  const [saldosPendientes, setSaldosPendientes] = useState<Record<number, number>>({}) // venta_id -> saldo_pendiente
  const [showDocumentsModal, setShowDocumentsModal] = useState(false)
  const [selectedVentaForDocuments, setSelectedVentaForDocuments] = useState<VentaOut | null>(null)
  const [registerCollectionImmediately, setRegisterCollectionImmediately] = useState(false) // Registrar cobro automáticamente al crear
  const [showCobrosModal, setShowCobrosModal] = useState(false)
  const [selectedVentaForCobros, setSelectedVentaForCobros] = useState<VentaOut | null>(null)
  const [cobros, setCobros] = useState<CobroListItem[]>([])
  const [loadingCobros, setLoadingCobros] = useState(false)
  const [metodosPago, setMetodosPago] = useState<MetodoPago[]>([])
  const [showNotaModal, setShowNotaModal] = useState(false)
  const [notaTipo, setNotaTipo] = useState<'CREDITO' | 'DEBITO' | null>(null)
  const [selectedVentaForNota, setSelectedVentaForNota] = useState<VentaOut | null>(null)
  const [notas, setNotas] = useState<NotaDocumentoOut[]>([])
  const [notasPorVenta, setNotasPorVenta] = useState<Record<number, NotaDocumentoOut[]>>({}) // venta_id -> notas
  const [loadingNotas, setLoadingNotas] = useState(false)
  const [showNotasModal, setShowNotasModal] = useState(false)
  const [selectedVentaForNotas, setSelectedVentaForNotas] = useState<VentaOut | null>(null)
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
      loadClientes()
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

  // Cargar saldos pendientes cuando cambian las ventas
  useEffect(() => {
    if (ventas.length > 0) {
      loadSaldosPendientes()
      loadNotasPorVentas()
    }
  }, [ventas])

  // Cargar notas para todas las ventas
  async function loadNotasPorVentas() {
    if (!empresaId || ventas.length === 0) return
    try {
      const notasMap: Record<number, NotaDocumentoOut[]> = {}
      await Promise.all(
        ventas
          .filter(v => v.has_journal_entry)
          .map(async (venta) => {
            try {
              const notasList = await listNotasPorDocumento('VENTA', venta.venta_id, empresaId!)
              notasMap[venta.venta_id] = notasList
            } catch (err) {
              console.error(`Error cargando notas para venta ${venta.venta_id}:`, err)
            }
          })
      )
      setNotasPorVenta(notasMap)
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
        if (e.key === 'Escape' && !showQuickAddCustomer) {
          e.preventDefault()
          e.stopPropagation()
          setShowForm(false)
          setEditingVenta(null)
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
      if (e.key === 'Escape' && !showQuickAddCustomer) {
        e.preventDefault()
        e.stopPropagation()
        setShowForm(false)
        setEditingVenta(null)
        setQuantityInputs({})
        setPriceInputs({})
        setDateError('')
      }
    }

    document.addEventListener('keydown', handleKeyDown, true) // Usar capture phase
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [showForm, showQuickAddCustomer])

  async function loadClientes() {
    if (!empresaId) return
    try {
      const data = await listThirdParties(empresaId, 'CLIENTE', true)
      setClientes(data)
      // Si hay clientes, seleccionar el primero por defecto
      if (data.length > 0 && form.customer_id === 1) {
        const exists = data.find(c => c.id === form.customer_id)
        if (!exists) {
          setForm(f => ({ ...f, customer_id: data[0].id }))
        }
      }
    } catch (err) {
      console.error('Error cargando clientes:', err)
      setClientes([])
    }
  }

  // Validaciones rápidas para crear cliente
  function validateQuickCustomer(): boolean {
    const errors: Record<string, string> = {}
    
    if (!quickCustomerForm.tax_id || quickCustomerForm.tax_id.trim() === '') {
      errors.tax_id = `${quickCustomerForm.tax_id_type} es obligatorio`
    } else {
      if (quickCustomerForm.tax_id_type === 'RUC' && quickCustomerForm.tax_id.length !== 11) {
        errors.tax_id = 'RUC debe tener 11 dígitos'
      } else if (quickCustomerForm.tax_id_type === 'DNI' && quickCustomerForm.tax_id.length !== 8) {
        errors.tax_id = 'DNI debe tener 8 dígitos'
      }
    }
    
    if (!quickCustomerForm.name || quickCustomerForm.name.trim() === '') {
      errors.name = 'Nombre es obligatorio'
    } else if (quickCustomerForm.name.trim().length < 3) {
      errors.name = 'El nombre debe tener al menos 3 caracteres'
    }
    
    setQuickCustomerErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleQuickCreateCustomer() {
    if (!validateQuickCustomer()) {
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
      
      const nuevoCliente = await createThirdParty({
        company_id: empresaId,
        tax_id: quickCustomerForm.tax_id,
        tax_id_type: taxIdTypeMap[quickCustomerForm.tax_id_type] || '6',
        name: quickCustomerForm.name.trim(),
        type: 'CLIENTE',
        active: true,
      })
      
      // Recargar lista de clientes
      await loadClientes()
      
      // Seleccionar el nuevo cliente
      setForm(f => ({ ...f, customer_id: nuevoCliente.id }))
      
      // Cerrar modal y limpiar
      setShowQuickAddCustomer(false)
      setQuickCustomerForm({ tax_id: '', tax_id_type: 'RUC', name: '' })
      setQuickCustomerErrors({})
      
      showMessage('success', 'Cliente Creado', `Cliente "${nuevoCliente.name}" creado exitosamente. Puedes completar sus datos más tarde en la sección de Proveedores y Clientes.`)
    } catch (err: any) {
      const errorMsg = err.message || 'Error al crear cliente'
      if (errorMsg.includes('RUC inválido') || errorMsg.includes('DNI inválido')) {
        setQuickCustomerErrors({ tax_id: errorMsg })
      } else if (errorMsg.includes('ya existe')) {
        setQuickCustomerErrors({ tax_id: errorMsg })
      } else {
        showMessage('error', 'Error', errorMsg)
      }
    }
  }

  async function reload() {
    try {
      setLoading(true)
      const data = await listVentas(empresaId, periodo)
      setVentas(data)
    } catch (err: any) {
      console.error('Error cargando ventas:', err)
      setVentas([])
    } finally {
      setLoading(false)
    }
  }

  async function loadSaldosPendientes() {
    try {
      const saldos: Record<number, number> = {}
      await Promise.all(
        ventas.map(async (venta) => {
          try {
            const saldo = await getSaldoPendienteVenta(venta.venta_id)
            saldos[venta.venta_id] = saldo.saldo_pendiente
          } catch (err) {
            // Si falla, asumir que el saldo es el total
            saldos[venta.venta_id] = venta.total_amount
          }
        })
      )
      setSaldosPendientes(saldos)
    } catch (err) {
      console.error('Error cargando saldos pendientes:', err)
    }
  }

  async function openEdit(venta: VentaOut) {
    setEditingVenta(venta)
    // Cargar venta completa con líneas
    try {
      const ventaCompleta = await getVenta(venta.venta_id)
      setForm({
        company_id: empresaId,
        doc_type: ventaCompleta.doc_type,
        series: ventaCompleta.series,
        number: ventaCompleta.number,
        issue_date: ventaCompleta.issue_date,
        customer_id: ventaCompleta.customer_id || (clientes.length > 0 ? clientes[0].id : 1),
        currency: 'PEN',
        lines: ventaCompleta.lines?.map(l => ({
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price
        })) || [{ description: '', quantity: 1, unit_price: 0 }],
        glosa: undefined,
        detraction_rate: ventaCompleta.detraction_rate || null,
      })
    } catch (err) {
      // Fallback si no hay líneas
      setForm({
        company_id: empresaId,
        doc_type: venta.doc_type,
        series: venta.series,
        number: venta.number,
        issue_date: venta.issue_date,
        customer_id: venta.customer_id || (clientes.length > 0 ? clientes[0].id : 1),
        currency: 'PEN',
        lines: [{ description: '', quantity: 1, unit_price: Number(venta.total_amount) / 1.18 }],
        glosa: undefined,
      })
    }
    setShowForm(true)
  }

  async function openDelete(venta: VentaOut) {
    setConfirmDelete(venta)
  }

  function showMessage(type: 'success' | 'error', title: string, message: string) {
    setMessageModal({ type, title, message })
  }

  async function doDelete() {
    if (!confirmDelete) return
    try {
      await deleteVenta(confirmDelete.venta_id)
      setConfirmDelete(null)
      await reload()
      showMessage('success', 'Venta Eliminada', 'La venta y su asiento contable se eliminaron exitosamente.')
    } catch (err: any) {
      showMessage('error', 'Error al Eliminar', `Error al eliminar venta: ${err.message || err}`)
    }
  }

  // Calcular totales desde líneas
  const calculateTotals = (lines: SaleLineIn[], detractionRate: number | null | undefined = null) => {
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
    
    // Redondear totales
    totalBase = Math.round(totalBase * 100) / 100
    totalIGV = Math.round(totalIGV * 100) / 100
    totalTotal = Math.round(totalTotal * 100) / 100
    
    // Calcular detracción si se proporciona tasa
    let detractionAmount = 0
    let netAmount = totalTotal
    if (detractionRate && detractionRate > 0) {
      detractionAmount = Math.round(totalTotal * detractionRate * 100) / 100
      netAmount = Math.round((totalTotal - detractionAmount) * 100) / 100
    }
    
    return { 
      totalBase, 
      totalIGV, 
      totalTotal,
      detraction_rate: detractionRate || null,
      detraction_amount: detractionAmount > 0 ? detractionAmount : null,
      net_amount: detractionAmount > 0 ? netAmount : null
    }
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

  function updateLine(index: number, field: keyof SaleLineIn, value: any) {
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
      if (editingVenta) {
        // Actualizar con líneas
        const updateData: VentaUpdate = {
          doc_type: form.doc_type,
          series: form.series,
          number: form.number,
          issue_date: form.issue_date,
          customer_id: form.customer_id,
          currency: form.currency,
          glosa: form.glosa,
          lines: validLines.map((l, idx) => ({
            line_number: idx + 1,
            description: l.description.trim(),
            quantity: l.quantity,
            unit_price: l.unit_price
          })),
          detraction_rate: form.detraction_rate && form.detraction_rate > 0 ? form.detraction_rate : null
        }
        await updateVenta(editingVenta.venta_id, updateData)
        setShowForm(false)
        setEditingVenta(null)
        setQuantityInputs({})
        setPriceInputs({})
        setDateError('')
        await reload()
        showMessage('success', 'Venta Actualizada', 'Venta actualizada exitosamente.')
      } else {
        // Crear con líneas
        const nuevaVenta = await createVenta({
          ...form,
          company_id: empresaId,
          lines: validLines.map((l, idx) => ({
            line_number: idx + 1,
            description: l.description.trim(),
            quantity: l.quantity,
            unit_price: l.unit_price
          })),
          detraction_rate: form.detraction_rate && form.detraction_rate > 0 ? form.detraction_rate : null
        })
        
        // Si está marcado registrar cobro inmediatamente, hacerlo
        if (registerCollectionImmediately) {
          try {
            await registrarCobro(nuevaVenta.venta_id, {
              payment_date: form.issue_date, // Usar la misma fecha de la venta
              amount: nuevaVenta.total_amount,
              cash_account_code: null, // El backend lo determinará automáticamente
              payment_method: 'EFECTIVO',
              payment_reference: null,
              notes: 'Cobro registrado automáticamente al crear la venta'
            })
            await reload()
            await loadSaldosPendientes()
            showMessage('success', 'Venta y Cobro Registrados', `Venta registrada exitosamente!\n\nAsiento contable generado automáticamente: #${nuevaVenta.journal_entry_id}\nCobro registrado automáticamente por el monto total.\nDocumento: ${nuevaVenta.doc_type}-${nuevaVenta.series}-${nuevaVenta.number}`)
          } catch (err: any) {
            console.error('Error registrando cobro automático:', err)
            showMessage('warning', 'Venta Registrada, Cobro No Registrado', `Venta registrada exitosamente!\n\nAsiento contable generado automáticamente: #${nuevaVenta.journal_entry_id}\nDocumento: ${nuevaVenta.doc_type}-${nuevaVenta.series}-${nuevaVenta.number}\n\nError al registrar cobro automático: ${err.message || err}`)
          }
        } else {
          // Establecer la venta creada como editingVenta para poder subir documentos
          setEditingVenta(nuevaVenta)
          // Mostrar automáticamente la sección de documentos
          setShowDocuments(true)
          // No cerrar el formulario, permitir subir documentos
          setQuantityInputs({})
          setPriceInputs({})
          setDateError('')
          await reload()
          // Usar setTimeout para asegurar que el estado se actualice antes de mostrar el mensaje
          setTimeout(() => {
            showMessage('success', 'Venta Registrada', `Venta registrada exitosamente!\n\nAsiento contable generado automáticamente: #${nuevaVenta.journal_entry_id}\nDocumento: ${nuevaVenta.doc_type}-${nuevaVenta.series}-${nuevaVenta.number}\n\nAhora puedes subir documentos adjuntos.`)
          }, 100)
        }
        
        // Resetear el checkbox
        setRegisterCollectionImmediately(false)
      }
    } catch (err: any) {
      showMessage('error', 'Error', `Error al procesar venta: ${err.message || err}`)
    }
  }

  const filteredVentas = ventas.filter(v => {
    if (!searchTerm) return true
    const searchLower = searchTerm.toLowerCase()
    return (
      `${v.doc_type}-${v.series}-${v.number}`.toLowerCase().includes(searchLower) ||
      String(v.venta_id).includes(searchLower)
    )
  })

  const total = filteredVentas.reduce((sum, v) => sum + Number(v.total_amount), 0)
  const totalIGV = filteredVentas.reduce((sum, v) => {
    const base = Number(v.total_amount) / 1.18
    return sum + (Number(v.total_amount) - base)
  }, 0)
  const ventasConAsiento = filteredVentas.filter(v => v.has_journal_entry).length

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumbs */}
      <Breadcrumbs />

      {/* Page Header */}
      <PageHeader
        title="Ventas"
        subtitle="Gestiona tus ventas. ✅ Los asientos contables se generan automáticamente"
        icon={TrendingUp}
        iconColor="primary"
        actions={
          <ActionBar
            onNew={() => setShowForm(true)}
            onRefresh={reload}
            loading={loading}
            newLabel="Nueva Venta"
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
            <div className="p-3 rounded-xl bg-green-100 text-green-600">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm text-gray-600">Total Ventas</div>
              <div className="text-2xl font-bold text-gray-900">{formatCurrency(total)}</div>
            </div>
          </div>
        </Card>
        
        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-100 text-blue-600">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm text-gray-600">IGV Débito</div>
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
              <div className="text-2xl font-bold text-gray-900">{filteredVentas.length}</div>
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
              <div className="text-2xl font-bold text-gray-900">{ventasConAsiento}</div>
              <div className="text-xs text-gray-500">{filteredVentas.length > 0 ? Math.round((ventasConAsiento / filteredVentas.length) * 100) : 0}%</div>
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

      {/* Ventas Table */}
      <Card>
        <CardHeader 
          title={`Registro de Ventas${filteredVentas.length > 0 ? ` (${filteredVentas.length} venta${filteredVentas.length !== 1 ? 's' : ''})` : ''}`}
          icon={<TrendingUp className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
        />
        <DataTable
          data={filteredVentas}
          loading={loading}
          emptyMessage="No hay ventas registradas. Crea una nueva para comenzar."
          pageSize={10}
          columns={[
            {
              key: 'documento',
              label: 'Documento',
              render: (venta) => (
                <div>
                  <div className="font-medium text-primary-600 dark:text-primary-400">
                    {venta.doc_type}-{venta.series}-{venta.number}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">ID: {venta.venta_id}</div>
                </div>
              ),
            },
            {
              key: 'fecha',
              label: 'Fecha',
              render: (venta) => formatDate(venta.issue_date),
            },
            {
              key: 'total',
              label: 'Total',
              render: (venta) => (
                <div className="flex flex-col items-end">
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {formatCurrency(venta.total_amount)}
                  </span>
                  {venta.detraction_amount && venta.detraction_amount > 0 && (
                    <>
                      <span className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                        Det: {formatCurrency(venta.detraction_amount)} ({formatNumber((venta.detraction_rate || 0) * 100)}%)
                      </span>
                      <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 mt-0.5">
                        Neto: {formatCurrency(venta.net_amount || 0)}
                      </span>
                    </>
                  )}
                </div>
              ),
              className: 'text-right',
            },
            {
              key: 'igv',
              label: 'IGV',
              render: (venta) => (
                <span className="text-blue-600 dark:text-blue-400 font-medium">
                  {formatCurrency(Number(venta.total_amount) * 0.18 / 1.18)}
                </span>
              ),
              className: 'text-right',
            },
            {
              key: 'asiento',
              label: 'Asiento Contable',
              render: (venta) =>
                venta.has_journal_entry && venta.journal_entry_id ? (
                  <a 
                    href={`/asientos?entry_id=${venta.journal_entry_id}`} 
                    className="text-blue-600 hover:underline dark:text-blue-400"
                    onClick={(e) => {
                      e.preventDefault()
                      window.location.href = `/asientos?entry_id=${venta.journal_entry_id}`
                    }}
                  >
                    #{venta.journal_entry_id}
                  </a>
                ) : (
                  <span className="text-gray-400">-</span>
                ),
            },
            {
              key: 'notas',
              label: 'Notas',
              render: (venta) => {
                const notasVenta = notasPorVenta[venta.venta_id] || []
                if (notasVenta.length === 0) {
                  return <span className="text-gray-400 text-sm">-</span>
                }
                const totalNC = notasVenta
                  .filter(n => n.tipo === 'CREDITO')
                  .reduce((sum, n) => sum + Number(n.total), 0)
                const totalND = notasVenta
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
              key: 'cobro',
              label: 'Estado de Cobro',
              render: (venta) => {
                const saldo = saldosPendientes[venta.venta_id] ?? venta.total_amount
                const isCobrado = saldo < 0.01
                return (
                  <div className="flex items-center gap-2">
                    {isCobrado ? (
                      <>
                        <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                        <span className="text-sm font-medium text-green-700 dark:text-green-400">Cobrado</span>
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
              render: (venta) => {
                const saldo = saldosPendientes[venta.venta_id] ?? venta.total_amount
                const isCobrado = saldo < 0.01
                return (
                  <div className="flex items-center justify-end gap-3">
                    {venta.has_journal_entry && (
                      <Button
                        variant="ghost"
                        size="md"
                        onClick={async () => {
                          try {
                            setLoadingNotas(true)
                            const notasList = await listNotasPorDocumento('VENTA', venta.venta_id, empresaId!)
                            setNotas(notasList)
                            setSelectedVentaForNotas(venta)
                            setShowNotasModal(true)
                          } catch (err) {
                            console.error('Error cargando notas:', err)
                            showMessage('error', 'Error', 'No se pudieron cargar las notas')
                          } finally {
                            setLoadingNotas(false)
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
                      onClick={async () => {
                        try {
                          setLoadingCobros(true)
                          const cobrosList = await listCobrosVenta(venta.venta_id)
                          setCobros(cobrosList)
                          setSelectedVentaForCobros(venta)
                          setShowCobrosModal(true)
                        } catch (err) {
                          console.error('Error cargando cobros:', err)
                          showMessage('error', 'Error', 'No se pudieron cargar los cobros')
                        } finally {
                          setLoadingCobros(false)
                        }
                      }}
                      title="Gestionar cobros"
                      className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20 p-2 border border-green-300 dark:border-green-700 rounded-lg hover:border-green-500 dark:hover:border-green-500 hover:shadow-sm transition-all"
                    >
                      <DollarSign className="w-6 h-6" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="md"
                      onClick={() => {
                        setSelectedVentaForDocuments(venta)
                        setShowDocumentsModal(true)
                      }}
                      title="Ver documentos adjuntos"
                      className="text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-900/20 p-2 border border-purple-300 dark:border-purple-700 rounded-lg hover:border-purple-500 dark:hover:border-purple-500 hover:shadow-sm transition-all"
                    >
                      <Paperclip className="w-6 h-6" />
                    </Button>
                    <Button variant="ghost" size="md" onClick={() => openEdit(venta)} title="Editar venta" className="hover:bg-gray-100 dark:hover:bg-gray-700 p-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:border-gray-400 dark:hover:border-gray-500 hover:shadow-sm transition-all">
                      <Edit2 className="w-6 h-6" />
                    </Button>
                    <Button variant="ghost" size="md" className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 border border-red-300 dark:border-red-700 rounded-lg hover:border-red-500 dark:hover:border-red-500 hover:shadow-sm transition-all" onClick={() => openDelete(venta)} title="Eliminar venta">
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
            <div className="text-lg font-bold mb-2 text-red-600">Eliminar Venta</div>
            <div className="text-sm text-gray-700">
              Esta acción es <span className="font-semibold text-red-600">irreversible</span>. 
              Se eliminará la venta y su asiento contable asociado.
              <br /><br />
              ¿Eliminar venta <span className="font-medium">{confirmDelete.doc_type}-{confirmDelete.series}-{confirmDelete.number}</span> (ID {confirmDelete.venta_id})?
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
              <Button className="bg-red-600 hover:bg-red-700" onClick={doDelete}>Eliminar</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Crear/Editar Venta */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => { 
            setShowForm(false)
            setEditingVenta(null)
            setShowDocuments(false)
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
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">
                      {editingVenta ? 'Editar Venta' : 'Nueva Venta'}
                    </h2>
                    <p className="text-sm text-primary-100">
                      {editingVenta ? `ID: ${editingVenta.venta_id} - Modifica la venta y su asiento contable` : 'Registra una venta. El asiento contable se generará automáticamente'}
                      <span className="ml-2 px-2 py-1 bg-white/20 rounded text-xs font-medium">
                        📅 Período: {periodo}
                      </span>
                    </p>
                  </div>
                </div>
                <button onClick={() => { 
                  setShowForm(false)
                  setEditingVenta(null)
                  setShowDocuments(false)
                  setQuantityInputs({})
                  setPriceInputs({})
                  setDateError('')
                }} className="text-white hover:text-gray-200">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4">
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <div className="text-sm text-green-900">
                  <strong>💡 Asiento automático:</strong> Al registrar la venta, se generará automáticamente 
                  el asiento contable según el PCGE peruano (12.10 Clientes Debe, 70.10 Ventas Crédito, 40.11 IGV Crédito).
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
                  Cliente <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.customer_id}
                  onChange={e => {
                    const value = e.target.value
                    if (value === 'NEW') {
                      setShowQuickAddCustomer(true)
                      setQuickCustomerForm({ tax_id: '', tax_id_type: 'RUC', name: '' })
                      setQuickCustomerErrors({})
                    } else {
                      setForm(f => ({ ...f, customer_id: Number(value) }))
                    }
                  }}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  {clientes.length === 0 ? (
                    <option value={1}>No hay clientes registrados</option>
                  ) : (
                    clientes.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.tax_id} - {c.name}
                        {c.commercial_name ? ` (${c.commercial_name})` : ''}
                      </option>
                    ))
                  )}
                  <option value="NEW" className="font-semibold text-primary-600">
                    ➕ Crear nuevo cliente
                  </option>
                </select>
                {clientes.length === 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    ⚠️ Puedes crear un cliente rápidamente desde aquí o ir a <a href="/terceros" className="underline font-medium">Proveedores y Clientes</a>
                  </p>
                )}
              </div>
              <div className="col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Líneas de Detalle <span className="text-red-500">*</span></label>
                    <InfoTooltip
                      content={
                        <div className="max-w-xs">
                          <p className="font-semibold mb-1">💡 Tip: Registro de Servicios</p>
                          <p className="text-xs leading-relaxed">
                            Puedes registrar <strong>servicios</strong> como consultorías, desarrollo de sistemas, mantenimiento, etc.
                            <br /><br />
                            <strong>Ejemplos:</strong><br />
                            • Consultoría en Sistemas: Cantidad 1, Precio 5,000.00<br />
                            • Desarrollo de Software: Cantidad 1, Precio 15,000.00<br />
                            • Mantenimiento Mensual: Cantidad 1, Precio 2,500.00<br />
                            <br />
                            El sistema calculará automáticamente el IGV (18%) y generará el asiento contable correspondiente.
                          </p>
                        </div>
                      }
                    />
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addLine} title="Agregar línea (F2)">
                    <Plus className="w-4 h-4" /> Agregar Línea <span className="text-xs ml-1 opacity-70">(F2)</span>
                  </Button>
                </div>
                <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-blue-800 dark:text-blue-300">
                      <strong>¿Eres una empresa de servicios?</strong> Puedes registrar consultorías, desarrollo de software, mantenimiento y otros servicios. 
                      El sistema aplicará IGV automáticamente según la normativa peruana.
                    </div>
                  </div>
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
                                placeholder="Ej: Consultoría, Desarrollo de Sistemas, Servicio de Mantenimiento, etc."
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
                              {form.lines.length > 1 && (
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
                    <div className="flex justify-between items-center">
                      <div className="text-xs text-gray-500">
                        💡 <strong>Atajos:</strong> F2 = Nueva línea | Ctrl+Enter = Guardar | ESC = Cancelar
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-4">
                          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Total Factura:</span>
                          <span className="text-lg font-bold text-green-600 dark:text-green-500">{formatCurrency(calculateTotals(form.lines || [], form.detraction_rate).totalTotal)}</span>
                        </div>
                        {form.detraction_rate && form.detraction_rate > 0 && (
                          <>
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-gray-600 dark:text-gray-400">Detracción ({formatNumber(form.detraction_rate * 100)}%):</span>
                              <span className="font-semibold text-amber-600 dark:text-amber-400">{formatCurrency(calculateTotals(form.lines || [], form.detraction_rate).detraction_amount || 0)}</span>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              <span className="text-gray-600 dark:text-gray-400">Neto a Recibir:</span>
                              <span className="font-bold text-blue-600 dark:text-blue-400">{formatCurrency(calculateTotals(form.lines || [], form.detraction_rate).net_amount || 0)}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {/* Campo de Detracción */}
              <div className="col-span-2">
                <label className="text-sm text-gray-600 mb-2 block">
                  Tasa de Detracción (Opcional)
                  <InfoTooltip
                    content={
                      <div className="max-w-xs">
                        <p className="font-semibold mb-1">💡 Detracciones</p>
                        <p className="text-xs leading-relaxed">
                          Algunos clientes (como el Estado, MINEM, etc.) retienen un porcentaje del total de la factura como detracción.
                          <br /><br />
                          <strong>Ejemplos:</strong><br />
                          • 12% para servicios al Estado<br />
                          • 6% para ciertos servicios<br />
                          <br />
                          El sistema calculará automáticamente el monto de detracción y el neto a recibir, y generará el asiento contable correspondiente.
                        </p>
                      </div>
                    }
                  />
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={form.detraction_rate ? form.detraction_rate * 100 : ''}
                    onChange={e => {
                      const value = e.target.value
                      if (value === '' || value === '0') {
                        setForm(f => ({ ...f, detraction_rate: null }))
                      } else {
                        const rate = parseFloat(value) / 100
                        setForm(f => ({ ...f, detraction_rate: rate }))
                      }
                    }}
                    className="w-32 border border-gray-300 rounded-xl px-4 py-2"
                    placeholder="Ej: 12"
                  />
                  <span className="text-sm text-gray-600">%</span>
                  {form.detraction_rate && form.detraction_rate > 0 && (
                    <div className="flex-1 text-sm text-gray-600 dark:text-gray-400">
                      <span className="font-semibold">Detracción:</span> {formatCurrency(calculateTotals(form.lines || [], form.detraction_rate).detraction_amount || 0)} | 
                      <span className="font-semibold ml-2">Neto:</span> {formatCurrency(calculateTotals(form.lines || [], form.detraction_rate).net_amount || 0)}
                    </div>
                  )}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  Ingrese el porcentaje de detracción (ej: 12 para 12%, 6 para 6%). Deje vacío si no aplica.
                </div>
              </div>

              <div className="col-span-2">
                <label className="text-sm text-gray-600">Glosa (opcional - se genera automáticamente)</label>
                <input
                  type="text"
                  value={form.glosa || ''}
                  onChange={e => setForm(f => ({ ...f, glosa: e.target.value || undefined }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                  placeholder={`Venta ${form.doc_type}-${form.series}-${form.number || 'XXXX'}`}
                />
                <div className="mt-1 text-xs text-gray-500">
                  Si no se especifica, se generará: &quot;Venta {form.doc_type}-{form.series}-{form.number || 'XXXX'}&quot;
                </div>
              </div>

              {/* Opción de registrar cobro automáticamente - Solo al crear */}
              {!editingVenta && (
                <div className="col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={registerCollectionImmediately}
                      onChange={(e) => setRegisterCollectionImmediately(e.target.checked)}
                      className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Registrar cobro automáticamente (misma fecha, monto total, método: Efectivo)
                    </span>
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
                    Si está marcado, se registrará el cobro completo automáticamente al guardar la venta.
                  </p>
                </div>
              )}

              {/* Sección de Documentos - Solo cuando se está editando una venta existente */}
              {editingVenta && (
                <div className="col-span-2 border-t border-gray-200 dark:border-gray-700 pt-6 mt-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Paperclip className="w-5 h-5 text-primary-600" />
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Documentos Adjuntos
                      </h3>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowDocuments(!showDocuments)}
                    >
                      {showDocuments ? 'Ocultar' : 'Ver Documentos'}
                    </Button>
                  </div>

                  {showDocuments && editingVenta && (
                    <div className="space-y-4">
                      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                          Subir Comprobante
                        </h4>
                        <DocumentUpload
                          companyId={empresaId}
                          documentType="COMPROBANTE_VENTA"
                          relatedEntityType="SALE"
                          relatedEntityId={editingVenta.venta_id}
                          title={`Comprobante ${editingVenta.doc_type}-${editingVenta.series}-${editingVenta.number}`}
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
                          documentType="COMPROBANTE_VENTA"
                          relatedEntityType="SALE"
                          relatedEntityId={editingVenta.venta_id}
                          refreshKey={documentListRefreshKey}
                          onDocumentSelect={(doc) => {
                            if (doc.mime_type === 'application/pdf') {
                              setSelectedDocument(doc)
                            }
                          }}
                          onDocumentDelete={() => {
                            showMessage('success', 'Documento Eliminado', 'El documento se eliminó correctamente')
                            // Forzar recarga de la lista de documentos
                            setDocumentListRefreshKey(prev => prev + 1)
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => { 
                setShowForm(false)
                setEditingVenta(null)
                setShowDocuments(false)
                setQuantityInputs({})
                setPriceInputs({})
                setDateError('')
              }}>
                Cancelar <span className="text-xs ml-1 opacity-70">(ESC)</span>
              </Button>
              <Button onClick={save}>
                {editingVenta ? 'Actualizar Venta y Asiento' : 'Registrar Venta y Generar Asiento'}
                <span className="text-xs ml-1 opacity-70">(Ctrl+Enter)</span>
              </Button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Crear Cliente Rápido */}
      {showQuickAddCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowQuickAddCustomer(false)}></div>
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="bg-gradient-to-r from-green-600 to-green-700 text-white p-4 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5" />
                  <h3 className="text-lg font-bold">Crear Cliente Rápido</h3>
                </div>
                <button onClick={() => setShowQuickAddCustomer(false)} className="text-white hover:text-gray-200">
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
                  value={quickCustomerForm.tax_id_type}
                  onChange={e => {
                    setQuickCustomerForm({ ...quickCustomerForm, tax_id_type: e.target.value as 'RUC' | 'DNI' | 'CE' | 'PAS', tax_id: '' })
                    setQuickCustomerErrors({ ...quickCustomerErrors, tax_id: '', tax_id_type: '' })
                  }}
                  className={`w-full border rounded-xl px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 ${
                    quickCustomerErrors.tax_id_type ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
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
                  {quickCustomerForm.tax_id_type === 'RUC' ? 'RUC' : quickCustomerForm.tax_id_type === 'DNI' ? 'DNI' : quickCustomerForm.tax_id_type} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  maxLength={quickCustomerForm.tax_id_type === 'RUC' ? 11 : quickCustomerForm.tax_id_type === 'DNI' ? 8 : 20}
                  value={quickCustomerForm.tax_id}
                  onChange={e => {
                    const value = e.target.value.replace(/\D/g, '')
                    setQuickCustomerForm({ ...quickCustomerForm, tax_id: value })
                    setQuickCustomerErrors({ ...quickCustomerErrors, tax_id: '' })
                  }}
                  placeholder={quickCustomerForm.tax_id_type === 'RUC' ? '20123456789' : quickCustomerForm.tax_id_type === 'DNI' ? '12345678' : ''}
                  className={`w-full border rounded-xl px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono ${
                    quickCustomerErrors.tax_id ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                  }`}
                />
                {quickCustomerErrors.tax_id && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">{quickCustomerErrors.tax_id}</p>
                )}
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                  Razón Social / Nombre <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={quickCustomerForm.name}
                  onChange={e => {
                    setQuickCustomerForm({ ...quickCustomerForm, name: e.target.value })
                    setQuickCustomerErrors({ ...quickCustomerErrors, name: '' })
                  }}
                  className={`w-full border rounded-xl px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 ${
                    quickCustomerErrors.name ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                  }`}
                  placeholder="Nombre o razón social"
                />
                {quickCustomerErrors.name && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">{quickCustomerErrors.name}</p>
                )}
              </div>
              
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <Button variant="outline" onClick={() => setShowQuickAddCustomer(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleQuickCreateCustomer} className="bg-green-600 hover:bg-green-700 text-white">
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

      {/* Modal de Cobros */}
      {showCobrosModal && selectedVentaForCobros && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => {
            setShowCobrosModal(false)
            setSelectedVentaForCobros(null)
            setCobros([])
          }}></div>
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6 rounded-t-2xl z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <DollarSign className="w-6 h-6 text-green-600 dark:text-green-400" />
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                      Cobros Registrados
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {selectedVentaForCobros.doc_type}-{selectedVentaForCobros.series}-{selectedVentaForCobros.number}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {(() => {
                    const saldo = saldosPendientes[selectedVentaForCobros.venta_id] ?? selectedVentaForCobros.total_amount
                    const isCobrado = saldo < 0.01
                    return (
                      <div className="text-right">
                        <div className="text-xs text-gray-500 dark:text-gray-400">Saldo Pendiente</div>
                        <div className={`text-lg font-bold ${isCobrado ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                          {formatCurrency(saldo)}
                        </div>
                      </div>
                    )
                  })()}
                  <button
                    onClick={() => {
                      setShowCobrosModal(false)
                      setSelectedVentaForCobros(null)
                      setCobros([])
                    }}
                    className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>
            </div>
            <div className="p-6">
              {loadingCobros ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Cargando cobros...</p>
                </div>
              ) : cobros.length === 0 ? (
                <div className="text-center py-8">
                  <DollarSign className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600 dark:text-gray-400">No hay cobros registrados para esta venta</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {cobros.map((cobro) => (
                    <div key={cobro.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
                              <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
                            </div>
                            <div>
                              <div className="font-semibold text-gray-900 dark:text-gray-100">
                                {formatCurrency(cobro.amount)}
                              </div>
                              <div className="text-sm text-gray-600 dark:text-gray-400">
                                {formatDate(cobro.payment_date)} • {cobro.payment_method}
                              </div>
                            </div>
                          </div>
                          {cobro.payment_reference && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 ml-14">
                              Referencia: {cobro.payment_reference}
                            </div>
                          )}
                          {cobro.notes && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 ml-14 mt-1">
                              {cobro.notes}
                            </div>
                          )}
                          {cobro.journal_entry_id && (
                            <div className="text-xs text-blue-600 dark:text-blue-400 ml-14 mt-1">
                              Asiento: #{cobro.journal_entry_id}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {cobro.journal_entry_id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                window.location.href = `/asientos?entry_id=${cobro.journal_entry_id}`
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
                              if (confirm(`¿Está seguro de eliminar este cobro de ${formatCurrency(cobro.amount)}?\n\nSe eliminará también el asiento contable asociado.`)) {
                                try {
                                  setLoadingCobros(true)
                                  const result = await deleteCobro(cobro.id)
                                  await reload()
                                  await loadSaldosPendientes()
                                  // Recargar lista de cobros
                                  const cobrosList = await listCobrosVenta(selectedVentaForCobros.venta_id)
                                  setCobros(cobrosList)
                                  showMessage('success', 'Cobro Eliminado', result.message)
                                } catch (err: any) {
                                  showMessage('error', 'Error', `Error al eliminar cobro: ${err.message || err}`)
                                } finally {
                                  setLoadingCobros(false)
                                }
                              }
                            }}
                            title="Eliminar cobro"
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
                    setShowCobrosModal(false)
                    const saldo = saldosPendientes[selectedVentaForCobros.venta_id] ?? selectedVentaForCobros.total_amount
                    if (saldo >= 0.01) {
                      setSaldoPendiente(saldo)
                      setSelectedVentaForPayment(selectedVentaForCobros)
                      setShowPaymentModal(true)
                    } else {
                      showMessage('info', 'Venta Cobrada', 'Esta venta ya está completamente cobrada.')
                    }
                  }}
                  className="w-full"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Registrar Nuevo Cobro
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Cobro */}
      {showPaymentModal && selectedVentaForPayment && (
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => {
            setShowPaymentModal(false)
            setSelectedVentaForPayment(null)
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
              await registrarCobroTesoreria({
                company_id: empresaId,
                venta_id: selectedVentaForPayment.venta_id,
                monto: data.amount,
                fecha: data.payment_date,
                metodo_pago_id: metodoPagoId,
                glosa: data.notes || `Cobro ${selectedVentaForPayment.doc_type} ${selectedVentaForPayment.series}-${selectedVentaForPayment.number}`,
                usar_motor: true
              })
              
              showMessage('success', 'Cobro Registrado', `Cobro de ${formatCurrency(data.amount)} registrado exitosamente.\n\nAsiento contable generado automáticamente por el Motor de Asientos.`)
              await reload()
              // Recargar saldos pendientes
              await loadSaldosPendientes()
            } catch (err: any) {
              showMessage('error', 'Error al Registrar Cobro', err.message || 'Error desconocido')
            }
          }}
          type="COLLECTION"
          totalAmount={selectedVentaForPayment.total_amount}
          saldoPendiente={saldoPendiente || undefined}
          documentNumber={`${selectedVentaForPayment.doc_type}-${selectedVentaForPayment.series}-${selectedVentaForPayment.number}`}
        />
      )}

      {/* Modal de Documentos */}
      {showDocumentsModal && selectedVentaForDocuments && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => {
            setShowDocumentsModal(false)
            setSelectedVentaForDocuments(null)
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
                      {selectedVentaForDocuments.doc_type}-{selectedVentaForDocuments.series}-{selectedVentaForDocuments.number}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowDocumentsModal(false)
                    setSelectedVentaForDocuments(null)
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
                documentType="COMPROBANTE_VENTA"
                relatedEntityType="SALE"
                relatedEntityId={selectedVentaForDocuments.venta_id}
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
      {showNotasModal && selectedVentaForNotas && (
        <div className="fixed inset-0 z-[50] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => {
            setShowNotasModal(false)
            setSelectedVentaForNotas(null)
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
                      {selectedVentaForNotas.doc_type}-{selectedVentaForNotas.series}-{selectedVentaForNotas.number}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowNotasModal(false)
                    setSelectedVentaForNotas(null)
                    setNotas([])
                  }}
                  className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="p-6">
              {loadingNotas ? (
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
                        <p className="text-gray-600 dark:text-gray-400">No hay notas registradas para esta venta</p>
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
                                      setLoadingNotas(true)
                                      await eliminarNota(nota.id, empresaId!)
                                      await reload()
                                      await loadSaldosPendientes()
                                      await loadNotasPorVentas()
                                      const notasList = await listNotasPorDocumento('VENTA', selectedVentaForNotas.venta_id, empresaId!)
                                      setNotas(notasList)
                                      showMessage('success', 'Nota Eliminada', 'La nota ha sido eliminada exitosamente.')
                                    } catch (err: any) {
                                      showMessage('error', 'Error', `Error al eliminar nota: ${err.message || err}`)
                                    } finally {
                                      setLoadingNotas(false)
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
                        setSelectedVentaForNota(selectedVentaForNotas)
                        setNotaTipo('CREDITO')
                        // Sugerir serie y número
                        const serieSugerida = 'NC01'
                        const maxNumero = notas
                          .filter(n => n.tipo === 'CREDITO' && n.serie === serieSugerida)
                          .map(n => parseInt(n.numero) || 0)
                          .reduce((max, num) => Math.max(max, num), 0)
                        const numeroSugerido = String(maxNumero + 1).padStart(6, '0')
                        const glosaSugerida = `Nota de Crédito ${serieSugerida}-${numeroSugerido} relacionada a ${selectedVentaForNotas.doc_type} ${selectedVentaForNotas.series}-${selectedVentaForNotas.number}`
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
                        setSelectedVentaForNota(selectedVentaForNotas)
                        setNotaTipo('DEBITO')
                        // Sugerir serie y número
                        const serieSugerida = 'ND01'
                        const maxNumero = notas
                          .filter(n => n.tipo === 'DEBITO' && n.serie === serieSugerida)
                          .map(n => parseInt(n.numero) || 0)
                          .reduce((max, num) => Math.max(max, num), 0)
                        const numeroSugerido = String(maxNumero + 1).padStart(6, '0')
                        const glosaSugerida = `Nota de Débito ${serieSugerida}-${numeroSugerido} relacionada a ${selectedVentaForNotas.doc_type} ${selectedVentaForNotas.series}-${selectedVentaForNotas.number}`
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
      {showNotaModal && selectedVentaForNota && notaTipo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => {
            setShowNotaModal(false)
            setSelectedVentaForNota(null)
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
                    {notaTipo === 'CREDITO' ? 'Nota de Crédito' : 'Nota de Débito'} - Venta
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {selectedVentaForNota.doc_type}-{selectedVentaForNota.series}-{selectedVentaForNota.number}
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => {
                setShowNotaModal(false)
                setSelectedVentaForNota(null)
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

              {/* Formulario */}
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
                      const glosaActualizada = notaForm.glosa || `Nota de ${notaTipo === 'CREDITO' ? 'Crédito' : 'Débito'} ${notaForm.serie}-${notaForm.numero} relacionada a ${selectedVentaForNota.doc_type} ${selectedVentaForNota.series}-${selectedVentaForNota.number}. Motivo: ${motivoText}`
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
                  setSelectedVentaForNota(null)
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
                        await registrarNotaCreditoVenta({
                          company_id: empresaId!,
                          venta_id: selectedVentaForNota.venta_id,
                          serie: notaForm.serie,
                          numero: notaForm.numero,
                          fecha_emision: notaForm.fecha_emision,
                          motivo: notaForm.motivo,
                          monto_base: notaForm.monto_base,
                          glosa: notaForm.glosa || undefined,
                          usar_motor: true
                        })
                      } else {
                        await registrarNotaDebitoVenta({
                          company_id: empresaId!,
                          venta_id: selectedVentaForNota.venta_id,
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
                      setSelectedVentaForNota(null)
                      setNotaTipo(null)
                      await reload()
                      await loadSaldosPendientes()
                      await loadNotasPorVentas()
                      // Recargar notas en el modal si está abierto
                      if (showNotasModal && selectedVentaForNotas) {
                        const notasList = await listNotasPorDocumento('VENTA', selectedVentaForNotas.venta_id, empresaId!)
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
