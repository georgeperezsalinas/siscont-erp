import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Table, TableHeader, TableHeaderCell, TableBody, TableRow, TableCell } from '@/components/ui/Table'
import { PageHeader } from '@/components/ui/PageHeader'
import { ActionBar } from '@/components/ui/ActionBar'
import { FilterBar } from '@/components/ui/FilterBar'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, Search, Filter, Download, Edit2, Trash2, Package, TrendingUp, TrendingDown, Eye, CheckCircle, XCircle, ScrollText, AlertCircle, ArrowUp, ArrowDown } from 'lucide-react'
import { 
  listProducts, createProduct, updateProduct, deleteProduct, getProduct,
  listMovimientosInventario, createMovimientoInventario, getStock,
  listAlmacenes, createAlmacen,
  registrarEntradaInventario, registrarSalidaInventario, ajustarStockInventario,
  obtenerKardex, obtenerStock, eliminarMovimientoInventario,
  type Product, type ProductIn, type ProductUpdate,
  type MovimientoInventarioIn, type MovimientoInventarioOut,
  type Almacen, type AlmacenIn,
  type EntradaInventarioIn, type SalidaInventarioIn, type AjusteInventarioIn,
  type MovimientoInventarioV2Out, type KardexRow, type StockRow
} from '@/api'
import { useOrg } from '@/stores/org'

const UNIDADES_MEDIDA = ['UN', 'KG', 'M2', 'M3', 'L', 'MT', 'CJ', 'BL'] as const

