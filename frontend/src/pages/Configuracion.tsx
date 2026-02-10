import { useState, useEffect } from 'react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { ActionBar } from '@/components/ui/ActionBar'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { TabsTriggerWithValue, TabsContentWithValue } from '@/components/ui/Tabs'
import { Settings2, Save, RefreshCw, DollarSign, Calendar, FileText, Lock, Building2, Sliders } from 'lucide-react'
import { useOrg } from '@/stores/org'
import { getSystemSettings, updateSystemSettings, listCompanies, type SystemSettingsIn } from '@/api'
import { useSettings } from '@/stores/settings'
import { MessageModal } from '@/components/ui/MessageModal'

type ConfigTab = 'general' | 'impuestos' | 'periodos' | 'avanzado'

export default function Configuracion() {
  const { empresaId } = useOrg()
  const { loadSettings } = useSettings()
  const [activeTab, setActiveTab] = useState<ConfigTab>('general')
  const [companyName, setCompanyName] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<SystemSettingsIn>({
    number_thousand_separator: ',',
    number_decimal_separator: '.',
    number_decimal_places: 2,
    currency_code: 'PEN',
    currency_symbol: 'S/',
    date_format: 'DD/MM/YYYY',
    default_igv_rate: 18.00,
    fiscal_year_start_month: 1,
    allow_edit_closed_periods: false,
    auto_generate_journal_entries: true,
    require_period_validation: true
  })
  const [messageModal, setMessageModal] = useState<{ type: 'success' | 'error'; title: string; message: string } | null>(null)

  useEffect(() => {
    if (empresaId) {
      loadConfig()
      listCompanies({ page: 1, page_size: 200 }).then(r => {
        const items = 'items' in r ? r.items : []
        const c = items.find((x: { id: number }) => x.id === empresaId)
        setCompanyName(c?.name || '')
      }).catch(() => setCompanyName(''))
    }
  }, [empresaId])

  async function loadConfig() {
    try {
      setLoading(true)
      const data = await getSystemSettings(empresaId)
      setSettings({
        number_thousand_separator: data.number_thousand_separator,
        number_decimal_separator: data.number_decimal_separator,
        number_decimal_places: data.number_decimal_places,
        currency_code: data.currency_code,
        currency_symbol: data.currency_symbol,
        date_format: data.date_format,
        default_igv_rate: data.default_igv_rate,
        fiscal_year_start_month: data.fiscal_year_start_month,
        allow_edit_closed_periods: data.allow_edit_closed_periods,
        auto_generate_journal_entries: data.auto_generate_journal_entries,
        require_period_validation: data.require_period_validation,
        extra_settings: data.extra_settings
      })
    } catch (err: any) {
      console.error('Error cargando configuración:', err)
      setMessageModal({ type: 'error', title: 'Error', message: `Error al cargar configuración: ${err.message}` })
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    try {
      setSaving(true)
      await updateSystemSettings(empresaId, settings)
      await loadSettings(empresaId) // Recargar en el store
      setMessageModal({ type: 'success', title: 'Configuración Guardada', message: 'Los cambios se han aplicado correctamente.' })
    } catch (err: any) {
      console.error('Error guardando configuración:', err)
      setMessageModal({ type: 'error', title: 'Error', message: `Error al guardar configuración: ${err.message}` })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <Breadcrumbs />
      <PageHeader
        title="Configuración Contable"
        subtitle="Parámetros de formato, moneda, impuestos y períodos por empresa"
        icon={Settings2}
        iconColor="primary"
        actions={
          <ActionBar onRefresh={loadConfig} loading={loading}>
            <Button onClick={save} disabled={saving}>
              <Save className="w-4 h-4" />
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </ActionBar>
        }
      />

      {/* Contexto de Empresa - SAP-style */}
      {empresaId && companyName && (
        <div className="flex items-center gap-2 px-4 py-2 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-200 dark:border-primary-800">
          <Building2 className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          <span className="text-sm font-medium text-primary-900 dark:text-primary-100">
            Configuración para: {companyName}
          </span>
        </div>
      )}

      {/* Tabs SAP-style */}
      <div className="border-b-2 border-gray-200 dark:border-gray-700">
        <div className="flex gap-1 flex-wrap">
          <TabsTriggerWithValue value="general" activeValue={activeTab} onValueChange={(v) => setActiveTab(v as ConfigTab)} className="flex items-center gap-2 px-4 py-3 rounded-t-lg border border-b-0 border-gray-200 dark:border-gray-700">
            <Sliders className="w-4 h-4" /> General
          </TabsTriggerWithValue>
          <TabsTriggerWithValue value="impuestos" activeValue={activeTab} onValueChange={(v) => setActiveTab(v as ConfigTab)} className="flex items-center gap-2 px-4 py-3 rounded-t-lg border border-b-0 border-gray-200 dark:border-gray-700">
            <FileText className="w-4 h-4" /> Impuestos
          </TabsTriggerWithValue>
          <TabsTriggerWithValue value="periodos" activeValue={activeTab} onValueChange={(v) => setActiveTab(v as ConfigTab)} className="flex items-center gap-2 px-4 py-3 rounded-t-lg border border-b-0 border-gray-200 dark:border-gray-700">
            <Calendar className="w-4 h-4" /> Períodos
          </TabsTriggerWithValue>
          <TabsTriggerWithValue value="avanzado" activeValue={activeTab} onValueChange={(v) => setActiveTab(v as ConfigTab)} className="flex items-center gap-2 px-4 py-3 rounded-t-lg border border-b-0 border-gray-200 dark:border-gray-700">
            <Lock className="w-4 h-4" /> Avanzado
          </TabsTriggerWithValue>
        </div>
      </div>

      {/* Tab: General */}
      <TabsContentWithValue value="general" activeValue={activeTab} className="space-y-6">
      {/* Formato Numérico */}
      <Card>
        <CardHeader
          title="Formato Numérico"
          icon={<Settings2 className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
        />
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Separador de Miles
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                value={settings.number_thousand_separator}
                onChange={(e) => setSettings({ ...settings, number_thousand_separator: e.target.value })}
              >
                <option value=",">Coma (,)</option>
                <option value=".">Punto (.)</option>
                <option value=" ">Espacio ( )</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Separador Decimal
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                value={settings.number_decimal_separator}
                onChange={(e) => setSettings({ ...settings, number_decimal_separator: e.target.value })}
              >
                <option value=".">Punto (.)</option>
                <option value=",">Coma (,)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Decimales
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                value={settings.number_decimal_places}
                onChange={(e) => setSettings({ ...settings, number_decimal_places: parseInt(e.target.value) })}
              >
                <option value="0">0 decimales</option>
                <option value="2">2 decimales</option>
                <option value="3">3 decimales</option>
                <option value="4">4 decimales</option>
              </select>
            </div>
          </div>
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Ejemplo:</strong> El número 1234567.89 se mostrará como{' '}
              <span className="font-mono font-semibold">
                {(() => {
                  const num = 1234567.89
                  const format = {
                    thousand: settings.number_thousand_separator,
                    decimal: settings.number_decimal_separator,
                    decimals: settings.number_decimal_places
                  }
                  const rounded = Math.round(num * Math.pow(10, format.decimals)) / Math.pow(10, format.decimals)
                  const parts = rounded.toString().split('.')
                  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, format.thousand)
                  const decPart = (parts[1] || '').padEnd(format.decimals, '0').substring(0, format.decimals)
                  return format.decimals > 0 
                    ? `${intPart}${format.decimal}${decPart}`
                    : intPart
                })()}
              </span>
            </p>
          </div>
        </div>
      </Card>

      {/* Moneda */}
      <Card>
        <CardHeader
          title="Moneda"
          icon={<DollarSign className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
        />
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Código de Moneda (ISO)
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent uppercase"
                value={settings.currency_code}
                onChange={(e) => setSettings({ ...settings, currency_code: e.target.value.toUpperCase().slice(0, 3) })}
                placeholder="PEN"
                maxLength={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Símbolo de Moneda
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                value={settings.currency_symbol}
                onChange={(e) => setSettings({ ...settings, currency_symbol: e.target.value.slice(0, 5) })}
                placeholder="S/"
                maxLength={5}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Formato de Fecha */}
      <Card>
        <CardHeader
          title="Formato de Fecha"
          icon={<Calendar className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
        />
        <div className="p-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Formato
            </label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              value={settings.date_format}
              onChange={(e) => setSettings({ ...settings, date_format: e.target.value })}
            >
              <option value="DD/MM/YYYY">DD/MM/YYYY (ej: 15/03/2025)</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY (ej: 03/15/2025)</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD (ej: 2025-03-15)</option>
            </select>
          </div>
        </div>
      </Card>
      </TabsContentWithValue>

      {/* Tab: Impuestos */}
      <TabsContentWithValue value="impuestos" activeValue={activeTab} className="space-y-6">
      <Card>
        <CardHeader
          title="Impuestos"
          icon={<FileText className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
        />
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tasa de IGV por Defecto (%)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              className="w-full md:w-48 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              value={settings.default_igv_rate}
              onChange={(e) => setSettings({ ...settings, default_igv_rate: parseFloat(e.target.value) || 0 })}
            />
          </div>
        </div>
      </Card>
      </TabsContentWithValue>

      {/* Tab: Períodos */}
      <TabsContentWithValue value="periodos" activeValue={activeTab} className="space-y-6">
      <Card>
        <CardHeader
          title="Períodos Contables"
          icon={<Calendar className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
        />
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Mes de Inicio del Año Fiscal
            </label>
            <select
              className="w-full md:w-48 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              value={settings.fiscal_year_start_month}
              onChange={(e) => setSettings({ ...settings, fiscal_year_start_month: parseInt(e.target.value) })}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {new Date(2025, i, 1).toLocaleDateString('es-PE', { month: 'long' })}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>
      </TabsContentWithValue>

      {/* Tab: Avanzado */}
      <TabsContentWithValue value="avanzado" activeValue={activeTab} className="space-y-6">
      <Card>
        <CardHeader
          title="Opciones Avanzadas"
          icon={<Lock className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
        />
        <div className="p-6 space-y-4">
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                checked={settings.allow_edit_closed_periods}
                onChange={(e) => setSettings({ ...settings, allow_edit_closed_periods: e.target.checked })}
              />
              <div>
                <div className="font-medium text-gray-900">Permitir Editar Períodos Cerrados</div>
                <div className="text-sm text-gray-500">Permite modificar registros en períodos que ya han sido cerrados</div>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                checked={settings.auto_generate_journal_entries}
                onChange={(e) => setSettings({ ...settings, auto_generate_journal_entries: e.target.checked })}
              />
              <div>
                <div className="font-medium text-gray-900">Auto-generar Asientos desde Compras/Ventas</div>
                <div className="text-sm text-gray-500">Crea automáticamente asientos contables al registrar compras o ventas</div>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                checked={settings.require_period_validation}
                onChange={(e) => setSettings({ ...settings, require_period_validation: e.target.checked })}
              />
              <div>
                <div className="font-medium text-gray-900">Validar Fechas Dentro del Período</div>
                <div className="text-sm text-gray-500">Exige que las fechas de documentos estén dentro del período contable actual</div>
              </div>
            </label>
          </div>
        </div>
      </Card>
      </TabsContentWithValue>

      {/* Botones de Acción */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={loadConfig}>
          <RefreshCw className="w-4 h-4" />
          Restaurar
        </Button>
        <Button onClick={save} disabled={saving}>
          <Save className="w-4 h-4" />
          {saving ? 'Guardando...' : 'Guardar Configuración'}
        </Button>
      </div>

      {/* Message Modal */}
      {messageModal && (
        <MessageModal
          type={messageModal.type}
          title={messageModal.title}
          message={messageModal.message}
          isOpen={!!messageModal}
          onClose={() => setMessageModal(null)}
        />
      )}
    </div>
  )
}

