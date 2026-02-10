import { InputHTMLAttributes, forwardRef, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  error?: string
  success?: boolean
  helperText?: string
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ 
    label, 
    error, 
    success, 
    helperText, 
    leftIcon, 
    rightIcon,
    size = 'md',
    fullWidth = true,
    className,
    type,
    ...props 
  }, ref) => {
    const [showPassword, setShowPassword] = useState(false)
    const isPassword = type === 'password'
    const inputType = isPassword && showPassword ? 'text' : type

    const sizes = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2.5 text-sm',
      lg: 'px-5 py-3 text-base',
    }

    const baseStyles = 'w-full border-2 rounded-xl transition-all duration-200 outline-none focus:ring-2 focus:ring-offset-0 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500'

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
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 z-10">
              {leftIcon}
            </div>
          )}
          
          <input
            ref={ref}
            type={inputType}
            className={cn(
              baseStyles,
              sizes[size],
              stateStyles,
              leftIcon && 'pl-10',
              (rightIcon || isPassword) && 'pr-10',
              className
            )}
            {...props}
          />
          
          {(rightIcon || isPassword) && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2 z-10">
              {error && (
                <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400" />
              )}
              {success && !error && (
                <CheckCircle className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
              )}
              {isPassword && (
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              )}
              {rightIcon && !isPassword && rightIcon}
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

Input.displayName = 'Input'

