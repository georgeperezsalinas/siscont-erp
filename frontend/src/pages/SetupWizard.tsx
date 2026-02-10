import { useState, useEffect } from 'react'
import { firstTimeSetup, getSuggestedConfig } from '@/api'
import { Database, User, Server, Loader2, CheckCircle, AlertCircle, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/Button'

const defaultForm = {
  db_host: 'localhost',
  db_port: 5432,
  db_user: '',
  db_password: '',
  db_name: 'siscont2',
  admin_user: 'admin',
  admin_pass: '',
}

export default function SetupWizard() {
  const [step, setStep] = useState<'form' | 'success' | 'error'>('form')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(defaultForm)

  useEffect(() => {
    getSuggestedConfig()
      .then(cfg => setForm(f => ({
        ...f,
        db_host: cfg.db_host || f.db_host,
        db_port: cfg.db_port ?? f.db_port,
        db_user: cfg.db_user || f.db_user,
        db_name: cfg.db_name || f.db_name,
        admin_user: cfg.admin_user || f.admin_user,
      })))
      .catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await firstTimeSetup(form)
      setStep('success')
    } catch (err: any) {
      setError(err.message || 'Error al configurar')
      setStep('error')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen grid place-items-center bg-gradient-to-br from-primary-50 via-white to-indigo-50 p-4">
        <div className="w-full max-w-md text-center animate-fade-in">
          <div className="bg-white rounded-3xl p-8 shadow-xl border border-gray-200">
            <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Configuración completada</h1>
            <p className="text-gray-600 mb-4">
              Para que los cambios surtan efecto, debes reiniciar el backend:
            </p>
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-left text-sm mb-6">
              <p className="font-medium text-amber-900 dark:text-amber-100 mb-1">1. En la terminal donde corre el backend:</p>
              <p className="text-amber-800 dark:text-amber-200">Ctrl+C para detenerlo, luego ejecuta de nuevo:</p>
              <p className="font-mono text-xs mt-1 text-amber-900 dark:text-amber-100">cd backend && uvicorn app.main:app --reload</p>
              <p className="font-medium text-amber-900 dark:text-amber-100 mt-3 mb-1">2. Haz clic en el botón de abajo para ir al login</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 text-left text-sm mb-6">
              <p className="font-medium text-gray-700 dark:text-gray-300">Credenciales de acceso:</p>
              <p className="mt-1 text-gray-600 dark:text-gray-400">Usuario: <strong>{form.admin_user}</strong></p>
              <p className="text-gray-600 dark:text-gray-400">Contraseña: (la que configuraste en el wizard)</p>
            </div>
            <Button
              onClick={() => window.location.href = '/login'}
              className="w-full"
              size="lg"
            >
              <LogIn className="w-4 h-4" />
              Ir a login
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-primary-50 via-white to-indigo-50 p-4">
      <div className="w-full max-w-lg animate-slide-up">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-600 to-primary-700 text-white shadow-lg mb-4">
            <Database className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Configuración inicial</h1>
          <p className="text-gray-600">Ingresa los parámetros de conexión y el usuario administrador</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-xl">
          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="border-b border-gray-200 pb-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Server className="w-4 h-4" />
                Base de datos PostgreSQL
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Host</label>
                  <input
                    type="text"
                    value={form.db_host}
                    onChange={e => setForm(f => ({ ...f, db_host: e.target.value }))}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Puerto</label>
                  <input
                    type="number"
                    value={form.db_port}
                    onChange={e => setForm(f => ({ ...f, db_port: Number(e.target.value) }))}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
                  <input
                    type="text"
                    value={form.db_user}
                    onChange={e => setForm(f => ({ ...f, db_user: e.target.value }))}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                  <input
                    type="password"
                    value={form.db_password}
                    onChange={e => setForm(f => ({ ...f, db_password: e.target.value }))}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2"
                    required
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la base de datos</label>
                  <input
                    type="text"
                    value={form.db_name}
                    onChange={e => setForm(f => ({ ...f, db_name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2"
                    required
                  />
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <User className="w-4 h-4" />
                Usuario administrador del sistema
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
                  <input
                    type="text"
                    value={form.admin_user}
                    onChange={e => setForm(f => ({ ...f, admin_user: e.target.value }))}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                  <input
                    type="password"
                    value={form.admin_pass}
                    onChange={e => setForm(f => ({ ...f, admin_pass: e.target.value }))}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2"
                    required
                    minLength={4}
                  />
                </div>
              </div>
            </div>

            <Button type="submit" disabled={loading} className="w-full mt-6" size="lg">
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Configurando...
                </>
              ) : (
                'Configurar e iniciar'
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
