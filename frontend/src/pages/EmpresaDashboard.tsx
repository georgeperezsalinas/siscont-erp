import { useState, useEffect } from 'react'
import { useOrg } from '@/stores/org'
import { useNavigate } from 'react-router-dom'
import { Card, CardHeader } from '@/components/ui/Card'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { formatCurrency } from '@/lib/utils'
import {
  Wallet,
  FileText,
  Inbox,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Building2,
} from 'lucide-react'
import { getEmpresaDashboard, type EmpresaDashboardData } from '@/api'

function MetricCard({
  title,
  value,
  icon: Icon,
  color = 'primary',
  subtitle,
}: {
  title: string
  value: string
  icon: any
  color?: 'primary' | 'green' | 'red' | 'amber' | 'blue'
  subtitle?: string
}) {
  const colorClasses = {
    primary: 'from-primary-500 to-primary-600',
    green: 'from-emerald-500 to-emerald-600',
    red: 'from-red-500 to-red-600',
    amber: 'from-amber-500 to-amber-600',
    blue: 'from-blue-500 to-blue-600',
  }
  return (
    <Card className="overflow-hidden border-2 border-transparent hover:border-primary-200 dark:hover:border-primary-800 transition-all">
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className={`p-3 rounded-xl bg-gradient-to-br ${colorClasses[color]}`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
        </div>
        <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">{value}</h3>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{title}</p>
        {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>}
      </div>
    </Card>
  )
}

export default function EmpresaDashboard() {
  const { empresaId, periodo } = useOrg()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<EmpresaDashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (empresaId) {
      loadDashboard()
    } else {
      setLoading(false)
      setError('Seleccione una empresa')
    }
  }, [empresaId, periodo])

  async function loadDashboard() {
    if (!empresaId) return
    setLoading(true)
    setError(null)
    try {
      const res = await getEmpresaDashboard({
        company_id: empresaId,
        period: periodo || undefined,
      })
      setData(res)
    } catch (err: any) {
      setError(err.message || 'Error al cargar el dashboard')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-10 h-10 animate-spin text-primary-500" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
          <p className="text-red-700 dark:text-red-300">{error || 'No hay datos'}</p>
        </div>
      </div>
    )
  }

  const { financial, mailbox_status, company_name, quick_links } = data

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard Empresa', href: '/empresa/dashboard' },
        ]}
      />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Building2 className="w-7 h-7" />
            Dashboard Empresa
          </h1>
          {company_name && (
            <p className="text-gray-600 dark:text-gray-400 mt-1">{company_name}</p>
          )}
        </div>
      </div>

      {/* Estado Casilla */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600">
              <Inbox className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Casilla Electrónica</h2>
              <p className="text-sm text-gray-500">Mensajes y notificaciones</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {mailbox_status.unread_count > 0 && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-sm font-medium">
                <AlertCircle className="w-4 h-4" />
                {mailbox_status.unread_count} no leídos
              </span>
            )}
            {mailbox_status.pending_response_count > 0 && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 text-sm font-medium">
                {mailbox_status.pending_response_count} pendientes de respuesta
              </span>
            )}
            <button
              onClick={() => navigate('/casilla-electronica')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors text-sm font-medium"
            >
              Ver Casilla
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        </CardHeader>
      </Card>

      {/* Resumen financiero */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Resumen financiero
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <MetricCard
            title="Caja y Bancos"
            value={formatCurrency(financial.cash_and_banks)}
            icon={Wallet}
            color="green"
          />
          <MetricCard
            title="Cuentas por Cobrar"
            value={formatCurrency(financial.accounts_receivable)}
            icon={ArrowUpRight}
            color="blue"
          />
          <MetricCard
            title="Cuentas por Pagar"
            value={formatCurrency(financial.accounts_payable)}
            icon={ArrowDownRight}
            color="red"
          />
          <MetricCard
            title="Ventas del período"
            value={formatCurrency(financial.total_sales)}
            icon={FileText}
            color="green"
          />
          <MetricCard
            title="Compras del período"
            value={formatCurrency(financial.total_purchases)}
            icon={FileText}
            color="amber"
          />
          <MetricCard
            title="IGV por Pagar"
            value={formatCurrency(financial.igv_por_pagar)}
            icon={FileText}
            color="red"
          />
        </div>
      </div>

      {/* Accesos rápidos */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Accesos rápidos
        </h2>
        <div className="flex flex-wrap gap-3">
          {quick_links.map((link) => (
            <button
              key={link.path}
              onClick={() => navigate(link.path)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm font-medium"
            >
              {link.label}
              <ArrowUpRight className="w-4 h-4" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
