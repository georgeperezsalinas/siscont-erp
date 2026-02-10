/**
 * Mantenimiento de Datos - SAP-style
 * 
 * Organización multiempresa:
 * - Datos por Empresa: Limpiar y generar datos de prueba para la empresa seleccionada
 * - Sistema y Base de Datos: Operaciones críticas (inicializar, reset, restaurar)
 */
import React, { useState, useEffect } from 'react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { MessageModal, type MessageType } from '@/components/ui/MessageModal'
import { Tabs, TabsTriggerWithValue, TabsContentWithValue } from '@/components/ui/Tabs'
import {
  AlertTriangle,
  AlertCircle,
  Trash2,
  Database,
  Loader2,
  Archive,
  HardDrive,
  DatabaseBackup,
  RotateCcw,
  Building2,
  FolderCog,
  ShieldAlert,
} from 'lucide-react'
import {
  cleanupAccountingData,
  generateTestData,
  listCompanies,
  listPeriods,
  initDatabase,
  resetForFirstTime,
  listDbDumps,
  restoreDatabase,
  removeToken,
} from '@/api'
import { useOrg } from '@/stores/org'
import { useAuth } from '@/stores/auth'
import type { Company } from '@/api'

type TabId = 'empresa' | 'sistema'

export default function MantenimientoDatos() {
  const { empresaId } = useOrg()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<TabId>('empresa')
  const [companies, setCompanies] = useState<Company[]>([])
  const [periods, setPeriods] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: MessageType; title: string; content: string } | null>(null)
  const [confirmCleanup, setConfirmCleanup] = useState(false)
  const [dumps, setDumps] = useState<{ filename: string; size_mb: number; modified: string }[]>([])
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null)
  const [confirmInit, setConfirmInit] = useState(false)
  const [confirmResetFirstTime, setConfirmResetFirstTime] = useState(false)

  const [cleanupConfig, setCleanupConfig] = useState({
    company_id: empresaId,
    keep_third_parties: true,
    keep_products: false,
  })

  const [generateConfig, setGenerateConfig] = useState({
    company_id: empresaId,
    period: new Date().toISOString().slice(0, 7),
    num_asientos: 10,
    num_compras: 5,
    num_ventas: 5,
  })

  useEffect(() => {
    setCleanupConfig(c => ({ ...c, company_id: empresaId }))
    setGenerateConfig(c => ({ ...c, company_id: empresaId }))
  }, [empresaId])

  useEffect(() => {
    loadCompanies()
    loadDumps()
  }, [])

  useEffect(() => {
    if (generateConfig.company_id) {
      loadPeriods(generateConfig.company_id)
    }
  }, [generateConfig.company_id])

  async function loadDumps() {
    try {
      const data = await listDbDumps()
      setDumps(data.dumps || [])
    } catch {
      setDumps([])
    }
  }

  async function loadCompanies() {
    try {
      const data = await listCompanies()
      const items = Array.isArray(data) ? data : (data.items || [])
      setCompanies(items)
      if (items.length > 0 && !cleanupConfig.company_id) {
        setCleanupConfig(c => ({ ...c, company_id: items[0].id }))
        setGenerateConfig(g => ({ ...g, company_id: items[0].id }))
      }
    } catch (err: any) {
      showMessage('error', 'Error', `Error al cargar empresas: ${err.message || err}`)
      setCompanies([])
    }
  }

  async function loadPeriods(companyId: number) {
    try {
      const data = await listPeriods(companyId)
      setPeriods(data)
      if (data.length > 0 && !generateConfig.period) {
        const latest = data.sort((a: any, b: any) => {
          if (a.year !== b.year) return b.year - a.year
          return b.month - a.month
        })[0]
        setGenerateConfig(c => ({ ...c, period: `${latest.year}-${String(latest.month).padStart(2, '0')}` }))
      }
    } catch (err: any) {
      console.error('Error cargando períodos:', err)
    }
  }

  function showMessage(type: MessageType, title: string, content: string) {
    setMessage({ type, title, content })
  }

  async function handleCleanup() {
    setConfirmCleanup(false)
    setLoading(true)
    setMessage(null)
    try {
      const result = await cleanupAccountingData(
        cleanupConfig.company_id || empresaId,
        true,
        cleanupConfig.keep_third_parties,
        cleanupConfig.keep_products
      )
      const deleted = result.deleted
      const total = deleted.journal_entries + deleted.purchases + deleted.sales + deleted.inventory_movements
      showMessage('success', 'Datos Limpiados',
        `Se eliminaron exitosamente:\n` +
        `- ${deleted.journal_entries} asientos contables\n` +
        `- ${deleted.purchases} compras\n` +
        `- ${deleted.sales} ventas\n` +
        `- ${deleted.inventory_movements} movimientos de inventario\n` +
        `- ${deleted.bank_accounts} cuentas bancarias\n\nTotal: ${total} registros eliminados.`)
    } catch (err: any) {
      showMessage('error', 'Error al Limpiar', `Error: ${err.message || err}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleInitDatabase() {
    setConfirmInit(false)
    setLoading(true)
    setMessage(null)
    try {
      const result = await initDatabase()
      showMessage('success', 'Base de Datos Inicializada', `${result.message}\n\n${result.hint}`)
      if (typeof window !== 'undefined') {
        window.setTimeout(() => window.location.reload(), 2000)
      }
    } catch (err: any) {
      showMessage('error', 'Error al Inicializar', err.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleResetForFirstTime() {
    setConfirmResetFirstTime(false)
    setLoading(true)
    setMessage(null)
    try {
      const result = await resetForFirstTime()
      showMessage('success', 'Reset Iniciado', `${result.message}\n\n${result.hint}`)
      if (typeof window !== 'undefined') {
        removeToken()
        window.setTimeout(() => window.location.href = '/login', 15000)
      }
    } catch (err: any) {
      showMessage('error', 'Error al Resetear', err.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleRestore(filename: string) {
    setConfirmRestore(null)
    setLoading(true)
    setMessage(null)
    try {
      const result = await restoreDatabase(filename)
      showMessage('success', 'Base de Datos Restaurada', result.message)
      await loadDumps()
      if (typeof window !== 'undefined') {
        window.setTimeout(() => window.location.reload(), 2000)
      }
    } catch (err: any) {
      showMessage('error', 'Error al Restaurar', err.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerate() {
    if (!generateConfig.company_id || !generateConfig.period) {
      showMessage('error', 'Validación', 'Debes seleccionar una empresa y un período.')
      return
    }
    setLoading(true)
    setMessage(null)
    try {
      const result = await generateTestData(
        generateConfig.company_id,
        generateConfig.period,
        generateConfig.num_asientos,
        generateConfig.num_compras,
        generateConfig.num_ventas
      )
      showMessage('success', 'Datos Generados',
        `Se generaron exitosamente:\n` +
        `- ${result.generated.journal_entries} asientos contables\n` +
        `- ${result.generated.purchases} compras\n` +
        `- ${result.generated.sales} ventas\n` +
        `- ${result.generated.third_parties} terceros\n` +
        `- ${result.generated.products} productos\n\n` +
        `Empresa: ${companies.find(c => c.id === generateConfig.company_id)?.name || 'N/A'}\n` +
        `Período: ${generateConfig.period}`)
    } catch (err: any) {
      showMessage('error', 'Error al Generar', `Error: ${err.message || err}`)
    } finally {
      setLoading(false)
    }
  }

  if (user?.role !== 'ADMINISTRADOR') {
    return (
      <div className="space-y-6 animate-fade-in">
        <Card>
          <div className="p-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Acceso Restringido</h2>
            <p className="text-gray-600 dark:text-gray-400">Solo los administradores pueden acceder a esta sección.</p>
          </div>
        </Card>
      </div>
    )
  }

  const selectedCompany = companies.find(c => c.id === (activeTab === 'empresa' ? cleanupConfig.company_id : generateConfig.company_id))

  return (
    <div className="space-y-6 animate-fade-in">
      <Breadcrumbs />
      <PageHeader
        title="Mantenimiento de Datos"
        subtitle="Operaciones sobre datos por empresa y administración de la base de datos"
        icon={Database}
        iconColor="primary"
      />

      {/* Tabs SAP-style: Datos por Empresa | Sistema y Base de Datos */}
      <div className="border-b-2 border-gray-200 dark:border-gray-700">
        <div className="flex gap-1">
          <TabsTriggerWithValue
            value="empresa"
            activeValue={activeTab}
            onValueChange={(v) => setActiveTab(v as TabId)}
            className="flex items-center gap-2 px-4 py-3 rounded-t-lg border border-b-0 border-gray-200 dark:border-gray-700"
          >
            <Building2 className="w-4 h-4" />
            Datos por Empresa
          </TabsTriggerWithValue>
          <TabsTriggerWithValue
            value="sistema"
            activeValue={activeTab}
            onValueChange={(v) => setActiveTab(v as TabId)}
            className="flex items-center gap-2 px-4 py-3 rounded-t-lg border border-b-0 border-gray-200 dark:border-gray-700"
          >
            <ShieldAlert className="w-4 h-4" />
            Sistema y Base de Datos
          </TabsTriggerWithValue>
        </div>
      </div>

      {/* Tab: Datos por Empresa */}
      <TabsContentWithValue value="empresa" activeValue={activeTab} className="space-y-6">
        {selectedCompany && (
          <div className="flex items-center gap-2 px-4 py-2 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-200 dark:border-primary-800">
            <Building2 className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            <span className="text-sm font-medium text-primary-900 dark:text-primary-100">
              Contexto: {selectedCompany.name}
              {selectedCompany.ruc && <span className="text-primary-600 dark:text-primary-300 ml-2">(RUC: {selectedCompany.ruc})</span>}
            </span>
          </div>
        )}

        {/* Limpiar Datos */}
        <Card>
          <CardHeader
            title="Limpiar Datos Contables"
            icon={<Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />}
          />
          <div className="p-6 space-y-4">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-amber-900 dark:text-amber-100">
                  <strong>Advertencia:</strong> Elimina asientos, compras, ventas, movimientos de inventario y conciliaciones bancarias de la empresa seleccionada. Esta acción no se puede deshacer.
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Empresa</label>
                <select
                  value={cleanupConfig.company_id || empresaId}
                  onChange={e => setCleanupConfig(c => ({ ...c, company_id: Number(e.target.value) }))}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-800"
                >
                  {companies.length > 0 ? companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name} (ID: {c.id})</option>
                  )) : <option value="">Cargando empresas...</option>}
                </select>
              </div>
              <div className="space-y-2 pt-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={cleanupConfig.keep_third_parties} onChange={e => setCleanupConfig(c => ({ ...c, keep_third_parties: e.target.checked }))} className="w-4 h-4 rounded" />
                  <span className="text-sm">Mantener terceros</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={cleanupConfig.keep_products} onChange={e => setCleanupConfig(c => ({ ...c, keep_products: e.target.checked }))} className="w-4 h-4 rounded" />
                  <span className="text-sm">Mantener productos</span>
                </label>
              </div>
            </div>
            <Button onClick={() => setConfirmCleanup(true)} disabled={loading} variant="danger">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Limpiar Datos de la Empresa
            </Button>
          </div>
        </Card>

        {/* Generar Datos de Prueba */}
        <Card>
          <CardHeader
            title="Generar Datos de Prueba"
            icon={<FolderCog className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
          />
          <div className="p-6 space-y-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <Database className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-900 dark:text-blue-100">
                  Genera datos de prueba realistas siguiendo el PCGE peruano (asientos, compras, ventas, terceros, productos). Asegúrate de que la empresa tenga cuentas contables básicas.
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Empresa</label>
                <select
                  value={generateConfig.company_id}
                  onChange={e => {
                    const id = Number(e.target.value)
                    setGenerateConfig(c => ({ ...c, company_id: id }))
                    loadPeriods(id)
                  }}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-800"
                >
                  {companies.length > 0 ? companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  )) : <option value="">Cargando...</option>}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Período (YYYY-MM)</label>
                <input type="month" value={generateConfig.period} onChange={e => setGenerateConfig(c => ({ ...c, period: e.target.value }))} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-800" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Asientos</label>
                <input type="number" min={1} max={100} value={generateConfig.num_asientos} onChange={e => setGenerateConfig(c => ({ ...c, num_asientos: Math.max(1, Math.min(100, Number(e.target.value))) }))} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-800" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Compras / Ventas</label>
                <div className="flex gap-2">
                  <input type="number" min={0} max={50} value={generateConfig.num_compras} onChange={e => setGenerateConfig(c => ({ ...c, num_compras: Math.max(0, Math.min(50, Number(e.target.value))) }))} placeholder="Compras" className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800" />
                  <input type="number" min={0} max={50} value={generateConfig.num_ventas} onChange={e => setGenerateConfig(c => ({ ...c, num_ventas: Math.max(0, Math.min(50, Number(e.target.value))) }))} placeholder="Ventas" className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800" />
                </div>
              </div>
            </div>
            <Button onClick={handleGenerate} disabled={loading || !generateConfig.company_id || !generateConfig.period}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
              Generar Datos de Prueba
            </Button>
          </div>
        </Card>
      </TabsContentWithValue>

      {/* Tab: Sistema y Base de Datos */}
      <TabsContentWithValue value="sistema" activeValue={activeTab} className="space-y-6">
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400" />
          <span className="text-sm font-medium text-red-900 dark:text-red-100">
            Zona de riesgo: operaciones que afectan toda la base de datos del sistema
          </span>
        </div>

        {/* Reset para Primera Vez */}
        <Card className="border-2 border-red-200 dark:border-red-800">
          <CardHeader title="Resetear para Configuración Inicial" icon={<RotateCcw className="w-5 h-5 text-red-600 dark:text-red-400" />} />
          <div className="p-6 space-y-4">
            <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-red-900 dark:text-red-100">
                  <strong>Advertencia crítica:</strong> Elimina TODOS los datos y tablas. La base quedará vacía. Al recargar verás el wizard de configuración inicial. Usar solo para empezar desde cero.
                </div>
              </div>
            </div>
            <Button onClick={() => setConfirmResetFirstTime(true)} disabled={loading} className="bg-red-600 hover:bg-red-700 text-white w-full">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              Resetear para Configuración Inicial
            </Button>
          </div>
        </Card>

        {/* Inicializar BD */}
        <Card>
          <CardHeader title="Inicializar Base de Datos" icon={<Database className="w-5 h-5 text-primary-600 dark:text-primary-400" />} />
          <div className="p-6 space-y-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <HardDrive className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-900 dark:text-blue-100">
                  Crea la base de datos completa desde los modelos (tablas, secuencias, FKs). Elimina todo lo existente. Ideal para esquema actualizado o instalación nueva.
                </div>
              </div>
            </div>
            <Button onClick={() => setConfirmInit(true)} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
              Inicializar Base de Datos
            </Button>
          </div>
        </Card>

        {/* Restaurar desde Dump */}
        <Card>
          <CardHeader title="Restaurar desde Dump SQL" icon={<DatabaseBackup className="w-5 h-5 text-gray-600 dark:text-gray-400" />} />
          <div className="p-6 space-y-4">
            <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <Archive className="w-5 h-5 text-gray-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  Restaurar desde un archivo .sql en db/. Solo PostgreSQL. Requiere psql.
                </div>
              </div>
            </div>
            {dumps.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">No hay dumps .sql en db/</p>
            ) : (
              <div className="space-y-2">
                {dumps.map(d => (
                  <div key={d.filename} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <span className="font-mono text-sm">{d.filename}</span>
                    <Button size="sm" variant="outline" onClick={() => setConfirmRestore(d.filename)} disabled={loading}>Restaurar</Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </TabsContentWithValue>

      {/* Modales */}
      <MessageModal isOpen={confirmCleanup} onClose={() => setConfirmCleanup(false)} type="warning" title="Confirmar limpieza" message={`Eliminar todos los datos contables y operaciones de la empresa seleccionada. Esto incluye asientos, compras, ventas, movimientos de inventario y conciliaciones. Esta acción NO se puede deshacer. ¿Continuar?`} confirmText="Sí, Limpiar" cancelText="Cancelar" showCancel onConfirm={handleCleanup} />
      <MessageModal isOpen={!!message} onClose={() => setMessage(null)} type={message?.type || 'info'} title={message?.title || ''} message={message?.content || ''} />
      <MessageModal isOpen={confirmInit} onClose={() => setConfirmInit(false)} type="warning" title="Inicializar Base de Datos" message="Eliminará todas las tablas y datos existentes, y creará desde cero el esquema. Se creará el usuario administrador. ¿Continuar?" confirmText="Sí, Inicializar" cancelText="Cancelar" showCancel onConfirm={handleInitDatabase} />
      <MessageModal isOpen={confirmResetFirstTime} onClose={() => setConfirmResetFirstTime(false)} type="warning" title="Reset para Configuración Inicial" message="Elimina absolutamente TODO. No se creará usuario admin. Verás el wizard de configuración inicial. Serás desconectado. ¿Estás seguro?" confirmText="Sí, Resetear" cancelText="Cancelar" showCancel onConfirm={handleResetForFirstTime} />
      <MessageModal isOpen={!!confirmRestore} onClose={() => setConfirmRestore(null)} type="warning" title="Restaurar desde Dump" message={confirmRestore ? `Reemplazará todos los datos con:\n\n${confirmRestore}\n\n¿Continuar?` : ''} confirmText="Sí, Restaurar" cancelText="Cancelar" showCancel onConfirm={() => confirmRestore && handleRestore(confirmRestore)} />
    </div>
  )
}
