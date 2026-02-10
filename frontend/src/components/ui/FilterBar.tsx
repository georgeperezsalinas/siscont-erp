import { ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from './Input'

interface FilterBarProps {
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  className?: string
  children?: ReactNode
  showClearButton?: boolean
}

export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Buscar...',
  className,
  children,
  showClearButton = true,
}: FilterBarProps) {
  return (
    <div className={cn('flex flex-col sm:flex-row gap-3 mb-6', className)}>
      {/* Barra de búsqueda */}
      <div className="relative flex-1 min-w-[250px]">
        <Input
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          leftIcon={<Search className="w-4 h-4" />}
          rightIcon={
            showClearButton && searchValue ? (
              <button
                onClick={() => onSearchChange('')}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
                title="Limpiar búsqueda"
                type="button"
              >
                <X className="w-4 h-4" />
              </button>
            ) : undefined
          }
        />
      </div>

      {/* Filtros adicionales */}
      {children && (
        <div className="flex flex-wrap items-center gap-2">
          {children}
        </div>
      )}
    </div>
  )
}

