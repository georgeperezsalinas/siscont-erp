import { useState, useMemo, ReactNode } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from '@tanstack/react-table'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { Button } from './Button'
import { cn } from '@/lib/utils'

export interface DataTableColumn<T> {
  key: string
  label: string
  render?: (item: T, index: number) => ReactNode
  className?: string
  headerClassName?: string
  sortable?: boolean
  accessorFn?: (row: T) => any
  enableSorting?: boolean
  enableColumnFilter?: boolean
}

interface DataTableProps<T> {
  data: T[]
  columns: DataTableColumn<T>[]
  loading?: boolean
  emptyMessage?: string
  pageSize?: number
  showPagination?: boolean
  className?: string
  rowClassName?: (item: T, index: number) => string
  onRowClick?: (item: T) => void
  enableSorting?: boolean
  enableFiltering?: boolean
}

export function DataTable<T extends { id?: number | string }>({
  data,
  columns,
  loading = false,
  emptyMessage = 'No hay datos para mostrar',
  pageSize = 10,
  showPagination = true,
  className,
  rowClassName,
  onRowClick,
  enableSorting = true,
  enableFiltering = false,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  // Convertir DataTableColumn a ColumnDef de TanStack Table
  const tableColumns = useMemo<ColumnDef<T>[]>(() => {
    return columns.map((col) => ({
      id: col.key,
      accessorKey: col.key,
      accessorFn: col.accessorFn,
      header: ({ column }) => {
        const isSortable = enableSorting && (col.sortable !== false)
        const sortDirection = column.getIsSorted()
        
        return (
          <div
            className={cn(
              'flex items-center gap-2',
              isSortable && 'cursor-pointer select-none hover:text-gray-900 dark:hover:text-gray-100',
              col.headerClassName
            )}
            onClick={() => {
              if (isSortable) {
                column.toggleSorting(column.getIsSorted() === 'asc')
              }
            }}
          >
            <span>{col.label}</span>
            {isSortable && (
              <span className="text-gray-400 dark:text-gray-400">
                {sortDirection === 'asc' ? (
                  <ArrowUp className="w-3 h-3" />
                ) : sortDirection === 'desc' ? (
                  <ArrowDown className="w-3 h-3" />
                ) : (
                  <ArrowUpDown className="w-3 h-3" />
                )}
              </span>
            )}
          </div>
        )
      },
      cell: ({ row, getValue }) => {
        const item = row.original
        const index = row.index
        return col.render ? (
          col.render(item, index)
        ) : (
          <span>{getValue() as ReactNode}</span>
        )
      },
      enableSorting: enableSorting && (col.sortable !== false),
      enableColumnFilter: enableFiltering && col.enableColumnFilter !== false,
    }))
  }, [columns, enableSorting, enableFiltering])

  const table = useReactTable({
    data,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: {
      pagination: {
        pageSize,
      },
    },
    state: {
      sorting,
      columnFilters,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    manualPagination: false,
    enableSorting,
    enableColumnResizing: false,
  })

  const totalPages = table.getPageCount()

  if (loading) {
    return (
      <div className="w-full">
        <div className="card overflow-hidden">
          <div className="p-16 text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-200 dark:border-gray-700 border-t-primary-600 dark:border-t-primary-400"></div>
            <p className="mt-6 text-sm font-medium text-gray-600 dark:text-gray-300">Cargando datos...</p>
          </div>
        </div>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="w-full">
        <div className="card overflow-hidden">
          <div className="p-16 text-center">
            <div className="text-gray-300 dark:text-gray-700 mb-4">
              <svg className="mx-auto h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
              </svg>
            </div>
            <p className="text-gray-600 dark:text-gray-300 font-medium text-base">{emptyMessage}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('w-full', className)}>
      <div className="overflow-hidden border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800">
        <div className="w-full overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-full border border-gray-300 dark:border-gray-600">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="bg-gray-200 dark:bg-gray-700 border-b-2 border-gray-400 dark:border-gray-500">
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className={cn(
                        'px-3 py-2.5 text-left text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600',
                        'bg-gray-200 dark:bg-gray-700',
                        columns.find(c => c.key === header.id)?.headerClassName
                      )}
                      style={{
                        width: header.getSize() !== 150 ? header.getSize() : undefined,
                      }}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row, rowIndex) => {
                const globalIndex = showPagination
                  ? table.getState().pagination.pageIndex * pageSize + rowIndex
                  : rowIndex
                const item = row.original
                const isEven = rowIndex % 2 === 0

                return (
                  <tr
                    key={row.id}
                    onClick={() => onRowClick?.(item)}
                    className={cn(
                      'border-b border-gray-300 dark:border-gray-600',
                      isEven 
                        ? 'bg-white dark:bg-gray-800' 
                        : 'bg-gray-50 dark:bg-gray-800/70',
                      'hover:bg-blue-50 dark:hover:bg-blue-900/10',
                      rowClassName?.(item, globalIndex),
                      onRowClick && 'cursor-pointer'
                    )}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const column = columns.find(c => c.key === cell.column.id)
                      return (
                        <td
                          key={cell.id}
                        className={cn(
                          'px-3 py-2 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600',
                          column?.className
                        )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>

        {showPagination && totalPages > 1 && (
          <div className="bg-gradient-to-r from-gray-50/80 to-gray-100/80 dark:from-gray-900/80 dark:via-gray-800/80 dark:to-gray-900/80 backdrop-blur-sm border-t-2 border-gray-200/80 dark:border-gray-700/80 px-6 py-4 flex items-center justify-between shadow-inner">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-700 dark:text-gray-300 font-medium">
                Mostrando{' '}
                <span className="font-bold text-primary-600 dark:text-primary-400">
                  {table.getState().pagination.pageIndex * pageSize + 1}
                </span>{' '}
                a{' '}
                <span className="font-bold text-primary-600 dark:text-primary-400">
                  {Math.min(
                    (table.getState().pagination.pageIndex + 1) * pageSize,
                    data.length
                  )}
                </span>{' '}
                de{' '}
                <span className="font-bold text-primary-600 dark:text-primary-400">
                  {data.length}
                </span>{' '}
                registros
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
                className="px-3 py-2 rounded-lg font-semibold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/80 dark:hover:bg-gray-700/80 backdrop-blur-sm transition-all"
                title="Primera página"
              >
                <ChevronsLeft className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="px-3 py-2 rounded-lg font-semibold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/80 dark:hover:bg-gray-700/80 backdrop-blur-sm transition-all"
                title="Página anterior"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <div className="px-4 py-2 bg-white/80 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg border border-gray-200/80 dark:border-gray-700/80 shadow-sm">
                <span className="text-sm font-bold text-gray-800 dark:text-gray-200">
                  Página{' '}
                  <span className="text-primary-600 dark:text-primary-400">
                    {table.getState().pagination.pageIndex + 1}
                  </span>{' '}
                  de{' '}
                  <span className="text-primary-600 dark:text-primary-400">{totalPages}</span>
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="px-3 py-2 rounded-lg font-semibold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/80 dark:hover:bg-gray-700/80 backdrop-blur-sm transition-all"
                title="Página siguiente"
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
                className="px-3 py-2 rounded-lg font-semibold disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/80 dark:hover:bg-gray-700/80 backdrop-blur-sm transition-all"
                title="Última página"
              >
                <ChevronsRight className="w-5 h-5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}