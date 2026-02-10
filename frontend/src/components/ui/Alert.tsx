import { ReactNode } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type AlertVariant = 'default' | 'success' | 'warning' | 'error' | 'info'

interface AlertProps {
  children: ReactNode
  variant?: AlertVariant
  className?: string
  onClose?: () => void
}

interface AlertTitleProps {
  children: ReactNode
  className?: string
}

interface AlertDescriptionProps {
  children: ReactNode
  className?: string
}

export function Alert({ children, variant = 'default', className, onClose }: AlertProps) {
  const variants = {
    default: 'bg-gray-50 border-gray-200 text-gray-900 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100',
    success: 'bg-green-50 border-green-200 text-green-900 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-900 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200',
    error: 'bg-red-50 border-red-200 text-red-900 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200',
    info: 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200'
  }

  return (
    <div
      className={cn(
        'relative rounded-lg border p-4',
        variants[variant],
        className
      )}
    >
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {children}
    </div>
  )
}

export function AlertTitle({ children, className }: AlertTitleProps) {
  return (
    <h5 className={cn('mb-1 font-medium leading-none tracking-tight', className)}>
      {children}
    </h5>
  )
}

export function AlertDescription({ children, className }: AlertDescriptionProps) {
  return (
    <div className={cn('text-sm [&_p]:leading-relaxed', className)}>
      {children}
    </div>
  )
}

