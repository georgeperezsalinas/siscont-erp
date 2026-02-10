import { useState, useEffect } from 'react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { PageHeader } from '@/components/ui/PageHeader'
import { ActionBar } from '@/components/ui/ActionBar'
import { FilterBar } from '@/components/ui/FilterBar'
import { Select } from '@/components/ui/Select'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { MessageModal } from '@/components/ui/MessageModal'
import { 
  Plus, Search, Edit2, Trash2, Building2, User, CheckCircle, XCircle, 
  MapPin, Phone, Mail, Globe, Briefcase, X, Filter, Users
} from 'lucide-react'
import { 
  listThirdParties, createThirdParty, updateThirdParty, deleteThirdParty, 
  getThirdPartiesStats, type ThirdParty, type ThirdPartyIn, type ThirdPartyUpdate 
} from '@/api'
import { useOrg } from '@/stores/org'
import { useAuth } from '@/stores/auth'

export default function Terceros() {
  const { empresaId } = useOrg()
  const { user } = useAuth()
  const [terceros, setTerceros] = useState<ThirdParty[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingTercero, setEditingTercero] = useState<ThirdParty | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ThirdParty | null>(null)
  const [messageModal, setMessageModal] = useState<{ type: 'success' | 'error'; title: string; message: string } | null>(null)
  const [filterType, setFilterType] = useState<string>('TODOS')
  const [filterActive, setFilterActive] = useState<boolean | undefined>(undefined)
  const [searchTerm, setSearchTerm] = useState('')
  const [stats, setStats] = useState<{ total: number; proveedores: number; clientes: number; activos: number; inactivos: number } | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  
  const [form, setForm] = useState<ThirdPartyIn>({
    company_id: empresaId,
    tax_id: '',
    tax_id_type: '6', // Catálogo 06 SUNAT: 1=DNI, 4=Carnet Extranjería, 6=RUC, 7=Pasaporte, 0=Doc. Identidad Extranjero
    name: '',
    type: 'PROVEEDOR',
    commercial_name: null,
    address: null,
    district: null,
    province: null,
    department: null,
    phone: null,
    email: null,
    website: null,
    contact_person: null,
    country_code: 'PE', // País de residencia según Catálogo 18 SUNAT
    third_party_type: 'Nacional', // Nacional, Extranjero, No domiciliado
    sunat_status: null, // Estado SUNAT: Habido, No habido (solo para proveedores)
    active: true,
    notes: null,
  })

  useEffect(() => {
    if (empresaId) {
      reload()
      loadStats()
    }
  }, [empresaId, filterType, filterActive])

  async function reload() {
    if (!empresaId) return
    try {
      setLoading(true)
      const type = filterType !== 'TODOS' ? filterType : undefined
      const data = await listThirdParties(empresaId, type, filterActive, searchTerm || undefined)
      setTerceros(data)
    } catch (err: any) {
      console.error('Error cargando terceros:', err)
      setTerceros([])
    } finally {
      setLoading(false)
    }
  }

  async function loadStats() {
    if (!empresaId) return
    try {
      const data = await getThirdPartiesStats(empresaId)
      setStats(data)
    } catch (err) {
      console.error('Error cargando estadísticas:', err)
    }
  }

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (empresaId) {
        reload()
      }
    }, 300)
    return () => clearTimeout(timeoutId)
  }, [searchTerm])

  function openCreate(type: 'PROVEEDOR' | 'CLIENTE' = 'PROVEEDOR') {
    setEditingTercero(null)
    setForm({
      company_id: empresaId,
      tax_id: '',
      tax_id_type: '6', // Por defecto RUC
      name: '',
      type,
      commercial_name: null,
      address: null,
      district: null,
      province: null,
      department: null,
      phone: null,
      email: null,
      website: null,
      contact_person: null,
      country_code: 'PE',
      third_party_type: 'Nacional',
      sunat_status: null,
      active: true,
      notes: null,
    })
    setErrors({})
    setShowForm(true)
  }

  function openEdit(tercero: ThirdParty) {
    setEditingTercero(tercero)
    setForm({
      company_id: tercero.company_id,
      tax_id: tercero.tax_id,
      tax_id_type: tercero.tax_id_type,
      name: tercero.name,
      type: tercero.type,
      commercial_name: tercero.commercial_name,
      address: tercero.address,
      district: tercero.district,
      province: tercero.province,
      department: tercero.department,
      phone: tercero.phone,
      email: tercero.email,
      website: tercero.website,
      contact_person: tercero.contact_person,
      country_code: tercero.country_code || 'PE',
      third_party_type: tercero.third_party_type || 'Nacional',
      sunat_status: tercero.sunat_status,
      active: tercero.active,
      notes: tercero.notes,
    })
    setErrors({})
    setShowForm(true)
  }

  function openDelete(tercero: ThirdParty) {
    setConfirmDelete(tercero)
  }

  function showMessage(type: 'success' | 'error', title: string, message: string) {
    setMessageModal({ type, title, message })
  }

  // Validar formato de RUC (11 dígitos)
  function validateRUC(ruc: string): boolean {
    if (!ruc || ruc.length !== 11 || !/^\d+$/.test(ruc)) {
      return false
    }
    // Validación básica de checksum (simplificada para frontend)
    const digits = ruc.split('').map(Number)
    const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
    let sum = 0
    for (let i = 0; i < 10; i++) {
      sum += digits[i] * weights[i]
    }
    const mod = sum % 11
    const checkDigit = (11 - mod) % 10
    return checkDigit === digits[10]
  }

  // Validar formato de DNI (8 dígitos)
  function validateDNI(dni: string): boolean {
    return dni && dni.length === 8 && /^\d+$/.test(dni)
  }

  // Validar email
  function validateEmail(email: string | null): boolean {
    if (!email) return true // Email es opcional
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  function validateForm(): boolean {
    const newErrors: Record<string, string> = {}

    // Validar tax_id_type según Catálogo 06 SUNAT
    const validTaxIdTypes = ['1', '4', '6', '7', '0']
    if (!form.tax_id_type || !validTaxIdTypes.includes(form.tax_id_type)) {
      newErrors.tax_id_type = 'Debe seleccionar un tipo de documento válido (Catálogo 06 SUNAT)'
    }

    // Validar tax_id (obligatorio)
    if (!form.tax_id || form.tax_id.trim() === '') {
      const typeLabels: Record<string, string> = {
        '1': 'DNI',
        '4': 'Carnet de Extranjería',
        '6': 'RUC',
        '7': 'Pasaporte',
        '0': 'Documento de Identidad Extranjero'
      }
      newErrors.tax_id = `${typeLabels[form.tax_id_type || '6'] || 'Documento'} es obligatorio`
    } else {
      // Validar formato según tipo
      if (form.tax_id_type === '6') { // RUC
        if (!validateRUC(form.tax_id)) {
          newErrors.tax_id = 'RUC inválido: debe tener 11 dígitos y el checksum debe ser correcto'
        }
      } else if (form.tax_id_type === '1') { // DNI
        if (!validateDNI(form.tax_id)) {
          newErrors.tax_id = 'DNI inválido: debe tener 8 dígitos numéricos'
        }
      } else if (form.tax_id_type === '4' || form.tax_id_type === '7' || form.tax_id_type === '0') {
        // CE, Pasaporte, Doc. Extranjero - validación básica de longitud
        if (form.tax_id.length < 8 || form.tax_id.length > 20) {
          const typeLabels: Record<string, string> = {
            '4': 'Carnet de Extranjería',
            '7': 'Pasaporte',
            '0': 'Documento de Identidad Extranjero'
          }
          newErrors.tax_id = `${typeLabels[form.tax_id_type]} debe tener entre 8 y 20 caracteres`
        }
      }
    }

    // Validar name (obligatorio)
    if (!form.name || form.name.trim() === '') {
      newErrors.name = 'Nombre o Razón Social es obligatorio'
    } else if (form.name.trim().length < 3) {
      newErrors.name = 'El nombre debe tener al menos 3 caracteres'
    }

    // Validar email si se proporciona
    if (form.email && !validateEmail(form.email)) {
      newErrors.email = 'Email inválido. Ejemplo: contacto@empresa.com'
    }

    // Validar type
    if (!form.type || !['PROVEEDOR', 'CLIENTE'].includes(form.type)) {
      newErrors.type = 'Debe seleccionar PROVEEDOR o CLIENTE'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function doSave() {
    // Limpiar errores previos
    setErrors({})

    // Validar formulario
    if (!validateForm()) {
      showMessage('error', 'Error de Validación', 'Por favor corrija los errores en el formulario')
      return
    }

    try {
      if (editingTercero) {
        await updateThirdParty(editingTercero.id, form)
        showMessage('success', 'Éxito', 'Tercero actualizado exitosamente')
      } else {
        await createThirdParty(form)
        showMessage('success', 'Éxito', 'Tercero creado exitosamente')
      }
      setShowForm(false)
      setErrors({})
      reload()
      loadStats()
    } catch (err: any) {
      const errorMessage = err.message || 'Error al guardar tercero'
      // Si el error viene del backend, puede contener detalles específicos
      if (errorMessage.includes('RUC inválido') || errorMessage.includes('DNI inválido')) {
        setErrors({ tax_id: errorMessage })
      } else if (errorMessage.includes('nombre') || errorMessage.includes('name')) {
        setErrors({ name: errorMessage })
      } else {
        showMessage('error', 'Error', errorMessage)
      }
    }
  }

  async function doDelete() {
    if (!confirmDelete) return
    try {
      await deleteThirdParty(confirmDelete.id)
      showMessage('success', 'Éxito', 'Tercero eliminado exitosamente')
      setConfirmDelete(null)
      reload()
      loadStats()
    } catch (err: any) {
      showMessage('error', 'Error', err.message || 'Error al eliminar tercero')
    }
  }

  const columns: DataTableColumn<ThirdParty>[] = [
    {
      key: 'tipo',
      label: 'Tipo',
      render: (t) => (
        <div className="flex items-center gap-2">
          {t.type === 'PROVEEDOR' ? (
            <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          ) : (
            <User className="w-4 h-4 text-green-600 dark:text-green-400" />
          )}
          <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700">
            {t.type}
          </span>
        </div>
      ),
    },
    {
      key: 'ruc_dni',
      label: 'RUC/DNI',
      render: (t) => (
        <div>
          <div className="font-mono text-sm font-semibold">{t.tax_id}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{t.tax_id_type}</div>
        </div>
      ),
    },
    {
      key: 'nombre',
      label: 'Nombre / Razón Social',
      render: (t) => (
        <div>
          <div className="font-semibold">{t.name}</div>
          {t.commercial_name && (
            <div className="text-xs text-gray-500 dark:text-gray-400">Comercial: {t.commercial_name}</div>
          )}
        </div>
      ),
    },
    {
      key: 'direccion',
      label: 'Dirección',
      render: (t) => (
        <div className="text-sm">
          {t.address ? (
            <>
              <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                <MapPin className="w-3 h-3" />
                <span>{t.address}</span>
              </div>
              {(t.district || t.province || t.department) && (
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {[t.district, t.province, t.department].filter(Boolean).join(', ')}
                </div>
              )}
            </>
          ) : (
            <span className="text-gray-400">-</span>
          )}
        </div>
      ),
    },
    {
      key: 'contacto',
      label: 'Contacto',
      render: (t) => (
        <div className="text-sm space-y-1">
          {t.phone && (
            <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
              <Phone className="w-3 h-3" />
              <span>{t.phone}</span>
            </div>
          )}
          {t.email && (
            <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
              <Mail className="w-3 h-3" />
              <span className="truncate max-w-[200px]">{t.email}</span>
            </div>
          )}
          {!t.phone && !t.email && <span className="text-gray-400">-</span>}
        </div>
      ),
    },
    {
      key: 'estado',
      label: 'Estado',
      render: (t) => (
        <div className="flex items-center gap-2">
          {t.active ? (
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
          ) : (
            <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
          )}
          <span className={`text-sm ${t.active ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
            {t.active ? 'Activo' : 'Inactivo'}
          </span>
        </div>
      ),
    },
    {
      key: 'acciones',
      label: 'Acciones',
      render: (t) => (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openEdit(t)}
            className="text-primary-600 hover:text-primary-700"
          >
            <Edit2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openDelete(t)}
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ]

  const filteredData = terceros

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumbs */}
      <Breadcrumbs />

      {/* Page Header */}
      <PageHeader
        title="Proveedores y Clientes"
        subtitle="Registro de Proveedores y Clientes según normativa contable peruana"
        icon={Users}
        iconColor="primary"
        actions={
          <ActionBar
            onRefresh={reload}
            loading={loading}
          >
            <Button
              variant="outline"
              onClick={() => openCreate('CLIENTE')}
              className="text-green-600 border-green-300 hover:bg-green-50 dark:hover:bg-green-900/20"
            >
              <Plus className="w-4 h-4" />
              Nuevo Cliente
            </Button>
            <Button
              variant="outline"
              onClick={() => openCreate('PROVEEDOR')}
              className="text-blue-600 border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20"
            >
              <Plus className="w-4 h-4" />
              Nuevo Proveedor
            </Button>
          </ActionBar>
        }
      />

      {/* Estadísticas */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <div className="p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.total}</div>
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Proveedores</div>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.proveedores}</div>
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Clientes</div>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.clientes}</div>
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Activos</div>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.activos}</div>
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Inactivos</div>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.inactivos}</div>
            </div>
          </Card>
        </div>
      )}

      {/* Filter Bar */}
      <FilterBar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Buscar por nombre, RUC, DNI..."
      >
        <Select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          options={[
            { value: 'TODOS', label: 'Todos' },
            { value: 'PROVEEDOR', label: 'Proveedores' },
            { value: 'CLIENTE', label: 'Clientes' },
          ]}
          fullWidth={false}
          className="min-w-[140px]"
        />
        <Select
          value={filterActive === undefined ? 'all' : filterActive ? 'true' : 'false'}
          onChange={(e) => setFilterActive(e.target.value === 'all' ? undefined : e.target.value === 'true')}
          options={[
            { value: 'all', label: 'Todos los estados' },
            { value: 'true', label: 'Activos' },
            { value: 'false', label: 'Inactivos' },
          ]}
          fullWidth={false}
          className="min-w-[160px]"
        />
      </FilterBar>

      {/* Tabla */}
      <Card>
        <CardHeader 
          title={`Lista de Terceros${filteredData.length > 0 ? ` (${filteredData.length} tercero${filteredData.length !== 1 ? 's' : ''})` : ''}`}
          icon={<Users className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
        />
        <div className="p-6">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
              <p className="mt-4 text-gray-600 dark:text-gray-400">Cargando terceros...</p>
            </div>
          ) : filteredData.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">No hay terceros registrados</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">Comienza registrando un proveedor o cliente</p>
              <div className="flex gap-2 justify-center">
                <Button onClick={() => openCreate('PROVEEDOR')} variant="primary">
                  <Plus className="w-4 h-4 mr-2" />
                  Nuevo Proveedor
                </Button>
                <Button onClick={() => openCreate('CLIENTE')} variant="outline">
                  <Plus className="w-4 h-4 mr-2" />
                  Nuevo Cliente
                </Button>
              </div>
            </div>
          ) : (
            <DataTable data={filteredData} columns={columns} />
          )}
        </div>
      </Card>

      {/* Formulario Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => {
            setShowForm(false)
            setErrors({})
          }}></div>
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gradient-to-r from-primary-600 to-primary-700 text-white p-6 rounded-t-2xl z-10">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">
                    {editingTercero ? 'Editar' : 'Nuevo'} {form.type === 'PROVEEDOR' ? 'Proveedor' : 'Cliente'}
                  </h2>
                  <p className="text-sm text-primary-100">Complete los datos según normativa peruana</p>
                </div>
                <button onClick={() => {
                  setShowForm(false)
                  setErrors({})
                }} className="text-white hover:text-gray-200">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Indicador de campos obligatorios */}
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                <p className="text-sm text-amber-900 dark:text-amber-100">
                  <strong>⚠️ Campos obligatorios:</strong> Los campos marcados con <span className="text-red-500">*</span> son obligatorios.
                </p>
                <ul className="text-xs text-amber-800 dark:text-amber-200 mt-2 ml-4 list-disc space-y-1">
                  <li>Tipo de Documento</li>
                  <li>RUC/DNI (con formato válido)</li>
                  <li>Nombre o Razón Social</li>
                </ul>
              </div>

              {/* Información Básica */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Información Básica</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                      Tipo de Documento <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={form.tax_id_type}
                      onChange={e => {
                        setForm({ ...form, tax_id_type: e.target.value, tax_id: '' })
                        setErrors({ ...errors, tax_id_type: '', tax_id: '' })
                      }}
                      className={`w-full border rounded-xl px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 ${
                        errors.tax_id_type 
                          ? 'border-red-500 dark:border-red-500' 
                          : 'border-gray-300 dark:border-gray-600'
                      }`}
                    >
                      <option value="6">6 - RUC (11 dígitos)</option>
                      <option value="1">1 - DNI (8 dígitos)</option>
                      <option value="4">4 - Carné de Extranjería</option>
                      <option value="7">7 - Pasaporte</option>
                      <option value="0">0 - Documento de Identidad Extranjero</option>
                    </select>
                    {errors.tax_id_type && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.tax_id_type}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                      {form.tax_id_type === '6' ? 'RUC' : form.tax_id_type === '1' ? 'DNI' : form.tax_id_type === '4' ? 'Carné de Extranjería' : form.tax_id_type === '7' ? 'Pasaporte' : 'Documento'} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      maxLength={form.tax_id_type === '6' ? 11 : form.tax_id_type === '1' ? 8 : 20}
                      value={form.tax_id}
                      onChange={e => {
                        const value = form.tax_id_type === '0' ? e.target.value : e.target.value.replace(/\D/g, '')
                        setForm({ ...form, tax_id: value })
                        setErrors({ ...errors, tax_id: '' })
                      }}
                      placeholder={form.tax_id_type === '6' ? '20123456789' : form.tax_id_type === '1' ? '12345678' : ''}
                      className={`w-full border rounded-xl px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono ${
                        errors.tax_id 
                          ? 'border-red-500 dark:border-red-500' 
                          : 'border-gray-300 dark:border-gray-600'
                      }`}
                    />
                    {errors.tax_id ? (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.tax_id}</p>
                    ) : (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {form.tax_id_type === '6' && 'Se validará el checksum SUNAT'}
                        {form.tax_id_type === '1' && 'Debe tener 8 dígitos numéricos'}
                      </p>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                      Razón Social / Nombre Completo <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={e => {
                        setForm({ ...form, name: e.target.value })
                        setErrors({ ...errors, name: '' })
                      }}
                      className={`w-full border rounded-xl px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 ${
                        errors.name 
                          ? 'border-red-500 dark:border-red-500' 
                          : 'border-gray-300 dark:border-gray-600'
                      }`}
                      placeholder="Nombre o razón social completo"
                    />
                    {errors.name && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.name}</p>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                      Nombre Comercial
                    </label>
                    <input
                      type="text"
                      value={form.commercial_name || ''}
                      onChange={e => setForm({ ...form, commercial_name: e.target.value || null })}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      placeholder="Nombre comercial (opcional)"
                    />
                  </div>
                </div>
              </div>

              {/* Dirección */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Dirección</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Dirección Completa</label>
                    <input
                      type="text"
                      value={form.address || ''}
                      onChange={e => setForm({ ...form, address: e.target.value || null })}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      placeholder="Calle, número, urbanización..."
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Distrito</label>
                    <input
                      type="text"
                      value={form.district || ''}
                      onChange={e => setForm({ ...form, district: e.target.value || null })}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Provincia</label>
                    <input
                      type="text"
                      value={form.province || ''}
                      onChange={e => setForm({ ...form, province: e.target.value || null })}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Departamento</label>
                    <input
                      type="text"
                      value={form.department || ''}
                      onChange={e => setForm({ ...form, department: e.target.value || null })}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                </div>
              </div>

              {/* Contacto */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Información de Contacto</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Teléfono</label>
                    <input
                      type="tel"
                      value={form.phone || ''}
                      onChange={e => setForm({ ...form, phone: e.target.value || null })}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      placeholder="+51 999 999 999"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Email</label>
                    <input
                      type="email"
                      value={form.email || ''}
                      onChange={e => {
                        setForm({ ...form, email: e.target.value || null })
                        setErrors({ ...errors, email: '' })
                      }}
                      className={`w-full border rounded-xl px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 ${
                        errors.email 
                          ? 'border-red-500 dark:border-red-500' 
                          : 'border-gray-300 dark:border-gray-600'
                      }`}
                      placeholder="contacto@empresa.com"
                    />
                    {errors.email && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.email}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Sitio Web</label>
                    <input
                      type="url"
                      value={form.website || ''}
                      onChange={e => setForm({ ...form, website: e.target.value || null })}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      placeholder="https://www.empresa.com"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Persona de Contacto</label>
                    <input
                      type="text"
                      value={form.contact_person || ''}
                      onChange={e => setForm({ ...form, contact_person: e.target.value || null })}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      placeholder="Nombre del contacto"
                    />
                  </div>
                </div>
              </div>

              {/* Información SUNAT / PLE */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Información SUNAT / PLE</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                      País de Residencia (Catálogo 18 SUNAT)
                    </label>
                    <select
                      value={form.country_code || 'PE'}
                      onChange={e => setForm({ ...form, country_code: e.target.value })}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    >
                      <option value="PE">PE - Perú</option>
                      <option value="US">US - Estados Unidos</option>
                      <option value="MX">MX - México</option>
                      <option value="CO">CO - Colombia</option>
                      <option value="CL">CL - Chile</option>
                      <option value="AR">AR - Argentina</option>
                      <option value="BR">BR - Brasil</option>
                      <option value="ES">ES - España</option>
                      <option value="FR">FR - Francia</option>
                      <option value="DE">DE - Alemania</option>
                      <option value="GB">GB - Reino Unido</option>
                      <option value="CN">CN - China</option>
                      <option value="JP">JP - Japón</option>
                    </select>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Código de país según Catálogo 18 SUNAT</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                      Tipo de {form.type === 'PROVEEDOR' ? 'Proveedor' : 'Cliente'}
                    </label>
                    <select
                      value={form.third_party_type || 'Nacional'}
                      onChange={e => setForm({ ...form, third_party_type: e.target.value })}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    >
                      <option value="Nacional">Nacional</option>
                      <option value="Extranjero">Extranjero</option>
                      <option value="No domiciliado">No domiciliado</option>
                    </select>
                  </div>
                  {form.type === 'PROVEEDOR' && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                        Estado SUNAT (Solo para Proveedores)
                      </label>
                      <select
                        value={form.sunat_status || ''}
                        onChange={e => setForm({ ...form, sunat_status: e.target.value || null })}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      >
                        <option value="">No especificado</option>
                        <option value="Habido">Habido</option>
                        <option value="No habido">No habido</option>
                      </select>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Estado según SUNAT</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Estado y Notas */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Estado y Notas</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.active}
                        onChange={e => setForm({ ...form, active: e.target.checked })}
                        className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Activo</span>
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Los terceros inactivos no aparecerán en los selectores</p>
                  </div>
                </div>
                <div className="mt-4">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Notas Adicionales</label>
                  <textarea
                    value={form.notes || ''}
                    onChange={e => setForm({ ...form, notes: e.target.value || null })}
                    rows={3}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    placeholder="Información adicional relevante..."
                  />
                </div>
              </div>

              {/* Botones */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <Button variant="outline" onClick={() => setShowForm(false)}>
                  Cancelar
                </Button>
                <Button onClick={doSave} className="bg-primary-600 hover:bg-primary-700 text-white">
                  {editingTercero ? 'Actualizar' : 'Guardar'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación de eliminación */}
      {confirmDelete && (
        <MessageModal
          isOpen={!!confirmDelete}
          type="error"
          title="¿Eliminar Tercero?"
          message={`¿Está seguro de eliminar a ${confirmDelete.name} (${confirmDelete.tax_id})? Esta acción no se puede deshacer.\n\nAdvertencia: No se podrá eliminar si tiene compras o ventas asociadas.`}
          onClose={() => setConfirmDelete(null)}
          onConfirm={doDelete}
          confirmText="Eliminar"
          cancelText="Cancelar"
          showCancel={true}
        />
      )}

      {/* Modal de mensajes */}
      {messageModal && (
        <MessageModal
          isOpen={!!messageModal}
          type={messageModal.type}
          title={messageModal.title}
          message={messageModal.message}
          onClose={() => setMessageModal(null)}
        />
      )}
    </div>
  )
}

