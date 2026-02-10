import { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronRight, Home } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BreadcrumbItem {
  label: string
  to?: string
}

interface BreadcrumbsProps {
  items?: BreadcrumbItem[]
  className?: string
}

// Mapeo de rutas a labels amigables
const routeLabels: Record<string, string> = {
  '/': 'Dashboard',
  '/empresas': 'Empresas',
  '/usuarios': 'Usuarios',
  '/permisos': 'Permisos',
  '/plan': 'Plan Contable',
  '/periodos': 'Periodos',
  '/asientos': 'Asientos Contables',
  '/diarios': 'Diarios',
  '/terceros': 'Proveedores y Clientes',
  '/compras': 'Compras',
  '/ventas': 'Ventas',
  '/inventarios': 'Inventarios',
  '/reportes': 'Reportes',
  '/ple': 'PLE',
  '/conciliacion-bancaria': 'Conciliación Bancaria',
  '/tesoreria': 'Tesorería',
  '/mi-perfil': 'Mi Perfil',
  '/setup-datos': 'Setup Datos',
  '/mantenimiento-datos': 'Mantenimiento de Datos',
  '/validacion-datos': 'Validación de Datos',
  '/configuracion': 'Configuración',
  '/motor-asientos': 'Motor de Asientos',
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  const location = useLocation()
  
  // Si no se proporcionan items, generarlos automáticamente desde la ruta
  const breadcrumbItems: BreadcrumbItem[] = items || (() => {
    const paths = location.pathname.split('/').filter(Boolean)
    const result: BreadcrumbItem[] = []
    
    // Siempre incluir Dashboard como inicio
    result.push({ label: 'Dashboard', to: '/' })
    
    // Construir breadcrumbs desde la ruta
    let currentPath = ''
    paths.forEach((path, index) => {
      currentPath += `/${path}`
      const label = routeLabels[currentPath] || path.charAt(0).toUpperCase() + path.slice(1).replace(/-/g, ' ')
      result.push({
        label,
        to: index === paths.length - 1 ? undefined : currentPath, // Último item no es clickeable
      })
    })
    
    return result
  })()

  if (breadcrumbItems.length <= 1) {
    return null
  }

  return (
    <nav 
      className={cn('flex items-center gap-2 text-sm mb-4', className)}
      aria-label="Breadcrumb"
    >
      <ol className="flex items-center gap-2 flex-wrap">
        {breadcrumbItems.map((item, index) => {
          const isLast = index === breadcrumbItems.length - 1
          
          return (
            <li key={index} className="flex items-center gap-2">
              {index === 0 ? (
                <Link
                  to={item.to || '/'}
                  className={cn(
                    'flex items-center gap-1.5 transition-colors',
                    isLast
                      ? 'text-gray-900 dark:text-gray-100 font-semibold'
                      : 'text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400'
                  )}
                >
                  <Home className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              ) : (
                <>
                  <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                  {item.to && !isLast ? (
                    <Link
                      to={item.to}
                      className="text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <span className={cn(
                      'text-gray-900 dark:text-gray-100',
                      isLast && 'font-semibold'
                    )}>
                      {item.label}
                    </span>
                  )}
                </>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

