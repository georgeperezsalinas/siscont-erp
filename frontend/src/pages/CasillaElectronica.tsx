import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { Badge } from '@/components/ui/Badge'
import { formatDate, showMessage } from '@/lib/utils'
import {
  Inbox,
  Send,
  Mail,
  ChevronRight,
  AlertCircle,
  AlertTriangle,
  Paperclip,
  CheckCircle,
  FileText,
  X,
  Loader2,
  Archive,
  ArrowUpCircle,
} from 'lucide-react'
import { getMyPermissions } from '@/api'
import {
  listMailboxMessages,
  getMailboxMessage,
  markMailboxMessageRead,
  acknowledgeMailboxMessage,
  createMailboxResponse,
  getMailboxStats,
  downloadMailboxAttachment,
  downloadMailboxResponseAttachment,
  listMailboxAdminCompanies,
  adminListAllMessages,
  adminListCompanyMessages,
  adminGetMailboxMessage,
  adminCreateMailboxMessage,
  adminUploadMessageAttachment,
  uploadMailboxResponseAttachment,
  companySendToAdmin,
  companyUploadOutgoingAttachment,
  companyListOutgoing,
  companyGetOutgoing,
  downloadCompanyOutgoingAttachment,
  adminListIncoming,
  adminGetIncoming,
  adminMarkIncomingRead,
  adminDownloadIncomingAttachment,
  type MailboxMessageItem,
  type MailboxMessageDetail,
} from '@/api'
import { useOrg } from '@/stores/org'
import { useAuth } from '@/stores/auth'
import { Tabs, TabsList, TabsTriggerWithValue, TabsContentWithValue } from '@/components/ui/Tabs'
import { MailboxSplitView, MailboxEmptyState } from '@/components/casilla/MailboxSplitView'
import {
  MailboxLegalDisclaimerFooter,
  MailboxLegalDisclaimerShort,
  LEGAL_DISCLAIMER_FULL,
  LEGAL_DISCLAIMER_SHORT,
  LEGAL_CONFIRM_RECEIPT,
} from '@/components/casilla/MailboxLegalDisclaimer'
import { MessageModal } from '@/components/ui/MessageModal'

const MESSAGE_TYPE_LABELS: Record<string, string> = {
  NOTIFICACION: 'Notificación',
  MULTA: 'Multa',
  REQUERIMIENTO: 'Requerimiento',
  AUDITORIA: 'Auditoría',
  RECORDATORIO: 'Recordatorio',
  DOCUMENTO: 'Documento',
  COMUNICADO: 'Comunicado',
}

const MESSAGE_TYPE_COLORS: Record<string, string> = {
  NOTIFICACION: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  MULTA: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  REQUERIMIENTO: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  AUDITORIA: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  RECORDATORIO: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  DOCUMENTO: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
  COMUNICADO: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
}

