import React, { useState } from 'react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { MessageModal, type MessageType } from '@/components/ui/MessageModal'
import { AlertTriangle, AlertCircle, Trash2, Database, Loader2, Archive, HardDrive, DatabaseBackup, RotateCcw } from 'lucide-react'
import { cleanupAccountingData, generateTestData, listCompanies, listPeriods, initDatabase, resetForFirstTime, listDbDumps, restoreDatabase, removeToken } from '@/api'
import { useOrg } from '@/stores/org'
import { useAuth } from '@/stores/auth'
import type { Company } from '@/api'

export default function SetupDatos() {
  const { empresaId } = useOrg()
  const { user } = useAuth()
  const [companies, setCompanies] = useState<Company[]>([])
  const [periods, setPeriods] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: MessageType; title: string; content: string } | null>(null)
  const [confirmCleanup, setConfirmCleanup] = useState(false)
  const [dumps, setDumps] = useState<{ filename: string; size_mb: number; modified: string }[]>([])
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null)
  const [confirmInit, setConfirmInit] = useState(false)
  const [confirmResetFirstTime, setConfirmResetFirstTime] = useState(false)
  
  // Configuración de limpieza
  const [cleanupConfig, setCleanupConfig] = useState({
    company_id: empresaId,
    keep_third_parties: true,
    keep_products: false,
  })
  
  // Configuración de generación
  const [generateConfig, setGenerateConfig] = useState({
    company_id: empresaId,
    period: new Date().toISOString().slice(0, 7), // YYYY-MM
    num_asientos: 10,
    num_compras: 5,
    num_ventas: 5,
  })
  
  React.useEffect(() => {
    loadCompanies()
    if (generateConfig.company_id) {
      loadPeriods(generateConfig.company_id)
    }
    loadDumps()
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
      // listCompanies devuelve { items: Company[], total: number }
      setCompanies(Array.isArray(data) ? data : (data.items || []))
    } catch (err: any) {
      showMessage('error', 'Error', `Error al cargar empresas: ${err.message || err}`)
      setCompanies([]) // Asegurar que companies sea un array vacío en caso de error
    }
  }
  
  async function loadPeriods(companyId: number) {
    try {
      const data = await listPeriods(companyId)
      setPeriods(data)
      if (data.length > 0 && !generateConfig.period) {
        // Seleccionar el período más reciente
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
  
  function openCleanupConfirm() {
    setConfirmCleanup(true)
  }
  
  async function handleCleanup() {
    setConfirmCleanup(false)
    setLoading(true)
    setMessage(null)
    try {
      const result = await cleanupAccountingData(
        cleanupConfig.company_id || empresaId,
        true, // keep_companies
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
        `- ${deleted.bank_accounts} cuentas bancarias\n` +
        `\nTotal: ${total} registros eliminados.`)
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
      // Cerrar sesión y redirigir tras 15 s (el reset corre en background)
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
      // Sugerir recargar la página
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
        `- ${result.generated.third_parties} terceros (proveedores/clientes)\n` +
        `- ${result.generated.products} productos\n` +
        `\nEmpresa: ${companies.find(c => c.id === generateConfig.company_id)?.name || 'N/A'}\n` +
        `Período: ${generateConfig.period}`)
    } catch (err: any) {
      showMessage('error', 'Error al Generar', `Error: ${err.message || err}`)
    } finally {
      setLoading(false)
    }
  }
  
  // Solo administradores pueden ver esta página
  if (user?.role !== 'ADMINISTRADOR') {
    return (
      <div className="space-y-6 animate-fade-in">
        <Card>
          <div className="p-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Acceso Restringido</h2>
            <p className="text-gray-600">Solo los administradores pueden acceder a esta sección.</p>
          </div>
        </Card>
      </div>
    )
  }
  
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumbs */}
      <Breadcrumbs />

      {/* Page Header */}
      <PageHeader
        title="Configuración de Datos"
        subtitle="Limpia y genera datos de prueba para testing y validación"
        icon={Database}
        iconColor="primary"
      />
      
      {/* Modal de Confirmación para Limpiar Datos */}
      <MessageModal
        isOpen={confirmCleanup}
        onClose={() => setConfirmCleanup(false)}
        type="warning"
        title="⚠️ Confirmar Limpieza de Datos"
        message={`Esta acción eliminará TODOS los datos contables y operaciones de la empresa seleccionada.\n\nEsto incluye:\n- Asientos contables\n- Compras y ventas\n- Movimientos de inventario\n- Conciliaciones bancarias\n\nEsta acción NO se puede deshacer.\n\n¿Estás seguro de continuar?`}
        confirmText="Sí, Limpiar Todo"
        cancelText="Cancelar"
        showCancel={true}
        onConfirm={handleCleanup}
      />

      {/* Modal de Mensaje - Componente Reutilizable */}
      <MessageModal
        isOpen={!!message}
        onClose={() => setMessage(null)}
        type={message?.type || 'info'}
        title={message?.title || ''}
        message={message?.content || ''}
      />

      {/* Modal Confirmar Inicializar BD */}
      <MessageModal
        isOpen={confirmInit}
        onClose={() => setConfirmInit(false)}
        type="warning"
        title="⚠️ Inicializar Base de Datos desde Modelos"
        message="Esta acción eliminará TODAS las tablas y datos existentes, y creará desde cero el esquema completo (tablas, secuencias, FKs) según los modelos del sistema.\n\nSe creará el usuario administrador.\n\n¿Continuar?"
        confirmText="Sí, Inicializar"
        cancelText="Cancelar"
        showCancel={true}
        onConfirm={handleInitDatabase}
      />

      {/* Modal Confirmar Reset para Primera Vez */}
      <MessageModal
        isOpen={confirmResetFirstTime}
        onClose={() => setConfirmResetFirstTime(false)}
        type="warning"
        title="⚠️ Reseteo para Configuración Inicial"
        message="Esta acción es IRREVERSIBLE y eliminará absolutamente TODO:\n\n• Todas las tablas y datos (empresas, usuarios, asientos, compras, ventas, inventarios, etc.)\n• No se creará ningún usuario administrador\n• Al recargar la página verás el wizard de configuración inicial como si fuera la primera instalación\n• Deberás completar el wizard para crear la base de datos y el usuario admin\n\nSerás desconectado y redirigido al login.\n\n¿Estás seguro de continuar?"
        confirmText="Sí, Resetear Todo"
        cancelText="Cancelar"
        showCancel={true}
        onConfirm={handleResetForFirstTime}
      />

      {/* Modal Confirmar Restaurar BD */}
      <MessageModal
        isOpen={!!confirmRestore}
        onClose={() => setConfirmRestore(null)}
        type="warning"
        title="⚠️ Restaurar desde Dump SQL"
        message={confirmRestore ? `Reemplazará todos los datos con:\n\n${confirmRestore}\n\n¿Continuar?` : ''}
        confirmText="Sí, Restaurar"
        cancelText="Cancelar"
        showCancel={true}
        onConfirm={() => confirmRestore && handleRestore(confirmRestore)}
      />
      
      {/* Resetear para Configuración Inicial */}
      <Card className="border-2 border-red-200 dark:border-red-700 rounded-xl">
        <CardHeader
          title="Resetear para Configuración Inicial"
          icon={<RotateCcw className="w-5 h-5 text-red-600 dark:text-red-400" />}
        />
        <div className="p-6 space-y-4">
          <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-red-900 dark:text-red-100">
                <strong>⚠️ ADVERTENCIA CRÍTICA:</strong> Esta opción elimina TODOS los datos y tablas del sistema.
                La base de datos quedará vacía como si fuera una instalación nueva. Al recargar la página verás el
                wizard de configuración inicial en lugar del login. Usa esta opción solo cuando necesites empezar
                completamente desde cero.
              </div>
            </div>
          </div>
          <Button
            onClick={() => setConfirmResetFirstTime(true)}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700 text-white w-full border-2 border-red-500"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <RotateCcw className="w-4 h-4" />
                Resetear para Configuración Inicial
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Inicializar Base de Datos desde Modelos */}
      <Card>
        <CardHeader 
          title="Inicializar Base de Datos desde Modelos"
          icon={<Database className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
        />
        <div className="p-6 space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <HardDrive className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-900 dark:text-blue-100">
                <strong>Uso:</strong> Crea la base de datos completa desde los modelos del sistema (tablas, secuencias, índices, FKs). 
                Elimina todo lo existente y crea el esquema actualizado. Ideal para empezar como sistema nuevo o cuando la BD está desactualizada.
              </div>
            </div>
          </div>
          
          <Button
            onClick={() => setConfirmInit(true)}
            disabled={loading}
            className="bg-primary-600 hover:bg-primary-700 text-white w-full"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <Database className="w-4 h-4" />
                Inicializar Base de Datos
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Restaurar desde Dump SQL (opcional) */}
      <Card>
        <CardHeader 
          title="Restaurar desde Dump SQL"
          icon={<DatabaseBackup className="w-5 h-5 text-gray-600 dark:text-gray-400" />}
        />
        <div className="p-6 space-y-4">
          <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <Archive className="w-5 h-5 text-gray-500 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-gray-700 dark:text-gray-300">
                Opción alternativa: restaurar desde un archivo .sql en db/. Solo PostgreSQL. Requiere psql.
              </div>
            </div>
          </div>
          
          {dumps.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">No hay dumps .sql en db/</p>
          ) : (
            <div className="space-y-2">
              {dumps.map((d) => (
                <div key={d.filename} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <span className="font-mono text-sm">{d.filename}</span>
                  <Button size="sm" onClick={() => setConfirmRestore(d.filename)} disabled={loading}>Restaurar</Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
      
      {/* Limpiar Datos */}
      <Card>
        <CardHeader 
          title="Limpiar Datos Contables y Operaciones"
          icon={<Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />}
        />
        <div className="p-6 space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-yellow-900">
                <strong>Advertencia:</strong> Esta acción eliminará permanentemente todos los asientos contables, compras, ventas, movimientos de inventario y conciliaciones bancarias de la empresa seleccionada. Esta acción NO se puede deshacer.
              </div>
            </div>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">Empresa</label>
              <select
                value={cleanupConfig.company_id || empresaId}
                onChange={e => setCleanupConfig(c => ({ ...c, company_id: Number(e.target.value) }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                {companies && Array.isArray(companies) && companies.length > 0 ? (
                  companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name} (ID: {c.id})</option>
                  ))
                ) : (
                  <option value="">Cargando empresas...</option>
                )}
              </select>
            </div>
            
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cleanupConfig.keep_third_parties}
                  onChange={e => setCleanupConfig(c => ({ ...c, keep_third_parties: e.target.checked }))}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm text-gray-700">Mantener terceros (proveedores/clientes)</span>
              </label>
              
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cleanupConfig.keep_products}
                  onChange={e => setCleanupConfig(c => ({ ...c, keep_products: e.target.checked }))}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm text-gray-700">Mantener productos</span>
              </label>
            </div>
            
            <Button
              onClick={openCleanupConfirm}
              disabled={loading}
              className="bg-red-600 hover:bg-red-700 text-white w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Limpiando...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  Limpiar Todos los Datos
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>
      
      {/* Generar Datos de Prueba */}
      <Card>
        <CardHeader 
          title="Generar Datos de Prueba"
          icon={<Database className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
        />
        <div className="p-6 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <Database className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-900">
                <strong>Información:</strong> Esta función generará datos de prueba realistas siguiendo el PCGE peruano. Se crearán asientos contables, compras con IGV, ventas con IGV, y terceros de prueba. Asegúrate de que la empresa tenga cuentas contables básicas.
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">Empresa</label>
              <select
                value={generateConfig.company_id}
                onChange={e => {
                  const newCompanyId = Number(e.target.value)
                  setGenerateConfig(c => ({ ...c, company_id: newCompanyId }))
                  loadPeriods(newCompanyId)
                }}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                {companies && Array.isArray(companies) && companies.length > 0 ? (
                  companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name} (ID: {c.id})</option>
                  ))
                ) : (
                  <option value="">Cargando empresas...</option>
                )}
              </select>
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Período (YYYY-MM)</label>
              <input
                type="month"
                value={generateConfig.period}
                onChange={e => setGenerateConfig(c => ({ ...c, period: e.target.value }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Número de Asientos</label>
              <input
                type="number"
                min="1"
                max="100"
                value={generateConfig.num_asientos}
                onChange={e => setGenerateConfig(c => ({ ...c, num_asientos: Math.max(1, Math.min(100, Number(e.target.value))) }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Número de Compras</label>
              <input
                type="number"
                min="0"
                max="50"
                value={generateConfig.num_compras}
                onChange={e => setGenerateConfig(c => ({ ...c, num_compras: Math.max(0, Math.min(50, Number(e.target.value))) }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Número de Ventas</label>
              <input
                type="number"
                min="0"
                max="50"
                value={generateConfig.num_ventas}
                onChange={e => setGenerateConfig(c => ({ ...c, num_ventas: Math.max(0, Math.min(50, Number(e.target.value))) }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>
          
          <Button
            onClick={handleGenerate}
            disabled={loading || !generateConfig.company_id || !generateConfig.period}
            className="bg-primary-600 hover:bg-primary-700 text-white w-full"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <Database className="w-4 h-4" />
                Generar Datos de Prueba
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  )
}

