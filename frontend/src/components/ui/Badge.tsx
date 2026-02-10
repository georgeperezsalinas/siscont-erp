import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'outline'

interface BadgeProps {
  children: ReactNode
  variant?: BadgeVariant
  className?: string
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  const variants = {
    default: 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600',
    success: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-600',
    warning: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-600',
    error: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-600',
    info: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-600',
    outline: 'bg-transparent border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-300'
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium border',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  )
}

