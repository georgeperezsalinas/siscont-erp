import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { ActionBar } from '@/components/ui/ActionBar'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { TabsTriggerWithValue, TabsContentWithValue } from '@/components/ui/Tabs'
import { formatCurrency, formatDate, exportToExcel } from '@/lib/utils'
import { 
  Download, FileText, BarChart3, TrendingUp, Calendar, Filter, FileSpreadsheet, 
  Loader2, AlertCircle, CheckCircle, BookOpen, Search, Shield, Eye, 
  Package, Users, FileCheck, Activity, Database
} from 'lucide-react'
import { useOrg } from '@/stores/org'
import { MessageModal } from '@/components/ui/MessageModal'
import { 
  getLibroDiario, getLibroMayor, getBalanceComprobacion,
  getEstadoResultados, getBalanceGeneral,
  getAsientosDescuadrados, getMovimientosSinAsiento,
  getKardexValorizado, getSaldosPorCliente, getSaldosPorProveedor,
  getTrazabilidadTotal, getReporteCambiosReversiones,
  listPeriods, listProducts, listAlmacenes, listCompanies,
  type LibroDiarioRow, type LibroMayorRow,
  type BalanceComprobacionResponse, type EstadoResultadosResponse,
  type BalanceGeneralResponse, type AsientosDescuadradosResponse,
  type MovimientosSinAsientoResponse,
  type KardexValorizadoResponse, type SaldosPorClienteResponse,
  type SaldosPorProveedorResponse, type TrazabilidadTotalResponse,
  type CambiosReversionesResponse
} from '@/api'

// Etiquetas SAP-style para cada tipo de reporte
const REPORT_TYPE_LABELS: Record<string, string> = {
  'libro-diario': 'Libro Diario',
  'libro-mayor': 'Libro Mayor',
  'balance-comprobacion': 'Balance de Comprobación',
  'estado-resultados': 'Estado de Resultados',
  'balance-general': 'Balance General',
  'kardex-valorizado': 'Kardex Valorizado',
  'saldos-por-cliente': 'Cuentas por Cobrar (CxC)',
  'saldos-por-proveedor': 'Cuentas por Pagar (CxP)',
  'asientos-descuadrados': 'Asientos Descuadrados',
  'movimientos-sin-asiento': 'Movimientos sin Asiento',
  'trazabilidad-total': 'Trazabilidad',
  'cambios-reversiones': 'Cambios y Reversiones',
}

// Nombres de categorías (pestañas)
const TAB_LABELS: Record<string, string> = {
  nivel1: 'Libros',
  nivel2: 'EE FF',
  nivel3: 'Operativos',
  nivel4: 'Control y Cuadratura',
  nivel5: 'Auditoría y Trazabilidad',
}

