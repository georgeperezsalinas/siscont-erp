import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface TabsProps {
  value: string
  onValueChange: (value: string) => void
  children: ReactNode
  className?: string
}

interface TabsListProps {
  children: ReactNode
  className?: string
}

interface TabsTriggerProps {
  value: string
  children: ReactNode
  className?: string
}

interface TabsContentProps {
  value: string
  children: ReactNode
  className?: string
}

export function Tabs({ value, onValueChange, children, className }: TabsProps) {
  return (
    <div className={cn('w-full', className)}>
      {children}
    </div>
  )
}

export function TabsList({ children, className }: TabsListProps) {
  return (
    <div className={cn(
      'inline-flex h-10 items-center justify-center rounded-lg bg-gray-100 p-1 text-gray-500',
      className
    )}>
      {children}
    </div>
  )
}

export function TabsTrigger({ value, children, className, ...props }: TabsTriggerProps & { value: string; 'data-value': string }) {
  const isActive = props['data-value'] === value
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
        isActive
          ? 'bg-white text-gray-900 shadow-sm'
          : 'text-gray-600 hover:text-gray-900',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function TabsContent({ value, children, className, ...props }: TabsContentProps & { 'data-value': string }) {
  const isActive = props['data-value'] === value
  if (!isActive) return null
  
  return (
    <div
      className={cn(
        'mt-2 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

// Helper components that handle the value prop internally
export function TabsTriggerWithValue({ value, activeValue, onValueChange, children, className }: {
  value: string
  activeValue: string
  onValueChange: (value: string) => void
  children: ReactNode
  className?: string
}) {
  const isActive = value === activeValue
  return (
    <button
      onClick={() => onValueChange(value)}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
        isActive
          ? 'bg-white text-gray-900 shadow-sm'
          : 'text-gray-600 hover:text-gray-900',
        className
      )}
    >
      {children}
    </button>
  )
}

export function TabsContentWithValue({ value, activeValue, children, className }: {
  value: string
  activeValue: string
  children: ReactNode
  className?: string
}) {
  if (value !== activeValue) return null
  
  return (
    <div
      className={cn(
        'mt-2 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2',
        className
      )}
    >
      {children}
    </div>
  )
}

