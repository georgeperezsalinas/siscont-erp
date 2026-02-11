import { useState, useEffect, useMemo } from 'react'
import React from 'react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { PageHeader } from '@/components/ui/PageHeader'
import { ActionBar } from '@/components/ui/ActionBar'
import { FilterBar } from '@/components/ui/FilterBar'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { Table, TableHeader, TableHeaderCell, TableBody, TableRow, TableCell } from '@/components/ui/Table'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Search, Filter, Eye, Download, Calendar, FileText, FileSpreadsheet, Printer, BookOpen } from 'lucide-react'
import { listJournalEntries, getJournalEntry, listPeriods, type JournalEntry, type JournalEntryDetail } from '@/api'
import { useOrg } from '@/stores/org'
import { useAuth } from '@/stores/auth'
import { API_BASE } from '@/api'

export default function Diarios() {
  const { empresaId, periodo } = useOrg()
  const { user } = useAuth()
  const [entries, setEntries] = useState<(JournalEntry | JournalEntryDetail)[]>([])
  const [periods, setPeriods] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [viewingEntry, setViewingEntry] = useState<any>(null)
  const [exporting, setExporting] = useState(false)

  // Obtener el periodo actual seleccionado en el topbar
  const currentPeriod = useMemo(() => {
    if (!periodo || periods.length === 0) return null
    const [year, month] = periodo.split('-').map(Number)
    return periods.find((p: any) => p.year === year && p.month === month) || null
  }, [periodo, periods])

  useEffect(() => {
    loadPeriods()
  }, [empresaId])

  useEffect(() => {
    reload()
  }, [empresaId, periodo, currentPeriod?.id])

  async function loadPeriods() {
    try {
      const data = await listPeriods(empresaId)
      setPeriods(data)
    } catch (err: any) {
      console.error('Error cargando periodos:', err)
    }
  }

  async function exportToExcel() {
    try {
      setExporting(true)
      
      if (!currentPeriod) {
        alert('Debes seleccionar un período en la barra superior para exportar.')
        return
      }
      
      const params = new URLSearchParams()
      params.set('company_id', empresaId.toString())
      params.set('period_id', currentPeriod.id.toString())
      if (dateFilter) params.set('date_from', dateFilter)
      if (dateFilter) params.set('date_to', dateFilter)
      
      const token = localStorage.getItem('siscont_token')
      const apiUrl = API_BASE.replace('/api', '') || 'http://localhost:8000'
      const response = await fetch(`${apiUrl}/journal/entries/export/excel?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || 'Error al exportar')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `libro_diario_${periodo || 'periodo'}.xlsx`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err: any) {
      alert(`Error al exportar a Excel: ${err.message || err}`)
    } finally {
      setExporting(false)
    }
  }

  async function exportToPdf() {
    try {
      setExporting(true)
      
      if (!currentPeriod) {
        alert('Debes seleccionar un período en la barra superior para exportar.')
        return
      }
      
      const params = new URLSearchParams()
      params.set('company_id', empresaId.toString())
      params.set('period_id', currentPeriod.id.toString())
      if (dateFilter) params.set('date_from', dateFilter)
      if (dateFilter) params.set('date_to', dateFilter)
      
      const token = localStorage.getItem('siscont_token')
      const apiUrl = API_BASE.replace('/api', '') || 'http://localhost:8000'
      const response = await fetch(`${apiUrl}/journal/entries/export/pdf?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || 'Error al exportar')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `libro_diario_${periodo || 'periodo'}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err: any) {
      alert(`Error al exportar a PDF: ${err.message || err}`)
    } finally {
      setExporting(false)
    }
  }

  async function reload() {
    try {
      setLoading(true)
      
      // Usar period_id en lugar de fechas (más preciso)
      const params: any = {
        company_id: empresaId,
      }
      
      // SIEMPRE usar el periodo seleccionado en el topbar si está disponible
      if (currentPeriod) {
        params.period_id = currentPeriod.id
      } else {
        // Fallback: calcular fechas del periodo si no hay period_id
        const [year, month] = periodo.split('-').map(Number)
        // Calcular último día del mes correctamente
        const lastDay = new Date(year, month, 0).getDate()
        params.date_from = `${year}-${String(month).padStart(2, '0')}-01`
        params.date_to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      }
      
      // Incluir líneas para mostrar formato expandido
      params.include_lines = true
      
      const data = await listJournalEntries(params) as JournalEntryDetail[]
      // Ordenar por fecha y número de asiento (ID) para el libro diario
      data.sort((a, b) => {
        if (a.date !== b.date) {
          return a.date.localeCompare(b.date) // Ordenar por fecha ascendente
        }
        return a.id - b.id // Luego por ID ascendente
      })
      setEntries(data)
    } catch (err: any) {
      console.error('Error cargando diarios:', err)
      setEntries([])
    } finally {
      setLoading(false)
    }
  }

  async function openView(id: number) {
    try {
      const entry = await getJournalEntry(id)
      setViewingEntry(entry)
    } catch (err: any) {
      alert(`Error al cargar asiento: ${err.message || err}`)
    }
  }

  // Filtrar entradas y expandir en líneas individuales
  const journalLines = useMemo(() => {
    const lines: Array<{
      fecha: string
      asiento: number
      cuenta: string
      glosa: string
      debe: number
      haber: number
      origen: string
      entry: JournalEntryDetail
    }> = []
    
    entries.forEach(entry => {
      // Verificar si tiene líneas (es JournalEntryDetail)
      if ('lines' in entry && entry.lines) {
        const entryDetail = entry as JournalEntryDetail
        
        // Filtrar por búsqueda y fecha
        const matchesSearch = !searchTerm || 
          entryDetail.glosa.toLowerCase().includes(searchTerm.toLowerCase()) ||
          String(entryDetail.id).includes(searchTerm) ||
          entryDetail.lines.some(line => 
            line.account_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
            line.account_name.toLowerCase().includes(searchTerm.toLowerCase())
          )
        const matchesDate = !dateFilter || entryDetail.date === dateFilter
        
        if (matchesSearch && matchesDate) {
          // Agregar una línea por cada movimiento del asiento
          entryDetail.lines.forEach(line => {
            lines.push({
              fecha: entryDetail.date,
              asiento: entryDetail.id,
              cuenta: line.account_code,
              glosa: line.account_name,
              debe: line.debit,
              haber: line.credit,
              origen: entryDetail.origin || 'MANUAL',
              entry: entryDetail
            })
          })
        }
      }
    })
    
    return lines
  }, [entries, searchTerm, dateFilter])

  // Calcular totales
  const totalDebe = journalLines.reduce((sum, line) => sum + line.debe, 0)
  const totalHaber = journalLines.reduce((sum, line) => sum + line.haber, 0)
  
  // Agrupar por fecha
  const linesByDate = useMemo(() => {
    const grouped: Record<string, typeof journalLines> = {}
    journalLines.forEach(line => {
      if (!grouped[line.fecha]) {
        grouped[line.fecha] = []
      }
      grouped[line.fecha].push(line)
    })
    
    return { grouped, dates: Object.keys(grouped).sort() }
  }, [journalLines])

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumbs */}
      <Breadcrumbs />

      {/* Page Header */}
      <PageHeader
        title="Libro Diario"
        subtitle={`Asientos contables del periodo ${periodo}`}
        icon={BookOpen}
        iconColor="primary"
        actions={
          <ActionBar
            onRefresh={reload}
            loading={loading}
          >
            <Button 
              variant="outline" 
              onClick={exportToExcel}
              disabled={exporting || !currentPeriod}
            >
              <FileSpreadsheet className="w-4 h-4" />
              Excel
            </Button>
            <Button 
              variant="outline" 
              onClick={exportToPdf}
              disabled={exporting || !currentPeriod}
            >
              <FileText className="w-4 h-4" />
              PDF
            </Button>
            <Button 
              variant="outline" 
              onClick={() => window.print()}
              disabled={exporting || !currentPeriod}
            >
              <Printer className="w-4 h-4" />
              Imprimir
            </Button>
          </ActionBar>
        }
      />

      {/* Filter Bar */}
      <FilterBar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Buscar por glosa o ID..."
      >
        <input
          type="date"
          value={dateFilter}
          onChange={e => setDateFilter(e.target.value)}
          className="border-2 border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        />
      </FilterBar>

      {/* Libro Diario - Formato Tradicional */}
      <Card className="overflow-hidden">
        <CardHeader
          title={`LIBRO DIARIO${journalLines.length > 0 ? ` (${journalLines.length} movimiento${journalLines.length !== 1 ? 's' : ''})` : ''}`}
          subtitle={`Período: ${periodo} • Total Debe: ${formatCurrency(totalDebe)} • Total Haber: ${formatCurrency(totalHaber)} ${Math.abs(totalDebe - totalHaber) < 0.01 ? '✓ Cuadra' : '⚠ Desbalanceado'}`}
          icon={<BookOpen className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
        />
        {loading ? (
          <div className="p-8 text-center text-gray-500">Cargando...</div>
        ) : journalLines.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No hay asientos registrados para este periodo.</div>
        ) : (
          <div className="overflow-x-auto border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800">
            {/* Tabla estilo Excel - Libro Diario con formato expandido */}
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="bg-gray-200 dark:bg-gray-700 border-b-2 border-gray-400 dark:border-gray-500">
                  <th className="px-3 py-2.5 text-center text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600" style={{ width: '100px' }}>Fecha</th>
                  <th className="px-3 py-2.5 text-center text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600" style={{ width: '80px' }}>Asiento</th>
                  <th className="px-3 py-2.5 text-center text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600" style={{ width: '100px' }}>Cuenta</th>
                  <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600" style={{ minWidth: '300px' }}>Glosa</th>
                  <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600" style={{ width: '120px' }}>Debe</th>
                  <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600" style={{ width: '120px' }}>Haber</th>
                  <th className="px-3 py-2.5 text-center text-xs font-bold text-gray-900 dark:text-gray-100" style={{ width: '100px' }}>Origen</th>
                </tr>
              </thead>
              <tbody>
                {linesByDate.dates.map((date, dateIdx) => {
                  const dayLines = linesByDate.grouped[date]
                  const isFirstDay = dateIdx === 0
                  
                  return (
                    <React.Fragment key={date}>
                      {/* Líneas del día */}
                      {dayLines.map((line, lineIdx) => {
                        const isFirstLineOfDay = lineIdx === 0
                        const isFirstLineOfEntry = lineIdx === 0 || dayLines[lineIdx - 1].asiento !== line.asiento
                        // Calcular índice global para alternar colores
                        const globalIdx = linesByDate.dates.slice(0, dateIdx).reduce((sum, d) => sum + linesByDate.grouped[d].length, 0) + lineIdx
                        
                        return (
                          <tr 
                            key={`${line.entry.id}-${line.cuenta}-${lineIdx}`}
                            className={`
                              ${globalIdx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/70'}
                              ${isFirstDay && isFirstLineOfDay ? 'border-t-2 border-gray-400 dark:border-gray-500' : ''}
                              ${line.entry.status === 'VOIDED' ? 'bg-red-50/30 dark:bg-red-900/10 opacity-60' : ''}
                              border-b border-gray-300 dark:border-gray-600
                              hover:bg-blue-50 dark:hover:bg-blue-900/10
                            `}
                          >
                            <td className="px-3 py-2 text-center text-sm text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">
                              {isFirstLineOfDay ? formatDate(line.fecha) : ''}
                            </td>
                            <td className="px-3 py-2 text-center font-mono text-sm font-semibold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">
                              {isFirstLineOfEntry ? (
                                line.entry.correlative ? (
                                  <span className="font-bold text-primary-600 dark:text-primary-400">{line.entry.correlative}</span>
                                ) : (
                                  `#${line.asiento}`
                                )
                              ) : ''}
                            </td>
                            <td className="px-3 py-2 text-center font-mono text-sm font-semibold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">
                              {line.cuenta}
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">
                              {line.glosa}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-green-700 dark:text-green-400 border-r border-gray-300 dark:border-gray-600">
                              {line.debe > 0 ? formatCurrency(line.debe) : '-'}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-blue-700 dark:text-blue-400 border-r border-gray-300 dark:border-gray-600">
                              {line.haber > 0 ? formatCurrency(line.haber) : '-'}
                            </td>
                            <td className="px-3 py-2 text-center text-sm text-gray-700 dark:text-gray-300">
                              {isFirstLineOfEntry ? (
                                line.origen === 'MOTOR' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-700">
                                    ✓ MOTOR
                                  </span>
                                ) : line.origen === 'LEGACY' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-700">
                                    ⚠ LEGACY
                                  </span>
                                ) : (
                                  <span className="text-xs font-medium">{line.origen || 'MANUAL'}</span>
                                )
                              ) : ''}
                            </td>
                          </tr>
                        )
                      })}
                    </React.Fragment>
                  )
                })}
                
                {/* Total General */}
                <tr className="bg-gray-300 dark:bg-gray-600 border-t-4 border-gray-500 dark:border-gray-400 font-bold">
                  <td colSpan={4} className="px-3 py-3 text-right pr-4 text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">
                    TOTAL GENERAL DEL PERÍODO
                    {Math.abs(totalDebe - totalHaber) < 0.01 ? (
                      <span className="ml-2 text-green-600 dark:text-green-400">✓ CUADRA</span>
                    ) : (
                      <span className="ml-2 text-red-600 dark:text-red-400">⚠ DESBALANCEADO</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right text-green-700 dark:text-green-400 border-r border-gray-300 dark:border-gray-600">
                    {formatCurrency(totalDebe)}
                  </td>
                  <td className="px-3 py-3 text-right text-blue-700 dark:text-blue-400 border-r border-gray-300 dark:border-gray-600">
                    {formatCurrency(totalHaber)}
                  </td>
                  <td className="px-3 py-3 text-center"></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal de Vista Detallada - Estilo Libro Diario */}
      {viewingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setViewingEntry(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Encabezado del Modal */}
            <div className="flex items-center justify-between p-6 border-b-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <FileText className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    DETALLE DEL ASIENTO #{viewingEntry.id}
                  </h2>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                  <span className="font-medium">Fecha: {formatDate(viewingEntry.date)}</span>
                  <span className="font-medium">•</span>
                  <span>
                    Origen: {viewingEntry.origin === 'MOTOR' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-700">
                        ✓ MOTOR
                      </span>
                    ) : ['VENTAS', 'COMPRAS', 'INVENTARIO', 'TESORERIA'].includes(viewingEntry.origin || '') ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700">
                        {viewingEntry.origin}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700">
                        {viewingEntry.origin || 'MANUAL'}
                      </span>
                    )}
                  </span>
                  {viewingEntry.status === 'VOIDED' && (
                    <>
                      <span className="font-medium">•</span>
                      <span className="text-red-600 dark:text-red-400 font-semibold">[ANULADO]</span>
                    </>
                  )}
                </div>
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1">GLOSA / DESCRIPCIÓN</div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {viewingEntry.glosa || '(Sin descripción)'}
                  </div>
                </div>
              </div>
              <Button variant="outline" onClick={() => setViewingEntry(null)} className="ml-4">
                Cerrar
              </Button>
            </div>

            {/* Tabla de Líneas - Estilo Libro Diario */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-3">
                DETALLE DE CUENTAS
              </div>
              <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-200 dark:bg-gray-700 border-b-2 border-gray-400 dark:border-gray-500">
                      <th className="px-3 py-2.5 text-center text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600" style={{ width: '100px' }}>Código</th>
                      <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600" style={{ minWidth: '250px' }}>Cuenta</th>
                      <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600" style={{ minWidth: '200px' }}>Memo / Referencia</th>
                      <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600" style={{ width: '120px' }}>Debe</th>
                      <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-900 dark:text-gray-100" style={{ width: '120px' }}>Haber</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewingEntry.lines?.map((line: any, idx: number) => (
                      <tr 
                        key={line.id}
                        className={`
                          ${idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/70'}
                          border-b border-gray-300 dark:border-gray-600
                          hover:bg-blue-50 dark:hover:bg-blue-900/10
                        `}
                      >
                        <td className="px-3 py-2 text-center font-mono text-sm font-semibold text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">
                          {line.account_code}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">
                          {line.account_name}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 border-r border-gray-300 dark:border-gray-600">
                          {line.memo || '-'}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-green-700 dark:text-green-400 border-r border-gray-300 dark:border-gray-600">
                          {line.debit > 0 ? formatCurrency(line.debit) : '-'}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-blue-700 dark:text-blue-400">
                          {line.credit > 0 ? formatCurrency(line.credit) : '-'}
                        </td>
                      </tr>
                    ))}
                    
                    {/* Totales del Asiento */}
                    <tr className="bg-gray-200 dark:bg-gray-700 border-t-2 border-gray-400 dark:border-gray-500 font-bold">
                      <td colSpan={3} className="px-3 py-2.5 text-right pr-4 text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">
                        TOTAL DEL ASIENTO
                        {Math.abs((viewingEntry.total_debit || 0) - (viewingEntry.total_credit || 0)) < 0.01 ? (
                          <span className="ml-2 text-green-600 dark:text-green-400">✓ CUADRA</span>
                        ) : (
                          <span className="ml-2 text-red-600 dark:text-red-400">⚠ DESBALANCEADO</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right text-green-700 dark:text-green-400 border-r border-gray-300 dark:border-gray-600">
                        {formatCurrency(viewingEntry.total_debit || 0)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-blue-700 dark:text-blue-400">
                        {formatCurrency(viewingEntry.total_credit || 0)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
