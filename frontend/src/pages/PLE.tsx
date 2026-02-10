import { useState, useEffect } from 'react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { ActionBar } from '@/components/ui/ActionBar'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { Table, TableHeader, TableHeaderCell, TableBody, TableRow, TableCell } from '@/components/ui/Table'
import { Download, FileSpreadsheet, Calendar, AlertCircle, CheckCircle, Loader2 } from 'lucide-react'
import { useOrg } from '@/stores/org'
import { MessageModal } from '@/components/ui/MessageModal'
import {
  getPLELibroDiario,
  getPLELibroMayor,
  getPLEPlanCuentas,
  getPLERegistroCompras,
  getPLERegistroVentas,
  getPLECajaBancos,
  getPLEInventariosBalances,
  downloadPLELibroDiario,
  downloadPLELibroMayor,
  downloadPLEPlanCuentas,
  downloadPLERegistroCompras,
  downloadPLERegistroVentas,
  downloadPLECajaBancos,
  downloadPLEInventariosBalances,
  type PLEData
} from '@/api'

type PLEBook = 'diario' | 'mayor' | 'plan-cuentas' | 'compras' | 'ventas' | 'caja-bancos' | 'inventarios-balances'

export default function PLE() {
  const { empresaId, periodo } = useOrg()
  const [selectedPeriod, setSelectedPeriod] = useState(periodo)
  const [selectedBook, setSelectedBook] = useState<PLEBook | null>(null)
  const [loading, setLoading] = useState(false)
  const [pleData, setPleData] = useState<PLEData | null>(null)
  const [messageModal, setMessageModal] = useState<{ type: 'success' | 'error'; title: string; message: string } | null>(null)

  function showMessage(type: 'success' | 'error', title: string, message: string) {
    setMessageModal({ type, title, message })
  }

  const loadPLEBook = async (book: PLEBook) => {
    if (!empresaId || !selectedPeriod) {
      showMessage('error', 'Faltan Datos', 'Debe seleccionar empresa y período')
      return
    }

    setSelectedBook(book)
    setLoading(true)
    try {
      let data: PLEData
      switch (book) {
        case 'diario':
          data = await getPLELibroDiario({ company_id: empresaId, period: selectedPeriod })
          break
        case 'mayor':
          data = await getPLELibroMayor({ company_id: empresaId, period: selectedPeriod })
          break
        case 'plan-cuentas':
          data = await getPLEPlanCuentas({ company_id: empresaId, period: selectedPeriod })
          break
        case 'compras':
          data = await getPLERegistroCompras({ company_id: empresaId, period: selectedPeriod })
          break
        case 'ventas':
          data = await getPLERegistroVentas({ company_id: empresaId, period: selectedPeriod })
          break
        case 'caja-bancos':
          data = await getPLECajaBancos({ company_id: empresaId, period: selectedPeriod })
          break
        case 'inventarios-balances':
          data = await getPLEInventariosBalances({ company_id: empresaId, period: selectedPeriod })
          break
      }
      setPleData(data)
    } catch (error: any) {
      console.error('Error cargando PLE:', error)
      showMessage('error', 'Error al Cargar', `Error al cargar ${book}: ${error.message || 'Error desconocido'}`)
      setPleData(null)
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = async (book: PLEBook) => {
    if (!empresaId || !selectedPeriod) return

    setLoading(true)
    try {
      let blob: Blob
      let filename: string
      switch (book) {
        case 'diario':
          blob = await downloadPLELibroDiario({ company_id: empresaId, period: selectedPeriod })
          filename = `LE${empresaId}${selectedPeriod.replace('-', '')}0501000000000.txt`
          break
        case 'mayor':
          blob = await downloadPLELibroMayor({ company_id: empresaId, period: selectedPeriod })
          filename = `LE${empresaId}${selectedPeriod.replace('-', '')}0502000000000.txt`
          break
        case 'plan-cuentas':
          blob = await downloadPLEPlanCuentas({ company_id: empresaId, period: selectedPeriod })
          filename = `LE${empresaId}${selectedPeriod.replace('-', '')}0503000000000.txt`
          break
        case 'compras':
          blob = await downloadPLERegistroCompras({ company_id: empresaId, period: selectedPeriod })
          filename = `LE${empresaId}${selectedPeriod.replace('-', '')}0801000000000.txt`
          break
        case 'ventas':
          blob = await downloadPLERegistroVentas({ company_id: empresaId, period: selectedPeriod })
          filename = `LE${empresaId}${selectedPeriod.replace('-', '')}1401000000000.txt`
          break
        case 'caja-bancos':
          blob = await downloadPLECajaBancos({ company_id: empresaId, period: selectedPeriod })
          filename = `LE${empresaId}${selectedPeriod.replace('-', '')}0101000000000.txt`
          break
        case 'inventarios-balances':
          blob = await downloadPLEInventariosBalances({ company_id: empresaId, period: selectedPeriod })
          filename = `LE${empresaId}${selectedPeriod.replace('-', '')}0301000000000.txt`
          break
      }
      
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      
      showMessage('success', 'Descarga Exitosa', `Archivo ${book} descargado correctamente`)
    } catch (error: any) {
      showMessage('error', 'Error al Descargar', `Error al descargar ${book}: ${error.message || 'Error desconocido'}`)
    } finally {
      setLoading(false)
    }
  }

  const books = [
    {
      id: 'diario' as PLEBook,
      code: '5.1',
      name: 'Libro Diario',
      description: 'Registro cronológico de todos los asientos contables del período.',
      color: 'blue'
    },
    {
      id: 'mayor' as PLEBook,
      code: '5.2',
      name: 'Libro Mayor',
      description: 'Resumen de movimientos por cuenta durante el período fiscal.',
      color: 'amber'
    },
    {
      id: 'plan-cuentas' as PLEBook,
      code: '5.3',
      name: 'Plan de Cuentas',
      description: 'Catálogo de cuentas utilizado durante el ejercicio económico.',
      color: 'emerald'
    },
    {
      id: 'compras' as PLEBook,
      code: '8.1',
      name: 'Registro de Compras',
      description: 'Registro de todas las compras con IGV del período.',
      color: 'green'
    },
    {
      id: 'ventas' as PLEBook,
      code: '14.1',
      name: 'Registro de Ventas e Ingresos',
      description: 'Registro de todas las ventas con IGV del período.',
      color: 'green'
    },
    {
      id: 'caja-bancos' as PLEBook,
      code: '1.1',
      name: 'Libro Caja y Bancos',
      description: 'Control de movimientos de efectivo y cuentas bancarias.',
      color: 'cyan'
    },
    {
      id: 'inventarios-balances' as PLEBook,
      code: '3.1',
      name: 'Libro de Inventarios y Balances',
      description: 'Estado financiero al cierre del ejercicio económico.',
      color: 'purple'
    }
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumbs */}
      <Breadcrumbs />

      {/* Page Header */}
      <PageHeader
        title="PLE - Libros Electrónicos"
        subtitle="Genera libros electrónicos para SUNAT"
        icon={FileSpreadsheet}
        iconColor="primary"
        actions={
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <input
              type="month"
              className="border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 text-sm font-medium bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
            />
          </div>
        }
      />

      {/* PLE Books Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {books.map(book => {
          const colorClasses: Record<string, string> = {
            blue: 'bg-blue-100 text-blue-600',
            amber: 'bg-amber-100 text-amber-600',
            emerald: 'bg-emerald-100 text-emerald-600',
            green: 'bg-green-100 text-green-600',
            purple: 'bg-purple-100 text-purple-600',
            cyan: 'bg-cyan-100 text-cyan-600'
          }
          
          return (
            <Card key={book.id} className="hover:shadow-lg transition-shadow">
              <div className="p-6">
                <div className={`w-12 h-12 rounded-xl ${colorClasses[book.color] || colorClasses.blue} flex items-center justify-center mb-4`}>
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-lg">{book.name}</h3>
                  <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">{book.code}</span>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  {book.description}
                </p>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => loadPLEBook(book.id)}
                    disabled={loading}
                  >
                    {loading && selectedBook === book.id ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Cargando...
                      </>
                    ) : (
                      'Ver Datos'
                    )}
                  </Button>
                  <Button 
                    size="sm"
                    onClick={() => handleDownload(book.id)}
                    disabled={loading}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Descargar TXT
                  </Button>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* PLE Data Display */}
      {pleData && selectedBook && (
        <Card>
          <CardHeader 
            title={`${pleData.nombre}${pleData.registros > 0 ? ` (${pleData.registros} registro${pleData.registros !== 1 ? 's' : ''})` : ''}`}
            subtitle={`Período: ${pleData.periodo}`}
            icon={<FileSpreadsheet className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
            actions={
              <Button onClick={() => handleDownload(selectedBook)} disabled={loading}>
                <Download className="w-4 h-4" />
                Descargar TXT
              </Button>
            }
          />
          {pleData.rows.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <AlertCircle className="w-16 h-16 mx-auto mb-4 text-gray-400" />
              <p className="font-medium">No hay registros para este período</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-200 dark:bg-gray-700 border-b-2 border-gray-400 dark:border-gray-500">
                    {pleData.rows[0]?.map((_, colIdx) => (
                      <th key={colIdx} className="px-3 py-2.5 text-left text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700">
                        Col {colIdx + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pleData.rows.slice(0, 100).map((row, rowIdx) => (
                    <tr key={rowIdx} className={`${rowIdx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/70'} border-b border-gray-300 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-blue-900/10`}>
                      {row.map((cell, colIdx) => (
                        <td key={colIdx} className="px-3 py-2 text-xs font-mono text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {pleData.rows.length > 100 && (
                <div className="mt-4 text-center text-sm text-gray-500">
                  Mostrando primeros 100 de {pleData.rows.length} registros. 
                  Descarga el archivo completo para ver todos los registros.
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Info Card */}
      <Card className="bg-amber-50 border-amber-200">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-amber-100 text-amber-600">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-amber-900 mb-1">Formato PLE</div>
            <p className="text-sm text-amber-700">
              Los archivos PLE generados siguen el formato especificado por la SUNAT (delimitador |, formato TXT).
              Pueden ser importados directamente en el portal de la SUNAT para su presentación.
              Los nombres de archivo siguen la nomenclatura: LE[RUCEmpresa][Período][CódigoLibro][Correlativo].txt
            </p>
          </div>
        </div>
      </Card>

      {/* Modal de Mensajes */}
      {messageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setMessageModal(null)}></div>
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className={`flex items-center gap-3 mb-4 ${messageModal.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {messageModal.type === 'success' ? (
                <CheckCircle className="w-8 h-8" />
              ) : (
                <AlertCircle className="w-8 h-8" />
              )}
              <div className="text-xl font-bold">{messageModal.title}</div>
            </div>
            <div className="text-sm text-gray-700 whitespace-pre-line mb-6">
              {messageModal.message}
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setMessageModal(null)}>
                {messageModal.type === 'success' ? 'Aceptar' : 'Cerrar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