export default function Reportes() {
  const { empresaId, periodo } = useOrg()
  const [searchParams, setSearchParams] = useSearchParams()
  const tipoFromUrl = searchParams.get('tipo')
  
  // Mapeo de tipos de reporte a pestañas
  const tipoToTab: Record<string, string> = {
    'libro-diario': 'nivel1',
    'libro-mayor': 'nivel1',
    'balance-comprobacion': 'nivel1',
    'estado-resultados': 'nivel2',
    'balance-general': 'nivel2',
    'kardex-valorizado': 'nivel3',
    'saldos-por-cliente': 'nivel3',
    'saldos-por-proveedor': 'nivel3',
    'asientos-descuadrados': 'nivel4',
    'movimientos-sin-asiento': 'nivel4',
    'trazabilidad-total': 'nivel5',
    'cambios-reversiones': 'nivel5'
  }
  
  // Determinar pestaña y tipo de reporte inicial desde URL
  const initialTab = tipoFromUrl && tipoToTab[tipoFromUrl] ? tipoToTab[tipoFromUrl] : 'nivel1'
  const initialReportType = tipoFromUrl || 'libro-diario'
  
  const [activeTab, setActiveTab] = useState(initialTab)
  const [reportType, setReportType] = useState(initialReportType)
  const [period, setPeriod] = useState(periodo)
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [accountId, setAccountId] = useState<number | undefined>()
  const [origin, setOrigin] = useState('')
  const [loading, setLoading] = useState(false)
  const [periods, setPeriods] = useState<any[]>([])
  
  // Estados para datos de reportes
  const [libroDiario, setLibroDiario] = useState<LibroDiarioRow[]>([])
  const [libroMayor, setLibroMayor] = useState<LibroMayorRow[]>([])
  const [balanceComprobacion, setBalanceComprobacion] = useState<BalanceComprobacionResponse | null>(null)
  const [estadoResultados, setEstadoResultados] = useState<EstadoResultadosResponse | null>(null)
  const [balanceGeneral, setBalanceGeneral] = useState<BalanceGeneralResponse | null>(null)
  const [asientosDescuadrados, setAsientosDescuadrados] = useState<AsientosDescuadradosResponse | null>(null)
  const [movimientosSinAsiento, setMovimientosSinAsiento] = useState<MovimientosSinAsientoResponse | null>(null)
  
  // Estados para reportes Nivel 3
  const [kardexValorizado, setKardexValorizado] = useState<KardexValorizadoResponse | null>(null)
  const [saldosPorCliente, setSaldosPorCliente] = useState<SaldosPorClienteResponse | null>(null)
  const [saldosPorProveedor, setSaldosPorProveedor] = useState<SaldosPorProveedorResponse | null>(null)
  
  // Estados para reportes Nivel 5
  const [trazabilidadTotal, setTrazabilidadTotal] = useState<TrazabilidadTotalResponse | null>(null)
  const [cambiosReversiones, setCambiosReversiones] = useState<CambiosReversionesResponse | null>(null)
  
  // Estados para filtros adicionales
  const [productId, setProductId] = useState<number | undefined>()
  const [almacenId, setAlmacenId] = useState<number | undefined>()
  const [customerId, setCustomerId] = useState<number | undefined>()
  const [supplierId, setSupplierId] = useState<number | undefined>()
  const [asientoId, setAsientoId] = useState<number | undefined>()
  const [fechaCorte, setFechaCorte] = useState('')
  
  // Estados para listas de filtros
  const [products, setProducts] = useState<any[]>([])
  const [almacenes, setAlmacenes] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  
  const [messageModal, setMessageModal] = useState<{ type: 'success' | 'error'; title: string; message: string } | null>(null)
  const [companyName, setCompanyName] = useState<string>('')

  // Obtener el periodo actual seleccionado en el topbar
  const currentPeriod = useMemo(() => {
    if (!periodo || periods.length === 0) return null
    const [year, month] = periodo.split('-').map(Number)
    return periods.find((p: any) => p.year === year && p.month === month) || null
  }, [periodo, periods])

  function showMessage(type: 'success' | 'error', title: string, message: string) {
    setMessageModal({ type, title, message })
  }

  async function loadPeriods() {
    try {
      const data = await listPeriods(empresaId)
      setPeriods(data)
    } catch (err: any) {
      console.error('Error cargando periodos:', err)
    }
  }

  // Cargar reporte según tipo
  const loadReport = async () => {
    if (!empresaId) return
    
    setLoading(true)
    try {
      // Obtener period_id del período seleccionado
      const periodId = currentPeriod?.id || undefined
      
      switch (reportType) {
        case 'libro-diario':
          const diario = await getLibroDiario({
            company_id: empresaId,
            period_id: periodId,
            account_id: accountId,
            origin: origin || undefined,
            fecha_desde: fechaDesde || undefined,
            fecha_hasta: fechaHasta || undefined
          })
          setLibroDiario(diario.datos || [])
          break
        
        case 'libro-mayor':
          const mayor = await getLibroMayor({
            company_id: empresaId,
            account_id: accountId,
            period_id: periodId,
            fecha_desde: fechaDesde || undefined,
            fecha_hasta: fechaHasta || undefined
          })
          setLibroMayor(mayor.datos || [])
          break
        
        case 'balance-comprobacion':
          const balance = await getBalanceComprobacion({
            company_id: empresaId,
            period_id: periodId,
            fecha_desde: fechaDesde || undefined,
            fecha_hasta: fechaHasta || undefined
          })
          setBalanceComprobacion(balance)
          break
        
        case 'estado-resultados':
          const resultados = await getEstadoResultados({
            company_id: empresaId,
            period_id: periodId,
            fecha_desde: fechaDesde || undefined,
            fecha_hasta: fechaHasta || undefined
          })
          setEstadoResultados(resultados)
          break
        
        case 'balance-general':
          const balanceGen = await getBalanceGeneral({
            company_id: empresaId,
            period_id: periodId,
            fecha_desde: fechaDesde || undefined,
            fecha_hasta: fechaHasta || undefined
          })
          setBalanceGeneral(balanceGen)
          break
        
        case 'asientos-descuadrados':
          const descuadrados = await getAsientosDescuadrados({
            company_id: empresaId,
            period_id: periodId
          })
          setAsientosDescuadrados(descuadrados)
          break
        
        case 'movimientos-sin-asiento':
          const sinAsiento = await getMovimientosSinAsiento({
            company_id: empresaId
          })
          setMovimientosSinAsiento(sinAsiento)
          break
        
        // Nivel 3: Reportes Operativos
        case 'kardex-valorizado':
          const kardex = await getKardexValorizado({
            company_id: empresaId,
            product_id: productId,
            almacen_id: almacenId,
            fecha_desde: fechaDesde || undefined,
            fecha_hasta: fechaHasta || undefined
          })
          setKardexValorizado(kardex)
          break
        
        case 'saldos-por-cliente':
          const cxc = await getSaldosPorCliente({
            company_id: empresaId,
            customer_id: customerId,
            fecha_corte: fechaCorte || undefined
          })
          setSaldosPorCliente(cxc)
          break
        
        case 'saldos-por-proveedor':
          const cxp = await getSaldosPorProveedor({
            company_id: empresaId,
            supplier_id: supplierId,
            fecha_corte: fechaCorte || undefined
          })
          setSaldosPorProveedor(cxp)
          break
        
        // Nivel 5: Reportes de Auditoría
        case 'trazabilidad-total':
          if (asientoId) {
            const trazabilidad = await getTrazabilidadTotal({
              company_id: empresaId,
              asiento_id: asientoId
            })
            setTrazabilidadTotal(trazabilidad)
          }
          break
        
        case 'cambios-reversiones':
          const cambios = await getReporteCambiosReversiones({
            company_id: empresaId,
            fecha_desde: fechaDesde || undefined,
            fecha_hasta: fechaHasta || undefined
          })
          setCambiosReversiones(cambios)
          break
      }
    } catch (error: any) {
      console.error('Error cargando reporte:', error)
      showMessage('error', 'Error', `Error al cargar reporte: ${error.message || 'Error desconocido'}`)
    } finally {
      setLoading(false)
    }
  }

  // Cargar listas para filtros
  async function loadFilterLists() {
    if (!empresaId) return
    try {
      const [prods, alms] = await Promise.all([
        listProducts(empresaId).catch(() => []),
        listAlmacenes(empresaId).catch(() => [])
      ])
      setProducts(prods)
      setAlmacenes(alms)
      // Clientes y proveedores se cargarán desde terceros si es necesario
      // Por ahora dejamos las listas vacías
      setCustomers([])
      setSuppliers([])
    } catch (err: any) {
      console.error('Error cargando listas de filtros:', err)
    }
  }

  useEffect(() => {
    if (empresaId) {
      loadPeriods()
      loadFilterLists()
      listCompanies({ page: 1, page_size: 200 }).then(r => {
        const items = 'items' in r ? r.items : []
        const c = items.find((x: { id: number }) => x.id === empresaId)
        setCompanyName(c?.name || '')
      }).catch(() => setCompanyName(''))
    }
  }, [empresaId])

  // Sincronizar período con el topbar al cambiar
  useEffect(() => {
    if (periodo) setPeriod(periodo)
  }, [periodo])

  // Efecto para detectar cambios en la URL
  useEffect(() => {
    if (tipoFromUrl && tipoToTab[tipoFromUrl]) {
      setActiveTab(tipoToTab[tipoFromUrl])
      setReportType(tipoFromUrl)
    }
  }, [tipoFromUrl])

  useEffect(() => {
    if (empresaId && reportType) {
      loadReport()
    }
  }, [empresaId, reportType, currentPeriod?.id])
  
  // Función para cambiar reporte y actualizar URL
  const handleReportTypeChange = (newType: string) => {
    setReportType(newType)
    setSearchParams({ tipo: newType })
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <Breadcrumbs />

      <PageHeader
        title="Reportes Contables y Financieros"
        subtitle="Libros contables, estados financieros, reportes operativos y de auditoría"
        icon={BarChart3}
        iconColor="primary"
        actions={
          <ActionBar onRefresh={loadReport} loading={loading}>
            <Button onClick={loadReport} disabled={loading} variant="outline">
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Cargando...
                </>
              ) : (
                <>
                  <Filter className="w-4 h-4 mr-2" />
                  Aplicar Filtros
                </>
              )}
            </Button>
          </ActionBar>
        }
      />

      {/* Contexto + reporte activo - SAP-style */}
      {/*
      <div className="flex flex-wrap items-center gap-4 px-4 py-2 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-200 dark:border-primary-800">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider">Contexto</span>
          <span className="text-sm font-medium text-primary-900 dark:text-primary-100">
            {companyName || `Empresa #${empresaId}`} • Período {period || periodo || '—'}
          </span>
        </div>
        <div className="h-4 w-px bg-primary-300 dark:bg-primary-700" />
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary-600 dark:text-primary-400 flex-shrink-0" />
          <span className="text-sm font-medium text-primary-900 dark:text-primary-100">
            Reporte activo:
          </span>
          <span className="px-2 py-0.5 rounded bg-primary-600 text-white text-sm font-semibold">
            {REPORT_TYPE_LABELS[reportType] || reportType}
          </span>
          <span className="text-xs text-primary-600 dark:text-primary-400">
            ({TAB_LABELS[activeTab] || activeTab})
          </span>
        </div>
      </div>
      */}

      {/* Filtros */}
      <Card>
      
        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-0.5">
              Período
            </label>
            <input
              type="month"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 h-9 text-sm bg-white dark:bg-gray-700"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-0.5">
              Fecha Desde
            </label>
            <input
              type="date"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 h-9 text-sm bg-white dark:bg-gray-700"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-0.5">
              Fecha Hasta
            </label>
            <input
              type="date"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 h-9 text-sm bg-white dark:bg-gray-700"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-0.5">
              Origen
            </label>
            <select
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 h-9 text-sm bg-white dark:bg-gray-700"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
            >
              <option value="">Todos</option>
              <option value="VENTAS">Ventas</option>
              <option value="COMPRAS">Compras</option>
              <option value="TESORERIA">Tesorería</option>
              <option value="INVENTARIOS">Inventarios</option>
              <option value="MANUAL">Manual</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Tabs por categoría - SAP-style */}
      <Card>
        <div className="border-b-2 border-gray-200 dark:border-gray-700">
          <div className="flex flex-wrap gap-1 p-2">
            <TabsTriggerWithValue
              value="nivel1"
              activeValue={activeTab}
              onValueChange={setActiveTab}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg border-2 border-b-0 transition-all ${
                activeTab === 'nivel1'
                  ? 'bg-primary-50 dark:bg-primary-900/30 border-primary-500 dark:border-primary-600 font-semibold'
                  : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              Libros Contables
              {activeTab === 'nivel1' && (
                <span className="ml-1 px-1.5 py-0.5 rounded bg-primary-600 text-white text-xs font-medium">
                  {REPORT_TYPE_LABELS[reportType]}
                </span>
              )}
            </TabsTriggerWithValue>
            <TabsTriggerWithValue
              value="nivel2"
              activeValue={activeTab}
              onValueChange={setActiveTab}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg border-2 border-b-0 transition-all ${
                activeTab === 'nivel2'
                  ? 'bg-primary-50 dark:bg-primary-900/30 border-primary-500 dark:border-primary-600 font-semibold'
                  : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              EE FF
              {activeTab === 'nivel2' && (
                <span className="ml-1 px-1.5 py-0.5 rounded bg-primary-600 text-white text-xs font-medium">
                  {REPORT_TYPE_LABELS[reportType]}
                </span>
              )}
            </TabsTriggerWithValue>
            <TabsTriggerWithValue
              value="nivel3"
              activeValue={activeTab}
              onValueChange={setActiveTab}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg border-2 border-b-0 transition-all ${
                activeTab === 'nivel3'
                  ? 'bg-primary-50 dark:bg-primary-900/30 border-primary-500 dark:border-primary-600 font-semibold'
                  : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <Package className="w-4 h-4" />
              Operativos
              {activeTab === 'nivel3' && (
                <span className="ml-1 px-1.5 py-0.5 rounded bg-primary-600 text-white text-xs font-medium">
                  {REPORT_TYPE_LABELS[reportType]}
                </span>
              )}
            </TabsTriggerWithValue>
            <TabsTriggerWithValue
              value="nivel4"
              activeValue={activeTab}
              onValueChange={setActiveTab}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg border-2 border-b-0 transition-all ${
                activeTab === 'nivel4'
                  ? 'bg-primary-50 dark:bg-primary-900/30 border-primary-500 dark:border-primary-600 font-semibold'
                  : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <Shield className="w-4 h-4" />
              Control y Cuadratura
              {activeTab === 'nivel4' && (
                <span className="ml-1 px-1.5 py-0.5 rounded bg-primary-600 text-white text-xs font-medium">
                  {REPORT_TYPE_LABELS[reportType]}
                </span>
              )}
            </TabsTriggerWithValue>
            <TabsTriggerWithValue
              value="nivel5"
              activeValue={activeTab}
              onValueChange={setActiveTab}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg border-2 border-b-0 transition-all ${
                activeTab === 'nivel5'
                  ? 'bg-primary-50 dark:bg-primary-900/30 border-primary-500 dark:border-primary-600 font-semibold'
                  : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <Eye className="w-4 h-4" />
              Auditoría y Trazabilidad
              {activeTab === 'nivel5' && (
                <span className="ml-1 px-1.5 py-0.5 rounded bg-primary-600 text-white text-xs font-medium">
                  {REPORT_TYPE_LABELS[reportType]}
                </span>
              )}
            </TabsTriggerWithValue>
          </div>
        </div>

        {/* Libros Contables */}
        <TabsContentWithValue value="nivel1" activeValue={activeTab}>
          <div className="p-4">
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Libros Contables:</strong> Reportes fundamentales que registran todas las operaciones contables. Incluyen el Libro Diario (registro cronológico), Libro Mayor (saldos por cuenta) y Balance de Comprobación (verificación de cuadratura).
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <button
                onClick={() => handleReportTypeChange('libro-diario')}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  reportType === 'libro-diario'
                    ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-primary-300'
                }`}
              >
                <FileText className={`w-6 h-6 mb-2 ${reportType === 'libro-diario' ? 'text-primary-600' : 'text-gray-600'}`} />
                <div className={`font-semibold ${reportType === 'libro-diario' ? 'text-primary-900' : 'text-gray-900'}`}>
                  Libro Diario
                </div>
              </button>
              <button
                onClick={() => handleReportTypeChange('libro-mayor')}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  reportType === 'libro-mayor'
                    ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-primary-300'
                }`}
              >
                <BookOpen className={`w-6 h-6 mb-2 ${reportType === 'libro-mayor' ? 'text-primary-600' : 'text-gray-600'}`} />
                <div className={`font-semibold ${reportType === 'libro-mayor' ? 'text-primary-900' : 'text-gray-900'}`}>
                  Libro Mayor
                </div>
              </button>
              <button
                onClick={() => handleReportTypeChange('balance-comprobacion')}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  reportType === 'balance-comprobacion'
                    ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-primary-300'
                }`}
              >
                <BarChart3 className={`w-6 h-6 mb-2 ${reportType === 'balance-comprobacion' ? 'text-primary-600' : 'text-gray-600'}`} />
                <div className={`font-semibold ${reportType === 'balance-comprobacion' ? 'text-primary-900' : 'text-gray-900'}`}>
                  Balance de Comprobación
                </div>
              </button>
            </div>

            {/* Libro Diario */}
            {reportType === 'libro-diario' && (
              <Card>
                <CardHeader 
                  title={`Libro Diario${libroDiario.length > 0 ? ` (${libroDiario.length} líneas)` : ''}`}
                  subtitle="Todas las líneas de asientos contables"
                />
                {!loading && libroDiario.length > 0 && (
                  <div className="p-4 pb-0 flex justify-end">
                    <Button onClick={() => {
                      exportToExcel(
                        libroDiario,
                        [
                          { key: 'fecha', label: 'Fecha', format: 'date' },
                          { key: 'nro_asiento', label: 'N° Asiento' },
                          { key: 'cuenta_codigo', label: 'Código Cuenta' },
                          { key: 'cuenta_nombre', label: 'Nombre Cuenta' },
                          { key: 'glosa', label: 'Glosa' },
                          { key: 'debe', label: 'Debe', format: 'currency' },
                          { key: 'haber', label: 'Haber', format: 'currency' },
                          { key: 'origen', label: 'Origen' }
                        ],
                        'Libro_Diario',
                        'Libro Diario'
                      )
                    }} variant="outline">
                      <Download className="w-4 h-4 mr-2" />
                      Exportar a Excel
                    </Button>
                  </div>
                )}
                {loading ? (
                  <div className="text-center py-12">
                    <Loader2 className="w-12 h-12 mx-auto mb-4 text-primary-600 animate-spin" />
                    <p className="text-gray-600">Cargando reporte...</p>
                  </div>
                ) : libroDiario.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <AlertCircle className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                    <p className="font-medium">No hay datos para los filtros seleccionados</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50 dark:bg-gray-800">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Fecha</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Asiento</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Cuenta</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Glosa</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Debe</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Haber</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Origen</th>
                        </tr>
                      </thead>
                      <tbody>
                        {libroDiario.map((row, idx) => (
                          <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800">
                            <td className="px-4 py-3 text-sm">{formatDate(row.fecha)}</td>
                            <td className="px-4 py-3 text-sm font-mono">#{row.nro_asiento}</td>
                            <td className="px-4 py-3 text-sm">
                              <div className="font-mono text-gray-700">{row.cuenta_codigo}</div>
                              <div className="text-xs text-gray-500">{row.cuenta_nombre}</div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">{row.glosa || '-'}</td>
                            <td className="px-4 py-3 text-sm text-right">
                              {row.debe > 0 ? formatCurrency(row.debe) : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-right">
                              {row.haber > 0 ? formatCurrency(row.haber) : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <span className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-800">
                                {row.origen}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )}

            {/* Libro Mayor */}
            {reportType === 'libro-mayor' && (
              <Card>
                <CardHeader 
                  title={`Libro Mayor${libroMayor.length > 0 ? ` (${libroMayor.length} cuentas)` : ''}`}
                  subtitle="Saldos por cuenta contable"
                />
                {!loading && libroMayor.length > 0 && (
                  <div className="p-4 pb-0 flex justify-end">
                    <Button onClick={() => {
                      exportToExcel(
                        libroMayor,
                        [
                          { key: 'cuenta_codigo', label: 'Código Cuenta' },
                          { key: 'cuenta_nombre', label: 'Nombre Cuenta' },
                          { key: 'saldo_inicial', label: 'Saldo Inicial', format: 'currency' },
                          { key: 'debe_total', label: 'Debe Total', format: 'currency' },
                          { key: 'haber_total', label: 'Haber Total', format: 'currency' },
                          { key: 'saldo_final', label: 'Saldo Final', format: 'currency' }
                        ],
                        'Libro_Mayor',
                        'Libro Mayor'
                      )
                    }} variant="outline">
                      <Download className="w-4 h-4 mr-2" />
                      Exportar a Excel
                    </Button>
                  </div>
                )}
                {loading ? (
                  <div className="text-center py-12">
                    <Loader2 className="w-12 h-12 mx-auto mb-4 text-primary-600 animate-spin" />
                    <p className="text-gray-600">Cargando reporte...</p>
                  </div>
                ) : libroMayor.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <AlertCircle className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                    <p className="font-medium">No hay datos para los filtros seleccionados</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50 dark:bg-gray-800">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Cuenta</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Saldo Inicial</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Debe</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Haber</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Saldo Final</th>
                        </tr>
                      </thead>
                      <tbody>
                        {libroMayor.map((row, idx) => (
                          <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800">
                            <td className="px-4 py-3 text-sm">
                              <div className="font-mono text-gray-700">{row.cuenta_codigo}</div>
                              <div className="text-xs text-gray-500">{row.cuenta_nombre}</div>
                            </td>
                            <td className="px-4 py-3 text-sm text-right">{formatCurrency(row.saldo_inicial)}</td>
                            <td className="px-4 py-3 text-sm text-right">{formatCurrency(row.debe_total)}</td>
                            <td className="px-4 py-3 text-sm text-right">{formatCurrency(row.haber_total)}</td>
                            <td className={`px-4 py-3 text-sm text-right font-medium ${
                              row.saldo_final >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {formatCurrency(row.saldo_final)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )}

            {/* Balance de Comprobación */}
            {reportType === 'balance-comprobacion' && (
              <Card>
                <CardHeader 
                  title="Balance de Comprobación"
                  subtitle="Reporte clave de cuadratura"
                />
                {loading ? (
                  <div className="text-center py-12">
                    <Loader2 className="w-12 h-12 mx-auto mb-4 text-primary-600 animate-spin" />
                    <p className="text-gray-600">Cargando reporte...</p>
                  </div>
                ) : !balanceComprobacion ? (
                  <div className="text-center py-12 text-gray-500">
                    <AlertCircle className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                    <p className="font-medium">No hay datos para los filtros seleccionados</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Validación */}
                    <div className={`p-4 rounded-lg ${
                      balanceComprobacion.validacion.cuadra 
                        ? 'bg-green-50 dark:bg-green-900/20 border border-green-200' 
                        : 'bg-red-50 dark:bg-red-900/20 border border-red-200'
                    }`}>
                      <div className="flex items-center gap-2">
                        {balanceComprobacion.validacion.cuadra ? (
                          <CheckCircle className="w-5 h-5 text-green-600" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-red-600" />
                        )}
                        <span className={`font-semibold ${
                          balanceComprobacion.validacion.cuadra ? 'text-green-800' : 'text-red-800'
                        }`}>
                          {balanceComprobacion.validacion.mensaje}
                        </span>
                      </div>
                      {!balanceComprobacion.validacion.cuadra && (
                        <div className="mt-2 text-sm text-red-700">
                          Diferencia: {formatCurrency(Math.abs(balanceComprobacion.validacion.diferencia))}
                        </div>
                      )}
                    </div>

                    {/* Tabla */}
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200 bg-gray-50 dark:bg-gray-800">
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Cuenta</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Debe</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Haber</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Saldo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {balanceComprobacion.datos.map((row, idx) => (
                            <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800">
                              <td className="px-4 py-3 text-sm">
                                <div className="font-mono text-gray-700">{row.cuenta_codigo}</div>
                                <div className="text-xs text-gray-500">{row.cuenta_nombre}</div>
                              </td>
                              <td className="px-4 py-3 text-sm text-right">{formatCurrency(row.debe_total)}</td>
                              <td className="px-4 py-3 text-sm text-right">{formatCurrency(row.haber_total)}</td>
                              <td className={`px-4 py-3 text-sm text-right font-medium ${
                                row.saldo_final >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {formatCurrency(row.saldo_final)}
                              </td>
                            </tr>
                          ))}
                          <tr className="border-t-2 border-gray-300 bg-gray-50 dark:bg-gray-800 font-bold">
                            <td className="px-4 py-4 text-sm">TOTALES</td>
                            <td className="px-4 py-4 text-sm text-right">{formatCurrency(balanceComprobacion.validacion.total_debe)}</td>
                            <td className="px-4 py-4 text-sm text-right">{formatCurrency(balanceComprobacion.validacion.total_haber)}</td>
                            <td className="px-4 py-4 text-sm text-right">
                              {formatCurrency(balanceComprobacion.validacion.total_debe - balanceComprobacion.validacion.total_haber)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </Card>
            )}
          </div>
        </TabsContentWithValue>

        {/* Estados Financieros */}
        <TabsContentWithValue value="nivel2" activeValue={activeTab}>
          <div className="p-4">
            <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-sm text-green-800 dark:text-green-200">
                <strong>Estados Financieros:</strong> Reportes que muestran la situación financiera y los resultados de la empresa. Incluyen el Estado de Resultados (ingresos, costos y gastos) y el Balance General (activos, pasivos y patrimonio).
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <button
                onClick={() => handleReportTypeChange('estado-resultados')}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  reportType === 'estado-resultados'
                    ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-primary-300'
                }`}
              >
                <TrendingUp className={`w-6 h-6 mb-2 ${reportType === 'estado-resultados' ? 'text-primary-600' : 'text-gray-600'}`} />
                <div className={`font-semibold ${reportType === 'estado-resultados' ? 'text-primary-900' : 'text-gray-900'}`}>
                  Estado de Resultados
                </div>
              </button>
              <button
                onClick={() => handleReportTypeChange('balance-general')}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  reportType === 'balance-general'
                    ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-primary-300'
                }`}
              >
                <BarChart3 className={`w-6 h-6 mb-2 ${reportType === 'balance-general' ? 'text-primary-600' : 'text-gray-600'}`} />
                <div className={`font-semibold ${reportType === 'balance-general' ? 'text-primary-900' : 'text-gray-900'}`}>
                  Balance General
                </div>
              </button>
            </div>

            {/* Estado de Resultados */}
            {reportType === 'estado-resultados' && estadoResultados && (
              <Card>
                <CardHeader title="Estado de Resultados" subtitle="Ingresos, Costos y Gastos" />
                <div className="space-y-6 p-4">
                  {/* Ingresos */}
                  {estadoResultados.datos.ingresos.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Ingresos</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-gray-200 bg-gray-50 dark:bg-gray-800">
                              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Cuenta</th>
                              <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Monto</th>
                            </tr>
                          </thead>
                          <tbody>
                            {estadoResultados.datos.ingresos.map((item, idx) => (
                              <tr key={idx} className="border-b border-gray-100">
                                <td className="px-4 py-2 text-sm">
                                  <div className="font-mono">{item.cuenta_codigo}</div>
                                  <div className="text-xs text-gray-500">{item.cuenta_nombre}</div>
                                </td>
                                <td className="px-4 py-2 text-sm text-green-600 text-right font-medium">
                                  {formatCurrency(item.monto)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-2 text-right">
                        <span className="font-bold text-lg text-green-600">
                          Total Ingresos: {formatCurrency(estadoResultados.datos.totales.total_ingresos)}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Costos */}
                  {estadoResultados.datos.costos.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Costos</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-gray-200 bg-gray-50 dark:bg-gray-800">
                              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Cuenta</th>
                              <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Monto</th>
                            </tr>
                          </thead>
                          <tbody>
                            {estadoResultados.datos.costos.map((item, idx) => (
                              <tr key={idx} className="border-b border-gray-100">
                                <td className="px-4 py-2 text-sm">
                                  <div className="font-mono">{item.cuenta_codigo}</div>
                                  <div className="text-xs text-gray-500">{item.cuenta_nombre}</div>
                                </td>
                                <td className="px-4 py-2 text-sm text-red-600 text-right font-medium">
                                  {formatCurrency(item.monto)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-2 text-right">
                        <span className="font-bold text-lg text-red-600">
                          Total Costos: {formatCurrency(estadoResultados.datos.totales.total_costos)}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Gastos */}
                  {estadoResultados.datos.gastos.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Gastos</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-gray-200 bg-gray-50 dark:bg-gray-800">
                              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Cuenta</th>
                              <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Monto</th>
                            </tr>
                          </thead>
                          <tbody>
                            {estadoResultados.datos.gastos.map((item, idx) => (
                              <tr key={idx} className="border-b border-gray-100">
                                <td className="px-4 py-2 text-sm">
                                  <div className="font-mono">{item.cuenta_codigo}</div>
                                  <div className="text-xs text-gray-500">{item.cuenta_nombre}</div>
                                </td>
                                <td className="px-4 py-2 text-sm text-red-600 text-right font-medium">
                                  {formatCurrency(item.monto)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-2 text-right">
                        <span className="font-bold text-lg text-red-600">
                          Total Gastos: {formatCurrency(estadoResultados.datos.totales.total_gastos)}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Utilidad Neta */}
                  <div className="border-t-2 border-gray-300 pt-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xl font-bold text-gray-900 dark:text-gray-100">Utilidad Neta:</span>
                      <span className={`text-2xl font-bold ${
                        estadoResultados.datos.totales.utilidad_neta >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {formatCurrency(estadoResultados.datos.totales.utilidad_neta)}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Balance General */}
            {reportType === 'balance-general' && balanceGeneral && (
              <Card>
                <CardHeader title="Balance General" subtitle="Activos, Pasivos y Patrimonio" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4">
                  {/* Activos */}
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Activos</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200 bg-gray-50 dark:bg-gray-800">
                            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Cuenta</th>
                            <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Saldo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {balanceGeneral.datos.activos.map((item, idx) => (
                            <tr key={idx} className="border-b border-gray-100">
                              <td className="px-4 py-2 text-sm">
                                <div className="font-mono">{item.cuenta_codigo}</div>
                                <div className="text-xs text-gray-500">{item.cuenta_nombre}</div>
                              </td>
                              <td className={`px-4 py-2 text-sm text-right font-medium ${item.saldo < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                                {formatCurrency(item.saldo)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-2 text-right border-t pt-2">
                      <span className="font-bold text-lg">
                        Total Activos: {formatCurrency(balanceGeneral.datos.totales.total_activos)}
                      </span>
                    </div>
                  </div>

                  {/* Pasivos y Patrimonio */}
                  <div>
                    <div className="mb-4">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Pasivos</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-gray-200 bg-gray-50 dark:bg-gray-800">
                              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Cuenta</th>
                              <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Saldo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {balanceGeneral.datos.pasivos.map((item, idx) => (
                              <tr key={idx} className="border-b border-gray-100">
                                <td className="px-4 py-2 text-sm">
                                  <div className="font-mono">{item.cuenta_codigo}</div>
                                  <div className="text-xs text-gray-500">{item.cuenta_nombre}</div>
                                </td>
                                <td className="px-4 py-2 text-sm text-right font-medium">
                                  {formatCurrency(item.saldo)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-2 text-right border-t pt-2">
                        <span className="font-bold text-lg">
                          Total Pasivos: {formatCurrency(balanceGeneral.datos.totales.total_pasivos)}
                        </span>
                      </div>
                    </div>

                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Patrimonio Neto</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-gray-200 bg-gray-50 dark:bg-gray-800">
                              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Cuenta</th>
                              <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Saldo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {balanceGeneral.datos.patrimonio.map((item, idx) => (
                              <tr key={idx} className="border-b border-gray-100">
                                <td className="px-4 py-2 text-sm">
                                  <div className="font-mono">{item.cuenta_codigo}</div>
                                  <div className="text-xs text-gray-500">{item.cuenta_nombre}</div>
                                </td>
                                <td className="px-4 py-2 text-sm text-right font-medium">
                                  {formatCurrency(item.saldo)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-2 text-right border-t pt-2">
                        <span className="font-bold text-lg">
                          Total Patrimonio: {formatCurrency(balanceGeneral.datos.totales.total_patrimonio)}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 border-t-2 pt-4">
                      <div className="text-right">
                        <span className="font-bold text-xl">
                          Total Pasivos + Patrimonio: {formatCurrency(balanceGeneral.datos.totales.total_pasivo_patrimonio)}
                        </span>
                        {balanceGeneral.datos.validacion.cuadra && (
                          <span className="ml-2 text-green-600 text-sm">✓ Balanceado</span>
                        )}
                        {!balanceGeneral.datos.validacion.cuadra && (
                          <div className="mt-2 text-sm text-red-600">
                            Diferencia: {formatCurrency(Math.abs(balanceGeneral.datos.validacion.diferencia))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </TabsContentWithValue>

        {/* Control y Cuadratura */}
        <TabsContentWithValue value="nivel4" activeValue={activeTab}>
          <div className="p-4">
            <div className="mb-4 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
              <p className="text-sm text-orange-800 dark:text-orange-200">
                <strong>Control y Cuadratura:</strong> Reportes de validación que detectan inconsistencias y errores en el sistema contable. Incluyen asientos descuadrados, movimientos sin asiento, cuentas sin mapeo y períodos inconsistentes.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <button
                onClick={() => handleReportTypeChange('asientos-descuadrados')}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  reportType === 'asientos-descuadrados'
                    ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-primary-300'
                }`}
              >
                <AlertCircle className={`w-6 h-6 mb-2 ${reportType === 'asientos-descuadrados' ? 'text-primary-600' : 'text-gray-600'}`} />
                <div className={`font-semibold ${reportType === 'asientos-descuadrados' ? 'text-primary-900' : 'text-gray-900'}`}>
                  Asientos Descuadrados
                </div>
              </button>
              <button
                onClick={() => handleReportTypeChange('movimientos-sin-asiento')}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  reportType === 'movimientos-sin-asiento'
                    ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-primary-300'
                }`}
              >
                <FileCheck className={`w-6 h-6 mb-2 ${reportType === 'movimientos-sin-asiento' ? 'text-primary-600' : 'text-gray-600'}`} />
                <div className={`font-semibold ${reportType === 'movimientos-sin-asiento' ? 'text-primary-900' : 'text-gray-900'}`}>
                  Movimientos sin Asiento
                </div>
              </button>
            </div>

            {/* Asientos Descuadrados */}
            {reportType === 'asientos-descuadrados' && asientosDescuadrados && (
              <Card>
                <CardHeader 
                  title={`Asientos Descuadrados${asientosDescuadrados.total > 0 ? ` (${asientosDescuadrados.total})` : ''}`}
                  subtitle={asientosDescuadrados.mensaje}
                />
                {asientosDescuadrados.total === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-400" />
                    <p className="font-medium">Todos los asientos cuadran correctamente</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50 dark:bg-gray-800">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Asiento</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Fecha</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Glosa</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Origen</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Debe</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Haber</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Diferencia</th>
                        </tr>
                      </thead>
                      <tbody>
                        {asientosDescuadrados.datos.map((row, idx) => (
                          <tr key={idx} className="border-b border-gray-100 hover:bg-red-50 dark:hover:bg-red-900/20">
                            <td className="px-4 py-3 text-sm font-mono">#{row.asiento_id}</td>
                            <td className="px-4 py-3 text-sm">{formatDate(row.fecha)}</td>
                            <td className="px-4 py-3 text-sm">{row.glosa || '-'}</td>
                            <td className="px-4 py-3 text-sm">
                              <span className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-800">
                                {row.origen}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-right">{formatCurrency(row.total_debe)}</td>
                            <td className="px-4 py-3 text-sm text-right">{formatCurrency(row.total_haber)}</td>
                            <td className="px-4 py-3 text-sm text-right font-bold text-red-600">
                              {formatCurrency(Math.abs(row.diferencia))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )}

            {/* Movimientos sin Asiento */}
            {reportType === 'movimientos-sin-asiento' && movimientosSinAsiento && (
              <Card>
                <CardHeader 
                  title="Movimientos sin Asiento"
                  subtitle={movimientosSinAsiento.mensaje}
                />
                {movimientosSinAsiento.totales.total === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-400" />
                    <p className="font-medium">Todos los movimientos tienen asiento contable</p>
                  </div>
                ) : (
                  <div className="space-y-6 p-4">
                    {/* Compras */}
                    {movimientosSinAsiento.datos.compras.length > 0 && (
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                          Compras sin Asiento ({movimientosSinAsiento.totales.compras})
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-gray-200 bg-gray-50 dark:bg-gray-800">
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Documento</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Fecha</th>
                                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {movimientosSinAsiento.datos.compras.map((item: any, idx: number) => (
                                <tr key={idx} className="border-b border-gray-100">
                                  <td className="px-4 py-2 text-sm">{item.doc_type} {item.series}-{item.number}</td>
                                  <td className="px-4 py-2 text-sm">{formatDate(item.fecha)}</td>
                                  <td className="px-4 py-2 text-sm text-right">{formatCurrency(item.total)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Ventas */}
                    {movimientosSinAsiento.datos.ventas.length > 0 && (
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                          Ventas sin Asiento ({movimientosSinAsiento.totales.ventas})
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-gray-200 bg-gray-50 dark:bg-gray-800">
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Documento</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Fecha</th>
                                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {movimientosSinAsiento.datos.ventas.map((item: any, idx: number) => (
                                <tr key={idx} className="border-b border-gray-100">
                                  <td className="px-4 py-2 text-sm">{item.doc_type} {item.series}-{item.number}</td>
                                  <td className="px-4 py-2 text-sm">{formatDate(item.fecha)}</td>
                                  <td className="px-4 py-2 text-sm text-right">{formatCurrency(item.total)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Inventario */}
                    {movimientosSinAsiento.datos.inventario.length > 0 && (
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                          Movimientos de Inventario sin Asiento ({movimientosSinAsiento.totales.inventario})
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-gray-200 bg-gray-50 dark:bg-gray-800">
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Tipo</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Fecha</th>
                                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Costo Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {movimientosSinAsiento.datos.inventario.map((item: any, idx: number) => (
                                <tr key={idx} className="border-b border-gray-100">
                                  <td className="px-4 py-2 text-sm">{item.tipo}</td>
                                  <td className="px-4 py-2 text-sm">{formatDate(item.fecha)}</td>
                                  <td className="px-4 py-2 text-sm text-right">{formatCurrency(item.costo_total)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Tesorería */}
                    {movimientosSinAsiento.datos.tesoreria.length > 0 && (
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                          Movimientos de Tesorería sin Asiento ({movimientosSinAsiento.totales.tesoreria})
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-gray-200 bg-gray-50 dark:bg-gray-800">
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Tipo</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Fecha</th>
                                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Monto</th>
                              </tr>
                            </thead>
                            <tbody>
                              {movimientosSinAsiento.datos.tesoreria.map((item: any, idx: number) => (
                                <tr key={idx} className="border-b border-gray-100">
                                  <td className="px-4 py-2 text-sm">{item.tipo}</td>
                                  <td className="px-4 py-2 text-sm">{formatDate(item.fecha)}</td>
                                  <td className="px-4 py-2 text-sm text-right">{formatCurrency(item.monto)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Notas */}
                    {movimientosSinAsiento.datos.notas.length > 0 && (
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                          Notas sin Asiento ({movimientosSinAsiento.totales.notas})
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-gray-200 bg-gray-50 dark:bg-gray-800">
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Tipo</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Serie-Número</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Fecha</th>
                                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {movimientosSinAsiento.datos.notas.map((item: any, idx: number) => (
                                <tr key={idx} className="border-b border-gray-100">
                                  <td className="px-4 py-2 text-sm">{item.tipo}</td>
                                  <td className="px-4 py-2 text-sm">{item.serie}-{item.numero}</td>
                                  <td className="px-4 py-2 text-sm">{formatDate(item.fecha)}</td>
                                  <td className="px-4 py-2 text-sm text-right">{formatCurrency(item.total)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )}
          </div>
        </TabsContentWithValue>

        {/* Reportes Operativos */}
        <TabsContentWithValue value="nivel3" activeValue={activeTab}>
          <div className="p-4">
            <div className="mb-4 p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
              <p className="text-sm text-purple-800 dark:text-purple-200">
                <strong>Reportes Operativos:</strong> Reportes para el control operativo del negocio. Incluyen el Kardex Valorizado (inventarios), Cuentas por Cobrar (CxC) y Cuentas por Pagar (CxP) con análisis de antigüedad.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <button
                onClick={() => handleReportTypeChange('kardex-valorizado')}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  reportType === 'kardex-valorizado'
                    ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-primary-300'
                }`}
              >
                <Package className={`w-6 h-6 mb-2 ${reportType === 'kardex-valorizado' ? 'text-primary-600' : 'text-gray-600'}`} />
                <div className={`font-semibold ${reportType === 'kardex-valorizado' ? 'text-primary-900' : 'text-gray-900'}`}>
                  Kardex Valorizado
                </div>
              </button>
              <button
                onClick={() => handleReportTypeChange('saldos-por-cliente')}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  reportType === 'saldos-por-cliente'
                    ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-primary-300'
                }`}
              >
                <Users className={`w-6 h-6 mb-2 ${reportType === 'saldos-por-cliente' ? 'text-primary-600' : 'text-gray-600'}`} />
                <div className={`font-semibold ${reportType === 'saldos-por-cliente' ? 'text-primary-900' : 'text-gray-900'}`}>
                  Saldos por Cliente (CxC)
                </div>
              </button>
              <button
                onClick={() => handleReportTypeChange('saldos-por-proveedor')}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  reportType === 'saldos-por-proveedor'
                    ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-primary-300'
                }`}
              >
                <Users className={`w-6 h-6 mb-2 ${reportType === 'saldos-por-proveedor' ? 'text-primary-600' : 'text-gray-600'}`} />
                <div className={`font-semibold ${reportType === 'saldos-por-proveedor' ? 'text-primary-900' : 'text-gray-900'}`}>
                  Saldos por Proveedor (CxP)
                </div>
              </button>
            </div>

            {/* Kardex Valorizado */}
            {reportType === 'kardex-valorizado' && kardexValorizado && kardexValorizado.datos && kardexValorizado.datos.kardex && (
              <Card>
                <CardHeader 
                  title="Kardex Valorizado"
                  subtitle="Movimientos de inventario con saldos acumulados"
                />
                <div className="p-4">
                  <div className="flex justify-end mb-4">
                    <Button onClick={() => {
                      exportToExcel(
                        kardexValorizado.datos.kardex || [],
                        [
                          { key: 'fecha', label: 'Fecha', format: 'date' },
                          { key: 'producto_id', label: 'ID Producto', format: 'number' },
                          { key: 'almacen_id', label: 'ID Almacén', format: 'number' },
                          { key: 'tipo', label: 'Tipo' },
                          { key: 'cantidad', label: 'Cantidad', format: 'number' },
                          { key: 'costo_unitario', label: 'Costo Unit.', format: 'currency' },
                          { key: 'costo_total', label: 'Costo Total', format: 'currency' },
                          { key: 'saldo_cantidad', label: 'Saldo Cant.', format: 'number' },
                          { key: 'costo_promedio', label: 'Costo Prom.', format: 'currency' },
                          { key: 'saldo_valor', label: 'Valor Total', format: 'currency' }
                        ],
                        'Kardex_Valorizado',
                        'Kardex Valorizado'
                      )
                    }} variant="outline">
                      <Download className="w-4 h-4 mr-2" />
                      Exportar a Excel
                    </Button>
                  </div>
                  {kardexValorizado.validacion && !kardexValorizado.validacion.valido && (
                    <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg">
                      <div className="flex items-center gap-2 text-red-600">
                        <AlertCircle className="w-5 h-5" />
                        <span className="font-semibold">{kardexValorizado.validacion.mensaje}</span>
                      </div>
                    </div>
                  )}
                  {(!kardexValorizado.datos.kardex || kardexValorizado.datos.kardex.length === 0) ? (
                    <div className="text-center py-12 text-gray-500">
                      <p className="font-medium">No hay movimientos de inventario para mostrar</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200 bg-gray-50 dark:bg-gray-800">
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Fecha</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Producto</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Almacén</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Tipo</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Cantidad</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Costo Unit.</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Costo Total</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Saldo Cant.</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Costo Prom.</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Valor Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {kardexValorizado.datos.kardex.map((row, idx) => (
                            <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800">
                              <td className="px-4 py-3 text-sm">{formatDate(row.fecha)}</td>
                              <td className="px-4 py-3 text-sm">
                                {row.producto_codigo || row.producto_nombre ? (
                                  <>
                                    <div className="font-mono text-gray-700">{row.producto_codigo || row.producto_id}</div>
                                    <div className="text-xs text-gray-500">{row.producto_nombre || ''}</div>
                                  </>
                                ) : (
                                  <span className="font-mono text-gray-500">{row.producto_id || '-'}</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm">
                                {row.almacen_codigo || row.almacen_nombre ? (
                                  <>
                                    <div className="font-mono text-gray-700">{row.almacen_codigo || row.almacen_id}</div>
                                    <div className="text-xs text-gray-500">{row.almacen_nombre || ''}</div>
                                  </>
                                ) : (
                                  <span className="font-mono text-gray-500">{row.almacen_id || '-'}</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm">{row.tipo}</td>
                              <td className="px-4 py-3 text-sm text-right">{row.cantidad || 0}</td>
                              <td className="px-4 py-3 text-sm text-right">{formatCurrency(row.costo_unitario || 0)}</td>
                              <td className="px-4 py-3 text-sm text-right">{formatCurrency(row.costo_total || 0)}</td>
                              <td className="px-4 py-3 text-sm text-right">{row.saldo_cantidad || 0}</td>
                              <td className="px-4 py-3 text-sm text-right">{formatCurrency(row.costo_promedio || 0)}</td>
                              <td className="px-4 py-3 text-sm text-right font-medium">{formatCurrency(row.saldo_valor || 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Saldos por Cliente */}
            {reportType === 'saldos-por-cliente' && saldosPorCliente && (
              <Card>
                <CardHeader 
                  title={`Saldos por Cliente (CxC)${saldosPorCliente.totales ? ` - Total: ${formatCurrency(saldosPorCliente.totales.total_saldo)}` : ''}`}
                  subtitle="Cuentas por cobrar con antigüedad"
                />
                <div className="p-4">
                  <div className="flex justify-end mb-4">
                    <Button onClick={() => {
                      exportToExcel(
                        saldosPorCliente.datos,
                        [
                          { key: 'customer_nombre', label: 'Cliente' },
                          { key: 'documento_tipo', label: 'Tipo Doc.' },
                          { key: 'documento_serie', label: 'Serie' },
                          { key: 'documento_numero', label: 'Número' },
                          { key: 'fecha_emision', label: 'Fecha Emisión', format: 'date' },
                          { key: 'fecha_vencimiento', label: 'Fecha Vencimiento', format: 'date' },
                          { key: 'monto_total', label: 'Monto Total', format: 'currency' },
                          { key: 'saldo_pendiente', label: 'Saldo Pendiente', format: 'currency' },
                          { key: 'antiguedad_dias', label: 'Antigüedad (días)', format: 'number' },
                          { key: 'antiguedad_categoria', label: 'Categoría' }
                        ],
                        'Saldos_Por_Cliente',
                        'Saldos por Cliente (CxC)'
                      )
                    }} variant="outline">
                      <Download className="w-4 h-4 mr-2" />
                      Exportar a Excel
                    </Button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50 dark:bg-gray-800">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Cliente</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Documento</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Fecha Emisión</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Fecha Venc.</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Monto Total</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Saldo Pendiente</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Antigüedad</th>
                        </tr>
                      </thead>
                      <tbody>
                        {saldosPorCliente.datos.map((row, idx) => (
                          <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800">
                            <td className="px-4 py-3 text-sm">{row.customer_nombre}</td>
                            <td className="px-4 py-3 text-sm">
                              <div className="font-mono">{row.documento_serie}-{row.documento_numero}</div>
                              <div className="text-xs text-gray-500">{row.documento_tipo}</div>
                            </td>
                            <td className="px-4 py-3 text-sm">{formatDate(row.fecha_emision)}</td>
                            <td className="px-4 py-3 text-sm">{formatDate(row.fecha_vencimiento)}</td>
                            <td className="px-4 py-3 text-sm text-right">{formatCurrency(row.monto_total)}</td>
                            <td className="px-4 py-3 text-sm text-right font-medium">{formatCurrency(row.saldo_pendiente)}</td>
                            <td className="px-4 py-3 text-sm text-right">
                              <span className={`px-2 py-1 rounded text-xs ${
                                row.antiguedad_dias <= 30 ? 'bg-green-100 text-green-800' :
                                row.antiguedad_dias <= 60 ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {row.antiguedad_dias} días
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </Card>
            )}

            {/* Saldos por Proveedor */}
            {reportType === 'saldos-por-proveedor' && saldosPorProveedor && (
              <Card>
                <CardHeader 
                  title={`Saldos por Proveedor (CxP)${saldosPorProveedor.totales ? ` - Total: ${formatCurrency(saldosPorProveedor.totales.total_saldo)}` : ''}`}
                  subtitle="Cuentas por pagar con antigüedad"
                />
                <div className="p-4">
                  <div className="flex justify-end mb-4">
                    <Button onClick={() => {
                      exportToExcel(
                        saldosPorProveedor.datos,
                        [
                          { key: 'supplier_nombre', label: 'Proveedor' },
                          { key: 'documento_tipo', label: 'Tipo Doc.' },
                          { key: 'documento_serie', label: 'Serie' },
                          { key: 'documento_numero', label: 'Número' },
                          { key: 'fecha_emision', label: 'Fecha Emisión', format: 'date' },
                          { key: 'fecha_vencimiento', label: 'Fecha Vencimiento', format: 'date' },
                          { key: 'monto_total', label: 'Monto Total', format: 'currency' },
                          { key: 'saldo_pendiente', label: 'Saldo Pendiente', format: 'currency' },
                          { key: 'antiguedad_dias', label: 'Antigüedad (días)', format: 'number' },
                          { key: 'antiguedad_categoria', label: 'Categoría' }
                        ],
                        'Saldos_Por_Proveedor',
                        'Saldos por Proveedor (CxP)'
                      )
                    }} variant="outline">
                      <Download className="w-4 h-4 mr-2" />
                      Exportar a Excel
                    </Button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50 dark:bg-gray-800">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Proveedor</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Documento</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Fecha Emisión</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Fecha Venc.</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Monto Total</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Saldo Pendiente</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Antigüedad</th>
                        </tr>
                      </thead>
                      <tbody>
                        {saldosPorProveedor.datos.map((row, idx) => (
                          <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800">
                            <td className="px-4 py-3 text-sm">{row.supplier_nombre}</td>
                            <td className="px-4 py-3 text-sm">
                              <div className="font-mono">{row.documento_serie}-{row.documento_numero}</div>
                              <div className="text-xs text-gray-500">{row.documento_tipo}</div>
                            </td>
                            <td className="px-4 py-3 text-sm">{formatDate(row.fecha_emision)}</td>
                            <td className="px-4 py-3 text-sm">{formatDate(row.fecha_vencimiento)}</td>
                            <td className="px-4 py-3 text-sm text-right">{formatCurrency(row.monto_total)}</td>
                            <td className="px-4 py-3 text-sm text-right font-medium">{formatCurrency(row.saldo_pendiente)}</td>
                            <td className="px-4 py-3 text-sm text-right">
                              <span className={`px-2 py-1 rounded text-xs ${
                                row.antiguedad_dias <= 30 ? 'bg-green-100 text-green-800' :
                                row.antiguedad_dias <= 60 ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {row.antiguedad_dias} días
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </TabsContentWithValue>

        {/* Auditoría y Trazabilidad */}
        <TabsContentWithValue value="nivel5" activeValue={activeTab}>
          <div className="p-4">
            <div className="mb-4 p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
              <p className="text-sm text-indigo-800 dark:text-indigo-200">
                <strong>Auditoría y Trazabilidad:</strong> Reportes avanzados para auditoría y seguimiento completo de transacciones. Incluyen trazabilidad total de asientos (origen, reglas aplicadas) y reporte de cambios y reversiones.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <button
                onClick={() => handleReportTypeChange('trazabilidad-total')}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  reportType === 'trazabilidad-total'
                    ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-primary-300'
                }`}
              >
                <Eye className={`w-6 h-6 mb-2 ${reportType === 'trazabilidad-total' ? 'text-primary-600' : 'text-gray-600'}`} />
                <div className={`font-semibold ${reportType === 'trazabilidad-total' ? 'text-primary-900' : 'text-gray-900'}`}>
                  Trazabilidad Total
                </div>
              </button>
              <button
                onClick={() => handleReportTypeChange('cambios-reversiones')}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  reportType === 'cambios-reversiones'
                    ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-primary-300'
                }`}
              >
                <Activity className={`w-6 h-6 mb-2 ${reportType === 'cambios-reversiones' ? 'text-primary-600' : 'text-gray-600'}`} />
                <div className={`font-semibold ${reportType === 'cambios-reversiones' ? 'text-primary-900' : 'text-gray-900'}`}>
                  Cambios y Reversiones
                </div>
              </button>
            </div>

            {/* Trazabilidad Total */}
            {reportType === 'trazabilidad-total' && (
              <Card>
                <CardHeader 
                  title="Trazabilidad Total"
                  subtitle="Información completa de un asiento contable"
                />
                <div className="p-4">
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      ID del Asiento
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700"
                        value={asientoId || ''}
                        onChange={(e) => setAsientoId(e.target.value ? parseInt(e.target.value) : undefined)}
                        placeholder="Ingrese el ID del asiento"
                      />
                      <Button onClick={loadReport} disabled={!asientoId || loading}>
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                  {trazabilidadTotal && (
                    <div className="space-y-4">
                      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <h3 className="font-semibold mb-2">Información del Asiento</h3>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div><span className="font-medium">ID:</span> {trazabilidadTotal.datos.asiento.id}</div>
                          <div><span className="font-medium">Fecha:</span> {formatDate(trazabilidadTotal.datos.asiento.fecha)}</div>
                          <div><span className="font-medium">Origen:</span> {trazabilidadTotal.datos.asiento.origen}</div>
                          <div><span className="font-medium">Estado:</span> {trazabilidadTotal.datos.asiento.status}</div>
                          <div className="col-span-2"><span className="font-medium">Glosa:</span> {trazabilidadTotal.datos.asiento.glosa}</div>
                        </div>
                      </div>
                      {trazabilidadTotal.datos.documento_origen && (
                        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                          <h3 className="font-semibold mb-2">Documento Origen</h3>
                          <div className="text-sm">
                            <div><span className="font-medium">Tipo:</span> {trazabilidadTotal.datos.documento_origen.tipo}</div>
                            <div><span className="font-medium">ID:</span> {trazabilidadTotal.datos.documento_origen.id}</div>
                            <div><span className="font-medium">Referencia:</span> {trazabilidadTotal.datos.documento_origen.referencia}</div>
                          </div>
                        </div>
                      )}
                      {trazabilidadTotal.datos.evento_contable && (
                        <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                          <h3 className="font-semibold mb-2">Evento Contable</h3>
                          <div className="text-sm">
                            <div><span className="font-medium">Tipo:</span> {trazabilidadTotal.datos.evento_contable.tipo}</div>
                            <div><span className="font-medium">Nombre:</span> {trazabilidadTotal.datos.evento_contable.nombre}</div>
                          </div>
                        </div>
                      )}
                      {trazabilidadTotal.datos.reglas_aplicadas.length > 0 && (
                        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                          <h3 className="font-semibold mb-2">Reglas Aplicadas</h3>
                          <ul className="text-sm space-y-1">
                            {trazabilidadTotal.datos.reglas_aplicadas.map((regla, idx) => (
                              <li key={idx}>• {regla.nombre}: {regla.descripcion}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-gray-200 bg-gray-50 dark:bg-gray-800">
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Cuenta</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Debe</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Haber</th>
                            </tr>
                          </thead>
                          <tbody>
                            {trazabilidadTotal.datos.lineas.map((linea, idx) => (
                              <tr key={idx} className="border-b border-gray-100">
                                <td className="px-4 py-3 text-sm">
                                  <div className="font-mono">{linea.cuenta_codigo}</div>
                                  <div className="text-xs text-gray-500">{linea.cuenta_nombre}</div>
                                </td>
                                <td className="px-4 py-3 text-sm text-right">{formatCurrency(linea.debe)}</td>
                                <td className="px-4 py-3 text-sm text-right">{formatCurrency(linea.haber)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Cambios y Reversiones */}
            {reportType === 'cambios-reversiones' && cambiosReversiones && (
              <Card>
                <CardHeader 
                  title={`Cambios y Reversiones${cambiosReversiones.total_cambios > 0 ? ` (${cambiosReversiones.total_cambios})` : ''}`}
                  subtitle={cambiosReversiones.mensaje}
                />
                <div className="p-4">
                  <div className="flex justify-end mb-4">
                    <Button onClick={() => {
                      const allData = [
                        ...cambiosReversiones.datos.asientos_revertidos.map(a => ({ ...a, tipo: 'Asiento Revertido' })),
                        ...cambiosReversiones.datos.notas.map(n => ({ ...n, tipo: 'Nota' })),
                        ...cambiosReversiones.datos.ajustes_manuales.map(a => ({ ...a, tipo: 'Ajuste Manual' }))
                      ]
                      exportToExcel(
                        allData,
                        [
                          { key: 'tipo', label: 'Tipo' },
                          { key: 'fecha', label: 'Fecha', format: 'date' },
                          { key: 'glosa', label: 'Glosa' },
                          { key: 'origen', label: 'Origen' }
                        ],
                        'Cambios_Reversiones',
                        'Cambios y Reversiones'
                      )
                    }} variant="outline">
                      <Download className="w-4 h-4 mr-2" />
                      Exportar a Excel
                    </Button>
                  </div>
                  <div className="space-y-6">
                    {cambiosReversiones.datos.asientos_revertidos.length > 0 && (
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                          Asientos Revertidos ({cambiosReversiones.datos.totales.asientos_revertidos})
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-gray-200 bg-gray-50 dark:bg-gray-800">
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Asiento ID</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Fecha</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Glosa</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Origen</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Fecha Reversión</th>
                              </tr>
                            </thead>
                            <tbody>
                              {cambiosReversiones.datos.asientos_revertidos.map((item, idx) => (
                                <tr key={idx} className="border-b border-gray-100">
                                  <td className="px-4 py-2 text-sm font-mono">#{item.asiento_id}</td>
                                  <td className="px-4 py-2 text-sm">{formatDate(item.fecha)}</td>
                                  <td className="px-4 py-2 text-sm">{item.glosa}</td>
                                  <td className="px-4 py-2 text-sm">{item.origen}</td>
                                  <td className="px-4 py-2 text-sm">{formatDate(item.fecha_reversion)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    {cambiosReversiones.datos.notas.length > 0 && (
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                          Notas de Crédito/Débito ({cambiosReversiones.datos.totales.notas})
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-gray-200 bg-gray-50 dark:bg-gray-800">
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Tipo</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Serie-Número</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Fecha</th>
                                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Monto</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Documento Origen</th>
                              </tr>
                            </thead>
                            <tbody>
                              {cambiosReversiones.datos.notas.map((item, idx) => (
                                <tr key={idx} className="border-b border-gray-100">
                                  <td className="px-4 py-2 text-sm">{item.tipo}</td>
                                  <td className="px-4 py-2 text-sm font-mono">{item.serie}-{item.numero}</td>
                                  <td className="px-4 py-2 text-sm">{formatDate(item.fecha)}</td>
                                  <td className="px-4 py-2 text-sm text-right">{formatCurrency(item.monto)}</td>
                                  <td className="px-4 py-2 text-sm">{item.documento_origen}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    {cambiosReversiones.datos.ajustes_manuales.length > 0 && (
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                          Ajustes Manuales ({cambiosReversiones.datos.totales.ajustes_manuales})
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-gray-200 bg-gray-50 dark:bg-gray-800">
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Asiento ID</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Fecha</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Glosa</th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Origen</th>
                              </tr>
                            </thead>
                            <tbody>
                              {cambiosReversiones.datos.ajustes_manuales.map((item, idx) => (
                                <tr key={idx} className="border-b border-gray-100">
                                  <td className="px-4 py-2 text-sm font-mono">#{item.asiento_id}</td>
                                  <td className="px-4 py-2 text-sm">{formatDate(item.fecha)}</td>
                                  <td className="px-4 py-2 text-sm">{item.glosa}</td>
                                  <td className="px-4 py-2 text-sm">{item.origen}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    {cambiosReversiones.total_cambios === 0 && (
                      <div className="text-center py-12 text-gray-500">
                        <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-400" />
                        <p className="font-medium">No se encontraron cambios ni reversiones</p>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )}
          </div>
        </TabsContentWithValue>
      </Card>

      {/* Modal de Mensajes */}
      {messageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setMessageModal(null)}></div>
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className={`flex items-center gap-3 mb-4 ${messageModal.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {messageModal.type === 'success' ? (
                <CheckCircle className="w-8 h-8" />
              ) : (
                <AlertCircle className="w-8 h-8" />
              )}
              <div className="text-xl font-bold">{messageModal.title}</div>
            </div>
            <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line mb-6">
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
    </div>
  )
}