export default function CasillaElectronica() {
  const { empresaId } = useOrg()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<'inbox' | 'send' | 'sent' | 'incoming' | 'companySend' | 'companySent'>('inbox')
  const hasSetAdminTab = useRef(false)
  const hasAutoSelectedIncoming = useRef(false)
  const [userPermissions, setUserPermissions] = useState<string[]>([])
  const [messages, setMessages] = useState<MailboxMessageItem[]>([])
  const [stats, setStats] = useState({ unread_count: 0, pending_response_count: 0 })
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<string>('')
  const [filterRead, setFilterRead] = useState<string>('')
  const [filterDateFrom, setFilterDateFrom] = useState<string>('')
  const [filterDateTo, setFilterDateTo] = useState<string>('')
  const [showDisclaimerModal, setShowDisclaimerModal] = useState(false)
  const [showConfirmReceiptModal, setShowConfirmReceiptModal] = useState(false)
  const [selectedMessage, setSelectedMessage] = useState<MailboxMessageDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [responseText, setResponseText] = useState('')
  const [responseFiles, setResponseFiles] = useState<File[]>([])
  const [submittingResponse, setSubmittingResponse] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const isAdmin = user?.is_admin || user?.role === 'ADMINISTRADOR'
  const canSendToAdmin = !isAdmin && userPermissions.includes('casilla.send') && !!empresaId

  // Admin: send form
  const [adminCompanies, setAdminCompanies] = useState<Array<{ id: number; name: string; ruc?: string }>>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null)
  const [sendForm, setSendForm] = useState({
    subject: '',
    body: '',
    message_type: 'NOTIFICACION',
    priority: 'NORMAL',
    requires_response: false,
    due_date: '',
  })
  const [sendFiles, setSendFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)

  // Admin: mensajes enviados (todos los mensajes enviados por SISCONT)
  const [sentCompanyId, setSentCompanyId] = useState<number | null>(null)
  const [sentMessageType, setSentMessageType] = useState<string>('')
  const [sentIsRead, setSentIsRead] = useState<string>('')
  const [sentMessages, setSentMessages] = useState<Array<MailboxMessageItem & { company_id?: number; company_name?: string }>>([])
  const [loadingSent, setLoadingSent] = useState(false)
  const [selectedSentMessage, setSelectedSentMessage] = useState<MailboxMessageDetail | null>(null)
  const [selectedSentMessageCompanyId, setSelectedSentMessageCompanyId] = useState<number | null>(null)
  const [loadingSentDetail, setLoadingSentDetail] = useState(false)

  // Empresa: enviar a SISCONT
  const [companySendForm, setCompanySendForm] = useState({ subject: '', body: '' })
  const [companySendFiles, setCompanySendFiles] = useState<File[]>([])
  const [companySending, setCompanySending] = useState(false)
  const [companySentMessages, setCompanySentMessages] = useState<Array<{ id: number; subject: string; created_at: string; created_by_name: string }>>([])
  const [loadingCompanySent, setLoadingCompanySent] = useState(false)
  const [selectedCompanySentMessage, setSelectedCompanySentMessage] = useState<{
    id: number
    subject: string
    body: string
    company_id: number
    company_name: string
    created_at: string
    created_by_name: string
    is_read: boolean
    read_at: string | null
    attachments: Array<{ id: number; file_name: string; file_type: string }>
  } | null>(null)
  const [loadingCompanySentDetail, setLoadingCompanySentDetail] = useState(false)

  // Admin: mensajes recibidos de empresas
  const [incomingMessages, setIncomingMessages] = useState<Array<{ id: number; subject: string; company_name: string; created_at: string; created_by_name: string; is_read: boolean }>>([])
  const [loadingIncoming, setLoadingIncoming] = useState(false)
  const [selectedIncoming, setSelectedIncoming] = useState<{
    id: number; subject: string; body: string; company_name: string; created_at: string; created_by_name: string
    attachments: Array<{ id: number; file_name: string }>
  } | null>(null)
  const [loadingIncomingDetail, setLoadingIncomingDetail] = useState(false)

  const DISCLAIMER_STORAGE_KEY = 'siscont_casilla_disclaimer_accepted'

  useEffect(() => {
    getMyPermissions().then(setUserPermissions).catch(() => [])
  }, [])

  // Mostrar aviso legal en primer acceso a la casilla
  useEffect(() => {
    if (!empresaId && !isAdmin) return
    const accepted = localStorage.getItem(DISCLAIMER_STORAGE_KEY)
    if (!accepted) {
      setShowDisclaimerModal(true)
    }
  }, [empresaId, isAdmin])

  useEffect(() => {
    if (empresaId) {
      loadMessages()
      loadStats()
    }
  }, [empresaId, filterType, filterRead])

  useEffect(() => {
    if (isAdmin && activeTab === 'send') {
      listMailboxAdminCompanies().then(setAdminCompanies)
    }
  }, [isAdmin, activeTab])

  useEffect(() => {
    if (isAdmin && activeTab === 'sent') {
      listMailboxAdminCompanies().then(setAdminCompanies)
    }
  }, [isAdmin, activeTab])

  useEffect(() => {
    if (isAdmin && activeTab === 'sent') {
      loadSentMessages()
    } else {
      setSentMessages([])
      setSelectedSentMessage(null)
    }
  }, [isAdmin, activeTab, sentCompanyId, sentMessageType, sentIsRead])

  useEffect(() => {
    if (canSendToAdmin && empresaId && activeTab === 'companySent') {
      setLoadingCompanySent(true)
      companyListOutgoing(empresaId).then((r) => setCompanySentMessages(r.items)).catch(() => []).finally(() => setLoadingCompanySent(false))
    } else {
      setCompanySentMessages([])
      setSelectedCompanySentMessage(null)
    }
  }, [canSendToAdmin, empresaId, activeTab])

  async function openCompanySentMessage(msg: { id: number; subject: string; created_at: string; created_by_name: string }) {
    if (!empresaId) return
    setLoadingCompanySentDetail(true)
    setSelectedCompanySentMessage(null)
    try {
      const detail = await companyGetOutgoing(msg.id, empresaId)
      setSelectedCompanySentMessage(detail)
    } catch (err: any) {
      console.error('Error cargando detalle del mensaje enviado:', err)
      setMessage({ type: 'error', text: err.message || 'Error al cargar el mensaje' })
    } finally {
      setLoadingCompanySentDetail(false)
    }
  }

  useEffect(() => {
    if (isAdmin) {
      if (!hasSetAdminTab.current) {
        hasSetAdminTab.current = true
        setActiveTab('incoming')
      }
    }
  }, [isAdmin])

  useEffect(() => {
    if (isAdmin && activeTab === 'incoming') {
      setLoadingIncoming(true)
      adminListIncoming().then((r) => {
        setIncomingMessages(r.items)
      }).catch(() => []).finally(() => setLoadingIncoming(false))
    } else {
      setIncomingMessages([])
      setSelectedIncoming(null)
    }
  }, [isAdmin, activeTab])

  // Auto-seleccionar el último mensaje recibido cuando cargan los mensajes
  useEffect(() => {
    if (isAdmin && activeTab === 'incoming' && incomingMessages.length > 0 && !hasAutoSelectedIncoming.current) {
      hasAutoSelectedIncoming.current = true
      openIncomingMessage(incomingMessages[0])
    }
  }, [isAdmin, activeTab, incomingMessages])

  async function loadMessages() {
    if (!empresaId) return
    setLoading(true)
    try {
      const res = await listMailboxMessages({
        company_id: empresaId,
        message_type: filterType || undefined,
        is_read: filterRead === 'read' ? true : filterRead === 'unread' ? false : undefined,
        limit: 50,
      })
      setMessages(res.items)
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al cargar mensajes' })
    } finally {
      setLoading(false)
    }
  }

  // Filtrado por fecha (cliente) para bandeja empresa
  const filteredInboxMessages = messages.filter((m) => {
    const d = m.created_at?.slice(0, 10) || ''
    if (filterDateFrom && d < filterDateFrom) return false
    if (filterDateTo && d > filterDateTo) return false
    return true
  })

  async function loadStats() {
    if (!empresaId) return
    try {
      const s = await getMailboxStats(empresaId)
      setStats(s)
    } catch {
      // ignore
    }
  }

  async function loadSentMessages() {
    if (!isAdmin || activeTab !== 'sent') return
    setLoadingSent(true)
    try {
      const res = await adminListAllMessages({
        company_id: sentCompanyId || undefined,
        message_type: sentMessageType || undefined,
        is_read: sentIsRead === 'read' ? true : sentIsRead === 'unread' ? false : undefined,
        limit: 100,
      })
      setSentMessages(res.items)
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al cargar mensajes' })
    } finally {
      setLoadingSent(false)
    }
  }

  async function openSentMessage(msg: MailboxMessageItem & { company_id?: number }) {
    const companyId = msg.company_id || sentCompanyId
    if (!companyId) {
      setMessage({ type: 'error', text: 'No se puede abrir el mensaje: falta información de empresa' })
      return
    }
    setLoadingSentDetail(true)
    setSelectedSentMessage(null)
    setSelectedSentMessageCompanyId(companyId)
    try {
      const detail = await adminGetMailboxMessage(msg.id, companyId)
      setSelectedSentMessage(detail)
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al cargar mensaje' })
    } finally {
      setLoadingSentDetail(false)
    }
  }

  async function openMessage(msg: MailboxMessageItem) {
    if (!empresaId) return
    setLoadingDetail(true)
    setSelectedMessage(null)
    setResponseText('')
    try {
      const detail = await getMailboxMessage(msg.id, empresaId)
      setSelectedMessage(detail)
      if (!detail.is_read) {
        await markMailboxMessageRead(msg.id, empresaId)
        loadMessages()
        loadStats()
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al cargar mensaje' })
    } finally {
      setLoadingDetail(false)
    }
  }

  async function submitResponse() {
    if (!selectedMessage || !empresaId || !responseText.trim()) return
    setSubmittingResponse(true)
    try {
      const resp = await createMailboxResponse(selectedMessage.id, empresaId, responseText.trim())
      for (const file of responseFiles) {
        await uploadMailboxResponseAttachment(resp.id, empresaId, file)
      }
      setMessage({ type: 'success', text: 'Respuesta enviada correctamente' })
      setResponseText('')
      setResponseFiles([])
      const detail = await getMailboxMessage(selectedMessage.id, empresaId)
      setSelectedMessage(detail)
      loadMessages()
      loadStats()
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al enviar respuesta' })
    } finally {
      setSubmittingResponse(false)
    }
  }

  async function handleSendMessage() {
    if (!selectedCompanyId) {
      setMessage({ type: 'error', text: 'Selecciona una empresa' })
      return
    }
    if (!sendForm.subject.trim() || !sendForm.body.trim()) {
      setMessage({ type: 'error', text: 'Asunto y contenido son obligatorios' })
      return
    }
    setSending(true)
    try {
      const result = await adminCreateMailboxMessage(selectedCompanyId, {
        subject: sendForm.subject.trim(),
        body: sendForm.body.trim(),
        message_type: sendForm.message_type,
        priority: sendForm.priority,
        requires_response: sendForm.requires_response,
        due_date: sendForm.due_date || null,
      })
      for (const file of sendFiles) {
        await adminUploadMessageAttachment(result.id, file)
      }
      setMessage({ type: 'success', text: 'Notificación enviada correctamente' })
      showMessage('success', 'Mensaje enviado', `Se ha enviado un mensaje a la empresa. El usuario recibirá una notificación.`)
      setSendForm({ subject: '', body: '', message_type: 'NOTIFICACION', priority: 'NORMAL', requires_response: false, due_date: '' })
      setSendFiles([])
      setSentCompanyId(selectedCompanyId)
      setActiveTab('sent')
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al enviar' })
    } finally {
      setSending(false)
    }
  }

  async function handleCompanySendToAdmin() {
    if (!empresaId || !companySendForm.subject.trim() || !companySendForm.body.trim()) {
      setMessage({ type: 'error', text: 'Asunto y contenido son obligatorios' })
      return
    }
    setCompanySending(true)
    try {
      const result = await companySendToAdmin(empresaId, {
        subject: companySendForm.subject.trim(),
        body: companySendForm.body.trim(),
      })
      for (const file of companySendFiles) {
        await companyUploadOutgoingAttachment(result.id, empresaId, file)
      }
      setMessage({ type: 'success', text: 'Mensaje enviado correctamente a SISCONT' })
      showMessage('success', 'Mensaje enviado', 'Tu mensaje ha sido enviado a SISCONT. Recibirás una respuesta pronto.')
      setCompanySendForm({ subject: '', body: '' })
      setCompanySendFiles([])
      setActiveTab('companySent')
      companyListOutgoing(empresaId).then((r) => setCompanySentMessages(r.items)).catch(() => [])
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al enviar' })
    } finally {
      setCompanySending(false)
    }
  }

  async function openIncomingMessage(msg: { id: number }) {
    setLoadingIncomingDetail(true)
    setSelectedIncoming(null)
    try {
      const detail = await adminGetIncoming(msg.id)
      setSelectedIncoming({
        id: detail.id,
        subject: detail.subject,
        body: detail.body,
        company_name: detail.company_name,
        created_at: detail.created_at,
        created_by_name: detail.created_by_name,
        attachments: detail.attachments,
      })
      if (!detail.is_read) {
        await adminMarkIncomingRead(msg.id)
        adminListIncoming().then((r) => setIncomingMessages(r.items)).catch(() => [])
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al cargar mensaje' })
    } finally {
      setLoadingIncomingDetail(false)
    }
  }

  if (!empresaId && !isAdmin) {
    return (
      <div className="space-y-6">
        <Breadcrumbs items={[{ label: 'Inicio', to: '/' }, { label: 'Casilla Electrónica' }]} />
        <Card className="p-6 text-center text-gray-600 dark:text-gray-400">
          Selecciona una empresa para acceder a tu Casilla Electrónica
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Inicio', to: '/' }, { label: 'Casilla Electrónica' }]} />

      <PageHeader
        title="Casilla Electrónica"
        subtitle={
          isAdmin 
            ? "Sistema de comunicación oficial entre SISCONT y empresas."
            : "Notificaciones oficiales que SISCONT te envía."
        }
        icon={Inbox}
      />

      <MailboxLegalDisclaimerShort
        className="mb-4"
        subtitle={
          isAdmin 
            ? "Gestiona notificaciones, requerimientos y mensajes. No es un chat: los mensajes son inmutables."
            : "Revisa requerimientos, multas y comunicaciones importantes. No es un chat: los mensajes son inmutables."
        }
      />

      {/* Modal aviso legal - primer acceso */}
      <MessageModal
        isOpen={showDisclaimerModal}
        onClose={() => {
          setShowDisclaimerModal(false)
          localStorage.setItem(DISCLAIMER_STORAGE_KEY, '1')
        }}
        type="info"
        title="Casilla Electrónica SISCONT – Aviso Legal"
        message={LEGAL_DISCLAIMER_FULL}
        confirmText="Acepto las condiciones"
        onConfirm={() => localStorage.setItem(DISCLAIMER_STORAGE_KEY, '1')}
      />

      {/* Modal confirmar recepción con texto legal */}
      <MessageModal
        isOpen={showConfirmReceiptModal}
        onClose={() => setShowConfirmReceiptModal(false)}
        type="info"
        title="Confirmar recepción"
        message={`${LEGAL_DISCLAIMER_SHORT}\n\nAl confirmar, usted declara:\n\n"${LEGAL_CONFIRM_RECEIPT}"`}
        confirmText={LEGAL_CONFIRM_RECEIPT}
        cancelText="Cancelar"
        showCancel
        onConfirm={async () => {
          if (!selectedMessage || !empresaId) return
          try {
            await acknowledgeMailboxMessage(selectedMessage.id, empresaId)
            const updated = await getMailboxMessage(selectedMessage.id, empresaId)
            setSelectedMessage(updated)
            loadMessages()
            loadStats()
            setMessage({ type: 'success', text: 'Recepción confirmada' })
            setShowConfirmReceiptModal(false)
          } catch (e: any) {
            setMessage({ type: 'error', text: e.message || 'Error al confirmar' })
          }
        }}
      />

      {message && (
        <div
          className={`p-4 rounded-lg flex items-center justify-between ${
            message.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200' : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="p-1 hover:opacity-80">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="flex flex-wrap gap-1 justify-start w-full">
          {!isAdmin && (
            <TabsTriggerWithValue
              value="inbox"
              activeValue={activeTab}
              onValueChange={setActiveTab}
              className="flex items-center gap-2"
              title="Mensajes que SISCONT te ha enviado (notificaciones, requerimientos, etc.)"
            >
              <Inbox className="w-4 h-4" />
              Bandeja de entrada
              {stats.unread_count > 0 && (
                <Badge variant="error" className="ml-1">{stats.unread_count}</Badge>
              )}
            </TabsTriggerWithValue>
          )}
          {isAdmin && (
            <>
              <TabsTriggerWithValue value="incoming" activeValue={activeTab} onValueChange={setActiveTab} className="flex items-center gap-2" title="Mensajes que las empresas han enviado a SISCONT">
                <Inbox className="w-4 h-4" />
                Bandeja de entrada
                {incomingMessages.filter(m => !m.is_read).length > 0 && (
                  <Badge variant="error" className="ml-1">{incomingMessages.filter(m => !m.is_read).length}</Badge>
                )}
              </TabsTriggerWithValue>
              <TabsTriggerWithValue value="send" activeValue={activeTab} onValueChange={setActiveTab} className="flex items-center gap-2" title="Enviar mensajes a empresas">
                <Send className="w-4 h-4" />
                Enviar
              </TabsTriggerWithValue>
              <TabsTriggerWithValue value="sent" activeValue={activeTab} onValueChange={setActiveTab} className="flex items-center gap-2" title="Todos los mensajes que SISCONT ha enviado a empresas (con filtros)">
                <Archive className="w-4 h-4" />
                Mensajes enviados
              </TabsTriggerWithValue>
            </>
          )}
          {canSendToAdmin && (
            <>
              <TabsTriggerWithValue value="companySend" activeValue={activeTab} onValueChange={setActiveTab} className="flex items-center gap-2">
                <ArrowUpCircle className="w-4 h-4" />
                Enviar a SISCONT
              </TabsTriggerWithValue>
              <TabsTriggerWithValue value="companySent" activeValue={activeTab} onValueChange={setActiveTab} className="flex items-center gap-2">
                <Archive className="w-4 h-4" />
                Mis mensajes enviados
              </TabsTriggerWithValue>
            </>
          )}
        </TabsList>

        <TabsContentWithValue value="inbox" activeValue={activeTab} className="mt-4">
          {empresaId ? (
            <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-0 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
              {/* Panel izquierdo: Bandeja de entrada - siempre visible */}
              <div className="border-r border-gray-200 dark:border-gray-700 flex flex-col">
                <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 text-left">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <Inbox className="w-5 h-5 text-primary-600 flex-shrink-0" />
                    <div className="flex-1">
                      <span className="font-semibold">
                        {isAdmin ? 'Bandeja de entrada' : 'Tu bandeja de entrada'}
                      </span>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {isAdmin 
                          ? 'Mensajes que SISCONT ha enviado a esta empresa'
                          : 'Mensajes que SISCONT te ha enviado'
                        }
                      </p>
                    </div>
                  </h3>
                  <div className="flex items-center gap-3 mt-2 text-sm text-gray-600 dark:text-gray-400">
                    <span>{filteredInboxMessages.length} mensaje{filteredInboxMessages.length !== 1 ? 's' : ''}</span>
                    {stats.unread_count > 0 && (
                      <Badge variant="error" className="text-xs">{stats.unread_count} no leído{stats.unread_count !== 1 ? 's' : ''}</Badge>
                    )}
                    {stats.pending_response_count > 0 && (
                      <Badge variant="warning" className="text-xs">{stats.pending_response_count} requiere respuesta</Badge>
                    )}
                  </div>
                </div>
                <div className="p-2 border-b border-gray-200 dark:border-gray-700 flex flex-wrap gap-2">
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="border rounded-lg px-3 py-1.5 text-sm dark:bg-gray-800 dark:border-gray-600"
                    title="Tipo de mensaje"
                  >
                    <option value="">Todos los tipos</option>
                    {Object.entries(MESSAGE_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <select
                    value={filterRead}
                    onChange={(e) => setFilterRead(e.target.value)}
                    className="border rounded-lg px-3 py-1.5 text-sm dark:bg-gray-800 dark:border-gray-600"
                    title="Estado"
                  >
                    <option value="">Todos</option>
                    <option value="unread">No leídos</option>
                    <option value="read">Leídos</option>
                  </select>
                  <input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                    className="border rounded-lg px-2 py-1.5 text-sm dark:bg-gray-800 dark:border-gray-600 max-w-[140px]"
                    title="Desde"
                  />
                  <input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                    className="border rounded-lg px-2 py-1.5 text-sm dark:bg-gray-800 dark:border-gray-600 max-w-[140px]"
                    title="Hasta"
                  />
                </div>
                <div className="flex-1 overflow-y-auto min-h-[320px] max-h-[calc(100vh-320px)]">
                  {loading ? (
                    <div className="p-8 text-center">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary-600" />
                    </div>
                  ) : filteredInboxMessages.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                      <Mail className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No hay mensajes en tu casilla</p>
                      <p className="text-xs mt-1">
                        {messages.length === 0
                          ? 'Los mensajes enviados por SISCONT aparecerán aquí'
                          : 'No hay mensajes que coincidan con los filtros aplicados'}
                      </p>
                    </div>
                  ) : (
                    filteredInboxMessages.map((msg) => (
                      <div
                        key={msg.id}
                        onClick={() => openMessage(msg)}
                        className={`p-3 cursor-pointer border-b border-gray-100 dark:border-gray-800 last:border-0 transition-colors ${
                          selectedMessage?.id === msg.id
                            ? 'bg-primary-50 dark:bg-primary-900/20 border-l-4 border-l-primary-600'
                            : !msg.is_read
                            ? 'bg-blue-50/50 dark:bg-blue-900/10 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${!msg.is_read ? 'bg-primary-500' : 'bg-transparent'}`} />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 dark:text-gray-100 truncate">{msg.subject}</div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span className={`px-1.5 py-0.5 rounded text-xs ${MESSAGE_TYPE_COLORS[msg.message_type] || 'bg-gray-100'}`}>
                                {MESSAGE_TYPE_LABELS[msg.message_type] || msg.message_type}
                              </span>
                              {(msg.priority === 'ALTA' || msg.priority === 'CRITICA') && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                              {msg.requires_response && !msg.has_response && (
                                <span className="text-amber-600 dark:text-amber-400 text-xs">● Respuesta pendiente</span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {msg.created_by_name} • {formatDate(msg.created_at)}
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Panel derecho: Detalle del mensaje o estado vacío */}
              <div className="flex flex-col min-h-[400px]">
                {loadingDetail ? (
                  <div className="p-12 flex items-center justify-center">
                    <Loader2 className="w-10 h-10 animate-spin text-primary-600" />
                  </div>
                ) : selectedMessage ? (
                  <div className="p-6 overflow-y-auto flex-1">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{selectedMessage.subject}</h3>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className={`px-2 py-1 rounded text-xs ${MESSAGE_TYPE_COLORS[selectedMessage.message_type] || 'bg-gray-100'}`}>
                            {MESSAGE_TYPE_LABELS[selectedMessage.message_type] || selectedMessage.message_type}
                          </span>
                          {(selectedMessage.priority === 'ALTA' || selectedMessage.priority === 'CRITICA') && (
                            <Badge variant={selectedMessage.priority === 'CRITICA' ? 'error' : 'warning'}>
                              {selectedMessage.priority === 'CRITICA' ? 'Prioridad crítica' : 'Alta prioridad'}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedMessage(null)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    {/* Meta info: siempre visible (tipo, prioridad, fechas, estado) */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 mb-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 text-sm">
                      <div>
                        <span className="text-gray-500 dark:text-gray-400 block text-xs">Tipo</span>
                        <span className="font-medium">{MESSAGE_TYPE_LABELS[selectedMessage.message_type] || selectedMessage.message_type}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400 block text-xs">Prioridad</span>
                        <span className="font-medium">{selectedMessage.priority}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400 block text-xs">Fecha de envío</span>
                        <span className="font-medium">{formatDate(selectedMessage.created_at)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400 block text-xs">Fecha límite</span>
                        <span className="font-medium">{selectedMessage.due_date ? formatDate(selectedMessage.due_date) : '—'}</span>
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-gray-500 dark:text-gray-400 block text-xs">Estado</span>
                        <span className="font-medium">
                          {selectedMessage.has_response
                            ? 'Respondido'
                            : selectedMessage.due_date && new Date(selectedMessage.due_date) < new Date() && !selectedMessage.has_response
                            ? 'Vencido'
                            : selectedMessage.is_read
                            ? 'Leído'
                            : 'Enviado'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400 block text-xs">Enviado por</span>
                        <span className="font-medium">{selectedMessage.created_by_name}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4 mb-4">
                      <div />
                      {!selectedMessage.is_acknowledged && empresaId && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowConfirmReceiptModal(true)}
                        >
                          <CheckCircle className="w-3.5 h-3.5 mr-1" />
                          Confirmar recepción
                        </Button>
                      )}
                      {selectedMessage.is_acknowledged && (
                        <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Recepción confirmada {selectedMessage.acknowledged_at ? formatDate(selectedMessage.acknowledged_at) : ''}
                        </span>
                      )}
                    </div>

                    <div
                      className="prose prose-sm dark:prose-invert max-w-none mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
                      dangerouslySetInnerHTML={{ __html: selectedMessage.body.replace(/\n/g, '<br/>') }}
                    />
                    {selectedMessage.attachments.length > 0 && (
                      <div className="mb-6">
                        <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1 mb-2">
                          <Paperclip className="w-4 h-4" /> Adjuntos
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {selectedMessage.attachments.map((a) => (
                            <Button
                              key={a.id}
                              variant="outline"
                              size="sm"
                              onClick={() => downloadMailboxAttachment(a.id, empresaId!, a.file_name)}
                            >
                              <FileText className="w-3.5 h-3.5 mr-1" />
                              {a.file_name}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedMessage.responses.length > 0 && (
                      <div className="mb-6">
                        <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1 mb-2">
                          <CheckCircle className="w-4 h-4" /> Respuestas
                        </div>
                        <div className="space-y-3">
                          {selectedMessage.responses.map((r) => (
                            <div key={r.id} className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                              <div className="text-sm text-green-800 dark:text-green-200 whitespace-pre-wrap">{r.response_text}</div>
                              <div className="text-xs text-green-600 dark:text-green-400 mt-2">
                                {r.created_by_name} • {formatDate(r.created_at)}
                              </div>
                              {r.attachments.length > 0 && (
                                <div className="mt-2 flex gap-2">
                                  {r.attachments.map((ra) => (
                                    <Button
                                      key={ra.id}
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => downloadMailboxResponseAttachment(ra.id, empresaId!, ra.file_name)}
                                    >
                                      {ra.file_name}
                                    </Button>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedMessage.requires_response && selectedMessage.responses.length === 0 && (
                      <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          Responder a este mensaje
                        </label>
                        <textarea
                          value={responseText}
                          onChange={(e) => setResponseText(e.target.value)}
                          placeholder="Escribe tu respuesta..."
                          rows={4}
                          className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 mb-2"
                        />
                        <div className="mb-2">
                          <label className="block text-xs text-gray-500 mb-1">Adjuntos (PDF, Excel, Word, ZIP - máx. 10 MB)</label>
                          <input
                            type="file"
                            multiple
                            accept=".pdf,.xls,.xlsx,.doc,.docx,.zip"
                            onChange={(e) => setResponseFiles(Array.from(e.target.files || []))}
                            className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600"
                          />
                          {responseFiles.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {responseFiles.map((f, i) => (
                                <span key={i} className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs flex items-center gap-1">
                                  {f.name}
                                  <button type="button" onClick={() => setResponseFiles((prev) => prev.filter((_, j) => j !== i))} className="text-red-500 hover:text-red-700">
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <Button onClick={submitResponse} disabled={!responseText.trim() || submittingResponse}>
                          {submittingResponse ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                          Enviar respuesta
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <MailboxEmptyState
                    icon={Inbox}
                    title={isAdmin ? "Bandeja de entrada" : "Tu bandeja de entrada"}
                    subtitle={isAdmin 
                      ? "Selecciona un mensaje en la lista para ver su contenido completo. Aquí aparecen las notificaciones enviadas por SISCONT a esta empresa."
                      : "Selecciona un mensaje en la lista para ver su contenido completo. Aquí aparecen las notificaciones enviadas por SISCONT a tu empresa."
                    }
                  />
                )}
              </div>
            </div>
          ) : (
            <Card className="p-6 text-center text-gray-500 dark:text-gray-400">
              {isAdmin 
                ? "Selecciona una empresa para ver su bandeja de entrada"
                : "Selecciona una empresa para ver la bandeja de entrada"
              }
            </Card>
          )}
        </TabsContentWithValue>

        {isAdmin && (
          <TabsContentWithValue value="sent" activeValue={activeTab} className="mt-4">
            <MailboxSplitView
              title="Mensajes enviados por SISCONT"
              icon={Archive}
              stats={<span>{sentMessages.length} mensaje{sentMessages.length !== 1 ? 's' : ''}</span>}
              filters={
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={sentCompanyId || ''}
                    onChange={(e) => setSentCompanyId(e.target.value ? Number(e.target.value) : null)}
                    className="border rounded-md px-2 py-1 text-sm dark:bg-gray-800 dark:border-gray-600 max-w-[200px]"
                    title="Filtrar por empresa"
                  >
                    <option value="">Todas las empresas</option>
                    {adminCompanies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} {c.ruc ? `(${c.ruc})` : ''}</option>
                    ))}
                  </select>
                  <select
                    value={sentMessageType}
                    onChange={(e) => setSentMessageType(e.target.value)}
                    className="border rounded-md px-2 py-1 text-sm dark:bg-gray-800 dark:border-gray-600"
                    title="Tipo de mensaje"
                  >
                    <option value="">Todos los tipos</option>
                    {Object.entries(MESSAGE_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <select
                    value={sentIsRead}
                    onChange={(e) => setSentIsRead(e.target.value)}
                    className="border rounded-md px-2 py-1 text-sm dark:bg-gray-800 dark:border-gray-600"
                    title="Estado"
                  >
                    <option value="">Todos</option>
                    <option value="unread">No leídos</option>
                    <option value="read">Leídos</option>
                  </select>
                </div>
              }
              listContent={
                loadingSent ? (
                  <div className="p-8 flex justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                  </div>
                ) : sentMessages.length === 0 ? (
                  <div className="p-8 text-left text-gray-500 dark:text-gray-400">
                    <Mail className="w-12 h-12 mb-2 opacity-50" />
                    <p className="text-sm">No hay mensajes enviados</p>
                  </div>
                ) : (
                  sentMessages.map((msg) => (
                    <div
                      key={msg.id}
                      onClick={() => openSentMessage(msg)}
                      className={`p-3 cursor-pointer border-b border-gray-100 dark:border-gray-800 last:border-0 transition-colors ${
                        selectedSentMessage?.id === msg.id
                          ? 'bg-primary-50 dark:bg-primary-900/20 border-l-4 border-l-primary-600'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900 dark:text-gray-100 truncate">{msg.subject}</div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {msg.company_name && (
                              <span className="px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                {msg.company_name}
                              </span>
                            )}
                            <span className={`px-1.5 py-0.5 rounded text-xs ${MESSAGE_TYPE_COLORS[msg.message_type] || 'bg-gray-100'}`}>
                              {MESSAGE_TYPE_LABELS[msg.message_type] || msg.message_type}
                            </span>
                            {(msg.priority === 'ALTA' || msg.priority === 'CRITICA') && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                            {msg.requires_response && !msg.has_response && (
                              <span className="text-amber-600 dark:text-amber-400 text-xs">● Sin respuesta</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {msg.created_by_name} • {formatDate(msg.created_at)}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                      </div>
                    </div>
                  ))
                )
              }
              detailContent={
                loadingSentDetail ? (
                  <div className="p-12 flex items-center justify-center">
                    <Loader2 className="w-10 h-10 animate-spin text-primary-600" />
                  </div>
                ) : selectedSentMessage && selectedSentMessageCompanyId ? (
                  <div className="p-6 overflow-y-auto flex-1">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{selectedSentMessage.subject}</h3>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className={`px-2 py-1 rounded text-xs ${MESSAGE_TYPE_COLORS[selectedSentMessage.message_type] || 'bg-gray-100'}`}>
                          {MESSAGE_TYPE_LABELS[selectedSentMessage.message_type] || selectedSentMessage.message_type}
                        </span>
                        {(selectedSentMessage.priority === 'ALTA' || selectedSentMessage.priority === 'CRITICA') && (
                          <Badge variant={selectedSentMessage.priority === 'CRITICA' ? 'error' : 'warning'}>
                            {selectedSentMessage.priority === 'CRITICA' ? 'Prioridad crítica' : 'Alta prioridad'}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => {
                      setSelectedSentMessage(null)
                      setSelectedSentMessageCompanyId(null)
                    }}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Empresa: {sentMessages.find(m => m.id === selectedSentMessage.id)?.company_name || 'N/A'} • 
                    Enviado por: {selectedSentMessage.created_by_name} • {formatDate(selectedSentMessage.created_at)}
                  </div>
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
                    dangerouslySetInnerHTML={{ __html: selectedSentMessage.body.replace(/\n/g, '<br/>') }}
                  />
                  {selectedSentMessage.attachments.length > 0 && (
                    <div className="mb-6">
                      <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1 mb-2">
                        <Paperclip className="w-4 h-4" /> Adjuntos
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedSentMessage.attachments.map((a) => (
                          <Button
                            key={a.id}
                            variant="outline"
                            size="sm"
                            onClick={() => downloadMailboxAttachment(a.id, selectedSentMessageCompanyId!, a.file_name)}
                          >
                            <FileText className="w-3.5 h-3.5 mr-1" />
                            {a.file_name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedSentMessage.responses.length > 0 && (
                    <div className="mb-6">
                      <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1 mb-2">
                        <CheckCircle className="w-4 h-4" /> Respuestas de la empresa
                      </div>
                      <div className="space-y-3">
                        {selectedSentMessage.responses.map((r) => (
                          <div key={r.id} className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                            <div className="text-sm text-green-800 dark:text-green-200 whitespace-pre-wrap">{r.response_text}</div>
                            <div className="text-xs text-green-600 dark:text-green-400 mt-2">
                              {r.created_by_name} • {formatDate(r.created_at)}
                            </div>
                            {r.attachments.length > 0 && (
                              <div className="mt-2 flex gap-2">
                                {r.attachments.map((ra) => (
                                  <Button
                                    key={ra.id}
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => downloadMailboxResponseAttachment(ra.id, selectedSentMessageCompanyId!, ra.file_name)}
                                  >
                                    {ra.file_name}
                                  </Button>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  </div>
                ) : (
                  <MailboxEmptyState
                    icon={Archive}
                    title="Mensajes enviados"
                    subtitle="Selecciona una empresa y un mensaje en la lista para ver su contenido. Aquí ves lo que SISCONT ha enviado a cada empresa."
                  />
                )
              }
            />
          </TabsContentWithValue>
        )}

        {isAdmin && (
          <TabsContentWithValue value="send" activeValue={activeTab} className="mt-4">
            <Card>
              <CardHeader title="Enviar notificación a empresa" icon={<Send className="w-5 h-5" />} />
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Empresa destinataria</label>
                  <select
                    value={selectedCompanyId || ''}
                    onChange={(e) => setSelectedCompanyId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full border rounded-lg px-3 py-2 dark:bg-gray-800 dark:border-gray-600"
                  >
                    <option value="">Seleccione una empresa</option>
                    {adminCompanies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} {c.ruc ? `(${c.ruc})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Asunto *</label>
                  <input
                    type="text"
                    value={sendForm.subject}
                    onChange={(e) => setSendForm((f) => ({ ...f, subject: e.target.value }))}
                    placeholder="Asunto de la notificación"
                    className="w-full border rounded-lg px-3 py-2 dark:bg-gray-800 dark:border-gray-600"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Tipo de mensaje</label>
                    <select
                      value={sendForm.message_type}
                      onChange={(e) => setSendForm((f) => ({ ...f, message_type: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 dark:bg-gray-800 dark:border-gray-600"
                    >
                      {Object.entries(MESSAGE_TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Prioridad</label>
                    <select
                      value={sendForm.priority}
                      onChange={(e) => setSendForm((f) => ({ ...f, priority: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 dark:bg-gray-800 dark:border-gray-600"
                    >
                      <option value="NORMAL">Normal</option>
                      <option value="ALTA">Alta</option>
                      <option value="CRITICA">Crítica</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Contenido *</label>
                  <textarea
                    value={sendForm.body}
                    onChange={(e) => setSendForm((f) => ({ ...f, body: e.target.value }))}
                    placeholder="Contenido del mensaje (puede incluir HTML básico)"
                    rows={6}
                    className="w-full border rounded-lg px-3 py-2 dark:bg-gray-800 dark:border-gray-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Adjuntos (PDF, Excel, Word, ZIP - máx. 10 MB)</label>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.xls,.xlsx,.doc,.docx,.zip"
                    onChange={(e) => setSendFiles(Array.from(e.target.files || []))}
                    className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600"
                  />
                  {sendFiles.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {sendFiles.map((f, i) => (
                        <span key={i} className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs flex items-center gap-1">
                          {f.name}
                          <button type="button" onClick={() => setSendFiles((prev) => prev.filter((_, j) => j !== i))} className="text-red-500 hover:text-red-700">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sendForm.requires_response}
                      onChange={(e) => setSendForm((f) => ({ ...f, requires_response: e.target.checked }))}
                    />
                    <span className="text-sm">Requiere respuesta</span>
                  </label>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Fecha límite (opcional)</label>
                    <input
                      type="date"
                      value={sendForm.due_date}
                      onChange={(e) => setSendForm((f) => ({ ...f, due_date: e.target.value }))}
                      className="border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600"
                    />
                  </div>
                </div>
                <Button onClick={handleSendMessage} disabled={sending}>
                  {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                  Enviar notificación
                </Button>
              </div>
            </Card>
          </TabsContentWithValue>
        )}

        {isAdmin && (
          <TabsContentWithValue value="incoming" activeValue={activeTab} className="mt-4">
            <MailboxSplitView
              title="Bandeja de entrada"
              icon={Inbox}
              stats={<span>{incomingMessages.length} mensaje{incomingMessages.length !== 1 ? 's' : ''}</span>}
              listContent={
                loadingIncoming ? (
                  <div className="p-8 flex justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                  </div>
                ) : incomingMessages.length === 0 ? (
                  <div className="p-8 text-left text-gray-500 dark:text-gray-400">
                    <Inbox className="w-12 h-12 mb-2 opacity-50" />
                    <p className="text-sm">No hay mensajes en la bandeja de entrada</p>
                  </div>
                ) : (
                  incomingMessages.map((msg) => (
                    <div
                      key={msg.id}
                      onClick={() => openIncomingMessage(msg)}
                      className={`p-3 cursor-pointer border-b border-gray-100 dark:border-gray-800 last:border-0 transition-colors ${
                        selectedIncoming?.id === msg.id
                          ? 'bg-primary-50 dark:bg-primary-900/20 border-l-4 border-l-primary-600'
                          : !msg.is_read
                          ? 'bg-blue-50/50 dark:bg-blue-900/10 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${!msg.is_read ? 'bg-primary-500' : 'bg-transparent'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900 dark:text-gray-100 truncate">{msg.subject}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {msg.company_name} • {msg.created_by_name} • {formatDate(msg.created_at)}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                      </div>
                    </div>
                  ))
                )
              }
              detailContent={
                loadingIncomingDetail ? (
                  <div className="p-12 flex items-center justify-center">
                    <Loader2 className="w-10 h-10 animate-spin text-primary-600" />
                  </div>
                ) : selectedIncoming ? (
                  <div className="p-6 overflow-y-auto flex-1">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{selectedIncoming.subject}</h3>
                        <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                          Empresa: {selectedIncoming.company_name} • De: {selectedIncoming.created_by_name} • {formatDate(selectedIncoming.created_at)}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedIncoming(null)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="prose prose-sm dark:prose-invert max-w-none mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg whitespace-pre-wrap">
                      {selectedIncoming.body}
                    </div>
                    {selectedIncoming.attachments.length > 0 && (
                      <div>
                        <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1 mb-2">
                          <Paperclip className="w-4 h-4" /> Adjuntos
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {selectedIncoming.attachments.map((a) => (
                            <Button
                              key={a.id}
                              variant="outline"
                              size="sm"
                              onClick={() => adminDownloadIncomingAttachment(a.id, a.file_name)}
                            >
                              <FileText className="w-3.5 h-3.5 mr-1" />
                              {a.file_name}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <MailboxEmptyState
                    icon={Inbox}
                    title="Bandeja de entrada"
                    subtitle="Mensajes que las empresas han enviado a SISCONT. Selecciona uno en la lista para ver su contenido."
                  />
                )
              }
            />
          </TabsContentWithValue>
        )}

        {canSendToAdmin && (
          <TabsContentWithValue value="companySend" activeValue={activeTab} className="mt-4">
            <Card>
              <CardHeader title="Enviar mensaje a SISCONT" icon={<ArrowUpCircle className="w-5 h-5" />} />
              <p className="px-6 pb-2 text-sm text-gray-600 dark:text-gray-400">
                Envía una notificación o consulta a SISCONT. Por ejemplo: si recibiste una notificación en tu domicilio y necesitas informar.
              </p>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Asunto *</label>
                  <input
                    type="text"
                    value={companySendForm.subject}
                    onChange={(e) => setCompanySendForm((f) => ({ ...f, subject: e.target.value }))}
                    placeholder="Ej: Notificación recibida en domicilio fiscal"
                    className="w-full border rounded-lg px-3 py-2 dark:bg-gray-800 dark:border-gray-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Mensaje *</label>
                  <textarea
                    value={companySendForm.body}
                    onChange={(e) => setCompanySendForm((f) => ({ ...f, body: e.target.value }))}
                    placeholder="Describe la notificación o consulta..."
                    rows={6}
                    className="w-full border rounded-lg px-3 py-2 dark:bg-gray-800 dark:border-gray-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Adjuntos (PDF, Excel, Word, ZIP - máx. 10 MB)</label>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.xls,.xlsx,.doc,.docx,.zip"
                    onChange={(e) => setCompanySendFiles(Array.from(e.target.files || []))}
                    className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600"
                  />
                  {companySendFiles.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {companySendFiles.map((f, i) => (
                        <span key={i} className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs flex items-center gap-1">
                          {f.name}
                          <button type="button" onClick={() => setCompanySendFiles((prev) => prev.filter((_, j) => j !== i))} className="text-red-500 hover:text-red-700">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <Button onClick={handleCompanySendToAdmin} disabled={companySending}>
                  {companySending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ArrowUpCircle className="w-4 h-4 mr-2" />}
                  Enviar a SISCONT
                </Button>
              </div>
            </Card>
          </TabsContentWithValue>
        )}

        {canSendToAdmin && (
          <TabsContentWithValue value="companySent" activeValue={activeTab} className="mt-4">
            <MailboxSplitView
              title="Mis mensajes enviados"
              icon={Archive}
              stats={<span>{companySentMessages.length} mensaje{companySentMessages.length !== 1 ? 's' : ''}</span>}
              listContent={
                loadingCompanySent ? (
                  <div className="p-8 flex justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                  </div>
                ) : companySentMessages.length === 0 ? (
                  <div className="p-8 text-left text-gray-500 dark:text-gray-400">
                    <Mail className="w-12 h-12 mb-2 opacity-50" />
                    <p className="text-sm">No has enviado mensajes a SISCONT</p>
                  </div>
                ) : (
                  companySentMessages.map((msg) => (
                    <div
                      key={msg.id}
                      onClick={() => openCompanySentMessage(msg)}
                      className={`p-3 cursor-pointer border-b border-gray-100 dark:border-gray-800 last:border-0 transition-colors ${
                        selectedCompanySentMessage?.id === msg.id
                          ? 'bg-primary-50 dark:bg-primary-900/20 border-l-4 border-l-primary-600'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900 dark:text-gray-100 truncate">{msg.subject}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {formatDate(msg.created_at)} • {msg.created_by_name}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )
              }
              detailContent={
                loadingCompanySentDetail ? (
                  <div className="p-8 flex justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                  </div>
                ) : selectedCompanySentMessage ? (
                  <div className="h-full flex flex-col">
                    <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">{selectedCompanySentMessage.subject}</h3>
                          <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <span>Enviado por: {selectedCompanySentMessage.created_by_name}</span>
                            <span>Fecha: {formatDate(selectedCompanySentMessage.created_at)}</span>
                            <span>
                              Estado: {selectedCompanySentMessage.is_read ? 'Leído por SISCONT' : 'Recibido'}
                              {selectedCompanySentMessage.read_at && ` (${formatDate(selectedCompanySentMessage.read_at)})`}
                            </span>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedCompanySentMessage(null)} title="Cerrar">
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6">
                      <div 
                        className="prose prose-sm dark:prose-invert max-w-none"
                        dangerouslySetInnerHTML={{ __html: selectedCompanySentMessage.body.replace(/\n/g, '<br/>') }}
                      />
                      {selectedCompanySentMessage.attachments.length > 0 && (
                        <div className="mt-6">
                          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Adjuntos</h4>
                          <div className="space-y-2">
                            {selectedCompanySentMessage.attachments.map((a) => (
                              <div key={a.id} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                                <Paperclip className="w-4 h-4 text-gray-500" />
                                <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">{a.file_name}</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    if (!empresaId) return
                                    downloadCompanyOutgoingAttachment(
                                      selectedCompanySentMessage.id,
                                      a.id,
                                      empresaId,
                                      a.file_name
                                    ).catch(() => setMessage({ type: 'error', text: 'Error al descargar el adjunto' }))
                                  }}
                                >
                                  Descargar
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <MailboxEmptyState
                    icon={Archive}
                    title="Mis mensajes enviados"
                    subtitle="Mensajes que has enviado a SISCONT. Selecciona uno en la lista para ver los detalles."
                  />
                )
              }
            />
          </TabsContentWithValue>
        )}
      </Tabs>

      <MailboxLegalDisclaimerFooter onShowFull={() => setShowDisclaimerModal(true)} />
    </div>
  )
}
