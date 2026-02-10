import React, { useState } from 'react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { ActionBar } from '@/components/ui/ActionBar'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { MessageModal } from '@/components/ui/MessageModal'
import { CheckCircle, XCircle, AlertTriangle, RefreshCw, Calculator, TrendingUp, TrendingDown, FileCheck, X, ClipboardCheck, Calendar, FileText, BookOpen, Receipt, Wallet, BarChart3, FileSpreadsheet } from 'lucide-react'
import { listCompanies, listPeriods } from '@/api'
import { useOrg } from '@/stores/org'
import { useAuth } from '@/stores/auth'
import type { Company } from '@/api'

interface ValidationResult {
  partida_doble_asientos: Array<{
    entry_id: number
    date: string
    glosa: string
    debit: number
    credit: number
    difference: number
    balanced: boolean
  }>
  balance_comprobacion: {
    total_debit: number
    total_credit: number
    difference: number
    is_balanced: boolean
  }
  saldo_caja_bancos: number
  saldo_clientes: number
  saldo_proveedores: number
  igv_por_pagar: number
  total_debe_periodo: number
  total_haber_periodo: number
  compras_con_asiento: number
  ventas_con_asiento: number
  validaciones_peruanas: {
    igv_compras: Array<{
      compra_id: number
      doc: string
      base: number
      igv_calculado: number
      igv_registrado: number
      diferencia: number
    }>
    igv_ventas: Array<{
      venta_id: number
      doc: string
      base: number
      igv_calculado: number
      igv_registrado: number
      diferencia: number
    }>
    comprobantes_sunat: {
      compras_duplicadas: number
      ventas_duplicadas: number
    }
    ruc_terceros: Array<{
      tercero_id: number
      tipo: string
      nombre: string
      ruc: string
      error: string
    }>
    fechas_periodo: Array<{
      tipo: string
      id: number
      fecha: string
      periodo: string
    }>
    periodos_cerrados: Array<{
      periodo: string
      asientos_despues_cierre: number
    }>
    saldos_negativos: Array<{
      cuenta: string
      nombre: string
      saldo: number
    }>
    correlatividad_comprobantes: Array<{
      tipo: string
      serie: string
      saltos: string[]
    }>
  }
  errors: string[]
  warnings: string[]
  summary: {
    total_entries_checked: number
    balanced_entries: number
    unbalanced_entries: number
    total_errors: number
    total_warnings: number
    is_valid: boolean
  }
}

