import React, { useState, useEffect } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { MessageModal } from '@/components/ui/MessageModal'
import { Tabs, TabsList, TabsTriggerWithValue, TabsContentWithValue } from '@/components/ui/Tabs'
import { 
  Settings, Plus, Edit2, Trash2, X, CheckCircle, AlertCircle, 
  Loader2, Play, Save, ArrowUp, ArrowDown, Brain, FileText, 
  MapPin, TestTube, Zap, HelpCircle, Info
} from 'lucide-react'
import { useOrg } from '@/stores/org'
import { useAuth } from '@/stores/auth'
import {
  listEventosContables, createEventoContable, updateEventoContable, toggleEventoActivo,
  listReglasContables, createReglaContable, updateReglaContable, deleteReglaContable,
  listTipoCuentaMapeos, createTipoCuentaMapeo, autoMapearTodos, autoMapearTipo, getSugerenciasMapeo,
  initJournalEngineDefaults, generarAsientoPrueba,
  listAccounts,
  type EventoContable, type ReglaContable, type TipoCuentaMapeo, type Account
} from '@/api'
import { formatCurrency } from '@/lib/utils'

// Tipos de cuenta disponibles
const TIPOS_CUENTA = [
  'CAJA', 'BANCO', 'CLIENTES', 'INVENTARIO', 'ACTIVO_FIJO',
  'PROVEEDORES', 'IGV_CREDITO', 'IGV_DEBITO', 'DETRACCIONES',
  'CAPITAL', 'RESERVAS', 'RESULTADOS',
  'INGRESO_VENTAS', 'INGRESO_OTROS',
  'GASTO_COMPRAS', 'GASTO_VENTAS', 'COSTO_VENTAS', 'GASTO_OTROS',
  'GASTO_PERSONAL', 'REMUNERACIONES_POR_PAGAR', 'TRIBUTOS_POR_PAGAR', 'APORTES_POR_PAGAR'
]

const TIPOS_MONTO = ['BASE', 'IGV', 'TOTAL', 'DESCUENTO', 'COSTO', 'CANTIDAD']
const LADOS = ['DEBE', 'HABER']
const EVENTOS_PREDEFINIDOS = ['COMPRA', 'VENTA', 'PAGO', 'COBRO', 'AJUSTE_INVENTARIO', 'ENTRADA_INVENTARIO', 'SALIDA_INVENTARIO', 'PLANILLA_PROVISION']

