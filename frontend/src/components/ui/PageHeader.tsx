import { ReactNode } from 'react'
import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  subtitle?: string
  icon?: LucideIcon
  iconColor?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
  className?: string
  actions?: ReactNode
}

const iconColors = {
  primary: 'from-primary-500 to-primary-600',
  success: 'from-emerald-500 to-emerald-600',
  warning: 'from-amber-500 to-amber-600',
  danger: 'from-red-500 to-red-600',
  info: 'from-blue-500 to-blue-600',
}

export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  iconColor = 'primary',
  className,
  actions,
}: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6', className)}>
      <div className="flex items-start gap-4 flex-1 min-w-0">
        {Icon && (
          <div className={cn(
            'flex-shrink-0 p-3 rounded-2xl bg-gradient-to-br shadow-lg',
            iconColors[iconColor]
          )}>
            <Icon className="w-6 h-6 text-white" />
          </div>
        )}
        <div className="flex-1 min-w-0 text-left">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2 leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-base text-gray-600 dark:text-gray-400 leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {actions}
        </div>
      )}
    </div>
  )
}

