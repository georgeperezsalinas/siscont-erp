import { User, Calendar, Shield, RotateCcw, FileText, AlertTriangle, CheckCircle } from 'lucide-react'
import { Tabs, TabsList, TabsTriggerWithValue, TabsContentWithValue } from './Tabs'
import { Badge } from './Badge'
import { Alert, AlertTitle, AlertDescription } from './Alert'
import { formatDate } from '@/lib/utils'

interface TraceabilityData {
  created_by_id?: number
  created_by_name?: string
  created_at?: string
  updated_by_id?: number
  updated_by_name?: string
  updated_at?: string
  posted_by_id?: number
  posted_by_name?: string
  posted_at?: string
  reversed_entry_id?: number
  reversed_by_id?: number
  reversed_by_name?: string
  reversed_at?: string
  integrity_hash?: string
  warning_confirmations?: any
}

interface ValidationData {
  warnings?: Array<{ message: string }>
  errors?: Array<{ message: string }>
}

interface EngineLogData {
  engine_run_id?: string
  engine_started_at?: string
  evento_tipo?: string
  warnings?: Array<{ ts?: string; action?: string; details?: any }>
  errors?: Array<{ ts?: string; action?: string; details?: any }>
  steps?: Array<{ ts?: string; level?: string; action?: string; details?: any }>
}

interface LogData {
  engine_log?: EngineLogData
  motor_metadata?: { engine_log?: EngineLogData }
}

interface TraceabilityPanelProps {
  entry: {
    id: number
    date: string
    glosa: string
    status: string
    origin: string
    correlative?: string
    lines?: any[]
    total_debit?: number
    total_credit?: number
  } & TraceabilityData & ValidationData & LogData
  onViewReversedEntry?: (entryId: number) => void
  onVerifyIntegrity?: (entryId: number) => Promise<{ isValid: boolean }>
}