export default function MotorAsientos() {
  const { empresaId } = useOrg()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('probar')  // Probador por defecto para testear sin persistir
  
  // Estados generales
  const [loading, setLoading] = useState(false)
  const [messageModal, setMessageModal] = useState<{ type: 'success' | 'error' | 'info' | 'warning', title: string, message: string } | null>(null)
  
  // Tab 1: Eventos
  const [eventos, setEventos] = useState<EventoContable[]>([])
  const [showEventoModal, setShowEventoModal] = useState(false)
  const [editingEvento, setEditingEvento] = useState<EventoContable | null>(null)
  const [eventoForm, setEventoForm] = useState({ tipo: '', nombre: '', descripcion: '', categoria: '' })
  
  // Tab 2: Reglas
  const [reglas, setReglas] = useState<ReglaContable[]>([])
  const [eventoFiltro, setEventoFiltro] = useState<number | null>(null)
  const [showReglaModal, setShowReglaModal] = useState(false)
  const [editingRegla, setEditingRegla] = useState<ReglaContable | null>(null)
  const [reglaForm, setReglaForm] = useState({
    evento_id: 0,
    condicion: '',
    lado: 'DEBE' as 'DEBE' | 'HABER',
    tipo_cuenta: '',
    tipo_monto: 'BASE',
    orden: 0,
    config: {} as any,
    activo: true
  })
  
  // Tab 3: Mapeos
  const [mapeos, setMapeos] = useState<TipoCuentaMapeo[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [showMapeoModal, setShowMapeoModal] = useState(false)
  const [mapeoForm, setMapeoForm] = useState({ tipo_cuenta: '', account_id: 0, config: {} as any, activo: true })
  const [sugerenciasMapeo, setSugerenciasMapeo] = useState<any[]>([])
  const [mapeandoAuto, setMapeandoAuto] = useState(false)
  
  // Tab 4: Probar Motor
  const [pruebaForm, setPruebaForm] = useState({
    evento_tipo: 'COMPRA',
    base: '1000',
    igv: '180',
    total: '1180',
    cantidad: '10',  // Para AJUSTE_INVENTARIO: + sobrante, - faltante
    total_gasto: '15000', neto_trabajador: '12000', descuentos_trabajador: '2000', aportes_empleador: '1000',  // Para PLANILLA_PROVISION
    fecha: new Date().toISOString().split('T')[0],
    glosa: 'Prueba de compra'
  })
  const [pruebaResult, setPruebaResult] = useState<any>(null)
  const [probando, setProbando] = useState(false)
  
  useEffect(() => {
    if (empresaId) {
      loadEventos(true) // auto_init=true para crear eventos faltantes automáticamente
      loadReglas()
      loadMapeos()
      loadAccounts()
    }
  }, [empresaId])

  useEffect(() => {
    if (empresaId && eventoFiltro !== null) {
      loadReglas()
    }
  }, [eventoFiltro, empresaId])

  async function loadEventos(autoInit: boolean = false) {
    if (!empresaId) return
    try {
      setLoading(true)
      const data = await listEventosContables(empresaId, autoInit)
      setEventos(data)
    } catch (err: any) {
      showMessage('error', 'Error', `Error cargando eventos: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  async function loadReglas() {
    if (!empresaId) return
    try {
      setLoading(true)
      const data = await listReglasContables(empresaId, eventoFiltro || undefined)
      setReglas(data)
    } catch (err: any) {
      showMessage('error', 'Error', `Error cargando reglas: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  async function loadMapeos() {
    if (!empresaId) return
    try {
      setLoading(true)
      const data = await listTipoCuentaMapeos(empresaId)
      setMapeos(data)
    } catch (err: any) {
      showMessage('error', 'Error', `Error cargando mapeos: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  async function loadAccounts() {
    if (!empresaId) return
    try {
      const data = await listAccounts(empresaId)
      setAccounts(data.filter(a => a.active))
    } catch (err: any) {
      console.error('Error cargando cuentas:', err)
    }
  }

  async function handleInitDefaults() {
    if (!empresaId) return
    if (!confirm('¿Inicializar todos los eventos, reglas y mapeos predeterminados?\n\nSe crearán todos los eventos contables (COMPRA, VENTA, PAGO, COBRO, Tesorería, Inventarios, Notas de Crédito/Débito) con sus reglas, y se intentará mapear automáticamente las cuentas.')) {
      return
    }
    try {
      setLoading(true)
      const result = await initJournalEngineDefaults(empresaId)
      let msg = `Se crearon ${result.eventos_creados} eventos y ${result.reglas_creadas} reglas.\n\n${result.mensaje}`
      try {
        const mapResult = await autoMapearTodos(empresaId)
        msg += `\n\nMapeo automático: ${mapResult.creados} creados, ${mapResult.ya_existian} ya existían.`
        if (mapResult.requieren_revision?.length) {
          msg += `\n${mapResult.requieren_revision.length} requieren revisión manual.`
        }
        loadMapeos()
      } catch (_) {
        msg += '\n\n⚠️ No se pudo mapear automáticamente. Ve a la pestaña Mapeos para configurar las cuentas.'
      }
      showMessage('success', 'Inicialización Exitosa', msg)
      loadEventos()
      loadReglas()
    } catch (err: any) {
      showMessage('error', 'Error', `Error inicializando: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveEvento() {
    if (!empresaId || !eventoForm.tipo || !eventoForm.nombre) {
      showMessage('error', 'Error', 'Tipo y nombre son obligatorios')
      return
    }
    try {
      setLoading(true)
      if (editingEvento) {
        await updateEventoContable(empresaId, editingEvento.id, eventoForm.tipo, eventoForm.nombre, eventoForm.descripcion, eventoForm.categoria || undefined)
        showMessage('success', 'Éxito', 'Evento actualizado correctamente')
      } else {
        await createEventoContable(empresaId, eventoForm.tipo, eventoForm.nombre, eventoForm.descripcion, eventoForm.categoria || undefined)
        showMessage('success', 'Éxito', 'Evento creado correctamente')
      }
      setShowEventoModal(false)
      setEditingEvento(null)
      setEventoForm({ tipo: '', nombre: '', descripcion: '', categoria: '' })
      loadEventos()
    } catch (err: any) {
      showMessage('error', 'Error', `Error ${editingEvento ? 'actualizando' : 'creando'} evento: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveRegla() {
    if (!empresaId || !reglaForm.evento_id || !reglaForm.tipo_cuenta || !reglaForm.tipo_monto) {
      showMessage('error', 'Error', 'Complete todos los campos obligatorios')
      return
    }
    try {
      setLoading(true)
      if (editingRegla) {
        await updateReglaContable(empresaId, editingRegla.id, reglaForm)
        showMessage('success', 'Éxito', 'Regla actualizada correctamente')
      } else {
        await createReglaContable(empresaId, reglaForm)
        showMessage('success', 'Éxito', 'Regla creada correctamente')
      }
      setShowReglaModal(false)
      setEditingRegla(null)
      setReglaForm({
        evento_id: 0,
        condicion: '',
        lado: 'DEBE',
        tipo_cuenta: '',
        tipo_monto: 'BASE',
        orden: 0,
        config: {},
        activo: true
      })
      loadReglas()
    } catch (err: any) {
      showMessage('error', 'Error', `Error guardando regla: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteRegla(regla: ReglaContable) {
    if (!empresaId) return
    if (!confirm(`¿Eliminar la regla "${regla.tipo_cuenta} - ${regla.tipo_monto}"?`)) return
    try {
      setLoading(true)
      await deleteReglaContable(empresaId, regla.id)
      showMessage('success', 'Éxito', 'Regla eliminada')
      loadReglas()
    } catch (err: any) {
      showMessage('error', 'Error', `Error eliminando regla: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleAutoMapearTodos() {
    if (!empresaId) return
    if (!confirm('¿Desea mapear automáticamente todos los tipos de cuenta?\n\n⚠️ Solo se crearán mapeos con confianza >= 80%. Los demás requerirán revisión manual.')) {
      return
    }
    try {
      setMapeandoAuto(true)
      const result = await autoMapearTodos(empresaId)
      
      let mensaje = `${result.message}\n\n` +
        `✅ Creados automáticamente: ${result.creados}\n` +
        `ℹ️ Ya existían: ${result.ya_existian}\n`
      
      if (result.requieren_revision && result.requieren_revision.length > 0) {
        mensaje += `\n⚠️ Requieren revisión manual (${result.requieren_revision.length}):\n`
        result.requieren_revision.forEach((item: any) => {
          mensaje += `  • ${item.tipo_cuenta} → ${item.account_code} (${item.score}% confianza)\n`
        })
      }
      
      if (result.no_encontrados && result.no_encontrados.length > 0) {
        mensaje += `\n❌ No encontrados: ${result.no_encontrados.join(', ')}`
      }
      
      showMessage(
        result.requieren_revision && result.requieren_revision.length > 0 ? 'warning' : 'success',
        'Mapeo Automático Completado',
        mensaje
      )
      loadMapeos()
    } catch (err: any) {
      showMessage('error', 'Error', `Error en mapeo automático: ${err.message}`)
    } finally {
      setMapeandoAuto(false)
    }
  }

  async function handleAutoMapearTipo(tipo: string) {
    if (!empresaId) return
    try {
      setLoading(true)
      const result = await autoMapearTipo(empresaId, tipo)
      if (result.success) {
        const mensaje = result.score 
          ? `${result.message}\n\nConfianza: ${result.score}%`
          : result.message
        showMessage('success', 'Éxito', mensaje)
        loadMapeos()
      } else {
        // Si hay score bajo, mostrar advertencia
        if (result.score !== undefined && result.score < 80) {
          const mensaje = `${result.message}\n\n` +
            `Cuenta sugerida: ${result.cuenta_sugerida.account_code} - ${result.cuenta_sugerida.account_name}\n` +
            `Confianza: ${result.score}%\n\n` +
            `⚠️ Se requiere confirmación manual debido a la baja confianza.`
          
          if (result.sugerencias && result.sugerencias.length > 0) {
            setSugerenciasMapeo(result.sugerencias)
            // Pre-seleccionar la cuenta sugerida
            setMapeoForm({ 
              tipo_cuenta: tipo, 
              account_id: result.cuenta_sugerida.account_id, 
              config: {}, 
              activo: true 
            })
            setShowMapeoModal(true)
          } else {
            showMessage('warning', 'Confirmación Requerida', mensaje)
          }
        } else {
          // Mostrar sugerencias si no se encontró automáticamente
          if (result.sugerencias && result.sugerencias.length > 0) {
            setSugerenciasMapeo(result.sugerencias)
            setMapeoForm({ tipo_cuenta: tipo, account_id: 0, config: {}, activo: true })
            setShowMapeoModal(true)
          } else {
            showMessage('warning', 'No Encontrado', result.message)
          }
        }
      }
    } catch (err: any) {
      showMessage('error', 'Error', `Error en mapeo automático: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveMapeo() {
    if (!empresaId || !mapeoForm.tipo_cuenta || !mapeoForm.account_id) {
      showMessage('error', 'Error', 'Complete todos los campos')
      return
    }
    try {
      setLoading(true)
      await createTipoCuentaMapeo(empresaId, mapeoForm)
      showMessage('success', 'Éxito', 'Mapeo guardado correctamente')
      setShowMapeoModal(false)
      setMapeoForm({ tipo_cuenta: '', account_id: 0, config: {}, activo: true })
      setSugerenciasMapeo([])
      loadMapeos()
    } catch (err: any) {
      showMessage('error', 'Error', `Error guardando mapeo: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  async function loadSugerencias(tipo: string) {
    if (!empresaId) return
    try {
      const result = await getSugerenciasMapeo(empresaId, tipo)
      setSugerenciasMapeo(result.sugerencias)
    } catch (err: any) {
      console.error('Error cargando sugerencias:', err)
    }
  }

  async function handleProbarMotor() {
    if (!empresaId) {
      showMessage('warning', 'Empresa requerida', 'Selecciona una empresa para probar el motor.')
      return
    }
    try {
      setProbando(true)
      setPruebaResult(null)
      const base = parseFloat(pruebaForm.base) || 0
      const igv = parseFloat(pruebaForm.igv) || 0
      const total = parseFloat(pruebaForm.total) || 0
      const cantidad = parseFloat(pruebaForm.cantidad) || 0
      const total_gasto = parseFloat((pruebaForm as any).total_gasto) || 0
      const neto_trabajador = parseFloat((pruebaForm as any).neto_trabajador) || 0
      const descuentos_trabajador = parseFloat((pruebaForm as any).descuentos_trabajador) || 0
      const aportes_empleador = parseFloat((pruebaForm as any).aportes_empleador) || 0
      let datos: Record<string, number> = { base, igv, total }
      if (pruebaForm.evento_tipo === 'AJUSTE_INVENTARIO') {
        datos.cantidad = cantidad
        datos.total = total || Math.abs(cantidad) * 10  // Si no hay total, usar |cantidad|*10
      } else if (pruebaForm.evento_tipo === 'PLANILLA_PROVISION') {
        datos = { total_gasto, neto_trabajador, descuentos_trabajador, aportes_empleador }
      }
      const result = await generarAsientoPrueba(
        empresaId,
        pruebaForm.evento_tipo,
        datos,
        pruebaForm.fecha,
        pruebaForm.glosa
      )
      setPruebaResult(result)
      if (result.success) {
        const mensaje = result.simulacion 
          ? `✅ Simulación completada (no se creó asiento real)\n\n` +
            `Evento: ${result.evento_nombre || result.evento}\n` +
            `Debe: ${formatCurrency(result.total_debit)}\n` +
            `Haber: ${formatCurrency(result.total_credit)}\n` +
            `Cuadra: ${result.cuadra ? 'Sí ✓' : 'No ✗'}`
          : `Asiento #${result.asiento_id} generado correctamente.\nDebe: ${formatCurrency(result.total_debit)}\nHaber: ${formatCurrency(result.total_credit)}\nCuadra: ${result.cuadra ? 'Sí' : 'No'}`
        showMessage('success', result.simulacion ? 'Simulación Exitosa' : 'Asiento Generado', mensaje)
      }
    } catch (err: any) {
      let msg = err?.message || 'Error desconocido'
      // Extraer detail del JSON si viene en el mensaje (ej: 400 Bad Request: {"detail":"..."})
      try {
        const jsonStart = msg.indexOf('{')
        if (jsonStart >= 0) {
          const jsonStr = msg.slice(jsonStart)
          const parsed = JSON.parse(jsonStr)
          if (parsed?.detail) msg = String(parsed.detail).replace(/\\n/g, '\n')
        }
      } catch (_) {}
      if (msg.toLowerCase().includes('mapeo') || msg.includes('debe mapear') || msg.includes('RESULTADOS') || msg.includes('No hay mapeo')) {
        msg += '\n\n💡 Ve a la pestaña Mapeos y configura o corrige la cuenta indicada.'
      } else if (msg.includes('Evento no encontrado') || msg.includes('sin reglas')) {
        msg += '\n\n💡 Clic en "Cargar Eventos, Reglas y Mapeos" o crea el evento en la pestaña Eventos.'
      } else if (msg.includes('cantidad') || msg.includes('AJUSTE_INVENTARIO')) {
        msg += '\n\n💡 Para AJUSTE_INVENTARIO ingresa Cantidad: +10 (sobrante) o -5 (faltante) y Total.'
      } else if (msg.includes('PLANILLA_PROVISION') || msg.includes('total_gasto') || msg.includes('neto_trabajador')) {
        msg += '\n\n💡 Para PLANILLA_PROVISION ingresa Total Gasto, Neto Trabajador, Descuentos Trabajador y Aportes Empleador (total_gasto = neto + descuentos + aportes).'
      }
      showMessage('error', 'Error en la prueba', msg)
    } finally {
      setProbando(false)
    }
  }

  function showMessage(type: 'success' | 'error' | 'info' | 'warning', title: string, message: string) {
    setMessageModal({ type, title, message })
  }

  function openReglaModal(regla?: ReglaContable) {
    if (regla) {
      setEditingRegla(regla)
      setReglaForm({
        evento_id: regla.evento_id,
        condicion: regla.condicion || '',
        lado: regla.lado,
        tipo_cuenta: regla.tipo_cuenta,
        tipo_monto: regla.tipo_monto,
        orden: regla.orden,
        config: regla.config || {},
        activo: regla.activo
      })
    } else {
      setEditingRegla(null)
      setReglaForm({
        evento_id: eventoFiltro || 0,
        condicion: '',
        lado: 'DEBE',
        tipo_cuenta: '',
        tipo_monto: 'BASE',
        orden: reglas.length,
        config: {},
        activo: true
      })
    }
    setShowReglaModal(true)
  }

  async function openMapeoModal(tipo?: string) {
    if (tipo) {
      const mapeoExistente = mapeos.find(m => m.tipo_cuenta === tipo)
      if (mapeoExistente) {
        setMapeoForm({
          tipo_cuenta: mapeoExistente.tipo_cuenta,
          account_id: mapeoExistente.account_id,
          config: mapeoExistente.config || {},
          activo: mapeoExistente.activo
        })
        setSugerenciasMapeo([])
      } else {
        setMapeoForm({ tipo_cuenta: tipo, account_id: 0, config: {}, activo: true })
        // Cargar sugerencias automáticamente
        await loadSugerencias(tipo)
      }
    } else {
      setMapeoForm({ tipo_cuenta: '', account_id: 0, config: {}, activo: true })
      setSugerenciasMapeo([])
    }
    setShowMapeoModal(true)
  }

  const reglasFiltradas = eventoFiltro 
    ? reglas.filter(r => r.evento_id === eventoFiltro)
    : reglas

  // Agrupar reglas por evento para mejor visualización
  const reglasPorEvento = eventos.map(evento => ({
    evento,
    reglas: reglas.filter(r => r.evento_id === evento.id),
    count: reglas.filter(r => r.evento_id === evento.id).length
  })).filter(grupo => grupo.count > 0 || !eventoFiltro)

  const tiposSinMapeo = TIPOS_CUENTA.filter(tipo => !mapeos.find(m => m.tipo_cuenta === tipo && m.activo))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Motor de Asientos Contables"
        subtitle="Configura eventos, reglas y mapeos de cuentas para generación automática de asientos"
        icon={Brain}
      />

      {/* Botones de ayuda */}
      <div className="space-y-4">
        <Card>
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
                  Cargar / Recargar Eventos, Reglas y Mapeos
                </h3>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  {eventos.length === 0
                    ? 'Carga eventos, reglas y mapeos predeterminados (COMPRA, VENTA, PAGO, COBRO, Tesorería, Inventarios, Notas de Crédito/Débito, PLANILLA_PROVISION)'
                    : `Hay ${eventos.length} evento(s). Puedes recargar para asegurar que existan todos (incluye PLANILLA_PROVISION y mapeos).`}
                </p>
              </div>
              <Button onClick={handleInitDefaults} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Cargar Eventos, Reglas y Mapeos
              </Button>
            </div>
          </div>
        </Card>
        
        {/* Card del Probador - compacto */}
        {activeTab !== 'probar' && (
          <Card>
            <div className="px-4 py-2 flex items-center justify-between bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-200/60 dark:border-emerald-800/60 rounded-lg">
              <span className="text-sm text-emerald-800 dark:text-emerald-200">
                <TestTube className="w-4 h-4 inline mr-2 align-middle" />
                <strong>Probador:</strong> simula asientos sin persistir en BD
              </span>
              <Button onClick={() => setActiveTab('probar')} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                Ir al Probador
              </Button>
            </div>
          </Card>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTriggerWithValue value="eventos" activeValue={activeTab} onValueChange={setActiveTab}>
            <FileText className="w-4 h-4 mr-2" />
            Eventos
          </TabsTriggerWithValue>
          <TabsTriggerWithValue value="reglas" activeValue={activeTab} onValueChange={setActiveTab}>
            <Settings className="w-4 h-4 mr-2" />
            Reglas
          </TabsTriggerWithValue>
          <TabsTriggerWithValue value="mapeos" activeValue={activeTab} onValueChange={setActiveTab}>
            <MapPin className="w-4 h-4 mr-2" />
            Mapeos
          </TabsTriggerWithValue>
          <TabsTriggerWithValue value="probar" activeValue={activeTab} onValueChange={setActiveTab}>
            <TestTube className="w-4 h-4 mr-2" />
            Probar
          </TabsTriggerWithValue>
        </TabsList>

        {/* Tab 1: Eventos */}
        <TabsContentWithValue value="eventos" activeValue={activeTab}>
          <Card>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold">Eventos Contables</h2>
                  <div className="group relative">
                    <HelpCircle className="w-4 h-4 text-gray-400 cursor-help" />
                    <div className="absolute left-full top-0 ml-3 w-96 p-3 bg-gray-800 text-white text-xs rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-[9999] pointer-events-none">
                      <div className="font-semibold mb-2 text-sm">¿Qué son los Eventos Contables?</div>
                      <div className="space-y-1.5">
                        <p>Los eventos contables definen los <strong>tipos de operaciones</strong> que generan asientos automáticos en el sistema.</p>
                        <p><strong>Ejemplos:</strong> COMPRA, VENTA, PAGO, COBRO, AJUSTE_INVENTARIO, etc.</p>
                        <p>Cada evento tiene <strong>reglas asociadas</strong> que determinan cómo se genera el asiento contable cuando ocurre ese evento.</p>
                        <p className="text-yellow-300 mt-2">💡 <strong>Tip:</strong> Inicializa los eventos predeterminados para comenzar rápidamente.</p>
                      </div>
                      <div className="absolute left-0 top-3 -ml-1 w-2 h-2 bg-gray-800 transform rotate-45"></div>
                    </div>
                  </div>
                </div>
                <Button onClick={() => setShowEventoModal(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Nuevo Evento
                </Button>
              </div>
              
              <div className="space-y-2">
                {eventos.map(evento => {
                  // Identificar categoría del evento
                  const categoria = evento.categoria || 'GENERAL'
                  const categoriaLabels: Record<string, { label: string; color: string; bgColor: string }> = {
                    'GENERAL': { label: 'General', color: 'text-gray-700 dark:text-gray-300', bgColor: 'bg-gray-100 dark:bg-gray-700' },
                    'TESORERIA': { label: 'Tesorería', color: 'text-blue-700 dark:text-blue-300', bgColor: 'bg-blue-100 dark:bg-blue-900/30' },
                    'INVENTARIO': { label: 'Inventario', color: 'text-purple-700 dark:text-purple-300', bgColor: 'bg-purple-100 dark:bg-purple-900/30' },
                    'COMPRAS': { label: 'Compras', color: 'text-orange-700 dark:text-orange-300', bgColor: 'bg-orange-100 dark:bg-orange-900/30' },
                    'VENTAS': { label: 'Ventas', color: 'text-green-700 dark:text-green-300', bgColor: 'bg-green-100 dark:bg-green-900/30' },
                  }
                  const categoriaInfo = categoriaLabels[categoria] || categoriaLabels['GENERAL']
                  
                  return (
                    <div key={evento.id} className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="font-semibold">{evento.nombre}</div>
                            <span className={`px-2 py-0.5 ${categoriaInfo.bgColor} ${categoriaInfo.color} text-xs font-medium rounded`}>
                              {categoriaInfo.label}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            Tipo: <span className="font-mono">{evento.tipo}</span>
                            {evento.descripcion && ` • ${evento.descripcion}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={`px-2 py-1 rounded text-xs ${evento.activo ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>
                            {evento.activo ? 'Activo' : 'Inactivo'}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEventoForm({
                                tipo: evento.tipo,
                                nombre: evento.nombre,
                                descripcion: evento.descripcion || '',
                                categoria: evento.categoria || ''
                              })
                              setEditingEvento(evento)
                              setShowEventoModal(true)
                            }}
                            title="Editar evento"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              if (confirm(`¿${evento.activo ? 'Desactivar' : 'Activar'} el evento "${evento.nombre}"?`)) {
                                try {
                                  await toggleEventoActivo(empresaId, evento.id)
                                  loadEventos()
                                } catch (err: any) {
                                  showMessage('error', 'Error', err.message)
                                }
                              }
                            }}
                            title={evento.activo ? 'Desactivar' : 'Activar'}
                          >
                            {evento.activo ? <X className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {eventos.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No hay eventos configurados. Inicializa los predeterminados o crea uno nuevo.
                  </div>
                )}
              </div>
            </div>
          </Card>
        </TabsContentWithValue>

        {/* Tab 2: Reglas */}
        <TabsContentWithValue value="reglas" activeValue={activeTab}>
          <Card>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold">Reglas Contables</h2>
                  <div className="group relative">
                    <HelpCircle className="w-4 h-4 text-gray-400 cursor-help" />
                    <div className="absolute left-full top-0 ml-3 w-96 p-3 bg-gray-800 text-white text-xs rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-[9999] pointer-events-none">
                      <div className="font-semibold mb-2 text-sm">¿Qué son las Reglas Contables?</div>
                      <div className="space-y-1.5">
                        <p>Las reglas definen <strong>cómo se genera cada línea</strong> del asiento contable.</p>
                        <p><strong>Componentes de una regla:</strong></p>
                        <ul className="list-disc list-inside ml-2 space-y-0.5">
                          <li><strong>Lado:</strong> DEBE o HABER</li>
                          <li><strong>Tipo de Cuenta:</strong> CAJA, PROVEEDORES, CLIENTES, etc.</li>
                          <li><strong>Tipo de Monto:</strong> BASE, IGV, TOTAL, etc.</li>
                          <li><strong>Orden:</strong> Secuencia de ejecución</li>
                          <li><strong>Condición:</strong> (Opcional) Regla condicional</li>
                        </ul>
                        <p className="text-yellow-300 mt-2">💡 <strong>Tip:</strong> Las reglas se ejecutan en orden. Asegúrate de que el asiento cuadre (Debe = Haber).</p>
                      </div>
                      <div className="absolute left-0 top-3 -ml-1 w-2 h-2 bg-gray-800 transform rotate-45"></div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <select
                    value={eventoFiltro || ''}
                    onChange={e => setEventoFiltro(e.target.value ? parseInt(e.target.value) : null)}
                    className="px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="">Todos los eventos</option>
                    {eventos.map(e => {
                      const count = reglas.filter(r => r.evento_id === e.id).length
                      return (
                        <option key={e.id} value={e.id}>
                          {e.nombre} ({count} reglas)
                        </option>
                      )
                    })}
                  </select>
                  <Button onClick={() => openReglaModal()} disabled={!eventoFiltro && eventos.length > 0}>
                    <Plus className="w-4 h-4 mr-2" />
                    Nueva Regla
                  </Button>
                </div>
              </div>
              
              {!eventoFiltro ? (
                // Vista agrupada por evento
                <div className="space-y-4">
                  {reglasPorEvento.map(grupo => (
                    <div key={grupo.evento.id} className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-lg">{grupo.evento.nombre}</h3>
                          <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">
                            {grupo.count} {grupo.count === 1 ? 'regla' : 'reglas'}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            Tipo: {grupo.evento.tipo}
                          </span>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setEventoFiltro(grupo.evento.id)
                          }}
                        >
                          Ver detalle
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {grupo.reglas.sort((a, b) => a.orden - b.orden).map(regla => (
                          <div key={regla.id} className="p-3 bg-white dark:bg-gray-900 border rounded-lg">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                                    Orden: {regla.orden}
                                  </span>
                                  {!regla.activo && (
                                    <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2 py-0.5 rounded">
                                      Inactiva
                                    </span>
                                  )}
                                </div>
                                <div className="text-sm text-gray-600 dark:text-gray-400">
                                  <span className="font-mono font-semibold">{regla.lado}</span> → 
                                  <span className="font-mono ml-2">{regla.tipo_cuenta}</span> → 
                                  <span className="font-mono ml-2">{regla.tipo_monto}</span>
                                  {regla.condicion && (
                                    <span className="ml-2 text-xs italic text-orange-600 dark:text-orange-400">(si: {regla.condicion})</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => openReglaModal(regla)}>
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => handleDeleteRegla(regla)}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {reglasPorEvento.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      No hay reglas configuradas. Inicializa los eventos predeterminados o crea reglas manualmente.
                    </div>
                  )}
                </div>
              ) : (
                // Vista filtrada por evento
                <div className="space-y-2">
                  {reglasFiltradas.sort((a, b) => a.orden - b.orden).map(regla => {
                    const evento = eventos.find(e => e.id === regla.evento_id)
                    return (
                      <div key={regla.id} className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold">{evento?.nombre || 'Sin evento'}</span>
                              <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                                Orden: {regla.orden}
                              </span>
                              {!regla.activo && (
                                <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2 py-0.5 rounded">
                                  Inactiva
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              <span className="font-mono">{regla.lado}</span> → 
                              <span className="font-mono ml-2">{regla.tipo_cuenta}</span> → 
                              <span className="font-mono ml-2">{regla.tipo_monto}</span>
                              {regla.condicion && (
                                <span className="ml-2 text-xs italic">(si: {regla.condicion})</span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => openReglaModal(regla)}>
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleDeleteRegla(regla)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {reglasFiltradas.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      No hay reglas para este evento. Crea una nueva regla.
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        </TabsContentWithValue>

        {/* Tab 3: Mapeos */}
        <TabsContentWithValue value="mapeos" activeValue={activeTab}>
          <Card>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold">Mapeo de Tipos de Cuenta</h2>
                  <div className="group relative">
                    <HelpCircle className="w-4 h-4 text-gray-400 cursor-help" />
                    <div className="absolute left-full top-0 ml-3 w-96 p-3 bg-gray-800 text-white text-xs rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-[9999] pointer-events-none">
                      <div className="font-semibold mb-2 text-sm">¿Qué son los Mapeos de Cuentas?</div>
                      <div className="space-y-1.5">
                        <p>Los mapeos conectan <strong>tipos de cuenta abstractos</strong> (CAJA, PROVEEDORES, CLIENTES, etc.) con <strong>cuentas reales</strong> de tu plan contable.</p>
                        <p><strong>Ejemplo:</strong> El tipo "CAJA" se mapea a la cuenta "10.10 - Caja" de tu plan contable.</p>
                        <p><strong>Mapeo Automático:</strong> El sistema busca automáticamente las cuentas por:</p>
                        <ul className="list-disc list-inside ml-2 space-y-0.5">
                          <li>Código de cuenta (ej: busca "10.10" para CAJA)</li>
                          <li>Nombre de cuenta (ej: busca "caja" en el nombre)</li>
                          <li>Tipo de cuenta contable (Activo, Pasivo, etc.)</li>
                        </ul>
                        <p className="text-yellow-300 mt-2">💡 <strong>Tip:</strong> Usa "Mapear Todos Automáticamente" para configurar todos los mapeos de una vez.</p>
                      </div>
                      <div className="absolute left-0 top-3 -ml-1 w-2 h-2 bg-gray-800 transform rotate-45"></div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleAutoMapearTodos} disabled={mapeandoAuto} variant="outline">
                    {mapeandoAuto ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
                    Mapear Todos Automáticamente
                  </Button>
                  <Button onClick={() => openMapeoModal()}>
                    <Plus className="w-4 h-4 mr-2" />
                    Nuevo Mapeo
                  </Button>
                </div>
              </div>
              
              {tiposSinMapeo.length > 0 && (
                <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm font-semibold">
                      {tiposSinMapeo.length} tipo(s) sin mapear: {tiposSinMapeo.join(', ')}
                    </span>
                  </div>
                </div>
              )}
              
              <div className="space-y-2">
                {TIPOS_CUENTA.map(tipo => {
                  const mapeo = mapeos.find(m => m.tipo_cuenta === tipo)
                  return (
                    <div key={tipo} className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
                        <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-semibold">{tipo}</div>
                          {mapeo ? (
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              → {mapeo.account_code} - {mapeo.account_name}
                            </div>
                          ) : (
                            <div className="text-sm text-red-600 dark:text-red-400">
                              Sin mapear
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {!mapeo && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => handleAutoMapearTipo(tipo)}
                              disabled={loading}
                              title="Mapear automáticamente"
                            >
                              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                            </Button>
                          )}
                          <Button variant="outline" size="sm" onClick={() => openMapeoModal(tipo)}>
                            {mapeo ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </Card>
        </TabsContentWithValue>

        {/* Tab 4: Probar Motor */}
        <TabsContentWithValue value="probar" activeValue={activeTab}>
          <Card>
            <div className="p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-bold">Probar Motor</h2>
                <span className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                  <Info className="w-4 h-4" />
                  Modo simulación (no persiste)
                </span>
              </div>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold mb-1">Evento</label>
                    <select
                      value={pruebaForm.evento_tipo}
                      onChange={e => setPruebaForm({ ...pruebaForm, evento_tipo: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      {(eventos.length > 0
                        ? Array.from(new Set(eventos.map(e => e.tipo))).sort()
                        : EVENTOS_PREDEFINIDOS
                      ).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1">Fecha</label>
                    <input
                      type="date"
                      value={pruebaForm.fecha}
                      onChange={e => setPruebaForm({ ...pruebaForm, fecha: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1">Base</label>
                    <input
                      type="number"
                      step="0.01"
                      value={pruebaForm.base}
                      onChange={e => setPruebaForm({ ...pruebaForm, base: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1">IGV</label>
                    <input
                      type="number"
                      step="0.01"
                      value={pruebaForm.igv}
                      onChange={e => setPruebaForm({ ...pruebaForm, igv: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1">Total</label>
                    <input
                      type="number"
                      step="0.01"
                      value={pruebaForm.total}
                      onChange={e => setPruebaForm({ ...pruebaForm, total: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                  {pruebaForm.evento_tipo === 'AJUSTE_INVENTARIO' && (
                    <div>
                      <label className="block text-sm font-semibold mb-1">Cantidad (+ sobrante, - faltante)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={pruebaForm.cantidad}
                        onChange={e => setPruebaForm({ ...pruebaForm, cantidad: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                        placeholder="Ej: 10 o -5"
                      />
                    </div>
                  )}
                  {pruebaForm.evento_tipo === 'PLANILLA_PROVISION' && (
                    <>
                      <div>
                        <label className="block text-sm font-semibold mb-1">Total Gasto</label>
                        <input type="number" step="0.01" value={(pruebaForm as any).total_gasto || ''} onChange={e => setPruebaForm({ ...pruebaForm, total_gasto: e.target.value })} className="w-full px-3 py-2 border rounded-lg" placeholder="Ej: 15000" />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold mb-1">Neto Trabajador</label>
                        <input type="number" step="0.01" value={(pruebaForm as any).neto_trabajador || ''} onChange={e => setPruebaForm({ ...pruebaForm, neto_trabajador: e.target.value })} className="w-full px-3 py-2 border rounded-lg" placeholder="Ej: 12000" />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold mb-1">Descuentos Trabajador</label>
                        <input type="number" step="0.01" value={(pruebaForm as any).descuentos_trabajador || ''} onChange={e => setPruebaForm({ ...pruebaForm, descuentos_trabajador: e.target.value })} className="w-full px-3 py-2 border rounded-lg" placeholder="Ej: 2000" />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold mb-1">Aportes Empleador</label>
                        <input type="number" step="0.01" value={(pruebaForm as any).aportes_empleador || ''} onChange={e => setPruebaForm({ ...pruebaForm, aportes_empleador: e.target.value })} className="w-full px-3 py-2 border rounded-lg" placeholder="Ej: 1000" />
                      </div>
                      <div className="col-span-2 text-xs text-gray-600 dark:text-gray-400">
                        total_gasto debe ser igual a neto + descuentos + aportes
                      </div>
                    </>
                  )}
                  <div>
                    <label className="block text-sm font-semibold mb-1">Glosa</label>
                    <input
                      type="text"
                      value={pruebaForm.glosa}
                      onChange={e => setPruebaForm({ ...pruebaForm, glosa: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                      placeholder="Descripción del asiento"
                    />
                  </div>
                </div>
                
                <Button onClick={handleProbarMotor} disabled={probando} className="w-full bg-emerald-600 hover:bg-emerald-700">
                  {probando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <TestTube className="w-4 h-4 mr-2" />}
                  Simular Asiento (no persiste en BD)
                </Button>
                
                {pruebaResult && (
                  <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold">Resultado de la Simulación:</h3>
                      {pruebaResult.simulacion && (
                        <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">
                          🧪 Modo Simulación
                        </span>
                      )}
                    </div>
                    <div className="space-y-2 text-sm">
                      {pruebaResult.evento_nombre && (
                        <div>
                          <span className="font-semibold">Evento:</span> {pruebaResult.evento_nombre}
                        </div>
                      )}
                      {pruebaResult.asiento_id && (
                        <div>
                          <span className="font-semibold">Asiento ID:</span> {pruebaResult.asiento_id}
                        </div>
                      )}
                      <div>
                        <span className="font-semibold">Debe:</span> {formatCurrency(pruebaResult.total_debit)}
                      </div>
                      <div>
                        <span className="font-semibold">Haber:</span> {formatCurrency(pruebaResult.total_credit)}
                      </div>
                      <div className={pruebaResult.cuadra ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-red-600 dark:text-red-400 font-semibold'}>
                        {pruebaResult.cuadra ? '✓ Cuadra correctamente' : '✗ No cuadra - Revisa las reglas'}
                      </div>
                      {pruebaResult.lineas && (
                        <div className="mt-3 border-t pt-3">
                          <div className="font-semibold mb-2">Líneas del Asiento:</div>
                          <div className="space-y-1">
                            {pruebaResult.lineas.map((linea: any, idx: number) => (
                              <div key={idx} className="text-xs pl-4 py-1 bg-white dark:bg-gray-900 rounded border">
                                <div className="font-mono font-semibold">{linea.account_code}</div>
                                <div className="text-gray-600 dark:text-gray-400">{linea.account_name}</div>
                                {linea.debit > 0 && (
                                  <div className="text-green-600 dark:text-green-400">Debe: {formatCurrency(linea.debit)}</div>
                                )}
                                {linea.credit > 0 && (
                                  <div className="text-blue-600 dark:text-blue-400">Haber: {formatCurrency(linea.credit)}</div>
                                )}
                                {linea.memo && (
                                  <div className="text-gray-500 dark:text-gray-500 italic text-xs mt-1">{linea.memo}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </TabsContentWithValue>
      </Tabs>

      {/* Modal: Crear Evento */}
      {showEventoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowEventoModal(false)}></div>
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold">{editingEvento ? 'Editar' : 'Nuevo'} Evento Contable</h3>
              <button onClick={() => setShowEventoModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Tipo de Evento</label>
                
                {/* Opción 1: Seleccionar predefinido */}
                <div className="mb-3">
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1.5">
                    Seleccionar tipo predefinido:
                  </label>
                  <select
                    value={EVENTOS_PREDEFINIDOS.includes(eventoForm.tipo) ? eventoForm.tipo : ''}
                    onChange={e => {
                      if (e.target.value) {
                        setEventoForm({ ...eventoForm, tipo: e.target.value })
                      }
                    }}
                    className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800"
                  >
                    <option value="">-- Seleccionar --</option>
                    {EVENTOS_PREDEFINIDOS.map(e => (
                      <option key={e} value={e}>{e}</option>
                    ))}
                  </select>
                </div>

                {/* Separador */}
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white dark:bg-gray-800 px-2 text-gray-500 dark:text-gray-400">
                      O
                    </span>
                  </div>
                </div>

                {/* Opción 2: Crear tipo personalizado */}
                <div>
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1.5">
                    Crear tipo personalizado:
                  </label>
                  <input
                    type="text"
                    value={EVENTOS_PREDEFINIDOS.includes(eventoForm.tipo) ? '' : eventoForm.tipo}
                    onChange={e => setEventoForm({ ...eventoForm, tipo: e.target.value.toUpperCase().replace(/\s+/g, '_') })}
                    placeholder="Ej: DEVOLUCION_COMPRA, NOTA_CREDITO"
                    className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 font-mono text-sm"
                  />
                  <div className="mt-1.5 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-xs text-blue-800 dark:text-blue-200">
                    <strong>💡 Formato:</strong> Usa MAYÚSCULAS y guiones bajos (_) para separar palabras.
                    <br />
                    <strong>Ejemplos:</strong> DEVOLUCION_COMPRA, NOTA_CREDITO, AJUSTE_SALDO
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Nombre</label>
                <input
                  type="text"
                  value={eventoForm.nombre}
                  onChange={e => setEventoForm({ ...eventoForm, nombre: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Ej: Compra de Bienes/Servicios"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Categoría</label>
                <select
                  value={eventoForm.categoria}
                  onChange={e => setEventoForm({ ...eventoForm, categoria: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="">General (Transversal)</option>
                  <option value="TESORERIA">Tesorería</option>
                  <option value="INVENTARIO">Inventario</option>
                  <option value="COMPRAS">Compras</option>
                  <option value="VENTAS">Ventas</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  {editingEvento && editingEvento.categoria && (
                    <span className="text-blue-600 dark:text-blue-400">
                      📌 Este evento pertenece al módulo: <strong>{editingEvento.categoria}</strong>
                    </span>
                  )}
                  {!editingEvento && (
                    <span>Selecciona la categoría del evento. "General" para eventos transversales.</span>
                  )}
                </p>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Descripción</label>
                <textarea
                  value={eventoForm.descripcion}
                  onChange={e => setEventoForm({ ...eventoForm, descripcion: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  rows={3}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => {
                  setShowEventoModal(false)
                  setEditingEvento(null)
                  setEventoForm({ tipo: '', nombre: '', descripcion: '', categoria: '' })
                }}>Cancelar</Button>
                <Button onClick={handleSaveEvento} disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {editingEvento ? 'Actualizar' : 'Guardar'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Crear/Editar Regla */}
      {showReglaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowReglaModal(false)}></div>
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold">{editingRegla ? 'Editar' : 'Nueva'} Regla Contable</h3>
              <button onClick={() => setShowReglaModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1">Evento</label>
                <select
                  value={reglaForm.evento_id}
                  onChange={e => setReglaForm({ ...reglaForm, evento_id: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="0">Seleccionar...</option>
                  {eventos.map(e => (
                    <option key={e.id} value={e.id}>{e.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Lado</label>
                <select
                  value={reglaForm.lado}
                  onChange={e => setReglaForm({ ...reglaForm, lado: e.target.value as 'DEBE' | 'HABER' })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  {LADOS.map(l => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Tipo de Cuenta</label>
                <select
                  value={reglaForm.tipo_cuenta}
                  onChange={e => setReglaForm({ ...reglaForm, tipo_cuenta: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="">Seleccionar...</option>
                  {TIPOS_CUENTA.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Tipo de Monto</label>
                <select
                  value={reglaForm.tipo_monto}
                  onChange={e => setReglaForm({ ...reglaForm, tipo_monto: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  {TIPOS_MONTO.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Orden</label>
                <input
                  type="number"
                  value={reglaForm.orden}
                  onChange={e => setReglaForm({ ...reglaForm, orden: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Condición (opcional)</label>
                <input
                  type="text"
                  value={reglaForm.condicion}
                  onChange={e => setReglaForm({ ...reglaForm, condicion: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Ej: afecta_stock == True"
                />
                <p className="text-xs text-gray-500 mt-1">Expresión Python evaluable</p>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowReglaModal(false)}>Cancelar</Button>
                <Button onClick={handleSaveRegla} disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Guardar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Crear/Editar Mapeo */}
      {showMapeoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => {
            setShowMapeoModal(false)
            setSugerenciasMapeo([])
          }}></div>
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold">Mapeo de Tipo de Cuenta</h3>
              <button onClick={() => {
                setShowMapeoModal(false)
                setSugerenciasMapeo([])
              }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1">Tipo de Cuenta</label>
                <select
                  value={mapeoForm.tipo_cuenta}
                  onChange={async (e) => {
                    const nuevoTipo = e.target.value
                    setMapeoForm({ ...mapeoForm, tipo_cuenta: nuevoTipo, account_id: 0 })
                    if (nuevoTipo) {
                      await loadSugerencias(nuevoTipo)
                    } else {
                      setSugerenciasMapeo([])
                    }
                  }}
                  className="w-full px-3 py-2 border rounded-lg"
                  disabled={!!mapeoForm.tipo_cuenta}
                >
                  <option value="">Seleccionar...</option>
                  {TIPOS_CUENTA.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              
              {/* Sugerencias automáticas */}
              {sugerenciasMapeo.length > 0 && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
                    💡 Sugerencias Automáticas (ordenadas por relevancia):
                  </div>
                  <div className="space-y-2">
                    {sugerenciasMapeo.map((sug, idx) => (
                      <button
                        key={sug.account_id}
                        onClick={() => setMapeoForm({ ...mapeoForm, account_id: sug.account_id })}
                        className={`w-full text-left p-2 rounded border-2 transition-all ${
                          mapeoForm.account_id === sug.account_id
                            ? 'border-blue-500 bg-blue-100 dark:bg-blue-900/30'
                            : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-mono font-semibold">{sug.account_code}</div>
                            <div className="text-xs text-gray-600 dark:text-gray-400">{sug.account_name}</div>
                          </div>
                          <div className="text-xs text-blue-600 dark:text-blue-400">
                            {Math.round(sug.score)}% match
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-semibold mb-1">Cuenta Contable Real</label>
                <select
                  value={mapeoForm.account_id}
                  onChange={e => setMapeoForm({ ...mapeoForm, account_id: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="0">Seleccionar...</option>
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.code} - {acc.name}</option>
                  ))}
                </select>
              </div>
              
              {mapeoForm.tipo_cuenta && !mapeoForm.account_id && (
                <Button 
                  variant="outline" 
                  onClick={() => handleAutoMapearTipo(mapeoForm.tipo_cuenta)}
                  disabled={loading}
                  className="w-full"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
                  Mapear Automáticamente
                </Button>
              )}
              
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => {
                  setShowMapeoModal(false)
                  setSugerenciasMapeo([])
                }}>Cancelar</Button>
                <Button onClick={handleSaveMapeo} disabled={loading || !mapeoForm.account_id}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Guardar
                </Button>
              </div>
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

