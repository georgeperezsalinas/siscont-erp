import { TextareaHTMLAttributes, forwardRef, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { AlertCircle } from 'lucide-react'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  success?: boolean
  helperText?: string
  leftIcon?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
  rows?: number
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ 
    label, 
    error, 
    success, 
    helperText, 
    leftIcon,
    size = 'md',
    fullWidth = true,
    rows = 4,
    className,
    ...props 
  }, ref) => {
    const sizes = {
      sm: 'px-3 py-2 text-sm',
      md: 'px-4 py-3 text-sm',
      lg: 'px-5 py-4 text-base',
    }

    const baseStyles = 'w-full border-2 rounded-xl transition-all duration-200 outline-none focus:ring-2 focus:ring-offset-0 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 resize-y'

    const stateStyles = error
      ? 'border-red-500 dark:border-red-600 focus:border-red-500 focus:ring-red-500/50'
      : success
      ? 'border-emerald-500 dark:border-emerald-600 focus:border-emerald-500 focus:ring-emerald-500/50'
      : 'border-gray-300 dark:border-gray-600 focus:border-primary-500 dark:focus:border-primary-500 focus:ring-primary-500/50'

    return (
      <div className={cn('space-y-1.5', fullWidth && 'w-full')}>
        {label && (
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-3 text-gray-400 dark:text-gray-500 z-10">
              {leftIcon}
            </div>
          )}
          
          <textarea
            ref={ref}
            rows={rows}
            className={cn(
              baseStyles,
              sizes[size],
              stateStyles,
              leftIcon && 'pl-10',
              className
            )}
            {...props}
          />
          
          {error && (
            <div className="absolute right-3 top-3 z-10">
              <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400" />
            </div>
          )}
        </div>
        
        {(error || helperText) && (
          <div className="flex items-start gap-1.5">
            {error && (
              <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 mt-0.5 flex-shrink-0" />
            )}
            <p className={cn(
              'text-xs',
              error 
                ? 'text-red-600 dark:text-red-400' 
                : 'text-gray-500 dark:text-gray-400'
            )}>
              {error || helperText}
            </p>
          </div>
        )}
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'

