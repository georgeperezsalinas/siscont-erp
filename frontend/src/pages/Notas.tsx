import { useState, useEffect } from 'react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { formatCurrency, formatDate } from '@/lib/utils'
import { FileText, Plus, Eye, Search } from 'lucide-react'
import { 
  registrarNotaCreditoVenta, registrarNotaDebitoVenta,
  registrarNotaCreditoCompra, registrarNotaDebitoCompra,
  getNota,
  type NotaDocumentoOut, type NotaCreditoVentaIn, type NotaDebitoVentaIn,
  type NotaCreditoCompraIn, type NotaDebitoCompraIn
} from '@/api'
import { useOrg } from '@/stores/org'
import { useAuth } from '@/stores/auth'

// Motivos según SUNAT
const MOTIVOS_NOTA_CREDITO = [
  { value: 'ANULACION_OPERACION', label: 'Anulación de la operación' },
  { value: 'DEVOLUCION_TOTAL', label: 'Devolución total' },
  { value: 'DEVOLUCION_PARCIAL', label: 'Devolución parcial' },
  { value: 'DESCUENTO_POSTERIOR', label: 'Descuento posterior' },
  { value: 'ERROR_PRECIO', label: 'Error en el precio' },
  { value: 'ERROR_CANTIDAD', label: 'Error en la cantidad' }
]

const MOTIVOS_NOTA_DEBITO = [
  { value: 'INTERESES', label: 'Intereses' },
  { value: 'PENALIDADES', label: 'Penalidades' },
  { value: 'INCREMENTO_VALOR', label: 'Incremento de valor' },
  { value: 'GASTOS_ADICIONALES', label: 'Gastos adicionales' }
]

export default function Notas() {
  const { empresaId } = useOrg()
  const { user } = useAuth()
  const [notas, setNotas] = useState<NotaDocumentoOut[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [formType, setFormType] = useState<'NC_VENTA' | 'ND_VENTA' | 'NC_COMPRA' | 'ND_COMPRA' | null>(null)
  const [form, setForm] = useState({
    documento_id: 0,
    serie: '',
    numero: '',
    fecha_emision: new Date().toISOString().split('T')[0],
    motivo: '',
    monto_base: 0,
    glosa: ''
  })
  const [message, setMessage] = useState<{ type: 'success' | 'error'; title: string; content: string } | null>(null)

  if (!empresaId) {
    return (
      <Card className="p-6 text-center text-gray-600">
        Selecciona una empresa para continuar
      </Card>
    )
  }

  function openForm(type: 'NC_VENTA' | 'ND_VENTA' | 'NC_COMPRA' | 'ND_COMPRA', documento_id: number) {
    setFormType(type)
    setForm({
      documento_id,
      serie: '',
      numero: '',
      fecha_emision: new Date().toISOString().split('T')[0],
      motivo: '',
      monto_base: 0,
      glosa: ''
    })
    setShowForm(true)
  }

  async function saveNota() {
    if (!formType || !empresaId) return
    
    try {
      setLoading(true)
      
      if (formType === 'NC_VENTA') {
        await registrarNotaCreditoVenta({
          company_id: empresaId,
          venta_id: form.documento_id,
          serie: form.serie,
          numero: form.numero,
          fecha_emision: form.fecha_emision,
          motivo: form.motivo,
          monto_base: form.monto_base,
          glosa: form.glosa || undefined,
          usar_motor: true
        })
        setMessage({ type: 'success', title: 'Nota de Crédito Registrada', content: 'La nota de crédito ha sido registrada exitosamente y se ha generado el asiento contable automáticamente' })
      } else if (formType === 'ND_VENTA') {
        await registrarNotaDebitoVenta({
          company_id: empresaId,
          venta_id: form.documento_id,
          serie: form.serie,
          numero: form.numero,
          fecha_emision: form.fecha_emision,
          motivo: form.motivo,
          monto_base: form.monto_base,
          glosa: form.glosa || undefined,
          usar_motor: true
        })
        setMessage({ type: 'success', title: 'Nota de Débito Registrada', content: 'La nota de débito ha sido registrada exitosamente y se ha generado el asiento contable automáticamente' })
      } else if (formType === 'NC_COMPRA') {
        await registrarNotaCreditoCompra({
          company_id: empresaId,
          compra_id: form.documento_id,
          serie: form.serie,
          numero: form.numero,
          fecha_emision: form.fecha_emision,
          motivo: form.motivo,
          monto_base: form.monto_base,
          glosa: form.glosa || undefined,
          usar_motor: true
        })
        setMessage({ type: 'success', title: 'Nota de Crédito Registrada', content: 'La nota de crédito ha sido registrada exitosamente y se ha generado el asiento contable automáticamente' })
      } else if (formType === 'ND_COMPRA') {
        await registrarNotaDebitoCompra({
          company_id: empresaId,
          compra_id: form.documento_id,
          serie: form.serie,
          numero: form.numero,
          fecha_emision: form.fecha_emision,
          motivo: form.motivo,
          monto_base: form.monto_base,
          glosa: form.glosa || undefined,
          usar_motor: true
        })
        setMessage({ type: 'success', title: 'Nota de Débito Registrada', content: 'La nota de débito ha sido registrada exitosamente y se ha generado el asiento contable automáticamente' })
      }
      
      setShowForm(false)
      setTimeout(() => setMessage(null), 5000)
    } catch (error: any) {
      setMessage({ type: 'error', title: 'Error', content: error.message || 'Error al registrar la nota' })
      setTimeout(() => setMessage(null), 5000)
    } finally {
      setLoading(false)
    }
  }

  const motivos = formType?.startsWith('NC') ? MOTIVOS_NOTA_CREDITO : MOTIVOS_NOTA_DEBITO
  const tipoNota = formType?.includes('VENTA') ? 'VENTA' : 'COMPRA'
  const esCredito = formType?.startsWith('NC') || false

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[
        { label: 'Inicio', to: '/' },
        { label: 'Notas de Crédito y Débito' }
      ]} />

      <PageHeader
        title="Notas de Crédito y Débito"
        subtitle="Gestión de notas según normativa SUNAT"
        icon={FileText}
      />

      {message && (
        <Card className={`p-4 ${message.type === 'success' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className={`font-semibold ${message.type === 'success' ? 'text-green-800' : 'text-red-800'}`}>
            {message.title}
          </div>
          <div className={`text-sm ${message.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
            {message.content}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader 
          title="Instrucciones"
          icon={<FileText className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
        />
        <div className="p-6 space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <p>Las Notas de Crédito y Débito se crean desde los módulos de <strong>Ventas</strong> y <strong>Compras</strong>.</p>
          <p>Para crear una nota, ve al documento original (venta o compra) y usa la opción correspondiente.</p>
          <p className="mt-4 font-semibold text-gray-900 dark:text-gray-100">Características:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Generan nuevos asientos contables automáticamente</li>
            <li>Referencian obligatoriamente al documento original</li>
            <li>Pueden afectar inventario (según motivo)</li>
            <li>Respetan el período contable</li>
            <li>Cumplen con normativa SUNAT</li>
          </ul>
        </div>
      </Card>
    </div>
  )
}

