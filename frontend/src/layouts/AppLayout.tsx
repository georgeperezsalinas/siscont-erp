import { ReactNode, useEffect, useState, useRef } from 'react'
import { useAuth } from '@/stores/auth'
import { useOrg } from '@/stores/org'
import { Link, useLocation, Navigate } from 'react-router-dom'
import { 
  LayoutDashboard, Building2, BookOpen, FileText, 
  ShoppingCart, TrendingUp, Package, BarChart3, FileSpreadsheet,
  Calendar, Users, LogOut, Menu, X, ChevronRight, ScrollText, Settings,
  ChevronLeft, User, Wallet, Moon, Sun, ChevronDown, Database, FileCheck, Menu as MenuIcon, Settings2, Search, Brain, CreditCard, AlertCircle, Activity, Eye, Inbox
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getMe, listCompanies, listPeriods, getMyPermissions, getUserPhotoUrl, getMailboxStats, adminIncomingStats, type Company, type Period } from '@/api'
import { showToast } from '@/components/ui/Toast'
import { useTheme } from '@/stores/theme'
import { ToastContainer } from '@/components/ui/Toast'
import { Tooltip } from '@/components/ui/Tooltip'

// Configuración del menú con categorías - Casilla primero (estilo correo/casilla electrónica)
const menuItems = [
  // Sección: Comunicación - Casilla (prioridad para usuarios empresa)
  { 
    section: 'Comunicación', 
    items: [
      { 
        to: '/casilla-electronica', 
        label: 'Casilla Electrónica', 
        icon: Inbox, 
        permission: 'casilla.view',
        badge: (stats: { unread_count: number; pending_response_count: number }) => 
          stats.unread_count > 0 ? stats.unread_count : undefined
      },
    ]
  },
  // Sección: Administración (solo Admin) - Organización: Organización → Configuración → Motor → Mantenimiento
  { 
    section: 'Administración', 
    items: [
      // --- Organización ---
      { to: '/empresas', label: 'Empresas', icon: Building2, permission: 'empresas.view', adminOnly: true },
      { to: '/usuarios', label: 'Usuarios', icon: Users, permission: 'usuarios.view', adminOnly: true },
      { to: '/permisos', label: 'Permisos', icon: Settings, permission: 'usuarios.view', adminOnly: true },
      // --- Configuración (por empresa) ---
      { to: '/configuracion', label: 'Configuración', icon: Settings2, permission: 'empresas.view', adminOnly: true },
      // --- Motor contable ---
      { to: '/motor-asientos', label: 'Motor de Asientos', icon: Brain, permission: 'asientos.view', adminOnly: true },
      // --- Mantenimiento de datos ---
      { to: '/mantenimiento-datos', label: 'Mantenimiento de Datos', icon: Database, permission: 'empresas.view', adminOnly: true },
    ]
  },
  // Sección: Contabilidad - SAP-style: Visión general → Plan → Operaciones → Control
  { 
    section: 'Contabilidad', 
    items: [
      // --- Visión general ---
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard.view' },
      // --- Plan maestro ---
      { to: '/plan', label: 'Plan Contable', icon: BookOpen, permission: 'plan.view' },
      { to: '/periodos', label: 'Periodos', icon: Calendar, permission: 'periodos.view' },
      // --- Operaciones contables ---
      { to: '/asientos', label: 'Asientos', icon: ScrollText, permission: 'asientos.view' },
      { to: '/diarios', label: 'Diarios', icon: FileText, permission: 'diarios.view' },
      // --- Control ---
      { to: '/conciliacion-bancaria', label: 'Conciliación Bancaria', icon: Wallet, permission: 'asientos.view' },
      { to: '/validacion-datos', label: 'Validación de Datos', icon: FileCheck, permission: 'asientos.view' },
    ]
  },
  // Sección: Operaciones - SAP-style: Maestros → Compras/Ventas → Tesorería → Inventarios
  { 
    section: 'Operaciones', 
    items: [
      // --- Maestros ---
      { to: '/terceros', label: 'Proveedores y Clientes', icon: Users, permission: 'compras.view' },
      // --- Compras y Ventas ---
      { to: '/compras', label: 'Compras', icon: ShoppingCart, permission: 'compras.view' },
      { to: '/ventas', label: 'Ventas', icon: TrendingUp, permission: 'ventas.view' },
      // --- Tesorería ---
      { to: '/tesoreria', label: 'Tesorería', icon: CreditCard, permission: 'asientos.view' },
      // --- Inventarios ---
      { to: '/inventarios', label: 'Inventarios', icon: Package, permission: 'inventarios.view' },
    ]
  },
  // Sección: Reportes - SAP-style: Contables → Operativos → Control → Tributarios
  { 
    section: 'Reportes', 
    items: [
      // --- Visión general ---
      { to: '/reportes', label: 'Todos los Reportes', icon: BarChart3, permission: 'reportes.view' },
      // --- Contables ---
      { to: '/reportes?tipo=libro-diario', label: 'Libro Diario', icon: FileText, permission: 'reportes.view' },
      { to: '/reportes?tipo=libro-mayor', label: 'Libro Mayor', icon: BookOpen, permission: 'reportes.view' },
      { to: '/reportes?tipo=balance-comprobacion', label: 'Balance de Comprobación', icon: BarChart3, permission: 'reportes.view' },
      { to: '/reportes?tipo=estado-resultados', label: 'Estado de Resultados', icon: TrendingUp, permission: 'reportes.view' },
      { to: '/reportes?tipo=balance-general', label: 'Balance General', icon: BarChart3, permission: 'reportes.view' },
      // --- Operativos ---
      { to: '/reportes?tipo=kardex-valorizado', label: 'Kardex Valorizado', icon: Package, permission: 'reportes.view' },
      { to: '/reportes?tipo=saldos-por-cliente', label: 'Cuentas por Cobrar (CxC)', icon: Users, permission: 'reportes.view' },
      { to: '/reportes?tipo=saldos-por-proveedor', label: 'Cuentas por Pagar (CxP)', icon: Users, permission: 'reportes.view' },
      // --- Control ---
      { to: '/reportes?tipo=asientos-descuadrados', label: 'Asientos Descuadrados', icon: AlertCircle, permission: 'reportes.view' },
      { to: '/reportes?tipo=movimientos-sin-asiento', label: 'Movimientos sin Asiento', icon: FileCheck, permission: 'reportes.view' },
      { to: '/reportes?tipo=trazabilidad-total', label: 'Trazabilidad', icon: Eye, permission: 'reportes.view' },
      { to: '/reportes?tipo=cambios-reversiones', label: 'Cambios y Reversiones', icon: Activity, permission: 'reportes.view' },
      // --- Tributarios ---
      { to: '/ple', label: 'PLE', icon: FileSpreadsheet, permission: 'ple.view' },
      { to: '/sire', label: 'SIRE', icon: FileCheck, permission: 'ple.view' },
    ]
  },
]

