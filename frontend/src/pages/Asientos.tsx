import React, { useState, useEffect, useMemo } from 'react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Table, TableHeader, TableHeaderCell, TableBody, TableRow, TableCell } from '@/components/ui/Table'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { PageHeader } from '@/components/ui/PageHeader'
import { ActionBar } from '@/components/ui/ActionBar'
import { FilterBar } from '@/components/ui/FilterBar'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { Plus, Edit2, Trash2, FileText, Search, Eye, X, AlertCircle, CheckCircle, ChevronDown, ChevronRight, Download, RotateCcw, Copy, Filter, XCircle, Calendar, Loader2, AlertTriangle, ChevronUp, ArrowUpDown, User, Shield, Send, Undo2, Wrench } from 'lucide-react'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { MessageModal } from '@/components/ui/MessageModal'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Badge } from '@/components/ui/Badge'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/Alert'
import { Tooltip } from '@/components/ui/Tooltip'
import { TraceabilityPanel } from '@/components/ui/TraceabilityPanel'
import { BaseAccountingNotifications } from '@/components/ui/BaseAccountingNotifications'
import { ActiveContextInfo } from '@/components/ui/ActiveContextInfo'
import { getBaseAccountingChecks, type BaseAccountingCheck } from '@/api'
import { Tabs, TabsList, TabsTriggerWithValue, TabsContentWithValue } from '@/components/ui/Tabs'
import { listJournalEntries, getJournalEntry, createJournalEntry, updateJournalEntry, voidJournalEntry, reactivateJournalEntry, postDraftEntry, getDraftEntryWarnings, reverseEntry, createAdjustmentEntry, listAccounts, listPeriods, suggestEntry, suggestAccounts, getEntryTemplates, getSimilarEntries, API_BASE, validateJournalEntry, apiFetch, type JournalEntry, type JournalEntryDetail, type EntryLineIn, type Account, type SuggestedEntryLine, type EntryTemplate, type AccountValidationResult } from '@/api'
import { useOrg } from '@/stores/org'
import { useAuth } from '@/stores/auth'

