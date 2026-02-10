import { useState, useEffect } from 'react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { PageHeader } from '@/components/ui/PageHeader'
import { ActionBar } from '@/components/ui/ActionBar'
import { FilterBar } from '@/components/ui/FilterBar'
import { Select } from '@/components/ui/Select'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { Search, Plus, Edit2, Trash2, FileText, Download, BookOpen, Loader2, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { listAccounts, createAccount, updateAccount, deleteAccount, seedPcge, type Account, type AccountIn, type AccountUpdate } from '@/api'
import { useOrg } from '@/stores/org'

const ACCOUNT_TYPES = [
  { value: 'A', label: 'Activo' },
  { value: 'P', label: 'Pasivo' },
  { value: 'PN', label: 'Patrimonio' },
  { value: 'I', label: 'Ingreso' },
  { value: 'G', label: 'Gasto' },
  { value: 'C', label: 'Control' },
]

// Helper para extraer class_code del código
function extractClassCode(code: string): string | null {
  const parts = code.split('.')
  return parts[0] || null
}

// Mapeo de códigos de clase a nombres
const CLASS_NAMES: Record<string, string> = {
  "10": "Caja y Bancos",
  "12": "Cuentas por Cobrar",
  "20": "Existencias",
  "33": "Activo Fijo",
  "40": "Tributos",
  "41": "Remuneraciones",
  "42": "Cuentas por Pagar",
  "50": "Capital",
  "58": "Reservas",
  "59": "Resultados",
  "60": "Gastos",
  "65": "Ajustes",
  "68": "Gastos Financieros",
  "69": "Costos",
  "70": "Ingresos",
  "75": "Otros Ingresos",
  "90": "Orden",
}

const TYPE_LABELS: Record<string, string> = {
  'A': 'ACTIVO',
  'P': 'PASIVO',
  'PN': 'PATRIMONIO',
  'I': 'INGRESO',
  'G': 'GASTO',
  'C': 'CONTROL',
}

export default function Plan() {
  const { empresaId } = useOrg()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('ALL')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Account | null>(null)
  const [seedingPcge, setSeedingPcge] = useState(false)
  const [messageModal, setMessageModal] = useState<{ type: 'success' | 'error' | 'info' | 'warning'; title: string; message: string } | null>(null)
  const [confirmSeedModal, setConfirmSeedModal] = useState<{ replaceAll: boolean; msg: string } | null>(null)
  const [form, setForm] = useState({ 
    code: '', 
    name: '', 
    level: 1, 
    type: 'A', 
    class_code: null as string | null,
    class_name: null as string | null,
    active: true 
  })

  useEffect(() => {
    reload()
  }, [empresaId])

  async function reload() {
    try {
      setLoading(true)
      const data = await listAccounts(empresaId)
      setAccounts(data)
    } catch (err: any) {
      alert(`Error al cargar cuentas: ${err.message || err}`)
    } finally {
      setLoading(false)
    }
  }

  function openCreate() {
    setEditing(null)
    setForm({ 
      code: '', 
      name: '', 
      level: 1, 
      type: 'A', 
      class_code: null,
      class_name: null,
      active: true 
    })
    setShowForm(true)
  }

  function openEdit(acc: Account) {
    setEditing(acc)
    setForm({ 
      code: acc.code, 
      name: acc.name, 
      level: acc.level, 
      type: acc.type, 
      class_code: acc.class_code || null,
      class_name: acc.class_name || null,
      active: acc.active 
    })
    setShowForm(true)
  }

  // Calcular class_code y class_name automáticamente cuando cambia el código
  function handleCodeChange(code: string) {
    const classCode = extractClassCode(code)
    const className = classCode ? CLASS_NAMES[classCode] || null : null
    setForm(f => ({ ...f, code, class_code: classCode, class_name: className }))
  }

  async function save() {
    if (!form.code.trim() || !form.name.trim()) {
      alert('El código y nombre son obligatorios')
      return
    }
    try {
      if (editing) {
        await updateAccount(editing.id, form)
      } else {
        await createAccount({ 
          company_id: empresaId, 
          code: form.code.trim(), 
          name: form.name.trim(), 
          level: form.level, 
          type: form.type,
          class_code: form.class_code,
          class_name: form.class_name
        })
      }
      setShowForm(false)
      reload()
    } catch (err: any) {
      alert(`Error al guardar cuenta: ${err.message || err}`)
    }
  }

  async function doDelete() {
    if (!confirmDelete) return
    try {
      await deleteAccount(confirmDelete.id)
      setConfirmDelete(null)
      reload()
    } catch (err: any) {
      alert(`Error al eliminar cuenta: ${err.message || err}`)
    }
  }

  function handleSeedPcgeClick() {
    if (!empresaId) {
      setMessageModal({ type: 'warning', title: 'Empresa requerida', message: 'Selecciona una empresa primero.' })
      return
    }
    const totalAccounts = accounts.length
    const hasCustomAccounts = totalAccounts > 0

    if (hasCustomAccounts) {
      setConfirmSeedModal({
        replaceAll: true,
        msg: `Esta operación eliminará TODAS las ${totalAccounts} cuenta(s) existente(s) y cargará solo las cuentas del plan_base.csv (PCGE completo).\n\nSi alguna cuenta tiene movimientos contables, la operación fallará.\n\n¿Desea continuar?`
      })
    } else {
      setConfirmSeedModal({
        replaceAll: false,
        msg: '¿Cargar Plan de Cuentas Base (plan_base.csv) para esta empresa?\n\nSe crearán todas las cuentas del PCGE completo con class_code y class_name según PCGE 2019.'
      })
    }
  }

  async function doSeedPcge(replaceAll: boolean) {
    if (!empresaId) return
    setConfirmSeedModal(null)
    try {
      setSeedingPcge(true)
      const res = await seedPcge(empresaId, replaceAll)
      let msg = ''
      if (replaceAll) {
        msg = `PCGE cargado exitosamente:\n• ${res.deleted || 0} cuenta(s) eliminada(s)\n• ${res.created} cuenta(s) creada(s) del plan_base.csv`
      } else {
        msg = `PCGE sembrado: ${res.created} cuenta(s) creada(s).`
      }
      if (res.failed_deletions && res.failed_deletions.length > 0) {
        msg += `\n\n⚠️ Advertencia: ${res.failed_deletions.length} cuenta(s) no se pudieron eliminar porque tienen movimientos contables.`
      }
      setMessageModal({ type: 'success', title: 'Plan cargado', message: msg })
      reload()
    } catch (err: any) {
      let errMsg = err?.message || 'Error desconocido'
      try {
        const jsonStart = errMsg.indexOf('{')
        if (jsonStart >= 0) {
          const parsed = JSON.parse(errMsg.slice(jsonStart))
          if (parsed?.detail) errMsg = String(parsed.detail).replace(/\\n/g, '\n')
        }
      } catch (_) {}
      setMessageModal({ type: 'error', title: 'Error al cargar plan', message: errMsg })
    } finally {
      setSeedingPcge(false)
    }
  }

  const filteredAccounts = accounts.filter(account => {
    const matchesSearch = account.code.includes(searchTerm) || 
                         account.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesFilter = filterType === 'ALL' || account.type === filterType
    return matchesSearch && matchesFilter
  })

  const typeColors: Record<string, string> = {
    'A': 'badge-info',
    'P': 'badge-warning',
    'PN': 'badge-success',
    'I': 'badge-success',
    'G': 'badge-error',
    'C': 'badge-secondary',
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumbs */}
      <Breadcrumbs />

      {/* Page Header */}
      <PageHeader
        title="Plan de Cuentas"
        subtitle="Gestiona tu plan contable (PCGE 2019) para la empresa seleccionada"
        icon={BookOpen}
        iconColor="primary"
        actions={
          <ActionBar
            onNew={openCreate}
            onRefresh={reload}
            loading={loading}
            newLabel="Nueva Cuenta"
          >
            <Button variant="outline" onClick={handleSeedPcgeClick} disabled={seedingPcge}>
              {seedingPcge ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {seedingPcge ? 'Cargando plan...' : 'Cargar Plan Base'}
            </Button>
          </ActionBar>
        }
      />

      {/* Filter Bar */}
      <FilterBar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Buscar cuenta por código o nombre..."
      >
        <Select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          options={[
            { value: 'ALL', label: 'Todos los tipos' },
            { value: 'A', label: 'Activo' },
            { value: 'P', label: 'Pasivo' },
            { value: 'PN', label: 'Patrimonio' },
            { value: 'I', label: 'Ingreso' },
            { value: 'G', label: 'Gasto' },
            { value: 'C', label: 'Control' },
          ]}
          fullWidth={false}
          className="min-w-[160px]"
        />
      </FilterBar>

      {/* Accounts Table */}
      <Card>
        <CardHeader 
          title={`Lista de Cuentas${filteredAccounts.length > 0 ? ` (${filteredAccounts.length} cuenta${filteredAccounts.length !== 1 ? 's' : ''})` : ''}`}
          icon={<BookOpen className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
        />
        <DataTable
          data={filteredAccounts}
          loading={loading}
          emptyMessage="No hay cuentas. Use 'Cargar Plan Base' para cargar el plan contable completo."
          pageSize={15}
          columns={[
            {
              key: 'code',
              label: 'Código',
              render: (account) => (
                <div className="font-mono text-sm font-semibold text-primary-600 dark:text-primary-400">
                  {account.code}
                </div>
              ),
            },
            {
              key: 'name',
              label: 'Nombre',
              render: (account) => (
                <div 
                  className="text-sm text-gray-900 dark:text-gray-100"
                  style={{ paddingLeft: `${(account.level - 1) * 20}px` }}
                >
                  {account.level > 1 && '└ '}
                  {account.name}
                </div>
              ),
            },
            {
              key: 'level',
              label: 'Nivel',
              render: (account) => (
                <span className="badge badge-info">{account.level}</span>
              ),
            },
            {
              key: 'type',
              label: 'Naturaleza',
              render: (account) => (
                <span className={`badge ${typeColors[account.type] || 'badge-info'}`}>
                  {TYPE_LABELS[account.type] || account.type}
                </span>
              ),
            },
            {
              key: 'class',
              label: 'Clase PCGE',
              render: (account) => (
                <div className="text-sm">
                  {account.class_code && (
                    <div className="font-mono text-xs text-gray-600 dark:text-gray-400">
                      {account.class_code}
                    </div>
                  )}
                  {account.class_name && (
                    <div className="text-xs text-gray-500 dark:text-gray-500">
                      {account.class_name}
                    </div>
                  )}
                  {!account.class_code && !account.class_name && (
                    <span className="text-xs text-gray-400">-</span>
                  )}
                </div>
              ),
            },
            {
              key: 'active',
              label: 'Estado',
              render: (account) => (
                <span className={`badge ${account.active ? 'badge-success' : 'badge-error'}`}>
                  {account.active ? 'Activa' : 'Inactiva'}
                </span>
              ),
            },
            {
              key: 'acciones',
              label: 'Acciones',
              render: (account) => (
                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(account)} className="hover:bg-blue-50 dark:hover:bg-blue-900/20">
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  {account.is_base ? (
                    <span className="text-xs text-gray-500" title="Cuenta base del plan contable - no se puede eliminar">
                      🔒 Base
                    </span>
                  ) : (
                    <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={() => setConfirmDelete(account)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ),
              className: 'text-right',
            },
          ]}
        />
      </Card>

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Header con gradiente */}
            <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white p-6 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">{editing ? 'Editar Cuenta' : 'Nueva Cuenta'}</h2>
                  <p className="text-sm text-primary-100">{editing ? 'Modifica los datos de la cuenta' : 'Crea una nueva cuenta contable'}</p>
                </div>
              </div>
            </div>
            
            {/* Formulario */}
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    Código
                    <span className="text-red-500">*</span>
                  </label>
                  <input 
                    value={form.code} 
                    onChange={e => handleCodeChange(e.target.value)} 
                    className="w-full border-2 border-gray-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
                    placeholder="Ej: 10.10"
                  />
                  {form.class_code && (
                    <p className="text-xs text-gray-500 mt-1">
                      Clase: <span className="font-mono">{form.class_code}</span> - {form.class_name || 'Sin nombre'}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">Nivel</label>
                  <input 
                    type="number" 
                    min={1} 
                    max={6} 
                    value={form.level} 
                    onChange={e => setForm(f => ({ ...f, level: Number(e.target.value) }))} 
                    className="w-full border-2 border-gray-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
                  />
                  <p className="text-xs text-gray-500">Nivel de detalle (1-6)</p>
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    Nombre de la Cuenta
                    <span className="text-red-500">*</span>
                  </label>
                  <input 
                    value={form.name} 
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} 
                    className="w-full border-2 border-gray-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
                    placeholder="Ej: Caja y Bancos"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">
                    Naturaleza Contable
                    <span className="text-red-500 ml-1">*</span>
                  </label>
                  <select 
                    value={form.type} 
                    onChange={e => setForm(f => ({ ...f, type: e.target.value }))} 
                    className="w-full border-2 border-gray-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all bg-white"
                  >
                    {ACCOUNT_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  {form.type && (
                    <span className={`inline-block mt-2 badge ${typeColors[form.type] || 'badge-info'} text-xs`}>
                      {TYPE_LABELS[form.type] || form.type}
                    </span>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    La naturaleza contable define el comportamiento de la cuenta (Activo, Pasivo, etc.)
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">Clase PCGE</label>
                  <div className="flex gap-2">
                    <input 
                      value={form.class_code || ''} 
                      onChange={e => {
                        const classCode = e.target.value || null
                        const className = classCode ? CLASS_NAMES[classCode] || null : null
                        setForm(f => ({ ...f, class_code: classCode, class_name: className }))
                      }}
                      className="w-20 border-2 border-gray-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
                      placeholder="10"
                      maxLength={2}
                    />
                    <input 
                      value={form.class_name || ''} 
                      onChange={e => setForm(f => ({ ...f, class_name: e.target.value || null }))}
                      className="flex-1 border-2 border-gray-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
                      placeholder="Caja y Bancos"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Clase PCGE para agrupación y reportes normativos (se calcula automáticamente del código)
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">Estado</label>
                  <select 
                    value={form.active ? 'true' : 'false'} 
                    onChange={e => setForm(f => ({ ...f, active: e.target.value === 'true' }))} 
                    className="w-full border-2 border-gray-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all bg-white"
                  >
                    <option value="true">Activa</option>
                    <option value="false">Inactiva</option>
                  </select>
                </div>
              </div>
              
              {/* Botones de acción */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <Button variant="outline" onClick={() => setShowForm(false)} className="px-6">
                  Cancelar
                </Button>
                <Button onClick={save} className="px-6 bg-primary-600 hover:bg-primary-700">
                  {editing ? 'Actualizar' : 'Crear'} Cuenta
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setConfirmDelete(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="text-lg font-bold mb-2">Eliminar Cuenta</div>
            {confirmDelete.is_base ? (
              <div className="text-sm text-red-700 bg-red-50 p-3 rounded-lg mb-4">
                <strong>⚠️ Cuenta Base Protegida</strong><br/>
                La cuenta "{confirmDelete.code} - {confirmDelete.name}" es una cuenta base del plan contable (plan_base.csv) y <strong>no puede ser eliminada</strong>.
                <br/><br/>
                Si necesita desactivarla, puede editarla y cambiar su estado a "Inactiva".
              </div>
            ) : (
              <div className="text-sm text-gray-700">
                Esta acción es <span className="font-semibold text-red-600">irreversible</span>. 
                ¿Eliminar cuenta "{confirmDelete.code} - {confirmDelete.name}"?
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cerrar</Button>
              {!confirmDelete.is_base && (
                <Button className="bg-red-600 hover:bg-red-700" onClick={doDelete}>Eliminar</Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
            <FileText className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-blue-900 mb-1">Plan de Cuentas Base (PCGE 2019)</div>
            <p className="text-sm text-blue-700">
              Este plan de cuentas está basado en el Plan Contable General Empresarial 2019 
              aprobado por la SUNAT para empresas peruanas. Use <strong>Cargar Plan Base</strong> para 
              cargar todas las cuentas desde plan_base.csv.
            </p>
          </div>
        </div>
      </Card>

      {/* Modal de mensajes (mismo estilo que Asientos) */}
      {messageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setMessageModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className={`flex items-center gap-3 mb-4 ${
              messageModal.type === 'success' ? 'text-green-600' :
              messageModal.type === 'error' ? 'text-red-600' :
              messageModal.type === 'warning' ? 'text-amber-600' : 'text-blue-600'
            }`}>
              {messageModal.type === 'success' && <CheckCircle className="w-8 h-8" />}
              {messageModal.type === 'error' && <AlertCircle className="w-8 h-8" />}
              {messageModal.type === 'warning' && <AlertTriangle className="w-8 h-8" />}
              {messageModal.type === 'info' && <Info className="w-8 h-8" />}
              <div className="text-xl font-bold">{messageModal.title}</div>
            </div>
            <div className="text-sm text-gray-700 whitespace-pre-line mb-6">
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

      {/* Modal de confirmación Cargar Plan Base */}
      {confirmSeedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setConfirmSeedModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4 text-amber-600">
              <AlertTriangle className="w-8 h-8" />
              <div className="text-xl font-bold">Confirmar</div>
            </div>
            <div className="text-sm text-gray-700 whitespace-pre-line mb-6">
              {confirmSeedModal.msg}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmSeedModal(null)}>
                Cancelar
              </Button>
              <Button onClick={() => doSeedPcge(confirmSeedModal.replaceAll)}>
                Sí, cargar plan
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
