import { useState, useEffect } from 'react'
import { Card } from './Card'
import { Button } from './Button'
import { Table, TableHeader, TableHeaderCell, TableBody, TableRow, TableCell } from './Table'
import { File, Download, Eye, Trash2, Tag, Loader2, AlertCircle } from 'lucide-react'
import { 
  searchDocuments, 
  downloadDocument, 
  deleteDocument, 
  getDocument,
  type Document,
  type DocumentSearchParams 
} from '@/api'
import { formatDate, formatNumber } from '@/lib/utils'
import { MessageModal } from './MessageModal'

interface DocumentListProps {
  companyId: number
  documentType?: string
  relatedEntityType?: string
  relatedEntityId?: number
  onDocumentSelect?: (document: Document) => void
  onDocumentDelete?: (documentId: number) => void
  showActions?: boolean
  className?: string
  refreshKey?: number | string // Key para forzar recarga
}

export function DocumentList({
  companyId,
  documentType,
  relatedEntityType,
  relatedEntityId,
  onDocumentSelect,
  onDocumentDelete,
  showActions = true,
  className = '',
  refreshKey
}: DocumentListProps) {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState<number | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; title: string; message: string } | null>(null)

  useEffect(() => {
    loadDocuments()
  }, [companyId, documentType, relatedEntityType, relatedEntityId, refreshKey])

  const loadDocuments = async () => {
    if (!companyId) return

    setLoading(true)
    try {
      const params: DocumentSearchParams = {
        company_id: companyId,
        document_type: documentType,
        related_entity_type: relatedEntityType,
        related_entity_id: relatedEntityId,
        limit: 100
      }

      const response = await searchDocuments(params)
      setDocuments(response.items)
    } catch (error: any) {
      setMessage({
        type: 'error',
        title: 'Error al cargar documentos',
        message: error.message || 'No se pudieron cargar los documentos'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = async (doc: Document) => {
    setDownloading(doc.id)
    try {
      const blob = await downloadDocument(doc.id)
      const url = URL.createObjectURL(blob)
      const a = window.document.createElement('a')
      a.href = url
      a.download = doc.original_filename || `documento-${doc.id}`
      a.setAttribute('download', doc.original_filename || `documento-${doc.id}`)
      window.document.body.appendChild(a)
      
      // Forzar click
      a.click()
      
      // Limpiar después de un breve delay
      setTimeout(() => {
        if (window.document.body.contains(a)) {
          window.document.body.removeChild(a)
        }
        URL.revokeObjectURL(url)
      }, 100)
    } catch (error: any) {
      setMessage({
        type: 'error',
        title: 'Error al descargar',
        message: error.message || 'No se pudo descargar el documento'
      })
    } finally {
      setDownloading(null)
    }
  }

  const handleDelete = async (document: Document) => {
    if (!confirm(`¿Está seguro de eliminar el documento "${document.original_filename}"?`)) {
      return
    }

    try {
      await deleteDocument(document.id, true)
      setDocuments(documents.filter(d => d.id !== document.id))
      
      if (onDocumentDelete) {
        onDocumentDelete(document.id)
      }

      setMessage({
        type: 'success',
        title: 'Documento eliminado',
        message: 'El documento se eliminó correctamente'
      })
    } catch (error: any) {
      setMessage({
        type: 'error',
        title: 'Error al eliminar',
        message: error.message || 'No se pudo eliminar el documento'
      })
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes('pdf')) return '📄'
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊'
    if (mimeType.includes('word') || mimeType.includes('document')) return '📝'
    if (mimeType.includes('xml')) return '📋'
    return '📎'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
        <span className="ml-2 text-gray-600">Cargando documentos...</span>
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <div className="text-center p-8 text-gray-500">
        <File className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>No hay documentos</p>
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableHeaderCell>Archivo</TableHeaderCell>
            <TableHeaderCell>Tipo</TableHeaderCell>
            <TableHeaderCell>Tamaño</TableHeaderCell>
            <TableHeaderCell>Fecha</TableHeaderCell>
            {showActions && <TableHeaderCell>Acciones</TableHeaderCell>}
          </TableHeader>
          <TableBody>
            {documents.map((doc) => (
              <TableRow key={doc.id} className="hover:bg-gray-50">
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{getFileIcon(doc.mime_type)}</span>
                    <div>
                      <div className="font-medium text-gray-900">{doc.title || doc.original_filename}</div>
                      {doc.description && (
                        <div className="text-sm text-gray-500">{doc.description}</div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-gray-600">{doc.document_type}</span>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-gray-600">{formatFileSize(doc.file_size)}</span>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-gray-600">{formatDate(doc.uploaded_at)}</span>
                </TableCell>
                {showActions && (
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDocumentSelect?.(doc)}
                        title={doc.mime_type === 'application/pdf' ? 'Vista previa' : 'Ver documento'}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownload(doc)}
                        disabled={downloading === doc.id}
                        title="Descargar"
                      >
                        {downloading === doc.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(doc)}
                        title="Eliminar"
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {message && (
        <MessageModal
          type={message.type}
          title={message.title}
          message={message.message}
          onClose={() => setMessage(null)}
        />
      )}
    </div>
  )
}

