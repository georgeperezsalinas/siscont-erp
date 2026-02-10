import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, Clock, Command } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SearchResult {
  id: string
  label: string
  description?: string
  path: string
  category?: string
}

// Mapeo de rutas a resultados de búsqueda
const searchItems: SearchResult[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/', category: 'Principal' },
  { id: 'empresas', label: 'Empresas', path: '/empresas', category: 'Administración' },
  { id: 'usuarios', label: 'Usuarios', path: '/usuarios', category: 'Administración' },
  { id: 'permisos', label: 'Permisos', path: '/permisos', category: 'Administración' },
  { id: 'configuracion', label: 'Configuración', path: '/configuracion', category: 'Administración' },
  { id: 'motor-asientos', label: 'Motor de Asientos', path: '/motor-asientos', category: 'Administración' },
  { id: 'mantenimiento-datos', label: 'Mantenimiento de Datos', path: '/mantenimiento-datos', category: 'Administración' },
  { id: 'plan', label: 'Plan Contable', path: '/plan', category: 'Contabilidad' },
  { id: 'periodos', label: 'Periodos', path: '/periodos', category: 'Contabilidad' },
  { id: 'asientos', label: 'Asientos Contables', path: '/asientos', category: 'Contabilidad' },
  { id: 'diarios', label: 'Diarios', path: '/diarios', category: 'Contabilidad' },
  { id: 'conciliacion', label: 'Conciliación Bancaria', path: '/conciliacion-bancaria', category: 'Contabilidad' },
  { id: 'validacion', label: 'Validación de Datos', path: '/validacion-datos', category: 'Contabilidad' },
  { id: 'terceros', label: 'Proveedores y Clientes', path: '/terceros', category: 'Operaciones' },
  { id: 'compras', label: 'Compras', path: '/compras', category: 'Operaciones' },
  { id: 'ventas', label: 'Ventas', path: '/ventas', category: 'Operaciones' },
  { id: 'inventarios', label: 'Inventarios', path: '/inventarios', category: 'Operaciones' },
  { id: 'reportes', label: 'Reportes', path: '/reportes', category: 'Reportes' },
  { id: 'ple', label: 'PLE', path: '/ple', category: 'Reportes' },
  { id: 'perfil', label: 'Mi Perfil', path: '/mi-perfil', category: 'Usuario' },
]

export function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [results, setResults] = useState<SearchResult[]>([])
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Cargar búsquedas recientes del localStorage
  useEffect(() => {
    const stored = localStorage.getItem('siscont-recent-searches')
    if (stored) {
      try {
        setRecentSearches(JSON.parse(stored))
      } catch (e) {
        console.error('Error loading recent searches:', e)
      }
    }
  }, [])

  // Filtrar resultados según la búsqueda
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }

    const lowerQuery = query.toLowerCase()
    const filtered = searchItems.filter(item =>
      item.label.toLowerCase().includes(lowerQuery) ||
      item.category?.toLowerCase().includes(lowerQuery) ||
      item.path.toLowerCase().includes(lowerQuery)
    ).slice(0, 8)

    setResults(filtered)
  }, [query])

  // Manejar atajo de teclado (Ctrl+K o Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen(true)
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
        setQuery('')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  // Focus en el input cuando se abre
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Cerrar al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setQuery('')
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleSelect = (result: SearchResult) => {
    // Guardar en búsquedas recientes
    const updated = [result.label, ...recentSearches.filter(s => s !== result.label)].slice(0, 5)
    setRecentSearches(updated)
    localStorage.setItem('siscont-recent-searches', JSON.stringify(updated))

    // Navegar
    navigate(result.path)
    setIsOpen(false)
    setQuery('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && results.length > 0) {
      handleSelect(results[0])
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      // TODO: Implementar navegación con flechas
    }
  }

  return (
    <>
      {/* Botón trigger */}
      <button
        onClick={() => setIsOpen(true)}
        className="hidden md:flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:border-primary-400 dark:hover:border-primary-500 transition-colors text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
      >
        <Search className="w-4 h-4" />
        <span className="hidden lg:inline">Buscar...</span>
        <kbd className="hidden lg:inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono">
          <Command className="w-3 h-3" />K
        </kbd>
      </button>

      {/* Modal de búsqueda */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
          <div
            ref={containerRef}
            className="relative w-full max-w-2xl bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 animate-fade-in"
          >
            {/* Input */}
            <div className="relative p-4 border-b border-gray-200 dark:border-gray-700">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Buscar en el sistema..."
                className="w-full pl-12 pr-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Resultados */}
            <div className="max-h-96 overflow-y-auto">
              {query.trim() ? (
                results.length > 0 ? (
                  <div className="p-2">
                    {results.map((result) => (
                      <button
                        key={result.id}
                        onClick={() => handleSelect(result)}
                        className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left group"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-primary-600 dark:group-hover:text-primary-400">
                            {result.label}
                          </div>
                          {result.category && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              {result.category}
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                    <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No se encontraron resultados para "{query}"</p>
                  </div>
                )
              ) : (
                recentSearches.length > 0 && (
                  <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
                      <Clock className="w-4 h-4" />
                      Búsquedas recientes
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {recentSearches.map((search) => (
                        <button
                          key={search}
                          onClick={() => {
                            setQuery(search)
                            inputRef.current?.focus()
                          }}
                          className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                        >
                          {search}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">↑↓</kbd>
                  Navegar
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">Enter</kbd>
                  Seleccionar
                </span>
              </div>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">Esc</kbd>
                Cerrar
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

