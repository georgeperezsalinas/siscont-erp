import { FileEdit, CheckCircle, RotateCcw, XCircle, AlertCircle } from 'lucide-react'
import { Badge } from './Badge'
import { cn } from '@/lib/utils'

export type EntryStatus = 'DRAFT' | 'POSTED' | 'REVERSED' | 'CANCELLED' | 'VOIDED'

interface StatusBadgeProps {
  status: EntryStatus | string
  className?: string
  showIcon?: boolean
}

export function StatusBadge({ status, className, showIcon = true }: StatusBadgeProps) {
  const statusConfig: Record<string, { 
    label: string
    icon: typeof FileEdit
    variant: 'default' | 'success' | 'warning' | 'error' | 'info' | 'outline'
    color: string
  }> = {
    DRAFT: {
      label: 'Borrador',
      icon: FileEdit,
      variant: 'warning',
      color: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-600'
    },
    POSTED: {
      label: 'Posteado',
      icon: CheckCircle,
      variant: 'success',
      color: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-600'
    },
    REVERSED: {
      label: 'Revertido',
      icon: RotateCcw,
      variant: 'error',
      color: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-600'
    },
    CANCELLED: {
      label: 'Cancelado',
      icon: XCircle,
      variant: 'error',
      color: 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600'
    },
    VOIDED: {
      label: 'Anulado',
      icon: AlertCircle,
      variant: 'error',
      color: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-600'
    }
  }

  const config = statusConfig[status] || {
    label: status,
    icon: AlertCircle,
    variant: 'default' as const,
    color: 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600'
  }

  const Icon = config.icon

  return (
    <Badge variant={config.variant} className={cn('flex items-center gap-1', className)}>
      {showIcon && <Icon className="h-3 w-3" />}
      <span>{config.label}</span>
    </Badge>
  )
}

