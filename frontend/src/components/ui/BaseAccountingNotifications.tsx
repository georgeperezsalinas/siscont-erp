import React, { useState, useEffect } from 'react'
import { Alert, AlertTitle, AlertDescription } from './Alert'
import { Badge } from './Badge'
import { Button } from './Button'
import { AlertCircle, AlertTriangle, Info, CheckCircle, Loader2, X } from 'lucide-react'
import { API_BASE } from '@/api'

interface BaseCheck {
  code: string
  entry_type: string
  message: string
  severity: 'INFO' | 'WARNING' | 'ERROR'
  description: string
  suggested_glosa: string
  suggested_accounts: Array<{
    code: string
    name: string
    side: 'debit' | 'credit'
    suggested_amount?: number | null
  }>
  action: {
    label: string
    url: string
    entry_type: string
  }
  period_id?: number
  company_id?: number
}

interface BaseAccountingNotificationsProps {
  companyId: number
  periodId?: number
  onCreateEntry?: (check: BaseCheck) => void
  onChecksLoaded?: (count: number) => void
  className?: string
}

export function BaseAccountingNotifications({
  companyId,
  periodId,
  onCreateEntry,
  onChecksLoaded,
  className
}: BaseAccountingNotificationsProps) {
  const [checks, setChecks] = useState<BaseCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadChecks()
  }, [companyId, periodId])

  const loadChecks = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const params = new URLSearchParams()
      params.set('company_id', companyId.toString())
      if (periodId) {
        params.set('period_id', periodId.toString())
      }
      
      const response = await fetch(`${API_BASE}/accounting/base-checks?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('siscont_token')}`,
        },
      })
      
      if (!response.ok) {
        throw new Error('Error al cargar verificaciones')
      }
      
      const data = await response.json()
      setChecks(data)
      if (onChecksLoaded) {
        // Contar solo checks pendientes (WARNING y ERROR), no INFO
        const pendingCount = data.filter((check: BaseCheck) => 
          check.severity === 'WARNING' || check.severity === 'ERROR'
        ).length
        onChecksLoaded(pendingCount)
      }
    } catch (err: any) {
      setError(err.message || 'Error al cargar verificaciones')
      if (onChecksLoaded) {
        onChecksLoaded(0)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleCreateEntry = (check: BaseCheck) => {
    if (onCreateEntry) {
      onCreateEntry(check)
    } else {
      // Navegar a la URL de creación
      window.location.href = check.action.url
    }
  }

  const getSeverityIcon = (severity: string, message?: string) => {
    // Si el mensaje comienza con ✅, usar CheckCircle verde
    if (message && message.startsWith('✅')) {
      return <CheckCircle className="h-4 w-4 text-green-500" />
    }
    
    switch (severity) {
      case 'ERROR':
        return <AlertCircle className="h-4 w-4 text-red-500" />
      case 'WARNING':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />
      case 'INFO':
        return <Info className="h-4 w-4 text-blue-500" />
      default:
        return <Info className="h-4 w-4 text-gray-500" />
    }
  }

  const getSeverityVariant = (severity: string): 'error' | 'warning' | 'info' => {
    switch (severity) {
      case 'ERROR':
        return 'error'
      case 'WARNING':
        return 'warning'
      case 'INFO':
        return 'info'
      default:
        return 'info'
    }
  }

  if (loading) {
    return (
      <div className={`p-4 ${className || ''}`}>
        <div className="flex items-center gap-2 text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Verificando asientos base...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="error" className={className}>
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (checks.length === 0) {
    return (
      <div className={`p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800 ${className || ''}`}>
        <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
          <CheckCircle className="h-4 w-4" />
          <span className="text-sm font-medium">Todos los asientos base están registrados</span>
        </div>
      </div>
    )
  }

  // Filtrar checks: mostrar solo WARNING y ERROR como pendientes
  // Los INFO se muestran pero no se cuentan como pendientes
  const pendingChecks = checks.filter(check => 
    check.severity === 'WARNING' || check.severity === 'ERROR'
  )
  const infoChecks = checks.filter(check => check.severity === 'INFO')

  return (
    <div className={`space-y-3 ${className || ''}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Asientos Base Pendientes
        </h3>
        {pendingChecks.length > 0 && (
          <Badge variant="warning">
            {pendingChecks.length} {pendingChecks.length === 1 ? 'pendiente' : 'pendientes'}
          </Badge>
        )}
        {pendingChecks.length === 0 && infoChecks.length > 0 && (
          <Badge variant="info">
            {infoChecks.length} {infoChecks.length === 1 ? 'verificado' : 'verificados'}
          </Badge>
        )}
        {pendingChecks.length === 0 && infoChecks.length === 0 && (
          <Badge variant="success">
            Todo correcto
          </Badge>
        )}
      </div>
      
      {/* Mostrar primero los pendientes (WARNING y ERROR) */}
      {pendingChecks.map((check) => (
        <Alert key={check.code} variant={getSeverityVariant(check.severity)}>
          <div className="flex items-start gap-3">
            {getSeverityIcon(check.severity, check.message)}
            <div className="flex-1">
              <AlertTitle className="flex items-center gap-2">
                {check.message}
                <Badge variant={check.severity === 'ERROR' ? 'error' : check.severity === 'WARNING' ? 'warning' : 'info'}>
                  {check.severity}
                </Badge>
              </AlertTitle>
              <AlertDescription className="mt-2">
                <p className="text-sm mb-3">{check.description}</p>
                
                {check.suggested_accounts.length > 0 && (
                  <div className="mt-3 p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                    <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                      Cuentas sugeridas:
                    </div>
                    <div className="space-y-1">
                      {check.suggested_accounts.map((acc, idx) => (
                        <div key={idx} className="text-xs text-gray-700 dark:text-gray-300">
                          <span className="font-mono">{acc.code}</span> - {acc.name}
                          {acc.suggested_amount !== null && acc.suggested_amount !== undefined && (
                            <span className="ml-2 text-gray-500">
                              (Sugerido: {acc.suggested_amount.toLocaleString('es-PE', { style: 'currency', currency: 'PEN' })})
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Solo mostrar botón si no es INFO o si tiene cuentas sugeridas (requiere acción) */}
                {check.severity !== 'INFO' || check.suggested_accounts.length > 0 ? (
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleCreateEntry(check)}
                      className="text-xs"
                    >
                      {check.action.label}
                    </Button>
                  </div>
                ) : null}
              </AlertDescription>
            </div>
          </div>
        </Alert>
      ))}
      
      {/* Mostrar después los verificados (INFO) con estilo diferente */}
      {infoChecks.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
            Verificaciones Exitosas
          </div>
          {infoChecks.map((check) => (
            <Alert key={check.code} variant={getSeverityVariant(check.severity)}>
              <div className="flex items-start gap-3">
                {getSeverityIcon(check.severity, check.message)}
                <div className="flex-1">
                  <AlertTitle className="flex items-center gap-2">
                    {check.message}
                    <Badge variant={check.severity === 'ERROR' ? 'error' : check.severity === 'WARNING' ? 'warning' : 'info'}>
                      {check.severity}
                    </Badge>
                  </AlertTitle>
                  <AlertDescription className="mt-2">
                    <p className="text-sm whitespace-pre-line">{check.description}</p>
                  </AlertDescription>
                </div>
              </div>
            </Alert>
          ))}
        </div>
      )}
    </div>
  )
}

