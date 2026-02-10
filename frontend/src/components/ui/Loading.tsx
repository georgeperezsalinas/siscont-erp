import { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

interface SkeletonProps {
  className?: string
  variant?: 'text' | 'circular' | 'rectangular'
  width?: string | number
  height?: string | number
  animation?: 'pulse' | 'wave' | 'none'
}

export function Skeleton({ 
  className, 
  variant = 'rectangular',
  width,
  height,
  animation = 'pulse'
}: SkeletonProps) {
  const baseStyles = 'bg-gray-200 dark:bg-gray-700 rounded'
  
  const variants = {
    text: 'h-4 rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  }
  
  const animations = {
    pulse: 'animate-pulse',
    wave: 'animate-[wave_1.6s_ease-in-out_0.5s_infinite]',
    none: '',
  }
  
  const style: React.CSSProperties = {}
  if (width) style.width = typeof width === 'number' ? `${width}px` : width
  if (height) style.height = typeof height === 'number' ? `${height}px` : height
  
  return (
    <div
      className={cn(baseStyles, variants[variant], animations[animation], className)}
      style={style}
    />
  )
}

interface LoadingStateProps {
  message?: string
  size?: 'sm' | 'md' | 'lg'
  fullScreen?: boolean
}

export function LoadingState({ 
  message = 'Cargando...', 
  size = 'md',
  fullScreen = false 
}: LoadingStateProps) {
  const sizes = {
    sm: 'w-5 h-5',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  }
  
  const content = (
    <div className="flex flex-col items-center justify-center gap-3">
      <Loader2 className={cn('animate-spin text-primary-600 dark:text-primary-400', sizes[size])} />
      {message && (
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{message}</p>
      )}
    </div>
  )
  
  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm z-50 flex items-center justify-center">
        {content}
      </div>
    )
  }
  
  return <div className="py-12">{content}</div>
}

interface SkeletonCardProps {
  lines?: number
}

export function SkeletonCard({ lines = 3 }: SkeletonCardProps) {
  return (
    <div className="card p-6">
      <div className="space-y-4">
        <Skeleton height={24} width="60%" />
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} height={16} width={i === lines - 1 ? '40%' : '100%'} />
        ))}
      </div>
    </div>
  )
}

interface SkeletonTableProps {
  rows?: number
  columns?: number
}

export function SkeletonTable({ rows = 5, columns = 4 }: SkeletonTableProps) {
  return (
    <div className="card overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-4">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} height={20} width={`${100 / columns}%`} />
          ))}
        </div>
      </div>
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="p-4 flex gap-4">
            {Array.from({ length: columns }).map((_, colIndex) => (
              <Skeleton key={colIndex} height={16} width={`${100 / columns}%`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

