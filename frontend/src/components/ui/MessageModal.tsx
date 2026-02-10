import React from 'react'
import { Button } from './Button'
import { CheckCircle, AlertCircle, AlertTriangle, X } from 'lucide-react'

export type MessageType = 'success' | 'error' | 'info' | 'warning'

export interface MessageModalProps {
  isOpen: boolean
  onClose: () => void
  type: MessageType
  title: string
  message: string
  confirmText?: string
  onConfirm?: () => void
  cancelText?: string
  showCancel?: boolean
}

export function MessageModal({
  isOpen,
  onClose,
  type,
  title,
  message,
  confirmText = 'Aceptar',
  onConfirm,
  cancelText = 'Cancelar',
  showCancel = false,
}: MessageModalProps) {
  if (!isOpen) return null

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm()
    }
    onClose()
  }

  const getIcon = () => {
    const iconClass = `w-6 h-6 flex-shrink-0 ${
      type === 'success' 
        ? 'text-green-600 dark:text-green-400' 
        : type === 'error'
        ? 'text-red-600 dark:text-red-400'
        : type === 'warning'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-blue-600 dark:text-blue-400'
    }`
    
    switch (type) {
      case 'success':
        return <CheckCircle className={iconClass} />
      case 'error':
        return <AlertCircle className={iconClass} />
      case 'warning':
        return <AlertTriangle className={iconClass} />
      default:
        return <AlertTriangle className={iconClass} />
    }
  }

  const getBorderColor = () => {
    switch (type) {
      case 'success':
        return 'border-green-200 dark:border-green-800'
      case 'error':
        return 'border-red-200 dark:border-red-800'
      case 'warning':
        return 'border-amber-200 dark:border-amber-800'
      default:
        return 'border-blue-200 dark:border-blue-800'
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className={`relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6 border-2 ${getBorderColor()}`}>
        <div className="flex items-start gap-3 mb-4">
          {getIcon()}
          <div className="flex-1">
            <div className="text-lg font-bold mb-2 text-gray-900 dark:text-gray-100">
              {title}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="text-sm whitespace-pre-line mb-4 text-gray-700 dark:text-gray-300">
          {message}
        </div>
        <div className="flex justify-end gap-2">
          {showCancel && (
            <Button
              variant="outline"
              onClick={onClose}
            >
              {cancelText}
            </Button>
          )}
          <Button
            variant={showCancel ? 'outline' : 'default'}
            onClick={handleConfirm}
            className={
              type === 'error' 
                ? 'bg-red-600 hover:bg-red-700 text-white' 
                : type === 'warning'
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : type === 'success'
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : ''
            }
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  )
}