export default function Asientos() {
  const { empresaId, periodo } = useOrg()
  const { user } = useAuth()
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [periods, setPeriods] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingEntry, setLoadingEntry] = useState(false) // Estado de carga específico para cargar asiento desde URL
  const [showForm, setShowForm] = useState(false)
  const [viewingEntry, setViewingEntry] = useState<JournalEntryDetail | null>(null)
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null) // ID del asiento que se está editando
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    glosa: '',
    estimatedAmount: '',
    lines: [{ account_code: '', debit: 0, credit: 0, memo: '' }] as EntryLineIn[],
  })
  const [suggestions, setSuggestions] = useState<SuggestedEntryLine[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [templates, setTemplates] = useState<EntryTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<EntryTemplate | null>(null)
  const [accountSearch, setAccountSearch] = useState<Record<number, string>>({})
  const [accountSuggestions, setAccountSuggestions] = useState<Record<number, Account[]>>({})
  const [currentStep, setCurrentStep] = useState(1) // Paso actual en modo guiado
  const [showGuidedModal, setShowGuidedModal] = useState(false) // Modal del asistente
  const [showTemplatesModal, setShowTemplatesModal] = useState(false) // Modal de plantillas (deprecated)
  const [showSuggestionsModal, setShowSuggestionsModal] = useState(false) // Modal de sugerencias (deprecated)
  const [showWizardModal, setShowWizardModal] = useState(false) // Wizard combinado de plantillas y sugerencias
  const [wizardStep, setWizardStep] = useState(1) // Paso actual del wizard (1: plantilla, 2: glosa/monto, 3: sugerencias)
  const [wizardData, setWizardData] = useState({ glosa: '', monto: '', template: null as EntryTemplate | null })
  const [focusedInputs, setFocusedInputs] = useState<Record<string, boolean>>({}) // Para mostrar formato en inputs
  const [inputValues, setInputValues] = useState<Record<string, string>>({}) // Valores locales de inputs cuando están enfocados
  const [similarEntries, setSimilarEntries] = useState<any[]>([])
  const [loadingSimilar, setLoadingSimilar] = useState(false)
  const [filters, setFilters] = useState({
    period_id: undefined as number | undefined,
    date_from: '',
    date_to: '',
    status: '',
    glosa_search: '', // Búsqueda en glosas
    correlative_search: '', // Búsqueda rápida por número de asiento
  })
  
  // Función para limpiar todos los filtros
  const clearFilters = () => {
    setFilters({
      period_id: currentPeriod?.id,
      date_from: '',
      date_to: '',
      status: '',
      glosa_search: '',
      correlative_search: '',
    })
  }
  
  // Verificar si hay filtros activos (excluyendo period_id que es obligatorio)
  const hasActiveFilters = filters.date_from || filters.date_to || filters.status || filters.glosa_search.trim() || filters.correlative_search.trim()
  const [exporting, setExporting] = useState(false)
  const [messageModal, setMessageModal] = useState<{ type: 'success' | 'error'; title: string; message: string } | null>(null)
  const [confirmVoid, setConfirmVoid] = useState<JournalEntry | null>(null)
  const [voidError, setVoidError] = useState<string | null>(null)
  const [voidLoading, setVoidLoading] = useState(false)
  const [confirmPost, setConfirmPost] = useState<JournalEntry | null>(null)
  const [postError, setPostError] = useState<string | null>(null)
  const [postLoading, setPostLoading] = useState(false)
  const [postWarnings, setPostWarnings] = useState<Array<{ code: string; message: string; requires_confirmation: boolean }>>([])
  const [confirmedWarningCodes, setConfirmedWarningCodes] = useState<Set<string>>(new Set())
  const [confirmReverse, setConfirmReverse] = useState<JournalEntry | null>(null)
  const [reverseError, setReverseError] = useState<string | null>(null)
  const [reverseLoading, setReverseLoading] = useState(false)
  const [reverseReason, setReverseReason] = useState('')
  const [confirmAdjust, setConfirmAdjust] = useState<JournalEntry | null>(null)
  const [adjustError, setAdjustError] = useState<string | null>(null)
  const [adjustLoading, setAdjustLoading] = useState(false)
  const [adjustReason, setAdjustReason] = useState('')
  const [confirmReactivate, setConfirmReactivate] = useState<JournalEntry | null>(null)
  const [draftModal, setDraftModal] = useState<{ draft: any; onConfirm: () => void; onCancel: () => void } | null>(null)
  const [validationResult, setValidationResult] = useState<AccountValidationResult | null>(null)
  const [validating, setValidating] = useState(false)
  const [expandedEntries, setExpandedEntries] = useState<Set<number>>(new Set())
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null)
  const [entryDetails, setEntryDetails] = useState<Record<number, JournalEntryDetail>>({})
  const [baseCheckWizard, setBaseCheckWizard] = useState<BaseAccountingCheck | null>(null) // Wizard para crear asiento desde notificación
  const [activeMainTab, setActiveMainTab] = useState<'entries' | 'checks'>('entries') // Tab principal: asientos o verificaciones
  const [baseChecksCount, setBaseChecksCount] = useState(0) // Contador de verificaciones pendientes

  const canWrite = useMemo(() => user?.role === 'ADMINISTRADOR' || user?.role === 'CONTADOR' || user?.role === 'OPERADOR', [user])

  // Función para obtener el nombre del libro desde el origen
  const getLibroName = (origin: string): string => {
    const libroMap: Record<string, string> = {
      'VENTAS': 'Ventas',
      'COMPRAS': 'Compras',
      'TESORERIA': 'Caja',
      'CAJA_BANCOS': 'Caja',
      'INVENTARIO': 'Inventario',
      'INVENTARIOS': 'Inventario',
      'NOMINAS': 'Nóminas',
      'NOMINA': 'Nóminas',
      'MANUAL': 'Manual',
      'MOTOR': 'Motor',
      'LEGACY': 'Legacy',
    }
    return libroMap[origin] || origin || 'Manual'
  }

  // Función para formatear el correlativo (quitar el mes del medio si existe)
  const formatCorrelative = (correlative: string | undefined | null): string => {
    if (!correlative) return ''
    // Si tiene formato XX-XX-XXXXX, mostrar solo XX-XXXXX (sin el mes)
    const parts = correlative.split('-')
    if (parts.length === 3) {
      return `${parts[0]}-${parts[2]}`
    }
    return correlative
  }

  // Función para formatear fecha corta (DD/MM)
  const formatDateShort = (dateStr: string): string => {
    if (!dateStr) return ''
    try {
      const [year, month, day] = dateStr.split('-').map(Number)
      return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`
    } catch {
      return dateStr
    }
  }

  // Función para expandir/colapsar asiento
  const toggleExpand = async (entryId: number) => {
    const newExpanded = new Set(expandedEntries)
    if (newExpanded.has(entryId)) {
      newExpanded.delete(entryId)
    } else {
      newExpanded.add(entryId)
      // Cargar detalles si no están cargados
      if (!entryDetails[entryId]) {
        try {
          const detail = await getJournalEntry(entryId)
          setEntryDetails(prev => ({ ...prev, [entryId]: detail }))
        } catch (err: any) {
          console.error('Error cargando detalles:', err)
        }
      }
    }
    setExpandedEntries(newExpanded)
  }

  // Función para ordenar
  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  useEffect(() => {
    loadPeriods()
    reload()
  }, [empresaId])

  // Leer entry_id de la URL y abrir el asiento automáticamente
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const entryIdParam = params.get('entry_id')
    if (entryIdParam && empresaId && !loadingEntry) {
      const entryId = parseInt(entryIdParam, 10)
      if (!isNaN(entryId) && entryId > 0) {
        setLoadingEntry(true)
        // Cargar el asiento y abrirlo
        getJournalEntry(entryId)
          .then(entry => {
            setViewingEntry(entry)
            setEditingEntryId(null)
            setShowForm(true)
            setLoadingEntry(false)
            // Limpiar el parámetro de la URL después de abrirlo
            const newUrl = window.location.pathname
            window.history.replaceState({}, '', newUrl)
          })
          .catch(err => {
            console.error('Error cargando asiento desde URL:', err)
            setLoadingEntry(false)
            // Mostrar mensaje de error
            setMessageModal({
              type: 'error',
              title: 'Error',
              message: `No se pudo cargar el asiento #${entryId}: ${err.message || err || 'Error desconocido'}`
            })
            // Limpiar el parámetro de la URL incluso si hay error
            const newUrl = window.location.pathname
            window.history.replaceState({}, '', newUrl)
          })
      }
    }
  }, [empresaId, loadingEntry]) // Ejecutar cuando cambie empresaId

  // Obtener el periodo actual seleccionado en el topbar
  const currentPeriod = useMemo(() => {
    if (!periodo || periods.length === 0) return null
    const [year, month] = periodo.split('-').map(Number)
    return periods.find((p: any) => p.year === year && p.month === month) || null
  }, [periodo, periods])

  // Actualizar filtro de periodo cuando cambie el periodo seleccionado en el topbar (OBLIGATORIO)
  // También limpiar filtros de fecha ya que son específicos del período
  useEffect(() => {
    if (currentPeriod) {
      setFilters(f => ({ 
        ...f, 
        period_id: currentPeriod.id,
        // Limpiar filtros de fecha cuando cambia el período
        date_from: '',
        date_to: ''
      }))
    }
  }, [currentPeriod?.id])

  useEffect(() => {
    reload()
  }, [filters, empresaId, currentPeriod?.id])

  async function loadPeriods() {
    try {
      const data = await listPeriods(empresaId)
      setPeriods(data)
      // Asociar periodo actual si existe
      const [year, month] = periodo.split('-').map(Number)
      const currentPeriod = data.find((p: any) => p.year === year && p.month === month)
      if (currentPeriod) {
        setFilters(f => ({ ...f, period_id: currentPeriod.id }))
      }
    } catch (err: any) {
      console.error('Error cargando periodos:', err)
    }
  }

  async function reload() {
    try {
      setLoading(true)
      // Construir parámetros de filtro excluyendo valores vacíos
      // El periodo del topbar es OBLIGATORIO
      const params: any = {
        company_id: empresaId,
      }
      
      // SIEMPRE usar el periodo seleccionado en el topbar si está disponible (OBLIGATORIO)
      if (currentPeriod) {
        params.period_id = currentPeriod.id
      } else if (filters.period_id) {
        // Fallback al filtro si no hay periodo en topbar
        params.period_id = filters.period_id
      } else {
        // Si no hay periodo, no cargar nada y mostrar mensaje
        setEntries([])
        setLoading(false)
        return
      }
      
      // Otros filtros opcionales
      if (filters.date_from && filters.date_from.trim()) params.date_from = filters.date_from.trim()
      if (filters.date_to && filters.date_to.trim()) params.date_to = filters.date_to.trim()
      if (filters.status && filters.status.trim()) params.status = filters.status.trim()
      
      const data = await listJournalEntries(params)
      setEntries(data)
    } catch (err: any) {
      showMessage('error', 'Error', `Error al cargar asientos: ${err.message || err}`)
    } finally {
      setLoading(false)
    }
  }

  async function loadAccounts() {
    try {
      const data = await listAccounts(empresaId)
      setAccounts(data)
    } catch (err: any) {
      console.error('Error cargando cuentas:', err)
    }
  }

  async function loadTemplates() {
    try {
      const data = await getEntryTemplates(empresaId)
      setTemplates(data.templates)
    } catch (err: any) {
      console.error('Error cargando plantillas:', err)
    }
  }

  function openCreate() {
    // Validar que hay un periodo seleccionado
    if (!currentPeriod) {
      showMessage('error', 'Periodo Requerido', `Debes seleccionar un periodo contable en la barra superior antes de crear un asiento.\n\nPeriodo actual: ${periodo || 'No seleccionado'}`)
      return
    }
    
    // Validar que el período no esté cerrado (a menos que sea ADMINISTRADOR)
    if (currentPeriod.status === 'CERRADO' && user?.role !== 'ADMINISTRADOR') {
      showMessage('error', 'Periodo Cerrado', 
        `El período ${currentPeriod.year}-${String(currentPeriod.month).padStart(2, '0')} está cerrado.\n\n` +
        `No se pueden crear asientos en períodos cerrados.\n\n` +
        `Solo un administrador puede reabrir el período para realizar modificaciones.`)
      return
    }
    
    // Si es ADMINISTRADOR y el período está cerrado, advertir
    if (currentPeriod.status === 'CERRADO' && user?.role === 'ADMINISTRADOR') {
      if (!confirm(`⚠️ ADVERTENCIA: El período ${currentPeriod.year}-${String(currentPeriod.month).padStart(2, '0')} está cerrado.\n\n` +
                   `Como administrador, puedes crear asientos, pero se recomienda reabrir el período primero.\n\n` +
                   `¿Deseas continuar con la creación del asiento?`)) {
        return
      }
    }
    
    loadAccounts()
    loadTemplates()
    
    // Establecer la fecha por defecto dentro del periodo seleccionado
    // Usar la fecha de hoy si está dentro del periodo, o el primer día del mes del periodo
    const today = new Date()
    const todayYear = today.getFullYear()
    const todayMonth = today.getMonth() + 1
    
    let defaultDate: string
    if (todayYear === currentPeriod.year && todayMonth === currentPeriod.month) {
      // Si estamos en el periodo actual, usar la fecha de hoy
      defaultDate = today.toISOString().split('T')[0]
    } else {
      // Usar el primer día del mes del periodo
      defaultDate = `${currentPeriod.year}-${String(currentPeriod.month).padStart(2, '0')}-01`
    }
    
    setForm({
      date: defaultDate,
      glosa: '',
      estimatedAmount: '',
      lines: [{ account_code: '', debit: 0, credit: 0, memo: '' }],
    })
    setSuggestions([])
    setSelectedTemplate(null)
    setShowTemplatesModal(false)
    setViewingEntry(null)
    setEditingEntryId(null) // No estamos editando
    setInputValues({}) // Limpiar valores locales de inputs
    setFocusedInputs({}) // Limpiar estados de focus
    setShowForm(true)
  }

  function applyTemplate(template: EntryTemplate) {
    const total = form.estimatedAmount ? Number(form.estimatedAmount) : 0
    let base = 0
    let igv = 0
    
    if (total > 0) {
      base = Math.round((total / 1.18) * 100) / 100  // Redondear a 2 decimales
      igv = Math.round((total - base) * 100) / 100    // Redondear a 2 decimales
    }
    
    const newLines: EntryLineIn[] = template.lines.map(line => {
      let amount = 0
      if (line.auto_calculate === 'base') {
        amount = base
      } else if (line.auto_calculate === 'igv') {
        amount = igv
      } else if (line.auto_calculate === 'total') {
        amount = total
      }
      
      // Asegurar que el monto esté redondeado a 2 decimales
      amount = Math.round(amount * 100) / 100
      
      return {
        account_code: line.account_code,
        debit: line.side === 'debit' ? amount : 0,
        credit: line.side === 'credit' ? amount : 0,
        memo: '',
      }
    }).filter(line => line.account_code) // Filtrar líneas opcionales vacías

    setForm(f => ({
      ...f,
      glosa: f.glosa || template.glosa_example || f.glosa,
      lines: newLines,
    }))
    setSelectedTemplate(template)
    setShowTemplatesModal(false) // Cerrar modal
    
    // Mostrar mensaje con MessageModal
    const tipMessage = !form.estimatedAmount && (template.id.includes('igv') || template.id.includes('compra') || template.id.includes('venta'))
      ? `\n\n💡 Tip: Ingresa el monto total (con IGV) en el campo "Monto Total" para que el sistema calcule automáticamente la base y el IGV.`
      : '\n\n💡 Tip: Revisa los montos y ajusta según sea necesario.'
    
    showMessage('success', 'Plantilla Aplicada', `Se ha aplicado la plantilla "${template.name}"\n\n${template.description || 'Las cuentas y estructura han sido configuradas automáticamente.'}\n\n${newLines.length > 0 ? `Se han creado ${newLines.length} línea(s) de asiento.` : ''}${tipMessage}`)
  }

  async function searchAccountsForLine(lineIndex: number, query: string) {
    setAccountSearch({ ...accountSearch, [lineIndex]: query })
    if (query.length < 2) {
      setAccountSuggestions({ ...accountSuggestions, [lineIndex]: [] })
      return
    }
    
    // Búsqueda local rápida primero
    const localFiltered = accounts.filter(acc => 
      acc.code.toLowerCase().includes(query.toLowerCase()) ||
      acc.name.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 8)
    
    setAccountSuggestions({ ...accountSuggestions, [lineIndex]: localFiltered })
    
    // Si hay pocos resultados locales y el query es descriptivo, usar API de sugerencias
    if (localFiltered.length < 3 && query.length > 3) {
      try {
        const apiResult = await suggestAccounts(empresaId, query)
        if (apiResult.suggestions.length > 0) {
          // Combinar resultados locales con sugerencias de API
          const combined = [...localFiltered]
          apiResult.suggestions.forEach(sug => {
            const exists = combined.find(c => c.code === sug.code)
            if (!exists) {
              // Convertir AccountSuggestion a Account
              const acc = accounts.find(a => a.code === sug.code)
              if (acc) combined.push(acc)
            }
          })
          setAccountSuggestions({ ...accountSuggestions, [lineIndex]: combined.slice(0, 8) })
        }
      } catch (err) {
        // Silenciar errores de API, usar solo búsqueda local
      }
    }
  }

  function selectAccountForLine(lineIndex: number, account: Account) {
    updateLine(lineIndex, 'account_code', account.code)
    setAccountSearch({ ...accountSearch, [lineIndex]: account.code })
    setAccountSuggestions({ ...accountSuggestions, [lineIndex]: [] })
  }

  function showMessage(type: 'success' | 'error', title: string, message: string) {
    setMessageModal({ type, title, message })
  }

  async function requestSuggestions(glosa: string, monto: number | undefined) {
    if (!glosa.trim()) {
      showMessage('error', 'Campo Requerido', 'Ingresa una descripción primero')
      return
    }
    try {
      setLoadingSuggestions(true)
      const result = await suggestEntry(empresaId, glosa, monto)
      setSuggestions(result.suggested_lines)
      if (result.suggested_lines.length === 0) {
        showMessage('error', 'Sin Sugerencias', `No se encontraron sugerencias para: "${glosa}"\n\nIntenta usar términos como:\n• "Pago a proveedor por factura..."\n• "Cobro de cliente..."\n• "Compra de mercadería..."\n• "Venta de productos..."\n\nTambién asegúrate de tener el PCGE sembrado para tu empresa.`)
        return false
      } else {
        return true
      }
    } catch (err: any) {
      showMessage('error', 'Error', `Error al obtener sugerencias: ${err.message || err}`)
      return false
    } finally {
      setLoadingSuggestions(false)
    }
  }

  function applyWizardData() {
    let finalLines: EntryLineIn[] = []
    
    // Si hay plantilla seleccionada, usar sus líneas
    if (wizardData.template) {
      const total = wizardData.monto ? Number(wizardData.monto) : 0
      let base = 0
      let igv = 0
      
      if (total > 0) {
        base = Math.round((total / 1.18) * 100) / 100
        igv = Math.round((total - base) * 100) / 100
      }
      
      finalLines = wizardData.template.lines.map(line => {
        let amount = 0
        if (line.auto_calculate === 'base') {
          amount = base
        } else if (line.auto_calculate === 'igv') {
          amount = igv
        } else if (line.auto_calculate === 'total') {
          amount = total
        }
        amount = Math.round(amount * 100) / 100
        
        return {
          account_code: line.account_code,
          debit: line.side === 'debit' ? amount : 0,
          credit: line.side === 'credit' ? amount : 0,
          memo: '',
        }
      }).filter(line => line.account_code)
    } 
    // Si hay sugerencias, usar las sugerencias
    else if (suggestions.length > 0) {
      finalLines = suggestions.map(s => ({
        account_code: s.account_code,
        debit: s.side === 'debit' ? (s.amount ?? 0) : 0,
        credit: s.side === 'credit' ? (s.amount ?? 0) : 0,
        memo: '',
      }))
    }
    
    // Aplicar al formulario
    setForm(f => ({
      ...f,
      glosa: wizardData.glosa || f.glosa,
      estimatedAmount: wizardData.monto || f.estimatedAmount,
      lines: finalLines.length > 0 ? finalLines : f.lines,
    }))
    
    if (wizardData.template) {
      setSelectedTemplate(wizardData.template)
    }
    
    // Limpiar wizard
    setWizardData({ glosa: '', monto: '', template: null })
    setSuggestions([])
    setWizardStep(1)
    setShowWizardModal(false)
    
    showMessage('success', 'Asiento Configurado', finalLines.length > 0 
      ? `Se han configurado ${finalLines.length} línea(s) de asiento.\n\nRevisa los montos y ajusta según sea necesario.`
      : 'Configuración aplicada. Completa las líneas del asiento.')
  }

  async function applySimilarEntry(similar: any) {
    try {
      const entry = await getJournalEntry(similar.id)
      setForm(f => ({
        ...f,
        glosa: f.glosa || entry.glosa,
        lines: entry.lines.map(l => ({
          account_code: l.account_code,
          debit: l.debit,
          credit: l.credit,
          memo: l.memo || '',
        }))
      }))
      setSimilarEntries([])
      showMessage('success', 'Asiento Aplicado', `Asiento similar #${entry.id} aplicado. Revisa y ajusta los montos si es necesario.`)
    } catch (err: any) {
      showMessage('error', 'Error', `Error al cargar asiento: ${err.message || err}`)
    }
  }

  async function openView(id: number) {
    try {
      const entry = await getJournalEntry(id)
      setViewingEntry(entry)
      setEditingEntryId(null) // No estamos editando, solo viendo
      setShowForm(true)
    } catch (err: any) {
      showMessage('error', 'Error', `Error al cargar asiento: ${err.message || err}`)
    }
  }

  async function openEdit(id: number) {
    try {
      const entry = await getJournalEntry(id)
      if (entry.status === 'VOIDED') {
        showMessage('error', 'Asiento Anulado', 'No se puede editar un asiento anulado')
        return
      }
      loadAccounts()
      loadTemplates()
      setEditingEntryId(id)
      setViewingEntry(null) // No estamos viendo, estamos editando
      setForm({
        date: entry.date,
        glosa: entry.glosa || '',
        estimatedAmount: '',
        lines: entry.lines.map(l => ({
          account_code: l.account_code,
          debit: l.debit,
          credit: l.credit,
          memo: l.memo || '',
        })),
      })
      setSuggestions([])
      setSelectedTemplate(null)
      setShowTemplatesModal(false)
      setInputValues({}) // Limpiar valores locales de inputs
      setFocusedInputs({}) // Limpiar estados de focus
      setShowForm(true)
    } catch (err: any) {
      showMessage('error', 'Error', `Error al cargar asiento para editar: ${err.message || err}`)
    }
  }

  function addLine() {
    setForm(f => {
      const newLines = [...f.lines, { account_code: '', debit: 0, credit: 0, memo: '' }]
      // Enfocar automáticamente el campo de cuenta de la nueva línea
      setTimeout(() => {
        const newLineIdx = newLines.length - 1
        const input = document.querySelector(`input[data-line-account="${newLineIdx}"]`) as HTMLInputElement
        input?.focus()
      }, 100)
      return { ...f, lines: newLines }
    })
  }

  function duplicateLine(idx: number) {
    const lineToDuplicate = form.lines[idx]
    const newLine: EntryLineIn = {
      account_code: lineToDuplicate.account_code,
      debit: lineToDuplicate.debit,
      credit: lineToDuplicate.credit,
      memo: lineToDuplicate.memo || ''
    }
    setForm(f => {
      const newLines = [...f.lines.slice(0, idx + 1), newLine, ...f.lines.slice(idx + 1)]
      // Enfocar el campo de cuenta de la nueva línea duplicada
      setTimeout(() => {
        const newLineIdx = idx + 1
        const input = document.querySelector(`input[data-line-account="${newLineIdx}"]`) as HTMLInputElement
        input?.focus()
        // Seleccionar el texto para facilitar edición
        input?.select()
      }, 100)
      return { ...f, lines: newLines }
    })
  }

  function removeLine(idx: number) {
    setForm(f => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }))
  }

  function updateLine(idx: number, field: keyof EntryLineIn, value: any) {
    setForm(f => ({
      ...f,
      lines: f.lines.map((line, i) => i === idx ? { ...line, [field]: value } : line),
    }))
    // NO limpiar el valor local cuando se actualiza desde onChange/onBlur para evitar pérdida de valores
    // Solo limpiar cuando se actualiza desde fuera (ej: aplicar plantilla, duplicar, etc.)
    if (field !== 'debit' && field !== 'credit') {
      // Para otros campos, no hacer nada especial
    }
  }

  // Validación en tiempo real
  const [realTimeValidation, setRealTimeValidation] = useState<{
    isBalanced: boolean
    errors: Array<{ message: string }>
    warnings: Array<{ message: string }>
    validating: boolean
  }>({
    isBalanced: false,
    errors: [],
    warnings: [],
    validating: false
  })

  // Validar en tiempo real cuando cambian las líneas o la glosa
  useEffect(() => {
    if (!showForm || viewingEntry) return
    
    const timeoutId = setTimeout(async () => {
      if (form.lines.length >= 2 && form.glosa.trim()) {
        setRealTimeValidation(prev => ({ ...prev, validating: true }))
        try {
          const result = await validateJournalEntry({
            company_id: empresaId,
            date: form.date,
            glosa: form.glosa,
            lines: form.lines.filter(l => l.account_code.trim())
          })
          const isBalanced = Math.abs(
            form.lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0) -
            form.lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0)
          ) < 0.01
          setRealTimeValidation({
            isBalanced,
            errors: result.errors || [],
            warnings: result.warnings || [],
            validating: false
          })
        } catch (err) {
          setRealTimeValidation(prev => ({ ...prev, validating: false }))
        }
      } else {
        const isBalanced = Math.abs(
          form.lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0) -
          form.lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0)
        ) < 0.01
        setRealTimeValidation({
          isBalanced,
          errors: [],
          warnings: [],
          validating: false
        })
      }
    }, 500) // Debounce de 500ms

    return () => clearTimeout(timeoutId)
  }, [form.lines, form.glosa, showForm, viewingEntry, empresaId])

  const totals = useMemo(() => {
    const debit = form.lines.reduce((sum, l) => {
      const val = Math.round((Number(l.debit) || 0) * 100) / 100
      return sum + val
    }, 0)
    const credit = form.lines.reduce((sum, l) => {
      const val = Math.round((Number(l.credit) || 0) * 100) / 100
      return sum + val
    }, 0)
    const roundedDebit = Math.round(debit * 100) / 100
    const roundedCredit = Math.round(credit * 100) / 100
    return { 
      debit: roundedDebit, 
      credit: roundedCredit, 
      balanced: Math.abs(roundedDebit - roundedCredit) < 0.01 
    }
  }, [form.lines])

  // Actualizar automáticamente el paso del asistente según el progreso
  useEffect(() => {
    if (!showGuidedModal || viewingEntry) return
    
    if (!form.glosa.trim()) {
      setCurrentStep(1)
    } else if (form.lines.every(l => !l.account_code.trim())) {
      setCurrentStep(2)
    } else if (form.lines.every(l => !(l.debit > 0 || l.credit > 0))) {
      setCurrentStep(3)
    } else if (!totals.balanced) {
      setCurrentStep(4)
    }
  }, [form.glosa, form.lines, totals.balanced, showGuidedModal, viewingEntry])

  // Filtrar entradas por búsqueda de glosa
  const filteredEntries = useMemo(() => {
    // Primero filtrar por período del topbar (obligatorio)
    let filtered = entries
    if (currentPeriod) {
      filtered = entries.filter(e => {
        // Si el asiento tiene period_id, usarlo directamente
        if ((e as any).period_id) {
          return (e as any).period_id === currentPeriod.id
        }
        // Fallback: comparar año y mes de la fecha
        const [year, month] = e.date.split('-').map(Number)
        return year === currentPeriod.year && month === currentPeriod.month
      })
    }
    
    // Luego filtrar por búsqueda en glosa
    if (filters.glosa_search.trim()) {
      const searchLower = filters.glosa_search.toLowerCase()
      filtered = filtered.filter(e => e.glosa?.toLowerCase().includes(searchLower))
    }
    
    // Búsqueda rápida por número de asiento (correlativo o ID)
    if (filters.correlative_search.trim()) {
      const searchTerm = filters.correlative_search.trim()
      filtered = filtered.filter(e => {
        // Buscar en correlativo
        if (e.correlative && e.correlative.includes(searchTerm)) return true
        // Buscar en ID
        if (String(e.id).includes(searchTerm)) return true
        // Buscar en formato formateado
        const formatted = formatCorrelative(e.correlative)
        if (formatted && formatted.includes(searchTerm)) return true
        return false
      })
    }
    
    return filtered
  }, [entries, filters.glosa_search, filters.correlative_search, currentPeriod])

  // Entradas ordenadas (debe ir después de filteredEntries)
  const sortedEntries = useMemo(() => {
    if (!sortConfig) return filteredEntries
    
    const sorted = [...filteredEntries].sort((a, b) => {
      let aVal: any, bVal: any
      
      switch (sortConfig.key) {
        case 'correlative':
          aVal = a.correlative || `999999-${a.id}`
          bVal = b.correlative || `999999-${b.id}`
          break
        case 'date':
          aVal = a.date
          bVal = b.date
          break
        case 'libro':
          aVal = getLibroName(a.origin)
          bVal = getLibroName(b.origin)
          break
        case 'glosa':
          aVal = a.glosa || ''
          bVal = b.glosa || ''
          break
        case 'currency':
          aVal = a.currency || 'PEN'
          bVal = b.currency || 'PEN'
          break
        case 'total':
          aVal = Math.max(a.total_debit, a.total_credit)
          bVal = Math.max(b.total_debit, b.total_credit)
          break
        case 'status':
          aVal = a.status
          bVal = b.status
          break
        default:
          return 0
      }
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })
    
    return sorted
  }, [filteredEntries, sortConfig])

  // Guardado automático de borrador cada 30 segundos
  useEffect(() => {
    if (!showForm || viewingEntry || !form.glosa.trim()) return

    const timer = setTimeout(() => {
      const draft = {
        date: form.date,
        glosa: form.glosa,
        estimatedAmount: form.estimatedAmount,
        lines: form.lines,
        timestamp: new Date().toISOString(),
      }
      localStorage.setItem(`asiento_draft_${empresaId}`, JSON.stringify(draft))
      console.log('💾 Borrador guardado automáticamente')
    }, 30000) // 30 segundos

    return () => clearTimeout(timer)
  }, [form, showForm, viewingEntry, empresaId])

  // Cargar borrador al abrir el formulario
  useEffect(() => {
    if (showForm && !viewingEntry && !selectedTemplate) {
      const draftStr = localStorage.getItem(`asiento_draft_${empresaId}`)
      if (draftStr) {
        try {
          const draft = JSON.parse(draftStr)
          // Verificar que el borrador sea reciente (menos de 7 días)
          const draftDate = new Date(draft.timestamp)
          const daysSince = (new Date().getTime() - draftDate.getTime()) / (1000 * 60 * 60 * 24)

          if (daysSince < 7) {
            // Mostrar modal de confirmación en lugar de confirm()
            setDraftModal({
              draft,
              onConfirm: () => {
                setForm({
                  date: draft.date || new Date().toISOString().split('T')[0],
                  glosa: draft.glosa || '',
                  estimatedAmount: draft.estimatedAmount || '',
                  lines: draft.lines || [{ account_code: '', debit: 0, credit: 0, memo: '' }],
                })
                setDraftModal(null)
              },
              onCancel: () => {
                localStorage.removeItem(`asiento_draft_${empresaId}`)
                setDraftModal(null)
              }
            })
          } else {
            localStorage.removeItem(`asiento_draft_${empresaId}`)
          }
        } catch (err) {
          console.error('Error cargando borrador:', err)
        }
      }
    }
  }, [showForm, viewingEntry, selectedTemplate, empresaId])

  // Atajos de teclado mejorados (siempre activos, no solo en modo experto)
  useEffect(() => {
    if (!showForm || viewingEntry) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      // Ignorar si está escribiendo en un input, textarea o select
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        // Permitir atajos específicos incluso dentro de inputs
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
          e.preventDefault()
          if (totals.balanced && form.glosa.trim() && form.lines.length >= 2) {
            save()
          }
        }
        // Enter en el último campo de una línea para crear nueva línea
        if (e.key === 'Enter' && !e.shiftKey && target.tagName === 'INPUT' && target.getAttribute('data-line-account')) {
          const lineIdx = parseInt(target.getAttribute('data-line-account') || '0')
          if (lineIdx === form.lines.length - 1) {
            e.preventDefault()
            addLine()
          }
        }
        return
      }
      
      // Ctrl+S o Cmd+S: Guardar
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (totals.balanced && form.glosa.trim() && form.lines.length >= 2) {
          save()
        }
      }
      
      // Ctrl+N o Cmd+N: Nueva línea
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        addLine()
      }
      
      // Ctrl+Enter: Guardar (alternativa)
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        if (totals.balanced && form.glosa.trim() && form.lines.length >= 2) {
          save()
        }
      }
      
      // Escape: Cerrar
      if (e.key === 'Escape') {
        setShowForm(false)
        setViewingEntry(null)
        setEditingEntryId(null)
      }
    }

    // Usar captura para interceptar antes que otros handlers
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [showForm, viewingEntry, totals, form.glosa, form.lines.length])

  // Exportar a CSV - descarga todos los datos filtrados del frontend
  async function exportToCsv() {
    try {
      setExporting(true)
      
      if (filteredEntries.length === 0) {
        showMessage('error', 'Sin Datos', 'No hay asientos para exportar con los filtros seleccionados.')
        return
      }
      
      // Cargar detalles de todos los asientos para obtener las líneas
      const entriesWithDetails = await Promise.all(
        filteredEntries.map(async (entry) => {
          try {
            const detail = await getJournalEntry(entry.id)
            return { entry, detail }
          } catch {
            return { entry, detail: null }
          }
        })
      )
      
      // Crear CSV
      const headers = ['ID', 'Fecha', 'Glosa', 'Cuenta', 'Nombre Cuenta', 'Debe', 'Haber', 'Memo', 'Estado']
      const rows: string[][] = [headers]
      
      for (const { entry, detail } of entriesWithDetails) {
        if (!detail || !detail.lines || detail.lines.length === 0) {
          // Si no hay líneas, agregar solo el asiento
          rows.push([
            entry.id.toString(),
            entry.date,
            entry.glosa || '',
            '',
            '',
            entry.total_debit?.toFixed(2) || '0.00',
            entry.total_credit?.toFixed(2) || '0.00',
            '',
            entry.status || 'POSTED'
          ])
          continue
        }
        
        // Agregar una fila por cada línea del asiento
        for (const line of detail.lines) {
          rows.push([
            entry.id.toString(),
            entry.date,
            entry.glosa || '',
            line.account_code || '',
            line.account_name || '',
            line.debit?.toFixed(2) || '0.00',
            line.credit?.toFixed(2) || '0.00',
            line.memo || '',
            entry.status || 'POSTED'
          ])
        }
      }
      
      // Convertir a CSV
      const csvContent = rows.map(row => 
        row.map(cell => {
          // Escapar comillas y envolver en comillas si contiene comas, saltos de línea o comillas
          const str = String(cell || '')
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`
          }
          return str
        }).join(',')
      ).join('\n')
      
      // Agregar BOM para Excel
      const BOM = '\uFEFF'
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `asientos_${currentPeriod ? `${currentPeriod.year}-${String(currentPeriod.month).padStart(2, '0')}_` : ''}${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      
      showMessage('success', 'Exportación Exitosa', `Se exportaron ${filteredEntries.length} asientos a CSV.`)
    } catch (err: any) {
      showMessage('error', 'Error al Exportar', `Error al exportar a CSV: ${err.message || err}`)
    } finally {
      setExporting(false)
    }
  }

  // Exportar a Excel usando el endpoint del backend
  async function exportToExcel() {
    try {
      setExporting(true)
      
      if (!currentPeriod) {
        showMessage('error', 'Periodo Requerido', 'Debes seleccionar un período en la barra superior para exportar.')
        return
      }
      
      const params = new URLSearchParams()
      params.set('company_id', empresaId.toString())
      params.set('period_id', currentPeriod.id.toString())
      if (filters.date_from) params.set('date_from', filters.date_from)
      if (filters.date_to) params.set('date_to', filters.date_to)
      if (filters.status) params.set('status', filters.status)
      
      const apiUrl = API_BASE.replace('/api', '') || 'http://localhost:8000'
      const response = await fetch(`${apiUrl}/journal/entries/export/excel?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('siscont_token')}`,
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorMsg = 'Error al exportar'
        try {
          const errorJson = JSON.parse(errorText)
          errorMsg = errorJson.detail || errorMsg
        } catch {
          errorMsg = errorText || errorMsg
        }
        throw new Error(errorMsg)
      }
      
      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        const errorJson = await response.json()
        throw new Error(errorJson.detail || 'Error al exportar a Excel')
      }
      
      const blob = await response.blob()
      
      if (blob.size === 0 || blob.size < 500) {
        throw new Error('El archivo Excel está vacío o corrupto.')
      }
      
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `asientos_${currentPeriod.year}-${String(currentPeriod.month).padStart(2, '0')}_${new Date().toISOString().split('T')[0]}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      
      showMessage('success', 'Exportación Exitosa', `Se exportaron los asientos del período ${currentPeriod.year}-${String(currentPeriod.month).padStart(2, '0')} a Excel.`)
    } catch (err: any) {
      showMessage('error', 'Error al Exportar', `Error al exportar a Excel: ${err.message || err}`)
    } finally {
      setExporting(false)
    }
  }


  // Función para validar asiento con reglas de cuentas
  async function validateEntry() {
    if (!currentPeriod || form.lines.length < 2) {
      setValidationResult(null)
      return
    }
    
    // Verificar que todas las líneas tengan cuenta
    const hasAllAccounts = form.lines.every(line => line.account_code && line.account_code.trim())
    if (!hasAllAccounts) {
      setValidationResult(null)
      return
    }
    
    setValidating(true)
    try {
      const result = await validateJournalEntry({
        company_id: empresaId,
        date: form.date,
        glosa: form.glosa,
        currency: 'PEN',
        exchange_rate: 1,
        origin: 'MANUAL',
        lines: form.lines
      })
      setValidationResult(result)
    } catch (err: any) {
      console.error('Error validando asiento:', err)
      setValidationResult(null)
    } finally {
      setValidating(false)
    }
  }

  // Validar automáticamente cuando cambien las líneas o la glosa
  useEffect(() => {
    if (showForm && !viewingEntry && !editingEntryId && form.lines.length >= 2 && currentPeriod) {
      // Verificar que todas las líneas tengan cuenta
      const hasAllAccounts = form.lines.every(line => line.account_code && line.account_code.trim())
      if (!hasAllAccounts) {
        setValidationResult(null)
        return
      }
      
      // Debounce: validar después de 500ms de inactividad
      const timeoutId = setTimeout(() => {
        validateEntry()
      }, 500)
      return () => clearTimeout(timeoutId)
    } else {
      setValidationResult(null)
    }
  }, [form.lines, form.glosa, form.date, showForm, viewingEntry, editingEntryId, currentPeriod, empresaId])

  async function save() {
    // Validación 0: Periodo seleccionado es OBLIGATORIO
    if (!currentPeriod) {
      showMessage('error', 'Periodo Requerido', `Debes seleccionar un periodo contable en la barra superior.\n\nPeriodo actual: ${periodo || 'No seleccionado'}\n\nPor favor, selecciona un periodo válido antes de crear un asiento.`)
      return
    }
    
    // Validar con reglas antes de guardar
    if (validationResult && !validationResult.is_valid && validationResult.errors.length > 0) {
      const errorMessages = validationResult.errors.map(e => e.message).join('\n')
      showMessage('error', 'Error de Validación', `No se puede guardar el asiento debido a los siguientes errores:\n\n${errorMessages}\n\nPor favor, corrige los errores antes de continuar.`)
      return
    }

    // Validación 0.25: Validar que el período no esté cerrado (a menos que sea ADMINISTRADOR)
    if (currentPeriod.status === 'CERRADO' && user?.role !== 'ADMINISTRADOR') {
      showMessage('error', 'Periodo Cerrado', 
        `El período ${currentPeriod.year}-${String(currentPeriod.month).padStart(2, '0')} está cerrado.\n\n` +
        `No se pueden crear asientos en períodos cerrados.\n\n` +
        `Solo un administrador puede reabrir el período para realizar modificaciones.`)
      return
    }

    // Validación 0.5: Validar que la fecha del asiento pertenezca al periodo seleccionado
    // Parsear la fecha directamente del string YYYY-MM-DD sin considerar zona horaria
    const [entryYearStr, entryMonthStr] = form.date.split('-').map(Number)
    const entryYear = entryYearStr
    const entryMonth = entryMonthStr
    
    if (entryYear !== currentPeriod.year || entryMonth !== currentPeriod.month) {
      showMessage('error', 'Fecha Fuera del Periodo', 
        `La fecha del asiento (${form.date}) no pertenece al periodo seleccionado.\n\n` +
        `Periodo actual: ${currentPeriod.year}-${String(currentPeriod.month).padStart(2, '0')}\n` +
        `Fecha del asiento: ${entryYear}-${String(entryMonth).padStart(2, '0')}\n\n` +
        `Por favor, ajusta la fecha del asiento o cambia el periodo en la barra superior.`)
      return
    }

    // Validación 1: Glosa obligatoria
    if (!form.glosa.trim()) {
      showMessage('error', 'Campo Requerido', 'La glosa (descripción) es obligatoria')
      return
    }
    
    // Validación 2: Mínimo 2 líneas
    if (form.lines.length < 2) {
      showMessage('error', 'Validación', 'Un asiento debe tener al menos 2 líneas (partida doble)\n\nCada transacción afecta al menos 2 cuentas.')
      return
    }
    
    // Validación 3: Todas las líneas deben tener cuenta válida
    const invalidAccounts = form.lines.filter(l => {
      if (!l.account_code.trim()) return true
      return !accounts.find(a => a.code === l.account_code)
    })
    if (invalidAccounts.length > 0) {
      showMessage('error', 'Cuentas Inválidas', `Hay ${invalidAccounts.length} línea(s) con cuenta inválida o sin cuenta.\n\nPor favor, selecciona cuentas válidas del plan contable.`)
      return
    }
    
    // Validación 4: No debe haber Debe Y Haber en la misma línea
    const invalidLines = form.lines.filter(l => l.debit > 0 && l.credit > 0)
    if (invalidLines.length > 0) {
      showMessage('error', 'Validación', 'Una línea no puede tener Debe Y Haber a la vez.\n\nPor favor, usa solo Debe o solo Haber por línea.')
      return
    }
    
    // Validación 5: Al menos una línea debe tener monto
    const hasAmount = form.lines.some(l => l.debit > 0 || l.credit > 0)
    if (!hasAmount) {
      showMessage('error', 'Validación', 'Al menos una línea debe tener un monto en Debe o Haber.')
      return
    }
    
    // Validación 6: Partida doble (Debe = Haber)
    if (!totals.balanced) {
      const diff = Math.abs(totals.debit - totals.credit)
      showMessage('error', 'Partida Doble Desbalanceada', `El asiento no cuadra (partida doble)\n\nDebe: ${formatCurrency(totals.debit)}\nHaber: ${formatCurrency(totals.credit)}\nDiferencia: ${formatCurrency(diff)}\n\nEn contabilidad, la suma de Debe debe ser igual a la suma de Haber.`)
      return
    }

    try {
      const entryData = {
        company_id: empresaId,
        date: form.date,
        glosa: form.glosa.trim(),
        currency: 'PEN',
        exchange_rate: 1.0,
        origin: 'MANUAL',
        lines: form.lines.map(l => {
          // Asegurar que los montos estén redondeados a 2 decimales
          const debit = Math.round((Number(l.debit) || 0) * 100) / 100
          const credit = Math.round((Number(l.credit) || 0) * 100) / 100
          return {
            account_code: l.account_code.trim(),
            debit: debit,
            credit: credit,
            memo: l.memo || undefined,
          }
        }),
      }
      
      let savedEntry: JournalEntry
      if (editingEntryId) {
        // Actualizar asiento existente
        savedEntry = await updateJournalEntry(editingEntryId, entryData)
        showMessage('success', 'Asiento Actualizado', `Asiento actualizado exitosamente!\n\nID: ${savedEntry.id}\nGlosa: ${savedEntry.glosa}\nDebe: ${formatCurrency(savedEntry.total_debit)}\nHaber: ${formatCurrency(savedEntry.total_credit)}`)
      } else {
        // Crear nuevo asiento
        // Si viene de un wizard de base check, usar endpoint de manual con subtipo
        if (baseCheckWizard) {
          const params = new URLSearchParams()
          params.set('entry_subtype', baseCheckWizard.entry_type)
          savedEntry = await apiFetch(`/journal/manual/draft?${params.toString()}`, {
            method: 'POST',
            body: JSON.stringify(entryData)
          })
          showMessage('success', 'Asiento Creado (Borrador)', `Asiento creado exitosamente en estado BORRADOR!\n\nID: ${savedEntry.id}\nGlosa: ${savedEntry.glosa}\n\nDebes postear el asiento para que afecte los estados financieros.`)
        } else {
          savedEntry = await createJournalEntry(entryData)
          showMessage('success', 'Asiento Registrado', `Asiento registrado exitosamente!\n\nID: ${savedEntry.id}\nGlosa: ${savedEntry.glosa}\nDebe: ${formatCurrency(savedEntry.total_debit)}\nHaber: ${formatCurrency(savedEntry.total_credit)}`)
        }
      }
      
      // Limpiar formulario y cerrar modal
      setForm({ date: new Date().toISOString().split('T')[0], glosa: '', estimatedAmount: '', lines: [{ account_code: '', debit: 0, credit: 0, memo: '' }] })
      setSuggestions([])
      setSimilarEntries([])
      setSelectedTemplate(null)
      setViewingEntry(null)
      setEditingEntryId(null)
      setBaseCheckWizard(null) // Limpiar wizard
      setInputValues({}) // Limpiar valores locales de inputs
      setFocusedInputs({}) // Limpiar estados de focus
      setShowForm(false)
      
      // Recargar lista de asientos - forzar recarga completa
      await reload()
    } catch (err: any) {
      showMessage('error', 'Error al Guardar', `Error al guardar asiento: ${err.message || err}`)
    }
  }

  async function openPost(entry: JournalEntry) {
    setConfirmPost(entry)
    setPostError(null)
    setConfirmedWarningCodes(new Set())
    setPostWarnings([])
    
    // Obtener advertencias del asiento antes de postear
    try {
      const warningsData = await getDraftEntryWarnings(entry.id)
      setPostWarnings(warningsData.warnings || [])
      
      // Si hay errores, mostrarlos
      if (warningsData.has_errors && warningsData.errors.length > 0) {
        setPostError(warningsData.errors.map((e: any) => e.message).join('\n'))
      }
    } catch (err: any) {
      console.error('Error obteniendo advertencias:', err)
      let errorMessage = err.message || err.toString()
      try {
        if (err.message && err.message.includes('{')) {
          const jsonMatch = err.message.match(/\{.*\}/)
          if (jsonMatch) {
            const errorObj = JSON.parse(jsonMatch[0])
            if (errorObj.detail) {
              errorMessage = errorObj.detail
            }
          }
        }
      } catch {}
      setPostError(errorMessage)
      setPostWarnings([])
    }
  }

  async function doPost() {
    if (!confirmPost) return
    setPostError(null)
    
    // Verificar que todas las advertencias requeridas estén confirmadas
    const requiredWarnings = postWarnings.filter(w => w.requires_confirmation)
    const unconfirmed = requiredWarnings.filter(w => !confirmedWarningCodes.has(w.code))
    
    if (unconfirmed.length > 0) {
      setPostError(`Debe confirmar todas las advertencias antes de postear:\n${unconfirmed.map(w => `• ${w.message}`).join('\n')}`)
      return
    }
    
    setPostLoading(true)
    try {
      await postDraftEntry(confirmPost.id, Array.from(confirmedWarningCodes))
      showMessage('success', 'Asiento Posteado', `El asiento #${confirmPost.id} ha sido posteado exitosamente y ahora afecta los estados financieros.`)
      setConfirmPost(null)
      setPostError(null)
      setPostWarnings([])
      setConfirmedWarningCodes(new Set())
      // Forzar recarga de la lista
      setLoading(true)
      await reload()
      setLoading(false)
    } catch (err: any) {
      // Extraer el mensaje de error del backend
      let errorMessage = err.message || err.toString()
      try {
        // Intentar parsear el JSON del error si viene en formato API
        if (err.message && err.message.includes('{')) {
          const jsonMatch = err.message.match(/\{.*\}/)
          if (jsonMatch) {
            const errorObj = JSON.parse(jsonMatch[0])
            if (errorObj.detail) {
              errorMessage = errorObj.detail
            }
          }
        }
      } catch {}
      setPostError(errorMessage)
    } finally {
      setPostLoading(false)
    }
  }

  function openVoid(entry: JournalEntry) {
    setConfirmVoid(entry)
    setVoidError(null)
  }

  async function doVoid() {
    if (!confirmVoid) return
    setVoidError(null)
    setVoidLoading(true)
    try {
      await voidJournalEntry(confirmVoid.id)
      showMessage('success', 'Asiento Anulado', `El asiento #${confirmVoid.id} ha sido anulado exitosamente.`)
      setConfirmVoid(null)
      setVoidError(null)
      // Forzar recarga de la lista
      setLoading(true)
      await reload()
      setLoading(false)
    } catch (err: any) {
      // Extraer el mensaje de error del backend
      let errorMessage = err.message || err.toString()
      try {
        // Intentar parsear el JSON del error si viene en formato API
        if (err.message && err.message.includes('{')) {
          const jsonMatch = err.message.match(/\{.*\}/)
          if (jsonMatch) {
            const errorObj = JSON.parse(jsonMatch[0])
            if (errorObj.detail) {
              errorMessage = errorObj.detail
            }
          }
        }
      } catch (parseErr) {
        // Si no se puede parsear, usar el mensaje original
      }
      setVoidError(errorMessage)
    } finally {
      setVoidLoading(false)
    }
  }

  function openReactivate(entry: JournalEntry) {
    setConfirmReactivate(entry)
  }

  async function doReactivate() {
    if (!confirmReactivate) return
    try {
      await reactivateJournalEntry(confirmReactivate.id)
      showMessage('success', 'Asiento Reactivado', `El asiento #${confirmReactivate.id} ha sido reactivado exitosamente.`)
      setConfirmReactivate(null)
      // Forzar recarga de la lista
      setLoading(true)
      await reload()
      setLoading(false)
    } catch (err: any) {
      showMessage('error', 'Error', `Error al reactivar asiento: ${err.message || err}`)
      setLoading(false)
    }
  }

  function openReverse(entry: JournalEntry) {
    setConfirmReverse(entry)
    setReverseError(null)
    setReverseReason('')
  }

  async function doReverse() {
    if (!confirmReverse) return
    setReverseError(null)
    setReverseLoading(true)
    try {
      const reversalDate = new Date().toISOString().split('T')[0]
      await reverseEntry(confirmReverse.id, reversalDate, undefined, reverseReason || `Reversión de asiento #${confirmReverse.id}`)
      showMessage('success', 'Asiento Revertido', `El asiento #${confirmReverse.id} ha sido revertido exitosamente. Se creó un nuevo asiento con los montos invertidos.`)
      setConfirmReverse(null)
      setReverseReason('')
      setReverseError(null)
      // Forzar recarga de la lista
      setLoading(true)
      await reload()
      setLoading(false)
    } catch (err: any) {
      let errorMessage = err.message || err.toString()
      try {
        if (err.message && err.message.includes('{')) {
          const jsonMatch = err.message.match(/\{.*\}/)
          if (jsonMatch) {
            const errorObj = JSON.parse(jsonMatch[0])
            if (errorObj.detail) {
              errorMessage = errorObj.detail
            }
          }
        }
      } catch {}
      setReverseError(errorMessage)
    } finally {
      setReverseLoading(false)
    }
  }

  function openAdjust(entry: JournalEntry) {
    setConfirmAdjust(entry)
    setAdjustError(null)
    setAdjustReason('')
  }

  async function doAdjust() {
    if (!confirmAdjust) return
    setAdjustError(null)
    setAdjustLoading(true)
    try {
      const adjustmentDate = new Date().toISOString().split('T')[0]
      const adjustmentEntry = await createAdjustmentEntry(confirmAdjust.id, adjustmentDate, undefined, adjustReason || `Ajuste de asiento #${confirmAdjust.id}`)
      showMessage('success', 'Asiento de Ajuste Creado', `Se creó un asiento de ajuste (DRAFT) #${adjustmentEntry.id} referenciando el asiento #${confirmAdjust.id}. Completa las líneas y postea el asiento.`)
      setConfirmAdjust(null)
      setAdjustReason('')
      setAdjustError(null)
      // Abrir el asiento de ajuste para edición
      setEditingEntryId(adjustmentEntry.id)
      setViewingEntry(null)
      await openEdit(adjustmentEntry.id)
      // Forzar recarga de la lista
      setLoading(true)
      await reload()
      setLoading(false)
    } catch (err: any) {
      let errorMessage = err.message || err.toString()
      try {
        if (err.message && err.message.includes('{')) {
          const jsonMatch = err.message.match(/\{.*\}/)
          if (jsonMatch) {
            const errorObj = JSON.parse(jsonMatch[0])
            if (errorObj.detail) {
              errorMessage = errorObj.detail
            }
          }
        }
      } catch {}
      setAdjustError(errorMessage)
    } finally {
      setAdjustLoading(false)
    }
  }

  // Mostrar indicador de carga cuando se está cargando un asiento desde la URL
  if (loadingEntry) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Breadcrumbs />
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary-500 mx-auto" />
            <p className="text-gray-600 dark:text-gray-400">Cargando asiento...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumbs */}
      <Breadcrumbs />

      {/* Page Header */}
      <PageHeader
        title="Asientos Contables"
        subtitle="Registra y gestiona asientos contables según partida doble (PCGE)"
        icon={FileText}
        iconColor="primary"
        actions={
          canWrite && (
            <ActionBar
              onNew={openCreate}
              onRefresh={reload}
              loading={loading}
              newLabel="Nuevo Asiento"
            >
              <Button
                variant="outline"
                size="sm"
                onClick={exportToCsv}
                disabled={exporting || filteredEntries.length === 0}
                title="Exportar todos los asientos filtrados a CSV"
              >
                <Download className="w-4 h-4" />
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportToExcel}
                disabled={exporting || filteredEntries.length === 0 || !currentPeriod}
                title="Exportar todos los asientos del período seleccionado a Excel"
              >
                <Download className="w-4 h-4" />
                Excel
              </Button>
            </ActionBar>
          )
        }
      />


      {/* Filters & Controls */}
      <Card>
        <div className="p-4 space-y-4">

          {/* Filtros Modernos */}
          <div className="space-y-3">
            {/* Barra de filtros activos con botón limpiar */}
            {hasActiveFilters && (
              <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex items-center gap-2 flex-wrap">
                  <Filter className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-medium text-blue-900 dark:text-blue-100">Filtros activos:</span>
                  {filters.date_from && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded-md text-xs font-medium">
                      Día desde: {(() => {
                        if (!currentPeriod || !filters.date_from) return ''
                        const [year, month, day] = filters.date_from.split('-').map(Number)
                        return day
                      })()}
                    </span>
                  )}
                  {filters.date_to && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded-md text-xs font-medium">
                      Día hasta: {(() => {
                        if (!currentPeriod || !filters.date_to) return ''
                        const [year, month, day] = filters.date_to.split('-').map(Number)
                        return day
                      })()}
                    </span>
                  )}
                  {filters.status && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded-md text-xs font-medium">
                      Estado: {filters.status === 'POSTED' ? 'Registrado' : 'Anulado'}
                    </span>
                  )}
                  {filters.glosa_search.trim() && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded-md text-xs font-medium">
                      Búsqueda: "{filters.glosa_search}"
                    </span>
                  )}
                  {filters.correlative_search.trim() && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded-md text-xs font-medium">
                      Voucher: "{filters.correlative_search}"
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100 hover:bg-blue-100 dark:hover:bg-blue-800"
                >
                  <XCircle className="w-4 h-4 mr-1" />
                  Limpiar filtros
                </Button>
              </div>
            )}
            
            {/* Campos de filtros */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {(() => {
              if (!currentPeriod) {
                return (
                  <>
                    <div>
                      <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block font-medium">Día Desde</label>
                      <div className="text-xs text-gray-500 dark:text-gray-400 p-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-800">
                        Selecciona un período primero
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block font-medium">Día Hasta</label>
                      <div className="text-xs text-gray-500 dark:text-gray-400 p-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-800">
                        Selecciona un período primero
                      </div>
                    </div>
                  </>
                )
              }
              
              // Calcular fecha mínima y máxima del período actual
              const year = currentPeriod.year
              const month = currentPeriod.month
              const daysInMonth = new Date(year, month, 0).getDate()
              
              const minDate = `${year}-${String(month).padStart(2, '0')}-01`
              const maxDate = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
              
              // Obtener fecha actual del filtro si está en el período actual
              const getCurrentDateFrom = () => {
                if (!filters.date_from) return ''
                const [formYear, formMonth] = filters.date_from.split('-').map(Number)
                if (formYear === year && formMonth === month) {
                  return filters.date_from
                }
                return ''
              }
              
              const getCurrentDateTo = () => {
                if (!filters.date_to) return ''
                const [formYear, formMonth] = filters.date_to.split('-').map(Number)
                if (formYear === year && formMonth === month) {
                  return filters.date_to
                }
                return ''
              }
              
              return (
                <>
                  <div>
                    <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block font-medium">Día Desde</label>
                    <div className="relative">
                      <input
                        type="date"
                        value={getCurrentDateFrom()}
                        min={minDate}
                        max={maxDate}
                        onChange={e => {
                          setFilters(f => ({ ...f, date_from: e.target.value }))
                        }}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 pr-10 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:w-5 [&::-webkit-calendar-picker-indicator]:h-5"
                      />
                      <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block font-medium">Día Hasta</label>
                    <div className="relative">
                      <input
                        type="date"
                        value={getCurrentDateTo()}
                        min={minDate}
                        max={maxDate}
                        onChange={e => {
                          setFilters(f => ({ ...f, date_to: e.target.value }))
                        }}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 pr-10 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:w-5 [&::-webkit-calendar-picker-indicator]:h-5"
                      />
                      <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
                    </div>
                  </div>
                </>
              )
            })()}
              <div>
                <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block font-medium">Estado</label>
                <select
                  value={filters.status}
                  onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                >
                  <option value="">Todos</option>
                  <option value="POSTED">Registrado</option>
                  <option value="VOIDED">Anulado</option>
                </select>
              </div>
              <div className="relative">
                <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block font-medium">🔍 Buscar en Glosa</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                  <input
                    type="text"
                    placeholder="Buscar texto..."
                    value={filters.glosa_search}
                    onChange={e => setFilters(f => ({ ...f, glosa_search: e.target.value }))}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl pl-10 pr-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  />
                  {filters.glosa_search && (
                    <button
                      onClick={() => setFilters(f => ({ ...f, glosa_search: '' }))}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="relative">
                <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block font-medium">🔢 Buscar Voucher (N° Asiento)</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                  <input
                    type="text"
                    placeholder="Ej: 02-00001 o 45"
                    value={filters.correlative_search}
                    onChange={e => setFilters(f => ({ ...f, correlative_search: e.target.value }))}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl pl-10 pr-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 font-mono"
                  />
                  {filters.correlative_search && (
                    <button
                      onClick={() => setFilters(f => ({ ...f, correlative_search: '' }))}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Tabs principales para organizar el contenido */}
      <Tabs value={activeMainTab} onValueChange={(v) => setActiveMainTab(v as 'entries' | 'checks')} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTriggerWithValue 
            value="entries" 
            activeValue={activeMainTab} 
            onValueChange={(v) => setActiveMainTab(v as 'entries' | 'checks')}
            className="flex items-center gap-2"
          >
            <FileText className="h-4 w-4" />
            Asientos ({sortedEntries.length})
          </TabsTriggerWithValue>
          <TabsTriggerWithValue 
            value="checks" 
            activeValue={activeMainTab} 
            onValueChange={(v) => setActiveMainTab(v as 'entries' | 'checks')}
            className="flex items-center gap-2"
          >
            <AlertTriangle className="h-4 w-4" />
            Verificaciones Base
            {baseChecksCount > 0 && (
              <Badge variant="warning" className="ml-1">
                {baseChecksCount}
              </Badge>
            )}
          </TabsTriggerWithValue>
        </TabsList>

        {/* Tab: Asientos */}
        <TabsContentWithValue value="entries" activeValue={activeMainTab} className="space-y-4">
          {/* Grilla de Control Maestro (Vista Multiasiento) */}
          <Card className="overflow-hidden">
        <CardHeader 
          title={`GRILLA DE CONTROL MAESTRO${sortedEntries.length > 0 ? ` (${sortedEntries.length} asiento${sortedEntries.length !== 1 ? 's' : ''})` : ''}`}
          subtitle={`Período: ${periodo || 'No seleccionado'} • Total: ${formatCurrency(Math.max(sortedEntries.reduce((sum, e) => sum + e.total_debit, 0), sortedEntries.reduce((sum, e) => sum + e.total_credit, 0)))}`}
          icon={<FileText className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
        />
        {loading ? (
          <div className="p-8 text-center text-gray-500">Cargando asientos...</div>
        ) : sortedEntries.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <p className="text-lg font-medium mb-1">No hay asientos registrados</p>
            <p className="text-sm text-gray-500">Crea un nuevo asiento para comenzar</p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-700 border-b-2 border-gray-400 dark:border-gray-500">
                  <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700" style={{ width: '30px' }}></th>
                  <th 
                    className="px-3 py-2.5 text-left text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700 cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors" 
                    style={{ width: '140px' }}
                    onClick={() => handleSort('correlative')}
                  >
                    <div className="flex items-center gap-1">
                      N° Asiento (Voucher)
                      {sortConfig?.key === 'correlative' && (
                        sortConfig.direction === 'asc' ? <ArrowUpDown className="w-3 h-3" /> : <ArrowUpDown className="w-3 h-3 rotate-180" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-3 py-2.5 text-center text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700 cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors" 
                    style={{ width: '90px' }}
                    onClick={() => handleSort('date')}
                  >
                    <div className="flex items-center justify-center gap-1">
                      Fecha
                      {sortConfig?.key === 'date' && (
                        sortConfig.direction === 'asc' ? <ArrowUpDown className="w-3 h-3" /> : <ArrowUpDown className="w-3 h-3 rotate-180" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-3 py-2.5 text-left text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700 cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors" 
                    style={{ width: '120px' }}
                    onClick={() => handleSort('libro')}
                  >
                    <div className="flex items-center gap-1">
                      Libro
                      {sortConfig?.key === 'libro' && (
                        sortConfig.direction === 'asc' ? <ArrowUpDown className="w-3 h-3" /> : <ArrowUpDown className="w-3 h-3 rotate-180" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-3 py-2.5 text-left text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700 cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors" 
                    style={{ minWidth: '300px' }}
                    onClick={() => handleSort('glosa')}
                  >
                    <div className="flex items-center gap-1">
                      Glosa General
                      {sortConfig?.key === 'glosa' && (
                        sortConfig.direction === 'asc' ? <ArrowUpDown className="w-3 h-3" /> : <ArrowUpDown className="w-3 h-3 rotate-180" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-3 py-2.5 text-center text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700 cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors" 
                    style={{ width: '80px' }}
                    onClick={() => handleSort('currency')}
                  >
                    <div className="flex items-center justify-center gap-1">
                      Moneda
                      {sortConfig?.key === 'currency' && (
                        sortConfig.direction === 'asc' ? <ArrowUpDown className="w-3 h-3" /> : <ArrowUpDown className="w-3 h-3 rotate-180" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-3 py-2.5 text-right text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700 cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors" 
                    style={{ width: '130px' }}
                    onClick={() => handleSort('total')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Total
                      {sortConfig?.key === 'total' && (
                        sortConfig.direction === 'asc' ? <ArrowUpDown className="w-3 h-3" /> : <ArrowUpDown className="w-3 h-3 rotate-180" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-3 py-2.5 text-center text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700 cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors" 
                    style={{ width: '100px' }}
                    onClick={() => handleSort('status')}
                  >
                    <div className="flex items-center justify-center gap-1">
                      Estado
                      {sortConfig?.key === 'status' && (
                        sortConfig.direction === 'asc' ? <ArrowUpDown className="w-3 h-3" /> : <ArrowUpDown className="w-3 h-3 rotate-180" />
                      )}
                    </div>
                  </th>
                  <th className="px-3 py-2.5 text-center text-xs font-bold text-gray-900 dark:text-gray-100 bg-gray-200 dark:bg-gray-700" style={{ width: '100px' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sortedEntries.map((entry, idx) => {
                  const isBalanced = Math.abs(entry.total_debit - entry.total_credit) < 0.01
                  const isExpanded = expandedEntries.has(entry.id)
                  const detail = entryDetails[entry.id]
                  const total = Math.max(entry.total_debit, entry.total_credit)
                  const correlativeFormatted = formatCorrelative(entry.correlative) || `#${entry.id}`
                  
                  return (
                    <React.Fragment key={entry.id}>
                      <tr 
                        className={`
                          ${idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/70'}
                          ${entry.status === 'VOIDED' ? 'opacity-60 bg-red-50/30 dark:bg-red-900/10' : ''}
                          border-b border-gray-300 dark:border-gray-600
                          hover:bg-blue-50 dark:hover:bg-blue-900/10
                        `}
                      >
                        {/* Botón Expandir */}
                        <td className="px-2 py-2 text-center border-r border-gray-300 dark:border-gray-600">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                            onClick={() => toggleExpand(entry.id)}
                            title={isExpanded ? "Colapsar líneas" : "Expandir líneas"}
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </Button>
                        </td>
                        
                        {/* N° Asiento (Voucher) - Link clickeable */}
                        <td className="px-3 py-2 border-r border-gray-300 dark:border-gray-600">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openView(entry.id)}
                              className="font-mono text-sm font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline cursor-pointer"
                              title="Ver detalle del asiento"
                            >
                              {correlativeFormatted}
                            </button>
                            {/* Indicador de advertencia/error: hacer click en el número para ver el detalle */}
                            {((entry as any).motor_metadata?.engine_log?.warnings?.length > 0 || (entry as any).validation_warnings?.length > 0) && (
                              <Tooltip content="Tiene advertencias. Haz click en el número para ver el detalle.">
                                <span className="text-amber-500 dark:text-amber-400">
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                </span>
                              </Tooltip>
                            )}
                            {((entry as any).motor_metadata?.engine_log?.errors?.length > 0) && (
                              <Tooltip content="Tiene errores. Haz click en el número para ver el detalle.">
                                <span className="text-red-500 dark:text-red-400">
                                  <AlertCircle className="h-3.5 w-3.5" />
                                </span>
                              </Tooltip>
                            )}
                          </div>
                          {/* Trazabilidad básica visible */}
                          {(entry as any).created_by_id && (
                            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              <User className="h-3 w-3" />
                              <span className="truncate max-w-[100px]">ID: {(entry as any).created_by_id}</span>
                            </div>
                          )}
                        </td>
                        
                        {/* Fecha */}
                        <td className="px-3 py-2 text-center text-sm text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">
                          {formatDateShort(entry.date)}
                        </td>
                        
                        {/* Libro */}
                        <td className="px-3 py-2 text-sm border-r border-gray-300 dark:border-gray-600">
                          <Badge variant="outline" className="text-xs">
                            {getLibroName(entry.origin)}
                          </Badge>
                        </td>
                        
                        {/* Glosa General */}
                        <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">
                          {entry.glosa || '(Sin descripción)'}
                        </td>
                        
                        {/* Moneda */}
                        <td className="px-3 py-2 text-center text-sm font-medium text-gray-700 dark:text-gray-300 border-r border-gray-300 dark:border-gray-600">
                          {entry.currency || 'PEN'}
                        </td>
                        
                        {/* Total */}
                        <td className="px-3 py-2 text-right text-sm font-semibold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">
                          {formatCurrency(total)}
                        </td>
                        
                        {/* Estado */}
                        <td className="px-3 py-2 text-center border-r border-gray-300 dark:border-gray-600">
                          <div className="flex flex-col items-center gap-1">
                            <StatusBadge status={entry.status || 'POSTED'} />
                            {!isBalanced && (
                              <Tooltip content="El asiento no está balanceado (Debe ≠ Haber)">
                                <span className="text-yellow-600 dark:text-yellow-400 text-xs">⚠️</span>
                              </Tooltip>
                            )}
                            {/* Indicadores de validación */}
                            {(entry as any).validation_warnings?.length > 0 && (
                              <Tooltip content={`${(entry as any).validation_warnings.length} advertencia(s) de validación`}>
                                <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
                              </Tooltip>
                            )}
                            {(entry as any).motor_metadata?.engine_log?.errors?.length > 0 && (
                              <Tooltip content={`${(entry as any).motor_metadata.engine_log.errors.length} error(es) del motor`}>
                                <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                              </Tooltip>
                            )}
                          </div>
                        </td>
                        
                        {/* Acciones */}
                        <td className="px-3 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {!canWrite ? (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => openView(entry.id)}
                                title="Ver detalles del asiento"
                                className="h-7 w-7 p-0 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-600"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                            ) : (
                              <>
                                {entry.status === 'DRAFT' && entry.origin === 'MANUAL' && (
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-100 dark:hover:bg-green-900/30 border border-green-300 dark:border-green-600" 
                                    onClick={() => openPost(entry)}
                                    title="Postear asiento (convertir de DRAFT a POSTED)"
                                  >
                                    <Send className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                {entry.status !== 'VOIDED' && (
                                  <>
                                    {entry.status === 'DRAFT' && (
                                      <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/30 border border-blue-300 dark:border-blue-600" 
                                        onClick={() => openEdit(entry.id)}
                                        title="Editar asiento"
                                      >
                                        <Edit2 className="w-3.5 h-3.5" />
                                      </Button>
                                    )}
                                    {/* Mostrar botones de Revertir y Ajuste solo para asientos POSTED que no han sido revertidos */}
                                    {entry.status === 'POSTED' && !(entry as any).reversed_entry_id && canWrite && (
                                      <>
                                        <Button 
                                          variant="ghost" 
                                          size="sm" 
                                          className="h-7 w-7 p-0 text-orange-600 hover:text-orange-700 hover:bg-orange-100 dark:hover:bg-orange-900/30 border border-orange-300 dark:border-orange-600" 
                                          onClick={() => openReverse(entry)}
                                          title="Revertir asiento (crear asiento inverso)"
                                        >
                                          <Undo2 className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button 
                                          variant="ghost" 
                                          size="sm" 
                                          className="h-7 w-7 p-0 text-purple-600 hover:text-purple-700 hover:bg-purple-100 dark:hover:bg-purple-900/30 border border-purple-300 dark:border-purple-600" 
                                          onClick={() => openAdjust(entry)}
                                          title="Crear asiento de ajuste"
                                        >
                                          <Wrench className="w-3.5 h-3.5" />
                                        </Button>
                                      </>
                                    )}
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-300 dark:border-red-600" 
                                      onClick={() => openVoid(entry)}
                                      title="Anular asiento"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </>
                                )}
                                {entry.status === 'VOIDED' && (
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-100 dark:hover:bg-green-900/30 border border-green-300 dark:border-green-600" 
                                    onClick={() => openReactivate(entry)}
                                    title="Reactivar asiento"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      
                      {/* Líneas expandidas del asiento - Grilla con columnas Debe/Haber */}
                      {isExpanded && detail && detail.lines && detail.lines.length > 0 && (
                        <tr className="bg-blue-50/30 dark:bg-blue-900/10 border-b border-gray-300 dark:border-gray-600">
                          <td colSpan={9} className="px-4 py-3">
                            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                              <table className="min-w-full border-collapse">
                                <thead>
                                  <tr className="bg-gray-100 dark:bg-gray-700 border-b border-gray-300 dark:border-gray-600">
                                    <th className="px-3 py-2 text-left text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600" style={{ width: '100px' }}>Cuenta</th>
                                    <th className="px-3 py-2 text-left text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600" style={{ minWidth: '250px' }}>Nombre</th>
                                    <th className="px-3 py-2 text-left text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600" style={{ minWidth: '200px' }}>Memo</th>
                                    <th className="px-3 py-2 text-right text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600" style={{ width: '130px' }}>Debe</th>
                                    <th className="px-3 py-2 text-right text-xs font-bold text-gray-900 dark:text-gray-100" style={{ width: '130px' }}>Haber</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {detail.lines.map((line, lineIdx) => (
                                    <tr 
                                      key={line.id || lineIdx}
                                      className={`
                                        ${lineIdx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/70'}
                                        border-b border-gray-200 dark:border-gray-700
                                        hover:bg-blue-50 dark:hover:bg-blue-900/10
                                      `}
                                    >
                                      <td className="px-3 py-2 font-mono text-sm font-semibold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">
                                        {line.account_code}
                                      </td>
                                      <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">
                                        {line.account_name}
                                      </td>
                                      <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 border-r border-gray-300 dark:border-gray-600">
                                        {line.memo || '-'}
                                      </td>
                                      <td className="px-3 py-2 text-right text-sm font-semibold text-green-700 dark:text-green-400 border-r border-gray-300 dark:border-gray-600">
                                        {line.debit > 0 ? formatCurrency(line.debit) : '-'}
                                      </td>
                                      <td className="px-3 py-2 text-right text-sm font-semibold text-blue-700 dark:text-blue-400">
                                        {line.credit > 0 ? formatCurrency(line.credit) : '-'}
                                      </td>
                                    </tr>
                                  ))}
                                  {/* Totales del asiento */}
                                  <tr className="bg-gray-200 dark:bg-gray-700 border-t-2 border-gray-400 dark:border-gray-500 font-bold">
                                    <td colSpan={3} className="px-3 py-2 text-right pr-4 text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">
                                      TOTAL DEL ASIENTO
                                      {Math.abs((detail.total_debit || 0) - (detail.total_credit || 0)) < 0.01 ? (
                                        <span className="ml-2 text-green-600 dark:text-green-400">✓ CUADRA</span>
                                      ) : (
                                        <span className="ml-2 text-red-600 dark:text-red-400">⚠ DESBALANCEADO</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2 text-right text-green-700 dark:text-green-400 border-r border-gray-300 dark:border-gray-600">
                                      {formatCurrency(detail.total_debit || 0)}
                                    </td>
                                    <td className="px-3 py-2 text-right text-blue-700 dark:text-blue-400">
                                      {formatCurrency(detail.total_credit || 0)}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
                
                {/* Totales */}
                {sortedEntries.length > 0 && (
                  <tr className="bg-gray-200 dark:bg-gray-700 border-t-2 border-gray-400 dark:border-gray-500 font-bold">
                    <td colSpan={5} className="px-3 py-2.5 text-right pr-4 text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">
                      TOTAL GENERAL
                      {Math.abs(
                        sortedEntries.reduce((sum, e) => sum + e.total_debit, 0) - 
                        sortedEntries.reduce((sum, e) => sum + e.total_credit, 0)
                      ) < 0.01 ? (
                        <span className="ml-2 text-green-600 dark:text-green-400">✓ CUADRA</span>
                      ) : (
                        <span className="ml-2 text-red-600 dark:text-red-400">⚠ DESBALANCEADO</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center border-r border-gray-300 dark:border-gray-600"></td>
                    <td className="px-3 py-2.5 text-right text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 font-bold">
                      {formatCurrency(Math.max(
                        sortedEntries.reduce((sum, e) => sum + e.total_debit, 0),
                        sortedEntries.reduce((sum, e) => sum + e.total_credit, 0)
                      ))}
                    </td>
                    <td className="px-3 py-2.5 text-center border-r border-gray-300 dark:border-gray-600"></td>
                    <td className="px-3 py-2.5 text-center"></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
        </TabsContentWithValue>

        {/* Tab: Verificaciones Base */}
        <TabsContentWithValue value="checks" activeValue={activeMainTab}>
          {currentPeriod && empresaId ? (
            <Card>
              <CardHeader 
                title="Verificaciones de Asientos Base"
                subtitle="Asientos contables críticos que pueden estar faltando"
                icon={<AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />}
              />
              <div className="p-4">
                <BaseAccountingNotifications
                  companyId={empresaId}
                  periodId={currentPeriod.id}
                  onChecksLoaded={(count) => setBaseChecksCount(count)}
                  onCreateEntry={(check) => {
                    // Abrir wizard para crear asiento guiado
                    setBaseCheckWizard(check)
                    // Pre-llenar formulario con datos sugeridos
                    const defaultDate = currentPeriod ? 
                      `${currentPeriod.year}-${String(currentPeriod.month).padStart(2, '0')}-01` :
                      new Date().toISOString().split('T')[0]
                    
                    const suggestedLines: EntryLineIn[] = check.suggested_accounts.map(acc => ({
                      account_code: acc.code,
                      debit: acc.side === 'debit' ? (acc.suggested_amount || 0) : 0,
                      credit: acc.side === 'credit' ? (acc.suggested_amount || 0) : 0,
                      memo: ''
                    }))
                    
                    setForm({
                      date: defaultDate,
                      glosa: check.suggested_glosa,
                      estimatedAmount: '',
                      lines: suggestedLines.length > 0 ? suggestedLines : [{ account_code: '', debit: 0, credit: 0, memo: '' }]
                    })
                    setShowForm(true)
                    setActiveMainTab('entries') // Cambiar al tab de asientos para ver el formulario
                  }}
                />
              </div>
            </Card>
          ) : (
            <Card>
              <div className="p-8 text-center text-gray-500">
                <AlertCircle className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p className="text-lg font-medium mb-1">Selecciona un período</p>
                <p className="text-sm text-gray-500">Para ver las verificaciones, selecciona un período contable en la barra superior</p>
              </div>
            </Card>
          )}
        </TabsContentWithValue>
      </Tabs>

      {/* Create/View Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => { 
            setShowForm(false); 
            setViewingEntry(null);
            setEditingEntryId(null);
          }}></div>
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white p-6 rounded-t-2xl sticky top-0 z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">
                      {viewingEntry ? 'Ver Asiento (Solo Lectura)' : editingEntryId ? 'Editar Asiento Contable' : baseCheckWizard ? `Crear ${baseCheckWizard.action.label}` : 'Nuevo Asiento Contable'}
                    </h2>
                    <p className="text-sm text-primary-100">
                      {viewingEntry ? `ID: ${viewingEntry.id} - Vista de solo lectura` : editingEntryId ? `ID: ${editingEntryId} - Modifica el asiento contable` : baseCheckWizard ? baseCheckWizard.description : 'Registra un asiento según partida doble'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {!viewingEntry && (
                    <div className="text-xs text-white/80 bg-white/10 px-2 py-1 rounded">
                      <div>⌨️ Atajos: <kbd className="bg-white/20 px-1 rounded">Ctrl+S</kbd> Guardar | <kbd className="bg-white/20 px-1 rounded">Ctrl+N</kbd> Nueva línea | <kbd className="bg-white/20 px-1 rounded">Esc</kbd> Cerrar</div>
                    </div>
                  )}
                  <button onClick={() => { setShowForm(false); setViewingEntry(null); setEditingEntryId(null) }} className="text-white hover:text-gray-200">
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6">

              {viewingEntry ? (
                // View Mode - Formato Profesional con Tabs
                <>
                  <TraceabilityPanel
                    entry={viewingEntry}
                    onViewReversedEntry={(entryId) => {
                      // Implementar navegación al asiento revertido
                      openView(entryId)
                    }}
                    onVerifyIntegrity={async (entryId) => {
                      // Implementar verificación de integridad
                      try {
                        const response = await fetch(`${API_BASE}/journal/entries/${entryId}/verify-integrity`, {
                          headers: {
                            'Authorization': `Bearer ${localStorage.getItem('siscont_token')}`,
                          },
                        })
                        if (response.ok) {
                          const data = await response.json()
                          return { isValid: data.is_valid || false }
                        }
                        return { isValid: false }
                      } catch {
                        return { isValid: false }
                      }
                    }}
                  />
                </>
              ) : (
                // Create/Edit Mode - Formato Profesional Simplificado
                <>
                  {/* Información del Período Actual */}
                  {currentPeriod && (
                    <div className={`mb-4 p-3 rounded-lg border-2 ${
                      currentPeriod.status === 'CERRADO'
                        ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                        : currentPeriod.status === 'REABIERTO'
                        ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                        : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Calendar className={`w-4 h-4 ${
                            currentPeriod.status === 'CERRADO'
                              ? 'text-red-600 dark:text-red-400'
                              : currentPeriod.status === 'REABIERTO'
                              ? 'text-yellow-600 dark:text-yellow-400'
                              : 'text-blue-600 dark:text-blue-400'
                          }`} />
                          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            Período Actual: {currentPeriod.year}-{String(currentPeriod.month).padStart(2, '0')}
                          </span>
                        </div>
                        <div className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                          currentPeriod.status === 'CERRADO'
                            ? 'bg-red-500 text-white'
                            : currentPeriod.status === 'REABIERTO'
                            ? 'bg-yellow-500 text-white'
                            : 'bg-green-500 text-white'
                        }`}>
                          {currentPeriod.status === 'CERRADO' ? '🔒 CERRADO' : currentPeriod.status === 'REABIERTO' ? '🔓 REABIERTO' : '✓ ABIERTO'}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Fecha y Glosa en la misma fila */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                        Día <span className="text-red-500">*</span>
                      </label>
                      {(() => {
                        if (!currentPeriod) {
                          return (
                            <div className="mt-1 text-sm text-gray-500 dark:text-gray-400 p-2 border-2 border-gray-300 dark:border-gray-600 rounded-xl">
                              Selecciona un período primero
                            </div>
                          )
                        }
                        
                        // Calcular fecha mínima y máxima del período actual
                        const year = currentPeriod.year
                        const month = currentPeriod.month
                        const daysInMonth = new Date(year, month, 0).getDate()
                        
                        const minDate = `${year}-${String(month).padStart(2, '0')}-01`
                        const maxDate = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
                        
                        // Obtener el día actual del form.date si está en el período actual
                        const getCurrentDate = () => {
                          if (!form.date) return minDate
                          const [formYear, formMonth, formDay] = form.date.split('-').map(Number)
                          if (formYear === year && formMonth === month) {
                            return form.date
                          }
                          return minDate
                        }
                        
                        return (
                          <div className="relative">
                            <input
                              type="date"
                              value={getCurrentDate()}
                              min={minDate}
                              max={maxDate}
                              onChange={e => {
                                setForm(f => ({ ...f, date: e.target.value }))
                              }}
                              className="mt-1 w-full border-2 border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2.5 pr-10 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:w-5 [&::-webkit-calendar-picker-indicator]:h-5"
                            />
                            <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                          </div>
                        )
                      })()}
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                        Glosa / Descripción <span className="text-red-500">*</span>
                      </label>
                      <div className="mt-1 flex gap-2">
                      <textarea
                        value={form.glosa}
                        onChange={async (e) => {
                          const newGlosa = e.target.value
                          setForm(f => ({ ...f, glosa: newGlosa }))
                          // Buscar asientos similares después de 1 segundo sin escribir
                          if (newGlosa.trim().length > 10) {
                            try {
                              setLoadingSimilar(true)
                              const result = await getSimilarEntries(empresaId, newGlosa)
                              setSimilarEntries(result.similar_entries)
                            } catch (err) {
                              // Silenciar errores de búsqueda
                            } finally {
                              setLoadingSimilar(false)
                            }
                          } else {
                            setSimilarEntries([])
                          }
                        }}
                        placeholder="Ej: Pago a proveedores por factura F001-0001"
                        className="w-full border-2 border-gray-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                        rows={2}
                      />
                    </div>
                    </div>
                  </div>
                  
                  {/* Validación en Tiempo Real */}
                  {!viewingEntry && form.lines.length >= 2 && form.glosa.trim() && (
                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        {realTimeValidation.isBalanced ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : (
                          <AlertCircle className="h-5 w-5 text-red-500" />
                        )}
                        <span className={`font-semibold ${
                          realTimeValidation.isBalanced ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                        }`}>
                          {realTimeValidation.isBalanced ? 'Balanceado' : 'No balanceado'}
                        </span>
                        {realTimeValidation.validating && (
                          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                        )}
                      </div>
                      {realTimeValidation.warnings.length > 0 && (
                        <Alert variant="warning" className="mb-2">
                          <AlertTitle>Advertencias</AlertTitle>
                          <AlertDescription>
                            <ul className="list-disc list-inside space-y-1 text-sm">
                              {realTimeValidation.warnings.map((w, idx) => (
                                <li key={idx}>{w.message}</li>
                              ))}
                            </ul>
                          </AlertDescription>
                        </Alert>
                      )}
                      {realTimeValidation.errors.length > 0 && (
                        <Alert variant="error" className="mb-2">
                          <AlertTitle>Errores</AlertTitle>
                          <AlertDescription>
                            <ul className="list-disc list-inside space-y-1 text-sm">
                              {realTimeValidation.errors.map((e, idx) => (
                                <li key={idx}>{e.message}</li>
                              ))}
                            </ul>
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  )}

                  {/* Resultados de Validación (Manual) */}
                  {validationResult && (
                    <div className="space-y-3">
                      {/* Errores */}
                      {validationResult.errors.length > 0 && (
                        <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                            <h3 className="font-semibold text-red-900 dark:text-red-100">Errores de Validación</h3>
                            {validating && <Loader2 className="w-4 h-4 animate-spin text-red-600" />}
                          </div>
                          <div className="space-y-2">
                            {validationResult.errors.map((error, idx) => (
                              <div key={idx} className="text-sm text-red-800 dark:text-red-200">
                                <div className="font-medium">{error.message}</div>
                                {error.accounts.length > 0 && (
                                  <div className="text-xs mt-1 text-red-600 dark:text-red-300">
                                    Cuentas afectadas: {error.accounts.join(', ')}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Advertencias */}
                      {validationResult.warnings.length > 0 && (
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-300 dark:border-yellow-700 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                            <h3 className="font-semibold text-yellow-900 dark:text-yellow-100">Advertencias</h3>
                          </div>
                          <div className="space-y-2">
                            {validationResult.warnings.map((warning, idx) => (
                              <div key={idx} className="text-sm text-yellow-800 dark:text-yellow-200">
                                <div className="font-medium">{warning.message}</div>
                                {warning.accounts.length > 0 && (
                                  <div className="text-xs mt-1 text-yellow-600 dark:text-yellow-300">
                                    Cuentas afectadas: {warning.accounts.join(', ')}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Sugerencias */}
                      {validationResult.suggestions.length > 0 && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-300 dark:border-blue-700 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <CheckCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            <h3 className="font-semibold text-blue-900 dark:text-blue-100">Sugerencias</h3>
                          </div>
                          <div className="space-y-2">
                            {validationResult.suggestions.map((suggestion, idx) => (
                              <div key={idx} className="text-sm text-blue-800 dark:text-blue-200">
                                <div className="font-medium">{suggestion.message}</div>
                                {suggestion.suggested_accounts && suggestion.suggested_accounts.length > 0 && (
                                  <div className="text-xs mt-1 text-blue-600 dark:text-blue-300">
                                    Cuentas sugeridas: {suggestion.suggested_accounts.join(', ')}
                                  </div>
                                )}
                                {suggestion.suggested_glosa && (
                                  <div className="text-xs mt-1 text-blue-600 dark:text-blue-300 italic">
                                    Glosa sugerida: "{suggestion.suggested_glosa}"
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Cuentas Compatibles */}
                      {validationResult.compatible_accounts.length > 0 && (
                        <div className="bg-green-50 dark:bg-green-900/20 border-2 border-green-300 dark:border-green-700 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                            <h3 className="font-semibold text-green-900 dark:text-green-100">Cuentas Compatibles</h3>
                          </div>
                          <div className="space-y-2">
                            {validationResult.compatible_accounts.map((compat, idx) => (
                              <div key={idx} className="text-sm text-green-800 dark:text-green-200">
                                <div>
                                  <span className="font-medium">{compat.account_code}</span> suele usarse con: {compat.compatible_accounts.join(', ')}
                                  <span className="text-xs ml-2 text-green-600 dark:text-green-300">
                                    (confianza: {Math.round(compat.confidence * 100)}%)
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Estado de Validación */}
                      {validationResult.is_valid && validationResult.errors.length === 0 && validationResult.warnings.length === 0 && (
                        <div className="bg-green-50 dark:bg-green-900/20 border-2 border-green-300 dark:border-green-700 rounded-lg p-3">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                            <span className="text-sm font-semibold text-green-900 dark:text-green-100">
                              ✓ Asiento válido según las reglas configuradas
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Asientos Similares */}
                  {similarEntries.length > 0 && (
                      <div className="mt-3 p-4 bg-purple-50 border border-purple-200 rounded-xl">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-purple-900">📋 Asientos Similares:</span>
                            <span className="text-xs text-purple-600">({similarEntries.length} encontrados)</span>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => setSimilarEntries([])} className="bg-white">
                            Ocultar
                          </Button>
                        </div>
                        <div className="space-y-2">
                          {similarEntries.map((similar) => (
                            <div key={similar.id} className="bg-white border border-purple-200 rounded-lg p-3 hover:border-purple-400 transition-all">
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-mono text-purple-600">#{similar.id}</span>
                                    <span className="text-xs text-gray-500">{similar.date}</span>
                                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                                      {similar.similarity}% similar
                                    </span>
                                  </div>
                                  <div className="text-sm font-medium text-gray-900 mb-2">{similar.glosa}</div>
                                  <div className="flex gap-2 text-xs text-gray-600">
                                    <span>Debe: {formatCurrency(similar.total_debit)}</span>
                                    <span>•</span>
                                    <span>Haber: {formatCurrency(similar.total_credit)}</span>
                                  </div>
                                  {similar.sample_lines.length > 0 && (
                                    <div className="mt-2 text-xs text-gray-500">
                                      Cuentas: {similar.sample_lines.map((l: any) => l.account_code).join(', ')}
                                    </div>
                                  )}
                                </div>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => applySimilarEntry(similar)}
                                  className="ml-3 bg-purple-50 hover:bg-purple-100"
                                >
                                  Usar
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  {loadingSimilar && (
                      <div className="mt-3 text-sm text-gray-500 text-center py-2">
                        🔍 Buscando asientos similares...
                      </div>
                    )}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-semibold text-gray-700">Líneas del Asiento</label>
                      <Button variant="outline" size="sm" onClick={addLine}>
                        <Plus className="w-4 h-4" />
                        Agregar Línea
                      </Button>
                    </div>
                    <div className="space-y-3">
                      {form.lines.map((line, idx) => {
                        const account = accounts.find(a => a.code === line.account_code)
                        const templateLine = selectedTemplate?.lines[idx]
                        const isValidAccount = !!account
                        const hasAmount = line.debit > 0 || line.credit > 0
                        
                        return (
                        <div key={idx} className={`grid grid-cols-12 gap-3 items-start p-3 rounded-lg border-2 ${isValidAccount ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                          <div className="col-span-4 relative">
                            <div className="flex items-center gap-1 mb-1">
                              <label className="text-xs font-medium text-gray-600">Cuenta {idx + 1}</label>
                              {templateLine && (
                                <span className="text-xs text-blue-600" title={templateLine.description}>
                                  💡 {templateLine.description}
                                </span>
                              )}
                            </div>
                            <div className="relative">
                              <input
                                type="text"
                                data-line-account={idx}
                                placeholder="Buscar código o nombre..."
                                value={accountSearch[idx] ?? line.account_code}
                                onChange={e => {
                                  searchAccountsForLine(idx, e.target.value)
                                  updateLine(idx, 'account_code', e.target.value)
                                }}
                                onFocus={() => {
                                  if (!accountSearch[idx]) {
                                    setAccountSearch({ ...accountSearch, [idx]: line.account_code })
                                  }
                                  if (line.account_code.length >= 2) {
                                    searchAccountsForLine(idx, line.account_code)
                                  }
                                }}
                                onKeyDown={(e) => {
                                  // Ctrl+D: Duplicar línea actual
                                  if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
                                    e.preventDefault()
                                    duplicateLine(idx)
                                  }
                                  // Tab: Si es la última línea y tiene cuenta válida, crear nueva línea
                                  if (e.key === 'Tab' && !e.shiftKey && idx === form.lines.length - 1 && isValidAccount) {
                                    const hasAmount = line.debit > 0 || line.credit > 0
                                    if (hasAmount) {
                                      e.preventDefault()
                                      addLine()
                                    }
                                  }
                                }}
                                className={`w-full border-2 rounded-lg px-3 py-2 text-sm ${
                                  isValidAccount ? 'border-green-400 bg-white' : 
                                  line.account_code ? 'border-red-300 bg-red-50' : 'border-gray-300'
                                }`}
                              />
                              {accountSuggestions[idx] && accountSuggestions[idx].length > 0 && (
                                <div className="absolute z-10 w-full mt-1 bg-white border-2 border-blue-200 rounded-lg shadow-xl max-h-64 overflow-y-auto">
                                  {accountSuggestions[idx].map(acc => {
                                    const typeColors: Record<string, string> = {
                                      'A': 'bg-green-100 text-green-700',
                                      'P': 'bg-yellow-100 text-yellow-700',
                                      'PN': 'bg-purple-100 text-purple-700',
                                      'I': 'bg-blue-100 text-blue-700',
                                      'G': 'bg-red-100 text-red-700',
                                    }
                                    return (
                                    <div
                                      key={acc.id}
                                      onClick={() => selectAccountForLine(idx, acc)}
                                      className="px-3 py-2.5 hover:bg-blue-50 cursor-pointer border-b last:border-b-0 transition-colors"
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 flex-1">
                                          <span className="font-mono font-semibold text-primary-600 w-16">{acc.code}</span>
                                          <span className="flex-1 text-sm text-gray-900">{acc.name}</span>
                                        </div>
                                        <span className={`text-xs px-2 py-0.5 rounded ${typeColors[acc.type] || 'bg-gray-100 text-gray-700'}`}>
                                          {acc.type === 'A' ? 'Activo' : acc.type === 'P' ? 'Pasivo' : acc.type === 'PN' ? 'Patrimonio' : acc.type === 'I' ? 'Ingreso' : 'Gasto'}
                                        </span>
                                      </div>
                                    </div>
                                    )
                                  })}
                                </div>
                              )}
                              {accountSearch[idx] && accountSearch[idx].length > 0 && !isValidAccount && accountSuggestions[idx]?.length === 0 && (
                                <div className="absolute z-10 w-full mt-1 bg-yellow-50 border border-yellow-300 rounded-lg p-2 text-xs text-yellow-800">
                                  No se encontraron cuentas. Verifica el código o intenta buscar por nombre.
                                </div>
                              )}
                              {isValidAccount && account && (
                                <div className="mt-1 text-xs text-gray-600 flex items-center gap-2">
                                  <CheckCircle className="w-3 h-3 text-green-600" />
                                  <span>{account.name}</span>
                                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                                    account.type === 'A' ? 'bg-green-100 text-green-700' :
                                    account.type === 'P' ? 'bg-yellow-100 text-yellow-700' :
                                    account.type === 'PN' ? 'bg-purple-100 text-purple-700' :
                                    account.type === 'I' ? 'bg-blue-100 text-blue-700' :
                                    'bg-red-100 text-red-700'
                                  }`}>
                                    {account.type === 'A' ? 'Activo' : account.type === 'P' ? 'Pasivo' : account.type === 'PN' ? 'Patrimonio' : account.type === 'I' ? 'Ingreso' : 'Gasto'}
                                  </span>
                                </div>
                              )}
                              {line.account_code && !isValidAccount && (
                                <div className="mt-1 text-xs text-red-600 flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3" />
                                  <span>Cuenta no encontrada</span>
                                </div>
                              )}
                            </div>
                            {isValidAccount && (
                              <div className="absolute right-2 top-8">
                                <CheckCircle className="w-5 h-5 text-green-600" />
                              </div>
                            )}
                          </div>
                          <div className="col-span-3 relative">
                            <label className="text-xs font-medium text-gray-600 mb-1 block">Debe</label>
                            <div className="relative">
                              <input
                                type="text"
                                placeholder="0.00"
                                value={focusedInputs[`debit-${idx}`] 
                                  ? (inputValues[`debit-${idx}`] !== undefined ? inputValues[`debit-${idx}`] : (line.debit > 0 ? String(line.debit) : ''))
                                  : (line.debit > 0 ? formatNumber(line.debit) : '')}
                                onFocus={(e) => {
                                  setFocusedInputs(f => ({ ...f, [`debit-${idx}`]: true }))
                                  // Inicializar el valor local con el valor actual del estado
                                  const currentValue = line.debit > 0 ? String(line.debit) : ''
                                  setInputValues(v => {
                                    // Solo inicializar si no existe o si el valor en el estado ha cambiado
                                    if (v[`debit-${idx}`] === undefined) {
                                      return { ...v, [`debit-${idx}`]: currentValue }
                                    }
                                    return v
                                  })
                                  e.target.select()
                                }}
                                onBlur={e => {
                                  const inputValue = e.target.value.trim()
                                  
                                  // Si el campo está vacío al perder el focus, mantener el valor actual del estado
                                  if (inputValue === '') {
                                    // Si el estado tiene un valor mayor a 0, preservarlo
                                    if (line.debit > 0) {
                                      // El valor del estado se mantiene, solo cerramos el focus
                                      setFocusedInputs(f => ({ ...f, [`debit-${idx}`]: false }))
                                      // Preservar el valor local para que se muestre correctamente cuando vuelva a enfocarse
                                      setInputValues(v => ({ ...v, [`debit-${idx}`]: String(line.debit) }))
                                    } else {
                                      // Si el estado es 0 y el campo está vacío, está bien dejarlo así
                                      setFocusedInputs(f => ({ ...f, [`debit-${idx}`]: false }))
                                      setInputValues(v => ({ ...v, [`debit-${idx}`]: '' }))
                                    }
                                    return
                                  }
                                  
                                  const val = parseFloat(inputValue.replace(/,/g, ''))
                                  if (!isNaN(val) && val >= 0) {
                                    const roundedVal = Math.round(val * 100) / 100
                                    updateLine(idx, 'debit', roundedVal)
                                    updateLine(idx, 'credit', 0)
                                    setInputValues(v => ({ ...v, [`debit-${idx}`]: String(roundedVal) }))
                                  } else {
                                    // Si no es válido, restaurar el valor anterior del estado
                                    setInputValues(v => ({ ...v, [`debit-${idx}`]: line.debit > 0 ? String(line.debit) : '' }))
                                  }
                                  
                                  setFocusedInputs(f => ({ ...f, [`debit-${idx}`]: false }))
                                }}
                                onChange={e => {
                                  const inputValue = e.target.value.replace(/,/g, '')
                                  // Actualizar el valor local inmediatamente
                                  setInputValues(v => ({ ...v, [`debit-${idx}`]: inputValue }))
                                  
                                  if (inputValue === '' || inputValue === '-') {
                                    // Permitir campo vacío mientras se escribe, pero no actualizar el estado todavía
                                    return
                                  }
                                  
                                  const val = parseFloat(inputValue)
                                  if (!isNaN(val) && val >= 0) {
                                    const roundedVal = Math.round(val * 100) / 100
                                    updateLine(idx, 'debit', roundedVal)
                                    updateLine(idx, 'credit', 0)
                                  }
                                }}
                                className={`w-full border-2 rounded-lg px-3 py-2 text-sm text-right font-medium dark:bg-gray-700 dark:text-gray-100 ${
                                  line.debit > 0 ? 'border-green-400 bg-green-50 dark:bg-green-900/20 text-green-900 dark:text-green-100' : 'border-gray-300 dark:border-gray-600'
                                }`}
                              />
                              {line.debit > 0 && (
                                <div className="absolute left-2 top-1/2 -translate-y-1/2 text-green-600 dark:text-green-400">
                                  <span className="text-xs">+</span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="col-span-3 relative">
                            <label className="text-xs font-medium text-gray-600 mb-1 block">Haber</label>
                            <div className="relative">
                              <input
                                type="text"
                                placeholder="0.00"
                                value={focusedInputs[`credit-${idx}`] 
                                  ? (inputValues[`credit-${idx}`] !== undefined ? inputValues[`credit-${idx}`] : (line.credit > 0 ? String(line.credit) : ''))
                                  : (line.credit > 0 ? formatNumber(line.credit) : '')}
                                onFocus={(e) => {
                                  setFocusedInputs(f => ({ ...f, [`credit-${idx}`]: true }))
                                  // Inicializar el valor local con el valor actual del estado
                                  const currentValue = line.credit > 0 ? String(line.credit) : ''
                                  setInputValues(v => {
                                    // Solo inicializar si no existe o si el valor en el estado ha cambiado
                                    if (v[`credit-${idx}`] === undefined) {
                                      return { ...v, [`credit-${idx}`]: currentValue }
                                    }
                                    return v
                                  })
                                  e.target.select()
                                }}
                                onBlur={e => {
                                  const inputValue = e.target.value.trim()
                                  
                                  // Si el campo está vacío al perder el focus, mantener el valor actual del estado
                                  if (inputValue === '') {
                                    // Si el estado tiene un valor mayor a 0, preservarlo
                                    if (line.credit > 0) {
                                      // El valor del estado se mantiene, solo cerramos el focus
                                      setFocusedInputs(f => ({ ...f, [`credit-${idx}`]: false }))
                                      // Preservar el valor local para que se muestre correctamente cuando vuelva a enfocarse
                                      setInputValues(v => ({ ...v, [`credit-${idx}`]: String(line.credit) }))
                                    } else {
                                      // Si el estado es 0 y el campo está vacío, está bien dejarlo así
                                      setFocusedInputs(f => ({ ...f, [`credit-${idx}`]: false }))
                                      setInputValues(v => ({ ...v, [`credit-${idx}`]: '' }))
                                    }
                                    return
                                  }
                                  
                                  const val = parseFloat(inputValue.replace(/,/g, ''))
                                  if (!isNaN(val) && val >= 0) {
                                    const roundedVal = Math.round(val * 100) / 100
                                    updateLine(idx, 'credit', roundedVal)
                                    updateLine(idx, 'debit', 0)
                                    setInputValues(v => ({ ...v, [`credit-${idx}`]: String(roundedVal) }))
                                  } else {
                                    // Si no es válido, restaurar el valor anterior del estado
                                    setInputValues(v => ({ ...v, [`credit-${idx}`]: line.credit > 0 ? String(line.credit) : '' }))
                                  }
                                  
                                  setFocusedInputs(f => ({ ...f, [`credit-${idx}`]: false }))
                                }}
                                onChange={e => {
                                  const inputValue = e.target.value.replace(/,/g, '')
                                  // Actualizar el valor local inmediatamente
                                  setInputValues(v => ({ ...v, [`credit-${idx}`]: inputValue }))
                                  
                                  if (inputValue === '' || inputValue === '-') {
                                    // Permitir campo vacío mientras se escribe, pero no actualizar el estado todavía
                                    return
                                  }
                                  
                                  const val = parseFloat(inputValue)
                                  if (!isNaN(val) && val >= 0) {
                                    const roundedVal = Math.round(val * 100) / 100
                                    updateLine(idx, 'credit', roundedVal)
                                    updateLine(idx, 'debit', 0)
                                  }
                                }}
                                className={`w-full border-2 rounded-lg px-3 py-2 text-sm text-right font-medium dark:bg-gray-700 dark:text-gray-100 ${
                                  line.credit > 0 ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100' : 'border-gray-300 dark:border-gray-600'
                                }`}
                              />
                              {line.credit > 0 && (
                                <div className="absolute left-2 top-1/2 -translate-y-1/2 text-blue-600 dark:text-blue-400">
                                  <span className="text-xs">+</span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="col-span-2 flex items-end gap-2">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => duplicateLine(idx)} 
                              className="text-blue-600 hover:text-blue-700"
                              title="Duplicar línea (Ctrl+D)"
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                            {form.lines.length > 1 && (
                              <Button variant="ghost" size="sm" onClick={() => removeLine(idx)} className="text-red-600 hover:text-red-700" title="Eliminar línea">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                            {isValidAccount && hasAmount && (
                              <div className="text-xs text-green-600 flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" />
                                <span>OK</span>
                              </div>
                            )}
                          </div>
                          <div className="col-span-12">
                            <input
                              type="text"
                              placeholder="Memo / Referencia (opcional)"
                              value={line.memo || ''}
                              onChange={e => updateLine(idx, 'memo', e.target.value)}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs"
                            />
                          </div>
                        </div>
                      )
                    })}
                    </div>
                  </div>
                  {/* Resumen Visual de Partida Doble - Alineado con columnas */}
                  <div className="mt-4 p-4 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 rounded-xl border-2 border-gray-200 dark:border-gray-600">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100">Resumen de Partida Doble</h4>
                      <div className={`flex items-center gap-2 ${totals.balanced ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {totals.balanced ? (
                          <>
                            <CheckCircle className="w-5 h-5" />
                            <span className="font-bold">Balanceado</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-5 h-5" />
                            <span className="font-bold">Desbalanceado</span>
                          </>
                        )}
                      </div>
                    </div>
                    {/* Usar grid igual que la tabla para alineación */}
                    <div className="grid grid-cols-12 gap-3 items-center">
                      <div className="col-span-3"></div>
                      <div className="col-span-3"></div>
                      <div className="col-span-3 bg-white dark:bg-gray-800 rounded-lg p-3 border-2 border-green-200 dark:border-green-700">
                        <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Total Debe</div>
                        <div className={`text-xl font-bold text-right ${totals.balanced ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {formatNumber(totals.debit)}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          {form.lines.filter(l => l.debit > 0).length} línea(s) con debe
                        </div>
                      </div>
                      <div className="col-span-3 bg-white dark:bg-gray-800 rounded-lg p-3 border-2 border-blue-200 dark:border-blue-700">
                        <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Total Haber</div>
                        <div className={`text-xl font-bold text-right ${totals.balanced ? 'text-blue-700 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
                          {formatNumber(totals.credit)}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          {form.lines.filter(l => l.credit > 0).length} línea(s) con haber
                        </div>
                      </div>
                    </div>
                    {!totals.balanced && (
                      <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <div className="flex items-center gap-2 text-red-800 dark:text-red-300 text-sm">
                          <AlertCircle className="w-4 h-4" />
                          <span>
                            <strong>Diferencia:</strong> {formatCurrency(Math.abs(totals.debit - totals.credit))}
                          </span>
                        </div>
                        <div className="text-xs text-red-700 dark:text-red-400 mt-2">
                          Para que el asiento cuadre, la suma del Debe debe ser igual a la suma del Haber.
                          {totals.debit > totals.credit && (
                            <span> Agrega {formatCurrency(Math.abs(totals.debit - totals.credit))} en el Haber.</span>
                          )}
                          {totals.credit > totals.debit && (
                            <span> Agrega {formatCurrency(Math.abs(totals.debit - totals.credit))} en el Debe.</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Botones de acción */}
                  <div className="flex justify-end gap-3 pt-4 border-t">
                    <Button variant="outline" onClick={() => { 
                      setShowForm(false); 
                      setViewingEntry(null);
                      setEditingEntryId(null);
                    }}>
                      Cancelar
                    </Button>
                    <Button 
                      onClick={save} 
                      disabled={!totals.balanced || !form.glosa.trim() || form.lines.length < 2 || form.lines.some(l => !l.account_code.trim())}
                      className="bg-primary-600 hover:bg-primary-700"
                    >
                      {totals.balanced 
                        ? (editingEntryId ? 'Actualizar Asiento' : 'Registrar Asiento')
                        : 'Completa el asiento'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal del Asistente Guiado */}
      {showGuidedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowGuidedModal(false)}></div>
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">📚 Guía de Creación de Asientos</h2>
                  <p className="text-sm text-blue-100 mt-1">Guía paso a paso para crear asientos contables</p>
                </div>
                <button onClick={() => setShowGuidedModal(false)} className="text-white hover:text-gray-200">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="p-6">
              {/* Línea de tiempo */}
              <div className="relative">
                <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-blue-200 dark:bg-blue-800"></div>
                <div className="space-y-6">
                  {/* Paso 1 */}
                  <div className="relative flex items-start gap-4">
                    <div className={`relative z-10 flex items-center justify-center w-16 h-16 rounded-full border-4 ${
                      currentStep >= 1 ? 'bg-blue-600 border-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-400'
                    }`}>
                      {currentStep > 1 ? (
                        <CheckCircle className="w-8 h-8" />
                      ) : (
                        <span className="text-xl font-bold">1</span>
                      )}
                    </div>
                    <div className="flex-1 pb-6">
                      <div className={`p-4 rounded-xl border-2 ${
                        currentStep === 1 ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600'
                      }`}>
                        <h3 className="font-semibold text-lg mb-2 text-gray-900 dark:text-gray-100">1️⃣ Describe la Operación</h3>
                        <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                          Escribe una descripción clara de la transacción en el campo "Glosa / Descripción".
                        </p>
                        <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1 mt-2">
                          <p><strong>Ejemplos:</strong></p>
                          <ul className="list-disc list-inside space-y-1 ml-2">
                            <li>"Pago a proveedor ABC por factura F001-0001"</li>
                            <li>"Venta de productos a cliente XYZ"</li>
                            <li>"Compra de mercadería con IGV"</li>
                          </ul>
                        </div>
                        {currentStep === 1 && !form.glosa.trim() && (
                          <div className="mt-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-xs text-yellow-800 dark:text-yellow-200">
                            ⚠️ Escribe una descripción para continuar
                          </div>
                        )}
                        {form.glosa.trim() && currentStep === 1 && (
                          <div className="mt-3 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-xs text-green-800 dark:text-green-200">
                            ✓ Descripción ingresada: "{form.glosa.substring(0, 50)}{form.glosa.length > 50 ? '...' : ''}"
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Paso 2 */}
                  <div className="relative flex items-start gap-4">
                    <div className={`relative z-10 flex items-center justify-center w-16 h-16 rounded-full border-4 ${
                      currentStep >= 2 ? 'bg-blue-600 border-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-400'
                    }`}>
                      {currentStep > 2 ? (
                        <CheckCircle className="w-8 h-8" />
                      ) : (
                        <span className="text-xl font-bold">2</span>
                      )}
                    </div>
                    <div className="flex-1 pb-6">
                      <div className={`p-4 rounded-xl border-2 ${
                        currentStep === 2 ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600'
                      }`}>
                        <h3 className="font-semibold text-lg mb-2 text-gray-900 dark:text-gray-100">2️⃣ Selecciona o Busca Cuentas</h3>
                        <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                          Para cada línea del asiento, busca la cuenta por código (ej: 4212) o nombre (ej: "proveedor").
                        </p>
                        <div className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                          <p>El sistema te ayudará a encontrar la cuenta correcta mientras escribes.</p>
                        </div>
                        {currentStep === 2 && form.lines.every(l => !l.account_code.trim()) && (
                          <div className="mt-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-xs text-yellow-800 dark:text-yellow-200">
                            ⚠️ Selecciona al menos una cuenta para continuar
                          </div>
                        )}
                        {form.lines.some(l => l.account_code.trim()) && currentStep === 2 && (
                          <div className="mt-3 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-xs text-green-800 dark:text-green-200">
                            ✓ {form.lines.filter(l => l.account_code.trim()).length} cuenta(s) seleccionada(s)
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Paso 3 */}
                  <div className="relative flex items-start gap-4">
                    <div className={`relative z-10 flex items-center justify-center w-16 h-16 rounded-full border-4 ${
                      currentStep >= 3 ? 'bg-blue-600 border-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-400'
                    }`}>
                      {currentStep > 3 ? (
                        <CheckCircle className="w-8 h-8" />
                      ) : (
                        <span className="text-xl font-bold">3</span>
                      )}
                    </div>
                    <div className="flex-1 pb-6">
                      <div className={`p-4 rounded-xl border-2 ${
                        currentStep === 3 ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600'
                      }`}>
                        <h3 className="font-semibold text-lg mb-2 text-gray-900 dark:text-gray-100">3️⃣ Ingresa Montos</h3>
                        <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                          Ingresa los montos en Debe o Haber según corresponda.
                        </p>
                        <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1 mt-2">
                          <p><strong>Recuerda:</strong></p>
                          <ul className="list-disc list-inside space-y-1 ml-2">
                            <li><strong>Debe</strong> = Activos y Gastos aumentan, Pasivos y Capital disminuyen</li>
                            <li><strong>Haber</strong> = Pasivos y Capital aumentan, Activos y Gastos disminuyen</li>
                          </ul>
                        </div>
                        {currentStep === 3 && form.lines.every(l => !(l.debit > 0 || l.credit > 0)) && (
                          <div className="mt-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-xs text-yellow-800 dark:text-yellow-200">
                            ⚠️ Ingresa al menos un monto en Debe o Haber
                          </div>
                        )}
                        {form.lines.some(l => l.debit > 0 || l.credit > 0) && currentStep === 3 && (
                          <div className="mt-3 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-xs text-green-800 dark:text-green-200">
                            ✓ Montos ingresados. Total Debe: {formatCurrency(form.lines.reduce((sum, l) => sum + (l.debit || 0), 0))} | Total Haber: {formatCurrency(form.lines.reduce((sum, l) => sum + (l.credit || 0), 0))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Paso 4 */}
                  <div className="relative flex items-start gap-4">
                    <div className={`relative z-10 flex items-center justify-center w-16 h-16 rounded-full border-4 ${
                      currentStep >= 4 ? 'bg-blue-600 border-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-400'
                    }`}>
                      {currentStep > 4 ? (
                        <CheckCircle className="w-8 h-8" />
                      ) : (
                        <span className="text-xl font-bold">4</span>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className={`p-4 rounded-xl border-2 ${
                        currentStep === 4 ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600'
                      }`}>
                        <h3 className="font-semibold text-lg mb-2 text-gray-900 dark:text-gray-100">4️⃣ Verifica y Guarda</h3>
                        <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                          Verifica que el indicador de partida doble muestre "✓ Balanceado" antes de guardar.
                        </p>
                        <div className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                          <p>En contabilidad, la suma de Debe debe ser igual a la suma de Haber (partida doble).</p>
                        </div>
                        {currentStep === 4 && !totals.balanced && (
                          <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-800 dark:text-red-200">
                            ⚠️ El asiento no cuadra. Diferencia: {formatCurrency(Math.abs(totals.debit - totals.credit))}
                          </div>
                        )}
                        {totals.balanced && currentStep === 4 && (
                          <div className="mt-3 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-xs text-green-800 dark:text-green-200">
                            ✓ Asiento balanceado. Puedes guardar ahora.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Controles */}
              <div className="mt-6 flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setCurrentStep(Math.max(1, currentStep - 1))} disabled={currentStep === 1}>
                    ← Anterior
                  </Button>
                  <Button variant="outline" onClick={() => setCurrentStep(Math.min(4, currentStep + 1))} disabled={currentStep === 4}>
                    Siguiente →
                  </Button>
                  <Button variant="outline" onClick={() => {
                    // Avanzar automáticamente según el estado
                    if (!form.glosa.trim() && currentStep === 1) return
                    if (form.glosa.trim() && form.lines.length === 1 && currentStep === 1) setCurrentStep(2)
                    if (form.lines.some(l => l.account_code) && !form.lines.some(l => l.debit > 0 || l.credit > 0) && currentStep === 2) setCurrentStep(3)
                    if (form.lines.some(l => l.debit > 0 || l.credit > 0) && !totals.balanced && currentStep === 3) setCurrentStep(4)
                  }}>
                    Saltar paso
                  </Button>
                </div>
                <Button onClick={() => setShowGuidedModal(false)}>
                  Cerrar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Borrador Guardado */}
      {draftModal && (
        <MessageModal
          isOpen={true}
          onClose={() => {
            localStorage.removeItem(`asiento_draft_${empresaId}`)
            setDraftModal(null)
          }}
          type="info"
          title="Borrador Guardado"
          message={`Se encontró un borrador guardado anteriormente.\n\nFecha: ${new Date(draftModal.draft.timestamp).toLocaleString('es-PE')}\nGlosa: ${draftModal.draft.glosa || '(Sin descripción)'}\n\n¿Deseas recuperar este borrador?`}
          confirmText="Recuperar Borrador"
          cancelText="Descartar"
          showCancel={true}
          onConfirm={draftModal.onConfirm}
        />
      )}

      {/* Modal de Mensajes (Éxito/Error) */}
      {messageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setMessageModal(null)}></div>
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
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

      {/* Modal de Confirmación - Postear */}
      {confirmPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => {
            setConfirmPost(null)
            setPostError(null)
            setPostWarnings([])
            setConfirmedWarningCodes(new Set())
          }}></div>
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="text-lg font-bold mb-2 text-green-600 dark:text-green-400">Postear Asiento</div>
            <div className="text-sm text-gray-700 dark:text-gray-300 mb-4">
              Una vez posteado, el asiento <span className="font-semibold text-green-600 dark:text-green-400">afectará los estados financieros</span> y 
              <span className="font-semibold text-orange-600 dark:text-orange-400"> no podrá ser editado</span>. Solo podrá ser revertido.
              <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="text-xs font-semibold text-blue-800 dark:text-blue-300 mb-1">Asiento #{confirmPost.id}</div>
                <div className="text-xs text-blue-700 dark:text-blue-400">
                  Glosa: {confirmPost.glosa || '(Sin descripción)'}
                </div>
                {confirmPost.total_debit && confirmPost.total_credit && (
                  <div className="text-xs text-blue-700 dark:text-blue-400 mt-1">
                    Total: {formatCurrency(confirmPost.total_debit)} / {formatCurrency(confirmPost.total_credit)}
                  </div>
                )}
              </div>
            </div>
            
            {/* Mostrar advertencias que requieren confirmación */}
            {postWarnings.length > 0 && (
              <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <div className="flex items-start gap-2 mb-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-yellow-800 dark:text-yellow-300 mb-1">
                      Advertencias que requieren confirmación
                    </div>
                    <div className="text-xs text-yellow-700 dark:text-yellow-400">
                      Marque las casillas para confirmar que ha revisado cada advertencia:
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  {postWarnings.map((warning, idx) => (
                    <label 
                      key={idx}
                      className="flex items-start gap-2 p-2 bg-white dark:bg-gray-800 rounded border border-yellow-200 dark:border-yellow-700 hover:bg-yellow-50 dark:hover:bg-yellow-900/30 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={confirmedWarningCodes.has(warning.code)}
                        onChange={(e) => {
                          const newSet = new Set(confirmedWarningCodes)
                          if (e.target.checked) {
                            newSet.add(warning.code)
                          } else {
                            newSet.delete(warning.code)
                          }
                          setConfirmedWarningCodes(newSet)
                        }}
                        className="mt-1 w-4 h-4 text-yellow-600 border-gray-300 rounded focus:ring-yellow-500"
                      />
                      <div className="flex-1 text-xs text-gray-700 dark:text-gray-300">
                        {warning.message}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}
            
            {/* Mostrar error dentro del modal */}
            {postError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-red-800 dark:text-red-300 mb-1">No se puede postear</div>
                    <div className="text-xs text-red-700 dark:text-red-400 whitespace-pre-line">{postError}</div>
                  </div>
                </div>
              </div>
            )}
            
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setConfirmPost(null)
                  setPostError(null)
                  setPostWarnings([])
                  setConfirmedWarningCodes(new Set())
                }}
                disabled={postLoading}
              >
                {postError ? 'Cerrar' : 'Cancelar'}
              </Button>
              {!postError && (
                <Button 
                  className="bg-green-600 hover:bg-green-700" 
                  onClick={doPost}
                  disabled={postLoading || (postWarnings.length > 0 && confirmedWarningCodes.size < postWarnings.length)}
                >
                  {postLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Posteando...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Postear
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmación - Anular */}
      {confirmVoid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => {
            setConfirmVoid(null)
            setVoidError(null)
          }}></div>
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="text-lg font-bold mb-2 text-red-600 dark:text-red-400">Anular Asiento</div>
            <div className="text-sm text-gray-700 dark:text-gray-300 mb-4">
              Esta acción es <span className="font-semibold text-red-600 dark:text-red-400">irreversible</span>. 
              ¿Anular el asiento #{confirmVoid.id}?
              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Glosa: {confirmVoid.glosa || '(Sin descripción)'}
              </div>
            </div>
            
            {/* Mostrar error dentro del modal */}
            {voidError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-red-800 dark:text-red-300 mb-1">No se puede anular</div>
                    <div className="text-xs text-red-700 dark:text-red-400 whitespace-pre-line">{voidError}</div>
                  </div>
                </div>
              </div>
            )}
            
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setConfirmVoid(null)
                  setVoidError(null)
                }}
                disabled={voidLoading}
              >
                {voidError ? 'Cerrar' : 'Cancelar'}
              </Button>
              {!voidError && (
                <Button 
                  className="bg-red-600 hover:bg-red-700" 
                  onClick={doVoid}
                  disabled={voidLoading}
                >
                  {voidLoading ? 'Anulando...' : 'Anular'}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmación - Revertir */}
      {confirmReverse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => {
            setConfirmReverse(null)
            setReverseError(null)
            setReverseReason('')
          }}></div>
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="text-lg font-bold mb-2 text-orange-600 dark:text-orange-400">Revertir Asiento</div>
            <div className="text-sm text-gray-700 dark:text-gray-300 mb-4">
              <div className="mb-3">
                <span className="font-semibold text-orange-600 dark:text-orange-400">Este asiento NO será editado.</span> Se creará un nuevo asiento con los montos invertidos (DEBE ↔ HABER).
              </div>
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg mb-3">
                <div className="text-xs font-semibold text-blue-800 dark:text-blue-300 mb-1">Asiento #{confirmReverse.id}</div>
                <div className="text-xs text-blue-700 dark:text-blue-400">
                  Glosa: {confirmReverse.glosa || '(Sin descripción)'}
                </div>
                {confirmReverse.total_debit && confirmReverse.total_credit && (
                  <div className="text-xs text-blue-700 dark:text-blue-400 mt-1">
                    Total: {formatCurrency(confirmReverse.total_debit)} / {formatCurrency(confirmReverse.total_credit)}
                  </div>
                )}
              </div>
              <div className="mb-3">
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Motivo de reversión (opcional):
                </label>
                <textarea
                  value={reverseReason}
                  onChange={(e) => setReverseReason(e.target.value)}
                  placeholder="Ej: Error en el monto, cuenta incorrecta, etc."
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  rows={3}
                />
              </div>
            </div>
            
            {/* Mostrar error dentro del modal */}
            {reverseError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-red-800 dark:text-red-300 mb-1">No se puede revertir</div>
                    <div className="text-xs text-red-700 dark:text-red-400 whitespace-pre-line">{reverseError}</div>
                  </div>
                </div>
              </div>
            )}
            
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setConfirmReverse(null)
                  setReverseError(null)
                  setReverseReason('')
                }}
                disabled={reverseLoading}
              >
                {reverseError ? 'Cerrar' : 'Cancelar'}
              </Button>
              {!reverseError && (
                <Button 
                  className="bg-orange-600 hover:bg-orange-700" 
                  onClick={doReverse}
                  disabled={reverseLoading}
                >
                  {reverseLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Revirtiendo...
                    </>
                  ) : (
                    <>
                      <Undo2 className="w-4 h-4 mr-2" />
                      Revertir
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmación - Crear Ajuste */}
      {confirmAdjust && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => {
            setConfirmAdjust(null)
            setAdjustError(null)
            setAdjustReason('')
          }}></div>
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="text-lg font-bold mb-2 text-purple-600 dark:text-purple-400">Crear Asiento de Ajuste</div>
            <div className="text-sm text-gray-700 dark:text-gray-300 mb-4">
              <div className="mb-3">
                Se creará un nuevo asiento en estado <span className="font-semibold text-purple-600 dark:text-purple-400">DRAFT</span> referenciando este asiento.
                <span className="font-semibold text-orange-600 dark:text-orange-400"> Debes completar las líneas y montos manualmente.</span>
              </div>
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg mb-3">
                <div className="text-xs font-semibold text-blue-800 dark:text-blue-300 mb-1">Asiento #{confirmAdjust.id}</div>
                <div className="text-xs text-blue-700 dark:text-blue-400">
                  Glosa: {confirmAdjust.glosa || '(Sin descripción)'}
                </div>
              </div>
              <div className="mb-3">
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Motivo del ajuste (opcional):
                </label>
                <textarea
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Ej: Corrección de monto, ajuste por diferencia, etc."
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  rows={3}
                />
              </div>
            </div>
            
            {/* Mostrar error dentro del modal */}
            {adjustError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-red-800 dark:text-red-300 mb-1">No se puede crear ajuste</div>
                    <div className="text-xs text-red-700 dark:text-red-400 whitespace-pre-line">{adjustError}</div>
                  </div>
                </div>
              </div>
            )}
            
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setConfirmAdjust(null)
                  setAdjustError(null)
                  setAdjustReason('')
                }}
                disabled={adjustLoading}
              >
                {adjustError ? 'Cerrar' : 'Cancelar'}
              </Button>
              {!adjustError && (
                <Button 
                  className="bg-purple-600 hover:bg-purple-700" 
                  onClick={doAdjust}
                  disabled={adjustLoading}
                >
                  {adjustLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creando...
                    </>
                  ) : (
                    <>
                      <Wrench className="w-4 h-4 mr-2" />
                      Crear Ajuste
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Plantillas */}
      {showTemplatesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowTemplatesModal(false)}></div>
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">📋 Plantillas Predefinidas</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Selecciona una plantilla para crear asientos comunes rápidamente</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowTemplatesModal(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {templates.length === 0 ? (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p>No hay plantillas disponibles</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {templates.map(template => (
                    <div
                      key={template.id}
                      onClick={() => applyTemplate(template)}
                      className="bg-gray-50 dark:bg-gray-700/50 border-2 border-blue-200 dark:border-blue-800 rounded-lg p-4 cursor-pointer hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-lg transition-all"
                    >
                      <div className="font-semibold text-gray-900 dark:text-gray-100 mb-2">{template.name}</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mb-3">{template.description}</div>
                      <div className="text-xs text-blue-600 dark:text-blue-400 italic">"{template.glosa_example}"</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end">
              <Button variant="outline" onClick={() => setShowTemplatesModal(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Sugerencias */}
      {showSuggestionsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => {
            setShowSuggestionsModal(false)
            setSuggestions([])
          }}></div>
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">✨ Sugerencias de Asiento</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {suggestions.length > 0 
                    ? `${suggestions.length} línea(s) sugerida(s) basada(s) en tu descripción`
                    : 'Revisa las sugerencias antes de aplicar'}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => {
                setShowSuggestionsModal(false)
                setSuggestions([])
              }} className="text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {suggestions.length === 0 ? (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <AlertCircle className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p>No hay sugerencias disponibles</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {suggestions.map((s, idx) => (
                    <div key={idx} className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700">
                      <div className="flex-1 grid grid-cols-12 gap-4 items-center">
                        <div className="col-span-2">
                          <span className="font-mono text-sm font-semibold text-primary-600 dark:text-primary-400">{s.account_code}</span>
                        </div>
                        <div className="col-span-6">
                          <span className="text-sm text-gray-700 dark:text-gray-300">{s.account_name || 'Sin nombre'}</span>
                        </div>
                        <div className="col-span-4">
                          <div className={`font-medium text-sm ${s.side === 'debit' ? 'text-green-700 dark:text-green-400' : 'text-blue-700 dark:text-blue-400'}`}>
                            {s.side === 'debit' ? 'Debe' : 'Haber'}: {s.amount ? formatCurrency(s.amount) : <span className="text-amber-600 dark:text-amber-400">(sin monto)</span>}
                          </div>
                          {!s.amount && (
                            <span className="text-xs text-amber-600 dark:text-amber-400 mt-1 block">Completa el monto después de aplicar</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <Button variant="outline" onClick={() => {
                setShowSuggestionsModal(false)
                setSuggestions([])
              }}>
                Cancelar
              </Button>
              {suggestions.length > 0 && (
                <Button onClick={() => {
                  const finalLines = suggestions.map(s => ({
                    account_code: s.account_code,
                    debit: s.side === 'debit' ? (s.amount ?? 0) : 0,
                    credit: s.side === 'credit' ? (s.amount ?? 0) : 0,
                    memo: ''
                  }))
                  setForm(f => ({ ...f, lines: finalLines }))
                  setShowSuggestionsModal(false)
                }} className="bg-blue-600 hover:bg-blue-700">
                  Aplicar Sugerencias
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Wizard Modal - Combinado de Plantillas y Sugerencias */}
      {showWizardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => {
            setShowWizardModal(false)
            setWizardData({ glosa: '', monto: '', template: null })
            setSuggestions([])
            setWizardStep(1)
          }}></div>
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">🧙 Asistente de Asiento</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {wizardStep === 1 && 'Paso 1: Selecciona una plantilla (opcional)'}
                  {wizardStep === 2 && 'Paso 2: Ingresa la descripción y monto total'}
                  {wizardStep === 3 && 'Paso 3: Revisa las sugerencias'}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => {
                setShowWizardModal(false)
                setWizardData({ glosa: '', monto: '', template: null })
                setSuggestions([])
                setWizardStep(1)
              }} className="text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </Button>
            </div>
            
            {/* Indicador de pasos */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
              <div className="flex items-center justify-center gap-4">
                {[1, 2, 3].map((step) => (
                  <React.Fragment key={step}>
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                      wizardStep === step 
                        ? 'bg-blue-600 border-blue-600 text-white' 
                        : wizardStep > step
                        ? 'bg-green-600 border-green-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-400'
                    }`}>
                      {wizardStep > step ? (
                        <CheckCircle className="w-6 h-6" />
                      ) : (
                        <span className="font-bold">{step}</span>
                      )}
                    </div>
                    {step < 3 && (
                      <div className={`w-16 h-0.5 ${
                        wizardStep > step ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-600'
                      }`} />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {/* Paso 1: Seleccionar Plantilla */}
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <div className="text-center py-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                      Selecciona una plantilla (opcional)
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Puedes elegir una plantilla predefinida o crear tu asiento desde cero
                    </p>
                  </div>
                  
                  <div className="mb-4">
                    <div
                      onClick={() => {
                        setWizardData({ ...wizardData, template: null })
                        setWizardStep(2)
                      }}
                      className="p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-blue-400 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                          <FileText className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-gray-900 dark:text-gray-100">Crear desde cero</div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">Comienza sin plantilla</div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      </div>
                    </div>
                  </div>

                  {templates.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {templates.map(template => (
                        <div
                          key={template.id}
                          onClick={() => {
                            setWizardData({ ...wizardData, template })
                            setWizardStep(2)
                          }}
                          className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                            wizardData.template?.id === template.id
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                              : 'border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                          }`}
                        >
                          <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{template.name}</div>
                          <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">{template.description}</div>
                          <div className="text-xs text-blue-600 dark:text-blue-400 italic">"{template.glosa_example}"</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Paso 2: Glosa y Monto */}
              {wizardStep === 2 && (
                <div className="space-y-4">
                  <div className="text-center py-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                      Ingresa la información del asiento
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      La descripción y el monto total son necesarios para generar sugerencias
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-2">
                      Glosa / Descripción <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={wizardData.glosa}
                      onChange={e => setWizardData({ ...wizardData, glosa: e.target.value })}
                      placeholder="Ej: Pago a proveedores por factura F001-0001"
                      className="w-full border-2 border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                      rows={3}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-2">
                      Monto Total <span className="text-red-500">*</span>
                      {wizardData.template && (wizardData.template.id.includes('igv') || wizardData.template.id.includes('compra') || wizardData.template.id.includes('venta')) && (
                        <span className="text-xs text-blue-600 dark:text-blue-400">(con IGV)</span>
                      )}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={wizardData.monto}
                      onChange={e => setWizardData({ ...wizardData, monto: e.target.value })}
                      placeholder="Ej: 1180.00"
                      className="w-full border-2 border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                    />
                    {wizardData.template && (wizardData.template.id.includes('igv') || wizardData.template.id.includes('compra') || wizardData.template.id.includes('venta')) && wizardData.monto && Number(wizardData.monto) > 0 && (
                      <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs">
                        <div className="text-blue-800 dark:text-blue-200 font-medium mb-1">💡 Cálculo Automático:</div>
                        <div className="text-blue-700 dark:text-blue-300 space-y-1">
                          <div>Total (con IGV): {formatCurrency(Number(wizardData.monto))}</div>
                          <div>Base Imponible: {formatCurrency(Math.round((Number(wizardData.monto) / 1.18) * 100) / 100)}</div>
                          <div>IGV (18%): {formatCurrency(Math.round((Number(wizardData.monto) - Number(wizardData.monto) / 1.18) * 100) / 100)}</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {wizardData.template && (
                    <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                        <span className="text-green-900 dark:text-green-100 font-medium">
                          Plantilla seleccionada: "{wizardData.template.name}"
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Paso 3: Sugerencias */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <div className="text-center py-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                      Sugerencias de Asiento
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {suggestions.length > 0 
                        ? `${suggestions.length} línea(s) sugerida(s) basada(s) en tu descripción`
                        : 'No se encontraron sugerencias'}
                    </p>
                  </div>

                  {loadingSuggestions ? (
                    <div className="text-center py-12">
                      <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-600 dark:text-blue-400" />
                      <p className="text-gray-600 dark:text-gray-400">Buscando sugerencias...</p>
                    </div>
                  ) : suggestions.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                      <AlertCircle className="w-16 h-16 mx-auto mb-4 opacity-50" />
                      <p>No hay sugerencias disponibles</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {suggestions.map((s, idx) => (
                        <div key={idx} className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-700">
                          <div className="flex-1 grid grid-cols-12 gap-4 items-center">
                            <div className="col-span-2">
                              <span className="font-mono text-sm font-semibold text-primary-600 dark:text-primary-400">{s.account_code}</span>
                            </div>
                            <div className="col-span-6">
                              <span className="text-sm text-gray-700 dark:text-gray-300">{s.account_name || 'Sin nombre'}</span>
                            </div>
                            <div className="col-span-4">
                              <div className={`font-medium text-sm ${s.side === 'debit' ? 'text-green-700 dark:text-green-400' : 'text-blue-700 dark:text-blue-400'}`}>
                                {s.side === 'debit' ? 'Debe' : 'Haber'}: {s.amount ? formatCurrency(s.amount) : <span className="text-amber-600 dark:text-amber-400">(sin monto)</span>}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <div>
                {wizardStep > 1 && (
                  <Button variant="outline" onClick={() => setWizardStep(wizardStep - 1)}>
                    ← Anterior
                  </Button>
                )}
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => {
                  setShowWizardModal(false)
                  setWizardData({ glosa: '', monto: '', template: null })
                  setSuggestions([])
                  setWizardStep(1)
                }}>
                  Cancelar
                </Button>
                {wizardStep === 1 && (
                  <Button onClick={() => setWizardStep(2)}>
                    Siguiente →
                  </Button>
                )}
                {wizardStep === 2 && (
                  <Button 
                    onClick={async () => {
                      if (!wizardData.glosa.trim() || !wizardData.monto.trim()) {
                        showMessage('error', 'Campos Requeridos', 'Por favor, completa la descripción y el monto total')
                        return
                      }
                      // Si hay plantilla, aplicar directamente
                      if (wizardData.template) {
                        applyWizardData()
                      } else {
                        // Si no hay plantilla, buscar sugerencias
                        setWizardStep(3)
                        const hasSuggestions = await requestSuggestions(wizardData.glosa, Number(wizardData.monto))
                        if (!hasSuggestions) {
                          setWizardStep(2) // Volver al paso 2 si no hay sugerencias
                        }
                      }
                    }}
                    disabled={!wizardData.glosa.trim() || !wizardData.monto.trim()}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {wizardData.template ? 'Aplicar Plantilla' : 'Buscar Sugerencias →'}
                  </Button>
                )}
                {wizardStep === 3 && (
                  <Button onClick={applyWizardData} className="bg-green-600 hover:bg-green-700">
                    Aplicar al Formulario
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmación - Reactivar */}
      {confirmReactivate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setConfirmReactivate(null)}></div>
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="text-lg font-bold mb-2 text-green-600">Reactivar Asiento</div>
            <div className="text-sm text-gray-700 mb-6">
              ¿Reactivar el asiento #{confirmReactivate.id}?
              <div className="mt-2 text-xs text-gray-500">
                Glosa: {confirmReactivate.glosa || '(Sin descripción)'}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmReactivate(null)}>Cancelar</Button>
              <Button className="bg-green-600 hover:bg-green-700" onClick={doReactivate}>Reactivar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

