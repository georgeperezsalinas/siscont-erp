import { useState, useEffect } from 'react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { ActionBar } from '@/components/ui/ActionBar'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { Table, TableHeader, TableHeaderCell, TableBody, TableRow, TableCell } from '@/components/ui/Table'
import { Plus, Building2, Wallet, Upload, RefreshCw, CheckCircle, AlertCircle, XCircle, FileText, Banknote, BookOpen, Calendar, Link2, Zap, Save, History, Download } from 'lucide-react'
import { Tabs, TabsList, TabsTriggerWithValue, TabsContentWithValue } from '@/components/ui/Tabs'
import { MessageModal } from '@/components/ui/MessageModal'
import { useOrg } from '@/stores/org'
import { useAuth } from '@/stores/auth'
import { 
  listBankAccounts, 
  createBankAccount, 
  uploadBankStatement, 
  getReconciliationSummary,
  getUnreconciledTransactions,
  getUnreconciledEntryLines,
  getAutoMatchSuggestions,
  createMatch,
  createBulkMatches,
  removeMatch,
  finalizeReconciliation,
  generateBankReconciliationTestData,
  downloadReconciliationExcel,
  listAccounts,
  createAccount,
  listPeriods,
  listReconciledMatches,
  getReconciledMatchDetail,
  type BankAccount,
  type BankAccountIn,
  type ReconciliationSummary,
  type BankTransactionOut,
  type EntryLineOut,
  type MatchSuggestion,
  type Account,
  type Period,
  type ReconciledMatch,
  type ReconciledMatchDetail
} from '@/api'
import { formatCurrency } from '@/lib/utils'

