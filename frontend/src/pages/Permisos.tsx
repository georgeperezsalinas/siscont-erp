import { useEffect, useState } from 'react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Table, TableHeader, TableHeaderCell, TableBody, TableRow, TableCell } from '@/components/ui/Table'
import { PageHeader } from '@/components/ui/PageHeader'
import { ActionBar } from '@/components/ui/ActionBar'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { Settings, CheckCircle, XCircle, AlertCircle, Plus, Edit2, Trash2, Save, X, Shield, UserCheck } from 'lucide-react'
import { listAvailablePermissions, listRolePermissions, getMyPermissions, type Permission, type RolePermission } from '@/api'
import { listRoles, createRole, updateRole, deleteRole, type Role, type RoleIn, type RoleUpdate } from '@/api'
import { useAuth } from '@/stores/auth'
import { MessageModal } from '@/components/ui/MessageModal'
import { Tabs, TabsList, TabsTriggerWithValue, TabsContentWithValue } from '@/components/ui/Tabs'

export default function Permisos() {
  const { user } = useAuth()
  const [availablePermissions, setAvailablePermissions] = useState<Permission[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [myPermissions, setMyPermissions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRole, setSelectedRole] = useState<Role | null>(null)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [showRoleForm, setShowRoleForm] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Role | null>(null)
  const [messageModal, setMessageModal] = useState<{ type: 'success' | 'error'; title: string; message: string } | null>(null)
  const [activeTab, setActiveTab] = useState('roles')
  
  const [roleForm, setRoleForm] = useState<RoleIn>({
    name: '',
    description: '',
    active: true,
    permissions: []
  })

  useEffect(() => {
    if (user?.role === 'ADMINISTRADOR' || user?.is_admin) {
      reload()
    }
  }, [user])

  async function reload() {
    try {
      setLoading(true)
      const [permissions, rolesData, my] = await Promise.all([
        listAvailablePermissions(),
        listRoles(),
        getMyPermissions(),
      ])
      setAvailablePermissions(permissions)
      setRoles(rolesData)
      setMyPermissions(my)
    } catch (err: any) {
      showMessage('error', 'Error', `Error al cargar datos: ${err.message || err}`)
    } finally {
      setLoading(false)
    }
  }

  function showMessage(type: 'success' | 'error', title: string, message: string) {
    setMessageModal({ type, title, message })
  }

  function hasPermission(role: Role, permission: string): boolean {
    return role.permissions.includes(permission)
  }

  // Organizar permisos por módulo (jerarquía)
  function organizePermissionsByModule(permissions: Permission[]): Record<string, Permission[]> {
    const grouped: Record<string, Permission[]> = {}
    permissions.forEach(perm => {
      const module = perm.permission.split('.')[0] || 'otros'
      if (!grouped[module]) {
        grouped[module] = []
      }
      grouped[module].push(perm)
    })
    return grouped
  }

  function togglePermission(role: Role, permission: string) {
    if (role.is_system && editingRole?.id !== role.id) {
      showMessage('error', 'Rol del Sistema', 'No se pueden modificar permisos de roles del sistema desde aquí. Edita el rol primero.')
      return
    }
    
    const currentRole = editingRole || role
    const hasPerm = currentRole.permissions.includes(permission)
    
    if (hasPerm) {
      setRoleForm({
        ...roleForm,
        permissions: roleForm.permissions.filter(p => p !== permission)
      })
    } else {
      setRoleForm({
        ...roleForm,
        permissions: [...roleForm.permissions, permission]
      })
    }
  }

  function openCreate() {
    setEditingRole(null)
    setRoleForm({
      name: '',
      description: '',
      active: true,
      permissions: []
    })
    setShowRoleForm(true)
  }

  function openEdit(role: Role) {
    setEditingRole(role)
    setRoleForm({
      name: role.name,
      description: role.description || '',
      active: role.active,
      permissions: [...role.permissions]
    })
    setSelectedRole(role)
    setShowRoleForm(true)
  }

  function openDelete(role: Role) {
    if (role.is_system) {
      showMessage('error', 'Rol del Sistema', 'No se pueden eliminar roles del sistema.')
      return
    }
    setConfirmDelete(role)
  }

  async function saveRole() {
    if (!roleForm.name.trim()) {
      showMessage('error', 'Campo Requerido', 'El nombre del rol es obligatorio')
      return
    }

    try {
      if (editingRole) {
        // Si es un rol del sistema, no enviar el nombre en la actualización
        const updateData: RoleUpdate = {
          description: roleForm.description,
          active: roleForm.active,
          permissions: roleForm.permissions
        }
        // Solo incluir el nombre si NO es un rol del sistema
        if (!editingRole.is_system) {
          updateData.name = roleForm.name
        }
        await updateRole(editingRole.id, updateData)
        showMessage('success', 'Rol Actualizado', `El rol "${editingRole.name}" ha sido actualizado exitosamente.`)
      } else {
        await createRole(roleForm)
        showMessage('success', 'Rol Creado', `El rol "${roleForm.name}" ha sido creado exitosamente.`)
      }
      setShowRoleForm(false)
      setEditingRole(null)
      await reload()
    } catch (err: any) {
      showMessage('error', 'Error', `Error al guardar rol: ${err.message || err}`)
    }
  }

  async function doDelete() {
    if (!confirmDelete) return
    const roleToDelete = confirmDelete
    const roleIdToDelete = roleToDelete.id
    try {
      await deleteRole(roleIdToDelete)
      
      // Actualización optimista: remover el rol de la lista inmediatamente
      setRoles(prevRoles => prevRoles.filter(r => r.id !== roleIdToDelete))
      
      // Limpiar el rol seleccionado si es el que se está eliminando
      if (selectedRole?.id === roleIdToDelete) {
        setSelectedRole(null)
      }
      // Limpiar el rol en edición si es el que se está eliminando
      if (editingRole?.id === roleIdToDelete) {
        setEditingRole(null)
        setShowRoleForm(false)
      }
      setConfirmDelete(null)
      
      // Mostrar mensaje de éxito
      showMessage('success', 'Rol Eliminado', `El rol "${roleToDelete.name}" ha sido eliminado exitosamente.`)
      
      // Recargar la lista de roles para asegurar sincronización
      await reload()
    } catch (err: any) {
      // Si hay error, revertir la actualización optimista recargando
      await reload()
      setConfirmDelete(null)
      const errorMessage = err.message || err.toString()
      showMessage('error', 'Error al Eliminar', `Error al eliminar rol: ${errorMessage}`)
    }
  }

  if (user && user.role !== 'ADMINISTRADOR' && !user.is_admin) {
    return (
      <Card className="p-6 text-red-600">
        No tienes permisos para ver esta página. Solo los administradores pueden gestionar roles y permisos.
      </Card>
    )
  }

  const currentRole = editingRole || selectedRole

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumbs */}
      <Breadcrumbs />

      {/* Page Header */}
      <PageHeader
        title="Roles y Permisos"
        subtitle="Gestiona roles dinámicos y sus permisos del sistema"
        icon={Shield}
        iconColor="primary"
        actions={
          <ActionBar
            onNew={openCreate}
            onRefresh={reload}
            loading={loading}
            newLabel="Nuevo Rol"
          />
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTriggerWithValue 
            value="roles" 
            activeValue={activeTab} 
            onValueChange={setActiveTab}
          >
            <Shield className="w-4 h-4 mr-2" />
            Roles del Sistema
          </TabsTriggerWithValue>
          {user && user.role !== 'ADMINISTRADOR' && !user.is_admin && (
            <TabsTriggerWithValue 
              value="mis-permisos" 
              activeValue={activeTab} 
              onValueChange={setActiveTab}
            >
              <UserCheck className="w-4 h-4 mr-2" />
              Mis Permisos
            </TabsTriggerWithValue>
          )}
        </TabsList>

        {/* Pestaña: Mis Permisos (solo para no-admins) */}
        {user && user.role !== 'ADMINISTRADOR' && !user.is_admin && (
          <TabsContentWithValue value="mis-permisos" activeValue={activeTab}>
            <Card>
              <CardHeader 
                title={`Mis Permisos${myPermissions.length > 0 ? ` (${myPermissions.length} permiso${myPermissions.length !== 1 ? 's' : ''})` : ''}`}
                icon={<UserCheck className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
              />
              <div className="p-6">
                {loading ? (
                  <div className="text-gray-500 text-center py-8">Cargando permisos...</div>
                ) : myPermissions.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {myPermissions.map(perm => {
                      const permDesc = availablePermissions.find(p => p.permission === perm)
                      return (
                        <div key={perm} className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          <div>
                            <div className="text-sm font-medium text-gray-900">{perm}</div>
                            {permDesc && <div className="text-xs text-gray-600">{permDesc.description}</div>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-gray-500 text-center py-8">No tienes permisos asignados.</div>
                )}
              </div>
            </Card>
          </TabsContentWithValue>
        )}

        {/* Pestaña: Roles del Sistema */}
        <TabsContentWithValue value="roles" activeValue={activeTab}>
          <div className="space-y-6">
            {/* Lista de Roles */}
            <Card>
              <CardHeader 
                title={`Roles del Sistema${roles.length > 0 ? ` (${roles.length} rol${roles.length !== 1 ? 'es' : ''})` : ''}`}
                icon={<Shield className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
              />
              {loading ? (
                <div className="p-6 text-gray-600">Cargando roles...</div>
              ) : (
                <div className="overflow-x-auto border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-200 dark:bg-gray-700 border-b-2 border-gray-400 dark:border-gray-500">
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700" style={{ minWidth: '200px' }}>Rol</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700" style={{ minWidth: '250px' }}>Descripción</th>
                        <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700" style={{ width: '120px' }}>Permisos</th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700" style={{ width: '100px' }}>Estado</th>
                        <th className="px-3 py-2.5 text-center text-xs font-bold text-gray-900 dark:text-gray-100 bg-gray-200 dark:bg-gray-700" style={{ width: '120px' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roles.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-8 text-center text-gray-500 border-r border-gray-300 dark:border-gray-600">
                            No hay roles. Crea uno nuevo para comenzar.
                          </td>
                        </tr>
                      ) : (
                        roles.map((role, idx) => (
                          <tr 
                            key={role.id} 
                            className={`${idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/70'} ${selectedRole?.id === role.id ? 'bg-blue-100 dark:bg-blue-900/30' : ''} border-b border-gray-300 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-blue-900/10 cursor-pointer`}
                            onClick={() => setSelectedRole(role)}
                          >
                            <td className="px-3 py-2 border-r border-gray-300 dark:border-gray-600">
                              <div className="font-medium text-gray-900 dark:text-gray-100">{role.name}</div>
                              {role.is_system && (
                                <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded">Sistema</span>
                              )}
                            </td>
                            <td className="px-3 py-2 border-r border-gray-300 dark:border-gray-600">
                              <div className="text-sm text-gray-600 dark:text-gray-400">{role.description || '(Sin descripción)'}</div>
                            </td>
                            <td className="px-3 py-2 text-right border-r border-gray-300 dark:border-gray-600">
                              <span className="font-semibold text-gray-900 dark:text-gray-100">{role.permissions.length}</span>
                              <span className="text-sm text-gray-500 dark:text-gray-400"> / {availablePermissions.length}</span>
                            </td>
                            <td className="px-3 py-2 text-center border-r border-gray-300 dark:border-gray-600">
                              {role.active ? (
                                <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded">Activo</span>
                              ) : (
                                <span className="text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-2 py-1 rounded">Inactivo</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 hover:bg-blue-100 dark:hover:bg-blue-900/30 border border-blue-300 dark:border-blue-600"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    openEdit(role)
                                  }}
                                  title="Editar rol"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </Button>
                                {!role.is_system && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-300 dark:border-red-600"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      openDelete(role)
                                    }}
                                    title="Eliminar rol"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                )}
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

            {/* Gestión de Permisos por Rol */}
            {selectedRole && !showRoleForm && (
              <Card>
                <CardHeader 
                  title={`Permisos: ${selectedRole.name}${selectedRole.permissions.length > 0 ? ` (${selectedRole.permissions.length} permiso${selectedRole.permissions.length !== 1 ? 's' : ''})` : ''}`}
                  icon={<Shield className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
                  actions={
                    <Button variant="outline" size="sm" onClick={() => setSelectedRole(null)}>
                      <X className="w-4 h-4" />
                    </Button>
                  }
                />
                <div className="p-6">
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="text-sm text-blue-900">
                      <strong>Descripción:</strong> {selectedRole.description || '(Sin descripción)'}
                    </div>
                    <div className="text-xs text-blue-700 mt-1">
                      {selectedRole.is_system 
                        ? 'Este es un rol del sistema. Puedes editar permisos pero no eliminarlo.'
                        : 'Este es un rol personalizado. Puedes editarlo o eliminarlo.'}
                    </div>
                  </div>
                  <div className="space-y-6">
                    {Object.entries(organizePermissionsByModule(availablePermissions)).map(([module, perms]) => (
                      <div key={module}>
                        <h4 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                          {module}
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {perms.map(perm => {
                            const hasAccess = hasPermission(selectedRole, perm.permission)
                            return (
                              <div
                                key={perm.permission}
                                className={`flex items-start gap-3 p-3 rounded-lg border-2 ${
                                  hasAccess
                                    ? 'bg-green-50 border-green-200'
                                    : 'bg-gray-50 border-gray-200'
                                }`}
                              >
                                {hasAccess ? (
                                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                                ) : (
                                  <XCircle className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                                )}
                                <div className="flex-1">
                                  <div className={`text-sm font-medium ${hasAccess ? 'text-gray-900' : 'text-gray-500'}`}>
                                    {perm.permission.split('.')[1] || perm.permission}
                                  </div>
                                  <div className="text-xs text-gray-600 mt-1">{perm.description}</div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            )}
          </div>
        </TabsContentWithValue>
      </Tabs>

      {/* Formulario de Rol */}
      {showRoleForm && (
        <Card>
          <CardHeader 
            title={editingRole ? `Editar Rol: ${editingRole.name}` : 'Nuevo Rol'}
            actions={
              <Button variant="ghost" size="sm" onClick={() => {
                setShowRoleForm(false)
                setEditingRole(null)
                setSelectedRole(null)
              }}>
                <X className="w-4 h-4" />
              </Button>
            }
          />
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nombre del Rol <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={roleForm.name}
                onChange={e => setRoleForm({ ...roleForm, name: e.target.value.toUpperCase() })}
                placeholder="Ej: GERENTE, SUPERVISOR"
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                disabled={editingRole?.is_system}
              />
              {editingRole?.is_system && (
                <p className="text-xs text-amber-600 mt-1">No se puede cambiar el nombre de un rol del sistema.</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Descripción
              </label>
              <textarea
                value={roleForm.description}
                onChange={e => setRoleForm({ ...roleForm, description: e.target.value })}
                placeholder="Describe el propósito y responsabilidades de este rol"
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
            </div>

            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={roleForm.active}
                  onChange={e => setRoleForm({ ...roleForm, active: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium text-gray-700">Rol Activo</span>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Permisos ({roleForm.permissions.length} seleccionados)
              </label>
              <div className="border border-gray-300 rounded-lg p-4 max-h-96 overflow-y-auto">
                <div className="space-y-6">
                  {Object.entries(organizePermissionsByModule(availablePermissions)).map(([module, perms]) => (
                    <div key={module}>
                      <h4 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                        {module}
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {perms.map(perm => {
                          const isSelected = roleForm.permissions.includes(perm.permission)
                          return (
                            <div
                              key={perm.permission}
                              onClick={() => {
                                if (isSelected) {
                                  setRoleForm({
                                    ...roleForm,
                                    permissions: roleForm.permissions.filter(p => p !== perm.permission)
                                  })
                                } else {
                                  setRoleForm({
                                    ...roleForm,
                                    permissions: [...roleForm.permissions, perm.permission]
                                  })
                                }
                              }}
                              className={`flex items-start gap-2 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                                isSelected
                                  ? 'bg-green-50 border-green-300'
                                  : 'bg-white border-gray-200 hover:border-gray-300'
                              }`}
                            >
                              {isSelected ? (
                                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                              ) : (
                                <XCircle className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                              )}
                              <div className="flex-1">
                                <div className={`text-sm font-medium ${isSelected ? 'text-gray-900' : 'text-gray-500'}`}>
                                  {perm.permission.split('.')[1] || perm.permission}
                                </div>
                                <div className="text-xs text-gray-600 mt-1">{perm.description}</div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => {
                setShowRoleForm(false)
                setEditingRole(null)
                setSelectedRole(null)
              }}>
                Cancelar
              </Button>
              <Button onClick={saveRole}>
                <Save className="w-4 h-4" />
                {editingRole ? 'Actualizar' : 'Crear'} Rol
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Modal de Confirmación de Eliminación */}
      {confirmDelete && (
        <MessageModal
          type="error"
          title="Confirmar Eliminación"
          message={`¿Estás seguro de que deseas eliminar el rol "${confirmDelete.name}"?\n\nEsta acción no se puede deshacer. Los usuarios con este rol deberán ser reasignados a otro rol primero.`}
          isOpen={!!confirmDelete}
          onClose={() => setConfirmDelete(null)}
          showCancel={true}
          onConfirm={doDelete}
        />
      )}

      {/* Modal de Mensajes */}
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
