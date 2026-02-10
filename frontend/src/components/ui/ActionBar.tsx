import { ReactNode } from 'react'
import { Button } from './Button'
import { Plus, RefreshCw, Download, FileSpreadsheet, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ActionBarProps {
  onNew?: () => void
  onRefresh?: () => void
  onExportCsv?: () => void
  onExportExcel?: () => void
  loading?: boolean
  newLabel?: string
  className?: string
  children?: ReactNode
}

export function ActionBar({
  onNew,
  onRefresh,
  onExportCsv,
  onExportExcel,
  loading = false,
  newLabel = 'Nuevo',
  className,
  children,
}: ActionBarProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {onNew && (
        <Button onClick={onNew} disabled={loading}>
          <Plus className="w-4 h-4" />
          {newLabel}
        </Button>
      )}
      
      {onRefresh && (
        <Button
          variant="outline"
          onClick={onRefresh}
          disabled={loading}
          title="Actualizar datos"
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          Actualizar
        </Button>
      )}

      {(onExportCsv || onExportExcel) && (
        <div className="flex items-center gap-2 pl-2 border-l border-gray-200 dark:border-gray-700">
          {onExportCsv && (
            <Button
              variant="outline"
              size="sm"
              onClick={onExportCsv}
              disabled={loading}
              title="Exportar a CSV"
            >
              <FileText className="w-4 h-4" />
              CSV
            </Button>
          )}
          {onExportExcel && (
            <Button
              variant="outline"
              size="sm"
              onClick={onExportExcel}
              disabled={loading}
              title="Exportar a Excel"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Excel
            </Button>
          )}
        </div>
      )}

      {children}
    </div>
  )
}

