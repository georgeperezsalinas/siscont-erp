import { useState, useEffect } from 'react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { ActionBar } from '@/components/ui/ActionBar'
import { FilterBar } from '@/components/ui/FilterBar'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { 
  RefreshCw, Settings, CheckCircle, XCircle, AlertCircle, 
  FileText, Download, Eye, Calendar, Loader2, RotateCw, 
  Check, X, Edit, Info, Clock
} from 'lucide-react'
import { useOrg } from '@/stores/org'
import { formatDate, formatCurrency, showMessage } from '@/lib/utils'
import { MessageModal } from '@/components/ui/MessageModal'
import {
  getSireConfiguration,
  createSireConfiguration,
  syncSireProposals,
  listRVIEProposals,
  listRCEProposals,
  acceptRVIEProposal,
  acceptRCEProposal,
  complementRVIEProposal,
  complementRCEProposal,
  replaceRVIEProposal,
  replaceRCEProposal,
  listSireSyncLogs,
  getSirePeriods,
  type SireConfiguration,
  type SireProposal,
  type SireSyncRequest,
  type SireSyncLog
} from '@/api'

type ProposalType = 'RVIE' | 'RCE'
type ProposalStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'COMPLEMENTED' | 'REPLACED' | 'SYNCED'

export default function SIRE() {
  const { empresaId } = useOrg()
  const [activeTab, setActiveTab] = useState<ProposalType>('RVIE')
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [loadingPeriods, setLoadingPeriods] = useState(false)
  const [proposals, setProposals] = useState<SireProposal[]>([])
  const [syncLogs, setSyncLogs] = useState<SireSyncLog[]>([])
  const [configuration, setConfiguration] = useState<SireConfiguration | null>(null)
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [showProposalModal, setShowProposalModal] = useState(false)
  const [selectedProposal, setSelectedProposal] = useState<SireProposal | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [messageModal, setMessageModal] = useState<{ type: 'success' | 'error'; title: string; message: string } | null>(null)
  
  // Períodos disponibles
  const [rviePeriods, setRviePeriods] = useState<Array<{perTributario: string, codEstado: string, desEstado: string}>>([])
  const [rcePeriods, setRcePeriods] = useState<Array<{perTributario: string, codEstado: string, desEstado: string}>>([])
  const [selectedRviePeriods, setSelectedRviePeriods] = useState<string[]>([])
  const [selectedRcePeriods, setSelectedRcePeriods] = useState<string[]>([])

  // Configuración form
  const [configForm, setConfigForm] = useState({
    // Credenciales del generador (requeridas según manual SUNAT)
    ruc: '',
    usuario_generador: '',
    password_generador: '',
    
    // Credenciales OAuth
    oauth_client_id: '',
    oauth_client_secret: '',
    
    // Configuración
    auto_sync_enabled: false,
    sync_frequency_hours: 24,
    email_notifications: true,
    notification_emails: '',
    use_test_env: true  // Por defecto usar Modo Preliminar (seguro para pruebas)
  })

  useEffect(() => {
    if (empresaId) {
      loadConfiguration()
      loadProposals()
      loadSyncLogs()
    }
  }, [empresaId, activeTab, statusFilter, dateFrom, dateTo])

  async function loadConfiguration() {
    try {
      const config = await getSireConfiguration(empresaId)
      setConfiguration(config)
      setConfigForm({
        // Mostrar valores visibles, pero no secretos por seguridad
        ruc: config.ruc || '',
        usuario_generador: config.usuario_generador || '',
        password_generador: '', // No mostrar password por seguridad (debe reingresarse si se quiere cambiar)
        oauth_client_id: '***CONFIGURADO***', // Indicador de que está configurado
        oauth_client_secret: '***CONFIGURADO***', // Indicador de que está configurado
        auto_sync_enabled: config.auto_sync_enabled,
        sync_frequency_hours: config.sync_frequency_hours,
        email_notifications: config.email_notifications,
        notification_emails: config.notification_emails || '',
        use_test_env: config.use_test_env !== undefined ? config.use_test_env : true
      })
    } catch (err: any) {
      // Configuración no existe aún, es normal
      if (err.message.includes('404')) {
        setConfiguration(null)
      }
    }
  }

  async function loadProposals() {
    if (!empresaId) return
    try {
      setLoading(true)
      const params: any = {
        company_id: empresaId,
        limit: 100
      }
      if (statusFilter) params.status = statusFilter
      if (dateFrom) params.date_from = dateFrom
      if (dateTo) params.date_to = dateTo

      const data = activeTab === 'RVIE'
        ? await listRVIEProposals(params)
        : await listRCEProposals(params)
      setProposals(data)
    } catch (err: any) {
      showMessage('error', 'Error', `Error cargando propuestas: ${err.message || err}`)
      setProposals([])
    } finally {
      setLoading(false)
    }
  }

  async function loadSyncLogs() {
    if (!empresaId) return
    try {
      const logs = await listSireSyncLogs({
        company_id: empresaId,
        sync_type: activeTab,
        limit: 10
      })
      setSyncLogs(logs)
    } catch (err: any) {
      console.error('Error cargando logs:', err)
    }
  }

  async function handleGetPeriods() {
    if (!empresaId || !configuration) {
      showMessage('error', 'Error', 'No hay configuración SIRE disponible')
      return
    }

    try {
      setLoadingPeriods(true)
      const periods = await getSirePeriods(empresaId, activeTab)
      console.log('Períodos obtenidos:', periods)
      
      // Mostrar los períodos en un mensaje
      const periodsStr = JSON.stringify(periods, null, 2)
      setMessageModal({
        type: 'success',
        title: 'Períodos Obtenidos',
        message: `Períodos disponibles en SIRE:\n\n${periodsStr}`
      })
    } catch (err: any) {
      console.error('Error obteniendo períodos:', err)
      setMessageModal({
        type: 'error',
        title: 'Error Obteniendo Períodos',
        message: err.message || 'Error desconocido al obtener períodos'
      })
    } finally {
      setLoadingPeriods(false)
    }
  }

  async function handleSync() {
    if (!empresaId) {
      showMessage('error', 'Error', 'Debe seleccionar una empresa')
      return
    }
    
    if (!configuration) {
      showMessage('error', 'Error', 'Debe configurar SIRE primero para esta empresa')
      return
    }

    // Obtener períodos seleccionados según el tab activo
    const selectedPeriods = activeTab === 'RVIE' ? selectedRviePeriods : selectedRcePeriods
    
    if (selectedPeriods.length === 0) {
      showMessage('error', 'Error', 'Debe seleccionar al menos un período para sincronizar')
      return
    }

    try {
      setSyncing(true)
      const request: SireSyncRequest = {
        proposal_type: activeTab,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        periods: selectedPeriods.length > 0 ? selectedPeriods : undefined
      }
      const result = await syncSireProposals(empresaId, request)
      
      showMessage(
        'success',
        'Sincronización Completada',
        `Procesadas: ${result.records_processed} | Exitosas: ${result.records_success} | Fallidas: ${result.records_failed}`
      )
      
      await loadProposals()
      await loadSyncLogs()
    } catch (err: any) {
      showMessage('error', 'Error de Sincronización', err.message || 'Error desconocido')
    } finally {
      setSyncing(false)
    }
  }

  async function handleSaveConfiguration() {
    if (!empresaId) {
      showMessage('error', 'Error', 'Debe seleccionar una empresa')
      return
    }
    
    // Validar campos requeridos según manual SUNAT
    if (!configForm.ruc) {
      showMessage('error', 'Error', 'RUC del contribuyente es requerido')
      return
    }
    if (!configForm.usuario_generador) {
      showMessage('error', 'Error', 'Usuario del generador es requerido')
      return
    }
    
    // Si hay configuración existente, usar los valores guardados para OAuth si no se proporcionaron nuevos
    const payload: any = {
      ruc: configForm.ruc,
      usuario_generador: configForm.usuario_generador,
      auto_sync_enabled: configForm.auto_sync_enabled,
      sync_frequency_hours: configForm.sync_frequency_hours,
      email_notifications: configForm.email_notifications,
      notification_emails: configForm.notification_emails,
      use_test_env: configForm.use_test_env
    }
    
    // Solo incluir password si se proporcionó uno nuevo (no está vacío)
    if (configForm.password_generador && configForm.password_generador.trim() !== '') {
      payload.password_generador = configForm.password_generador
    }
    
    // Solo incluir OAuth credentials si se proporcionaron nuevos (no son los placeholders)
    if (configForm.oauth_client_id && 
        configForm.oauth_client_id !== '***CONFIGURADO***' && 
        configForm.oauth_client_id.trim() !== '') {
      payload.oauth_client_id = configForm.oauth_client_id
    } else if (!configuration) {
      // Si no hay configuración existente, OAuth es requerido
      showMessage('error', 'Error', 'Client ID OAuth es requerido para nueva configuración')
      return
    }
    
    if (configForm.oauth_client_secret && 
        configForm.oauth_client_secret !== '***CONFIGURADO***' && 
        configForm.oauth_client_secret.trim() !== '') {
      payload.oauth_client_secret = configForm.oauth_client_secret
    } else if (!configuration) {
      // Si no hay configuración existente, OAuth es requerido
      showMessage('error', 'Error', 'Client Secret OAuth es requerido para nueva configuración')
      return
    }

    try {
      await createSireConfiguration(empresaId, payload)
      showMessage('success', 'Configuración Guardada', `La configuración SIRE para esta empresa se guardó correctamente`)
      setShowConfigModal(false)
      await loadConfiguration()
    } catch (err: any) {
      showMessage('error', 'Error', `Error guardando configuración: ${err.message || err}`)
    }
  }

  async function handleAcceptProposal(proposal: SireProposal) {
    try {
      setLoading(true)
      if (activeTab === 'RVIE') {
        await acceptRVIEProposal(proposal.id, empresaId)
      } else {
        await acceptRCEProposal(proposal.id, empresaId)
      }
      showMessage('success', 'Propuesta Aceptada', 'La propuesta se aceptó correctamente')
      await loadProposals()
    } catch (err: any) {
      showMessage('error', 'Error', `Error aceptando propuesta: ${err.message || err}`)
    } finally {
      setLoading(false)
    }
  }

  function getStatusBadge(status: string) {
    const statusConfig: Record<string, { label: string; color: string }> = {
      PENDING: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
      ACCEPTED: { label: 'Aceptada', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
      REJECTED: { label: 'Rechazada', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
      COMPLEMENTED: { label: 'Complementada', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
      REPLACED: { label: 'Reemplazada', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
      SYNCED: { label: 'Sincronizada', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' }
    }
    const config = statusConfig[status] || { label: status, color: 'bg-gray-100 text-gray-700' }
    return (
      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    )
  }

  const proposalColumns: DataTableColumn<SireProposal>[] = [
    {
      key: 'sunat_proposal_id',
      label: 'ID SUNAT',
      render: (p) => (
        <div className="font-mono text-sm text-gray-900 dark:text-gray-100">
          {p.sunat_proposal_id}
        </div>
      ),
    },
    {
      key: 'proposal_date',
      label: 'Fecha',
      render: (p) => formatDate(p.proposal_date),
    },
    {
      key: 'proposal_data',
      label: 'Comprobante',
      render: (p) => {
        const data = p.proposal_data || {}
        return (
          <div className="text-sm">
            <div className="font-semibold text-gray-900 dark:text-gray-100">
              {data.tipoDocumento || data.doc_type || '-'} {data.serie || data.series || ''}-{data.numero || data.number || ''}
            </div>
            {data.fechaEmision && (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {formatDate(data.fechaEmision)}
              </div>
            )}
          </div>
        )
      },
    },
    {
      key: 'proposal_data',
      label: activeTab === 'RVIE' ? 'Cliente' : 'Proveedor',
      render: (p) => {
        const data = p.proposal_data || {}
        const customer = data.cliente || data.customer || {}
        const supplier = data.proveedor || data.supplier || {}
        const entity = activeTab === 'RVIE' ? customer : supplier
        return (
          <div className="text-sm">
            <div className="font-medium text-gray-900 dark:text-gray-100">
              {entity.ruc || entity.tax_id || '-'}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {entity.razonSocial || entity.name || '-'}
            </div>
          </div>
        )
      },
    },
    {
      key: 'proposal_data',
      label: 'Total',
      render: (p) => {
        const data = p.proposal_data || {}
        const total = data.total || data.total_amount || data.importeTotal || 0
        return (
          <div className="text-right font-semibold text-gray-900 dark:text-gray-100">
            {formatCurrency(Number(total))}
          </div>
        )
      },
      className: 'text-right',
    },
    {
      key: 'status',
      label: 'Estado',
      render: (p) => getStatusBadge(p.status),
    },
    {
      key: 'actions',
      label: 'Acciones',
      render: (p) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 hover:bg-blue-100 dark:hover:bg-blue-900/30 border border-blue-300 dark:border-blue-600"
            onClick={() => {
              setSelectedProposal(p)
              setShowProposalModal(true)
            }}
            title="Ver detalle"
          >
            <Eye className="w-3.5 h-3.5" />
          </Button>
          {p.status === 'PENDING' && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-100 dark:hover:bg-green-900/30 border border-green-300 dark:border-green-600"
              onClick={() => handleAcceptProposal(p)}
              title="Aceptar propuesta"
            >
              <Check className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      ),
      className: 'text-right',
    },
  ]

  const pendingCount = proposals.filter(p => p.status === 'PENDING').length
  const lastSync = syncLogs[0]

  return (
    <div className="space-y-6 animate-fade-in">
      <Breadcrumbs />

      <PageHeader
        title="SIRE - Sistema Integrado de Registros Electrónicos"
        subtitle="Gestiona las propuestas de ventas (RVIE) y compras (RCE) desde SUNAT"
        icon={FileText}
        iconColor="primary"
        actions={
          <ActionBar onRefresh={loadProposals} loading={loading}>
            <Button
              variant="outline"
              onClick={() => setShowConfigModal(true)}
              title="Configurar SIRE"
            >
              <Settings className="w-4 h-4" />
              Configurar
            </Button>
            <Button
              variant="outline"
              onClick={handleGetPeriods}
              disabled={!configuration || loadingPeriods}
              title="Obtener períodos disponibles de SIRE"
            >
              {loadingPeriods ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Obteniendo...
                </>
              ) : (
                <>
                  <Calendar className="w-4 h-4" />
                  Obtener Períodos
                </>
              )}
            </Button>
            <Button
              variant="default"
              onClick={handleSync}
              disabled={!configuration || syncing}
            >
              {syncing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sincronizando...
                </>
              ) : (
                <>
                  <RotateCw className="w-4 h-4" />
                  Sincronizar
                </>
              )}
            </Button>
          </ActionBar>
        }
      />

      {/* Selectores de Períodos */}
      {configuration && (rviePeriods.length > 0 || rcePeriods.length > 0) && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Períodos Disponibles</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGetPeriods}
                disabled={loadingPeriods}
              >
                {loadingPeriods ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Actualizar
              </Button>
            </div>
          </CardHeader>
          <div className="p-4 space-y-4">
            {/* Períodos RVIE */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Períodos RVIE (Ventas) - {selectedRviePeriods.length} seleccionados
              </label>
              <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto border rounded p-2">
                {rviePeriods.map((period) => (
                  <label key={period.perTributario} className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 p-1 rounded">
                    <input
                      type="checkbox"
                      checked={selectedRviePeriods.includes(period.perTributario)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedRviePeriods([...selectedRviePeriods, period.perTributario])
                        } else {
                          setSelectedRviePeriods(selectedRviePeriods.filter(p => p !== period.perTributario))
                        }
                      }}
                      className="rounded"
                    />
                    <span className="text-sm">
                      {period.perTributario}
                      <span className={`ml-1 text-xs ${period.codEstado === '03' ? 'text-orange-600' : 'text-gray-500'}`}>
                        ({period.desEstado})
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            
            {/* Períodos RCE */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Períodos RCE (Compras) - {selectedRcePeriods.length} seleccionados
              </label>
              <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto border rounded p-2">
                {rcePeriods.map((period) => (
                  <label key={period.perTributario} className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 p-1 rounded">
                    <input
                      type="checkbox"
                      checked={selectedRcePeriods.includes(period.perTributario)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedRcePeriods([...selectedRcePeriods, period.perTributario])
                        } else {
                          setSelectedRcePeriods(selectedRcePeriods.filter(p => p !== period.perTributario))
                        }
                      }}
                      className="rounded"
                    />
                    <span className="text-sm">
                      {period.perTributario}
                      <span className={`ml-1 text-xs ${period.codEstado === '03' ? 'text-orange-600' : 'text-gray-500'}`}>
                        ({period.desEstado})
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Alertas y Estado */}
      {!configuration && (
        <Card className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
          <div className="p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-amber-900 dark:text-amber-100 mb-1">
                Configuración SIRE Requerida
              </div>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Debe configurar las credenciales OAuth de SUNAT antes de usar SIRE.
                <Button
                  variant="link"
                  className="ml-2 p-0 h-auto text-amber-700 dark:text-amber-300 underline"
                  onClick={() => setShowConfigModal(true)}
                >
                  Configurar ahora
                </Button>
              </p>
            </div>
          </div>
        </Card>
      )}

      {configuration && lastSync && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <div className="p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Última Sincronización</div>
              <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {lastSync ? formatDate(lastSync.sync_date) : 'Nunca'}
              </div>
              {lastSync && (
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {lastSync.records_success} exitosas de {lastSync.records_processed}
                </div>
              )}
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Propuestas Pendientes</div>
              <div className="text-lg font-semibold text-amber-600 dark:text-amber-400">
                {pendingCount}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Requieren revisión
              </div>
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Propuestas</div>
              <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {proposals.length}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {activeTab === 'RVIE' ? 'RVIE' : 'RCE'}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => {
            setActiveTab('RVIE')
            setProposals([]) // Limpiar para recargar
          }}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'RVIE'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
          }`}
        >
          RVIE - Ventas ({activeTab === 'RVIE' ? proposals.filter(p => p.status === 'PENDING').length : 0} pendientes)
        </button>
        <button
          onClick={() => {
            setActiveTab('RCE')
            setProposals([]) // Limpiar para recargar
          }}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'RCE'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
          }`}
        >
          RCE - Compras ({activeTab === 'RCE' ? proposals.filter(p => p.status === 'PENDING').length : 0} pendientes)
        </button>
      </div>

      {/* Filtros */}
      <FilterBar
        searchValue=""
        onSearchChange={() => {}}
        searchPlaceholder="Buscar propuestas..."
      >
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border-2 border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        >
          <option value="">Todos los estados</option>
          <option value="PENDING">Pendiente</option>
          <option value="ACCEPTED">Aceptada</option>
          <option value="COMPLEMENTED">Complementada</option>
          <option value="REPLACED">Reemplazada</option>
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          className="border-2 border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          placeholder="Desde"
        />
        <input
          type="date"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          className="border-2 border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          placeholder="Hasta"
        />
      </FilterBar>

      {/* Tabla de Propuestas */}
      <Card>
        <CardHeader
          title={`Propuestas ${activeTab === 'RVIE' ? 'RVIE (Ventas)' : 'RCE (Compras)'}`}
          subtitle={`${proposals.length} propuesta${proposals.length !== 1 ? 's' : ''} encontrada${proposals.length !== 1 ? 's' : ''}`}
          icon={<FileText className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
        />
        <DataTable
          data={proposals}
          columns={proposalColumns}
          loading={loading}
          emptyMessage="No hay propuestas. Sincroniza con SUNAT para obtener propuestas."
        />
      </Card>

      {/* Modal de Configuración */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowConfigModal(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white p-6 rounded-t-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Settings className="w-6 h-6" />
                  <h2 className="text-xl font-bold">Configuración SIRE</h2>
                </div>
                <button
                  onClick={() => setShowConfigModal(false)}
                  className="text-white hover:text-gray-200"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                  <div className="text-sm text-blue-800 dark:text-blue-300">
                    <strong>Credenciales OAuth por Empresa:</strong> Cada empresa necesita sus propias credenciales OAuth de SUNAT.
                    Estas credenciales están asociadas al RUC de la empresa. Obtén las credenciales desde el portal de SUNAT.
                    IMPORTANTE: Las credenciales OAuth deben obtenerse desde SUNAT Operaciones en Línea.
                    Estas credenciales son diferentes a tu usuario/clave SOL.
                  </div>
                </div>
              </div>
              
              {empresaId && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                    <div className="text-sm text-amber-800 dark:text-amber-300">
                      <strong>Empresa Actual:</strong> La configuración se guardará para la empresa seleccionada actualmente en el selector superior.
                      Si cambias de empresa, deberás configurar SIRE nuevamente para esa empresa.
                    </div>
                  </div>
                </div>
              )}

              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Credenciales del Generador (Requeridas según Manual SUNAT)
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                      RUC del Contribuyente <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={configForm.ruc}
                      onChange={e => setConfigForm({ ...configForm, ruc: e.target.value })}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      placeholder="Ej: 20123456789"
                      maxLength={11}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                      Usuario del Generador <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={configForm.usuario_generador}
                      onChange={e => setConfigForm({ ...configForm, usuario_generador: e.target.value })}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      placeholder="Usuario del generador en SUNAT"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                      Password del Generador <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="password"
                      value={configForm.password_generador}
                      onChange={e => setConfigForm({ ...configForm, password_generador: e.target.value })}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      placeholder="Password del generador en SUNAT"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Credenciales OAuth
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                      OAuth Client ID <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={configForm.oauth_client_id}
                      onChange={e => setConfigForm({ ...configForm, oauth_client_id: e.target.value })}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      placeholder="Client ID de SUNAT"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                      OAuth Client Secret <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="password"
                      value={configForm.oauth_client_secret}
                      onChange={e => setConfigForm({ ...configForm, oauth_client_secret: e.target.value })}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      placeholder="Client Secret de SUNAT"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={configForm.auto_sync_enabled}
                      onChange={e => setConfigForm({ ...configForm, auto_sync_enabled: e.target.checked })}
                      className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Sincronización Automática</span>
                  </label>
                </div>

                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={configForm.email_notifications}
                      onChange={e => setConfigForm({ ...configForm, email_notifications: e.target.checked })}
                      className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Notificaciones por Email</span>
                  </label>
                </div>
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <div className="flex-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!configForm.use_test_env}
                        onChange={e => setConfigForm({ ...configForm, use_test_env: !e.target.checked })}
                        className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                      <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
                        Usar Operaciones Definitivas (Desactivar Modo Preliminar)
                      </span>
                    </label>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 ml-6">
                      {configForm.use_test_env 
                        ? "✅ Modo Preliminar activado (recomendado para pruebas - seguro)"
                        : "⚠️ Modo Definitivo activado (operaciones irreversibles)"}
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 ml-6">
                      <strong>NOTA:</strong> SIRE no tiene ambiente de pruebas separado. 
                      El Modo Preliminar permite trabajar con Preliminares que pueden ser borrados o reemplazados.
                      NO usar "Generar Registro" hasta estar seguro de los datos.
                    </p>
                  </div>
                </div>
              </div>

              {configForm.auto_sync_enabled && (
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                    Frecuencia de Sincronización (horas)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="168"
                    value={configForm.sync_frequency_hours}
                    onChange={e => setConfigForm({ ...configForm, sync_frequency_hours: parseInt(e.target.value) || 24 })}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
              )}

              {configForm.email_notifications && (
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                    Emails de Notificación (separados por coma)
                  </label>
                  <input
                    type="text"
                    value={configForm.notification_emails}
                    onChange={e => setConfigForm({ ...configForm, notification_emails: e.target.value })}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    placeholder="email1@example.com, email2@example.com"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowConfigModal(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSaveConfiguration}>
                  Guardar Configuración
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Detalle de Propuesta */}
      {showProposalModal && selectedProposal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowProposalModal(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white p-6 rounded-t-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">Detalle de Propuesta</h2>
                  <p className="text-sm text-primary-100 mt-1">
                    ID SUNAT: {selectedProposal.sunat_proposal_id}
                  </p>
                </div>
                <button
                  onClick={() => setShowProposalModal(false)}
                  className="text-white hover:text-gray-200"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Estado</div>
                  <div>{getStatusBadge(selectedProposal.status)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Fecha Propuesta</div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {formatDate(selectedProposal.proposal_date)}
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Datos del Comprobante</h3>
                <div className="overflow-x-auto border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-gray-200 dark:bg-gray-700 border-b-2 border-gray-400 dark:border-gray-500">
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700">Campo</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-900 dark:text-gray-100 bg-gray-200 dark:bg-gray-700">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(selectedProposal.proposal_data || {}).map(([key, value], idx) => (
                        <tr key={key} className={`${idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/70'} border-b border-gray-300 dark:border-gray-600`}>
                          <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">{key}</td>
                          <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                            {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {selectedProposal.status === 'PENDING' && (
                <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <Button
                    variant="default"
                    onClick={() => handleAcceptProposal(selectedProposal)}
                    className="flex-1"
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Aceptar Propuesta
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowProposalModal(false)}
                    className="flex-1"
                  >
                    Cerrar
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {messageModal && (
        <MessageModal
          type={messageModal.type}
          title={messageModal.title}
          message={messageModal.message}
          onClose={() => setMessageModal(null)}
        />
      )}
    </div>
  )
}