export default function Inventarios() {
  const { empresaId } = useOrg()
  const navigate = useNavigate()
  
  // Estados para Productos
  const [products, setProducts] = useState<Product[]>([])
  const [productsLoading, setProductsLoading] = useState(true)
  const [showProductForm, setShowProductForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [confirmDeleteProduct, setConfirmDeleteProduct] = useState<Product | null>(null)
  const [productForm, setProductForm] = useState<ProductIn>({
    company_id: empresaId || 0,
    code: '',
    name: '',
    description: '',
    unit_of_measure: 'UN',
    account_code: '20.10'
  })
  
  // Estados para Movimientos
  const [movimientos, setMovimientos] = useState<MovimientoInventarioOut[]>([])
  const [movimientosLoading, setMovimientosLoading] = useState(true)
  const [showMovimientoForm, setShowMovimientoForm] = useState(false)
  const [movimientoForm, setMovimientoForm] = useState<MovimientoInventarioIn>({
    company_id: empresaId || 0,
    product_id: 0,
    movement_type: 'ENTRADA',
    quantity: 0,
    unit_cost: null,
    movement_date: new Date().toISOString().split('T')[0],
    reference: null,
    reference_type: null,
    reference_id: null,
    glosa: null,
    credit_account_code: null
  })
  
  // Estados para Almacenes
  const [almacenes, setAlmacenes] = useState<Almacen[]>([])
  const [almacenesLoading, setAlmacenesLoading] = useState(false)
  const [showAlmacenForm, setShowAlmacenForm] = useState(false)
  const [almacenForm, setAlmacenForm] = useState<AlmacenIn>({
    company_id: empresaId || 0,
    codigo: '',
    nombre: '',
    activo: true
  })
  
  // Estados para nuevos movimientos (v2)
  const [showEntradaForm, setShowEntradaForm] = useState(false)
  const [showSalidaForm, setShowSalidaForm] = useState(false)
  const [showAjusteForm, setShowAjusteForm] = useState(false)
  const [entradaForm, setEntradaForm] = useState<EntradaInventarioIn>({
    company_id: empresaId || 0,
    producto_id: 0,
    almacen_id: null,
    cantidad: 0,
    costo_unitario: 0,
    fecha: new Date().toISOString().split('T')[0],
    referencia_tipo: null,
    referencia_id: null,
    glosa: null,
    usar_motor: true
  })
  const [salidaForm, setSalidaForm] = useState<SalidaInventarioIn>({
    company_id: empresaId || 0,
    producto_id: 0,
    almacen_id: null,
    cantidad: 0,
    fecha: new Date().toISOString().split('T')[0],
    referencia_tipo: null,
    referencia_id: null,
    glosa: null,
    usar_motor: true
  })
  const [ajusteForm, setAjusteForm] = useState<AjusteInventarioIn>({
    company_id: empresaId || 0,
    producto_id: 0,
    almacen_id: null,
    cantidad: 0,
    motivo: '',
    fecha: new Date().toISOString().split('T')[0],
    usar_motor: true
  })
  
  // Estados para Kardex y Stock
  const [kardex, setKardex] = useState<KardexRow[]>([])
  const [stockData, setStockData] = useState<StockRow[]>([])
  const [kardexLoading, setKardexLoading] = useState(false)
  const [stockLoading, setStockLoading] = useState(false)
  const [confirmDeleteMovimiento, setConfirmDeleteMovimiento] = useState<{ id: number; tipo: string; fecha: string } | null>(null)
  // Filtros Kardex
  const [kardexProductoId, setKardexProductoId] = useState<number | ''>('')
  const [kardexAlmacenId, setKardexAlmacenId] = useState<number | ''>('')
  const [kardexFechaDesde, setKardexFechaDesde] = useState('')
  const [kardexFechaHasta, setKardexFechaHasta] = useState('')
  
  // Estados de UI
  const [activeTab, setActiveTab] = useState<'productos' | 'almacenes' | 'movimientos' | 'kardex' | 'stock'>('productos')
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<string>('')
  const [messageModal, setMessageModal] = useState<{ type: 'success' | 'error'; title: string; message: string } | null>(null)
  
  useEffect(() => {
    if (empresaId) {
      reloadProducts()
      reloadMovimientos()
      reloadAlmacenes()
    }
  }, [empresaId])
  
  useEffect(() => {
    if (empresaId) {
      if (activeTab === 'kardex') {
        reloadKardex()
      } else if (activeTab === 'stock') {
        reloadStock()
      }
    }
  }, [empresaId, activeTab])
  
  useEffect(() => {
    setProductForm(f => ({ ...f, company_id: empresaId || 0 }))
    setMovimientoForm(f => ({ ...f, company_id: empresaId || 0 }))
    setAlmacenForm(f => ({ ...f, company_id: empresaId || 0 }))
    setEntradaForm(f => ({ ...f, company_id: empresaId || 0 }))
    setSalidaForm(f => ({ ...f, company_id: empresaId || 0 }))
    setAjusteForm(f => ({ ...f, company_id: empresaId || 0 }))
  }, [empresaId])
  
  async function reloadProducts() {
    if (!empresaId) return
    try {
      setProductsLoading(true)
      const data = await listProducts(empresaId, true)
      setProducts(data)
    } catch (error: any) {
      showMessage('error', 'Error', `Error al cargar productos: ${error.message || error}`)
    } finally {
      setProductsLoading(false)
    }
  }
  
  async function reloadMovimientos() {
    if (!empresaId) return
    try {
      setMovimientosLoading(true)
      const data = await listMovimientosInventario(empresaId)
      setMovimientos(data)
    } catch (error: any) {
      showMessage('error', 'Error', `Error al cargar movimientos: ${error.message || error}`)
    } finally {
      setMovimientosLoading(false)
    }
  }
  
  async function reloadAlmacenes() {
    if (!empresaId) return
    try {
      setAlmacenesLoading(true)
      const data = await listAlmacenes(empresaId)
      setAlmacenes(data)
    } catch (error: any) {
      showMessage('error', 'Error', `Error al cargar almacenes: ${error.message || error}`)
    } finally {
      setAlmacenesLoading(false)
    }
  }
  
  async function reloadKardex(opts?: { producto_id?: number | ''; almacen_id?: number | ''; fecha_desde?: string; fecha_hasta?: string }) {
    if (!empresaId) return
    const pId = opts?.producto_id !== undefined ? opts.producto_id : kardexProductoId
    const aId = opts?.almacen_id !== undefined ? opts.almacen_id : kardexAlmacenId
    const fDesde = opts?.fecha_desde !== undefined ? opts.fecha_desde : kardexFechaDesde
    const fHasta = opts?.fecha_hasta !== undefined ? opts.fecha_hasta : kardexFechaHasta
    try {
      setKardexLoading(true)
      const data = await obtenerKardex(
        empresaId,
        pId || undefined,
        aId || undefined,
        fDesde || undefined,
        fHasta || undefined
      )
      setKardex(data)
    } catch (error: any) {
      showMessage('error', 'Error', `Error al cargar kardex: ${error.message || error}`)
    } finally {
      setKardexLoading(false)
    }
  }
  
  async function reloadStock() {
    if (!empresaId) return
    try {
      setStockLoading(true)
      const data = await obtenerStock(empresaId)
      setStockData(data)
    } catch (error: any) {
      showMessage('error', 'Error', `Error al cargar stock: ${error.message || error}`)
    } finally {
      setStockLoading(false)
    }
  }
  
  async function doDeleteMovimiento() {
    if (!confirmDeleteMovimiento || !empresaId) return
    try {
      await eliminarMovimientoInventario(confirmDeleteMovimiento.id, empresaId)
      showMessage('success', 'Movimiento Eliminado', `El movimiento de ${confirmDeleteMovimiento.tipo} del ${formatDate(confirmDeleteMovimiento.fecha)} ha sido eliminado exitosamente`)
      setConfirmDeleteMovimiento(null)
      if (activeTab === 'movimientos') reloadMovimientos()
      if (activeTab === 'kardex') reloadKardex()
      if (activeTab === 'stock') reloadStock()
    } catch (error: any) {
      showMessage('error', 'Error', `Error al eliminar movimiento: ${error.message || error}`)
    }
  }
  
  function showMessage(type: 'success' | 'error', title: string, message: string) {
    setMessageModal({ type, title, message })
    setTimeout(() => setMessageModal(null), 5000)
  }
  
  // Funciones de Productos
  function openCreateProduct() {
    setEditingProduct(null)
    setProductForm({
      company_id: empresaId || 0,
      code: '',
      name: '',
      description: '',
      unit_of_measure: 'UN',
      account_code: '20.10'
    })
    setShowProductForm(true)
  }
  
  function openEditProduct(product: Product) {
    setEditingProduct(product)
    setProductForm({
      company_id: product.company_id,
      code: product.code,
      name: product.name,
      description: product.description || '',
      unit_of_measure: product.unit_of_measure,
      account_code: product.account_code
    })
    setShowProductForm(true)
  }
  
  async function saveProduct() {
    if (!productForm.code.trim() || !productForm.name.trim()) {
      showMessage('error', 'Error de Validación', 'Código y nombre son obligatorios')
      return
    }
    
    try {
      if (editingProduct) {
        const updateData: ProductUpdate = {
          code: productForm.code.trim(),
          name: productForm.name.trim(),
          description: productForm.description || null,
          unit_of_measure: productForm.unit_of_measure,
          account_code: productForm.account_code
        }
        await updateProduct(editingProduct.id, updateData)
        showMessage('success', 'Producto Actualizado', `El producto "${productForm.name}" ha sido actualizado exitosamente`)
      } else {
        await createProduct(productForm)
        showMessage('success', 'Producto Creado', `El producto "${productForm.name}" ha sido creado exitosamente`)
      }
      setShowProductForm(false)
      setEditingProduct(null)
      reloadProducts()
    } catch (error: any) {
      showMessage('error', 'Error', `Error al guardar producto: ${error.message || error}`)
    }
  }
  
  async function doDeleteProduct() {
    if (!confirmDeleteProduct) return
    try {
      await deleteProduct(confirmDeleteProduct.id)
      showMessage('success', 'Producto Eliminado', `El producto "${confirmDeleteProduct.name}" ha sido eliminado`)
      setConfirmDeleteProduct(null)
      reloadProducts()
    } catch (error: any) {
      showMessage('error', 'Error', `Error al eliminar producto: ${error.message || error}`)
    }
  }
  
  // Funciones de Movimientos
  function openCreateMovimiento() {
    if (products.length === 0) {
      showMessage('error', 'Sin Productos', 'Debe crear al menos un producto antes de registrar movimientos')
      return
    }
    setMovimientoForm({
      company_id: empresaId || 0,
      product_id: products[0]?.id || 0,
      movement_type: 'ENTRADA',
      quantity: 0,
      unit_cost: null,
      movement_date: new Date().toISOString().split('T')[0],
      reference: null,
      reference_type: null,
      reference_id: null,
      glosa: null,
      credit_account_code: null
    })
    setShowMovimientoForm(true)
  }
  
  async function saveMovimiento() {
    if (!movimientoForm.product_id || movimientoForm.quantity <= 0) {
      showMessage('error', 'Error de Validación', 'Debe seleccionar un producto y una cantidad válida')
      return
    }
    
    if (movimientoForm.movement_type === 'ENTRADA' && (!movimientoForm.unit_cost || movimientoForm.unit_cost <= 0)) {
      showMessage('error', 'Error de Validación', 'El costo unitario es obligatorio para entradas')
      return
    }
    
    try {
      await createMovimientoInventario(movimientoForm)
      showMessage('success', 'Movimiento Registrado', 'El movimiento de inventario ha sido registrado exitosamente y se ha generado el asiento contable automáticamente')
      setShowMovimientoForm(false)
      reloadMovimientos()
      reloadProducts() // Actualizar stock
    } catch (error: any) {
      showMessage('error', 'Error', `Error al registrar movimiento: ${error.message || error}`)
    }
  }
  
  // Funciones de Almacenes
  function openCreateAlmacen() {
    setAlmacenForm({
      company_id: empresaId || 0,
      codigo: '',
      nombre: '',
      activo: true
    })
    setShowAlmacenForm(true)
  }
  
  async function saveAlmacen() {
    if (!almacenForm.codigo.trim() || !almacenForm.nombre.trim()) {
      showMessage('error', 'Error de Validación', 'Código y nombre son obligatorios')
      return
    }
    
    try {
      await createAlmacen(almacenForm)
      showMessage('success', 'Almacén Creado', `El almacén "${almacenForm.nombre}" ha sido creado exitosamente`)
      setShowAlmacenForm(false)
      reloadAlmacenes()
    } catch (error: any) {
      showMessage('error', 'Error', `Error al crear almacén: ${error.message || error}`)
    }
  }
  
  // Funciones de nuevos movimientos (v2)
  function openCreateEntrada() {
    if (products.length === 0) {
      showMessage('error', 'Sin Productos', 'Debe crear al menos un producto antes de registrar entradas')
      return
    }
    setEntradaForm({
      company_id: empresaId || 0,
      producto_id: products[0]?.id || 0,
      almacen_id: null,
      cantidad: 0,
      costo_unitario: 0,
      fecha: new Date().toISOString().split('T')[0],
      referencia_tipo: null,
      referencia_id: null,
      glosa: null,
      usar_motor: true
    })
    setShowEntradaForm(true)
  }
  
  function openCreateSalida() {
    if (products.length === 0) {
      showMessage('error', 'Sin Productos', 'Debe crear al menos un producto antes de registrar salidas')
      return
    }
    setSalidaForm({
      company_id: empresaId || 0,
      producto_id: products[0]?.id || 0,
      almacen_id: null,
      cantidad: 0,
      fecha: new Date().toISOString().split('T')[0],
      referencia_tipo: null,
      referencia_id: null,
      glosa: null,
      usar_motor: true
    })
    setShowSalidaForm(true)
  }
  
  function openCreateAjuste() {
    if (products.length === 0) {
      showMessage('error', 'Sin Productos', 'Debe crear al menos un producto antes de registrar ajustes')
      return
    }
    setAjusteForm({
      company_id: empresaId || 0,
      producto_id: products[0]?.id || 0,
      almacen_id: null,
      cantidad: 0,
      motivo: '',
      fecha: new Date().toISOString().split('T')[0],
      usar_motor: true
    })
    setShowAjusteForm(true)
  }
  
  async function saveEntrada() {
    if (!entradaForm.producto_id || entradaForm.cantidad <= 0 || entradaForm.costo_unitario <= 0) {
      showMessage('error', 'Error de Validación', 'Debe completar todos los campos requeridos')
      return
    }
    
    try {
      await registrarEntradaInventario(entradaForm)
      showMessage('success', 'Entrada Registrada', 'La entrada de inventario ha sido registrada exitosamente y se ha generado el asiento contable automáticamente')
      setShowEntradaForm(false)
      reloadMovimientos()
      reloadProducts()
      if (activeTab === 'kardex') reloadKardex()
      if (activeTab === 'stock') reloadStock()
    } catch (error: any) {
      showMessage('error', 'Error', `Error al registrar entrada: ${error.message || error}`)
    }
  }
  
  async function saveSalida() {
    if (!salidaForm.producto_id || salidaForm.cantidad <= 0) {
      showMessage('error', 'Error de Validación', 'Debe seleccionar un producto y una cantidad válida')
      return
    }
    
    try {
      await registrarSalidaInventario(salidaForm)
      showMessage('success', 'Salida Registrada', 'La salida de inventario ha sido registrada exitosamente y se ha generado el asiento contable automáticamente')
      setShowSalidaForm(false)
      reloadMovimientos()
      reloadProducts()
      if (activeTab === 'kardex') reloadKardex()
      if (activeTab === 'stock') reloadStock()
    } catch (error: any) {
      showMessage('error', 'Error', `Error al registrar salida: ${error.message || error}`)
    }
  }
  
  async function saveAjuste() {
    if (!ajusteForm.producto_id || ajusteForm.cantidad === 0 || !ajusteForm.motivo.trim()) {
      showMessage('error', 'Error de Validación', 'Debe completar todos los campos requeridos. La cantidad debe ser diferente de cero.')
      return
    }
    
    try {
      await ajustarStockInventario(ajusteForm)
      showMessage('success', 'Ajuste Registrado', 'El ajuste de inventario ha sido registrado exitosamente y se ha generado el asiento contable automáticamente')
      setShowAjusteForm(false)
      reloadMovimientos()
      reloadProducts()
      if (activeTab === 'kardex') reloadKardex()
      if (activeTab === 'stock') reloadStock()
    } catch (error: any) {
      showMessage('error', 'Error', `Error al registrar ajuste: ${error.message || error}`)
    }
  }
  
  // Filtros y cálculos
  const filteredProducts = useMemo(() => {
    if (!searchTerm) return products
    const term = searchTerm.toLowerCase()
    return products.filter(p => 
      p.code.toLowerCase().includes(term) ||
      p.name.toLowerCase().includes(term) ||
      (p.description && p.description.toLowerCase().includes(term))
    )
  }, [products, searchTerm])
  
  const filteredMovimientos = useMemo(() => {
    let result = movimientos
    if (filterType) {
      result = result.filter(m => m.movement_type === filterType)
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(m =>
        (m.product_code && m.product_code.toLowerCase().includes(term)) ||
        (m.product_name && m.product_name.toLowerCase().includes(term)) ||
        (m.reference && m.reference.toLowerCase().includes(term)) ||
        (m.glosa && m.glosa.toLowerCase().includes(term))
      )
    }
    return result
  }, [movimientos, filterType, searchTerm])
  
  const stats = useMemo(() => {
    const entradas = movimientos.filter(m => m.movement_type === 'ENTRADA')
    const salidas = movimientos.filter(m => m.movement_type === 'SALIDA')
    
    const totalEntradas = entradas.reduce((sum, m) => sum + Number(m.quantity), 0)
    const totalSalidas = salidas.reduce((sum, m) => sum + Number(m.quantity), 0)
    const valorEntradas = entradas.reduce((sum, m) => sum + Number(m.total_cost), 0)
    const valorSalidas = salidas.reduce((sum, m) => sum + Number(m.total_cost), 0)
    
    return {
      totalEntradas,
      totalSalidas,
      stockNeto: totalEntradas - totalSalidas,
      valorEntradas,
      valorSalidas,
      valorInventario: products.reduce((sum, p) => sum + (Number(p.stock_actual || 0) * Number(p.costo_promedio || 0)), 0)
    }
  }, [movimientos, products])
  
  const selectedProductForMovimiento = useMemo(() => {
    return products.find(p => p.id === movimientoForm.product_id)
  }, [products, movimientoForm.product_id])
  
  if (!empresaId) {
    return (
      <Card className="p-6 text-center text-gray-600">
        Por favor seleccione una empresa en la parte superior
      </Card>
    )
  }
  
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumbs */}
      <Breadcrumbs />

      {/* Page Header */}
      <PageHeader
        title="Inventarios"
        subtitle="Gestiona productos y movimientos de inventario según metodología contable peruana"
        icon={Package}
        iconColor="primary"
        actions={
          <ActionBar
            onRefresh={() => {
              reloadProducts()
              reloadMovimientos()
              reloadAlmacenes()
              if (activeTab === 'kardex') reloadKardex()
              if (activeTab === 'stock') reloadStock()
            }}
            loading={productsLoading || movimientosLoading || almacenesLoading || kardexLoading || stockLoading}
          >
            {activeTab === 'productos' && (
              <Button onClick={openCreateProduct}>
                <Plus className="w-4 h-4" />
                Nuevo Producto
              </Button>
            )}
            {activeTab === 'almacenes' && (
              <Button onClick={openCreateAlmacen}>
                <Plus className="w-4 h-4" />
                Nuevo Almacén
              </Button>
            )}
            {activeTab === 'movimientos' && (
              <>
                <Button onClick={openCreateEntrada} variant="outline">
                  <ArrowUp className="w-4 h-4" />
                  Entrada
                </Button>
                <Button onClick={openCreateSalida} variant="outline">
                  <ArrowDown className="w-4 h-4" />
                  Salida
                </Button>
                <Button onClick={openCreateAjuste} variant="outline">
                  <Package className="w-4 h-4" />
                  Ajuste
                </Button>
              </>
            )}
          </ActionBar>
        }
      />
      
      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('productos')}
            className={`px-4 py-2 font-medium text-sm transition-colors ${
              activeTab === 'productos'
                ? 'text-primary-600 border-b-2 border-primary-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Productos
          </button>
          <button
            onClick={() => setActiveTab('almacenes')}
            className={`px-4 py-2 font-medium text-sm transition-colors ${
              activeTab === 'almacenes'
                ? 'text-primary-600 border-b-2 border-primary-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Almacenes
          </button>
          <button
            onClick={() => setActiveTab('movimientos')}
            className={`px-4 py-2 font-medium text-sm transition-colors ${
              activeTab === 'movimientos'
                ? 'text-primary-600 border-b-2 border-primary-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Movimientos
          </button>
          <button
            onClick={() => { setActiveTab('kardex'); reloadKardex(); }}
            className={`px-4 py-2 font-medium text-sm transition-colors ${
              activeTab === 'kardex'
                ? 'text-primary-600 border-b-2 border-primary-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Kardex
          </button>
          <button
            onClick={() => { setActiveTab('stock'); reloadStock(); }}
            className={`px-4 py-2 font-medium text-sm transition-colors ${
              activeTab === 'stock'
                ? 'text-primary-600 border-b-2 border-primary-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Stock Actual
          </button>
        </div>
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-green-100 text-green-600">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm text-gray-600">Total Entradas</div>
              <div className="text-xl font-bold text-gray-900">{stats.totalEntradas.toFixed(2)}</div>
            </div>
          </div>
        </Card>
        
        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-red-100 text-red-600">
              <TrendingDown className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm text-gray-600">Total Salidas</div>
              <div className="text-xl font-bold text-gray-900">{stats.totalSalidas.toFixed(2)}</div>
            </div>
          </div>
        </Card>
        
        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-100 text-blue-600">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm text-gray-600">Stock Neto</div>
              <div className="text-xl font-bold text-gray-900">{stats.stockNeto.toFixed(2)}</div>
            </div>
          </div>
        </Card>
        
        <Card>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-purple-100 text-purple-600">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm text-gray-600">Valor Inventario</div>
              <div className="text-xl font-bold text-gray-900">{formatCurrency(stats.valorInventario)}</div>
            </div>
          </div>
        </Card>
      </div>
      
      {/* Tab Content: Productos */}
      {activeTab === 'productos' && (
        <>
          {/* Filter Bar */}
          <FilterBar
            searchValue={searchTerm}
            onSearchChange={setSearchTerm}
            searchPlaceholder="Buscar productos por código, nombre..."
          />
          
          {/* Productos Table */}
          <Card>
            <CardHeader 
              title={`Productos de Inventario${filteredProducts.length > 0 ? ` (${filteredProducts.length} producto${filteredProducts.length !== 1 ? 's' : ''})` : ''}`}
              icon={<Package className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
            />
            {productsLoading ? (
              <div className="p-8 text-center text-gray-500">Cargando productos...</div>
            ) : (
              <div className="overflow-x-auto border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-200 dark:bg-gray-700 border-b-2 border-gray-400 dark:border-gray-500">
                      <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700" style={{ width: '120px' }}>Código</th>
                      <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700" style={{ minWidth: '200px' }}>Nombre</th>
                      <th className="px-3 py-2.5 text-center text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700" style={{ width: '80px' }}>Unidad</th>
                      <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700" style={{ width: '100px' }}>Cuenta</th>
                      <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700" style={{ width: '120px' }}>Stock</th>
                      <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700" style={{ width: '120px' }}>Costo Prom.</th>
                      <th className="px-3 py-2.5 text-center text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700" style={{ width: '100px' }}>Estado</th>
                      <th className="px-3 py-2.5 text-center text-xs font-bold text-gray-900 dark:text-gray-100 bg-gray-200 dark:bg-gray-700" style={{ width: '120px' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-gray-500 border-r border-gray-300 dark:border-gray-600">
                        {searchTerm ? 'No se encontraron productos' : 'No hay productos registrados'}
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((product, idx) => (
                      <tr key={product.id} className={`${idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/70'} border-b border-gray-300 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-blue-900/10`}>
                        <td className="px-3 py-2 font-mono text-sm font-semibold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">{product.code}</td>
                        <td className="px-3 py-2 border-r border-gray-300 dark:border-gray-600">
                          <div className="font-medium text-primary-600 dark:text-primary-400">{product.name}</div>
                          {product.description && (
                            <div className="text-xs text-gray-500 dark:text-gray-400">{product.description}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center text-sm text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">{product.unit_of_measure}</td>
                        <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 border-r border-gray-300 dark:border-gray-600">{product.account_code}</td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">
                          {Number(product.stock_actual || 0).toFixed(4)} {product.unit_of_measure}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">{formatCurrency(Number(product.costo_promedio || 0))}</td>
                        <td className="px-3 py-2 text-center border-r border-gray-300 dark:border-gray-600">
                          <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${product.active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                            {product.active ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-blue-100 dark:hover:bg-blue-900/30 border border-blue-300 dark:border-blue-600" onClick={() => openEditProduct(product)}>
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-300 dark:border-red-600"
                              onClick={() => setConfirmDeleteProduct(product)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            )}
          </Card>
        </>
      )}
      
      {/* Tab Content: Movimientos */}
      {activeTab === 'movimientos' && (
        <>
          {/* Filters */}
          <Card>
            <div className="flex items-center gap-3 p-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por producto, referencia, glosa..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                />
              </div>
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                className="border border-gray-300 rounded-xl px-4 py-2.5 text-sm bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              >
                <option value="">Todos los tipos</option>
                <option value="ENTRADA">Entradas</option>
                <option value="SALIDA">Salidas</option>
              </select>
            </div>
          </Card>
          
          {/* Movimientos Table */}
          <Card>
            <CardHeader 
              title={`Movimientos de Inventario${filteredMovimientos.length > 0 ? ` (${filteredMovimientos.length} movimiento${filteredMovimientos.length !== 1 ? 's' : ''})` : ''}`}
              icon={<Package className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
            />
            {movimientosLoading ? (
              <div className="p-8 text-center text-gray-500">Cargando movimientos...</div>
            ) : (
              <div className="overflow-x-auto border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-200 dark:bg-gray-700 border-b-2 border-gray-400 dark:border-gray-500">
                      <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700" style={{ width: '100px' }}>Fecha</th>
                      <th className="px-3 py-2.5 text-center text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700" style={{ width: '100px' }}>Tipo</th>
                      <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700" style={{ minWidth: '150px' }}>Producto</th>
                      <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700" style={{ width: '100px' }}>Cantidad</th>
                      <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700" style={{ width: '120px' }}>Costo Unit.</th>
                      <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700" style={{ width: '120px' }}>Total</th>
                      <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700" style={{ width: '150px' }}>Referencia</th>
                      <th className="px-3 py-2.5 text-center text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700" style={{ width: '100px' }}>Asiento</th>
                      <th className="px-3 py-2.5 text-center text-xs font-bold text-gray-900 dark:text-gray-100 bg-gray-200 dark:bg-gray-700" style={{ width: '80px' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                  {filteredMovimientos.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-8 text-center text-gray-500 border-r border-gray-300 dark:border-gray-600">
                        {searchTerm || filterType ? 'No se encontraron movimientos' : 'No hay movimientos registrados'}
                      </td>
                    </tr>
                  ) : (
                    filteredMovimientos.map((mov, idx) => (
                      <tr key={mov.movimiento_id} className={`${idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/70'} border-b border-gray-300 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-blue-900/10`}>
                        <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">{formatDate(mov.movement_date)}</td>
                        <td className="px-3 py-2 text-center border-r border-gray-300 dark:border-gray-600">
                          <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                            mov.movement_type === 'ENTRADA'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          }`}>
                            {mov.movement_type === 'ENTRADA' ? (
                              <ArrowUp className="w-3 h-3 inline mr-1" />
                            ) : (
                              <ArrowDown className="w-3 h-3 inline mr-1" />
                            )}
                            {mov.movement_type}
                          </span>
                        </td>
                        <td className="px-3 py-2 border-r border-gray-300 dark:border-gray-600">
                          <div className="font-medium text-gray-900 dark:text-gray-100">{mov.product_code || mov.product_id}</div>
                          {mov.product_name && (
                            <div className="text-xs text-gray-500 dark:text-gray-400">{mov.product_name}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">{Number(mov.quantity).toFixed(4)}</td>
                        <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">{formatCurrency(Number(mov.unit_cost))}</td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">{formatCurrency(Number(mov.total_cost))}</td>
                        <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 border-r border-gray-300 dark:border-gray-600">{mov.reference || '-'}</td>
                        <td className="px-3 py-2 text-center border-r border-gray-300 dark:border-gray-600">
                          {mov.has_journal_entry ? (
                            <span className="flex items-center justify-center gap-1 text-green-600 dark:text-green-400">
                              <CheckCircle className="w-4 h-4" />
                              <span className="text-xs">{mov.journal_entry_status}</span>
                            </span>
                          ) : (
                            <span className="text-red-500 dark:text-red-400 text-xs">Sin asiento</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {mov.journal_entry_id && (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-7 w-7 p-0 hover:bg-blue-100 dark:hover:bg-blue-900/30 border border-blue-300 dark:border-blue-600" 
                                title="Ver asiento contable"
                                onClick={() => navigate(`/asientos?entry_id=${mov.journal_entry_id}`)}
                              >
                                <ScrollText className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-300 dark:border-red-600"
                              onClick={() => setConfirmDeleteMovimiento({ id: mov.movimiento_id, tipo: mov.movement_type, fecha: mov.movement_date })}
                              title="Eliminar movimiento"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            )}
          </Card>
        </>
      )}
      
      {/* Tab Content: Almacenes */}
      {activeTab === 'almacenes' && (
        <>
          <FilterBar
            searchValue={searchTerm}
            onSearchChange={setSearchTerm}
            searchPlaceholder="Buscar almacenes por código, nombre..."
          />
          
          <Card>
            <CardHeader 
              title={`Almacenes${almacenes.length > 0 ? ` (${almacenes.length} almacén${almacenes.length !== 1 ? 'es' : ''})` : ''}`}
              icon={<Package className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
            />
            {almacenesLoading ? (
              <div className="p-8 text-center text-gray-500">Cargando almacenes...</div>
            ) : (
              <div className="overflow-x-auto border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-200 dark:bg-gray-700 border-b-2 border-gray-400 dark:border-gray-500">
                      <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700" style={{ width: '120px' }}>Código</th>
                      <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700" style={{ minWidth: '200px' }}>Nombre</th>
                      <th className="px-3 py-2.5 text-center text-xs font-bold text-gray-900 dark:text-gray-100 bg-gray-200 dark:bg-gray-700" style={{ width: '100px' }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                  {almacenes.filter(a => !searchTerm || a.codigo.toLowerCase().includes(searchTerm.toLowerCase()) || a.nombre.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-8 text-center text-gray-500 border-r border-gray-300 dark:border-gray-600">
                        {searchTerm ? 'No se encontraron almacenes' : 'No hay almacenes registrados'}
                      </td>
                    </tr>
                  ) : (
                    almacenes
                      .filter(a => !searchTerm || a.codigo.toLowerCase().includes(searchTerm.toLowerCase()) || a.nombre.toLowerCase().includes(searchTerm.toLowerCase()))
                      .map((almacen, idx) => (
                        <tr key={almacen.id} className={`${idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/70'} border-b border-gray-300 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-blue-900/10`}>
                          <td className="px-3 py-2 font-mono text-sm font-semibold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">{almacen.codigo}</td>
                          <td className="px-3 py-2 border-r border-gray-300 dark:border-gray-600">
                            <div className="font-medium text-primary-600 dark:text-primary-400">{almacen.nombre}</div>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${almacen.activo ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                              {almacen.activo ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
            )}
          </Card>
        </>
      )}
      
      {/* Tab Content: Kardex */}
      {activeTab === 'kardex' && (
        <Card>
          <CardHeader 
            title="Kardex de Inventario"
            icon={<ScrollText className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
          />
          {/* Filtros Kardex */}
          <div className="flex flex-wrap items-end gap-3 p-4 border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 rounded-t-lg">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Producto</label>
              <select
                value={kardexProductoId === '' ? '' : kardexProductoId}
                onChange={(e) => setKardexProductoId(e.target.value === '' ? '' : Number(e.target.value))}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm min-w-[180px]"
              >
                <option value="">Todos</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Almacén</label>
              <select
                value={kardexAlmacenId === '' ? '' : kardexAlmacenId}
                onChange={(e) => setKardexAlmacenId(e.target.value === '' ? '' : Number(e.target.value))}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm min-w-[140px]"
              >
                <option value="">Todos</option>
                {almacenes.map((a) => (
                  <option key={a.id} value={a.id}>{a.codigo} - {a.nombre}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Desde</label>
              <input
                type="date"
                value={kardexFechaDesde}
                onChange={(e) => setKardexFechaDesde(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Hasta</label>
              <input
                type="date"
                value={kardexFechaHasta}
                onChange={(e) => setKardexFechaHasta(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm"
              />
            </div>
            <Button onClick={reloadKardex} disabled={kardexLoading} className="mb-0">
              <Filter className="w-4 h-4 mr-2" />
              Buscar
            </Button>
            <Button variant="outline" onClick={() => { setKardexProductoId(''); setKardexAlmacenId(''); setKardexFechaDesde(''); setKardexFechaHasta(''); reloadKardex({ producto_id: '', almacen_id: '', fecha_desde: '', fecha_hasta: '' }); }}>
              Limpiar filtros
            </Button>
          </div>
          {kardexLoading ? (
            <div className="p-8 text-center text-gray-500">Cargando kardex...</div>
          ) : (
            <div className="overflow-x-auto border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-200 dark:bg-gray-700 border-b-2 border-gray-400 dark:border-gray-500">
                    <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700">Fecha</th>
                    {!kardexProductoId && (
                      <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700">Producto</th>
                    )}
                    <th className="px-3 py-2.5 text-center text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700">Tipo</th>
                    <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700">Cantidad</th>
                    <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700">Costo Unit.</th>
                    <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700">Total</th>
                    <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700">Saldo Cant.</th>
                    <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700">Costo Prom.</th>
                    <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700">Valor Total</th>
                    <th className="px-3 py-2.5 text-center text-xs font-bold text-gray-900 dark:text-gray-100 bg-gray-200 dark:bg-gray-700" style={{ width: '100px' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                {kardex.length === 0 ? (
                  <tr>
                    <td colSpan={kardexProductoId ? 9 : 10} className="px-3 py-8 text-center text-gray-500 border-r border-gray-300 dark:border-gray-600">
                      No hay movimientos en el kardex
                    </td>
                  </tr>
                ) : (
                  kardex.map((row, idx) => (
                    <tr key={idx} className={`${idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/70'} border-b border-gray-300 dark:border-gray-600`}>
                      <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">{formatDate(row.fecha)}</td>
                      {!kardexProductoId && (
                        <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">
                          {row.producto_code ? `${row.producto_code} - ${row.producto_name || ''}` : '-'}
                        </td>
                      )}
                      <td className="px-3 py-2 text-center border-r border-gray-300 dark:border-gray-600">
                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                          row.tipo === 'ENTRADA' ? 'bg-green-100 text-green-700' : row.tipo === 'SALIDA' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {row.tipo}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">{Number(row.cantidad).toFixed(4)}</td>
                      <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">{formatCurrency(Number(row.costo_unitario))}</td>
                      <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">{formatCurrency(Number(row.costo_total))}</td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">{Number(row.saldo_cantidad).toFixed(4)}</td>
                      <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">{formatCurrency(Number(row.saldo_costo_promedio))}</td>
                      <td className="px-3 py-2 text-right font-semibold text-primary-600 dark:text-primary-400 border-r border-gray-300 dark:border-gray-600">{formatCurrency(Number(row.saldo_valor_total || 0))}</td>
                      <td className="px-3 py-2 text-center border-gray-300 dark:border-gray-600">
                        {row.journal_entry_id && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 w-7 p-0 hover:bg-blue-100 dark:hover:bg-blue-900/30 border border-blue-300 dark:border-blue-600" 
                            title="Ver asiento contable"
                            onClick={() => navigate(`/asientos?entry_id=${row.journal_entry_id}`)}
                          >
                            <ScrollText className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          )}
        </Card>
      )}
      
      {/* Modal: Confirmar Eliminar Movimiento */}
      {confirmDeleteMovimiento && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setConfirmDeleteMovimiento(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="text-lg font-bold mb-2 text-red-600 dark:text-red-400">Eliminar Movimiento</div>
            <div className="text-sm text-gray-700 dark:text-gray-300 mb-6">
              Esta acción es <span className="font-semibold text-red-600 dark:text-red-400">irreversible</span>. 
              Se eliminará el movimiento y se anulará el asiento contable asociado.
              <br /><br />
              ¿Eliminar movimiento de <span className="font-semibold">{confirmDeleteMovimiento.tipo}</span> del {formatDate(confirmDeleteMovimiento.fecha)}?
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmDeleteMovimiento(null)}>
                Cancelar
              </Button>
              <Button className="bg-red-600 hover:bg-red-700" onClick={doDeleteMovimiento}>
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Tab Content: Stock */}
      {activeTab === 'stock' && (
        <Card>
          <CardHeader 
            title={`Stock Actual${stockData.length > 0 ? ` (${stockData.length} registro${stockData.length !== 1 ? 's' : ''})` : ''}`}
            icon={<Package className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
          />
          {stockLoading ? (
            <div className="p-8 text-center text-gray-500">Cargando stock...</div>
          ) : (
            <div className="overflow-x-auto border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-200 dark:bg-gray-700 border-b-2 border-gray-400 dark:border-gray-500">
                    <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700">Código</th>
                    <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700">Producto</th>
                    <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700">Almacén</th>
                    <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700">Cantidad</th>
                    <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700">Costo Promedio</th>
                    <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-900 dark:text-gray-100 bg-gray-200 dark:bg-gray-700">Valor Total</th>
                  </tr>
                </thead>
                <tbody>
                {stockData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-gray-500 border-r border-gray-300 dark:border-gray-600">
                      No hay stock para mostrar
                    </td>
                  </tr>
                ) : (
                  stockData.map((row, idx) => (
                    <tr key={`${row.producto_id}-${row.almacen_id || 'none'}`} className={`${idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/70'} border-b border-gray-300 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-blue-900/10`}>
                      <td className="px-3 py-2 font-mono text-sm font-semibold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">{row.producto_code}</td>
                      <td className="px-3 py-2 border-r border-gray-300 dark:border-gray-600">
                        <div className="font-medium text-primary-600 dark:text-primary-400">{row.producto_name}</div>
                      </td>
                      <td className="px-3 py-2 border-r border-gray-300 dark:border-gray-600">
                        {row.almacen_nombre || <span className="text-gray-400">Sin almacén</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">
                        {Number(row.cantidad_actual || 0).toFixed(4)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">{formatCurrency(Number(row.costo_promedio || 0))}</td>
                      <td className="px-3 py-2 text-right font-semibold text-primary-600 dark:text-primary-400">
                        {formatCurrency(Number(row.valor_total || 0))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          )}
        </Card>
      )}
      
      {/* Modal: Producto */}
      {showProductForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => { setShowProductForm(false); setEditingProduct(null) }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="text-lg font-bold mb-4 bg-gradient-to-r from-primary-600 to-primary-700 text-white -m-6 p-4 rounded-t-2xl">
              {editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              <div>
                <label className="text-sm text-gray-600">Código *</label>
                <input
                  value={productForm.code}
                  onChange={e => setProductForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                  placeholder="PROD001"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Unidad de Medida</label>
                <select
                  value={productForm.unit_of_measure}
                  onChange={e => setProductForm(f => ({ ...f, unit_of_measure: e.target.value }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                >
                  {UNIDADES_MEDIDA.map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-sm text-gray-600">Nombre *</label>
                <input
                  value={productForm.name}
                  onChange={e => setProductForm(f => ({ ...f, name: e.target.value }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                  placeholder="Nombre del producto"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm text-gray-600">Descripción</label>
                <textarea
                  value={productForm.description || ''}
                  onChange={e => setProductForm(f => ({ ...f, description: e.target.value }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                  rows={2}
                  placeholder="Descripción del producto"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Cuenta Contable (PCGE)</label>
                <input
                  value={productForm.account_code}
                  onChange={e => setProductForm(f => ({ ...f, account_code: e.target.value }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                  placeholder="20.10"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setShowProductForm(false); setEditingProduct(null) }}>
                Cancelar
              </Button>
              <Button onClick={saveProduct}>Guardar</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal: Movimiento */}
      {showMovimientoForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowMovimientoForm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="text-lg font-bold mb-4 bg-gradient-to-r from-primary-600 to-primary-700 text-white -m-6 p-4 rounded-t-2xl">
              Nuevo Movimiento de Inventario
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              <div>
                <label className="text-sm text-gray-600">Tipo de Movimiento *</label>
                <select
                  value={movimientoForm.movement_type}
                  onChange={e => setMovimientoForm(f => ({ ...f, movement_type: e.target.value as 'ENTRADA' | 'SALIDA' }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                >
                  <option value="ENTRADA">Entrada</option>
                  <option value="SALIDA">Salida</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-600">Producto *</label>
                <select
                  value={movimientoForm.product_id}
                  onChange={e => setMovimientoForm(f => ({ ...f, product_id: Number(e.target.value) }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                >
                  {products.filter(p => p.active).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.name} {p.stock_actual !== undefined && `(Stock: ${Number(p.stock_actual).toFixed(2)})`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-600">Cantidad *</label>
                <input
                  type="number"
                  step="0.0001"
                  value={movimientoForm.quantity || ''}
                  onChange={e => setMovimientoForm(f => ({ ...f, quantity: Number(e.target.value) }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                />
                {selectedProductForMovimiento && (
                  <div className="text-xs text-gray-500 mt-1">
                    Unidad: {selectedProductForMovimiento.unit_of_measure}
                  </div>
                )}
              </div>
              {movimientoForm.movement_type === 'ENTRADA' && (
                <div>
                  <label className="text-sm text-gray-600">Costo Unitario *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={movimientoForm.unit_cost || ''}
                    onChange={e => setMovimientoForm(f => ({ ...f, unit_cost: Number(e.target.value) }))}
                    className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                    placeholder="0.00"
                  />
                </div>
              )}
              {movimientoForm.movement_type === 'SALIDA' && selectedProductForMovimiento && (
                <div>
                  <label className="text-sm text-gray-600">Costo Promedio (automático)</label>
                  <input
                    type="text"
                    value={formatCurrency(Number(selectedProductForMovimiento?.costo_promedio || 0))}
                    disabled
                    className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2 bg-gray-100"
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    Se usará el costo promedio calculado automáticamente
                  </div>
                </div>
              )}
              <div>
                <label className="text-sm text-gray-600">Fecha *</label>
                <input
                  type="date"
                  value={movimientoForm.movement_date}
                  onChange={e => setMovimientoForm(f => ({ ...f, movement_date: e.target.value }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Tipo de Referencia</label>
                <select
                  value={movimientoForm.reference_type || ''}
                  onChange={e => setMovimientoForm(f => ({ ...f, reference_type: e.target.value || null }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                >
                  <option value="">Ninguno</option>
                  <option value="COMPRA">Compra</option>
                  <option value="VENTA">Venta</option>
                  <option value="AJUSTE">Ajuste</option>
                  <option value="MERMA">Merma</option>
                  <option value="PRODUCCION">Producción</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-600">Referencia</label>
                <input
                  type="text"
                  value={movimientoForm.reference || ''}
                  onChange={e => setMovimientoForm(f => ({ ...f, reference: e.target.value || null }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                  placeholder="Factura, orden, etc."
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm text-gray-600">Glosa / Descripción</label>
                <textarea
                  value={movimientoForm.glosa || ''}
                  onChange={e => setMovimientoForm(f => ({ ...f, glosa: e.target.value || null }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                  rows={2}
                  placeholder="Descripción del movimiento (se usará en el asiento contable)"
                />
              </div>
              {movimientoForm.movement_type === 'ENTRADA' && (
                <div>
                  <label className="text-sm text-gray-600">Cuenta de Crédito (PCGE)</label>
                  <input
                    type="text"
                    value={movimientoForm.credit_account_code || ''}
                    onChange={e => setMovimientoForm(f => ({ ...f, credit_account_code: e.target.value || null }))}
                    className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                    placeholder="60.11 (Compras) - opcional"
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    Si no se especifica, se usará 60.11 (Compras)
                  </div>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowMovimientoForm(false)}>
                Cancelar
              </Button>
              <Button onClick={saveMovimiento}>Registrar Movimiento</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal: Confirmar Eliminar Producto */}
      {confirmDeleteProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setConfirmDeleteProduct(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="text-lg font-bold mb-2 text-red-600">Eliminar Producto</div>
            <div className="text-sm text-gray-700 mb-6">
              Esta acción es <span className="font-semibold text-red-600">irreversible</span>. 
              Solo se puede eliminar si no tiene movimientos registrados.
              <br /><br />
              ¿Eliminar "{confirmDeleteProduct.name}" (ID {confirmDeleteProduct.id})?
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmDeleteProduct(null)}>
                Cancelar
              </Button>
              <Button className="bg-red-600 hover:bg-red-700" onClick={doDeleteProduct}>
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal: Almacén */}
      {showAlmacenForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowAlmacenForm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="text-lg font-bold mb-4 bg-gradient-to-r from-primary-600 to-primary-700 text-white -m-6 p-4 rounded-t-2xl">
              Nuevo Almacén
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              <div>
                <label className="text-sm text-gray-600">Código *</label>
                <input
                  value={almacenForm.codigo}
                  onChange={e => setAlmacenForm(f => ({ ...f, codigo: e.target.value.toUpperCase() }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                  placeholder="ALM001"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Estado</label>
                <select
                  value={almacenForm.activo ? 'true' : 'false'}
                  onChange={e => setAlmacenForm(f => ({ ...f, activo: e.target.value === 'true' }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                >
                  <option value="true">Activo</option>
                  <option value="false">Inactivo</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-sm text-gray-600">Nombre *</label>
                <input
                  value={almacenForm.nombre}
                  onChange={e => setAlmacenForm(f => ({ ...f, nombre: e.target.value }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                  placeholder="Nombre del almacén"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAlmacenForm(false)}>
                Cancelar
              </Button>
              <Button onClick={saveAlmacen}>Guardar</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal: Entrada de Inventario */}
      {showEntradaForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowEntradaForm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="text-lg font-bold mb-4 bg-gradient-to-r from-green-600 to-green-700 text-white -m-6 p-4 rounded-t-2xl">
              Nueva Entrada de Inventario
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              <div>
                <label className="text-sm text-gray-600">Producto *</label>
                <select
                  value={entradaForm.producto_id}
                  onChange={e => setEntradaForm(f => ({ ...f, producto_id: Number(e.target.value) }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                >
                  {products.filter(p => p.active).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-600">Almacén</label>
                <select
                  value={entradaForm.almacen_id || ''}
                  onChange={e => setEntradaForm(f => ({ ...f, almacen_id: e.target.value ? Number(e.target.value) : null }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                >
                  <option value="">Sin almacén</option>
                  {almacenes.filter(a => a.activo).map(a => (
                    <option key={a.id} value={a.id}>
                      {a.codigo} - {a.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-600">Cantidad *</label>
                <input
                  type="number"
                  step="0.0001"
                  value={entradaForm.cantidad || ''}
                  onChange={e => setEntradaForm(f => ({ ...f, cantidad: Number(e.target.value) }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Costo Unitario *</label>
                <input
                  type="number"
                  step="0.01"
                  value={entradaForm.costo_unitario || ''}
                  onChange={e => setEntradaForm(f => ({ ...f, costo_unitario: Number(e.target.value) }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Fecha *</label>
                <input
                  type="date"
                  value={entradaForm.fecha}
                  onChange={e => setEntradaForm(f => ({ ...f, fecha: e.target.value }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Tipo de Referencia</label>
                <select
                  value={entradaForm.referencia_tipo || ''}
                  onChange={e => setEntradaForm(f => ({ ...f, referencia_tipo: e.target.value || null }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                >
                  <option value="">Ninguno</option>
                  <option value="COMPRA">Compra</option>
                  <option value="AJUSTE">Ajuste</option>
                  <option value="MANUAL">Manual</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-600">ID de Referencia</label>
                <input
                  type="number"
                  value={entradaForm.referencia_id || ''}
                  onChange={e => setEntradaForm(f => ({ ...f, referencia_id: e.target.value ? Number(e.target.value) : null }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm text-gray-600">Glosa</label>
                <textarea
                  value={entradaForm.glosa || ''}
                  onChange={e => setEntradaForm(f => ({ ...f, glosa: e.target.value || null }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                  rows={2}
                  placeholder="Descripción del movimiento"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowEntradaForm(false)}>
                Cancelar
              </Button>
              <Button onClick={saveEntrada} className="bg-green-600 hover:bg-green-700">
                Registrar Entrada
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal: Salida de Inventario */}
      {showSalidaForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowSalidaForm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="text-lg font-bold mb-4 bg-gradient-to-r from-red-600 to-red-700 text-white -m-6 p-4 rounded-t-2xl">
              Nueva Salida de Inventario
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              <div>
                <label className="text-sm text-gray-600">Producto *</label>
                <select
                  value={salidaForm.producto_id}
                  onChange={e => setSalidaForm(f => ({ ...f, producto_id: Number(e.target.value) }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                >
                  {products.filter(p => p.active).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.name} {p.stock_actual !== undefined && `(Stock: ${Number(p.stock_actual).toFixed(2)})`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-600">Almacén</label>
                <select
                  value={salidaForm.almacen_id || ''}
                  onChange={e => setSalidaForm(f => ({ ...f, almacen_id: e.target.value ? Number(e.target.value) : null }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                >
                  <option value="">Sin almacén</option>
                  {almacenes.filter(a => a.activo).map(a => (
                    <option key={a.id} value={a.id}>
                      {a.codigo} - {a.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-600">Cantidad *</label>
                <input
                  type="number"
                  step="0.0001"
                  value={salidaForm.cantidad || ''}
                  onChange={e => setSalidaForm(f => ({ ...f, cantidad: Number(e.target.value) }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Fecha *</label>
                <input
                  type="date"
                  value={salidaForm.fecha}
                  onChange={e => setSalidaForm(f => ({ ...f, fecha: e.target.value }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Tipo de Referencia</label>
                <select
                  value={salidaForm.referencia_tipo || ''}
                  onChange={e => setSalidaForm(f => ({ ...f, referencia_tipo: e.target.value || null }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                >
                  <option value="">Ninguno</option>
                  <option value="VENTA">Venta</option>
                  <option value="AJUSTE">Ajuste</option>
                  <option value="MANUAL">Manual</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-600">ID de Referencia</label>
                <input
                  type="number"
                  value={salidaForm.referencia_id || ''}
                  onChange={e => setSalidaForm(f => ({ ...f, referencia_id: e.target.value ? Number(e.target.value) : null }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm text-gray-600">Glosa</label>
                <textarea
                  value={salidaForm.glosa || ''}
                  onChange={e => setSalidaForm(f => ({ ...f, glosa: e.target.value || null }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                  rows={2}
                  placeholder="Descripción del movimiento"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowSalidaForm(false)}>
                Cancelar
              </Button>
              <Button onClick={saveSalida} className="bg-red-600 hover:bg-red-700">
                Registrar Salida
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal: Ajuste de Inventario */}
      {showAjusteForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowAjusteForm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="text-lg font-bold mb-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white -m-6 p-4 rounded-t-2xl">
              Nuevo Ajuste de Inventario
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              <div>
                <label className="text-sm text-gray-600">Producto *</label>
                <select
                  value={ajusteForm.producto_id}
                  onChange={e => setAjusteForm(f => ({ ...f, producto_id: Number(e.target.value) }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                >
                  {products.filter(p => p.active).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-600">Almacén</label>
                <select
                  value={ajusteForm.almacen_id || ''}
                  onChange={e => setAjusteForm(f => ({ ...f, almacen_id: e.target.value ? Number(e.target.value) : null }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                >
                  <option value="">Sin almacén</option>
                  {almacenes.filter(a => a.activo).map(a => (
                    <option key={a.id} value={a.id}>
                      {a.codigo} - {a.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-600">Cantidad *</label>
                <input
                  type="number"
                  step="0.0001"
                  value={ajusteForm.cantidad || ''}
                  onChange={e => setAjusteForm(f => ({ ...f, cantidad: Number(e.target.value) }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                  placeholder="Positivo para sobrante, negativo para faltante"
                />
                <div className="text-xs text-gray-500 mt-1">
                  Positivo = Sobrante, Negativo = Faltante
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-600">Fecha *</label>
                <input
                  type="date"
                  value={ajusteForm.fecha}
                  onChange={e => setAjusteForm(f => ({ ...f, fecha: e.target.value }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm text-gray-600">Motivo *</label>
                <textarea
                  value={ajusteForm.motivo}
                  onChange={e => setAjusteForm(f => ({ ...f, motivo: e.target.value }))}
                  className="mt-1 w-full border border-gray-300 rounded-xl px-4 py-2"
                  rows={3}
                  placeholder="Descripción del motivo del ajuste"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAjusteForm(false)}>
                Cancelar
              </Button>
              <Button onClick={saveAjuste} className="bg-blue-600 hover:bg-blue-700">
                Registrar Ajuste
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal: Mensajes */}
      {messageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMessageModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className={`flex items-center gap-3 mb-4 ${
              messageModal.type === 'success' ? 'text-green-600' : 'text-red-600'
            }`}>
              {messageModal.type === 'success' ? (
                <CheckCircle className="w-6 h-6" />
              ) : (
                <AlertCircle className="w-6 h-6" />
              )}
              <div className="text-lg font-bold">{messageModal.title}</div>
            </div>
            <div className="text-sm text-gray-700 mb-6">{messageModal.message}</div>
            <div className="flex justify-end">
              <Button onClick={() => setMessageModal(null)}>Aceptar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
