import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface CardProps {
  children: ReactNode
  className?: string
  hover?: boolean
  gradient?: boolean
}

export function Card({ children, className, hover = true, gradient = false }: CardProps) {
  return (
    <div className={cn(
      'card',
      hover && 'hover:shadow-xl dark:hover:shadow-2xl hover:-translate-y-1',
      gradient && 'bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900',
      className
    )}>
      {children}
    </div>
  )
}

interface CardHeaderProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  icon?: ReactNode
}

export function CardHeader({ title, subtitle, actions, icon }: CardHeaderProps) {
  return (
    <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50/50 to-transparent dark:from-gray-800/50">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        {icon && (
          <div className="flex-shrink-0 mt-1">
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-tight">{title}</h3>
          {subtitle && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex-shrink-0 ml-4">{actions}</div>}
    </div>
  )
}

