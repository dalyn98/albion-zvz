'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { FolderDown, X, AlertTriangle } from 'lucide-react'
import { applyTemplate, type TemplateSummary } from '@/app/actions/templates'
import { formatDate } from '@/lib/format-datetime'
import { getServerActionClientErrorMessage } from '@/lib/server-action-client-error'
import { DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone'

interface Props {
  eventId: string
  templates: TemplateSummary[]
  timezone?: string
  // 이벤트에 이미 파티가 있으면 적용 시 덮어쓰기 확인을 한 번 더 받는다.
  hasExistingParties: boolean
}

export default function LoadTemplateButton({
  eventId,
  templates,
  timezone = DEFAULT_TENANT_TIMEZONE,
  hasExistingParties,
}: Props) {
  const t = useTranslations('adminTemplates')
  const tCommon = useTranslations('common')
  const tActionError = useTranslations('adminActionError')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [confirmingOverwrite, setConfirmingOverwrite] = useState(false)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const runApply = (overwrite: boolean) => {
    if (!selected) return
    setError('')
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof applyTemplate>>
      try {
        result = await applyTemplate(eventId, selected, { overwrite })
      } catch (error) {
        setError(getServerActionClientErrorMessage(error, {
          expired: tActionError('serverActionExpired'),
          fallback: tActionError('serverError'),
        }))
        setConfirmingOverwrite(false)
        return
      }
      if (result.error) {
        setError(result.error)
        setConfirmingOverwrite(false)
        return
      }
      setOpen(false)
      setConfirmingOverwrite(false)
      router.refresh()
    })
  }

  const submit = () => {
    if (!selected) return
    if (hasExistingParties) {
      setConfirmingOverwrite(true)
      return
    }
    runApply(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setSelected(null)
          setError('')
          setConfirmingOverwrite(false)
          setOpen(true)
        }}
        className="flex items-center gap-1.5 text-xs font-medium text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 rounded-lg px-3 py-2 transition-colors"
      >
        <FolderDown size={13} />
        {t('loadFromTemplate')}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md max-h-[80dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
              <h3 className="font-bold text-white text-base">{t('loadFromTemplate')}</h3>
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                className="p-1 text-gray-400 hover:text-white"
                aria-label={tCommon('close')}
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
              {hasExistingParties && (
                <div className="bg-amber-500/10 border border-amber-500/40 rounded-lg px-3 py-2 flex items-start gap-2">
                  <AlertTriangle size={14} className="text-amber-300 mt-0.5 shrink-0" />
                  <p className="text-amber-200 text-xs leading-relaxed">
                    {t('applyOverwriteWarning')}
                  </p>
                </div>
              )}
              {templates.length === 0 ? (
                <p className="text-gray-500 text-xs text-center py-4">
                  {t('noTemplates')}
                </p>
              ) : (
                templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setSelected(tpl.id)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-left transition-colors ${
                      selected === tpl.id
                        ? 'bg-sky-500/20 border-sky-500/50'
                        : 'bg-gray-800 border-gray-700 hover:bg-gray-700'
                    }`}
                  >
                    <span className="text-white text-sm truncate">{tpl.name}</span>
                    <span className="text-gray-500 text-[10px] font-mono flex-shrink-0">
                      {formatDate(tpl.created_at, timezone)}
                    </span>
                  </button>
                ))
              )}
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  <p className="text-red-400 text-xs">{error}</p>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-700 flex-shrink-0">
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                className="text-gray-400 hover:text-white text-sm px-3 py-2"
                disabled={pending}
              >
                {tCommon('cancel')}
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending || !selected}
                className="bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg text-sm"
              >
                {pending ? t('applying') : t('apply')}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmingOverwrite && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
          onClick={() => !pending && setConfirmingOverwrite(false)}
        >
          <div
            className="bg-gray-900 border border-amber-500/40 rounded-2xl w-full max-w-sm p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle size={18} className="text-amber-400 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <h3 className="font-bold text-white text-base">{t('applyOverwriteTitle')}</h3>
                <p className="text-gray-300 text-xs leading-relaxed">
                  {t('applyOverwriteBody')}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => !pending && setConfirmingOverwrite(false)}
                disabled={pending}
                className="text-gray-400 hover:text-white text-sm px-3 py-2 disabled:opacity-40"
              >
                {tCommon('cancel')}
              </button>
              <button
                type="button"
                onClick={() => runApply(true)}
                disabled={pending}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold px-4 py-2 rounded-lg text-sm"
              >
                {pending ? t('applying') : t('applyOverwriteConfirmBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
