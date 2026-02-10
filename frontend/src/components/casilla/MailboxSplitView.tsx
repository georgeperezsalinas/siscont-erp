/**
 * Layout unificado estilo correo/casilla electrónica.
 * Panel izquierdo: lista de mensajes | Panel derecho: detalle o estado vacío
 */
import { ReactNode } from 'react'
import { LucideIcon } from 'lucide-react'

interface MailboxSplitViewProps {
  title: string
  icon: LucideIcon
  stats?: ReactNode
  filters?: ReactNode
  listContent: ReactNode
  detailContent: ReactNode
}

export function MailboxSplitView({
  title,
  icon: Icon,
  stats,
  filters,
  listContent,
  detailContent,
}: MailboxSplitViewProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-0 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
      {/* Panel izquierdo: lista */}
      <div className="border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 text-left">
            <Icon className="w-5 h-5 text-primary-600 flex-shrink-0" />
            <span>{title}</span>
          </h3>
          {stats && <div className="flex items-center gap-3 mt-2 text-sm text-gray-600 dark:text-gray-400">{stats}</div>}
        </div>
        {filters && (
          <div className="p-2 border-b border-gray-200 dark:border-gray-700 flex flex-wrap gap-2">
            {filters}
          </div>
        )}
        <div className="flex-1 overflow-y-auto min-h-[320px] max-h-[calc(100vh-320px)]">
          {listContent}
        </div>
      </div>

      {/* Panel derecho: detalle o vacío */}
      <div className="flex flex-col min-h-[400px]">
        {detailContent}
      </div>
    </div>
  )
}

export function MailboxEmptyState({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: LucideIcon
  title: string
  subtitle: string
}) {
  return (
    <div className="flex-1 flex flex-col items-start justify-center p-12 text-left text-gray-500 dark:text-gray-400">
      <Icon className="w-16 h-16 mb-4 opacity-30" />
      <h4 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-1">{title}</h4>
      <p className="text-sm max-w-sm">{subtitle}</p>
    </div>
  )
}
