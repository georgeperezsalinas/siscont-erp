import { SelectHTMLAttributes, forwardRef, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { AlertCircle, ChevronDown } from 'lucide-react'

interface SelectOption {
  value: string | number
  label: string
  disabled?: boolean
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string
  error?: string
  success?: boolean
  helperText?: string
  options: SelectOption[]
  placeholder?: string
  leftIcon?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ 
    label, 
    error, 
    success, 
    helperText, 
    options,
    placeholder,
    leftIcon,
    size = 'md',
    fullWidth = true,
    className,
    ...props 
  }, ref) => {
    const sizes = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2.5 text-sm',
      lg: 'px-5 py-3 text-base',
    }

    const baseStyles = 'w-full border-2 rounded-xl transition-all duration-200 outline-none focus:ring-2 focus:ring-offset-0 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 appearance-none cursor-pointer'

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
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 z-10 pointer-events-none">
              {leftIcon}
            </div>
          )}
          
          <select
            ref={ref}
            className={cn(
              baseStyles,
              sizes[size],
              stateStyles,
              leftIcon && 'pl-10',
              'pr-10',
              className
            )}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                {option.label}
              </option>
            ))}
          </select>
          
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none z-10 flex items-center gap-2">
            {error && (
              <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400" />
            )}
            <ChevronDown className="w-5 h-5 text-gray-400 dark:text-gray-500" />
          </div>
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

Select.displayName = 'Select'

