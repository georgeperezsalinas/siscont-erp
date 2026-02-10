import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface TableProps {
  children: ReactNode
  className?: string
}

export function Table({ children, className }: TableProps) {
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className={cn('w-full table-fixed', className)}>
        {children}
      </table>
    </div>
  )
}

interface TableHeaderProps {
  children: ReactNode
}

export function TableHeader({ children }: TableHeaderProps) {
  return (
    <thead className="bg-gradient-to-b from-blue-50/80 via-indigo-50/60 to-purple-50/40 dark:from-gray-900/95 dark:via-gray-800/95 dark:to-gray-900/90">
      <tr className="border-b-2 border-gray-200/80 dark:border-gray-700/80">
        {children}
      </tr>
    </thead>
  )
}

interface TableHeaderCellProps {
  children: ReactNode
  className?: string
}

export function TableHeaderCell({ children, className }: TableHeaderCellProps) {
  return (
    <th className={cn(
      'px-4 py-3.5 text-left text-xs font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider',
      'bg-gradient-to-b from-blue-50/80 via-indigo-50/60 to-purple-50/40 dark:from-gray-900/95 dark:via-gray-800/95 dark:to-gray-900/90',
      className
    )}>
      {children}
    </th>
  )
}

interface TableBodyProps {
  children: ReactNode
}

export function TableBody({ children }: TableBodyProps) {
  return (
    <tbody className="divide-y divide-gray-100/80 dark:divide-gray-700/60">
      {children}
    </tbody>
  )
}

interface TableRowProps {
  children: ReactNode
  className?: string
  onClick?: () => void
}

export function TableRow({ children, className, onClick }: TableRowProps) {
  return (
    <tr 
      className={cn(
        'border-b border-gray-100/80 dark:border-gray-700/60 transition-all duration-200',
        'bg-white/60 dark:bg-gray-800/50 backdrop-blur-sm',
        onClick && 'cursor-pointer hover:bg-gradient-to-r hover:from-blue-50/80 hover:to-indigo-50/60 dark:hover:from-blue-900/30 dark:hover:to-indigo-900/30',
        className
      )}
      onClick={onClick}
    >
      {children}
    </tr>
  )
}

interface TableCellProps {
  children: ReactNode
  className?: string
}

export function TableCell({ children, className }: TableCellProps) {
  return (
    <td className={cn('px-4 py-3 text-sm text-gray-900 dark:text-gray-100', className)}>
      {children}
    </td>
  )
}

