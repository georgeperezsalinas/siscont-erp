import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { useSettings } from '@/stores/settings'
import { showToast } from '@/components/ui/Toast'

// Función para obtener la configuración de formato numérico
function getNumberFormat() {
  const { getNumberFormat } = useSettings.getState()
  return getNumberFormat()
}

function getCurrencyFormat() {
  const { getCurrencyFormat } = useSettings.getState()
  return getCurrencyFormat()
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(...inputs))
}

/**
 * Formatea un número usando la configuración del sistema (coma para miles, punto para decimales, 2 decimales)
 */
export function formatNumber(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) return ''
  // Permitir mostrar 0 con formato
  if (value === 0) {
    const format = getNumberFormat()
    const zeroStr = format.decimals > 0 
      ? '0' + format.decimal + '0'.repeat(format.decimals)
      : '0'
    return zeroStr
  }
  
  const format = getNumberFormat()
  // Redondear a los decimales configurados
  const rounded = Math.round(value * Math.pow(10, format.decimals)) / Math.pow(10, format.decimals)
  const numStr = rounded.toString()
  const parts = numStr.split('.')
  const integerPart = parseInt(parts[0], 10).toString()
  
  // Agregar separador de miles
  const thousandRegex = new RegExp(`\\B(?=(\\d{3})+(?!\\d))`, 'g')
  const integerFormatted = integerPart.replace(thousandRegex, format.thousand)
  
  // Parte decimal
  let decimalPart = parts[1] ? parts[1].substring(0, format.decimals) : ''
  if (format.decimals > 0) {
    decimalPart = decimalPart.padEnd(format.decimals, '0')
    return integerFormatted + format.decimal + decimalPart
  }
  return integerFormatted
}

/**
 * Formatea un número como moneda usando la configuración del sistema
 */
export function formatCurrency(value: number): string {
  const format = getNumberFormat()
  const currency = getCurrencyFormat()
  
  // Formatear número
  const formattedNumber = formatNumber(value) || '0'
  
  // Si el valor es 0 y el formato devuelve vacío, usar '0' con decimales
  if (value === 0 || formattedNumber === '') {
    const zeroStr = format.decimals > 0 
      ? '0' + format.decimal + '0'.repeat(format.decimals)
      : '0'
    return `${currency.symbol} ${zeroStr}`
  }
  
  return `${currency.symbol} ${formattedNumber}`
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-'
  try {
    let dateObj: Date
    if (typeof date === 'string') {
      // Si es string ISO (YYYY-MM-DD), parsearlo directamente sin timezone issues
      if (date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = date.split('-').map(Number)
        dateObj = new Date(year, month - 1, day) // month is 0-indexed
      } else {
        dateObj = new Date(date)
      }
    } else {
      dateObj = date
    }
    if (isNaN(dateObj.getTime())) return '-'
    return new Intl.DateTimeFormat('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(dateObj)
  } catch {
    return '-'
  }
}

/**
 * Muestra un mensaje toast al usuario
 * @param type - Tipo de mensaje: 'success', 'error', 'warning', 'info'
 * @param title - Título del mensaje
 * @param message - Mensaje a mostrar
 */
export function showMessage(type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) {
  showToast(type, message, title)
}

/**
 * Exporta datos a Excel con formato profesional
 * @param data - Array de objetos con los datos a exportar
 * @param columns - Array de objetos con la configuración de columnas: { key: string, label: string, format?: 'currency' | 'date' | 'number' }
 * @param filename - Nombre del archivo (sin extensión)
 * @param title - Título del reporte (opcional)
 */
export async function exportToExcel(
  data: any[],
  columns: Array<{ key: string; label: string; format?: 'currency' | 'date' | 'number' }>,
  filename: string,
  title?: string
) {
  try {
    const XLSX = await import('xlsx')
    
    // Crear workbook
    const wb = XLSX.utils.book_new()
    
    // Preparar datos para Excel
    const excelData = data.map(row => {
      const excelRow: any = {}
      columns.forEach(col => {
        let value = row[col.key]
        
        // Aplicar formato según el tipo
        if (value !== null && value !== undefined) {
          if (col.format === 'currency') {
            // Para Excel, usar número sin símbolo de moneda
            value = typeof value === 'number' ? value : parseFloat(value) || 0
          } else if (col.format === 'date') {
            // Convertir a formato de fecha de Excel
            if (typeof value === 'string') {
              const date = new Date(value)
              if (!isNaN(date.getTime())) {
                value = date
              }
            }
          } else if (col.format === 'number') {
            value = typeof value === 'number' ? value : parseFloat(value) || 0
          }
        }
        
        excelRow[col.label] = value
      })
      return excelRow
    })
    
    // Crear worksheet
    const ws = XLSX.utils.json_to_sheet(excelData)
    
    // Aplicar estilos y formato
    // Calcular ancho de columnas
    const colWidths = columns.map((col, idx) => {
      const maxLength = Math.max(
        col.label.length,
        ...data.map(row => {
          const val = row[col.key]
          return val ? String(val).length : 0
        })
      )
      return { wch: Math.min(Math.max(maxLength + 2, 10), 50) }
    })
    ws['!cols'] = colWidths
    
    // Agregar título si se proporciona
    if (title) {
      XLSX.utils.sheet_add_aoa(ws, [[title]], { origin: 'A1' })
      XLSX.utils.sheet_add_aoa(ws, [columns.map(c => c.label)], { origin: 'A2' })
      XLSX.utils.sheet_add_json(ws, excelData, { origin: 'A3', skipHeader: true })
      
      // Fusionar celdas del título
      if (!ws['!merges']) ws['!merges'] = []
      ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: columns.length - 1 } })
    }
    
    // Agregar worksheet al workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Datos')
    
    // Generar nombre de archivo con fecha
    const dateStr = new Date().toISOString().split('T')[0]
    const finalFilename = `${filename}_${dateStr}.xlsx`
    
    // Descargar archivo
    XLSX.writeFile(wb, finalFilename)
    
    return true
  } catch (error: any) {
    console.error('Error exportando a Excel:', error)
    showMessage('error', 'Error', `Error al exportar a Excel: ${error.message || 'Error desconocido'}`)
    return false
  }
}

