import { useState, useEffect } from 'react'
import { useOrg } from '@/stores/org'
import { useAuth } from '@/stores/auth'
import { useNavigate } from 'react-router-dom'
import { Card, CardHeader } from '@/components/ui/Card'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { TrendChart, MiniLineChart, BarChartComponent } from '@/components/ui/Charts'
import { formatCurrency, formatDate } from '@/lib/utils'
import { 
  Wallet, FileText, ArrowUp, ArrowDown,
  TrendingUp, Activity, Calendar,
  BarChart3, Loader2, Sparkles, ShoppingCart, Package, CheckCircle
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { getDashboardSummary, getMyPermissions, type DashboardSummary, getDetractionsSummary, type DetractionsSummary } from '@/api'
import { showMessage } from '@/lib/utils'
import { InfoTooltip } from '@/components/ui/Tooltip'

function MetricCard({ 
  title, 
  value, 
  subtitle, 
  trend,
  icon: Icon,
  color = 'primary',
  chartData,
  action
}: {
  title: string
  value: string
  subtitle: string
  trend?: { value: string; isPositive: boolean }
  icon: any
  color?: 'primary' | 'green' | 'red' | 'amber' | 'blue' | 'purple'
  chartData?: { date: string; value: number }[]
  action?: React.ReactNode
}) {
  const colorClasses = {
    primary: 'from-primary-500 to-primary-600',
    green: 'from-emerald-500 to-emerald-600',
    red: 'from-red-500 to-red-600',
    amber: 'from-amber-500 to-amber-600',
    blue: 'from-blue-500 to-blue-600',
    purple: 'from-purple-500 to-purple-600',
  }

  const colorValues = {
    primary: '#4F46E5',
    green: '#10B981',
    red: '#EF4444',
    amber: '#F59E0B',
    blue: '#3B82F6',
    purple: '#A855F7',
  }

  return (
    <Card className="relative overflow-hidden group hover:shadow-xl dark:hover:shadow-2xl transition-all duration-300 border-2 border-transparent hover:border-primary-200 dark:hover:border-primary-800">
      <div className={`absolute top-0 right-0 w-40 h-40 bg-gradient-to-br ${colorClasses[color]} opacity-5 dark:opacity-10 rounded-full -mr-20 -mt-20 group-hover:scale-150 transition-transform duration-700`} />
      <div className="relative p-6">
        <div className="flex items-start justify-between mb-4">
          <div className={`p-4 rounded-2xl bg-gradient-to-br ${colorClasses[color]} shadow-lg group-hover:scale-110 transition-transform duration-300`}>
            <Icon className="w-7 h-7 text-white" />
          </div>
          {trend && (
            <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
              trend.isPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
            }`}>
              {trend.isPositive ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
              {trend.value}
            </div>
          )}
        </div>
        <h3 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">{value}</h3>
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{title}</p>
        {chartData && chartData.length > 0 ? (
          <div className="mt-3 -mx-2 -mb-2">
            <MiniLineChart data={chartData} color={colorValues[color]} />
          </div>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
        )}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </Card>
  )
}

export default function Dashboard() {
  const { empresaId, periodo } = useOrg()
  const { user } = useAuth()
  const navigate = useNavigate()
  
  // Determinar si es usuario empresa para aplicar restricciones
  const isEmpresaUser = user?.user_type === 'COMPANY_USER' || user?.role === 'USUARIO_EMPRESA'
  
  const [loading, setLoading] = useState(true)
  const [dashboardData, setDashboardData] = useState<DashboardSummary | null>(null)
  const [userPermissions, setUserPermissions] = useState<string[]>([])
  const [detractionsSummary, setDetractionsSummary] = useState<DetractionsSummary | null>(null)
  const [loadingDetractions, setLoadingDetractions] = useState(false)
  
  useEffect(() => {
    if (empresaId && periodo) {
      loadDashboard()
      loadPermissions()
      loadDetractionsSummary()
    } else {
      // Si no hay empresaId o periodo, dejar de mostrar loading
      setLoading(false)
    }
  }, [empresaId, periodo])

  async function loadDetractionsSummary() {
    if (!empresaId || !periodo) return
    try {
      setLoadingDetractions(true)
      const summary = await getDetractionsSummary({
        company_id: empresaId,
        period: periodo
      })
      setDetractionsSummary(summary)
    } catch (err) {
      console.error('Error cargando resumen de detracciones:', err)
      setDetractionsSummary(null)
    } finally {
      setLoadingDetractions(false)
    }
  }
  
  async function loadPermissions() {
    try {
      const permissions = await getMyPermissions()
      setUserPermissions(permissions)
    } catch (err: any) {
      console.error('Error cargando permisos:', err)
      setUserPermissions([])
    }
  }
  
  // Función helper para verificar permisos
  function hasPermission(permission: string): boolean {
    return userPermissions.includes(permission)
  }
  
  async function loadDashboard() {
    try {
      setLoading(true)
      const data = await getDashboardSummary({
        company_id: empresaId,
        period: periodo
      })
      setDashboardData(data)
    } catch (err: any) {
      console.error('Error cargando dashboard:', err)
      // En caso de error, mostrar dashboard con valores en cero
      setDashboardData({
        metrics: {
          cash_and_banks: 0,
          igv_por_pagar: 0,
          accounts_receivable: 0,
          accounts_payable: 0,
          total_purchases: 0,
          total_sales: 0
        },
        recent_activities: []
      })
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-9 w-48 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
            <div className="h-5 w-64 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
          </div>
          <div className="flex gap-3">
            <div className="h-10 w-24 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
            <div className="h-10 w-32 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
          </div>
        </div>
        
        {/* Metrics skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-2xl animate-pulse" />
                <div className="w-16 h-6 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
              </div>
              <div className="h-10 w-32 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse mb-2" />
              <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-1" />
              <div className="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }
  
  // Si no hay empresaId o periodo, mostrar mensaje
  if (!empresaId || !periodo) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Breadcrumbs />
        <Card className="p-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 rounded-full bg-gray-100 dark:bg-gray-800">
              <Calendar className="w-8 h-8 text-gray-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Selecciona una empresa y período
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                {!empresaId && !periodo 
                  ? 'Por favor selecciona una empresa y un período para ver el dashboard.'
                  : !empresaId 
                  ? 'Por favor selecciona una empresa para ver el dashboard.'
                  : 'Por favor selecciona un período para ver el dashboard.'}
              </p>
            </div>
          </div>
        </Card>
      </div>
    )
  }
  
  const metrics = dashboardData?.metrics || {
    cash_and_banks: 0,
    igv_por_pagar: 0,
    accounts_receivable: 0,
    accounts_payable: 0,
    total_purchases: 0,
    total_sales: 0
  }
  
  const activities = dashboardData?.recent_activities || []
  
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumbs */}
      <Breadcrumbs />
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 shadow-lg">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400 ml-14">Resumen financiero del periodo {periodo}</p>
        </div>
        <div className="flex items-center gap-3">
          {hasPermission('reportes.view') && !isEmpresaUser && (
            <Button variant="outline" onClick={() => navigate('/reportes')}>
              <BarChart3 className="w-4 h-4" />
              Ver Reportes
            </Button>
          )}
        </div>
      </div>

      {/* Métricas Contables (Saldos Acumulados hasta el fin del período) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Métricas Contables</h2>
            <InfoTooltip
              content={
                <div className="max-w-md">
                  <p className="font-semibold mb-3 text-base">📊 ¿Cómo funcionan las Métricas Contables?</p>
                  <div className="space-y-3 text-sm leading-relaxed">
                    <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg border border-green-200 dark:border-green-800">
                      <p className="font-semibold text-green-700 dark:text-green-300 mb-1">💰 Caja + Bancos:</p>
                      <p className="text-green-800 dark:text-green-200">Es el dinero que tienes disponible (efectivo + cuentas bancarias). Se suma todo el dinero que ha entrado menos todo el que ha salido desde el inicio hasta hoy.</p>
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1">💡 Ejemplo: Si empezaste con S/ 1,000, recibiste S/ 5,000 y gastaste S/ 2,000, tendrás S/ 4,000.</p>
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
                      <p className="font-semibold text-amber-700 dark:text-amber-300 mb-1">📄 IGV por Pagar:</p>
                      <p className="text-amber-800 dark:text-amber-200">Es el IGV que debes pagar a SUNAT. Se calcula: IGV de tus ventas - IGV de tus compras. Si es positivo, debes pagar; si es negativo, tienes crédito fiscal.</p>
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">💡 Ejemplo: Si vendiste S/ 10,000 (IGV S/ 1,800) y compraste S/ 5,000 (IGV S/ 900), debes pagar S/ 900 a SUNAT.</p>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                      <p className="font-semibold text-blue-700 dark:text-blue-300 mb-1">📈 Cuentas por Cobrar:</p>
                      <p className="text-blue-800 dark:text-blue-200">Es el dinero que tus clientes te deben. Cuando vendes algo, aumenta; cuando te pagan, disminuye. Es el saldo acumulado de todas las ventas menos todos los cobros.</p>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">💡 Ejemplo: Si vendiste S/ 20,000 este mes pero ya tenías S/ 5,000 pendientes de meses anteriores, y solo te pagaron S/ 10,000, te deben S/ 15,000.</p>
                    </div>
                    <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800">
                      <p className="font-semibold text-red-700 dark:text-red-300 mb-1">📉 Cuentas por Pagar:</p>
                      <p className="text-red-800 dark:text-red-200">Es el dinero que tú debes a tus proveedores. Cuando compras algo, aumenta; cuando pagas, disminuye. Es el saldo acumulado de todas las compras menos todos los pagos.</p>
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">💡 Ejemplo: Si compraste S/ 15,000 este mes pero ya tenías S/ 3,000 pendientes, y solo pagaste S/ 8,000, debes S/ 10,000.</p>
                    </div>
                    <div className="mt-4 pt-4 border-t-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg">
                      <p className="font-semibold mb-2 text-base">✅ ¿Cómo cuadran estas métricas?</p>
                      <p className="text-sm mb-2">Estas 4 métricas son parte del <strong>Balance General</strong> de tu empresa. Todas se calculan desde el inicio hasta el fin del período seleccionado, por eso son "saldos acumulados".</p>
                      <p className="text-sm font-semibold text-primary-600 dark:text-primary-400">📐 Fórmula del Balance:</p>
                      <p className="text-xs bg-white dark:bg-gray-700 p-2 rounded mt-1 font-mono">
                        ACTIVOS = PASIVOS + PATRIMONIO<br/>
                        (Caja + Cuentas por Cobrar) = (IGV por Pagar + Cuentas por Pagar) + Patrimonio
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">💡 <strong>Nota:</strong> Estas métricas muestran solo una parte del balance. Para ver el balance completo, ve a "Reportes" → "Balance General".</p>
                    </div>
                  </div>
                </div>
              }
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <MetricCard
          title="Caja + Bancos"
          value={formatCurrency(metrics.cash_and_banks)}
          subtitle="Saldo acumulado hasta fin del período"
          icon={Wallet}
          color="green"
          chartData={[
            { date: 'Ene', value: metrics.cash_and_banks * 0.7 },
            { date: 'Feb', value: metrics.cash_and_banks * 0.85 },
            { date: 'Mar', value: metrics.cash_and_banks * 0.95 },
            { date: 'Abr', value: metrics.cash_and_banks },
          ]}
        />
        <MetricCard
          title="IGV por Pagar"
          value={formatCurrency(metrics.igv_por_pagar)}
          subtitle="Crédito fiscal acumulado"
          icon={FileText}
          color="amber"
          chartData={[
            { date: 'Ene', value: metrics.igv_por_pagar * 0.6 },
            { date: 'Feb', value: metrics.igv_por_pagar * 0.75 },
            { date: 'Mar', value: metrics.igv_por_pagar * 0.9 },
            { date: 'Abr', value: metrics.igv_por_pagar },
          ]}
        />
        <MetricCard
          title="Cuentas por Cobrar"
          value={formatCurrency(metrics.accounts_receivable)}
          subtitle="Clientes pendientes (saldo acumulado)"
          icon={TrendingUp}
          color="blue"
          chartData={[
            { date: 'Ene', value: metrics.accounts_receivable * 0.65 },
            { date: 'Feb', value: metrics.accounts_receivable * 0.8 },
            { date: 'Mar', value: metrics.accounts_receivable * 0.92 },
            { date: 'Abr', value: metrics.accounts_receivable },
          ]}
        />
        <MetricCard
          title="Cuentas por Pagar"
          value={formatCurrency(metrics.accounts_payable)}
          subtitle="Proveedores pendientes (saldo acumulado)"
          icon={ArrowDown}
          color="red"
          chartData={[
            { date: 'Ene', value: metrics.accounts_payable * 0.7 },
            { date: 'Feb', value: metrics.accounts_payable * 0.85 },
            { date: 'Mar', value: metrics.accounts_payable * 0.95 },
            { date: 'Abr', value: metrics.accounts_payable },
          ]}
        />
      </div>
      </div>

      {/* Sección de Control de Detracciones */}
      {detractionsSummary && (detractionsSummary.detracciones_acumuladas > 0 || detractionsSummary.detracciones_usadas > 0) && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">Control de Detracciones</h2>
            <InfoTooltip
              content={
                <div className="max-w-xs text-sm">
                  <p className="font-semibold mb-2">💡 ¿Qué son las Detracciones?</p>
                  <p className="mb-1">Las detracciones son retenciones que hacen algunos clientes (como el Estado, MINEM, etc.) sobre el total de la factura.</p>
                  <p className="mb-1"><strong>Ejemplo:</strong> Si facturas S/ 10,000 y el cliente retiene 12%, recibes S/ 8,800 y S/ 1,200 queda como detracción.</p>
                  <p className="mt-2 font-semibold">✅ Las detracciones se pueden usar para pagar el IGV a SUNAT.</p>
                </div>
              }
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <MetricCard
              title="Detracciones Acumuladas"
              value={formatCurrency(detractionsSummary.detracciones_acumuladas)}
              subtitle="Total de detracciones recibidas"
              icon={Package}
              color="blue"
            />
            <MetricCard
              title="Detracciones Usadas"
              value={formatCurrency(detractionsSummary.detracciones_usadas)}
              subtitle="Usadas para pagar IGV"
              icon={DollarSign}
              color="amber"
            />
            <MetricCard
              title="Detracciones Disponibles"
              value={formatCurrency(detractionsSummary.detracciones_disponibles)}
              subtitle="Disponibles para usar"
              icon={CheckCircle}
              color="green"
            />
          </div>
        </div>
      )}

      {/* Gráficos de Tendencia */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <TrendChart
          title="Tendencia de Caja y Bancos"
          data={[
            { date: 'Ene', value: metrics.cash_and_banks * 0.7 },
            { date: 'Feb', value: metrics.cash_and_banks * 0.85 },
            { date: 'Mar', value: metrics.cash_and_banks * 0.95 },
            { date: 'Abr', value: metrics.cash_and_banks },
          ]}
          color="#10B981"
          formatValue={formatCurrency}
        />
        <BarChartComponent
          title="Comparativa de Métricas"
          data={[
            { name: 'Caja', value: metrics.cash_and_banks },
            { name: 'IGV', value: metrics.igv_por_pagar },
            { name: 'Por Cobrar', value: metrics.accounts_receivable },
            { name: 'Por Pagar', value: metrics.accounts_payable },
          ]}
          color="#4F46E5"
          formatValue={formatCurrency}
        />
      </div>

      {/* Charts & Actions */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <Card hover>
          <CardHeader 
            title="Acciones Rápidas" 
            subtitle="Acelera tu trabajo con accesos directos"
            icon={<Activity className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
          />
          <div className="grid grid-cols-2 gap-3">
            {hasPermission('ventas.view') && (
              <Button 
                variant="outline" 
                className="h-auto py-5 flex-col group hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-600 transition-all" 
                onClick={() => navigate('/ventas')}
              >
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 group-hover:scale-110 transition-transform mb-2">
                  <TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <span className="font-semibold">Nueva Venta</span>
              </Button>
            )}
            {hasPermission('compras.view') && (
              <Button 
                variant="outline" 
                className="h-auto py-5 flex-col group hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:border-amber-300 dark:hover:border-amber-600 transition-all" 
                onClick={() => navigate('/compras')}
              >
                <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 group-hover:scale-110 transition-transform mb-2">
                  <ArrowDown className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <span className="font-semibold">Nueva Compra</span>
              </Button>
            )}
            {hasPermission('asientos.view') && (
              <Button 
                variant="outline" 
                className="h-auto py-5 flex-col group hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:border-purple-300 dark:hover:border-purple-600 transition-all" 
                onClick={() => navigate('/asientos')}
              >
                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30 group-hover:scale-110 transition-transform mb-2">
                  <FileText className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <span className="font-semibold">Nuevo Asiento</span>
              </Button>
            )}
            {hasPermission('ple.view') && (
              <Button 
                variant="outline" 
                className="h-auto py-5 flex-col group hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-300 dark:hover:border-emerald-600 transition-all" 
                onClick={() => navigate('/ple')}
              >
                <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 group-hover:scale-110 transition-transform mb-2">
                  <Activity className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <span className="font-semibold">Generar PLE</span>
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            {hasPermission('ventas.view') && (
              <Button 
                variant="outline" 
                className="h-auto py-5 flex-col group hover:bg-green-50 dark:hover:bg-green-900/20 hover:border-green-300 dark:hover:border-green-600 transition-all" 
                onClick={() => navigate('/ventas')} 
                title="Las facturas se crean desde Ventas"
              >
                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30 group-hover:scale-110 transition-transform mb-2">
                  <FileText className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <span className="font-semibold">Generar Factura</span>
              </Button>
            )}
            {hasPermission('asientos.view') && (
              <Button 
                variant="outline" 
                className="h-auto py-5 flex-col group hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:border-indigo-300 dark:hover:border-indigo-600 transition-all" 
                onClick={() => navigate('/conciliacion-bancaria')} 
                title="Conciliación Bancaria"
              >
                <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 group-hover:scale-110 transition-transform mb-2">
                  <Wallet className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <span className="font-semibold">Conciliar Bancos</span>
              </Button>
            )}
          </div>
        </Card>

        {/* Monthly Closing */}
        <Card hover>
          <CardHeader 
            title="Cierre Mensual" 
            subtitle={`Estado del período ${periodo} (${dashboardData?.period_status || 'ABIERTO'})`}
            icon={<Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
          />
          <div className="space-y-3">
            {dashboardData?.closing_status && dashboardData.closing_status.length > 0 ? (
              dashboardData.closing_status.map((task, idx) => (
                <div 
                  key={idx} 
                  className={`flex items-center gap-3 p-3 rounded-xl border ${
                    task.status === 'complete' ? 'bg-emerald-50 border-emerald-200' :
                    task.status === 'warning' ? 'bg-amber-50 border-amber-200' :
                    task.status === 'pending' ? 'bg-gray-50 border-gray-200' :
                    'bg-blue-50 border-blue-200'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full ${
                    task.status === 'complete' ? 'bg-emerald-600' :
                    task.status === 'warning' ? 'bg-amber-600' :
                    task.status === 'pending' ? 'bg-gray-400' :
                    'bg-blue-600'
                  }`} />
                  <div className="flex-1">
                    <div className={`font-medium ${
                      task.status === 'complete' ? 'text-emerald-900' :
                      task.status === 'warning' ? 'text-amber-900' :
                      task.status === 'pending' ? 'text-gray-900' :
                      'text-blue-900'
                    }`}>
                      {task.task}
                    </div>
                    <div className={`text-xs ${
                      task.status === 'complete' ? 'text-emerald-700' :
                      task.status === 'warning' ? 'text-amber-700' :
                      task.status === 'pending' ? 'text-gray-600' :
                      'text-blue-700'
                    }`}>
                      {task.description}
                    </div>
                  </div>
                  <span className={`badge ${
                    task.status === 'complete' ? 'badge-success' :
                    task.status === 'warning' ? 'badge-warning' :
                    task.status === 'pending' ? 'badge-gray' :
                    'badge-info'
                  }`}>
                    {task.status === 'complete' ? '✓ Completo' :
                     task.status === 'warning' ? '⚠ Atención' :
                     task.status === 'pending' ? '⏳ Pendiente' :
                     'ℹ Info'}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-center py-4 text-gray-500 text-sm">
                Cargando estado de cierre...
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Compras y Ventas Recientes */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Compras Recientes */}
        <Card hover>
          <CardHeader 
            title="Compras Recientes" 
            subtitle="Últimas compras registradas"
            icon={<ArrowDown className="w-5 h-5 text-amber-600 dark:text-amber-400" />}
          />
          <div className="space-y-3">
            {dashboardData?.recent_purchases && dashboardData.recent_purchases.length > 0 ? (
              <>
                {dashboardData.recent_purchases.map((compra) => (
                  <div 
                    key={compra.id} 
                    className="flex items-center gap-4 p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                    onClick={() => navigate(`/compras?highlight=${compra.id}`)}
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                      <ArrowDown className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 dark:text-gray-100">
                        {compra.doc_type} {compra.series}-{compra.number}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDate(compra.issue_date)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(compra.total_amount)}</div>
                    </div>
                  </div>
                ))}
                <Button 
                  variant="outline" 
                  className="w-full mt-3"
                  onClick={() => navigate('/compras')}
                >
                  Ver Todas las Compras
                </Button>
              </>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No hay compras registradas en este período.
              </div>
            )}
          </div>
        </Card>

        {/* Ventas Recientes */}
        <Card hover>
          <CardHeader 
            title="Ventas Recientes" 
            subtitle="Últimas ventas registradas"
            icon={<TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
          />
          <div className="space-y-3">
            {dashboardData?.recent_sales && dashboardData.recent_sales.length > 0 ? (
              <>
                {dashboardData.recent_sales.map((venta) => (
                  <div 
                    key={venta.id} 
                    className="flex items-center gap-4 p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                    onClick={() => navigate(`/ventas?highlight=${venta.id}`)}
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                      <TrendingUp className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 dark:text-gray-100">
                        {venta.doc_type} {venta.series}-{venta.number}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDate(venta.issue_date)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(venta.total_amount)}</div>
                    </div>
                  </div>
                ))}
                <Button 
                  variant="outline" 
                  className="w-full mt-3"
                  onClick={() => navigate('/ventas')}
                >
                  Ver Todas las Ventas
                </Button>
              </>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No hay ventas registradas en este período.
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card hover>
        <CardHeader 
          title="Actividad Reciente" 
          subtitle="Últimos movimientos registrados"
          icon={<FileText className="w-5 h-5 text-purple-600 dark:text-purple-400" />}
        />
        <div className="space-y-4">
          {activities.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No hay actividad reciente en este período.
            </div>
          ) : (
            activities.map((activity, idx) => (
            <div key={idx} className="flex items-center gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                activity.type === 'Venta' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' :
                activity.type === 'Compra' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' :
                'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
              }`}>
                {activity.type === 'Venta' ? <TrendingUp className="w-5 h-5" /> :
                 activity.type === 'Compra' ? <ArrowDown className="w-5 h-5" /> :
                 <FileText className="w-5 h-5" />}
              </div>
              <div className="flex-1">
                <div className="font-medium text-gray-900 dark:text-gray-100">{activity.description}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{activity.type}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(activity.amount)}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{formatDate(activity.date)}</div>
              </div>
              <span className={`badge ${
                activity.status === 'success' ? 'badge-success' : 'badge-warning'
              }`}>
                {activity.status === 'success' ? 'Completo' : 'Pendiente'}
              </span>
            </div>
            ))
          )}
        </div>
      </Card>

    </div>
  )
}
