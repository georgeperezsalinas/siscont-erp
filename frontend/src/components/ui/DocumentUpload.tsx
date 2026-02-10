import { useState, useRef, useId } from 'react'
import { Button } from './Button'
import { Upload, File, X, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { uploadDocument, type Document } from '@/api'
import { MessageModal } from './MessageModal'

interface DocumentUploadProps {
  companyId: number
  documentType: string
  relatedEntityType?: string
  relatedEntityId?: number
  title?: string
  description?: string
  onUploadSuccess?: (document: Document) => void
  onUploadError?: (error: string) => void
  onUploadComplete?: () => void // Callback para recargar lista
  className?: string
}

export function DocumentUpload({
  companyId,
  documentType,
  relatedEntityType,
  relatedEntityId,
  title,
  description,
  onUploadSuccess,
  onUploadError,
  onUploadComplete,
  className = ''
}: DocumentUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; title: string; message: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputId = useId() // ID único para cada instancia del componente

  const allowedTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain',
    'text/xml',
    'application/xml'
  ]

  const allowedExtensions = ['.pdf', '.xlsx', '.xls', '.docx', '.doc', '.txt', '.xml']
  const maxSizeMB = 50

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validar tipo
    if (!allowedTypes.includes(file.type) && !allowedExtensions.some(ext => file.name.toLowerCase().endsWith(ext))) {
      setMessage({
        type: 'error',
        title: 'Tipo de archivo no permitido',
        message: `Solo se permiten: PDF, Excel, Word, TXT, XML`
      })
      return
    }

    // Validar tamaño
    if (file.size > maxSizeMB * 1024 * 1024) {
      setMessage({
        type: 'error',
        title: 'Archivo demasiado grande',
        message: `El archivo no puede ser mayor a ${maxSizeMB}MB`
      })
      return
    }

    setSelectedFile(file)
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    setUploading(true)
    setMessage(null)

    try {
      const document = await uploadDocument(
        companyId,
        selectedFile,
        documentType,
        relatedEntityType,
        relatedEntityId,
        title || selectedFile.name,
        description
      )

      setMessage({
        type: 'success',
        title: 'Documento subido',
        message: `El documento "${selectedFile.name}" se subió correctamente`
      })

      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }

      if (onUploadSuccess) {
        onUploadSuccess(document)
      }

      // Llamar callback para recargar lista
      if (onUploadComplete) {
        onUploadComplete()
      }
    } catch (error: any) {
      const errorMessage = error.message || 'Error al subir el documento'
      setMessage({
        type: 'error',
        title: 'Error al subir',
        message: errorMessage
      })

      if (onUploadError) {
        onUploadError(errorMessage)
      }
    } finally {
      setUploading(false)
    }
  }

  const handleRemoveFile = () => {
    setSelectedFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  return (
    <div className={className}>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.xlsx,.xls,.docx,.doc,.txt,.xml"
            onChange={handleFileSelect}
            className="hidden"
            id={inputId}
            disabled={uploading}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            className="cursor-pointer"
            onClick={(e) => {
              // Prevenir cualquier comportamiento por defecto
              e.preventDefault()
              e.stopPropagation()
              // Abrir selector de archivos programáticamente
              if (fileInputRef.current && !uploading) {
                fileInputRef.current.click()
              }
            }}
            onMouseDown={(e) => {
              // Prevenir que el botón pierda el foco antes del click
              e.preventDefault()
            }}
          >
            <Upload className="w-4 h-4 mr-2" />
            Seleccionar Archivo
          </Button>

          {selectedFile && (
            <div className="flex items-center gap-2 flex-1">
              <File className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-700 flex-1 truncate">{selectedFile.name}</span>
              <span className="text-xs text-gray-500">({formatFileSize(selectedFile.size)})</span>
              <button
                onClick={handleRemoveFile}
                className="text-gray-400 hover:text-red-500 transition-colors"
                disabled={uploading}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {selectedFile && (
            <Button
              onClick={handleUpload}
              disabled={uploading}
              size="sm"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Subiendo...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Subir
                </>
              )}
            </Button>
          )}
        </div>

        <p className="text-xs text-gray-500">
          Formatos permitidos: PDF, Excel, Word, TXT, XML. Tamaño máximo: {maxSizeMB}MB
        </p>
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

