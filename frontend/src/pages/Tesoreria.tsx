import { useState, useEffect } from 'react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Table, TableHeader, TableHeaderCell, TableBody, TableRow, TableCell } from '@/components/ui/Table'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { PageHeader } from '@/components/ui/PageHeader'
import { ActionBar } from '@/components/ui/ActionBar'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { TabsTriggerWithValue, TabsContentWithValue } from '@/components/ui/Tabs'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, Search, Filter, Download, Eye, DollarSign, ArrowDownCircle, ArrowUpCircle, Wallet, CreditCard, Building2, Calendar, FileText, CheckCircle, XCircle, AlertCircle, List, Trash2, Trash } from 'lucide-react'
import { 
  listMovimientosTesoreria, registrarCobroTesoreria, registrarPagoTesoreria, 
  listMetodosPago, initMetodosPago, type MovimientoTesoreria, type CobroTesoreriaIn, type PagoTesoreriaIn, type MetodoPago,
  listVentas, listCompras, type VentaOut, type CompraOut, 
  getSaldoPendienteVentaTesoreria, getSaldoPendienteCompraTesoreria,
  eliminarMovimientoTesoreria,
  eliminarMovimientosTesoreriaMasivo
} from '@/api'
import { PaymentModal, type PaymentData } from '@/components/ui'
import { useOrg } from '@/stores/org'
import { useAuth } from '@/stores/auth'

