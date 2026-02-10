import { useState, useEffect } from 'react'
import { login, getSetupStatus, getMyPermissions, getMe } from '@/api'
import { useAuth } from '@/stores/auth'
import { useNavigate } from 'react-router-dom'
import { Lock, User, ArrowRight, ShieldCheck, Building2, Calculator } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import SetupWizard from './SetupWizard'

export default function LoginPage() {
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connectionError, setConnectionError] = useState(false)
  const { setToken, setUser } = useAuth()
  const nav = useNavigate()

  async function checkSetupStatus() {
    setConnectionError(false)
    setSetupRequired(null)
    try {
      const r = await getSetupStatus()
      setSetupRequired(r.setup_required)
    } catch {
      setConnectionError(true)
      setSetupRequired(false)
    }
  }

  useEffect(() => {
    checkSetupStatus()
  }, [])

  if (setupRequired === null) {
    return (
      <div className="min-h-screen grid place-items-center bg-gradient-to-br from-primary-50 via-white to-indigo-50">
        <div className="animate-pulse text-gray-500">Cargando...</div>
      </div>
    )
  }
  if (setupRequired) {
    return <SetupWizard />
  }

  const submit = async (e: any) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    
    console.log('[LoginPage] Intentando login...')
    
    try {
      const data = await login(username, password)
      console.log('[LoginPage] Login exitoso, guardando token...')
      setToken(data.access_token)
      // Obtener información del usuario para determinar redirección
      const userData = await getMe().catch(() => null)
      if (userData) setUser(userData)
      // Todos los usuarios van al Dashboard principal (usuarios empresa verán versión restringida)
      nav('/', { replace: true })
    } catch (err: any) {
      console.error('[LoginPage] Error en login:', err)
      setError(err.message || 'Error de autenticación')
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-slate-50">
      {/* Panel lateral institucional */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
        <div>
          <div className="flex items-center gap-3 mb-10">
            <div className="w-14 h-14 rounded-1xl bg-white/10 flex items-center justify-center">
               <img src="/logo.jpeg" alt="SISCONT" className="w-13 h-13 object-contain" />
            </div>
            <div>
              <div className="text-2xl font-bold tracking-tight">SISCONT ERP</div>
              <div className="text-xs text-slate-300">Sistema Contable Empresarial</div>
            </div>
          </div>

          <h2 className="text-3xl font-semibold leading-tight mb-6">
            Plataforma profesional para
            <span className="block">estudios y empresas contables</span>
          </h2>

          <ul className="space-y-4 text-slate-200">
            <li className="flex items-start gap-3">
              <Calculator className="w-5 h-5 mt-1" />
              <span>Gestión integral de compras, ventas y asientos contables</span>
            </li>
            <li className="flex items-start gap-3">
              <Building2 className="w-5 h-5 mt-1" />
              <span>Administración de múltiples empresas y clientes</span>
            </li>
            <li className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 mt-1" />
              <span>Seguridad, auditoría y trazabilidad financiera</span>
            </li>
          </ul>
        </div>

        <div className="text-xs text-slate-400">
          © 2026 SISCONT ERP · Versión 1.0.0 · Producción
        </div>
      </div>

      {/* Panel de login */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-xl">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-slate-900 text-white mb-3">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900">Acceso al Sistema</h1>
              <p className="text-sm text-slate-500">Ingrese sus credenciales corporativas</p>
            </div>

            {error && (
              <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Usuario</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    className="w-full pl-11 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none"
                    placeholder="usuario.contable"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="password"
                    className="w-full pl-11 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              <Button type="submit" disabled={loading} className="w-full h-12 text-base font-semibold">
                {loading ? 'Verificando acceso...' : 'Ingresar al ERP'}
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-slate-200 text-center">
              <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
                <ShieldCheck className="w-4 h-4" />
                <span>Acceso seguro para personal autorizado</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
