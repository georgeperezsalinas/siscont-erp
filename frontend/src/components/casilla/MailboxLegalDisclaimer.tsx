/**
 * Casilla Electrónica SISCONT - Avisos Legales
 * Textos oficiales para cumplimiento legal (SUNAT / SAP / Poder Judicial)
 */
import { Shield } from 'lucide-react'

export const LEGAL_DISCLAIMER_FULL = `Casilla Electrónica SISCONT – Aviso Legal

La Casilla Electrónica SISCONT constituye un medio oficial de comunicación entre SISCONT y la empresa usuaria.

Las notificaciones, requerimientos, comunicaciones y documentos depositados en esta casilla se consideran válidamente comunicados desde el momento de su registro, independientemente de su lectura efectiva.

Los mensajes y documentos son inmutables, no editables y no eliminables, y cuentan con registro de fecha, hora y usuario, constituyendo evidencia digital para fines administrativos, contables y legales.

La empresa usuaria es responsable de revisar periódicamente su Casilla Electrónica y atender los plazos establecidos.

El uso de esta casilla implica la aceptación expresa de estas condiciones.`

export const LEGAL_DISCLAIMER_SHORT = 'Esta Casilla Electrónica es un medio oficial de comunicación. Los mensajes son inmutables y generan constancia legal.'

export const LEGAL_CONFIRM_RECEIPT = 'Declaro haber tomado conocimiento del contenido de esta notificación.'

interface MailboxLegalDisclaimerFooterProps {
  onShowFull?: () => void
}

const LEGAL_PARAGRAPHS = [
  'La Casilla Electrónica SISCONT constituye un medio oficial de comunicación entre SISCONT y la empresa usuaria.',
  'Las notificaciones, requerimientos, comunicaciones y documentos depositados en esta casilla se consideran válidamente comunicados desde el momento de su registro, independientemente de su lectura efectiva.',
  'Los mensajes y documentos son inmutables, no editables y no eliminables, y cuentan con registro de fecha, hora y usuario, constituyendo evidencia digital para fines administrativos, contables y legales.',
  'La empresa usuaria es responsable de revisar periódicamente su Casilla Electrónica y atender los plazos establecidos.',
  'El uso de esta casilla implica la aceptación expresa de estas condiciones.',
]

export function MailboxLegalDisclaimerFooter({ onShowFull }: MailboxLegalDisclaimerFooterProps) {
  return (
    <div className="mt-8">
      <div className="rounded-xl border border-primary-200 dark:border-primary-800 bg-gradient-to-br from-primary-50/50 to-white dark:from-primary-950/30 dark:to-gray-900 p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 p-2.5 rounded-lg bg-primary-100 dark:bg-primary-900/50">
            <Shield className="w-6 h-6 text-primary-600 dark:text-primary-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold text-primary-800 dark:text-primary-200 mb-4 tracking-wide uppercase">
              Casilla Electrónica SISCONT – Aviso Legal
            </h4>
            <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              {LEGAL_PARAGRAPHS.map((p, i) => (
                <p key={i} className="first:mt-0">
                  {p}
                </p>
              ))}
            </div>
            {onShowFull && (
              <button
                type="button"
                onClick={onShowFull}
                className="mt-4 text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:underline transition-colors"
              >
                Ver aviso legal completo
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

interface MailboxLegalDisclaimerShortProps {
  className?: string
  subtitle?: string
}

export function MailboxLegalDisclaimerShort({ className = '', subtitle }: MailboxLegalDisclaimerShortProps) {
  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-lg border border-primary-200 dark:border-primary-800 bg-primary-50/40 dark:bg-primary-950/20 ${className}`}
    >
      <Shield className="w-5 h-5 flex-shrink-0 text-primary-600 dark:text-primary-400 mt-0.5" />
      <div className="flex-1 min-w-0">
        {subtitle ? (
          <>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              {subtitle}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
              {LEGAL_DISCLAIMER_SHORT}
            </p>
          </>
        ) : (
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            {LEGAL_DISCLAIMER_SHORT}
          </p>
        )}
      </div>
    </div>
  )
}
