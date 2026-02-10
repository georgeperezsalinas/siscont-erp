import { ReactNode, useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Info } from 'lucide-react'

interface TooltipProps {
  children: ReactNode
  content: ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
  delay?: number
  className?: string
}

export function Tooltip({ 
  children, 
  content, 
  position = 'top',
  delay = 200,
  className 
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const timeoutRef = useRef<NodeJS.Timeout>()

  const updatePosition = () => {
    if (!triggerRef.current || !tooltipRef.current) return

    const triggerRect = triggerRef.current.getBoundingClientRect()
    const tooltipRect = tooltipRef.current.getBoundingClientRect()
    const gap = 8

    let top = 0
    let left = 0

    switch (position) {
      case 'top':
        top = triggerRect.top - tooltipRect.height - gap
        left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2
        break
      case 'bottom':
        top = triggerRect.bottom + gap
        left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2
        break
      case 'left':
        top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2
        left = triggerRect.left - tooltipRect.width - gap
        break
      case 'right':
        top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2
        left = triggerRect.right + gap
        break
    }

    setTooltipPosition({ top, left })
  }

  const showTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true)
      setTimeout(updatePosition, 10)
    }, delay)
  }

  const hideTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setIsVisible(false)
  }

  useEffect(() => {
    if (isVisible) {
      updatePosition()
      window.addEventListener('scroll', updatePosition)
      window.addEventListener('resize', updatePosition)
      return () => {
        window.removeEventListener('scroll', updatePosition)
        window.removeEventListener('resize', updatePosition)
      }
    }
  }, [isVisible, position])

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        className="inline-block"
      >
        {children}
      </div>
      
      {isVisible && (
        <div
          ref={tooltipRef}
          className={cn(
            'fixed z-50 px-3 py-2 text-sm text-white bg-gray-900 dark:bg-gray-800 rounded-lg shadow-xl pointer-events-none',
            'animate-fade-in',
            className
          )}
          style={{
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
          }}
        >
          {content}
          <div
            className={cn(
              'absolute w-2 h-2 bg-gray-900 dark:bg-gray-800 rotate-45',
              position === 'top' && 'bottom-[-4px] left-1/2 -translate-x-1/2',
              position === 'bottom' && 'top-[-4px] left-1/2 -translate-x-1/2',
              position === 'left' && 'right-[-4px] top-1/2 -translate-y-1/2',
              position === 'right' && 'left-[-4px] top-1/2 -translate-y-1/2'
            )}
          />
        </div>
      )}
    </>
  )
}

interface InfoTooltipProps {
  content: ReactNode
  className?: string
}

export function InfoTooltip({ content, className }: InfoTooltipProps) {
  return (
    <Tooltip content={content} className={className}>
      <button
        type="button"
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
      >
        <Info className="w-3 h-3" />
      </button>
    </Tooltip>
  )
}

