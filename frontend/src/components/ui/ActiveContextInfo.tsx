import React from 'react'
import { Building2, Calendar, AlertCircle, CheckCircle, Lock, Unlock } from 'lucide-react'
import { Badge } from './Badge'
import { Tooltip } from './Tooltip'

interface ActiveContextInfoProps {
  companyId: number | null
  companyName?: string | null
  period: string | null // Formato: "YYYY-MM"
  periodStatus?: 'ABIERTO' | 'CERRADO' | 'REABIERTO' | null
  periodYear?: number | null
  periodMonth?: number | null
  onCompanyClick?: () => void
  onPeriodClick?: () => void
  className?: string
}

export function ActiveContextInfo({
  companyId,
  companyName,
  period,
  periodStatus,
  periodYear,
  periodMonth,
  onCompanyClick,
  onPeriodClick,
  className
}: ActiveContextInfoProps) {
  const hasCompany = companyId !== null && companyId > 0
  const hasPeriod = period !== null && period !== ''
  
  const periodDisplay = periodYear && periodMonth 
    ? `${periodYear}-${String(periodMonth).padStart(2, '0')}`
    : period || 'No seleccionado'

  const getPeriodStatusBadge = () => {
    if (!periodStatus) return null
    
    const statusConfig = {
      'CERRADO': { 
        variant: 'error' as const, 
        icon: Lock, 
        label: 'CERRADO',
        tooltip: 'Este período está cerrado. No se pueden crear nuevos asientos.'
      },
      'REABIERTO': { 
        variant: 'warning' as const, 
        icon: Unlock, 
        label: 'REABIERTO',
        tooltip: 'Este período fue reabierto. Se pueden crear asientos con precaución.'
      },
      'ABIERTO': { 
        variant: 'success' as const, 
        icon: CheckCircle, 
        label: 'ABIERTO',
        tooltip: 'Este período está abierto. Se pueden crear y modificar asientos.'
      }
    }
    
    const config = statusConfig[periodStatus]
    if (!config) return null
    
    const Icon = config.icon
    
    return (
      <Tooltip content={config.tooltip}>
        <Badge variant={config.variant} className="text-xs flex items-center gap-1">
          <Icon className="w-3 h-3" />
          {config.label}
        </Badge>
      </Tooltip>
    )
  }

  return (
    <div className={`bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-4 ${className || ''}`}>
      <div className="flex items-center justify-between gap-4">
        {/* Empresa */}
        <div className="flex items-center gap-3 flex-1">
          <div className={`p-2 rounded-lg ${hasCompany ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-red-100 dark:bg-red-900/40'}`}>
            <Building2 className={`w-5 h-5 ${hasCompany ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">
              Empresa Activa
            </div>
            {hasCompany ? (
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-gray-900 dark:text-gray-100 truncate">
                  {companyName || `Empresa #${companyId}`}
                </span>
                {onCompanyClick && (
                  <button
                    onClick={onCompanyClick}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline"
                  >
                    Cambiar
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                <span className="text-sm font-semibold text-red-700 dark:text-red-300">
                  No hay empresa seleccionada
                </span>
                {onCompanyClick && (
                  <button
                    onClick={onCompanyClick}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline font-semibold"
                  >
                    Seleccionar empresa
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Separador */}
        <div className="w-px h-12 bg-gray-300 dark:bg-gray-600" />

        {/* Período */}
        <div className="flex items-center gap-3 flex-1">
          <div className={`p-2 rounded-lg ${hasPeriod ? 'bg-indigo-100 dark:bg-indigo-900/40' : 'bg-red-100 dark:bg-red-900/40'}`}>
            <Calendar className={`w-5 h-5 ${hasPeriod ? 'text-indigo-600 dark:text-indigo-400' : 'text-red-600 dark:text-red-400'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">
              Período Activo
            </div>
            {hasPeriod ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base font-bold text-gray-900 dark:text-gray-100">
                  {periodDisplay}
                </span>
                {getPeriodStatusBadge()}
                {onPeriodClick && (
                  <button
                    onClick={onPeriodClick}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 underline"
                  >
                    Cambiar
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                <span className="text-sm font-semibold text-red-700 dark:text-red-300">
                  No hay período seleccionado
                </span>
                {onPeriodClick && (
                  <button
                    onClick={onPeriodClick}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 underline font-semibold"
                  >
                    Seleccionar período
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Advertencia si falta alguno */}
      {(!hasCompany || !hasPeriod) && (
        <div className="mt-3 pt-3 border-t border-red-200 dark:border-red-800">
          <div className="flex items-start gap-2 text-sm text-red-700 dark:text-red-300">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <strong>Acción requerida:</strong> {!hasCompany && !hasPeriod 
                ? 'Debes seleccionar una empresa y un período para trabajar con asientos contables.'
                : !hasCompany 
                ? 'Debes seleccionar una empresa para continuar.'
                : 'Debes seleccionar un período contable para continuar.'
              }
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

