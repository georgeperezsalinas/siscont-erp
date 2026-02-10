import { useState, useEffect, useRef } from 'react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { User, Building2, ShieldCheck, Mail, Calendar, Edit2, Save, X, Camera, Trash2, Upload } from 'lucide-react'
import { useAuth } from '@/stores/auth'
import { getMe, uploadUserPhoto, deleteUserPhoto, getUserPhotoUrl, updateUser, type CompanySimple } from '@/api'
import { formatDate, cn } from '@/lib/utils'
import { showToast } from '@/components/ui/Toast'

export default function MiPerfil() {
  const { user, setUser } = useAuth()
  const [loading, setLoading] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [editing, setEditing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [formData, setFormData] = useState({
    nombre: user?.nombre || '',
    apellido: user?.apellido || '',
    correo: user?.correo || '',
  })
  
  useEffect(() => {
    loadProfile()
  }, [])
  
  async function loadProfile() {
    try {
      setLoading(true)
      const data = await getMe()
      setUser(data)
      setFormData({
        nombre: data.nombre || '',
        apellido: data.apellido || '',
        correo: data.correo || '',
      })
    } catch (err: any) {
      console.error('Error cargando perfil:', err)
    } finally {
      setLoading(false)
    }
  }
  
  async function handlePhotoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file || !user?.id) return

    // Validar tipo de archivo
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      showToast('error', 'Tipo de archivo no permitido. Por favor, selecciona una imagen (JPEG, PNG, GIF o WebP)', 'Error de archivo')
      return
    }

    // Validar tamaño (5MB máximo)
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      showToast('error', 'El archivo es demasiado grande. El tamaño máximo es 5MB', 'Error de archivo')
      return
    }

    try {
      setUploadingPhoto(true)
      const updatedUser = await uploadUserPhoto(user.id, file)
      setUser(updatedUser)
      showToast('success', 'Foto actualizada correctamente', 'Éxito')
    } catch (err: any) {
      console.error('Error subiendo foto:', err)
      showToast('error', err.message || 'Error desconocido al subir la foto', 'Error')
    } finally {
      setUploadingPhoto(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  async function handleDeletePhoto() {
    if (!user?.id || !user.foto) return
    if (!confirm('¿Estás seguro de que deseas eliminar tu foto de perfil?')) return

    try {
      setUploadingPhoto(true)
      const updatedUser = await deleteUserPhoto(user.id)
      setUser(updatedUser)
      showToast('success', 'Foto eliminada correctamente', 'Éxito')
    } catch (err: any) {
      console.error('Error eliminando foto:', err)
      showToast('error', err.message || 'Error desconocido al eliminar la foto', 'Error')
    } finally {
      setUploadingPhoto(false)
    }
  }

  async function handleSave() {
    if (!user?.id) return

    try {
      setLoading(true)
      const updatedUser = await updateUser(user.id, {
        nombre: formData.nombre.trim() || null,
        apellido: formData.apellido.trim() || null,
        correo: formData.correo.trim() || null,
      })
      setUser(updatedUser)
      setEditing(false)
      showToast('success', 'Perfil actualizado correctamente', 'Éxito')
    } catch (err: any) {
      console.error('Error actualizando perfil:', err)
      showToast('error', err.message || 'Error desconocido al actualizar el perfil', 'Error')
    } finally {
      setLoading(false)
    }
  }
  
  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="text-center py-12 text-gray-500">Cargando perfil...</div>
      </div>
    )
  }
  
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Mi Perfil</h1>
          <p className="text-gray-600">Información personal y configuración de tu cuenta</p>
        </div>
        {!editing && (
          <Button
            onClick={() => setEditing(true)}
            variant="outline"
          >
            <Edit2 className="w-4 h-4" />
            Editar Perfil
          </Button>
        )}
      </div>
      
      {/* Información Personal */}
      <Card>
        <CardHeader 
          title="Información Personal"
          actions={
            editing ? (
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleSave}
                  size="sm"
                  className="bg-primary-600 hover:bg-primary-700"
                  disabled={loading}
                >
                  <Save className="w-4 h-4" />
                  Guardar
                </Button>
                <Button
                  onClick={() => {
                    setEditing(false)
                    setFormData({
                      nombre: user?.nombre || '',
                      apellido: user?.apellido || '',
                      correo: user?.correo || '',
                    })
                  }}
                  variant="outline"
                  size="sm"
                  disabled={loading}
                >
                  <X className="w-4 h-4" />
                  Cancelar
                </Button>
              </div>
            ) : undefined
          }
        />
        
        <div className="p-6 space-y-6">
          {/* Avatar y Nombre */}
          <div className="flex items-center gap-6">
            <div className="relative">
              {user?.foto ? (
                <img
                  src={getUserPhotoUrl(user.id)}
                  alt={`${user.nombre || user.username}`}
                  className="w-24 h-24 rounded-full object-cover shadow-lg border-2 border-primary-200"
                  onError={(e) => {
                    // Si falla la carga, mostrar el avatar por defecto
                    e.currentTarget.style.display = 'none'
                    const fallback = e.currentTarget.nextElementSibling as HTMLElement
                    if (fallback) fallback.style.display = 'grid'
                  }}
                />
              ) : null}
              <div
                className={`w-24 h-24 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 grid place-items-center text-white text-3xl font-bold shadow-lg ${user?.foto ? 'hidden' : ''}`}
              >
                {user?.nombre?.charAt(0).toUpperCase() || user?.username?.charAt(0).toUpperCase() || 'U'}
              </div>
              
              {/* Botones de acción para la foto */}
              <div className="absolute bottom-0 right-0 flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="w-8 h-8 rounded-full bg-primary-600 hover:bg-primary-700 text-white flex items-center justify-center shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Cambiar foto"
                >
                  {uploadingPhoto ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Camera className="w-4 h-4" />
                  )}
                </button>
                {user?.foto && (
                  <button
                    onClick={handleDeletePhoto}
                    disabled={uploadingPhoto}
                    className="w-8 h-8 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Eliminar foto"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1">
              {editing ? (
                <h2 className="text-2xl font-bold text-gray-900">
                  {formData.nombre && formData.apellido 
                    ? `${formData.nombre} ${formData.apellido}` 
                    : formData.nombre || formData.apellido || user?.username || 'Usuario'}
                </h2>
              ) : (
                <h2 className="text-2xl font-bold text-gray-900">
                  {user?.nombre && user?.apellido 
                    ? `${user.nombre} ${user.apellido}` 
                    : user?.username || 'Usuario'}
                </h2>
              )}
              {user?.nombre || user?.apellido ? (
                <p className="text-sm text-gray-500 mt-1">@{user?.username}</p>
              ) : null}
              <div className="flex items-center gap-2 mt-2">
                <ShieldCheck className="w-4 h-4 text-primary-600" />
                <span className="text-sm text-gray-600 font-medium">{user?.role || 'N/A'}</span>
              </div>
            </div>
          </div>
          
          {/* Información Detallada */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
                Nombre de Usuario
              </label>
              <div className="flex items-center gap-2 text-gray-900">
                <User className="w-4 h-4 text-gray-400" />
                <span>{user?.username || 'N/A'}</span>
              </div>
            </div>
            
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
                Rol
              </label>
              <div className="flex items-center gap-2 text-gray-900">
                <ShieldCheck className="w-4 h-4 text-gray-400" />
                <span className="bg-primary-50 text-primary-700 px-3 py-1 rounded-lg text-sm font-semibold">
                  {user?.role || 'N/A'}
                </span>
              </div>
            </div>
            
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
                Nombre
              </label>
              {editing ? (
                <input
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  placeholder="Nombre"
                />
              ) : (
                <div className="flex items-center gap-2 text-gray-900">
                  <User className="w-4 h-4 text-gray-400" />
                  <span>{user?.nombre || 'No especificado'}</span>
                </div>
              )}
            </div>
            
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
                Apellido
              </label>
              {editing ? (
                <input
                  type="text"
                  value={formData.apellido}
                  onChange={(e) => setFormData({ ...formData, apellido: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  placeholder="Apellido"
                />
              ) : (
                <div className="flex items-center gap-2 text-gray-900">
                  <User className="w-4 h-4 text-gray-400" />
                  <span>{user?.apellido || 'No especificado'}</span>
                </div>
              )}
            </div>
            
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
                Correo Electrónico
              </label>
              {editing ? (
                <input
                  type="email"
                  value={formData.correo}
                  onChange={(e) => setFormData({ ...formData, correo: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  placeholder="correo@ejemplo.com"
                />
              ) : (
                <div className="flex items-center gap-2 text-gray-900">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <span>{user?.correo || 'No especificado'}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>
      
      {/* Empresas Asignadas */}
      {user?.companies && user.companies.length > 0 && (
        <Card>
          <CardHeader title="Empresas Asignadas">
            <span className="text-sm text-gray-500 font-normal">
              {user.companies.length} {user.companies.length === 1 ? 'empresa' : 'empresas'}
            </span>
          </CardHeader>
          
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {user.companies.map((company: CompanySimple) => (
                <div
                  key={company.id}
                  className="p-4 rounded-xl border border-gray-200 hover:border-primary-300 hover:shadow-md transition-all bg-white"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-primary-100 text-primary-700 grid place-items-center">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 truncate">{company.name}</div>
                      {company.ruc && (
                        <div className="text-xs text-gray-500">RUC: {company.ruc}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      "text-xs font-semibold px-2 py-1 rounded",
                      company.active
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600"
                    )}>
                      {company.active ? "Activa" : "Inactiva"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
      
      {/* Información del Sistema */}
      <Card>
        <CardHeader title="Información del Sistema" />
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-sm text-gray-600">Versión del Sistema</span>
            <span className="text-sm font-medium text-gray-900">SISCONT v1.0</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-sm text-gray-600">Última Sesión</span>
            <span className="text-sm font-medium text-gray-900">{formatDate(new Date().toISOString())}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-gray-600">Estado de la Cuenta</span>
            <span className="text-sm font-semibold text-green-600 bg-green-50 px-3 py-1 rounded-lg">
              Activa
            </span>
          </div>
        </div>
      </Card>
    </div>
  )
}