export default function Tesoreria() {
  const { empresaId, periodo } = useOrg()
  const { user } = useAuth()
  const [movimientos, setMovimientos] = useState<MovimientoTesoreria[]>([])
  const [loading, setLoading] = useState(true)
  const [metodosPago, setMetodosPago] = useState<MetodoPago[]>([])
  const [ventas, setVentas] = useState<VentaOut[]>([])
  const [compras, setCompras] = useState<CompraOut[]>([])
  const [saldosPendientesVentas, setSaldosPendientesVentas] = useState<Record<number, number>>({})
  const [saldosPendientesCompras, setSaldosPendientesCompras] = useState<Record<number, number>>({})
  
  // Modales
  const [showCobroModal, setShowCobroModal] = useState(false)
  const [showPagoModal, setShowPagoModal] = useState(false)
  const [selectedVenta, setSelectedVenta] = useState<VentaOut | null>(null)
  const [selectedCompra, setSelectedCompra] = useState<CompraOut | null>(null)
  const [saldoPendiente, setSaldoPendiente] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<'pendientes' | 'movimientos'>('pendientes')
  
  // Selección múltiple para eliminación masiva
  const [selectedMovimientos, setSelectedMovimientos] = useState<Set<number>>(new Set())
  const [confirmDeleteBulk, setConfirmDeleteBulk] = useState<number[] | null>(null)
  
  const [filtros, setFiltros] = useState({
    tipo: '' as '' | 'COBRO' | 'PAGO' | 'TRANSFERENCIA',
    referencia_tipo: '' as '' | 'VENTA' | 'COMPRA',
    fecha_desde: '',
    fecha_hasta: ''
  })

  useEffect(() => {
    if (empresaId) {
      ensureTesoreriaEvents()
      reload()
      loadMetodosPago()
      loadVentas()
      loadCompras()
    }
  }, [empresaId, periodo])
  
  async function ensureTesoreriaEvents() {
    if (!empresaId || !user) return
    // Solo ADMINISTRADOR o CONTADOR pueden inicializar eventos
    if (user.role !== 'ADMINISTRADOR' && user.role !== 'CONTADOR') return
    
    try {
      // Verificar si existen los eventos de Tesorería usando auto_init
      const { listEventosContables, initJournalEngineDefaults } = await import('@/api')
      const eventos = await listEventosContables(empresaId, true) // auto_init=true crea eventos faltantes
      
      // Verificar si faltan eventos de Tesorería
      const eventosTesoreria = ['COBRO_CAJA', 'COBRO_BANCO', 'PAGO_CAJA', 'PAGO_BANCO']
      const eventosExistentes = new Set(eventos.map(e => e.tipo))
      const faltanEventos = eventosTesoreria.filter(tipo => !eventosExistentes.has(tipo))
      
      if (faltanEventos.length > 0) {
        // Inicializar eventos faltantes
        try {
          await initJournalEngineDefaults(empresaId)
          console.log('Eventos de Tesorería inicializados automáticamente')
        } catch (initErr: any) {
          console.warn('No se pudieron inicializar eventos automáticamente:', initErr)
        }
      }
    } catch (err: any) {
      console.warn('Error verificando eventos de Tesorería:', err)
    }
  }
  
  // Efecto separado para filtros (evitar recarga infinita)
  useEffect(() => {
    if (empresaId) {
      reload()
    }
  }, [filtros])

  // Cargar saldos pendientes cuando cambian las ventas/compras
  useEffect(() => {
    if (ventas.length > 0) {
      loadSaldosPendientesVentas()
    }
  }, [ventas])

  useEffect(() => {
    if (compras.length > 0) {
      loadSaldosPendientesCompras()
    }
  }, [compras])

  async function reload() {
    if (!empresaId) return
    setLoading(true)
    try {
      const params: any = { company_id: empresaId }
      if (filtros.tipo) params.tipo = filtros.tipo
      if (filtros.referencia_tipo) params.referencia_tipo = filtros.referencia_tipo
      if (filtros.fecha_desde) params.fecha_desde = filtros.fecha_desde
      if (filtros.fecha_hasta) params.fecha_hasta = filtros.fecha_hasta
      
      const data = await listMovimientosTesoreria(params)
      console.log('Movimientos cargados:', data)
      if (data && data.movimientos && Array.isArray(data.movimientos)) {
        setMovimientos(data.movimientos)
        console.log('Total movimientos:', data.movimientos.length)
      } else {
        console.warn('No se recibieron movimientos o formato incorrecto:', data)
        setMovimientos([])
      }
    } catch (err: any) {
      console.error('Error cargando movimientos:', err)
      setMovimientos([])
    } finally {
      setLoading(false)
    }
  }

  async function loadMetodosPago() {
    if (!empresaId) return
    try {
      const metodos = await listMetodosPago(empresaId)
      if (Array.isArray(metodos)) {
        setMetodosPago(metodos)
        
        // Si no hay métodos, inicializar (esto también inicializará los eventos contables)
        if (metodos.length === 0 && (user?.role === 'ADMINISTRADOR' || user?.role === 'CONTADOR')) {
          try {
            await initMetodosPago(empresaId)
            const nuevosMetodos = await listMetodosPago(empresaId)
            if (Array.isArray(nuevosMetodos)) {
              setMetodosPago(nuevosMetodos)
            }
          } catch (initErr: any) {
            console.error('Error inicializando métodos de pago:', initErr)
            // Si falla, intentar inicializar eventos contables directamente
            try {
              const { initJournalEngineDefaults } = await import('@/api')
              await initJournalEngineDefaults(empresaId)
            } catch (e) {
              console.error('Error inicializando eventos contables:', e)
            }
          }
        }
      } else {
        setMetodosPago([])
      }
    } catch (err: any) {
      console.error('Error cargando métodos de pago:', err)
      setMetodosPago([])
    }
  }

  async function loadVentas() {
    if (!empresaId) return
    try {
      const data = await listVentas(empresaId, periodo || undefined)
      setVentas(Array.isArray(data) ? data : [])
    } catch (err: any) {
      console.error('Error cargando ventas:', err)
    }
  }

  async function loadCompras() {
    if (!empresaId) return
    try {
      const data = await listCompras(empresaId, periodo || undefined)
      setCompras(Array.isArray(data) ? data : [])
    } catch (err: any) {
      console.error('Error cargando compras:', err)
    }
  }

  async function loadSaldosPendientesVentas() {
    if (!empresaId) return
    const saldos: Record<number, number> = {}
    for (const venta of ventas) {
      try {
        const saldo = await getSaldoPendienteVentaTesoreria(venta.venta_id || venta.id, empresaId)
        saldos[venta.venta_id || venta.id] = saldo.saldo_pendiente
      } catch (err) {
        // Si falla, usar el total como saldo pendiente
        saldos[venta.venta_id || venta.id] = venta.total_amount
      }
    }
    setSaldosPendientesVentas(saldos)
  }

  async function loadSaldosPendientesCompras() {
    if (!empresaId) return
    const saldos: Record<number, number> = {}
    for (const compra of compras) {
      try {
        const saldo = await getSaldoPendienteCompraTesoreria(compra.compra_id || compra.id, empresaId)
        saldos[compra.compra_id || compra.id] = saldo.saldo_pendiente
      } catch (err) {
        // Si falla, usar el total como saldo pendiente
        saldos[compra.compra_id || compra.id] = compra.total_amount
      }
    }
    setSaldosPendientesCompras(saldos)
  }

  function handleAbrirCobroModal(venta: VentaOut) {
    const saldo = saldosPendientesVentas[venta.venta_id || venta.id] ?? venta.total_amount
    setSelectedVenta(venta)
    setSaldoPendiente(saldo)
    setShowCobroModal(true)
  }

  function handleAbrirPagoModal(compra: CompraOut) {
    const saldo = saldosPendientesCompras[compra.compra_id || compra.id] ?? compra.total_amount
    setSelectedCompra(compra)
    setSaldoPendiente(saldo)
    setShowPagoModal(true)
  }

  async function handleRegistrarCobro(data: PaymentData) {
    if (!selectedVenta) return
    
    try {
      // Obtener método de pago por código
      let metodoPagoId = metodosPago.find(m => m.codigo === data.payment_method)?.id
      if (!metodoPagoId) {
        // Si no existe, usar el primero disponible o inicializar
        if (metodosPago.length === 0) {
          await initMetodosPago(empresaId)
          const nuevosMetodos = await listMetodosPago(empresaId)
          setMetodosPago(nuevosMetodos)
          metodoPagoId = nuevosMetodos.find(m => m.codigo === data.payment_method)?.id || nuevosMetodos[0]?.id
        } else {
          metodoPagoId = metodosPago[0]?.id
        }
      }
      
      if (!metodoPagoId) {
        throw new Error('No se encontró un método de pago válido')
      }

      await registrarCobroTesoreria({
        company_id: empresaId,
        venta_id: selectedVenta.venta_id || selectedVenta.id,
        monto: data.amount,
        fecha: data.payment_date,
        metodo_pago_id: metodoPagoId,
        glosa: data.notes || `Cobro ${selectedVenta.doc_type} ${selectedVenta.series}-${selectedVenta.number}`,
        usar_motor: true
      })
      
      setShowCobroModal(false)
      setSelectedVenta(null)
      setSaldoPendiente(null)
      reload()
      loadVentas()
      // Recargar saldos pendientes después de un momento para que se actualicen
      setTimeout(() => {
        loadSaldosPendientesVentas()
      }, 500)
    } catch (err: any) {
      throw err
    }
  }

  async function handleRegistrarPago(data: PaymentData) {
    if (!selectedCompra) return
    
    try {
      // Obtener método de pago por código
      let metodoPagoId = metodosPago.find(m => m.codigo === data.payment_method)?.id
      if (!metodoPagoId) {
        // Si no existe, usar el primero disponible o inicializar
        if (metodosPago.length === 0) {
          await initMetodosPago(empresaId)
          const nuevosMetodos = await listMetodosPago(empresaId)
          setMetodosPago(nuevosMetodos)
          metodoPagoId = nuevosMetodos.find(m => m.codigo === data.payment_method)?.id || nuevosMetodos[0]?.id
        } else {
          metodoPagoId = metodosPago[0]?.id
        }
      }
      
      if (!metodoPagoId) {
        throw new Error('No se encontró un método de pago válido')
      }

      await registrarPagoTesoreria({
        company_id: empresaId,
        compra_id: selectedCompra.compra_id || selectedCompra.id,
        monto: data.amount,
        fecha: data.payment_date,
        metodo_pago_id: metodoPagoId,
        glosa: data.notes || `Pago ${selectedCompra.doc_type} ${selectedCompra.series}-${selectedCompra.number}`,
        usar_motor: true
      })
      
      setShowPagoModal(false)
      setSelectedCompra(null)
      setSaldoPendiente(null)
      reload()
      loadCompras()
      // Recargar saldos pendientes después de un momento para que se actualicen
      setTimeout(() => {
        loadSaldosPendientesCompras()
      }, 500)
    } catch (err: any) {
      throw err
    }
  }

  async function handleEliminarMovimiento(movimientoId: number) {
    if (!empresaId) return
    
    // Mostrar modal de confirmación con estilo mejorado
    setConfirmDeleteBulk([movimientoId])
  }

  async function handleEliminarMovimientosMasivo() {
    if (!empresaId || !confirmDeleteBulk || confirmDeleteBulk.length === 0) return
    
    try {
      const result = await eliminarMovimientosTesoreriaMasivo(confirmDeleteBulk, empresaId)
      
      if (result.errores && result.errores.length > 0) {
        alert(`Se eliminaron ${result.eliminados} de ${result.total_solicitados} movimiento(s).\n\nErrores:\n${result.errores.join('\n')}`)
      } else {
        // Éxito completo
        setSelectedMovimientos(new Set())
      }
      
      setConfirmDeleteBulk(null)
      reload()
      loadVentas()
      loadCompras()
      // Recargar saldos pendientes después de un momento
      setTimeout(() => {
        loadSaldosPendientesVentas()
        loadSaldosPendientesCompras()
      }, 500)
    } catch (err: any) {
      alert(`Error al eliminar movimientos: ${err.message}`)
      setConfirmDeleteBulk(null)
    }
  }

  function toggleMovimientoSelection(movimientoId: number) {
    const newSelected = new Set(selectedMovimientos)
    if (newSelected.has(movimientoId)) {
      newSelected.delete(movimientoId)
    } else {
      newSelected.add(movimientoId)
    }
    setSelectedMovimientos(newSelected)
  }

  function toggleSelectAll() {
    const movimientosRegistrados = movimientos.filter(m => m.estado === 'REGISTRADO')
    if (selectedMovimientos.size === movimientosRegistrados.length) {
      setSelectedMovimientos(new Set())
    } else {
      setSelectedMovimientos(new Set(movimientosRegistrados.map(m => m.id)))
    }
  }

  function handleEliminarSeleccionados() {
    const ids = Array.from(selectedMovimientos)
    if (ids.length === 0) return
    setConfirmDeleteBulk(ids)
  }

  // Calcular totales - los movimientos de Tesorería tienen tipo 'COBRO' o 'PAGO'
  const totalCobros = Array.isArray(movimientos) 
    ? movimientos
        .filter(m => m && m.tipo === 'COBRO')
        .reduce((sum, m) => {
          const monto = typeof m.monto === 'string' ? parseFloat(m.monto) : (typeof m.monto === 'number' ? m.monto : 0)
          return sum + (isNaN(monto) ? 0 : monto)
        }, 0)
    : 0
  
  const totalPagos = Array.isArray(movimientos)
    ? movimientos
        .filter(m => m && m.tipo === 'PAGO')
        .reduce((sum, m) => {
          const monto = typeof m.monto === 'string' ? parseFloat(m.monto) : (typeof m.monto === 'number' ? m.monto : 0)
          return sum + (isNaN(monto) ? 0 : monto)
        }, 0)
    : 0
  
  const saldoNeto = totalCobros - totalPagos
  
  // Debug: mostrar valores calculados
  console.log('Totales calculados:', { totalCobros, totalPagos, saldoNeto, movimientosCount: movimientos?.length || 0 })

  if (!empresaId) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Tesorería"
          subtitle="Gestión de cobros, pagos y transferencias"
          icon={Wallet}
        />
        <Card>
          <CardHeader>
            <p className="text-gray-500">Seleccione una empresa para continuar</p>
          </CardHeader>
        </Card>
      </div>
    )
  }

  // Columnas para tabla de ventas
  const ventasColumns: DataTableColumn<VentaOut>[] = [
    {
      key: 'documento',
      label: 'Documento',
      render: (v) => `${v.doc_type} ${v.series}-${v.number}`,
    },
    {
      key: 'fecha',
      label: 'Fecha',
      render: (v) => formatDate(v.issue_date),
    },
    {
      key: 'total',
      label: 'Total',
      render: (v) => formatCurrency(v.total_amount),
      className: 'text-right',
    },
    {
      key: 'saldo',
      label: 'Saldo Pendiente',
      render: (v) => {
        const saldo = saldosPendientesVentas[v.venta_id || v.id] ?? v.total_amount
        return (
          <span className={saldo < 0.01 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}>
            {formatCurrency(saldo)}
          </span>
        )
      },
      className: 'text-right',
    },
    {
      key: 'acciones',
      label: 'Acciones',
      render: (v) => {
        const saldo = saldosPendientesVentas[v.venta_id || v.id] ?? v.total_amount
        if (saldo < 0.01) return <span className="text-sm text-gray-400">Cobrado</span>
        return (
          <Button onClick={() => handleAbrirCobroModal(v)} size="sm" variant="default">
            <DollarSign className="w-4 h-4 mr-1" />
            Cobrar
          </Button>
        )
      },
    },
  ]

  // Columnas para tabla de compras
  const comprasColumns: DataTableColumn<CompraOut>[] = [
    {
      key: 'documento',
      label: 'Documento',
      render: (c) => `${c.doc_type} ${c.series}-${c.number}`,
    },
    {
      key: 'fecha',
      label: 'Fecha',
      render: (c) => formatDate(c.issue_date),
    },
    {
      key: 'total',
      label: 'Total',
      render: (c) => formatCurrency(c.total_amount),
      className: 'text-right',
    },
    {
      key: 'saldo',
      label: 'Saldo Pendiente',
      render: (c) => {
        const saldo = saldosPendientesCompras[c.compra_id || c.id] ?? c.total_amount
        return (
          <span className={saldo < 0.01 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}>
            {formatCurrency(saldo)}
          </span>
        )
      },
      className: 'text-right',
    },
    {
      key: 'acciones',
      label: 'Acciones',
      render: (c) => {
        const saldo = saldosPendientesCompras[c.compra_id || c.id] ?? c.total_amount
        if (saldo < 0.01) return <span className="text-sm text-gray-400">Pagado</span>
        return (
          <Button onClick={() => handleAbrirPagoModal(c)} size="sm" variant="default">
            <DollarSign className="w-4 h-4 mr-1" />
            Pagar
          </Button>
        )
      },
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <Breadcrumbs />
      
      <PageHeader
        title="Tesorería"
        subtitle="Gestión de cobros, pagos y transferencias"
        icon={Wallet}
        iconColor="primary"
        actions={
          <ActionBar
            onRefresh={reload}
            loading={loading}
          />
        }
      />

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Cobros</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {formatCurrency(Number(totalCobros) || 0)}
                </p>
              </div>
              <ArrowDownCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </Card>
        
        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Pagos</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {formatCurrency(Number(totalPagos) || 0)}
                </p>
              </div>
              <ArrowUpCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
          </div>
        </Card>
        
        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Saldo Neto</p>
                <p className={`text-2xl font-bold ${(Number(saldoNeto) || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {formatCurrency(Number(saldoNeto) || 0)}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-gray-600 dark:text-gray-400" />
            </div>
          </div>
        </Card>
      </div>

      {/* Pestañas */}
      <div className="space-y-4">
        <div className="inline-flex h-10 items-center justify-center rounded-lg bg-gray-100 p-1 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          <TabsTriggerWithValue
            value="pendientes"
            activeValue={activeTab}
            onValueChange={(v) => setActiveTab(v as 'pendientes' | 'movimientos')}
            className="flex items-center gap-2"
          >
            <FileText className="w-4 h-4" />
            Pendientes
          </TabsTriggerWithValue>
          <TabsTriggerWithValue
            value="movimientos"
            activeValue={activeTab}
            onValueChange={(v) => setActiveTab(v as 'pendientes' | 'movimientos')}
            className="flex items-center gap-2"
          >
            <List className="w-4 h-4" />
            Movimientos
          </TabsTriggerWithValue>
        </div>

        {/* Contenido de pestaña: Pendientes */}
        <TabsContentWithValue value="pendientes" activeValue={activeTab}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Ventas pendientes */}
            <Card>
              <CardHeader title="Ventas Pendientes de Cobro" />
              <DataTable
                data={ventas.filter(v => {
                  const saldo = saldosPendientesVentas[v.venta_id || v.id] ?? v.total_amount
                  return saldo >= 0.01
                })}
                columns={ventasColumns}
                loading={loading}
                emptyMessage="No hay ventas pendientes de cobro"
              />
            </Card>

            {/* Compras pendientes */}
            <Card>
              <CardHeader title="Compras Pendientes de Pago" />
              <DataTable
                data={compras.filter(c => {
                  const saldo = saldosPendientesCompras[c.compra_id || c.id] ?? c.total_amount
                  return saldo >= 0.01
                })}
                columns={comprasColumns}
                loading={loading}
                emptyMessage="No hay compras pendientes de pago"
              />
            </Card>
          </div>
        </TabsContentWithValue>

        {/* Contenido de pestaña: Movimientos */}
        <TabsContentWithValue value="movimientos" activeValue={activeTab}>
          <div className="space-y-4">
            {/* Filtros */}
            <Card>
              <CardHeader>
                <div className="flex flex-wrap gap-4">
                  <select
                    value={filtros.tipo}
                    onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value as any })}
                    className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
                  >
                    <option value="">Todos los tipos</option>
                    <option value="COBRO">Cobros</option>
                    <option value="PAGO">Pagos</option>
                    <option value="TRANSFERENCIA">Transferencias</option>
                  </select>
                  
                  <select
                    value={filtros.referencia_tipo}
                    onChange={(e) => setFiltros({ ...filtros, referencia_tipo: e.target.value as any })}
                    className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
                  >
                    <option value="">Todas las referencias</option>
                    <option value="VENTA">Ventas</option>
                    <option value="COMPRA">Compras</option>
                  </select>
                  
                  <input
                    type="date"
                    value={filtros.fecha_desde}
                    onChange={(e) => setFiltros({ ...filtros, fecha_desde: e.target.value })}
                    placeholder="Fecha desde"
                    className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
                  />
                  
                  <input
                    type="date"
                    value={filtros.fecha_hasta}
                    onChange={(e) => setFiltros({ ...filtros, fecha_hasta: e.target.value })}
                    placeholder="Fecha hasta"
                    className="px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
                  />
                  
                  <Button onClick={reload} variant="outline">
                    <Search className="w-4 h-4 mr-2" />
                    Filtrar
                  </Button>
                </div>
              </CardHeader>
            </Card>

            {/* Barra de acciones para eliminación masiva */}
            {selectedMovimientos.size > 0 && (
              <Card key="bulk-delete-bar" className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                    <span className="font-medium text-red-900 dark:text-red-100">
                      {selectedMovimientos.size} movimiento(s) seleccionado(s)
                    </span>
                  </div>
                  <Button
                    key="bulk-delete-button"
                    onClick={handleEliminarSeleccionados}
                    className="bg-red-600 hover:bg-red-700 text-white dark:bg-red-700 dark:hover:bg-red-800"
                  >
                    <Trash className="w-4 h-4 mr-2" />
                    Eliminar Seleccionados
                  </Button>
                </div>
              </Card>
            )}

            {/* Tabla de movimientos */}
            <Card>
              <CardHeader title="Movimientos de Tesorería" />
              
              {loading ? (
                <div className="p-8 text-center">Cargando...</div>
              ) : movimientos.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No hay movimientos registrados
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableHeaderCell>
                      <input
                        type="checkbox"
                        checked={movimientos.filter(m => m.estado === 'REGISTRADO').length > 0 && 
                                 selectedMovimientos.size === movimientos.filter(m => m.estado === 'REGISTRADO').length}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                      />
                    </TableHeaderCell>
                    <TableHeaderCell>Fecha</TableHeaderCell>
                    <TableHeaderCell>Tipo</TableHeaderCell>
                    <TableHeaderCell>Referencia</TableHeaderCell>
                    <TableHeaderCell>Método de Pago</TableHeaderCell>
                    <TableHeaderCell>Monto</TableHeaderCell>
                    <TableHeaderCell>Estado</TableHeaderCell>
                    <TableHeaderCell>Asiento</TableHeaderCell>
                    <TableHeaderCell>Acciones</TableHeaderCell>
                  </TableHeader>
                  <TableBody>
                    {movimientos.map((mov) => (
                      <TableRow key={mov.id}>
                        <TableCell>
                          {mov.estado === 'REGISTRADO' ? (
                            <input
                              type="checkbox"
                              checked={selectedMovimientos.has(mov.id)}
                              onChange={() => toggleMovimientoSelection(mov.id)}
                              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                            />
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>{formatDate(mov.fecha)}</TableCell>
                        <TableCell>
                          {mov.tipo === 'COBRO' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                              <ArrowDownCircle className="w-3 h-3" /> COBRO
                            </span>
                          ) : mov.tipo === 'PAGO' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                              <ArrowUpCircle className="w-3 h-3" /> PAGO
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                              TRANSFERENCIA
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {mov.referencia_tipo} #{mov.referencia_id}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {mov.metodo_pago_codigo === 'EFECTIVO' ? (
                              <DollarSign className="w-4 h-4 text-gray-500" />
                            ) : mov.metodo_pago_codigo === 'TRANSFERENCIA' || mov.metodo_pago_codigo === 'YAPE' || mov.metodo_pago_codigo === 'PLIN' ? (
                              <Building2 className="w-4 h-4 text-blue-500" />
                            ) : (
                              <CreditCard className="w-4 h-4 text-purple-500" />
                            )}
                            <span>{mov.metodo_pago_descripcion}</span>
                          </div>
                        </TableCell>
                        <TableCell className={mov.tipo === 'COBRO' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                          {mov.tipo === 'COBRO' ? '+' : '-'}{formatCurrency(Number(mov.monto))}
                        </TableCell>
                        <TableCell>
                          {mov.estado === 'REGISTRADO' ? (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-500" />
                          )}
                        </TableCell>
                        <TableCell>
                          {mov.journal_entry_id ? (
                            <a 
                              href={`/asientos?entry_id=${mov.journal_entry_id}`} 
                              className="text-blue-600 hover:underline dark:text-blue-400"
                              onClick={(e) => {
                                e.preventDefault()
                                window.location.href = `/asientos?entry_id=${mov.journal_entry_id}`
                              }}
                            >
                              #{mov.journal_entry_id}
                            </a>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {mov.estado === 'REGISTRADO' ? (
                            <Button
                              onClick={() => handleEliminarMovimiento(mov.id)}
                              variant="ghost"
                              size="md"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 border border-red-300 dark:border-red-700 rounded-lg hover:border-red-500 dark:hover:border-red-500 hover:shadow-sm transition-all"
                              title="Eliminar movimiento"
                            >
                              <Trash2 className="w-6 h-6" />
                            </Button>
                          ) : (
                            <span className="text-sm text-gray-400">Anulado</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </div>
        </TabsContentWithValue>
      </div>

      {/* Modal de Cobro */}
      {showCobroModal && selectedVenta && (
        <PaymentModal
          isOpen={showCobroModal}
          onClose={() => {
            setShowCobroModal(false)
            setSelectedVenta(null)
            setSaldoPendiente(null)
          }}
          onConfirm={handleRegistrarCobro}
          type="COLLECTION"
          totalAmount={selectedVenta.total_amount}
          saldoPendiente={saldoPendiente || undefined}
          title="Registrar Cobro"
          documentNumber={`${selectedVenta.doc_type} ${selectedVenta.series}-${selectedVenta.number}`}
        />
      )}

      {/* Modal de Pago */}
      {showPagoModal && selectedCompra && (
        <PaymentModal
          isOpen={showPagoModal}
          onClose={() => {
            setShowPagoModal(false)
            setSelectedCompra(null)
            setSaldoPendiente(null)
          }}
          onConfirm={handleRegistrarPago}
          type="PAYMENT"
          totalAmount={selectedCompra.total_amount}
          saldoPendiente={saldoPendiente || undefined}
          title="Registrar Pago"
          documentNumber={`${selectedCompra.doc_type} ${selectedCompra.series}-${selectedCompra.number}`}
        />
      )}

      {/* Modal de Confirmación de Eliminación */}
      {confirmDeleteBulk && confirmDeleteBulk.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setConfirmDeleteBulk(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="text-lg font-bold mb-2 text-red-600 dark:text-red-400">
              {confirmDeleteBulk.length === 1 ? 'Eliminar Movimiento' : 'Eliminar Movimientos'}
            </div>
            <div className="text-sm text-gray-700 dark:text-gray-300">
              Esta acción es <span className="font-semibold text-red-600 dark:text-red-400">irreversible</span>. 
              {confirmDeleteBulk.length === 1 ? (
                <>
                  <br /><br />
                  Se eliminará el movimiento y se anulará su asiento contable asociado.
                  <br /><br />
                  ¿Desea continuar?
                </>
              ) : (
                <>
                  <br /><br />
                  Se eliminarán <span className="font-semibold">{confirmDeleteBulk.length} movimiento(s)</span> y se anularán sus asientos contables asociados.
                  <br /><br />
                  ¿Desea continuar?
                </>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmDeleteBulk(null)}>Cancelar</Button>
              <Button className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800" onClick={handleEliminarMovimientosMasivo}>
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
