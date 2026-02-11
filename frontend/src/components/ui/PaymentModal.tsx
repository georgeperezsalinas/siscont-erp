import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { X, DollarSign, Calendar, FileText, CreditCard, Wallet } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { listBankAccounts, listAccounts, type BankAccount, type Account } from '@/api'
import { useOrg } from '@/stores/org'

interface PaymentModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (data: PaymentData) => Promise<void>
  type: 'COLLECTION' | 'PAYMENT'
  totalAmount: number
  saldoPendiente?: number
  title?: string
  documentNumber?: string
}

export interface PaymentData {
  payment_date: string
  amount: number
  cash_account_code?: string | null  // Opcional: el backend lo determinará automáticamente si no se envía
  payment_method: string
  payment_reference: string | null
  notes: string | null
}

export function PaymentModal({
  isOpen,
  onClose,
  onConfirm,
  type,
  totalAmount,
  saldoPendiente,
  title,
  documentNumber
}: PaymentModalProps) {
  const { empresaId } = useOrg()
  const [loading, setLoading] = useState(false)
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [formData, setFormData] = useState<PaymentData>({
    payment_date: new Date().toISOString().split('T')[0],
    amount: saldoPendiente || totalAmount,
    cash_account_code: null,  // El backend lo determinará automáticamente según el método de pago
    payment_method: 'EFECTIVO',
    payment_reference: null,
    notes: null
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (isOpen && saldoPendiente !== undefined) {
      setFormData(prev => ({
        ...prev,
        amount: saldoPendiente
      }))
    }
  }, [isOpen, saldoPendiente])

  useEffect(() => {
    if (isOpen && empresaId) {
      loadAccounts()
    }
  }, [isOpen, empresaId])

  async function loadAccounts() {
    if (!empresaId) return
    try {
      setLoadingAccounts(true)
      const [bankAccs, accs] = await Promise.all([
        listBankAccounts(empresaId),
        listAccounts(empresaId)
      ])
      setBankAccounts(bankAccs)
      // Filtrar solo cuentas bancarias (10.x) de nivel 2 o superior
      const bankAccsList = accs.filter(acc => 
        acc.code.startsWith('10') && 
        acc.level >= 2 && 
        acc.active
      )
      setAccounts(bankAccsList)
    } catch (err) {
      console.error('Error cargando cuentas:', err)
    } finally {
      setLoadingAccounts(false)
    }
  }

  // Filtrar cuentas según método de pago
  const getAvailableAccounts = (): Array<{ id: number; code: string; name: string }> => {
    const result: Array<{ id: number; code: string; name: string }> = []
    
    if (formData.payment_method === 'EFECTIVO' || formData.payment_method === 'YAPE' || formData.payment_method === 'PLIN') {
      // Para efectivo, mostrar cuentas de caja (10.1x)
      const cajaAccounts = accounts.filter(acc => acc.code.startsWith('10.1'))
      cajaAccounts.forEach(acc => {
        result.push({
          id: acc.id,
          code: acc.code,
          name: `${acc.code} - ${acc.name}`
        })
      })
      
      // Agregar cuentas bancarias configuradas que sean de caja
      bankAccounts.forEach(ba => {
        if (ba.account_code?.startsWith('10.1') && !result.find(r => r.code === ba.account_code)) {
          result.push({
            id: ba.account_id,
            code: ba.account_code,
            name: `${ba.bank_name} - ${ba.account_number} (${ba.account_code})`
          })
        }
      })
    } else {
      // Para transferencia/cheque/tarjeta, mostrar cuentas bancarias (10.2x o 10.1x si no hay 10.2x)
      const bankAccountsList = accounts.filter(acc => 
        acc.code.startsWith('10.2') || acc.code.startsWith('10.1')
      )
      bankAccountsList.forEach(acc => {
        result.push({
          id: acc.id,
          code: acc.code,
          name: `${acc.code} - ${acc.name}`
        })
      })
      
      // Agregar cuentas bancarias configuradas
      bankAccounts.forEach(ba => {
        if (ba.account_code && !result.find(r => r.code === ba.account_code)) {
          result.push({
            id: ba.account_id,
            code: ba.account_code,
            name: `${ba.bank_name} - ${ba.account_number} (${ba.account_code})`
          })
        }
      })
    }
    
    return result
  }

  const availableAccounts = getAvailableAccounts()

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})

    // Validaciones
    if (!formData.payment_date) {
      setErrors({ payment_date: 'La fecha es requerida' })
      return
    }

    if (!formData.amount || formData.amount <= 0) {
      setErrors({ amount: 'El monto debe ser mayor a 0' })
      return
    }

    if (saldoPendiente !== undefined && formData.amount > saldoPendiente) {
      setErrors({ amount: `El monto no puede exceder el saldo pendiente (${formatCurrency(saldoPendiente)})` })
      return
    }

    if (formData.amount > totalAmount) {
      setErrors({ amount: `El monto no puede exceder el total (${formatCurrency(totalAmount)})` })
      return
    }

    try {
      setLoading(true)
      await onConfirm(formData)
      // Reset form
      setFormData({
        payment_date: new Date().toISOString().split('T')[0],
        amount: saldoPendiente || totalAmount,
        cash_account_code: null,  // El backend lo determinará automáticamente según el método de pago
        payment_method: 'EFECTIVO',
        payment_reference: null,
        notes: null
      })
      onClose()
    } catch (err: any) {
      setErrors({ submit: err.message || 'Error al registrar el pago/cobro' })
    } finally {
      setLoading(false)
    }
  }

  const modalTitle = title || (type === 'COLLECTION' ? 'Registrar Cobro' : 'Registrar Pago')
  const isCollection = type === 'COLLECTION'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl">
        {/* Header */}
        <div className={`bg-gradient-to-r ${isCollection ? 'from-green-600 to-green-700' : 'from-blue-600 to-blue-700'} text-white p-6 rounded-t-2xl`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold">{modalTitle}</h2>
                {documentNumber && (
                  <p className="text-sm text-white/90 mt-1">Documento: {documentNumber}</p>
                )}
              </div>
            </div>
            <button onClick={onClose} className="text-white hover:text-gray-200">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 xspace-y-4">

          {/* Información del documento */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Total del documento:</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(totalAmount)}</span>
            </div>
            {saldoPendiente !== undefined && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Saldo pendiente:</span>
                <span className={`font-semibold ${saldoPendiente > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
                  {formatCurrency(saldoPendiente)}
                </span>
              </div>
            )}
          </div>

          {/* FORMULARIO EN DOS COLUMNAS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {/* Fecha */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                <Calendar className="w-4 h-4 inline mr-1" />
                Fecha <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.payment_date}
                onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
                className={`w-full border rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 ${
                  errors.payment_date ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                }`}
                required
              />
              {errors.payment_date && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.payment_date}</p>
              )}
            </div>


            {/* Monto */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                <DollarSign className="w-4 h-4 inline mr-1" />
                Monto <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={saldoPendiente !== undefined ? saldoPendiente : totalAmount}
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                className={`w-full border rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 ${
                  errors.amount ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                }`}
                placeholder="0.00"
                required
              />
              {errors.amount && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.amount}</p>
              )}
            </div>

            {/* Método de pago */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                <CreditCard className="w-4 h-4 inline mr-1" />
                Método de Pago
              </label>
              <select
                value={formData.payment_method}
                onChange={(e) => {
                  setFormData({ 
                    ...formData, 
                    payment_method: e.target.value,
                    cash_account_code: null // Reset cuenta al cambiar método
                  })
                }}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                <option value="EFECTIVO">Efectivo</option>
                <option value="TRANSFERENCIA">Transferencia Bancaria</option>
                <option value="CHEQUE">Cheque</option>
                <option value="TARJETA">Tarjeta de Crédito/Débito</option>
                <option value="YAPE">Yape</option>
                <option value="PLIN">Plin</option>
                <option value="OTRO">Otro</option>
              </select>
            </div>

            {/* Cuenta Bancaria/Caja */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                <Wallet className="w-4 h-4 inline mr-1" />
                Cuenta {formData.payment_method === 'EFECTIVO' || formData.payment_method === 'YAPE' || formData.payment_method === 'PLIN' ? 'de Caja' : 'Bancaria'} (Opcional)
              </label>
              {loadingAccounts ? (
                <div className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm bg-gray-50 dark:bg-gray-700 text-gray-500">
                  Cargando cuentas...
                </div>
              ) : (
                <select
                  value={formData.cash_account_code || ''}
                  onChange={(e) => setFormData({ ...formData, cash_account_code: e.target.value || null })}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  <option value="">Seleccionar automáticamente según método de pago</option>
                  {availableAccounts.map(acc => (
                    <option key={acc.id || acc.code} value={acc.code}>
                      {acc.name || `${acc.code} - ${acc.name}`}
                    </option>
                  ))}
                </select>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {formData.cash_account_code 
                  ? `Se usará la cuenta: ${formData.cash_account_code}`
                  : formData.payment_method === 'EFECTIVO' || formData.payment_method === 'YAPE' || formData.payment_method === 'PLIN'
                    ? 'Se seleccionará automáticamente una cuenta de caja (10.1x)'
                    : 'Se seleccionará automáticamente una cuenta bancaria (10.2x)'}
              </p>
            </div>

            {/* Referencia */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                <FileText className="w-4 h-4 inline mr-1" />
                Referencia (opcional)
              </label>
              <input
                type="text"
                value={formData.payment_reference || ''}
                onChange={(e) => setFormData({ ...formData, payment_reference: e.target.value || null })}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="Número de cheque, transferencia, etc."
              />
            </div>
            {/* Observaciones */}
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                Observaciones (opcional)
              </label>
              <textarea
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value || null })}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                rows={3}
                placeholder="Notas adicionales..."
              />
            </div>

            {/* Error general */}
            {errors.submit && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                <p className="text-sm text-red-600 dark:text-red-400">{errors.submit}</p>
              </div>
            )}
          </div>


          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button 
              type="submit" 
              variant={isCollection ? 'success' : 'primary'}
              disabled={loading}
            >
              {loading ? 'Registrando...' : (isCollection ? 'Registrar Cobro' : 'Registrar Pago')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