export default function ConciliacionBancaria() {
  const { empresaId, periodo } = useOrg()
  const { user } = useAuth()
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [selectedBankAccount, setSelectedBankAccount] = useState<BankAccount | null>(null)
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null)
  const [reconciliation, setReconciliation] = useState<ReconciliationSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [showCreateAccount, setShowCreateAccount] = useState(false)
  const [showUploadStatement, setShowUploadStatement] = useState(false)
  const [showCreateAccountForm, setShowCreateAccountForm] = useState(false)
  const [newAccountCode, setNewAccountCode] = useState('')
  const [newAccountName, setNewAccountName] = useState('')
  const [bankTransactions, setBankTransactions] = useState<BankTransactionOut[]>([])
  const [entryLines, setEntryLines] = useState<EntryLineOut[]>([])
  const [matchSuggestions, setMatchSuggestions] = useState<MatchSuggestion[]>([])
  const [loadingMatching, setLoadingMatching] = useState(false)
  const [selectedTxId, setSelectedTxId] = useState<number | null>(null)
  const [selectedLineId, setSelectedLineId] = useState<number | null>(null)
  const [showFinalizeModal, setShowFinalizeModal] = useState(false)
  const [finalizeData, setFinalizeData] = useState({ pending_debits: 0, pending_credits: 0, notes: '' })
  const [statementData, setStatementData] = useState({ statement_date: '', opening_balance: '', closing_balance: '', json_content: '' })
  const [uploadMode, setUploadMode] = useState<'json' | 'paste'>('json')
  const [reconciledMatches, setReconciledMatches] = useState<ReconciledMatch[]>([])
  const [selectedMatchDetail, setSelectedMatchDetail] = useState<ReconciledMatchDetail | null>(null)
  const [showMatchDetail, setShowMatchDetail] = useState(false)
  const [activeTab, setActiveTab] = useState<'matching' | 'history'>('matching')
  const [messageModal, setMessageModal] = useState<{ type: 'success' | 'error' | 'warning' | 'info'; title: string; message: string } | null>(null)
  const [confirmMatch, setConfirmMatch] = useState<{ txId: number; lineId: number; txAmount: number; lineAmount: number; difference: number } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  
  function showMessage(type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) {
    setMessageModal({ type, title, message })
  }
  
  const [newAccount, setNewAccount] = useState<BankAccountIn>({
    company_id: empresaId,
    account_id: 0,
    bank_name: '',
    account_number: '',
    currency: 'PEN'
  })
  
  useEffect(() => {
    if (empresaId) {
      loadBankAccounts()
      loadAccounts()
      loadPeriods()
    }
  }, [empresaId])
  
  useEffect(() => {
    if (selectedBankAccount && selectedPeriod) {
      loadReconciliation()
      loadMatchingData()
      loadReconciledMatches()
    }
  }, [selectedBankAccount, selectedPeriod])
  
  async function loadBankAccounts() {
    try {
      const data = await listBankAccounts(empresaId)
      setBankAccounts(data)
    } catch (err: any) {
      console.error('Error cargando cuentas bancarias:', err)
    }
  }
  
  async function loadAccounts() {
    try {
      const data = await listAccounts(empresaId)
      // Filtrar solo cuentas bancarias (10.x) y de nivel 2 o superior (no mostrar "10" que es nivel 1)
      const bankAccounts = data.filter(acc => 
        acc.code.startsWith('10') && 
        acc.level >= 2 && 
        acc.active
      )
      setAccounts(bankAccounts)
    } catch (err: any) {
      console.error('Error cargando cuentas:', err)
    }
  }
  
  async function loadPeriods() {
    try {
      const data = await listPeriods(empresaId)
      setPeriods(data)
      
      // Auto-seleccionar período del topbar si existe
      if (periodo) {
        const [year, month] = periodo.split('-').map(Number)
        const period = data.find(p => p.year === year && p.month === month)
        if (period) setSelectedPeriod(period)
      }
    } catch (err: any) {
      console.error('Error cargando periodos:', err)
    }
  }
  
  async function loadReconciliation() {
    if (!selectedBankAccount || !selectedPeriod) return
    try {
      setLoading(true)
      const data = await getReconciliationSummary(selectedBankAccount.id, selectedPeriod.id)
      setReconciliation(data)
    } catch (err: any) {
      console.error('Error cargando conciliación:', err)
      setReconciliation(null)
    } finally {
      setLoading(false)
    }
  }

  async function loadMatchingData() {
    if (!selectedBankAccount || !selectedPeriod) return
    try {
      setLoadingMatching(true)
      const [txs, lines, suggestions] = await Promise.all([
        getUnreconciledTransactions(selectedBankAccount.id, selectedPeriod.id),
        getUnreconciledEntryLines(selectedBankAccount.id, selectedPeriod.id),
        getAutoMatchSuggestions(selectedBankAccount.id, selectedPeriod.id)
      ])
      setBankTransactions(Array.isArray(txs) ? txs : [])
      setEntryLines(Array.isArray(lines) ? lines : [])
      setMatchSuggestions(Array.isArray(suggestions) ? suggestions : [])
      console.log('[Conciliación] Datos cargados:', {
        transacciones: (Array.isArray(txs) ? txs : []).length,
        lineas: (Array.isArray(lines) ? lines : []).length,
        sugerencias: (Array.isArray(suggestions) ? suggestions : []).length
      })
    } catch (err: any) {
      console.error('Error cargando datos de matching:', err)
      setBankTransactions([])
      setEntryLines([])
      setMatchSuggestions([])
    } finally {
      setLoadingMatching(false)
    }
  }

  async function loadReconciledMatches() {
    if (!selectedBankAccount || !selectedPeriod) return
    try {
      const matches = await listReconciledMatches(selectedBankAccount.id, selectedPeriod.id)
      setReconciledMatches(matches)
    } catch (err: any) {
      console.error('Error cargando conciliaciones realizadas:', err)
      setReconciledMatches([])
    }
  }
  
  async function handleCreateMatch(txId: number, lineId: number) {
    try {
      setLoadingMatching(true)
      await createMatch({ bank_transaction_id: txId, entry_line_id: lineId })
      // Limpiar selecciones antes de recargar para evitar que desaparezcan visualmente
      setSelectedTxId(null)
      setSelectedLineId(null)
      // Recargar datos después de un pequeño delay para que el usuario vea el cambio
      await new Promise(resolve => setTimeout(resolve, 300))
      await loadMatchingData()
      await loadReconciliation()
      await loadReconciledMatches() // Recargar historial
    } catch (err: any) {
      showMessage('error', 'Error', `Error al conciliar: ${err.message || err}`)
    } finally {
      setLoadingMatching(false)
    }
  }
  
  async function handleDeleteMatch(txId: number) {
    setConfirmDelete(txId)
  }
  
  async function doDeleteMatch() {
    if (!confirmDelete) return
    try {
      setLoadingMatching(true)
      await removeMatch(confirmDelete)
      await loadMatchingData()
      await loadReconciliation()
      await loadReconciledMatches()
      showMessage('success', 'Conciliación Revertida', 'La conciliación ha sido revertida exitosamente.')
      setConfirmDelete(null)
    } catch (err: any) {
      showMessage('error', 'Error', `Error al revertir conciliación: ${err.message || err}`)
    } finally {
      setLoadingMatching(false)
    }
  }
  
  async function handleViewMatchDetail(txId: number) {
    try {
      const detail = await getReconciledMatchDetail(txId)
      setSelectedMatchDetail(detail)
      setShowMatchDetail(true)
    } catch (err: any) {
      showMessage('error', 'Error', `Error al cargar detalle: ${err.message || err}`)
    }
  }

  async function handleApplySuggestions() {
    if (matchSuggestions.length === 0) return
    try {
      setLoadingMatching(true)
      await createBulkMatches({ matches: matchSuggestions.map(s => ({ bank_transaction_id: s.bank_transaction_id, entry_line_id: s.entry_line_id })) })
      await loadMatchingData()
      await loadReconciliation()
      await loadReconciledMatches()
      showMessage('success', 'Sugerencias Aplicadas', `Se aplicaron ${matchSuggestions.length} conciliación(es) automática(s) exitosamente.`)
    } catch (err: any) {
      showMessage('error', 'Error', `Error al aplicar sugerencias: ${err.message || err}`)
    } finally {
      setLoadingMatching(false)
    }
  }

  async function handleFinalizeReconciliation() {
    if (!selectedBankAccount || !selectedPeriod) return
    try {
      setLoading(true)
      const result = await finalizeReconciliation(selectedBankAccount.id, selectedPeriod.id, finalizeData)
      let message = `La conciliación ha sido ${result.status === 'CONCILIADO' ? 'finalizada' : 'actualizada'} exitosamente.`
      if (result.unreconciled_lines_warning && result.unreconciled_lines_warning > 0) {
        message += `\n\n⚠️ Advertencia: Existen ${result.unreconciled_lines_warning} línea(s) contable(s) sin conciliar. Se recomienda conciliarlas antes de finalizar.`
      }
      showMessage('success', 'Conciliación Finalizada', message)
      setShowFinalizeModal(false)
      await loadReconciliation()
      await loadMatchingData()
      await loadReconciledMatches()
    } catch (err: any) {
      showMessage('error', 'Error', `Error al finalizar conciliación: ${err.message || err}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerateTestData() {
    if (!selectedBankAccount || !selectedPeriod) return
    setMessageModal({
      type: 'warning',
      title: 'Generar Datos de Prueba',
      message: '¿Deseas generar datos de prueba?\n\nEsto creará:\n• Asientos contables de prueba\n• Extracto bancario con transacciones\n• Datos para probar la conciliación\n\nEsta acción no afecta datos reales.'
    })
  }
  
  async function doGenerateTestData() {
    if (!selectedBankAccount || !selectedPeriod) return
    try {
      setLoading(true)
      const result = await generateBankReconciliationTestData(selectedBankAccount.id, selectedPeriod.id)
      showMessage('success', 'Datos Generados', `Datos de prueba generados exitosamente:\n\n• ${result.entries_created} asiento(s) contable(s) creado(s)\n• ${result.transactions_count} transacción(es) bancaria(s) creada(s)\n• Saldo inicial: ${formatCurrency(result.opening_balance)}\n• Saldo final: ${formatCurrency(result.closing_balance)}`)
      await loadReconciliation()
      await loadMatchingData()
      await loadReconciledMatches()
      setMessageModal(null)
    } catch (err: any) {
      showMessage('error', 'Error', `Error al generar datos: ${err.message || err}`)
    } finally {
      setLoading(false)
    }
  }

  const [exporting, setExporting] = useState(false)
  async function handleExportExcel() {
    if (!selectedBankAccount || !selectedPeriod) return
    try {
      setExporting(true)
      const blob = await downloadReconciliationExcel(selectedBankAccount.id, selectedPeriod.id)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `conciliacion_${selectedBankAccount.bank_name.replace(/\s/g, '_')}_${selectedPeriod.year}${String(selectedPeriod.month).padStart(2, '0')}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      showMessage('success', 'Exportación Exitosa', 'El reporte de conciliación ha sido exportado a Excel.')
    } catch (err: any) {
      showMessage('error', 'Error', `Error al exportar: ${err.message || err}`)
    } finally {
      setExporting(false)
    }
  }
  
  async function handleCreateAccount() {
    if (!newAccount.bank_name || !newAccount.account_number || !newAccount.account_id) {
      showMessage('warning', 'Campos Requeridos', 'Completa todos los campos obligatorios para crear la cuenta bancaria.')
      return
    }
    
    try {
      await createBankAccount(newAccount)
      setShowCreateAccount(false)
      setShowCreateAccountForm(false)
      setNewAccount({
        company_id: empresaId,
        account_id: 0,
        bank_name: '',
        account_number: '',
        currency: 'PEN'
      })
      setNewAccountCode('')
      setNewAccountName('')
      loadBankAccounts()
      loadAccounts()
      showMessage('success', 'Cuenta Bancaria Creada', `La cuenta bancaria "${newAccount.bank_name}" ha sido creada exitosamente.`)
    } catch (err: any) {
      showMessage('error', 'Error', `Error al crear cuenta bancaria: ${err.message || err}`)
    }
  }

  async function handleCreateNewAccount() {
    if (!newAccountCode.trim() || !newAccountName.trim()) {
      showMessage('warning', 'Campos Requeridos', 'El código y nombre de la cuenta son obligatorios.')
      return
    }
    
    if (!newAccountCode.startsWith('10.')) {
      showMessage('warning', 'Código Inválido', 'El código de cuenta debe empezar con "10." (ej: 10.11, 10.12, etc.)')
      return
    }
    
    try {
      // Determinar el nivel basado en el código
      const parts = newAccountCode.split('.')
      const level = parts.length
      
      const newAcc = await createAccount({
        company_id: empresaId,
        code: newAccountCode.trim(),
        name: newAccountName.trim(),
        level: level,
        type: 'A' // Activo
      })
      
      // Seleccionar la cuenta recién creada
      setNewAccount({ ...newAccount, account_id: newAcc.id })
      setShowCreateAccountForm(false)
      setNewAccountCode('')
      setNewAccountName('')
      await loadAccounts() // Recargar cuentas
      showMessage('success', 'Cuenta Contable Creada', `La cuenta ${newAcc.code} - ${newAcc.name} ha sido creada exitosamente.`)
    } catch (err: any) {
      showMessage('error', 'Error', `Error al crear cuenta contable: ${err.message || err}`)
    }
  }
  
  const canModify = user?.role === 'ADMINISTRADOR' || user?.role === 'CONTADOR'
  
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumbs */}
      <Breadcrumbs />

      {/* Page Header */}
      <PageHeader
        title="Conciliación Bancaria"
        subtitle="Conciliación mensual de saldos bancarios."
        icon={Wallet}
        iconColor="primary"
        actions={
          canModify && (
            <ActionBar
              onNew={() => setShowCreateAccount(true)}
              newLabel="Nueva Cuenta Bancaria"
            />
          )
        }
      />
      
      {/* Selección de Cuenta y Período */}
      <Card>
        <CardHeader 
          title="Selección de Cuenta y Período"
          icon={<Calendar className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
        />
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Cuenta Bancaria</label>
              <select
                value={selectedBankAccount?.id || ''}
                onChange={(e) => {
                  const acc = bankAccounts.find(a => a.id === Number(e.target.value))
                  setSelectedBankAccount(acc || null)
                }}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
              >
                <option value="">Selecciona una cuenta bancaria</option>
                {bankAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.bank_name} - {acc.account_number} ({acc.account_code || 'N/A'})
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Período Contable</label>
              <select
                value={selectedPeriod?.id || ''}
                onChange={(e) => {
                  const period = periods.find(p => p.id === Number(e.target.value))
                  setSelectedPeriod(period || null)
                }}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"
              >
                <option value="">Selecciona un período</option>
                {periods.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.year}-{String(p.month).padStart(2, '0')} ({p.status})
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          {selectedBankAccount && selectedPeriod && (
            <div className="flex items-center gap-3">
              <Button
                onClick={loadReconciliation}
                variant="outline"
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Actualizar Conciliación
              </Button>
              <Button
                onClick={handleExportExcel}
                variant="outline"
                disabled={exporting || loading}
              >
                <Download className={`w-4 h-4 ${exporting ? 'animate-pulse' : ''}`} />
                Exportar Excel
              </Button>
              {canModify && (
                <>
                  <Button
                    onClick={() => setShowUploadStatement(true)}
                    variant="outline"
                  >
                    <Upload className="w-4 h-4" />
                    Cargar Extracto Bancario
                  </Button>
                  <Button
                    onClick={handleGenerateTestData}
                    variant="outline"
                    className="bg-green-50 hover:bg-green-100 border-green-300 text-green-700"
                    disabled={loading}
                  >
                    <Zap className="w-4 h-4" />
                    Generar Datos de Prueba
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </Card>
      
      {/* Resumen de Conciliación */}
      {reconciliation && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-medium text-gray-600">Saldo Contable</span>
              </div>
              <div className="text-2xl font-bold text-blue-700">
                {formatCurrency(reconciliation.book_balance)}
              </div>
            </div>
          </Card>
          
          <Card>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Banknote className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium text-gray-600">Saldo Bancario</span>
              </div>
              <div className="text-2xl font-bold text-green-700">
                {formatCurrency(reconciliation.bank_balance)}
              </div>
            </div>
          </Card>
          
          <Card>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <XCircle className="w-5 h-5 text-red-600" />
                <span className="text-sm font-medium text-gray-600">Pendientes Débito</span>
              </div>
              <div className="text-2xl font-bold text-red-700">
                {formatCurrency(reconciliation.pending_debits)}
              </div>
              <div className="text-xs text-gray-500 mt-1">Cheques pendientes</div>
            </div>
          </Card>
          
          <Card>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5 text-yellow-600" />
                <span className="text-sm font-medium text-gray-600">Pendientes Crédito</span>
              </div>
              <div className="text-2xl font-bold text-yellow-700">
                {formatCurrency(reconciliation.pending_credits)}
              </div>
              <div className="text-xs text-gray-500 mt-1">Depósitos en tránsito</div>
            </div>
          </Card>
          
          <Card>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-5 h-5 text-purple-600" />
                <span className="text-sm font-medium text-gray-600">Saldo Conciliado</span>
              </div>
              <div className="text-2xl font-bold text-purple-700">
                {formatCurrency(reconciliation.reconciled_balance)}
              </div>
              <div className={`text-xs font-medium mt-1 ${
                Math.abs(reconciliation.book_balance - reconciliation.reconciled_balance) < 0.01
                  ? 'text-green-600' : 'text-red-600'
              }`}>
                {Math.abs(reconciliation.book_balance - reconciliation.reconciled_balance) < 0.01
                  ? '✓ Conciliado' : '⚠ Desbalance'}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Interfaz de Matching Detallada con Pestañas */}
      {selectedBankAccount && selectedPeriod && reconciliation && (
        <Card>
          <CardHeader
            title="Conciliación Detallada"
            icon={<Link2 className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
            actions={
              <div className="flex items-center gap-2">
                {activeTab === 'matching' && (
                  <>
                    {matchSuggestions.length > 0 ? (
                      <Button
                        onClick={handleApplySuggestions}
                        variant="outline"
                        size="sm"
                        disabled={loadingMatching}
                        className="bg-yellow-50 hover:bg-yellow-100 border-yellow-300 text-yellow-700"
                      >
                        <Zap className="w-4 h-4" />
                        Aplicar {matchSuggestions.length} Sugerencia{matchSuggestions.length !== 1 ? 's' : ''}
                      </Button>
                    ) : (
                      <span className="text-xs text-gray-500 px-2">
                        {loadingMatching ? 'Cargando sugerencias...' : 'No hay sugerencias automáticas'}
                      </span>
                    )}
                    <Button
                      onClick={loadMatchingData}
                      variant="outline"
                      size="sm"
                      disabled={loadingMatching}
                    >
                      <RefreshCw className={`w-4 h-4 ${loadingMatching ? 'animate-spin' : ''}`} />
                      Actualizar
                    </Button>
                  </>
                )}
                {activeTab === 'history' && (
                  <Button
                    onClick={loadReconciledMatches}
                    variant="outline"
                    size="sm"
                    disabled={loadingMatching}
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingMatching ? 'animate-spin' : ''}`} />
                    Actualizar
                  </Button>
                )}
                {canModify && activeTab === 'matching' && (
                  <Button
                    onClick={() => setShowFinalizeModal(true)}
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Save className="w-4 h-4" />
                    Finalizar Conciliación
                  </Button>
                )}
              </div>
            }
          />
          
          {/* Pestañas */}
          <div className="px-6 pt-4">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'matching' | 'history')}>
              <TabsList>
                <TabsTriggerWithValue
                  value="matching"
                  activeValue={activeTab}
                  onValueChange={(v) => setActiveTab(v as 'matching' | 'history')}
                >
                  <Link2 className="w-4 h-4 mr-2" />
                  Conciliar ({bankTransactions.filter(tx => !tx.reconciled).length} pendientes)
                </TabsTriggerWithValue>
                <TabsTriggerWithValue
                  value="history"
                  activeValue={activeTab}
                  onValueChange={(v) => setActiveTab(v as 'matching' | 'history')}
                >
                  <History className="w-4 h-4 mr-2" />
                  Historial ({reconciledMatches.length})
                </TabsTriggerWithValue>
              </TabsList>
              
              {/* Contenido de Pestaña: Conciliar */}
              <TabsContentWithValue value="matching" activeValue={activeTab}>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
            {/* Transacciones Bancarias */}
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Banknote className="w-5 h-5 text-green-600" />
                Transacciones Bancarias ({bankTransactions.length})
              </h3>
              <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 dark:bg-gray-700 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-bold">Fecha</th>
                        <th className="px-3 py-2 text-left text-xs font-bold">Descripción</th>
                        <th className="px-3 py-2 text-right text-xs font-bold">Monto</th>
                        <th className="px-3 py-2 text-center text-xs font-bold">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bankTransactions.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-4 text-center text-gray-500">
                            No hay transacciones pendientes
                          </td>
                        </tr>
                      ) : (
                        bankTransactions
                          .filter(tx => !tx.reconciled) // Solo mostrar transacciones no conciliadas
                          .map(tx => {
                            const amount = tx.debit > 0 ? tx.debit : tx.credit
                            const isSelected = selectedTxId === tx.id
                            const suggestion = matchSuggestions.find(s => s.bank_transaction_id === tx.id)
                            return (
                              <tr
                                key={tx.id}
                                className={`border-b border-gray-200 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-blue-900/10 cursor-pointer transition-colors ${
                                  isSelected 
                                    ? 'bg-blue-200 dark:bg-blue-800/50 border-l-4 border-l-blue-600 dark:border-l-blue-400 shadow-md' 
                                    : ''
                                }`}
                                onClick={() => setSelectedTxId(tx.id === selectedTxId ? null : tx.id)}
                              >
                              <td className="px-3 py-2">{new Date(tx.transaction_date).toLocaleDateString()}</td>
                              <td className="px-3 py-2">
                                <div className="font-medium">{tx.description}</div>
                                {tx.reference && <div className="text-xs text-gray-500">Ref: {tx.reference}</div>}
                                {suggestion && (
                                  <div className="text-xs text-blue-600 mt-1">
                                    💡 Sugerencia: {Math.round(suggestion.confidence * 100)}% - {suggestion.reason}
                                  </div>
                                )}
                              </td>
                              <td className={`px-3 py-2 text-right font-medium ${tx.debit > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {formatCurrency(amount)}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {tx.reconciled ? (
                                  <CheckCircle className="w-4 h-4 text-green-600 mx-auto" />
                                ) : (
                                  <XCircle className="w-4 h-4 text-gray-400 mx-auto" />
                                )}
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Líneas Contables */}
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-600" />
                Líneas Contables ({entryLines.length})
              </h3>
              <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 dark:bg-gray-700 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-bold">Fecha</th>
                        <th className="px-3 py-2 text-left text-xs font-bold">Glosa</th>
                        <th className="px-3 py-2 text-right text-xs font-bold">Monto</th>
                        <th className="px-3 py-2 text-center text-xs font-bold">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entryLines.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-4 text-center text-gray-500">
                            No hay líneas contables pendientes
                          </td>
                        </tr>
                      ) : (
                        entryLines
                          .filter(line => !line.reconciled) // Solo mostrar líneas no conciliadas
                          .map(line => {
                            const amount = line.debit > 0 ? line.debit : line.credit
                            const isSelected = selectedLineId === line.id
                            const selectedTx = bankTransactions.find(tx => tx.id === selectedTxId)
                            const canMatch = selectedTxId !== null && selectedTx && !selectedTx.reconciled
                            
                            // Validar si los montos coinciden
                            let amountMatch = false
                            let amountDifference = 0
                            if (selectedTx) {
                              const txAmount = selectedTx.debit > 0 ? selectedTx.debit : selectedTx.credit
                              amountDifference = Math.abs(txAmount - amount)
                              amountMatch = amountDifference < 0.01 // Tolerancia de 1 centavo
                            }
                            
                            return (
                              <tr
                                key={line.id}
                                className={`border-b border-gray-200 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors ${
                                  isSelected ? 'bg-blue-100 dark:bg-blue-900/30' : ''
                                } ${
                                  selectedTxId && canMatch && amountMatch 
                                    ? 'bg-green-50 dark:bg-green-900/20 border-l-2 border-l-green-500' 
                                    : selectedTxId && canMatch && !amountMatch
                                    ? 'bg-yellow-50 dark:bg-yellow-900/20 border-l-2 border-l-yellow-500'
                                    : ''
                                }`}
                                onClick={() => {
                                  // Solo seleccionar/deseleccionar la línea, no hacer match automático
                                  setSelectedLineId(line.id === selectedLineId ? null : line.id)
                                }}
                              >
                                <td className="px-3 py-2">{new Date(line.entry_date).toLocaleDateString()}</td>
                                <td className="px-3 py-2">
                                  <div className="font-medium">{line.entry_glosa}</div>
                                  {line.memo && <div className="text-xs text-gray-500">{line.memo}</div>}
                                  {selectedTxId && canMatch && (
                                    <div className={`text-xs mt-1 font-medium ${
                                      amountMatch 
                                        ? 'text-green-600 dark:text-green-400' 
                                        : 'text-yellow-600 dark:text-yellow-400'
                                    }`}>
                                      {amountMatch ? (
                                        <>✓ Montos coinciden</>
                                      ) : (
                                        <>⚠ Diferencia: {formatCurrency(amountDifference)}</>
                                      )}
                                    </div>
                                  )}
                                </td>
                                <td className={`px-3 py-2 text-right font-medium ${line.debit > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                  {formatCurrency(amount)}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {canMatch && selectedTxId ? (
                                    <Button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        if (!amountMatch) {
                                          setConfirmMatch({
                                            txId: selectedTxId,
                                            lineId: line.id,
                                            txAmount: selectedTx.debit > 0 ? selectedTx.debit : selectedTx.credit,
                                            lineAmount: amount,
                                            difference: amountDifference
                                          })
                                          return
                                        }
                                        handleCreateMatch(selectedTxId, line.id)
                                      }}
                                      size="sm"
                                      variant={amountMatch ? "outline" : "outline"}
                                      className={`text-xs ${
                                        amountMatch 
                                          ? 'bg-green-50 hover:bg-green-100 border-green-300 text-green-700' 
                                          : 'bg-yellow-50 hover:bg-yellow-100 border-yellow-300 text-yellow-700'
                                      }`}
                                      disabled={loadingMatching}
                                    >
                                      <Link2 className="w-3 h-3" />
                                      {amountMatch ? 'Conciliar' : 'Conciliar (⚠)'}
                                    </Button>
                                  ) : !selectedTxId ? (
                                    <span className="text-xs text-gray-400">Selecciona una transacción</span>
                                  ) : (
                                    <span className="text-xs text-gray-400">-</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
              </TabsContentWithValue>
              
              {/* Contenido de Pestaña: Historial */}
              <TabsContentWithValue value="history" activeValue={activeTab}>
                <div className="p-6">
                  {reconciledMatches.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      No hay conciliaciones realizadas para este período
                    </div>
                  ) : (
                    <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100 dark:bg-gray-700 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-bold">Fecha</th>
                            <th className="px-3 py-2 text-left text-xs font-bold">Transacción Bancaria</th>
                            <th className="px-3 py-2 text-left text-xs font-bold">Línea Contable</th>
                            <th className="px-3 py-2 text-right text-xs font-bold">Monto</th>
                            <th className="px-3 py-2 text-center text-xs font-bold">Diferencia</th>
                            <th className="px-3 py-2 text-center text-xs font-bold">Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reconciledMatches.map(match => (
                            <tr
                              key={match.bank_transaction_id}
                              className={`border-b border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                                match.amount_difference > 0.01 ? 'bg-yellow-50 dark:bg-yellow-900/10' : ''
                              }`}
                            >
                              <td className="px-3 py-2">
                                {new Date(match.transaction_date).toLocaleDateString()}
                              </td>
                              <td className="px-3 py-2">
                                <div className="font-medium">{match.transaction_description}</div>
                                {match.transaction_reference && (
                                  <div className="text-xs text-gray-500">Ref: {match.transaction_reference}</div>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <div className="font-medium">{match.entry_glosa}</div>
                                {match.entry_memo && (
                                  <div className="text-xs text-gray-500">{match.entry_memo}</div>
                                )}
                                {match.entry_number && (
                                  <div className="text-xs text-blue-600">Asiento: {match.entry_number}</div>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right font-medium">
                                {formatCurrency(match.transaction_amount)}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {match.amount_difference < 0.01 ? (
                                  <span className="text-green-600 dark:text-green-400">✓ Coincide</span>
                                ) : (
                                  <span className="text-yellow-600 dark:text-yellow-400">
                                    ⚠ {formatCurrency(match.amount_difference)}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <Button
                                    onClick={() => handleViewMatchDetail(match.bank_transaction_id)}
                                    size="sm"
                                    variant="outline"
                                    className="text-xs"
                                  >
                                    <FileText className="w-3 h-3" />
                                    Ver
                                  </Button>
                                  <Button
                                    onClick={() => handleDeleteMatch(match.bank_transaction_id)}
                                    size="sm"
                                    variant="outline"
                                    className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                                    disabled={loadingMatching}
                                  >
                                    <XCircle className="w-3 h-3" />
                                    Revertir
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </TabsContentWithValue>
            </Tabs>
          </div>
        </Card>
      )}
      
      {/* Lista de Cuentas Bancarias */}
      <Card>
        <CardHeader 
          title={`Cuentas Bancarias Configuradas${bankAccounts.length > 0 ? ` (${bankAccounts.length} cuenta${bankAccounts.length !== 1 ? 's' : ''})` : ''}`}
          icon={<Wallet className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
          actions={
            <Button onClick={loadBankAccounts} variant="outline" size="sm">
              <RefreshCw className="w-4 h-4" />
            </Button>
          }
        />
        {bankAccounts.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No hay cuentas bancarias configuradas. Crea una para comenzar.
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-200 dark:bg-gray-700 border-b-2 border-gray-400 dark:border-gray-500">
                  <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700" style={{ minWidth: '200px' }}>Banco</th>
                  <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700" style={{ width: '150px' }}>Número de Cuenta</th>
                  <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700" style={{ minWidth: '200px' }}>Cuenta Contable</th>
                  <th className="px-3 py-2.5 text-center text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700" style={{ width: '80px' }}>Moneda</th>
                  <th className="px-3 py-2.5 text-center text-xs font-bold text-gray-900 dark:text-gray-100 bg-gray-200 dark:bg-gray-700" style={{ width: '100px' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {bankAccounts.map((acc, idx) => (
                  <tr 
                    key={acc.id}
                    className={`${idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/70'} ${selectedBankAccount?.id === acc.id ? 'bg-blue-100 dark:bg-blue-900/30' : ''} border-b border-gray-300 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-blue-900/10 cursor-pointer`}
                    onClick={() => setSelectedBankAccount(acc)}
                  >
                    <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">{acc.bank_name}</td>
                    <td className="px-3 py-2 font-mono text-sm text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">{acc.account_number}</td>
                    <td className="px-3 py-2 border-r border-gray-300 dark:border-gray-600">
                      <span className="font-mono text-sm text-gray-900 dark:text-gray-100">{acc.account_code || 'N/A'}</span>
                      {acc.account_name && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">{acc.account_name}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">{acc.currency}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${acc.active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                        {acc.active ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      
      {/* Modal: Crear Cuenta Bancaria */}
      {showCreateAccount && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Nueva Cuenta Bancaria</h3>
              <button
                onClick={() => setShowCreateAccount(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-gray-700">
                    Cuenta Contable (10.x - Bancos)
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowCreateAccountForm(!showCreateAccountForm)}
                    className="text-xs text-blue-600 hover:text-blue-800 underline"
                  >
                    {showCreateAccountForm ? 'Cancelar' : '+ Crear nueva cuenta'}
                  </button>
                </div>
                
                {showCreateAccountForm ? (
                  <div className="space-y-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">
                        Código de Cuenta (ej: 10.11, 10.12)
                      </label>
                      <input
                        type="text"
                        value={newAccountCode}
                        onChange={(e) => setNewAccountCode(e.target.value)}
                        placeholder="10.11"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                      <p className="text-xs text-gray-500 mt-1">Debe empezar con "10."</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1 block">
                        Nombre de la Cuenta
                      </label>
                      <input
                        type="text"
                        value={newAccountName}
                        onChange={(e) => setNewAccountName(e.target.value)}
                        placeholder="Ej: Banco BCP, Banco BBVA..."
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <Button
                      type="button"
                      onClick={handleCreateNewAccount}
                      size="sm"
                      className="w-full bg-blue-600 hover:bg-blue-700"
                    >
                      Crear Cuenta Contable
                    </Button>
                  </div>
                ) : (
                  <select
                    value={newAccount.account_id}
                    onChange={(e) => setNewAccount({ ...newAccount, account_id: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="0">Selecciona una cuenta</option>
                    {accounts.length === 0 ? (
                      <option disabled>No hay cuentas bancarias. Crea una nueva cuenta.</option>
                    ) : (
                      accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.code} - {acc.name}
                        </option>
                      ))
                    )}
                  </select>
                )}
                {accounts.length === 0 && !showCreateAccountForm && (
                  <p className="text-xs text-gray-500 mt-1">
                    No hay cuentas bancarias disponibles. Haz clic en "+ Crear nueva cuenta" para crear una.
                  </p>
                )}
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Nombre del Banco
                </label>
                <input
                  type="text"
                  value={newAccount.bank_name}
                  onChange={(e) => setNewAccount({ ...newAccount, bank_name: e.target.value })}
                  placeholder="Ej: BCP, BBVA, Interbank..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Número de Cuenta
                </label>
                <input
                  type="text"
                  value={newAccount.account_number}
                  onChange={(e) => setNewAccount({ ...newAccount, account_number: e.target.value })}
                  placeholder="Ej: 123-456789-0-12"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Moneda
                </label>
                <select
                  value={newAccount.currency}
                  onChange={(e) => setNewAccount({ ...newAccount, currency: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="PEN">Soles (PEN)</option>
                  <option value="USD">Dólares (USD)</option>
                  <option value="EUR">Euros (EUR)</option>
                </select>
              </div>
            </div>
            
            <div className="flex items-center gap-3 mt-6">
              <Button
                onClick={handleCreateAccount}
                className="bg-primary-600 hover:bg-primary-700 flex-1"
              >
                Crear Cuenta Bancaria
              </Button>
              <Button
                onClick={() => setShowCreateAccount(false)}
                variant="outline"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal: Cargar Extracto */}
      {showUploadStatement && selectedBankAccount && selectedPeriod && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Cargar Extracto Bancario</h3>
              <button
                onClick={() => {
                  setShowUploadStatement(false)
                  setStatementData({ statement_date: '', opening_balance: '', closing_balance: '', json_content: '' })
                  setUploadMode('json')
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>Cuenta:</strong> {selectedBankAccount.bank_name} - {selectedBankAccount.account_number}<br/>
                  <strong>Período:</strong> {selectedPeriod.year}-{selectedPeriod.month.toString().padStart(2, '0')}
                </p>
              </div>

              <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setUploadMode('json')}
                  className={`px-4 py-2 text-sm font-medium ${
                    uploadMode === 'json'
                      ? 'border-b-2 border-blue-600 text-blue-600'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  Subir Archivo JSON
                </button>
                <button
                  onClick={() => setUploadMode('paste')}
                  className={`px-4 py-2 text-sm font-medium ${
                    uploadMode === 'paste'
                      ? 'border-b-2 border-blue-600 text-blue-600'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  Pegar JSON
                </button>
              </div>

              {uploadMode === 'json' ? (
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                    Seleccionar archivo JSON
                  </label>
                  <input
                    type="file"
                    accept=".json"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        try {
                          const text = await file.text()
                          const data = JSON.parse(text)
                          setStatementData({
                            statement_date: data.statement_date || '',
                            opening_balance: data.opening_balance?.toString() || '',
                            closing_balance: data.closing_balance?.toString() || '',
                            json_content: JSON.stringify(data, null, 2)
                          })
                        } catch (err: any) {
                          showMessage('error', 'Error', `Error al leer el archivo: ${err.message}`)
                        }
                      }
                    }}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-100"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    El archivo debe tener el formato JSON con los campos: bank_account_id, period_id, statement_date, opening_balance, closing_balance, transactions
                  </p>
                </div>
              ) : (
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                    Pegar contenido JSON
                  </label>
                  <textarea
                    value={statementData.json_content}
                    onChange={(e) => setStatementData({ ...statementData, json_content: e.target.value })}
                    placeholder='{"bank_account_id": 1, "period_id": 1, ...}'
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm font-mono text-xs dark:bg-gray-700 dark:text-gray-100"
                    rows={12}
                  />
                </div>
              )}

              {statementData.json_content && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                      Fecha del Extracto
                    </label>
                    <input
                      type="date"
                      value={statementData.statement_date}
                      onChange={(e) => setStatementData({ ...statementData, statement_date: e.target.value })}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                        Saldo Inicial
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={statementData.opening_balance}
                        onChange={(e) => setStatementData({ ...statementData, opening_balance: e.target.value })}
                        placeholder="0.00"
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-100"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                        Saldo Final
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={statementData.closing_balance}
                        onChange={(e) => setStatementData({ ...statementData, closing_balance: e.target.value })}
                        placeholder="0.00"
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-100"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                <details className="text-xs">
                  <summary className="cursor-pointer text-gray-700 dark:text-gray-300 font-medium">
                    Ver ejemplo de formato JSON
                  </summary>
                  <pre className="mt-2 text-xs overflow-x-auto bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-600">
{`{
  "bank_account_id": ${selectedBankAccount.id},
  "period_id": ${selectedPeriod.id},
  "statement_date": "2025-01-31",
  "opening_balance": 10000.00,
  "closing_balance": 13050.00,
  "transactions": [
    {
      "transaction_date": "2025-01-05",
      "description": "Pago a proveedor",
      "reference": "CHQ-001",
      "debit": 1500.00,
      "credit": 0.00,
      "balance": 8500.00
    }
  ]
}`}
                  </pre>
                </details>
              </div>
            </div>
            
            <div className="flex items-center gap-3 mt-6">
              <Button
                onClick={async () => {
                  if (!statementData.json_content) {
                    showMessage('warning', 'Campo Requerido', 'Por favor, carga o pega el contenido JSON del extracto bancario.')
                    return
                  }
                  
                  try {
                    const data = JSON.parse(statementData.json_content)
                    data.bank_account_id = selectedBankAccount.id
                    data.period_id = selectedPeriod.id
                    if (statementData.statement_date) data.statement_date = statementData.statement_date
                    if (statementData.opening_balance) data.opening_balance = parseFloat(statementData.opening_balance)
                    if (statementData.closing_balance) data.closing_balance = parseFloat(statementData.closing_balance)
                    
                    await uploadBankStatement(data)
                    showMessage('success', 'Extracto Cargado', 'El extracto bancario ha sido cargado exitosamente.')
                    setShowUploadStatement(false)
                    setStatementData({ statement_date: '', opening_balance: '', closing_balance: '', json_content: '' })
                    await loadReconciliation()
                    await loadMatchingData()
                    await loadReconciledMatches()
                  } catch (err: any) {
                    showMessage('error', 'Error', `Error al cargar extracto: ${err.message || err}`)
                  }
                }}
                disabled={!statementData.json_content}
                className="bg-primary-600 hover:bg-primary-700 flex-1"
              >
                Cargar Extracto
              </Button>
              <Button
                onClick={() => {
                  setShowUploadStatement(false)
                  setStatementData({ statement_date: '', opening_balance: '', closing_balance: '', json_content: '' })
                  setUploadMode('json')
                }}
                variant="outline"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Finalizar Conciliación */}
      {showFinalizeModal && reconciliation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Finalizar Conciliación</h3>
              <button
                onClick={() => setShowFinalizeModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Saldo Contable:</span>
                    <div className="font-bold text-blue-700 dark:text-blue-300">{formatCurrency(reconciliation.book_balance)}</div>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Saldo Bancario:</span>
                    <div className="font-bold text-green-700 dark:text-green-300">{formatCurrency(reconciliation.bank_balance)}</div>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                  Pendientes Débito (Cheques pendientes)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={finalizeData.pending_debits}
                  onChange={(e) => setFinalizeData({ ...finalizeData, pending_debits: parseFloat(e.target.value) || 0 })}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-100"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                  Pendientes Crédito (Depósitos en tránsito)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={finalizeData.pending_credits}
                  onChange={(e) => setFinalizeData({ ...finalizeData, pending_credits: parseFloat(e.target.value) || 0 })}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-100"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                  Notas (Opcional)
                </label>
                <textarea
                  value={finalizeData.notes}
                  onChange={(e) => setFinalizeData({ ...finalizeData, notes: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-100"
                  rows={3}
                  placeholder="Observaciones sobre la conciliación..."
                />
              </div>

              {reconciliation && (
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                  <div className="text-sm">
                    <div className="flex justify-between mb-1">
                      <span className="text-gray-600 dark:text-gray-400">Saldo Conciliado Calculado:</span>
                      <span className="font-bold">
                        {formatCurrency(
                          reconciliation.book_balance + finalizeData.pending_credits - finalizeData.pending_debits
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Diferencia:</span>
                      <span className={`font-bold ${
                        Math.abs(
                          (reconciliation.book_balance + finalizeData.pending_credits - finalizeData.pending_debits) - reconciliation.bank_balance
                        ) < 0.01 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {formatCurrency(
                          Math.abs(
                            (reconciliation.book_balance + finalizeData.pending_credits - finalizeData.pending_debits) - reconciliation.bank_balance
                          )
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-3 mt-6">
              <Button
                onClick={handleFinalizeReconciliation}
                disabled={loading}
                className="bg-green-600 hover:bg-green-700 flex-1"
              >
                {loading ? 'Guardando...' : 'Finalizar Conciliación'}
              </Button>
              <Button
                onClick={() => setShowFinalizeModal(false)}
                variant="outline"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Detalle de Conciliación */}
      {showMatchDetail && selectedMatchDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowMatchDetail(false)}></div>
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5" />
                  <div>
                    <h2 className="text-xl font-bold">Detalle de Conciliación</h2>
                    <p className="text-sm text-white/90">Información completa de la conciliación realizada</p>
                  </div>
                </div>
                <button onClick={() => setShowMatchDetail(false)} className="text-white hover:text-gray-200">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Transacción Bancaria */}
              <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Banknote className="w-4 h-4 text-green-600" />
                  Transacción Bancaria
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Fecha:</span>
                    <span className="ml-2 font-medium">{new Date(selectedMatchDetail.bank_transaction.date).toLocaleDateString()}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Monto:</span>
                    <span className={`ml-2 font-medium ${selectedMatchDetail.bank_transaction.type === 'debit' ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(selectedMatchDetail.bank_transaction.amount)}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-500">Descripción:</span>
                    <span className="ml-2 font-medium">{selectedMatchDetail.bank_transaction.description}</span>
                  </div>
                  {selectedMatchDetail.bank_transaction.reference && (
                    <div>
                      <span className="text-gray-500">Referencia:</span>
                      <span className="ml-2 font-medium">{selectedMatchDetail.bank_transaction.reference}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-500">Saldo:</span>
                    <span className="ml-2 font-medium">{formatCurrency(selectedMatchDetail.bank_transaction.balance)}</span>
                  </div>
                </div>
              </div>

              {/* Línea Contable */}
              <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-blue-600" />
                  Línea Contable
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Fecha:</span>
                    <span className="ml-2 font-medium">{new Date(selectedMatchDetail.entry_line.date).toLocaleDateString()}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Monto:</span>
                    <span className={`ml-2 font-medium ${selectedMatchDetail.entry_line.type === 'debit' ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(selectedMatchDetail.entry_line.amount)}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-500">Glosa:</span>
                    <span className="ml-2 font-medium">{selectedMatchDetail.entry_line.glosa}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Cuenta:</span>
                    <span className="ml-2 font-medium">{selectedMatchDetail.entry_line.account_code} - {selectedMatchDetail.entry_line.account_name}</span>
                  </div>
                  {selectedMatchDetail.entry_line.memo && (
                    <div className="col-span-2">
                      <span className="text-gray-500">Memo:</span>
                      <span className="ml-2">{selectedMatchDetail.entry_line.memo}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Asiento Contable */}
              <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-purple-600" />
                  Asiento Contable
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Número:</span>
                    <span className="ml-2 font-medium">{selectedMatchDetail.journal_entry.number}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Estado:</span>
                    <span className="ml-2 font-medium">{selectedMatchDetail.journal_entry.status}</span>
                  </div>
                </div>
              </div>

              {/* Validación */}
              <div className={`border rounded-lg p-4 ${
                selectedMatchDetail.reconciliation.amounts_match 
                  ? 'border-green-200 bg-green-50 dark:bg-green-900/20' 
                  : 'border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20'
              }`}>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  {selectedMatchDetail.reconciliation.amounts_match ? (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-yellow-600" />
                  )}
                  Validación de Montos
                </h3>
                <div className="text-sm">
                  {selectedMatchDetail.reconciliation.amounts_match ? (
                    <span className="text-green-700 dark:text-green-400">
                      ✓ Los montos coinciden exactamente
                    </span>
                  ) : (
                    <span className="text-yellow-700 dark:text-yellow-400">
                      ⚠ Hay una diferencia de {formatCurrency(selectedMatchDetail.reconciliation.amount_difference)} entre los montos
                    </span>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <Button
                  onClick={() => handleDeleteMatch(selectedMatchDetail.bank_transaction.id)}
                  variant="outline"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  disabled={loadingMatching}
                >
                  <XCircle className="w-4 h-4" />
                  Revertir Conciliación
                </Button>
                <Button onClick={() => setShowMatchDetail(false)}>
                  Cerrar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Mensajes */}
      {messageModal && (
        <MessageModal
          isOpen={true}
          onClose={() => {
            setMessageModal(null)
            // Si es el modal de generar datos de prueba y se confirma, ejecutar
            if (messageModal.type === 'warning' && messageModal.title === 'Generar Datos de Prueba') {
              // El usuario cerró sin confirmar, no hacer nada
            }
          }}
          type={messageModal.type}
          title={messageModal.title}
          message={messageModal.message}
          confirmText={messageModal.type === 'warning' && messageModal.title === 'Generar Datos de Prueba' ? 'Generar' : 'Aceptar'}
          onConfirm={messageModal.type === 'warning' && messageModal.title === 'Generar Datos de Prueba' ? doGenerateTestData : undefined}
          showCancel={messageModal.type === 'warning' && messageModal.title === 'Generar Datos de Prueba'}
          cancelText="Cancelar"
        />
      )}

      {/* Modal de Confirmación: Conciliar con Diferencia */}
      {confirmMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setConfirmMatch(null)}></div>
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="text-lg font-bold mb-2 text-amber-600 dark:text-amber-400">⚠️ Montos No Coinciden</div>
            <div className="text-sm text-gray-700 dark:text-gray-300 mb-6">
              Los montos no coinciden exactamente. ¿Deseas conciliar de todas formas?
              <div className="mt-4 space-y-2 bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Transacción Bancaria:</span>
                  <span className="font-medium">{formatCurrency(confirmMatch.txAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Línea Contable:</span>
                  <span className="font-medium">{formatCurrency(confirmMatch.lineAmount)}</span>
                </div>
                <div className="flex justify-between border-t border-gray-300 dark:border-gray-600 pt-2">
                  <span className="font-semibold text-amber-600 dark:text-amber-400">Diferencia:</span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">{formatCurrency(confirmMatch.difference)}</span>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmMatch(null)}>Cancelar</Button>
              <Button 
                className="bg-amber-600 hover:bg-amber-700" 
                onClick={() => {
                  handleCreateMatch(confirmMatch.txId, confirmMatch.lineId)
                  setConfirmMatch(null)
                }}
              >
                Conciliar de Todas Formas
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmación: Revertir Conciliación */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setConfirmDelete(null)}></div>
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="text-lg font-bold mb-2 text-red-600 dark:text-red-400">Revertir Conciliación</div>
            <div className="text-sm text-gray-700 dark:text-gray-300 mb-6">
              Esta acción es <span className="font-semibold text-red-600 dark:text-red-400">irreversible</span>. 
              ¿Estás seguro de que deseas revertir esta conciliación?
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
              <Button className="bg-red-600 hover:bg-red-700" onClick={doDeleteMatch}>Revertir</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

