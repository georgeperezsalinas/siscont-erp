import { useEffect, useState } from 'react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { PageHeader } from '@/components/ui/PageHeader'
import { ActionBar } from '@/components/ui/ActionBar'
import { FilterBar } from '@/components/ui/FilterBar'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { Plus, Edit2, Trash2, UserCheck, Mail, User as UserIcon, Users } from 'lucide-react'
import { listUsers, createUser, updateUser, deleteUser, listCompanies, type User, type UserIn, type Company } from '@/api'
import { listRoles, type Role } from '@/api'
import { useAuth } from '@/stores/auth'
import { showToast } from '@/components/ui/Toast'
import { getUserPhotoUrl } from '@/api'

export default function Usuarios() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<User | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [form, setForm] = useState({ username: '', password: '', role: 'OPERADOR', role_id: undefined as number | undefined, company_ids: [] as number[], nombre: '', apellido: '', correo: '' })

  useEffect(() => {
    if (currentUser?.role === 'ADMINISTRADOR') {
      reload()
    }
  }, [currentUser])

  async function reload() {
    try {
      setLoading(true)
      const [usersData, rolesData, companiesData] = await Promise.all([
        listUsers(),
        listRoles(true), // Solo roles activos
        listCompanies({ page: 1, page_size: 100 })
      ])
      setUsers(usersData)
      setRoles(rolesData)
      setCompanies(companiesData.items)
    } finally {
      setLoading(false)
    }
  }

  async function openCreate() {
    if (companies.length === 0 || roles.length === 0) {
      await reload()
    }
    // Buscar rol OPERADOR por defecto
    const defaultRole = roles.find(r => r.name === 'OPERADOR') || roles[0]
    setForm({ 
      username: '', 
      password: '', 
      role: defaultRole?.name || 'OPERADOR',
      role_id: defaultRole?.id,
      company_ids: [],
      nombre: '',
      apellido: '',
      correo: ''
    })
    setEditing(null)
    setShowForm(true)
  }

  async function openEdit(u: User) {
    if (companies.length === 0 || roles.length === 0) {
      await reload()
    }
    // Buscar el rol del usuario en la lista de roles dinámicos
    const userRole = roles.find(r => r.name === u.role) || null
    setEditing(u)
    setForm({ 
      username: u.username, 
      password: '', // Limpiar contraseña al editar
      role: u.role,
      role_id: userRole?.id,
      company_ids: u.companies.map(c => c.id),
      nombre: u.nombre || '',
      apellido: u.apellido || '',
      correo: u.correo || ''
    })
    setShowForm(true)
  }

  async function save() {
    if (!form.username.trim()) {
      showToast('error', 'El nombre de usuario es obligatorio', 'Error de validación')
      return
    }
    if (!editing && !form.password.trim()) {
      showToast('error', 'La contraseña es obligatoria para nuevos usuarios', 'Error de validación')
      return
    }
    
    try {
      const userData: any = {
        username: form.username.trim(),
        company_ids: form.company_ids,
        nombre: form.nombre.trim() || null,
        apellido: form.apellido.trim() || null,
        correo: form.correo.trim() || null
      }
      // Usar role_id si está disponible (rol dinámico), sino usar role (string)
      if (form.role_id) {
        userData.role_id = form.role_id
      } else {
        userData.role = form.role
      }
      if (editing) {
        if (form.password.trim()) {
          userData.password = form.password.trim()
        }
        await updateUser(editing.id, userData)
        showToast('success', `Usuario "${form.username}" actualizado correctamente`, 'Éxito')
      } else {
        userData.password = form.password.trim()
        await createUser(userData)
        showToast('success', `Usuario "${form.username}" creado correctamente`, 'Éxito')
      }
      setShowForm(false)
      setEditing(null)
      reload()
    } catch (err: any) {
      console.error('Error guardando usuario:', err)
      showToast('error', err.message || 'Error al guardar el usuario', 'Error')
    }
  }

  async function doDelete() {
    if (!confirmDelete) return
    try {
      await deleteUser(confirmDelete.id)
      showToast('success', `Usuario "${confirmDelete.username}" eliminado correctamente`, 'Éxito')
      setConfirmDelete(null)
      reload()
    } catch (err: any) {
      console.error('Error eliminando usuario:', err)
      showToast('error', err.message || 'Error al eliminar el usuario', 'Error')
    }
  }

  if (currentUser?.role !== 'ADMINISTRADOR') {
    return (
      <div className="space-y-6 animate-fade-in">
        <Card className="p-6 text-center text-gray-600">
          No tienes permisos para acceder a esta sección. Solo administradores pueden gestionar usuarios.
        </Card>
      </div>
    )
  }

  // Filtrar usuarios por búsqueda
  const filteredUsers = searchTerm.trim()
    ? users.filter(u => 
        u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.nombre && u.nombre.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (u.apellido && u.apellido.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (u.correo && u.correo.toLowerCase().includes(searchTerm.toLowerCase())) ||
        u.role.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : users

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumbs */}
      <Breadcrumbs />

      {/* Page Header */}
      <PageHeader
        title="Usuarios"
        subtitle="Gestiona usuarios, roles y asignación de empresas"
        icon={Users}
        iconColor="primary"
        actions={
          <ActionBar
            onNew={openCreate}
            onRefresh={reload}
            loading={loading}
            newLabel="Nuevo Usuario"
          />
        }
      />

      {/* Filter Bar */}
      <FilterBar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Buscar por usuario, nombre, correo o rol..."
      />

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => { setShowForm(false); setEditing(null) }} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="text-lg font-bold mb-4 text-gray-900 dark:text-gray-100">{editing ? 'Editar Usuario' : 'Nuevo Usuario'}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-700 dark:text-gray-300">Usuario</label>
                <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} className="mt-1 w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
              </div>
              <div>
                <label className="text-sm text-gray-700 dark:text-gray-300">{editing ? 'Nueva Contraseña (opcional)' : 'Contraseña'}</label>
                <input 
                  type="password" 
                  value={form.password} 
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))} 
                  placeholder={editing ? 'Dejar vacío para no cambiar' : ''}
                  className="mt-1 w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" 
                />
              </div>
              <div>
                <label className="text-sm text-gray-700 dark:text-gray-300">Nombre</label>
                <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} className="mt-1 w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
              </div>
              <div>
                <label className="text-sm text-gray-700 dark:text-gray-300">Apellido</label>
                <input value={form.apellido} onChange={e => setForm(f => ({ ...f, apellido: e.target.value }))} className="mt-1 w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
              </div>
              <div>
                <label className="text-sm text-gray-700 dark:text-gray-300">Correo</label>
                <input type="email" value={form.correo} onChange={e => setForm(f => ({ ...f, correo: e.target.value }))} className="mt-1 w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
              </div>
              <div>
                <label className="text-sm text-gray-700 dark:text-gray-300">Rol</label>
                <select 
                  value={form.role_id ? form.role_id.toString() : form.role}
                  onChange={e => {
                    const value = e.target.value
                    const selectedRole = roles.find(r => r.id.toString() === value || r.name === value)
                    if (selectedRole) {
                      setForm(f => ({ ...f, role: selectedRole.name, role_id: selectedRole.id }))
                    } else {
                      setForm(f => ({ ...f, role: value, role_id: undefined }))
                    }
                  }}
                  className="mt-1 w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  {roles.length === 0 ? (
                    <option value="">Cargando roles...</option>
                  ) : (
                    roles.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.name} {r.is_system ? '(Sistema)' : ''}
                        {r.description ? ` - ${r.description}` : ''}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>
            <div className="mt-4">
              <label className="text-sm font-medium text-gray-700 mb-2 block">Empresas asignadas</label>
              <div className="border-2 border-gray-300 rounded-xl p-4 bg-gray-50 max-h-64 overflow-y-auto">
                {companies.filter(c => c.active).length === 0 ? (
                  <div className="text-sm text-gray-500 text-center py-4">
                    No hay empresas activas disponibles
                  </div>
                ) : (
                  <div className="space-y-2">
                    {companies.filter(c => c.active).map(c => (
                      <label key={c.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white cursor-pointer transition-colors">
                        <input 
                          type="checkbox" 
                          checked={form.company_ids.includes(c.id)} 
                          onChange={e => {
                            if (e.target.checked) {
                              setForm(f => ({ ...f, company_ids: [...f.company_ids, c.id] }))
                            } else {
                              setForm(f => ({ ...f, company_ids: f.company_ids.filter(id => id !== c.id) }))
                            }
                          }}
                          className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900">{c.name}</div>
                          {c.ruc && <div className="text-xs text-gray-500">RUC: {c.ruc}</div>}
                        </div>
                        {form.company_ids.includes(c.id) && (
                          <span className="text-xs text-primary-600 font-medium">Asignada</span>
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              {form.company_ids.length > 0 && (
                <div className="mt-2 text-xs text-gray-600">
                  {form.company_ids.length} empresa(s) seleccionada(s)
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setShowForm(false); setEditing(null) }}>Cancelar</Button>
              <Button onClick={save}>Guardar</Button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setConfirmDelete(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="text-lg font-bold mb-2">Eliminar Usuario</div>
            <div className="text-sm text-gray-700">¿Eliminar usuario "{confirmDelete.username}"? Esta acción es irreversible.</div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
              <Button className="bg-red-600 hover:bg-red-700" onClick={doDelete}>Eliminar</Button>
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader 
          title={`Lista de Usuarios${filteredUsers.length > 0 ? ` (${filteredUsers.length} usuario${filteredUsers.length !== 1 ? 's' : ''})` : ''}`}
          icon={<Users className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
        />
        <DataTable
          data={filteredUsers}
          loading={loading}
          emptyMessage="No hay usuarios registrados."
          pageSize={10}
          columns={[
            {
              key: 'usuario',
              label: 'Usuario',
              render: (u) => (
                <div className="flex items-center gap-3">
                  {u.foto ? (
                    <img
                      src={getUserPhotoUrl(u.id)}
                      alt={u.nombre || u.username}
                      className="w-8 h-8 rounded-full object-cover border-2 border-gray-200 dark:border-gray-700"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none'
                        const fallback = (e.target as HTMLImageElement).nextElementSibling as HTMLElement
                        if (fallback) fallback.style.display = 'flex'
                      }}
                    />
                  ) : null}
                  <div className={`w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 text-white grid place-items-center text-xs font-bold ${u.foto ? 'hidden' : 'flex'}`}>
                    {(u.nombre && u.apellido) 
                      ? `${u.nombre.charAt(0)}${u.apellido.charAt(0)}`.toUpperCase()
                      : u.username.charAt(0).toUpperCase()
                    }
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {u.nombre && u.apellido ? `${u.nombre} ${u.apellido}` : u.username}
                    </div>
                    {u.nombre && u.apellido && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">@{u.username}</div>
                    )}
                  </div>
                </div>
              ),
            },
            {
              key: 'correo',
              label: 'Correo',
              render: (u) => (
                u.correo ? (
                  <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <span>{u.correo}</span>
                  </div>
                ) : (
                  <span className="text-sm text-gray-400 dark:text-gray-500">No especificado</span>
                )
              ),
            },
            {
              key: 'role',
              label: 'Rol',
              render: (u) => (
                <span className="badge badge-primary">{u.role}</span>
              ),
            },
            {
              key: 'companies',
              label: 'Empresas',
              render: (u) =>
                u.companies.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {u.companies.slice(0, 2).map(c => (
                      <div key={c.id} className="text-sm text-gray-700 dark:text-gray-300">
                        {c.name}
                      </div>
                    ))}
                    {u.companies.length > 2 && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        +{u.companies.length - 2} más
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-gray-400 dark:text-gray-500">Sin empresas asignadas</span>
                ),
            },
            {
              key: 'acciones',
              label: 'Acciones',
              render: (u) => (
                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(u)} className="hover:bg-blue-50 dark:hover:bg-blue-900/20" title="Editar usuario">
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={() => setConfirmDelete(u)} title="Eliminar usuario">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ),
              className: 'text-right',
            },
          ]}
        />
      </Card>
    </div>
  )
}

