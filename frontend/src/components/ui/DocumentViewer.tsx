import { useState, useEffect } from 'react'
import { Card, CardHeader } from './Card'
import { Button } from './Button'
import { X, Download, Loader2 } from 'lucide-react'
import { previewDocument, downloadDocument, getToken, API_BASE, type Document } from '@/api'

interface DocumentViewerProps {
  document: Document
  onClose: () => void
}

export function DocumentViewer({ document, onClose }: DocumentViewerProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (document.mime_type === 'application/pdf') {
      loadPdf()
    } else {
      setError('Solo se pueden previsualizar archivos PDF')
      setLoading(false)
    }

    return () => {
      // Limpiar URL al desmontar
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl)
      }
    }
  }, [document.id])

  const loadPdf = async () => {
    try {
      setLoading(true)
      const url = await previewDocument(document.id)
      setPdfUrl(url)
    } catch (err: any) {
      setError(err.message || 'Error al cargar el PDF')
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (downloading) return
    
    try {
      setDownloading(true)
      
      // Obtener blob
      const blob = await downloadDocument(document.id)
      const blobUrl = URL.createObjectURL(blob)
      
      // Crear elemento <a> con todas las propiedades necesarias
      const link = window.document.createElement('a')
      link.href = blobUrl
      link.download = document.original_filename || `documento-${document.id}`
      link.setAttribute('download', document.original_filename || `documento-${document.id}`)
      
      // Agregar al DOM (debe estar en el body, no en el modal)
      window.document.body.appendChild(link)
      
      // Forzar el click - usar múltiples métodos
      try {
        // Método 1: click() directo
        link.click()
      } catch (clickError) {
        console.warn('Click directo falló, intentando MouseEvent:', clickError)
        // Método 2: Crear evento MouseEvent
        const mouseEvent = new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true,
          buttons: 1
        })
        link.dispatchEvent(mouseEvent)
      }
      
      // Limpiar después de un delay
      setTimeout(() => {
        try {
          if (window.document.body.contains(link)) {
            window.document.body.removeChild(link)
          }
          URL.revokeObjectURL(blobUrl)
        } catch (cleanupError) {
          console.warn('Error al limpiar:', cleanupError)
        }
        setDownloading(false)
      }, 300)
      
    } catch (err: any) {
      setDownloading(false)
      console.error('Error al descargar documento:', err)
      alert(`Error al descargar: ${err.message || 'No se pudo descargar el documento'}`)
    }
  }

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        // Cerrar al hacer clic fuera del contenido
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <Card className="w-full max-w-6xl h-[90vh] flex flex-col relative">
        {/* Botón de cerrar más visible en la esquina superior derecha */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 bg-white dark:bg-gray-800 rounded-full p-2 shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="Cerrar"
          aria-label="Cerrar visor de documento"
        >
          <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>
        
        <CardHeader
          title={document.title || document.original_filename}
          subtitle={document.description || undefined}
          actions={
            <div className="flex items-center gap-2">
              <Button 
                type="button"
                variant="outline" 
                size="sm" 
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleDownload(e)
                }}
                disabled={downloading || loading}
              >
                {downloading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Descargando...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Descargar
                  </>
                )}
              </Button>
            </div>
          }
        />
        <div className="flex-1 overflow-hidden p-4">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
              <span className="ml-2 text-gray-600">Cargando documento...</span>
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center h-full text-red-600">
              <span>{error}</span>
            </div>
          )}
          {pdfUrl && !loading && !error && (
            <iframe
              src={pdfUrl}
              className="w-full h-full border-0"
              title={document.original_filename}
            />
          )}
        </div>
      </Card>
    </div>
  )
}

