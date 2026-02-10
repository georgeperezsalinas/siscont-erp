import { useState, useEffect } from 'react'
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
  title?: string
}

let toastListeners: ((toasts: Toast[]) => void)[] = []
let toasts: Toast[] = []

function notifyListeners() {
  toastListeners.forEach(listener => listener([...toasts]))
}

export function showToast(type: ToastType, message: string, title?: string) {
  const id = Math.random().toString(36).substring(7)
  toasts.push({ id, type, message, title })
  notifyListeners()
  
  // Auto-remover después de 5 segundos
  setTimeout(() => {
    toasts = toasts.filter(t => t.id !== id)
    notifyListeners()
  }, 5000)
}

export function ToastContainer() {
  const [toastList, setToastList] = useState<Toast[]>([])

  useEffect(() => {
    const listener = (newToasts: Toast[]) => {
      setToastList(newToasts)
    }
    toastListeners.push(listener)
    setToastList([...toasts])
    
    return () => {
      toastListeners = toastListeners.filter(l => l !== listener)
    }
  }, [])

  function removeToast(id: string) {
    toasts = toasts.filter(t => t.id !== id)
    notifyListeners()
  }

  if (toastList.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toastList.map((toast) => {
        const config = {
          success: {
            icon: CheckCircle,
            bg: 'bg-green-50 dark:bg-green-900/20',
            border: 'border-green-200 dark:border-green-800',
            iconColor: 'text-green-600 dark:text-green-400',
            textColor: 'text-green-800 dark:text-green-200',
          },
          error: {
            icon: AlertCircle,
            bg: 'bg-red-50 dark:bg-red-900/20',
            border: 'border-red-200 dark:border-red-800',
            iconColor: 'text-red-600 dark:text-red-400',
            textColor: 'text-red-800 dark:text-red-200',
          },
          warning: {
            icon: AlertTriangle,
            bg: 'bg-amber-50 dark:bg-amber-900/20',
            border: 'border-amber-200 dark:border-amber-800',
            iconColor: 'text-amber-600 dark:text-amber-400',
            textColor: 'text-amber-800 dark:text-amber-200',
          },
          info: {
            icon: Info,
            bg: 'bg-blue-50 dark:bg-blue-900/20',
            border: 'border-blue-200 dark:border-blue-800',
            iconColor: 'text-blue-600 dark:text-blue-400',
            textColor: 'text-blue-800 dark:text-blue-200',
          },
        }[toast.type]

        const Icon = config.icon

        return (
          <div
            key={toast.id}
            className={cn(
              'min-w-[320px] max-w-md p-4 rounded-lg shadow-lg border-2',
              'flex items-start gap-3 animate-slide-in-right',
              config.bg,
              config.border
            )}
          >
            <Icon className={cn('w-5 h-5 flex-shrink-0 mt-0.5', config.iconColor)} />
            <div className="flex-1 min-w-0">
              {toast.title && (
                <div className={cn('font-semibold text-sm mb-1', config.textColor)}>
                  {toast.title}
                </div>
              )}
              <div className={cn('text-sm', config.textColor)}>
                {toast.message}
              </div>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className={cn('text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0', config.iconColor)}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