// Función para filtrar el menú según los permisos del usuario
function getFilteredMenu(userPermissions: string[], userRole: string | undefined, isAdmin: boolean) {
  if (!userPermissions || userPermissions.length === 0) return []
  
  return menuItems.map(section => ({
    ...section,
    items: section.items.filter(item => {
      // Si es adminOnly, solo admin puede verlo
        const itemWithAdmin = item as typeof item & { adminOnly?: boolean }
        if (itemWithAdmin.adminOnly) {
        return isAdmin || userRole === 'ADMINISTRADOR'
      }
      // Para otros items, verificar si tiene el permiso requerido
      if (item.permission) {
        return userPermissions.includes(item.permission)
      }
      return false
    })
  })).filter(section => section.items.length > 0) // Eliminar secciones vacías
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { empresaId, periodo, setEmpresa, setPeriodo } = useOrg()
  const { token, user, setUser, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const loc = useLocation()
  
  // Determinar si es usuario empresa para aplicar restricciones
  const isEmpresaUser = user?.user_type === 'COMPANY_USER' || user?.role === 'USUARIO_EMPRESA'
  
  const [open, setOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [availableCompanies, setAvailableCompanies] = useState<Company[]>([])
  const [availablePeriods, setAvailablePeriods] = useState<Period[]>([])
  const [showCompanyModal, setShowCompanyModal] = useState(false)
  const [showPeriodModal, setShowPeriodModal] = useState(false)
  const [userPermissions, setUserPermissions] = useState<string[]>([])
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set())
  const [yearFilter, setYearFilter] = useState<string>('')
  const [showAllYears, setShowAllYears] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['Contabilidad'])) // Sección expandida por defecto
  const [menuSearchQuery, setMenuSearchQuery] = useState<string>('')
  const [menuSearchOpen, setMenuSearchOpen] = useState(false)
  const [mailboxStats, setMailboxStats] = useState({ unread_count: 0, pending_response_count: 0, critical_count: 0, overdue_count: 0 })
  const previousUnreadCountRef = useRef(0)
  const isFirstLoadRef = useRef(true)
  
  useEffect(() => { setOpen(false) }, [loc.pathname])
  
  // Atajo de teclado para abrir buscador del menú (Ctrl+K / Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k' && !sidebarCollapsed) {
        e.preventDefault()
        setMenuSearchOpen(true)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [sidebarCollapsed])
  
  // Expandir automáticamente secciones con items activos
  useEffect(() => {
    if (user && userPermissions.length > 0) {
      const filteredMenu = getFilteredMenu(userPermissions, user.role, user.is_admin || false)
      filteredMenu.forEach(section => {
        const hasActiveItem = section.items.some(item => loc.pathname === item.to)
        if (hasActiveItem) {
          setExpandedSections(prev => {
            if (!prev.has(section.section)) {
              return new Set([...prev, section.section])
            }
            return prev
          })
        }
      })
    }
  }, [loc.pathname, user, userPermissions])
  
  // Sincronizar tema al cargar
  useEffect(() => {
    const saved = localStorage.getItem('siscont-theme') || 'light'
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(saved)
  }, [theme])
  
  // Cerrar menú de usuario al hacer click fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement
      if (!target.closest('.user-menu-container')) {
        setUserMenuOpen(false)
      }
    }
    if (userMenuOpen) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [userMenuOpen])
  

  // Estado para manejar errores de carga
  const [loadingError, setLoadingError] = useState<string | null>(null)
  const [loadingTimeout, setLoadingTimeout] = useState(false)

  // Cargar info del usuario y permisos
  useEffect(() => {
    let active = true
    let timeoutId: NodeJS.Timeout | null = null
    
    async function loadMe(){
      try {
        setLoadingError(null)
        setLoadingTimeout(false)
        
        if (!token) { 
          setUser(null)
          setUserPermissions([])
          return 
        }
        
        // Timeout de 10 segundos para evitar carga infinita
        timeoutId = setTimeout(() => {
          if (active) {
            setLoadingTimeout(true)
            console.error('[AppLayout] Timeout cargando usuario después de 10 segundos')
          }
        }, 10000)
        
        const [data, permissions] = await Promise.all([
          getMe(),
          getMyPermissions().catch(() => []) // Si falla, usar array vacío
        ])
        
        if (timeoutId) clearTimeout(timeoutId)
        
        if (active) {
          setUser(data)
          setUserPermissions(permissions)
          setLoadingError(null)
          setLoadingTimeout(false)
          
          // Si es ADMINISTRADOR, cargar todas las empresas, sino usar solo las asignadas
          if (data.role === 'ADMINISTRADOR') {
            const allCompanies = await listCompanies({ page: 1, page_size: 100 }).catch(() => ({ items: [] as Company[], total: 0 }))
            const activeCompanies = allCompanies.items.filter(c => c.active)
            setAvailableCompanies(activeCompanies)
            // Si no hay empresa seleccionada, usar la primera disponible
            if (activeCompanies.length > 0 && !activeCompanies.some(c => c.id === empresaId)) {
              setEmpresa(activeCompanies[0].id)
            }
          } else {
            const assignedCompanies = data.companies.filter(c => c.active)
            setAvailableCompanies(assignedCompanies)
            // Si no hay empresa seleccionada o no está en las asignadas, usar la primera disponible
            if (assignedCompanies.length > 0) {
              if (!assignedCompanies.some(c => c.id === empresaId)) {
                setEmpresa(assignedCompanies[0].id)
              }
            }
          }
        }
      } catch (err: any) {
        if (timeoutId) clearTimeout(timeoutId)
        console.error('[AppLayout] Error cargando datos del usuario:', err)
        
        // Si es error de autenticación (401/403) o sesión expirada
        if (err.message?.includes('Sesión expirada') || 
            err.message?.includes('Sesión inválida') || 
            err.message?.includes('401') || 
            err.message?.includes('403') ||
            err.message?.includes('Error de conexión')) {
          // Limpiar estado y redirigir al login
          if (active) {
            setUser(null)
            setUserPermissions([])
            logout()
          }
          return
        }
        
        // Para otros errores, mostrar mensaje pero permitir continuar
        if (active) {
          setUser(null)
          setUserPermissions([])
          setLoadingError(err.message || 'Error al cargar datos del usuario')
          // Si hay error y todavía hay token después de 5 segundos más, redirigir al login
          setTimeout(() => {
            if (active && token) {
              console.error('[AppLayout] Redirigiendo al login por error persistente')
              logout()
            }
          }, 5000)
        }
      }
    }
    loadMe()
    return () => { 
      active = false
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [token, setUser, empresaId, setEmpresa, logout])

  // Recargar empresas cuando se crea o actualiza una
  useEffect(() => {
    async function loadCompanies() {
      if (!user) return
      if (user.role === 'ADMINISTRADOR') {
        const allCompanies = await listCompanies({ page: 1, page_size: 100 }).catch(() => ({ items: [] as Company[], total: 0 }))
        const activeCompanies = allCompanies.items.filter(c => c.active)
        setAvailableCompanies(activeCompanies)
        if (activeCompanies.length > 0 && !activeCompanies.some(c => c.id === empresaId)) {
          setEmpresa(activeCompanies[0].id)
        }
      } else {
        const data = await getMe()
        const assignedCompanies = data.companies.filter(c => c.active)
        setAvailableCompanies(assignedCompanies)
      }
    }
    const handleCompanyCreated = () => { loadCompanies() }
    window.addEventListener('companyCreated', handleCompanyCreated as EventListener)
    loadCompanies()
    return () => window.removeEventListener('companyCreated', handleCompanyCreated as EventListener)
  }, [user, empresaId, setEmpresa])

  // Cargar estadísticas de casilla electrónica
  useEffect(() => {
    async function loadMailboxStats() {
      if (!userPermissions.includes('casilla.view')) {
        setMailboxStats({ unread_count: 0, pending_response_count: 0 })
        previousUnreadCountRef.current = 0
        isFirstLoadRef.current = true
        return
      }
      const isAdmin = user?.is_admin || user?.role === 'ADMINISTRADOR'
      try {
        let newStats = { unread_count: 0, pending_response_count: 0 }
        if (isAdmin) {
          const stats = await adminIncomingStats()
          newStats = {
            unread_count: stats.unread_count,
            pending_response_count: stats.pending_response_count ?? 0,
            critical_count: stats.critical_count ?? 0,
            overdue_count: stats.overdue_count ?? 0,
          }
        } else if (empresaId) {
          newStats = await getMailboxStats(empresaId)
        }
        
        // Detectar nuevos mensajes y mostrar notificación (solo después de la primera carga)
        if (!isFirstLoadRef.current && newStats.unread_count > previousUnreadCountRef.current && previousUnreadCountRef.current >= 0) {
          const newMessagesCount = newStats.unread_count - previousUnreadCountRef.current
          if (newMessagesCount > 0) {
            const notificationTitle = isAdmin ? 'Nuevo mensaje recibido' : 'Nuevo mensaje de SISCONT'
            const notificationMessage = isAdmin 
              ? `Tienes ${newMessagesCount} mensaje${newMessagesCount !== 1 ? 's' : ''} nuevo${newMessagesCount !== 1 ? 's' : ''} en tu bandeja de entrada`
              : `SISCONT te ha enviado ${newMessagesCount} mensaje${newMessagesCount !== 1 ? 's' : ''} nuevo${newMessagesCount !== 1 ? 's' : ''}`
            
            // Mostrar toast notification
            showToast('info', notificationMessage, notificationTitle)
            
            // Mostrar notificación del navegador si está permitido
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification(notificationTitle, {
                body: notificationMessage,
                icon: '/favicon.ico',
                badge: '/favicon.ico',
                tag: 'mailbox-notification',
                requireInteraction: false,
              })
            } else if ('Notification' in window && Notification.permission === 'default') {
              // Solicitar permiso la primera vez
              Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                  new Notification(notificationTitle, {
                    body: notificationMessage,
                    icon: '/favicon.ico',
                    badge: '/favicon.ico',
                    tag: 'mailbox-notification',
                    requireInteraction: false,
                  })
                }
              })
            }
          }
        }
        
        setMailboxStats(newStats)
        previousUnreadCountRef.current = newStats.unread_count
        isFirstLoadRef.current = false
      } catch (err) {
        console.error('Error cargando estadísticas de casilla:', err)
        setMailboxStats({ unread_count: 0, pending_response_count: 0 })
        previousUnreadCountRef.current = 0
      }
    }
    loadMailboxStats()
    // Recargar cada 30 segundos para mantener las estadísticas actualizadas
    const interval = setInterval(loadMailboxStats, 30000)
    
    // Solicitar permiso para notificaciones del navegador al cargar
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {
        // Silenciar error si el usuario rechaza
      })
    }
    
    return () => clearInterval(interval)
  }, [empresaId, userPermissions, user, loc.pathname])

  // Cargar periodos al cambiar de empresa o cuando se crea uno nuevo
  useEffect(() => {
    let active = true
    async function loadPeriods(){
      try {
        if (!token || !empresaId) { setAvailablePeriods([]); return }
        const periods = await listPeriods(empresaId)
        if (active) {
          setAvailablePeriods(periods)
          // Expandir automáticamente el año del período actual
          if (periodo) {
            const currentYear = parseInt(periodo.split('-')[0])
            setExpandedYears(new Set([currentYear]))
          } else if (periods.length > 0) {
            // Si no hay período seleccionado, expandir el año más reciente
            const years = [...new Set(periods.map(p => p.year))].sort((a, b) => b - a)
            if (years.length > 0) {
              setExpandedYears(new Set([years[0]]))
            }
          }
        }
      } catch (err: any) {
        console.error('[AppLayout] Error cargando períodos:', err)
        if (active) {
          setAvailablePeriods([])
        }
      }
    }
    loadPeriods()
    
    const handlePeriodCreated = (event: CustomEvent) => {
      if (event.detail?.empresaId === empresaId) {
        loadPeriods()
      }
    }
    window.addEventListener('periodCreated', handlePeriodCreated as EventListener)
    
    return () => { 
      active = false
      window.removeEventListener('periodCreated', handlePeriodCreated as EventListener)
    }
  }, [token, empresaId, periodo])

  // Mostrar loading mientras se carga el usuario (evita flash del Dashboard incorrecto)
  if (token && !user && !loadingError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {loadingTimeout ? 'Tardando más de lo esperado...' : 'Cargando...'}
          </p>
          {loadingTimeout && (
            <button
              onClick={() => logout()}
              className="mt-4 px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700"
            >
              Ir al Login
            </button>
          )}
        </div>
      </div>
    )
  }
  
  // Si hay error de carga y no hay usuario, redirigir al login
  if (loadingError && !user && token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Error al cargar sesión</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">{loadingError}</p>
          <button
            onClick={() => logout()}
            className="mt-4 px-6 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700"
          >
            Ir al Login
          </button>
        </div>
      </div>
    )
  }

  
  return (
    <div className="min-h-screen text-gray-900 dark:text-gray-50 flex relative">
      {/* Overlay para móvil cuando el sidebar está abierto */}
      {open && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      
      {/* Sidebar - Diseño Moderno y Mejorado */}
      <aside className={cn(
        'fixed md:static z-30 top-0 left-0 h-screen bg-white/95 backdrop-blur-xl dark:bg-gray-900/95 dark:backdrop-blur-xl border-r border-gray-200/50 dark:border-gray-800/50 transition-all duration-300 ease-in-out flex flex-col shadow-xl dark:shadow-gray-950/80',
        open ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        sidebarCollapsed ? 'w-20 md:w-20' : 'w-72 md:w-72'
      )}>
        {/* Header con logo mejorado */}
        <div className={cn(
          "h-16 border-b border-gray-200/50 dark:border-gray-800/50 flex items-center gap-3 bg-gradient-to-r from-primary-600 via-primary-600 to-primary-700 dark:from-primary-700 dark:via-primary-800 dark:to-primary-900 flex-shrink-0 transition-all duration-300 relative overflow-hidden",
          "sticky top-0 z-10"
        )}>
          {/* Efecto de brillo animado */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-[shimmer_3s_infinite]" />
          <div className={cn(
            "relative flex items-center gap-3 transition-all duration-300",
            sidebarCollapsed ? 'px-3 justify-center w-full' : 'px-6 w-full'
          )}>
            <div className="w-11 h-11 bg-white/95 dark:bg-white/90 text-primary-600 dark:text-primary-700 grid place-items-center font-bold shadow-lg flex-shrink-0 ring-2 ring-white/50 dark:ring-white/20 transition-transform hover:scale-110">
                <img src="/logo.jpeg" alt="SISCONT" className="w-11 h-11 object-contain" />
            </div>
          <div className={cn(
              "text-white font-bold text-lg transition-all duration-300 whitespace-nowrap",
            sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
          )}>
            Siscont ERP
            </div>
          </div>
        </div>
        
        {/* Menú mejorado con mejor organización */}
        <nav className={cn(
          "flex-1 flex flex-col min-h-0 transition-all duration-300 overflow-hidden",
          sidebarCollapsed && "px-2"
        )}>
          {user ? (
            <>
              {/* Buscador de menú - Más prominente para usuarios empresa (no tienen GlobalSearch) */}
                  {!sidebarCollapsed && (
                <div className={cn(
                  "px-3 py-2 sticky top-0 z-10 backdrop-blur-sm border-b",
                  isEmpresaUser 
                    ? "bg-gradient-to-r from-primary-50/90 to-primary-100/70 dark:from-primary-900/30 dark:to-primary-800/20 border-primary-300/60 dark:border-primary-700/60 shadow-sm" 
                    : "bg-white/95 dark:bg-gray-900/95 border-gray-200/50 dark:border-gray-800/50"
                )}>
                  {menuSearchOpen ? (
                    // Input expandido
                    <div className="relative">
                      <Search className={cn(
                        "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4",
                        isEmpresaUser ? "text-primary-600 dark:text-primary-400" : "text-gray-400 dark:text-gray-500"
                      )} />
                      <input
                        type="text"
                        value={menuSearchQuery}
                        onChange={(e) => setMenuSearchQuery(e.target.value)}
                        placeholder={isEmpresaUser ? "Buscar en el menú..." : "Buscar..."}
                        autoFocus
                        className={cn(
                          "w-full pl-10 pr-8 py-2 text-sm rounded-lg outline-none transition-all",
                          isEmpresaUser
                            ? "border-2 border-primary-300/60 dark:border-primary-700/60 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-primary-500/60 dark:placeholder-primary-400/60 focus:ring-2 focus:ring-primary-500/50 dark:focus:ring-primary-400/50 focus:border-primary-500 dark:focus:border-primary-400 shadow-sm"
                            : "border border-gray-200/80 dark:border-gray-700/80 bg-white/80 dark:bg-gray-800/80 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-1 focus:ring-primary-500/30 dark:focus:ring-primary-500/50 focus:border-primary-400 dark:focus:border-primary-500"
                        )}
                        onBlur={() => {
                          if (!menuSearchQuery) {
                            setMenuSearchOpen(false)
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            setMenuSearchQuery('')
                            setMenuSearchOpen(false)
                          }
                        }}
                      />
                      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {menuSearchQuery && (
                          <button
                            onClick={() => setMenuSearchQuery('')}
                            className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setMenuSearchQuery('')
                            setMenuSearchOpen(false)
                          }}
                          className="px-1.5 py-0.5 text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded transition-colors"
                        >
                          Esc
                        </button>
                      </div>
                    </div>
                  ) : (
                    // Botón para abrir buscador - Más prominente para usuarios empresa
                    <button
                      onClick={() => setMenuSearchOpen(true)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 shadow-sm",
                        isEmpresaUser
                          ? "bg-gradient-to-r from-primary-100 to-primary-50 dark:from-primary-900/40 dark:to-primary-800/30 text-primary-900 dark:text-primary-100 border-2 border-primary-300/60 dark:border-primary-700/60 hover:from-primary-200 hover:to-primary-100 dark:hover:from-primary-800/50 dark:hover:to-primary-700/40 font-semibold shadow-primary-200/50 dark:shadow-primary-900/30"
                          : "text-gray-500 dark:text-gray-400 hover:bg-gray-100/50 dark:hover:bg-gray-800/50 border border-transparent hover:border-gray-200/60 dark:hover:border-gray-700/60",
                        menuSearchQuery && "bg-primary-50/50 dark:bg-primary-900/20 border-primary-200/60 dark:border-primary-800/60"
                      )}
                    >
                      <Search className={cn(
                        "w-4 h-4 flex-shrink-0",
                        isEmpresaUser && "text-primary-600 dark:text-primary-400"
                      )} />
                      <span className={cn(
                        "flex-1 text-left truncate",
                        isEmpresaUser && "text-primary-900 dark:text-primary-100"
                      )}>
                        {menuSearchQuery ? `"${menuSearchQuery}"` : isEmpresaUser ? 'Buscar en el menú...' : 'Buscar menú...'}
                      </span>
                      {menuSearchQuery ? (
                        <span className="px-1.5 py-0.5 bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 rounded text-[10px] font-medium">
                          {(() => {
                            const filteredMenu = getFilteredMenu(userPermissions, user.role, user.is_admin || false)
                            return filteredMenu.reduce((acc, section) => 
                              acc + section.items.filter(item =>
                                item.label.toLowerCase().includes(menuSearchQuery.toLowerCase()) ||
                                section.section.toLowerCase().includes(menuSearchQuery.toLowerCase())
                              ).length, 0)
                          })()}
                        </span>
                      ) : (
                        <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-[10px] font-mono text-gray-500 dark:text-gray-400">
                          {typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? '⌘K' : 'Ctrl+K'}
                        </kbd>
                      )}
                    </button>
                  )}
                </div>
              )}
              
              {/* Contenedor scrollable del menú */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin relative">
                {/* Gradiente superior para indicar scroll */}
                <div className="sticky top-0 h-4 bg-gradient-to-b from-white/95 dark:from-gray-900/95 to-transparent pointer-events-none z-10"></div>
                
                <div className="px-2 py-2 space-y-1">
                  {(() => {
                    const filteredMenu = getFilteredMenu(userPermissions, user.role, user.is_admin || false)
                    
                    // Filtrar por búsqueda si existe
                    const filteredSections = menuSearchQuery.trim()
                      ? filteredMenu.map(section => ({
                          ...section,
                          items: section.items.filter(item =>
                            item.label.toLowerCase().includes(menuSearchQuery.toLowerCase()) ||
                            section.section.toLowerCase().includes(menuSearchQuery.toLowerCase())
                          )
                        })).filter(section => section.items.length > 0)
                      : filteredMenu
                    
                    return filteredSections.map((section, sectionIndex) => {
                      const isExpanded = expandedSections.has(section.section) || menuSearchQuery.trim() !== ''
                      const hasActiveItem = section.items.some(item => loc.pathname === item.to)
                      
                      return (
                        <div key={section.section} className="space-y-0.5">
                          {/* Título de sección colapsable - Estilo acordeón profesional */}
                          {!sidebarCollapsed && (
                            <button
                              onClick={() => {
                                setExpandedSections(prev => {
                                  const newSet = new Set(prev)
                                  if (newSet.has(section.section)) {
                                    newSet.delete(section.section)
                                  } else {
                                    newSet.add(section.section)
                                  }
                                  return newSet
                                })
                              }}
                              className={cn(
                                "w-full px-3 py-2 mb-1 rounded-md transition-all duration-200 flex items-center justify-between group relative",
                                "border border-transparent hover:border-gray-300/60 dark:hover:border-gray-700/60",
                                "bg-gray-50/50 dark:bg-gray-800/30 hover:bg-gray-100/70 dark:hover:bg-gray-800/50",
                                "hover:shadow-sm active:scale-[0.98]",
                                isExpanded && "bg-gray-100/70 dark:bg-gray-800/50 border-gray-300/80 dark:border-gray-700/80",
                                hasActiveItem && "bg-primary-50/60 dark:bg-primary-900/30 border-primary-200/60 dark:border-primary-800/60"
                              )}
                              title={`${isExpanded ? 'Colapsar' : 'Expandir'} ${section.section}`}
                            >
                              {/* Borde izquierdo sutil que se intensifica en hover */}
                              <div className={cn(
                                "absolute left-0 top-0 bottom-0 w-0.5 rounded-l-md transition-all duration-200",
                                isExpanded 
                                  ? "bg-primary-500 dark:bg-primary-400 w-1" 
                                  : "bg-gray-300 dark:bg-gray-600 group-hover:bg-primary-400 dark:group-hover:bg-primary-500 group-hover:w-1"
                              )} />
                              
                              {/* Contenido del título */}
                              <div className="flex items-center gap-2 flex-1 pl-1">
                                {/* Icono chevron a la izquierda (estilo profesional) */}
                                <ChevronDown className={cn(
                                  "w-3.5 h-3.5 text-gray-500 dark:text-gray-400 transition-all duration-300 flex-shrink-0",
                                  isExpanded ? "rotate-0 text-primary-600 dark:text-primary-400" : "-rotate-90 text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300"
                                )} />
                                
                                {/* Texto del título */}
                                <h3 className={cn(
                                  "text-[11px] font-semibold uppercase tracking-wider transition-colors duration-200",
                                  isExpanded 
                                    ? "text-gray-700 dark:text-gray-200" 
                                    : "text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200"
                                )}>
                        {section.section}
                      </h3>
                    </div>
                              
                              {/* Contador de items */}
                              <span className={cn(
                                "px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors duration-200",
                                isExpanded
                                  ? "bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300"
                                  : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 group-hover:bg-gray-300 dark:group-hover:bg-gray-600"
                              )}>
                                {section.items.length}
                              </span>
                            </button>
                          )}
                          
                          {/* Separador visual cuando está colapsado */}
                          {sidebarCollapsed && (
                            <div className="h-px bg-gray-200 dark:bg-gray-700 my-1"></div>
                          )}
                  
                          {/* Items del menú - Estilo organizado tipo GoDaddy */}
                          <div className={cn(
                            "transition-all duration-200 overflow-hidden",
                            isExpanded ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'
                          )}>
                            <div className="pl-1 space-y-0.5">
                              {section.items.map(item => {
                                const Icon = item.icon
                                const isActive = loc.pathname === item.to
                                
                                const menuItem = (
                                  <Link
                                    key={item.to}
                                    to={item.to}
                                    className={cn(
                                      'group flex items-center gap-2.5 px-2 py-1.5 rounded text-xs transition-all duration-150',
                                      'hover:bg-gray-100/60 dark:hover:bg-gray-800/50',
                                      isActive 
                                        ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 font-medium' 
                                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                                    )}
                                  >
                                    {/* Icono limpio y simple */}
                                    <Icon className={cn(
                                      'w-4 h-4 flex-shrink-0 transition-colors duration-150',
                                      isActive 
                                        ? 'text-primary-600 dark:text-primary-400' 
                                        : 'text-gray-500 dark:text-gray-500 group-hover:text-gray-700 dark:group-hover:text-gray-300'
                                    )} />
                                    
                                    {/* Texto del menú */}
                                    {!sidebarCollapsed && (
                                      <span className="flex-1 truncate">
                                        {item.label}
                                      </span>
                                    )}
                                    {/* Badge de mensajes nuevos para Casilla Electrónica */}
                                    {!sidebarCollapsed && item.to === '/casilla-electronica' && mailboxStats.unread_count > 0 && (
                                      <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-bold text-white bg-red-500 rounded-full min-w-[18px] text-center">
                                        {mailboxStats.unread_count > 99 ? '99+' : mailboxStats.unread_count}
                                      </span>
                                    )}
                                  </Link>
                                )
                                
                                // Envolver con tooltip si está colapsado
                                return sidebarCollapsed ? (
                                  <Tooltip key={item.to} content={item.label} position="right">
                                    {menuItem}
                                  </Tooltip>
                                ) : (
                                  menuItem
                                )
                              })}
                            </div>
                          </div>
                </div>
                      )
                    })
                  })()}
            </div>
                
                {/* Gradiente inferior para indicar scroll */}
                <div className="sticky bottom-0 h-4 bg-gradient-to-t from-white/95 dark:from-gray-900/95 to-transparent pointer-events-none z-10"></div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center p-8 text-gray-500 dark:text-gray-400">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 dark:border-primary-400 mx-auto mb-2"></div>
                <p className="text-sm">Cargando menú...</p>
              </div>
            </div>
          )}
        </nav>
        
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 md:ml-0">
        {/* Topbar Mejorado - Fijo en la parte superior (AdminLTE 3 style) */}
        <header className={cn(
          "bg-white/95 backdrop-blur-md dark:bg-gray-900/95 dark:backdrop-blur-md border-b-2 border-gray-200/80 dark:border-gray-800/80 fixed top-0 z-20 shadow-md dark:shadow-gray-950/80 transition-all duration-300",
          "left-0 w-full",
          sidebarCollapsed ? "md:left-20 md:w-[calc(100%-80px)]" : "md:left-72 md:w-[calc(100%-288px)]"
        )}>
          <div className="h-16 flex items-center justify-between px-6">
            <div className="flex items-center gap-3">
              {/* Botón hamburguesa mejorado - Solo visible en desktop para colapsar/expandir */}
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="hidden md:flex p-2.5 rounded-xl hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 dark:hover:from-gray-800 dark:hover:to-gray-700 transition-all duration-200 text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 hover:scale-105 active:scale-95 group relative"
                title={sidebarCollapsed ? "Expandir menú" : "Colapsar menú"}
              >
                <MenuIcon className={cn(
                  "w-6 h-6 transition-transform duration-300",
                  sidebarCollapsed ? "rotate-0" : "rotate-0 group-hover:rotate-90"
                )} />
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200"></span>
              </button>
              
              {/* Botón móvil para mostrar/ocultar sidebar */}
              <button
                className="md:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                onClick={() => setOpen(!open)}
              >
                {open ? (
                  <X className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                ) : (
                  <MenuIcon className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                )}
              </button>
              
              {/* Título */}
              <div className="font-bold text-xl text-gray-900 dark:text-gray-100">Panel Contable</div>
            </div>
            
            {/* Selectores y Usuario - Todo a la derecha estilo AdminLTE 3 */}
            <div className="flex items-center gap-3 ml-auto">
              {/* Empresa - Mejorado para mayor visibilidad */}
              {availableCompanies.length > 0 && empresaId ? (
                <div 
                  className="flex items-center gap-3 px-4 py-2.5 bg-gradient-to-r from-primary-50 to-primary-100 dark:from-primary-900/40 dark:to-primary-800/40 border-2 border-primary-300 dark:border-primary-700 rounded-lg hover:border-primary-500 dark:hover:border-primary-500 hover:shadow-md transition-all cursor-pointer group"
                  onClick={() => setShowCompanyModal(true)}
                  title="Click para cambiar de empresa"
                >
                  <div className="p-1.5 bg-primary-500 dark:bg-primary-600 rounded-lg">
                    <Building2 className="w-5 h-5 text-white flex-shrink-0" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] font-bold text-primary-700 dark:text-primary-300 uppercase tracking-wider leading-none mb-0.5">
                      Empresa Activa
                    </span>
                    <span className="text-sm font-bold text-primary-900 dark:text-primary-100 truncate max-w-[180px]">
                      {availableCompanies.find(c => c.id === empresaId)?.name || 'Seleccionar'}
                    </span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-primary-600 dark:text-primary-400 flex-shrink-0 group-hover:text-primary-800 dark:group-hover:text-primary-200 transition-colors" />
                </div>
              ) : (
                <div 
                  className="flex items-center gap-3 px-4 py-2.5 bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700 rounded-lg hover:border-red-500 dark:hover:border-red-500 transition-all cursor-pointer group"
                  onClick={() => setShowCompanyModal(true)}
                  title="⚠️ Selecciona una empresa para continuar"
                >
                  <div className="p-1.5 bg-red-500 dark:bg-red-600 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-white flex-shrink-0" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] font-bold text-red-700 dark:text-red-300 uppercase tracking-wider leading-none mb-0.5">
                      Sin Empresa
                    </span>
                    <span className="text-sm font-bold text-red-900 dark:text-red-100">
                      Seleccionar Empresa
                    </span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                </div>
              )}
              
              {/* Período - Mejorado para mayor visibilidad */}
              {availablePeriods.length > 0 && periodo ? (
                (() => {
                  const currentPeriod = availablePeriods.find(p => `${p.year}-${String(p.month).padStart(2, '0')}` === periodo)
                  const status = currentPeriod?.status || 'ABIERTO'
                  const statusConfig = {
                    'CERRADO': { 
                      bg: 'from-red-50 to-red-100 dark:from-red-900/40 dark:to-red-800/40',
                      border: 'border-red-300 dark:border-red-700 hover:border-red-500',
                      iconBg: 'bg-red-500 dark:bg-red-600',
                      text: 'text-red-700 dark:text-red-300',
                      textBold: 'text-red-900 dark:text-red-100',
                      badge: 'bg-red-500 text-white dark:bg-red-600',
                      icon: '🔒',
                      label: 'CERRADO'
                    },
                    'REABIERTO': { 
                      bg: 'from-yellow-50 to-yellow-100 dark:from-yellow-900/40 dark:to-yellow-800/40',
                      border: 'border-yellow-300 dark:border-yellow-700 hover:border-yellow-500',
                      iconBg: 'bg-yellow-500 dark:bg-yellow-600',
                      text: 'text-yellow-700 dark:text-yellow-300',
                      textBold: 'text-yellow-900 dark:text-yellow-100',
                      badge: 'bg-yellow-500 text-white dark:bg-yellow-600',
                      icon: '🔓',
                      label: 'REABIERTO'
                    },
                    'ABIERTO': { 
                      bg: 'from-blue-50 to-blue-100 dark:from-blue-900/40 dark:to-blue-800/40',
                      border: 'border-blue-300 dark:border-blue-700 hover:border-blue-500',
                      iconBg: 'bg-blue-500 dark:bg-blue-600',
                      text: 'text-blue-700 dark:text-blue-300',
                      textBold: 'text-blue-900 dark:text-blue-100',
                      badge: 'bg-green-500 text-white dark:bg-green-600',
                      icon: '✓',
                      label: 'ABIERTO'
                    }
                  }
                  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig['ABIERTO']
                  
                  return (
                    <div 
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5 bg-gradient-to-r rounded-lg border-2 hover:shadow-md transition-all cursor-pointer group",
                        config.bg,
                        config.border
                      )}
                      onClick={() => setShowPeriodModal(true)}
                      title={`Período ${status.toLowerCase()}. Click para cambiar.`}
                    >
                      <div className={cn("p-1.5 rounded-lg", config.iconBg)}>
                        <Calendar className="w-5 h-5 text-white flex-shrink-0" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className={cn("text-[10px] font-bold uppercase tracking-wider leading-none mb-0.5", config.text)}>
                          Período Activo
                        </span>
                        <div className="flex items-center gap-2">
                          <span className={cn("text-sm font-bold", config.textBold)}>
                            {periodo}
                          </span>
                          <div className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide whitespace-nowrap", config.badge)}>
                            {config.icon} {config.label}
                          </div>
                        </div>
                      </div>
                      <ChevronDown className={cn("w-4 h-4 flex-shrink-0 group-hover:opacity-80 transition-colors", config.text)} />
                    </div>
                  )
                })()
              ) : (
                <div 
                  className="flex items-center gap-3 px-4 py-2.5 bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700 rounded-lg hover:border-red-500 dark:hover:border-red-500 transition-all cursor-pointer group"
                  onClick={() => setShowPeriodModal(true)}
                  title="⚠️ Selecciona un período contable para continuar"
                >
                  <div className="p-1.5 bg-red-500 dark:bg-red-600 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-white flex-shrink-0" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] font-bold text-red-700 dark:text-red-300 uppercase tracking-wider leading-none mb-0.5">
                      Sin Período
                    </span>
                    <span className="text-sm font-bold text-red-900 dark:text-red-100">
                      Seleccionar Período
                    </span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                </div>
              )}
            
              {/* Badge de mensajes nuevos en barra superior */}
              {userPermissions.includes('casilla.view') && mailboxStats.unread_count > 0 && (
                <Link
                  to="/casilla-electronica"
                  className="relative flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700 hover:border-red-500 dark:hover:border-red-500 transition-all group"
                  title={`${mailboxStats.unread_count} mensaje${mailboxStats.unread_count !== 1 ? 's' : ''} nuevo${mailboxStats.unread_count !== 1 ? 's' : ''} en Casilla Electrónica`}
                >
                  <Inbox className="w-5 h-5 text-red-600 dark:text-red-400" />
                  <span className="text-sm font-semibold text-red-900 dark:text-red-100 hidden sm:inline">
                    Casilla
                  </span>
                  <span className="absolute -top-1 -right-1 flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full animate-pulse">
                    {mailboxStats.unread_count > 99 ? '99+' : mailboxStats.unread_count}
                  </span>
                </Link>
              )}
              
              {/* Menú de Usuario - En el topbar a la derecha */}
              {user && (
                <div className="flex items-center gap-3 user-menu-container relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  title={user.nombre && user.apellido ? `${user.nombre} ${user.apellido} - ${user.role}` : `${user.username} - ${user.role}`}
                >
                  {user.foto ? (
                    <img 
                      src={getUserPhotoUrl(user.id)}
                      alt={user.nombre && user.apellido ? `${user.nombre} ${user.apellido}` : user.username}
                      className="w-8 h-8 rounded-full border-2 border-primary-200 dark:border-primary-700 object-cover"
                      onError={(e) => {
                        // Si falla la imagen, mostrar el avatar por defecto
                        const target = e.target as HTMLImageElement
                        target.style.display = 'none'
                        const parent = target.parentElement
                        if (parent) {
                          const fallback = parent.querySelector('.avatar-fallback') as HTMLElement
                          if (fallback) fallback.style.display = 'grid'
                        }
                      }}
                    />
                  ) : null}
                  <div className={`w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 text-white grid place-items-center text-sm font-bold shadow-md ${user.foto ? 'avatar-fallback hidden' : ''}`}>
                    {(user.nombre && user.apellido) 
                      ? `${user.nombre.charAt(0)}${user.apellido.charAt(0)}`.toUpperCase()
                      : user.username.charAt(0).toUpperCase()
                    }
                  </div>
                </button>
                
                {/* Dropdown Menu */}
                {userMenuOpen && (
                  <div className="absolute top-full right-0 mt-2 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl dark:shadow-gray-900/80 overflow-hidden z-50 min-w-[220px]">
                    {/* Header del usuario */}
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-primary-50 to-indigo-50 dark:from-primary-900/30 dark:to-indigo-900/30">
                      <div className="flex items-center gap-3">
                        {user.foto ? (
                          <img 
                            src={getUserPhotoUrl(user.id)}
                            alt={user.nombre && user.apellido ? `${user.nombre} ${user.apellido}` : user.username}
                            className="w-10 h-10 rounded-full border-2 border-primary-300 dark:border-primary-600 object-cover"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement
                              target.style.display = 'none'
                              const parent = target.parentElement
                              if (parent) {
                                const fallback = parent.querySelector('.avatar-fallback-menu') as HTMLElement
                                if (fallback) fallback.style.display = 'grid'
                              }
                            }}
                          />
                        ) : null}
                        <div className={`w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 text-white grid place-items-center text-sm font-bold shadow-md ${user.foto ? 'avatar-fallback-menu hidden' : ''}`}>
                          {(user.nombre && user.apellido) 
                            ? `${user.nombre.charAt(0)}${user.apellido.charAt(0)}`.toUpperCase()
                            : user.username.charAt(0).toUpperCase()
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
                            {user.nombre && user.apellido ? `${user.nombre} ${user.apellido}` : user.username}
                          </div>
                          <div className="text-xs text-primary-600 dark:text-primary-400 font-medium">{user.role}</div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Opciones del menú */}
                    <div className="py-1">
                      <Link
                        to="/mi-perfil"
                        onClick={() => setUserMenuOpen(false)}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-primary-50 dark:hover:bg-gray-700 transition-colors",
                          loc.pathname === '/mi-perfil' && "bg-primary-50 dark:bg-gray-700 text-primary-700 dark:text-primary-400"
                        )}
                      >
                        <User className="w-4 h-4" />
                        <span>Mi Perfil</span>
                      </Link>
                      <div className="border-t border-gray-200 dark:border-gray-700">
                        <button
                          onClick={() => {
                            toggleTheme()
                            setUserMenuOpen(false)
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                          {theme === 'light' ? (
                            <>
                              <Moon className="w-4 h-4" />
                              <span>Tema Oscuro</span>
                            </>
                          ) : (
                            <>
                              <Sun className="w-4 h-4" />
                              <span>Tema Claro</span>
                            </>
                          )}
                        </button>
                      </div>
                      <div className="border-t border-gray-200 dark:border-gray-700">
                        <button
                          onClick={() => {
                            logout()
                            setUserMenuOpen(false)
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <LogOut className="w-4 h-4" />
                          <span>Cerrar sesión</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                </div>
              )}
            </div>
          </div>
        </header>
        
        {/* Main content con espacio para header fijo */}
        <main className="flex-1 p-6 max-w-[1600px] mx-auto w-full animate-fade-in mt-16">
          {children}
        </main>

        {/* Modal para cambiar Empresa */}
        {showCompanyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/30" onClick={() => setShowCompanyModal(false)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md border-2 border-gray-200 dark:border-gray-700">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-primary-50 to-indigo-50 dark:from-primary-900/30 dark:to-indigo-900/30 rounded-t-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Building2 className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Seleccionar Empresa</h3>
                  </div>
                  <button
                    onClick={() => setShowCompanyModal(false)}
                    className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="p-4 max-h-[400px] overflow-y-auto">
                <div className="space-y-2">
                  {availableCompanies.map(company => (
                    <button
                      key={company.id}
                      onClick={() => {
                        setEmpresa(company.id)
                        setShowCompanyModal(false)
                      }}
                      className={cn(
                        "w-full text-left p-3 rounded-lg border-2 transition-all",
                        empresaId === company.id
                          ? "bg-primary-50 dark:bg-primary-900/30 border-primary-500 dark:border-primary-600"
                          : "bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:border-primary-300 dark:hover:border-primary-700"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Building2 className={cn(
                          "w-5 h-5 flex-shrink-0",
                          empresaId === company.id
                            ? "text-primary-600 dark:text-primary-400"
                            : "text-gray-400 dark:text-gray-500"
                        )} />
                        <div className="flex-1 min-w-0">
                          <div className={cn(
                            "font-semibold text-sm",
                            empresaId === company.id
                              ? "text-primary-700 dark:text-primary-300"
                              : "text-gray-900 dark:text-gray-100"
                          )}>
                            {company.name}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {company.ruc || 'Sin RUC'}
                          </div>
                        </div>
                        {empresaId === company.id && (
                          <div className="w-5 h-5 rounded-full bg-primary-500 dark:bg-primary-600 flex items-center justify-center flex-shrink-0">
                            <div className="w-2 h-2 rounded-full bg-white" />
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal para cambiar Período */}
        {showPeriodModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/30" onClick={() => {
              setShowPeriodModal(false)
              setYearFilter('')
              setShowAllYears(false)
            }} />
            <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md border-2 border-gray-200 dark:border-gray-700">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-t-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Seleccionar Período</h3>
                  </div>
                  <button
                    onClick={() => {
                      setShowPeriodModal(false)
                      setYearFilter('')
                      setShowAllYears(false)
                    }}
                    className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              {/* Campo de búsqueda/filtro */}
              <div className="px-4 pt-4 pb-2 border-b border-gray-200 dark:border-gray-700">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Buscar por año (ej: 2024)..."
                    value={yearFilter}
                    onChange={(e) => setYearFilter(e.target.value)}
                    className="w-full px-3 py-2 pl-10 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  />
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                  {yearFilter && (
                    <button
                      onClick={() => setYearFilter('')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="p-4 max-h-[450px] overflow-y-auto">
                {(() => {
                  // Agrupar períodos por año
                  const periodsByYear: Record<number, typeof availablePeriods> = {}
                  availablePeriods.forEach(p => {
                    if (!periodsByYear[p.year]) {
                      periodsByYear[p.year] = []
                    }
                    periodsByYear[p.year].push(p)
                  })
                  
                  // Ordenar años de más reciente a más antiguo
                  let sortedYears = Object.keys(periodsByYear)
                    .map(Number)
                    .sort((a, b) => b - a)
                  
                  // Aplicar filtro por año si existe
                  if (yearFilter.trim()) {
                    const filterValue = yearFilter.trim()
                    sortedYears = sortedYears.filter(year => 
                      year.toString().includes(filterValue)
                    )
                  } else if (!showAllYears && sortedYears.length > 5) {
                    // Mostrar solo los últimos 5 años si no se ha hecho clic en "Ver todos"
                    sortedYears = sortedYears.slice(0, 5)
                  }
                  
                  const totalYears = Object.keys(periodsByYear).length
                  const showingYears = sortedYears.length
                  
                  return (
                    <div className="space-y-2">
                      {sortedYears.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                          <Calendar className="w-12 h-12 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No se encontraron períodos para el año buscado</p>
                        </div>
                      ) : (
                        <>
                          {sortedYears.map(year => {
                        const yearPeriods = periodsByYear[year].sort((a, b) => b.month - a.month) // Ordenar meses descendente
                        const isExpanded = expandedYears.has(year)
                        
                        return (
                          <div key={year} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                            {/* Header del año - Click para expandir/colapsar */}
                            <button
                              onClick={() => {
                                const newExpanded = new Set(expandedYears)
                                if (isExpanded) {
                                  newExpanded.delete(year)
                                } else {
                                  newExpanded.add(year)
                                }
                                setExpandedYears(newExpanded)
                              }}
                              className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-lg text-gray-900 dark:text-gray-100">{year}</span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  ({yearPeriods.length} {yearPeriods.length === 1 ? 'período' : 'períodos'})
                                </span>
                              </div>
                              {isExpanded ? (
                                <ChevronDown className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                              ) : (
                                <ChevronRight className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                              )}
                            </button>
                            
                            {/* Períodos del año */}
                            {isExpanded && (
                              <div className="p-2 space-y-1 bg-white dark:bg-gray-800">
                                {yearPeriods.map(p => {
                                  const ym = `${String(p.year).padStart(4,'0')}-${String(p.month).padStart(2,'0')}`
                                  const isSelected = periodo === ym
                                  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
                                  
                                  return (
                                    <button
                                      key={p.id}
                                      onClick={() => {
                                        setPeriodo(ym)
                                        setShowPeriodModal(false)
                                      }}
                                      className={cn(
                                        "w-full text-left p-2.5 rounded-lg border-2 transition-all",
                                        isSelected
                                          ? "bg-blue-50 dark:bg-blue-900/30 border-blue-500 dark:border-blue-600"
                                          : "bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-gray-100 dark:hover:bg-gray-700"
                                      )}
                                    >
                                      <div className="flex items-center gap-2.5">
                                        <Calendar className={cn(
                                          "w-4 h-4 flex-shrink-0",
                                          isSelected
                                            ? "text-blue-600 dark:text-blue-400"
                                            : "text-gray-400 dark:text-gray-500"
                                        )} />
                                        <div className="flex-1 min-w-0 flex items-center gap-2">
                                          <span className={cn(
                                            "font-medium text-sm",
                                            isSelected
                                              ? "text-blue-700 dark:text-blue-300"
                                              : "text-gray-900 dark:text-gray-100"
                                          )}>
                                            {monthNames[p.month - 1]} {p.year}
                                          </span>
                                          <div className={cn(
                                            "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide",
                                            p.status === 'CERRADO'
                                              ? 'bg-red-500 text-white dark:bg-red-600'
                                              : p.status === 'REABIERTO'
                                              ? 'bg-yellow-500 text-white dark:bg-yellow-600'
                                              : 'bg-green-500 text-white dark:bg-green-600'
                                          )}>
                                            {p.status === 'CERRADO' ? '🔒' : p.status === 'REABIERTO' ? '🔓' : '✓'}
                                          </div>
                                        </div>
                                        {isSelected && (
                                          <div className="w-4 h-4 rounded-full bg-blue-500 dark:bg-blue-600 flex items-center justify-center flex-shrink-0">
                                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                          </div>
                                        )}
                                      </div>
                                    </button>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                        </>
                      )}
                      
                      {/* Botón para mostrar todos los años */}
                      {!yearFilter.trim() && totalYears > 5 && (
                        <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                          <button
                            onClick={() => setShowAllYears(!showAllYears)}
                            className="w-full py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors flex items-center justify-center gap-2"
                          >
                            {showAllYears ? (
                              <>
                                Mostrar menos años
                                <ChevronDown className="w-4 h-4" />
                              </>
                            ) : (
                              <>
                                Ver todos los años ({totalYears} {totalYears === 1 ? 'año' : 'años'})
                                <ChevronRight className="w-4 h-4" />
                              </>
                            )}
                          </button>
                        </div>
                      )}
                      
                      {/* Mostrar información de resultados filtrados */}
                      {yearFilter.trim() && showingYears > 0 && (
                        <div className="pt-2 text-center text-xs text-gray-500 dark:text-gray-400">
                          Mostrando {showingYears} {showingYears === 1 ? 'año' : 'años'} encontrados
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
      <ToastContainer />
    </div>
  )
}