async function validateAccountingData(company_id: number, period_id?: number): Promise<ValidationResult> {
  const params = new URLSearchParams()
  params.set('company_id', String(company_id))
  if (period_id) params.set('period_id', String(period_id))
  
  const apiBase = (import.meta as any).env?.VITE_API_BASE || '/api'
  const response = await fetch(`${apiBase}/setup/validate-data?${params}`, {
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('siscont_token')}`,
    },
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Error al validar datos')
  }
  
  return response.json()
}

interface ChecklistItem {
  id: string
  category: string
  title: string
  description: string
  items: Array<{
    id: string
    label: string
    required: boolean
  }>
}

export default function ValidacionDatos() {
  const { empresaId } = useOrg()
  const { user } = useAuth()
  const [companies, setCompanies] = useState<Company[]>([])
  const [periods, setPeriods] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [selectedCompany, setSelectedCompany] = useState(empresaId)
  const [selectedPeriod, setSelectedPeriod] = useState<number | undefined>(undefined)
  const [showGuideModal, setShowGuideModal] = useState(false)
  const [checklistData, setChecklistData] = useState<Record<string, Record<string, boolean>>>({})
  const [activeTab, setActiveTab] = useState<'checklist' | 'validation'>('validation')
  
  // Checklist de procesos contables peruanos
  const accountingChecklist: ChecklistItem[] = [
    {
      id: 'registro-operaciones',
      category: 'Registro de Operaciones',
      title: 'Registro de Operaciones del Período',
      description: 'Registrar todas las operaciones contables del mes o año',
      items: [
        { id: 'compras', label: 'Registrar todas las compras con comprobantes de pago', required: true },
        { id: 'ventas', label: 'Registrar todas las ventas con comprobantes de pago', required: true },
        { id: 'gastos', label: 'Registrar gastos operativos y administrativos', required: true },
        { id: 'ingresos', label: 'Registrar ingresos operativos y no operativos', required: true },
        { id: 'cobranzas', label: 'Registrar cobranzas de clientes', required: true },
        { id: 'pagos', label: 'Registrar pagos a proveedores', required: true },
        { id: 'nomina', label: 'Registrar planilla y obligaciones laborales (si aplica)', required: false },
        { id: 'otros', label: 'Registrar otras operaciones del período', required: true },
      ]
    },
    {
      id: 'comprobantes',
      category: 'Comprobantes de Pago',
      title: 'Validación de Comprobantes SUNAT',
      description: 'Verificar que todos los comprobantes cumplan con la normativa SUNAT',
      items: [
        { id: 'numeracion', label: 'Verificar numeración correlativa de comprobantes', required: true },
        { id: 'serie', label: 'Validar series autorizadas por SUNAT', required: true },
        { id: 'fechas', label: 'Verificar fechas de emisión dentro del período', required: true },
        { id: 'ruc', label: 'Validar RUC de clientes y proveedores', required: true },
        { id: 'duplicados', label: 'Detectar comprobantes duplicados', required: true },
        { id: 'formato', label: 'Verificar formato de comprobantes (factura, boleta, etc.)', required: true },
      ]
    },
    {
      id: 'igv-impuestos',
      category: 'IGV e Impuestos',
      title: 'Cálculo y Registro de IGV',
      description: 'Asegurar el correcto cálculo y registro del IGV y otros impuestos',
      items: [
        { id: 'igv-compras', label: 'Calcular IGV de compras (18% sobre base imponible)', required: true },
        { id: 'igv-ventas', label: 'Calcular IGV de ventas (18% sobre base imponible)', required: true },
        { id: 'igv-cuenta', label: 'Registrar IGV en cuenta 40.11 (IGV por Pagar)', required: true },
        { id: 'detracciones', label: 'Registrar detracciones (si aplica)', required: false },
        { id: 'retenciones', label: 'Registrar retenciones de IGV (si aplica)', required: false },
        { id: 'igv-exportaciones', label: 'Tratamiento especial de IGV en exportaciones (si aplica)', required: false },
      ]
    },
    {
      id: 'ajustes',
      category: 'Ajustes Contables',
      title: 'Ajustes y Provisiones',
      description: 'Realizar ajustes necesarios al cierre del período',
      items: [
        { id: 'depreciacion', label: 'Registrar depreciación de activos fijos', required: true },
        { id: 'amortizacion', label: 'Registrar amortización de intangibles (si aplica)', required: false },
        { id: 'provisiones', label: 'Registrar provisiones (cuentas incobrables, garantías, etc.)', required: true },
        { id: 'devengados', label: 'Registrar gastos devengados no pagados', required: true },
        { id: 'diferidos', label: 'Ajustar ingresos y gastos diferidos', required: true },
        { id: 'inventario', label: 'Ajustar inventario físico vs contable (si aplica)', required: false },
      ]
    },
    {
      id: 'conciliaciones',
      category: 'Conciliaciones',
      title: 'Conciliaciones Bancarias y de Cuentas',
      description: 'Realizar conciliaciones para verificar saldos',
      items: [
        { id: 'bancaria', label: 'Conciliación bancaria (cuentas corrientes)', required: true },
        { id: 'clientes', label: 'Conciliar saldos de clientes (cuentas por cobrar)', required: true },
        { id: 'proveedores', label: 'Conciliar saldos de proveedores (cuentas por pagar)', required: true },
        { id: 'igv-conciliacion', label: 'Conciliar IGV compras vs IGV ventas', required: true },
        { id: 'caja', label: 'Conciliar caja chica y arqueos', required: true },
      ]
    },
    {
      id: 'balance',
      category: 'Balance y Estados Financieros',
      title: 'Balance de Comprobación y Estados Financieros',
      description: 'Generar y verificar estados financieros',
      items: [
        { id: 'partida-doble', label: 'Verificar partida doble (Total Debe = Total Haber)', required: true },
        { id: 'balance-comprobacion', label: 'Generar balance de comprobación', required: true },
        { id: 'estado-resultados', label: 'Generar estado de resultados (ganancias y pérdidas)', required: true },
        { id: 'balance-general', label: 'Generar balance general', required: true },
        { id: 'cuadrar-saldos', label: 'Verificar que los saldos de cuentas sean coherentes', required: true },
      ]
    },
    {
      id: 'libros-contables',
      category: 'Libros Contables',
      title: 'Libros Contables Obligatorios',
      description: 'Mantener actualizados los libros contables según normativa peruana',
      items: [
        { id: 'libro-diario', label: 'Actualizar libro diario con todos los asientos', required: true },
        { id: 'libro-mayor', label: 'Actualizar libro mayor (cuentas)', required: true },
        { id: 'libro-inventario', label: 'Actualizar libro de inventario y balances (anual)', required: true },
        { id: 'libro-caja', label: 'Actualizar libro de caja y bancos', required: true },
      ]
    },
    {
      id: 'ple',
      category: 'PLE - Libros Electrónicos',
      title: 'Libros Electrónicos SUNAT (PLE)',
      description: 'Generar y validar los libros electrónicos para SUNAT',
      items: [
        { id: 'ple-compras', label: 'Generar libro electrónico de compras', required: true },
        { id: 'ple-ventas', label: 'Generar libro electrónico de ventas', required: true },
        { id: 'ple-diario', label: 'Generar libro electrónico diario', required: true },
        { id: 'ple-mayor', label: 'Generar libro electrónico mayor', required: true },
        { id: 'validar-ple', label: 'Validar formato y estructura del PLE', required: true },
        { id: 'declarar-ple', label: 'Declarar PLE en SUNAT (mensual)', required: true },
      ]
    },
    {
      id: 'cierre',
      category: 'Cierre de Período',
      title: 'Cierre Contable del Mes/Año',
      description: 'Proceso de cierre contable según normativa peruana',
      items: [
        { id: 'ajustes-cierre', label: 'Realizar todos los ajustes antes del cierre', required: true },
        { id: 'cerrar-periodo', label: 'Cerrar período contable en el sistema', required: true },
        { id: 'revision-final', label: 'Revisión final de estados financieros', required: true },
        { id: 'certificacion', label: 'Certificación contable (si aplica)', required: false },
        { id: 'auditoria', label: 'Preparación para auditoría (si aplica)', required: false },
      ]
    },
    {
      id: 'declaraciones',
      category: 'Declaraciones y Obligaciones',
      title: 'Declaraciones Tributarias',
      description: 'Cumplir con las obligaciones tributarias mensuales/anuales',
      items: [
        { id: 'pdt-mensual', label: 'Presentar PDT 621 - Pago Mensual IGV (mensual)', required: true },
        { id: 'pdt-renta', label: 'Presentar PDT 621 - Renta (mensual/anual según régimen)', required: true },
        { id: 'detracciones-declara', label: 'Declarar detracciones (si aplica)', required: false },
        { id: 'retenciones-declara', label: 'Declarar retenciones (si aplica)', required: false },
        { id: 'declaracion-anual', label: 'Declaración anual de renta (si aplica)', required: false },
      ]
    }
  ]

  // Función para toggle de checklist
  const toggleChecklistItem = (categoryId: string, itemId: string) => {
    setChecklistData(prev => ({
      ...prev,
      [categoryId]: {
        ...prev[categoryId],
        [itemId]: !prev[categoryId]?.[itemId]
      }
    }))
  }

  // Función para validar automáticamente el checklist basándose en los datos
  const autoValidateChecklist = (validationResult: ValidationResult | null) => {
    if (!validationResult) {
      return {}
    }

    const autoChecked: Record<string, Record<string, boolean>> = {}

    // 1. Registro de Operaciones
    autoChecked['registro-operaciones'] = {
      'compras': validationResult.compras_con_asiento > 0,
      'ventas': validationResult.ventas_con_asiento > 0,
      'gastos': validationResult.total_debe_periodo > 0, // Si hay debe, hay operaciones registradas
      'ingresos': validationResult.total_haber_periodo > 0, // Si hay haber, hay operaciones registradas
      'cobranzas': validationResult.saldo_clientes !== 0 || validationResult.compras_con_asiento > 0,
      'pagos': validationResult.saldo_proveedores !== 0 || validationResult.compras_con_asiento > 0,
      'nomina': false, // No hay validación específica en el resultado
      'otros': validationResult.summary.total_entries_checked > 0,
    }

    // 2. Comprobantes de Pago
    const comprobantesOk = 
      validationResult.validaciones_peruanas.comprobantes_sunat.compras_duplicadas === 0 &&
      validationResult.validaciones_peruanas.comprobantes_sunat.ventas_duplicadas === 0 &&
      validationResult.validaciones_peruanas.correlatividad_comprobantes.length === 0
    
    autoChecked['comprobantes'] = {
      'numeracion': comprobantesOk && validationResult.compras_con_asiento > 0,
      'serie': comprobantesOk,
      'fechas': validationResult.validaciones_peruanas.fechas_periodo.length === 0,
      'ruc': validationResult.validaciones_peruanas.ruc_terceros.length === 0,
      'duplicados': comprobantesOk,
      'formato': validationResult.compras_con_asiento > 0 || validationResult.ventas_con_asiento > 0,
    }

    // 3. IGV e Impuestos
    const igvComprasOk = validationResult.validaciones_peruanas.igv_compras.length === 0
    const igvVentasOk = validationResult.validaciones_peruanas.igv_ventas.length === 0
    const igvRegistrado = validationResult.igv_por_pagar !== 0
    
    autoChecked['igv-impuestos'] = {
      'igv-compras': igvComprasOk && validationResult.compras_con_asiento > 0,
      'igv-ventas': igvVentasOk && validationResult.ventas_con_asiento > 0,
      'igv-cuenta': igvRegistrado,
      'detracciones': false, // No hay validación específica
      'retenciones': false, // No hay validación específica
      'igv-exportaciones': false, // No hay validación específica
    }

    // 4. Ajustes Contables
    // Si hay asientos y están balanceados, probablemente hay ajustes
    const tieneAjustes = validationResult.summary.total_entries_checked > 0 && 
                         validationResult.summary.balanced_entries > 0
    
    autoChecked['ajustes'] = {
      'depreciacion': false, // Necesitaría validación específica por cuenta
      'amortizacion': false,
      'provisiones': false,
      'devengados': tieneAjustes,
      'diferidos': tieneAjustes,
      'inventario': false,
    }

    // 5. Conciliaciones
    // Asumimos que si hay saldos, hay conciliaciones (simplificado)
    autoChecked['conciliaciones'] = {
      'bancaria': validationResult.saldo_caja_bancos !== 0,
      'clientes': validationResult.saldo_clientes !== 0,
      'proveedores': validationResult.saldo_proveedores !== 0,
      'igv-conciliacion': igvComprasOk && igvVentasOk,
      'caja': validationResult.saldo_caja_bancos !== 0,
    }

    // 6. Balance y Estados Financieros
    autoChecked['balance'] = {
      'partida-doble': validationResult.balance_comprobacion.is_balanced &&
                       validationResult.summary.unbalanced_entries === 0,
      'balance-comprobacion': validationResult.balance_comprobacion.is_balanced,
      'estado-resultados': validationResult.summary.total_entries_checked > 0 && 
                          validationResult.balance_comprobacion.is_balanced,
      'balance-general': validationResult.summary.total_entries_checked > 0 && 
                        validationResult.balance_comprobacion.is_balanced,
      'cuadrar-saldos': validationResult.balance_comprobacion.is_balanced &&
                       validationResult.validaciones_peruanas.saldos_negativos.length === 0,
    }

    // 7. Libros Contables
    // Si hay asientos y están balanceados, los libros están actualizados
    const librosOk = validationResult.summary.total_entries_checked > 0
    
    autoChecked['libros-contables'] = {
      'libro-diario': librosOk,
      'libro-mayor': librosOk,
      'libro-inventario': false, // Es anual, no mensual
      'libro-caja': validationResult.saldo_caja_bancos !== 0 || librosOk,
    }

    // 8. PLE - Libros Electrónicos
    // Si hay compras/ventas y IGV correcto, se puede generar PLE
    const pleGenerable = (validationResult.compras_con_asiento > 0 || validationResult.ventas_con_asiento > 0) &&
                        igvComprasOk && igvVentasOk
    
    autoChecked['ple'] = {
      'ple-compras': validationResult.compras_con_asiento > 0 && igvComprasOk,
      'ple-ventas': validationResult.ventas_con_asiento > 0 && igvVentasOk,
      'ple-diario': librosOk && validationResult.balance_comprobacion.is_balanced,
      'ple-mayor': librosOk && validationResult.balance_comprobacion.is_balanced,
      'validar-ple': pleGenerable,
      'declarar-ple': false, // No se puede validar automáticamente si fue declarado
    }

    // 9. Cierre de Período
    const sinErrores = validationResult.summary.is_valid && 
                      validationResult.summary.total_errors === 0
    const periodosOk = validationResult.validaciones_peruanas.periodos_cerrados.length === 0
    
    autoChecked['cierre'] = {
      'ajustes-cierre': sinErrores && validationResult.balance_comprobacion.is_balanced,
      'cerrar-periodo': periodosOk && sinErrores,
      'revision-final': sinErrores && validationResult.balance_comprobacion.is_balanced,
      'certificacion': false, // No se puede validar automáticamente
      'auditoria': false, // No se puede validar automáticamente
    }

    // 10. Declaraciones y Obligaciones
    // No se puede validar automáticamente si fueron presentadas
    autoChecked['declaraciones'] = {
      'pdt-mensual': false,
      'pdt-renta': false,
      'detracciones-declara': false,
      'retenciones-declara': false,
      'declaracion-anual': false,
    }

    return autoChecked
  }

  // Efecto para actualizar automáticamente el checklist cuando hay resultados de validación
  React.useEffect(() => {
    if (validation) {
      const autoChecked = autoValidateChecklist(validation)
      setChecklistData(autoChecked)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validation])

  // Calcular progreso
  const calculateProgress = (category: ChecklistItem) => {
    const items = category.items
    const completed = items.filter(item => checklistData[category.id]?.[item.id]).length
    const required = items.filter(item => item.required).length
    const requiredCompleted = items.filter(item => item.required && checklistData[category.id]?.[item.id]).length
    return {
      total: items.length,
      completed,
      required,
      requiredCompleted,
      percentage: items.length > 0 ? Math.round((completed / items.length) * 100) : 0,
      requiredPercentage: required > 0 ? Math.round((requiredCompleted / required) * 100) : 0
    }
  }
  
  React.useEffect(() => {
    loadCompanies()
    if (selectedCompany) {
      loadPeriods(selectedCompany)
    }
  }, [selectedCompany])
  
  async function loadCompanies() {
    try {
      const data = await listCompanies()
      setCompanies(Array.isArray(data) ? data : (data.items || []))
    } catch (err: any) {
      console.error('Error cargando empresas:', err)
    }
  }
  
  async function loadPeriods(companyId: number) {
    try {
      const data = await listPeriods(companyId)
      setPeriods(data)
    } catch (err: any) {
      console.error('Error cargando períodos:', err)
    }
  }
  
  async function handleValidate() {
    if (!selectedCompany) return
    
    setLoading(true)
    setValidation(null)
    try {
      const result = await validateAccountingData(selectedCompany, selectedPeriod)
      setValidation(result)
    } catch (err: any) {
      alert(`Error: ${err.message || err}`)
    } finally {
      setLoading(false)
    }
  }
  
  // Solo administradores y contadores pueden ver esta página
  if (user?.role !== 'ADMINISTRADOR' && user?.role !== 'CONTADOR') {
    return (
      <div className="space-y-6 animate-fade-in">
        <Card>
          <div className="p-6 text-center">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Acceso Restringido</h2>
            <p className="text-gray-600 dark:text-gray-400">Solo los administradores y contadores pueden acceder a esta sección.</p>
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
        title="Validación de Datos Contables"
        subtitle="Verifica la integridad y corrección de los datos contables"
        icon={FileCheck}
        iconColor="primary"
        actions={
          <ActionBar
            onRefresh={handleValidate}
            loading={loading}
            refreshDisabled={!selectedCompany}
          />
        }
      />
      
      {/* Configuración */}
      <Card>
        <CardHeader 
          title="Configuración de Validación"
          icon={<FileCheck className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
          actions={
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowGuideModal(true)}
              className="text-primary-600 border-primary-300 hover:bg-primary-50"
            >
              📚 Ver Guía de Validación
            </Button>
          }
        />
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Empresa</label>
              <select
                value={selectedCompany}
                onChange={e => {
                  setSelectedCompany(Number(e.target.value))
                  setSelectedPeriod(undefined)
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
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Período (Opcional)</label>
              <select
                value={selectedPeriod || ''}
                onChange={e => setSelectedPeriod(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                <option value="">Todos los períodos</option>
                {periods.map(p => (
                  <option key={p.id} value={p.id}>{p.year}-{String(p.month).padStart(2, '0')}</option>
                ))}
              </select>
            </div>
          </div>
          
          <Button
            onClick={handleValidate}
            disabled={loading || !selectedCompany}
            className="w-full bg-primary-600 hover:bg-primary-700 text-white"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Validando...
              </>
            ) : (
              <>
                <FileCheck className="w-4 h-4" />
                Validar Datos Contables
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Pestañas */}
      <Card>
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex -mb-px">
            <button
              onClick={() => setActiveTab('validation')}
              className={`
                flex-1 px-6 py-4 text-center font-medium text-sm transition-colors border-b-2
                ${activeTab === 'validation'
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400 dark:border-primary-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }
              `}
            >
              <div className="flex items-center justify-center gap-2">
                <FileCheck className="w-5 h-5" />
                <span>Validación de Datos</span>
                {validation && (
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                    validation.summary.is_valid
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                      : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                  }`}>
                    {validation.summary.total_errors > 0 ? validation.summary.total_errors + ' errores' : 'Válido'}
                  </span>
                )}
              </div>
            </button>
            <button
              onClick={() => setActiveTab('checklist')}
              className={`
                flex-1 px-6 py-4 text-center font-medium text-sm transition-colors border-b-2
                ${activeTab === 'checklist'
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400 dark:border-primary-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }
              `}
            >
              <div className="flex items-center justify-center gap-2">
                <ClipboardCheck className="w-5 h-5" />
                <span>Checklist de Procesos</span>
                {(() => {
                  const totalItems = accountingChecklist.reduce((sum, cat) => sum + cat.items.length, 0)
                  const totalRequired = accountingChecklist.reduce((sum, cat) => sum + cat.items.filter(i => i.required).length, 0)
                  const totalCompleted = accountingChecklist.reduce((sum, cat) => {
                    return sum + cat.items.filter(item => checklistData[cat.id]?.[item.id]).length
                  }, 0)
                  const requiredCompleted = accountingChecklist.reduce((sum, cat) => {
                    return sum + cat.items.filter(item => item.required && checklistData[cat.id]?.[item.id]).length
                  }, 0)
                  const percentage = totalItems > 0 ? Math.round((totalCompleted / totalItems) * 100) : 0
                  return (
                    <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                      {requiredCompleted}/{totalRequired} obligatorios ({percentage}%)
                    </span>
                  )
                })()}
              </div>
            </button>
          </nav>
        </div>

        <div className="p-6">
          {/* Contenido de Validación */}
          {activeTab === 'validation' && (
            <div className="space-y-6">
              {validation ? (
                <>
                  {/* Resumen General */}
                  <Card>
                    <CardHeader title="Resumen de Validación" />
                    <div className="p-6">
                      <div className={`rounded-xl p-4 mb-4 border-2 ${
                        validation.summary.is_valid
                          ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
                          : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
                      }`}>
                        <div className="flex items-center gap-3">
                          {validation.summary.is_valid ? (
                            <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                          ) : (
                            <XCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                          )}
                          <div>
                            <div className={`font-bold ${
                              validation.summary.is_valid
                                ? 'text-green-900 dark:text-green-100'
                                : 'text-red-900 dark:text-red-100'
                            }`}>
                              {validation.summary.is_valid 
                                ? '✓ Datos Contables Válidos' 
                                : '✗ Datos Contables con Errores'}
                            </div>
                            <div className={`text-sm ${
                              validation.summary.is_valid
                                ? 'text-green-700 dark:text-green-300'
                                : 'text-red-700 dark:text-red-300'
                            }`}>
                              {validation.summary.total_errors} error(es), {validation.summary.total_warnings} advertencia(s)
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{validation.summary.total_entries_checked}</div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">Asientos Verificados</div>
                        </div>
                        <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                          <div className="text-2xl font-bold text-green-700 dark:text-green-300">{validation.summary.balanced_entries}</div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">Asientos Balanceados</div>
                        </div>
                        <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                          <div className="text-2xl font-bold text-red-700 dark:text-red-300">{validation.summary.unbalanced_entries}</div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">Asientos Desbalanceados</div>
                        </div>
                        <div className="text-center p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                          <div className="text-2xl font-bold text-amber-700 dark:text-amber-300">{validation.summary.total_warnings}</div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">Advertencias</div>
                        </div>
                      </div>
                    </div>
                  </Card>
                  
                  {/* Balance de Comprobación */}
                  <Card>
                    <CardHeader title="Balance de Comprobación" />
                    <div className="p-6">
                      <div className={`rounded-xl p-4 mb-4 border-2 ${
                        validation.balance_comprobacion.is_balanced
                          ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
                          : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-bold text-gray-900 dark:text-gray-100 mb-2">Partida Doble (Principio Fundamental)</div>
                            <div className="text-sm text-gray-700 dark:text-gray-300">
                              Total Debe debe ser igual a Total Haber
                            </div>
                          </div>
                          {validation.balance_comprobacion.is_balanced ? (
                            <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
                          ) : (
                            <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
                          )}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Debe</div>
                          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                            S/ {validation.balance_comprobacion.total_debit.toFixed(2)}
                          </div>
                        </div>
                        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Haber</div>
                          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                            S/ {validation.balance_comprobacion.total_credit.toFixed(2)}
                          </div>
                        </div>
                        <div className={`p-4 rounded-lg ${
                          validation.balance_comprobacion.difference < 0.01
                            ? 'bg-green-50 dark:bg-green-900/20'
                            : 'bg-red-50 dark:bg-red-900/20'
                        }`}>
                          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Diferencia</div>
                          <div className={`text-2xl font-bold ${
                            validation.balance_comprobacion.difference < 0.01
                              ? 'text-green-700 dark:text-green-300'
                              : 'text-red-700 dark:text-red-300'
                          }`}>
                            S/ {validation.balance_comprobacion.difference.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                  
                  {/* Saldos Principales */}
                  <Card>
                    <CardHeader title="Saldos de Cuentas Principales" />
                    <div className="p-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                          <div className="flex items-center gap-2 mb-2">
                            <TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            <div className="text-sm font-medium text-blue-900 dark:text-blue-100">Caja y Bancos</div>
                          </div>
                          <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                            S/ {validation.saldo_caja_bancos.toFixed(2)}
                          </div>
                          <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">Cuentas 10.x (Activo)</div>
                          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Fórmula: Suma(Debe) - Suma(Haber)</div>
                        </div>
                        
                        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                          <div className="flex items-center gap-2 mb-2">
                            <TrendingUp className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                            <div className="text-sm font-medium text-purple-900 dark:text-purple-100">Clientes</div>
                          </div>
                          <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                            S/ {validation.saldo_clientes.toFixed(2)}
                          </div>
                          <div className="text-xs text-purple-600 dark:text-purple-400 mt-1">Cuentas 12.x (Activo)</div>
                          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Fórmula: Suma(Debe) - Suma(Haber)</div>
                        </div>
                        
                        <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                          <div className="flex items-center gap-2 mb-2">
                            <TrendingDown className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                            <div className="text-sm font-medium text-orange-900 dark:text-orange-100">Proveedores</div>
                          </div>
                          <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                            S/ {validation.saldo_proveedores.toFixed(2)}
                          </div>
                          <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">Cuentas 42.x (Pasivo)</div>
                          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Fórmula: Suma(Haber) - Suma(Debe)</div>
                        </div>
                        
                        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                          <div className="flex items-center gap-2 mb-2">
                            <Calculator className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                            <div className="text-sm font-medium text-amber-900 dark:text-amber-100">IGV por Pagar</div>
                          </div>
                          <div className="text-2xl font-bold text-amber-700 dark:text-amber-300">
                            S/ {validation.igv_por_pagar.toFixed(2)}
                          </div>
                          <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">Cuenta 40.11 (Pasivo)</div>
                          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Fórmula: Suma(Haber) - Suma(Debe)</div>
                        </div>
                      </div>
                    </div>
                  </Card>
                  
                  {/* Errores y Advertencias */}
                  {(validation.errors.length > 0 || validation.warnings.length > 0) && (
                    <Card>
                      <CardHeader title="Errores y Advertencias" />
                      <div className="p-6 space-y-4">
                        {validation.errors.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-2 text-red-700 dark:text-red-400 font-semibold">
                              <XCircle className="w-5 h-5" />
                              Errores ({validation.errors.length})
                            </div>
                            <div className="space-y-1">
                              {validation.errors.map((error, idx) => (
                                <div key={idx} className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-800 dark:text-red-200">
                                  {error}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {validation.warnings.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-2 text-amber-700 dark:text-amber-400 font-semibold">
                              <AlertTriangle className="w-5 h-5" />
                              Advertencias ({validation.warnings.length})
                            </div>
                            <div className="space-y-1">
                              {validation.warnings.map((warning, idx) => (
                                <div key={idx} className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-800 dark:text-amber-200">
                                  {warning}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </Card>
                  )}
                  
                  {/* Validaciones Específicas Peruanas */}
                  {(validation.validaciones_peruanas.igv_compras.length > 0 ||
                    validation.validaciones_peruanas.igv_ventas.length > 0 ||
                    validation.validaciones_peruanas.comprobantes_sunat.compras_duplicadas > 0 ||
                    validation.validaciones_peruanas.comprobantes_sunat.ventas_duplicadas > 0 ||
                    validation.validaciones_peruanas.ruc_terceros.length > 0 ||
                    validation.validaciones_peruanas.fechas_periodo.length > 0 ||
                    validation.validaciones_peruanas.periodos_cerrados.length > 0 ||
                    validation.validaciones_peruanas.saldos_negativos.length > 0 ||
                    validation.validaciones_peruanas.correlatividad_comprobantes.length > 0) && (
                    <Card>
                      <CardHeader title="Validaciones Específicas - Contabilidad Peruana" />
                      <div className="p-6 space-y-6">
                        {/* IGV en Compras */}
                        {validation.validaciones_peruanas.igv_compras.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-3 text-red-700 dark:text-red-400 font-semibold">
                              <XCircle className="w-5 h-5" />
                              IGV Incorrecto en Compras ({validation.validaciones_peruanas.igv_compras.length})
                            </div>
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                              {validation.validaciones_peruanas.igv_compras.map((igv, idx) => (
                                <div key={idx} className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm">
                                  <div className="font-semibold text-red-900 dark:text-red-100 mb-1">
                                    Comprobante: {igv.doc}
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div>Base: S/ {igv.base.toFixed(2)}</div>
                                    <div>IGV Esperado (18%): S/ {igv.igv_calculado.toFixed(2)}</div>
                                    <div>IGV Registrado: S/ {igv.igv_registrado.toFixed(2)}</div>
                                    <div className="text-red-700 dark:text-red-300 font-semibold">
                                      Diferencia: S/ {igv.diferencia.toFixed(2)}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* IGV en Ventas */}
                        {validation.validaciones_peruanas.igv_ventas.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-3 text-red-700 dark:text-red-400 font-semibold">
                              <XCircle className="w-5 h-5" />
                              IGV Incorrecto en Ventas ({validation.validaciones_peruanas.igv_ventas.length})
                            </div>
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                              {validation.validaciones_peruanas.igv_ventas.map((igv, idx) => (
                                <div key={idx} className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm">
                                  <div className="font-semibold text-red-900 dark:text-red-100 mb-1">
                                    Comprobante: {igv.doc}
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div>Base: S/ {igv.base.toFixed(2)}</div>
                                    <div>IGV Esperado (18%): S/ {igv.igv_calculado.toFixed(2)}</div>
                                    <div>IGV Registrado: S/ {igv.igv_registrado.toFixed(2)}</div>
                                    <div className="text-red-700 dark:text-red-300 font-semibold">
                                      Diferencia: S/ {igv.diferencia.toFixed(2)}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Comprobantes Duplicados */}
                        {(validation.validaciones_peruanas.comprobantes_sunat.compras_duplicadas > 0 || 
                          validation.validaciones_peruanas.comprobantes_sunat.ventas_duplicadas > 0) && (
                          <div>
                            <div className="flex items-center gap-2 mb-3 text-amber-700 dark:text-amber-400 font-semibold">
                              <AlertTriangle className="w-5 h-5" />
                              Comprobantes Duplicados
                            </div>
                            <div className="text-sm text-gray-700 dark:text-gray-300">
                              <div>Compras duplicadas: {validation.validaciones_peruanas.comprobantes_sunat.compras_duplicadas}</div>
                              <div>Ventas duplicadas: {validation.validaciones_peruanas.comprobantes_sunat.ventas_duplicadas}</div>
                            </div>
                          </div>
                        )}
                        
                        {/* RUC Inválidos */}
                        {validation.validaciones_peruanas.ruc_terceros.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-3 text-amber-700 dark:text-amber-400 font-semibold">
                              <AlertTriangle className="w-5 h-5" />
                              RUC con Checksum Inválido ({validation.validaciones_peruanas.ruc_terceros.length})
                            </div>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                              {validation.validaciones_peruanas.ruc_terceros.map((ruc, idx) => (
                                <div key={idx} className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm">
                                  <div className="font-semibold text-amber-900 dark:text-amber-100">
                                    {ruc.tipo}: {ruc.nombre}
                                  </div>
                                  <div className="text-xs text-amber-700 dark:text-amber-300">
                                    RUC: {ruc.ruc} - {ruc.error}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Fechas Fuera del Período */}
                        {validation.validaciones_peruanas.fechas_periodo.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-3 text-red-700 dark:text-red-400 font-semibold">
                              <XCircle className="w-5 h-5" />
                              Fechas Fuera del Período ({validation.validaciones_peruanas.fechas_periodo.length})
                            </div>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                              {validation.validaciones_peruanas.fechas_periodo.map((fecha, idx) => (
                                <div key={idx} className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm">
                                  <div className="font-semibold text-red-900 dark:text-red-100">
                                    {fecha.tipo === 'asiento' ? 'Asiento' : 'Documento'} #{fecha.id}
                                  </div>
                                  <div className="text-xs text-red-700 dark:text-red-300">
                                    Fecha: {fecha.fecha} - Período: {fecha.periodo}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Saldos Negativos */}
                        {validation.validaciones_peruanas.saldos_negativos.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-3 text-amber-700 dark:text-amber-400 font-semibold">
                              <AlertTriangle className="w-5 h-5" />
                              Saldos Negativos en Activos ({validation.validaciones_peruanas.saldos_negativos.length})
                            </div>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                              {validation.validaciones_peruanas.saldos_negativos.map((saldo, idx) => (
                                <div key={idx} className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm">
                                  <div className="font-semibold text-amber-900 dark:text-amber-100">
                                    {saldo.cuenta} - {saldo.nombre}
                                  </div>
                                  <div className="text-xs text-amber-700 dark:text-amber-300">
                                    Saldo: S/ {saldo.saldo.toFixed(2)} (negativo)
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Correlatividad */}
                        {validation.validaciones_peruanas.correlatividad_comprobantes.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-3 text-amber-700 dark:text-amber-400 font-semibold">
                              <AlertTriangle className="w-5 h-5" />
                              Saltos en Numeración ({validation.validaciones_peruanas.correlatividad_comprobantes.length})
                            </div>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                              {validation.validaciones_peruanas.correlatividad_comprobantes.map((correl, idx) => (
                                <div key={idx} className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm">
                                  <div className="font-semibold text-amber-900 dark:text-amber-100">
                                    {correl.tipo === 'compra' ? 'Compras' : 'Ventas'} - Serie {correl.serie}
                                  </div>
                                  <div className="text-xs text-amber-700 dark:text-amber-300">
                                    Saltos: {correl.saltos.join(', ')}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </Card>
                  )}
                  
                  {/* Asientos Desbalanceados */}
                  {validation.summary.unbalanced_entries > 0 && (
                    <Card>
                      <CardHeader title={`Asientos Desbalanceados (${validation.summary.unbalanced_entries})`} />
                      <div className="p-6">
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                          {validation.partida_doble_asientos
                            .filter(e => !e.balanced)
                            .map((entry, idx) => (
                              <div key={idx} className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                                <div className="flex items-center justify-between mb-1">
                                  <div className="font-semibold text-red-900 dark:text-red-100">
                                    Asiento #{entry.entry_id} - {entry.date}
                                  </div>
                                  <div className="text-sm text-red-700 dark:text-red-300">
                                    Diferencia: S/ {entry.difference.toFixed(2)}
                                  </div>
                                </div>
                                <div className="text-sm text-gray-700 dark:text-gray-300 mb-1">{entry.glosa}</div>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div>Debe: S/ {entry.debit.toFixed(2)}</div>
                                  <div>Haber: S/ {entry.credit.toFixed(2)}</div>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    </Card>
                  )}
                </>
              ) : (
                <div className="text-center py-12">
                  <FileCheck className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">No hay datos validados</h3>
                  <p className="text-gray-600 dark:text-gray-400">Ejecuta la validación usando el formulario superior para ver los resultados.</p>
                </div>
              )}
            </div>
          )}

          {/* Contenido de Checklist */}
          {activeTab === 'checklist' && (
            <div className="space-y-6">
              {/* Checklist de Procesos Contables Peruanos */}
      <Card>
        <CardHeader 
          title="Checklist de Procesos Contables - Contabilidad Peruana"
          actions={
            <div className="flex gap-2">
              {validation && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    // Revalidar automáticamente desde los resultados
                    const autoChecked = autoValidateChecklist(validation)
                    setChecklistData(autoChecked)
                  }}
                  className="text-green-600 border-green-300 hover:bg-green-50"
                >
                  🔄 Auto-Validar desde Datos
                </Button>
              )}
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  // Resetear todo el checklist
                  setChecklistData({})
                }}
                className="text-gray-600 border-gray-300 hover:bg-gray-50"
              >
                🔄 Limpiar Checklist
              </Button>
            </div>
          }
        />
        <div className="p-6 space-y-6">
          <div className={`rounded-xl p-4 border ${
            validation 
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
              : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
          }`}>
            <p className={`text-sm ${
              validation 
                ? 'text-green-900 dark:text-green-100' 
                : 'text-blue-900 dark:text-blue-100'
            }`}>
              {validation ? (
                <>
                  <strong>✓ Validación Automática Activada:</strong> El checklist se actualiza automáticamente 
                  según los datos registrados. Puedes marcar manualmente items adicionales si es necesario. 
                  Los procesos marcados con <span className="text-red-600 dark:text-red-400 font-semibold">*</span> son obligatorios.
                </>
              ) : (
                <>
                  <strong>Instrucciones:</strong> Ejecuta primero "Validar Datos Contables" para que el checklist 
                  se complete automáticamente basándose en la información registrada. También puedes marcar manualmente 
                  cada proceso. Los procesos marcados con <span className="text-red-600 dark:text-red-400 font-semibold">*</span> son obligatorios.
                </>
              )}
            </p>
          </div>

          {(() => {
            const autoChecked = validation ? autoValidateChecklist(validation) : {}
            return accountingChecklist.map((category) => {
              const progress = calculateProgress(category)
              return (
              <div key={category.id} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <div className="bg-gradient-to-r from-primary-50 to-primary-100 dark:from-primary-900/30 dark:to-primary-800/30 p-4 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-primary-600 rounded-lg text-white">
                          {category.category === 'Registro de Operaciones' && <Receipt className="w-5 h-5" />}
                          {category.category === 'Comprobantes de Pago' && <FileText className="w-5 h-5" />}
                          {category.category === 'IGV e Impuestos' && <Calculator className="w-5 h-5" />}
                          {category.category === 'Ajustes Contables' && <RefreshCw className="w-5 h-5" />}
                          {category.category === 'Conciliaciones' && <Wallet className="w-5 h-5" />}
                          {category.category === 'Balance y Estados Financieros' && <BarChart3 className="w-5 h-5" />}
                          {category.category === 'Libros Contables' && <BookOpen className="w-5 h-5" />}
                          {category.category === 'PLE - Libros Electrónicos' && <FileSpreadsheet className="w-5 h-5" />}
                          {category.category === 'Cierre de Período' && <Calendar className="w-5 h-5" />}
                          {category.category === 'Declaraciones y Obligaciones' && <ClipboardCheck className="w-5 h-5" />}
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-900 dark:text-gray-100">{category.title}</h3>
                          <p className="text-xs text-gray-600 dark:text-gray-400">{category.description}</p>
                        </div>
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">{progress.percentage}%</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        {progress.completed}/{progress.total} completado
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Obligatorios: {progress.requiredCompleted}/{progress.required}
                      </div>
                    </div>
                  </div>
                  
                  {/* Barra de progreso */}
                  <div className="mt-3">
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all ${
                          progress.requiredPercentage === 100 
                            ? 'bg-green-500' 
                            : progress.requiredPercentage >= 50 
                            ? 'bg-yellow-500' 
                            : 'bg-red-500'
                        }`}
                        style={{ width: `${progress.percentage}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="p-4 space-y-2 bg-white dark:bg-gray-800">
                  {category.items.map((item) => {
                    const isChecked = checklistData[category.id]?.[item.id] || false
                    const isAutoValidated = autoChecked[category.id]?.[item.id] || false
                    return (
                      <label
                        key={item.id}
                        className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                          isChecked
                            ? isAutoValidated
                              ? 'bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700'
                              : 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                            : 'bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-900'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleChecklistItem(category.id, item.id)}
                          className="mt-1 w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500 focus:ring-2"
                        />
                        <div className="flex-1">
                          <span className={`text-sm ${isChecked ? 'line-through text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
                            {item.label}
                            {item.required && (
                              <span className="text-red-600 dark:text-red-400 font-semibold ml-1">*</span>
                            )}
                            {isAutoValidated && isChecked && (
                              <span className="ml-2 text-xs text-green-600 dark:text-green-400 font-medium">
                                (Validado automáticamente)
                              </span>
                            )}
                          </span>
                        </div>
                        {isChecked && (
                          <CheckCircle className={`w-5 h-5 flex-shrink-0 ${
                            isAutoValidated 
                              ? 'text-green-600 dark:text-green-400' 
                              : 'text-blue-600 dark:text-blue-400'
                          }`} />
                        )}
                      </label>
                    )
                  })}
                </div>
              </div>
              )
            })
          })()}

          {/* Resumen General del Checklist */}
          <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-xl p-6">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <ClipboardCheck className="w-6 h-6" />
              Resumen del Checklist
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {accountingChecklist.map((category) => {
                const progress = calculateProgress(category)
                const allRequiredCompleted = progress.requiredCompleted === progress.required && progress.required > 0
                return (
                  <div key={category.id} className="bg-white/10 rounded-lg p-3">
                    <div className="text-xs text-primary-100 mb-1">{category.category}</div>
                    <div className="text-2xl font-bold">{progress.percentage}%</div>
                    <div className="text-xs text-primary-100 mt-1">
                      {allRequiredCompleted ? (
                        <span className="text-green-300">✓ Completo</span>
                      ) : (
                        <span>{progress.requiredCompleted}/{progress.required} obligatorios</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </Card>
            </div>
          )}
        </div>
      </Card>

      {/* Modal de Guía de Validación */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowGuideModal(false)}></div>
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white p-6 rounded-t-2xl sticky top-0 z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg">
                    <FileCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">📚 Guía de Validación Contable</h2>
                    <p className="text-sm text-primary-100">Entiende cómo funciona la validación de datos contables</p>
                  </div>
                </div>
                <button onClick={() => setShowGuideModal(false)} className="text-white hover:text-gray-200">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6 text-sm text-gray-700 dark:text-gray-300">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">1. Principio de Partida Doble</h3>
                <p className="mb-2">En cada asiento contable, la suma de DEBE debe ser igual a la suma de HABER.</p>
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg font-mono text-xs">
                  <div>Fórmula: Σ(Debe) = Σ(Haber) por asiento</div>
                  <div className="text-gray-600 dark:text-gray-400 mt-1">Ejemplo: Si un asiento tiene Debe = S/ 1000, entonces Haber también debe ser S/ 1000</div>
                </div>
              </div>
              
              <div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">2. Balance de Comprobación</h3>
                <p className="mb-2">La suma TOTAL de todos los Debe debe ser igual a la suma TOTAL de todos los Haber.</p>
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg font-mono text-xs">
                  <div>Fórmula: Σ(Total Debe) = Σ(Total Haber)</div>
                  <div className="text-gray-600 dark:text-gray-400 mt-1">Si esto no cuadra, hay un error en algún asiento</div>
                </div>
              </div>
              
              <div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">3. Saldos de Cuentas (PCGE Peruano)</h3>
                <div className="space-y-2">
                  <div>
                    <strong>Activos (1.x, 2.x, 3.x):</strong> Saldo = Debe - Haber
                    <div className="text-xs text-gray-600 dark:text-gray-400 ml-4 mt-1">
                      • Caja y Bancos (10.x): Cuentas de efectivo<br/>
                      • Clientes (12.x): Cuentas por cobrar
                    </div>
                  </div>
                  <div>
                    <strong>Pasivos (4.x):</strong> Saldo = Haber - Debe
                    <div className="text-xs text-gray-600 dark:text-gray-400 ml-4 mt-1">
                      • Proveedores (42.x): Cuentas por pagar<br/>
                      • IGV por Pagar (40.11): Impuesto acumulado
                    </div>
                  </div>
                </div>
              </div>
              
              <div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">4. Validaciones Específicas - Contabilidad Peruana</h3>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li><strong>IGV (18%):</strong> IGV = Base × 0.18. Se valida en todas las compras y ventas.</li>
                  <li><strong>Comprobantes SUNAT:</strong> Series y números no duplicados, formato correcto.</li>
                  <li><strong>RUC:</strong> Validación de checksum según algoritmo SUNAT (11 dígitos).</li>
                  <li><strong>Fechas en Período:</strong> Todas las fechas deben estar dentro del período contable.</li>
                  <li><strong>Períodos Cerrados:</strong> No se pueden crear asientos en períodos cerrados.</li>
                  <li><strong>Saldos Negativos:</strong> Las cuentas de Activo no deberían tener saldos negativos.</li>
                  <li><strong>Correlatividad:</strong> Los comprobantes deben ser correlativos (sin saltos).</li>
                </ul>
              </div>
              
              <div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">5. Validaciones Generales</h3>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>Todos los asientos deben tener al menos 2 líneas (partida doble)</li>
                  <li>Las compras deben tener un asiento contable asociado</li>
                  <li>Las ventas deben tener un asiento contable asociado</li>
                  <li>Los saldos deben calcularse según el tipo de cuenta (Activo/Pasivo)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