export function TraceabilityPanel({ entry, onViewReversedEntry, onVerifyIntegrity }: TraceabilityPanelProps) {
  const [activeTab, setActiveTab] = React.useState('detail')
  const [integrityVerified, setIntegrityVerified] = React.useState<boolean | null>(null)
  const [verifying, setVerifying] = React.useState(false)

  // engine_log puede venir en entry.engine_log o en entry.motor_metadata.engine_log
  const engineLog = (entry as any).engine_log ?? (entry as any).motor_metadata?.engine_log

  const handleVerifyIntegrity = async () => {
    if (!onVerifyIntegrity || !entry.integrity_hash) return
    setVerifying(true)
    try {
      const result = await onVerifyIntegrity(entry.id)
      setIntegrityVerified(result.isValid)
    } catch (err) {
      console.error('Error verificando integridad:', err)
    } finally {
      setVerifying(false)
    }
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTriggerWithValue value="detail" activeValue={activeTab} onValueChange={setActiveTab}>
          <FileText className="h-4 w-4 mr-2" />
          Detalle
        </TabsTriggerWithValue>
        <TabsTriggerWithValue value="traceability" activeValue={activeTab} onValueChange={setActiveTab}>
          <User className="h-4 w-4 mr-2" />
          Trazabilidad
        </TabsTriggerWithValue>
        <TabsTriggerWithValue value="validation" activeValue={activeTab} onValueChange={setActiveTab}>
          <Shield className="h-4 w-4 mr-2" />
          Validaciones
          {((entry.warnings?.length || 0) > 0 || (entry.errors?.length || 0) > 0) && (
            <Badge variant="warning" className="ml-2">
              {(entry.warnings?.length || 0) + (entry.errors?.length || 0)}
            </Badge>
          )}
        </TabsTriggerWithValue>
        <TabsTriggerWithValue value="log" activeValue={activeTab} onValueChange={setActiveTab}>
          <FileText className="h-4 w-4 mr-2" />
          Log del Motor
          {engineLog && (
            <Badge variant="info" className="ml-2">Disponible</Badge>
          )}
        </TabsTriggerWithValue>
      </TabsList>

      {/* Tab: Detalle */}
      <TabsContentWithValue value="detail" activeValue={activeTab} className="mt-4">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Número de Asiento</label>
              <div className="mt-1 text-lg font-bold font-mono">{entry.correlative || `#${entry.id}`}</div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Fecha</label>
              <div className="mt-1 text-base">{formatDate(entry.date)}</div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Estado</label>
              <div className="mt-1">
                <Badge variant={entry.status === 'POSTED' ? 'success' : entry.status === 'DRAFT' ? 'warning' : 'error'}>
                  {entry.status}
                </Badge>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Origen</label>
              <div className="mt-1">
                <Badge variant="outline">{entry.origin}</Badge>
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Glosa</label>
            <div className="mt-1 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border">
              {entry.glosa || '(Sin descripción)'}
            </div>
          </div>
          {entry.lines && entry.lines.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2 block">
                Resumen ({entry.lines.length} líneas)
              </label>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs text-gray-600 dark:text-gray-400">Total Debe:</span>
                    <div className="text-lg font-bold text-green-700 dark:text-green-400">
                      {entry.total_debit?.toLocaleString('es-PE', { style: 'currency', currency: 'PEN' }) || '0.00'}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-gray-600 dark:text-gray-400">Total Haber:</span>
                    <div className="text-lg font-bold text-blue-700 dark:text-blue-400">
                      {entry.total_credit?.toLocaleString('es-PE', { style: 'currency', currency: 'PEN' }) || '0.00'}
                    </div>
                  </div>
                </div>
                {Math.abs((entry.total_debit || 0) - (entry.total_credit || 0)) < 0.01 ? (
                  <div className="mt-2 flex items-center gap-2 text-green-600 dark:text-green-400">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-sm font-medium">Balanceado</span>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center gap-2 text-red-600 dark:text-red-400">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm font-medium">No balanceado</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </TabsContentWithValue>

      {/* Tab: Trazabilidad */}
      <TabsContentWithValue value="traceability" activeValue={activeTab} className="mt-4">
        <div className="space-y-4">
          {/* Creado por */}
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border">
            <div className="flex items-center gap-2 mb-2">
              <User className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              <span className="text-sm font-semibold">Creado por</span>
            </div>
            <div className="text-sm text-gray-700 dark:text-gray-300">
              {entry.created_by_name || (entry.created_by_id ? `Usuario ID: ${entry.created_by_id}` : 'No registrado')}
            </div>
            {entry.created_at && (
              <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <Calendar className="h-3 w-3" />
                {new Date(entry.created_at).toLocaleString('es-PE')}
              </div>
            )}
          </div>

          {/* Modificado por */}
          {entry.updated_by_id && (
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border">
              <div className="flex items-center gap-2 mb-2">
                <User className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                <span className="text-sm font-semibold">Modificado por</span>
              </div>
              <div className="text-sm text-gray-700 dark:text-gray-300">
                {entry.updated_by_name || `Usuario ID: ${entry.updated_by_id}`}
              </div>
              {entry.updated_at && (
                <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <Calendar className="h-3 w-3" />
                  {new Date(entry.updated_at).toLocaleString('es-PE')}
                </div>
              )}
            </div>
          )}

          {/* Posteado por */}
          {entry.posted_by_id && (
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="text-sm font-semibold text-green-900 dark:text-green-100">Posteado por</span>
              </div>
              <div className="text-sm text-green-800 dark:text-green-200">
                {entry.posted_by_name || `Usuario ID: ${entry.posted_by_id}`}
              </div>
              {entry.posted_at && (
                <div className="mt-1 flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
                  <Calendar className="h-3 w-3" />
                  {new Date(entry.posted_at).toLocaleString('es-PE')}
                </div>
              )}
            </div>
          )}

          {/* Reversión */}
          {entry.reversed_entry_id && (
            <Alert variant="error">
              <RotateCcw className="h-4 w-4" />
              <AlertTitle>Asiento Revertido</AlertTitle>
              <AlertDescription>
                Este asiento revierte el asiento #{entry.reversed_entry_id}
                {onViewReversedEntry && (
                  <button
                    onClick={() => onViewReversedEntry(entry.reversed_entry_id!)}
                    className="ml-2 text-blue-600 hover:underline"
                  >
                    Ver asiento original
                  </button>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Hash de Integridad */}
          {entry.integrity_hash && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-semibold text-blue-900 dark:text-blue-100">Hash de Integridad</span>
                </div>
                {onVerifyIntegrity && (
                  <button
                    onClick={handleVerifyIntegrity}
                    disabled={verifying}
                    className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {verifying ? 'Verificando...' : 'Verificar'}
                  </button>
                )}
              </div>
              <div className="text-xs font-mono text-blue-800 dark:text-blue-200 break-all">
                {entry.integrity_hash}
              </div>
              {integrityVerified !== null && (
                <div className={`mt-2 flex items-center gap-2 text-xs ${
                  integrityVerified ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {integrityVerified ? (
                    <>
                      <CheckCircle className="h-3 w-3" />
                      <span>Integridad verificada</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-3 w-3" />
                      <span>Integridad comprometida</span>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </TabsContentWithValue>

      {/* Tab: Validaciones */}
      <TabsContentWithValue value="validation" activeValue={activeTab} className="mt-4">
        <div className="space-y-4">
          {entry.errors && entry.errors.length > 0 && (
            <Alert variant="error">
              <AlertTitle>Errores de Validación</AlertTitle>
              <AlertDescription>
                <ul className="list-disc list-inside space-y-1">
                  {entry.errors.map((error, idx) => (
                    <li key={idx}>{error.message}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {entry.warnings && entry.warnings.length > 0 && (
            <Alert variant="warning">
              <AlertTitle>Advertencias</AlertTitle>
              <AlertDescription>
                <ul className="list-disc list-inside space-y-1">
                  {entry.warnings.map((warning, idx) => (
                    <li key={idx}>{warning.message}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {(!entry.errors || entry.errors.length === 0) && (!entry.warnings || entry.warnings.length === 0) && (
            <Alert variant="success">
              <CheckCircle className="h-4 w-4" />
              <AlertTitle>Sin problemas de validación</AlertTitle>
              <AlertDescription>
                El asiento cumple con todas las validaciones configuradas.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </TabsContentWithValue>

      {/* Tab: Log del Motor */}
      <TabsContentWithValue value="log" activeValue={activeTab} className="mt-4">
        {engineLog ? (
          <div className="space-y-4">
            <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
              <div className="text-sm font-semibold text-purple-900 dark:text-purple-100 mb-2">
                Información del Motor
              </div>
              <div className="space-y-1 text-xs text-purple-800 dark:text-purple-200">
                {engineLog.engine_run_id && (
                  <div>ID de Ejecución: <span className="font-mono">{engineLog.engine_run_id}</span></div>
                )}
                {engineLog.evento_tipo && (
                  <div>Tipo de Evento: <span className="font-semibold">{engineLog.evento_tipo}</span></div>
                )}
                {engineLog.engine_started_at && (
                  <div>Iniciado: {new Date(engineLog.engine_started_at).toLocaleString('es-PE')}</div>
                )}
              </div>
            </div>

            {engineLog.errors && engineLog.errors.length > 0 && (
              <Alert variant="error">
                <AlertTitle>Errores del Motor ({engineLog.errors.length})</AlertTitle>
                <AlertDescription>
                  <div className="space-y-2">
                    {engineLog.errors.map((error, idx) => (
                      <div key={idx} className="text-sm">
                        <div className="font-medium">{error.action}</div>
                        {error.details && (
                          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            {JSON.stringify(error.details, null, 2)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {engineLog.warnings && engineLog.warnings.length > 0 && (
              <Alert variant="warning">
                <AlertTitle>Advertencias del Motor ({engineLog.warnings.length})</AlertTitle>
                <AlertDescription>
                  <div className="space-y-2">
                    {engineLog.warnings.map((warning, idx) => (
                      <div key={idx} className="text-sm">
                        <div className="font-medium">{warning.action}</div>
                        {warning.details && (
                          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            {JSON.stringify(warning.details, null, 2)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {engineLog.steps && engineLog.steps.length > 0 && (
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border">
                <div className="text-sm font-semibold mb-2">Pasos de Ejecución</div>
                <div className="space-y-2">
                  {engineLog.steps.map((step, idx) => (
                    <div key={idx} className="text-xs border-l-2 border-gray-300 dark:border-gray-600 pl-3">
                      <div className="font-medium">{step.action}</div>
                      {step.level && (
                        <Badge variant={step.level === 'ERROR' ? 'error' : step.level === 'WARNING' ? 'warning' : 'info'} className="mt-1">
                          {step.level}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <Alert variant="info">
            <AlertTitle>Sin log disponible</AlertTitle>
            <AlertDescription>
              Este asiento no tiene log del motor de asientos disponible.
            </AlertDescription>
          </Alert>
        )}
      </TabsContentWithValue>
    </Tabs>
  )
}

import React from 'react'

