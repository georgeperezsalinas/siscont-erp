import { useState, useEffect } from 'react'
import { Button } from './Button'
import { Input } from './Input'
import { Select } from './Select'
import { X, DollarSign, CreditCard, CalendarDays, Info, FileText, CheckCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { PaymentMethod, getDetractionsAvailable } from '@/api'

interface IGVPaymentModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (data: {
    payment_date: string
    amount: number
    payment_method: PaymentMethod
    payment_reference?: string
    notes?: string
    period_reference?: string
    use_detractions?: boolean
    detraction_amount?: number
  }) => void
  igvPorPagar: number
  currentPeriod: string
  loading: boolean
  companyId: number
}

export function IGVPaymentModal({
  isOpen,
  onClose,
  onConfirm,
  igvPorPagar,
  currentPeriod,
  loading,
  companyId,
}: IGVPaymentModalProps) {
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [amount, setAmount] = useState<string>(igvPorPagar.toFixed(2))
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.TRANSFERENCIA)
  const [paymentReference, setPaymentReference] = useState('')
  const [notes, setNotes] = useState('')
  const [periodReference, setPeriodReference] = useState(currentPeriod)
  const [error, setError] = useState<string | null>(null)
  const [useDetractions, setUseDetractions] = useState(false)
  const [detractionAmount, setDetractionAmount] = useState<string>('')
  const [detractionsAvailable, setDetractionsAvailable] = useState(0)
  const [loadingDetractions, setLoadingDetractions] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setAmount(igvPorPagar.toFixed(2))
      setPaymentDate(new Date().toISOString().split('T')[0])
      setPaymentMethod(PaymentMethod.TRANSFERENCIA)
      setPaymentReference('')
      setNotes('')
      setPeriodReference(currentPeriod)
      setError(null)
      setUseDetractions(false)
      setDetractionAmount('')
      loadDetractionsAvailable()
    }
  }, [isOpen, igvPorPagar, currentPeriod, companyId])

  async function loadDetractionsAvailable() {
    try {
      setLoadingDetractions(true)
      const result = await getDetractionsAvailable({
        company_id: companyId,
        period: currentPeriod
      })
      setDetractionsAvailable(result.detracciones_disponibles)
    } catch (err) {
      console.error('Error cargando detracciones disponibles:', err)
      setDetractionsAvailable(0)
    } finally {
      setLoadingDetractions(false)
    }
  }

  const handleConfirm = () => {
    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('El monto debe ser un número positivo.')
      return
    }
    if (parsedAmount > igvPorPagar + 0.01) { // Small tolerance for floating point
      setError(`El monto excede el IGV por pagar (${formatCurrency(igvPorPagar)}).`)
      return
    }

    // Validar detracciones si se usan
    if (useDetractions) {
      const parsedDetractionAmount = parseFloat(detractionAmount)
      if (isNaN(parsedDetractionAmount) || parsedDetractionAmount <= 0) {
        setError('El monto de detracciones debe ser un número positivo.')
        return
      }
      if (parsedDetractionAmount > detractionsAvailable + 0.01) {
        setError(`El monto de detracciones excede las disponibles (${formatCurrency(detractionsAvailable)}).`)
        return
      }
      if (parsedDetractionAmount > parsedAmount + 0.01) {
        setError('El monto de detracciones no puede exceder el monto total del pago.')
        return
      }
    }

    setError(null)
    onConfirm({
      payment_date: paymentDate,
      amount: parsedAmount,
      payment_method: paymentMethod,
      payment_reference: paymentReference || undefined,
      notes: notes || undefined,
      period_reference: periodReference || undefined,
      use_detractions: useDetractions || undefined,
      detraction_amount: useDetractions ? parseFloat(detractionAmount) : undefined,
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-600 to-amber-700 text-white p-6 rounded-t-2xl sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="w-6 h-6" />
              <h2 className="text-xl font-bold">Registrar Pago de IGV</h2>
            </div>
            <button onClick={onClose} className="text-white hover:text-gray-200">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <div className="flex justify-between items-center text-lg font-bold text-amber-700 dark:text-amber-400">
              <span>IGV por Pagar:</span>
              <span>{formatCurrency(igvPorPagar)}</span>
            </div>
            <p className="text-sm text-amber-600 dark:text-amber-500 mt-2">
              Este es el monto acumulado de IGV que debe pagarse a SUNAT
            </p>
          </div>

          {error && (
            <div className="bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 px-4 py-3 rounded-lg flex items-center gap-2">
              <Info className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <Input
            label="Fecha de Pago"
            type="date"
            value={paymentDate}
            onChange={e => setPaymentDate(e.target.value)}
            required
            leftIcon={<CalendarDays className="w-5 h-5" />}
          />

          <Input
            label="Monto a Pagar"
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            required
            leftIcon={<DollarSign className="w-5 h-5" />}
            error={error}
          />

          <Input
            label="Período de Referencia"
            type="text"
            value={periodReference}
            onChange={e => setPeriodReference(e.target.value)}
            placeholder="Ej: 2025-01"
            leftIcon={<CalendarDays className="w-5 h-5" />}
            helpText="Período al que corresponde este pago de IGV"
          />

          <Select
            label="Método de Pago"
            value={paymentMethod}
            onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
            required
            leftIcon={<CreditCard className="w-5 h-5" />}
            options={Object.values(PaymentMethod).map(method => ({
              value: method,
              label: method.charAt(0).toUpperCase() + method.slice(1).toLowerCase().replace('_', ' ')
            }))}
          />

          <Input
            label="Referencia de Pago (Opcional)"
            value={paymentReference}
            onChange={e => setPaymentReference(e.target.value)}
            placeholder="Ej: Nro. Operación, Nro. Voucher SUNAT"
            leftIcon={<Info className="w-5 h-5" />}
          />

          <Input
            label="Observaciones (Opcional)"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Notas adicionales sobre el pago"
            leftIcon={<Info className="w-5 h-5" />}
          />

          {/* Opción de usar detracciones */}
          {detractionsAvailable > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  <label className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Usar Detracciones para Pagar IGV
                  </label>
                </div>
                <input
                  type="checkbox"
                  checked={useDetractions}
                  onChange={e => {
                    setUseDetractions(e.target.checked)
                    if (e.target.checked) {
                      // Pre-llenar con el mínimo entre IGV por pagar y detracciones disponibles
                      const currentAmount = parseFloat(amount) || 0
                      const maxDetraction = Math.min(currentAmount, detractionsAvailable)
                      setDetractionAmount(maxDetraction.toFixed(2))
                    } else {
                      setDetractionAmount('')
                    }
                  }}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                />
              </div>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Detracciones disponibles: <span className="font-bold">{formatCurrency(detractionsAvailable)}</span>
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Las detracciones son retenciones que hacen tus clientes (como el Estado) y pueden usarse para pagar el IGV a SUNAT.
              </p>
              {useDetractions && (
                <Input
                  label="Monto de Detracciones a Usar"
                  type="number"
                  inputMode="decimal"
                  value={detractionAmount}
                  onChange={e => setDetractionAmount(e.target.value)}
                  placeholder="0.00"
                  leftIcon={<DollarSign className="w-5 h-5" />}
                  helpText={`Máximo: ${formatCurrency(Math.min(parseFloat(amount) || 0, detractionsAvailable))}`}
                />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-6 bg-gray-50 dark:bg-gray-700/50 rounded-b-2xl border-t border-gray-200 dark:border-gray-700">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={loading} loading={loading}>
            Registrar Pago
          </Button>
        </div>
      </div>
    </div>
  )
}

