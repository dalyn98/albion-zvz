'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { FolderDown, X } from 'lucide-react'
import { applyTemplate, type TemplateSummary } from '@/app/actions/templates'
import { formatDate } from '@/lib/format-datetime'

interface Props {
  eventId: string
  templates: TemplateSummary[]
}

export default function LoadTemplateButton({ eventId, templates }: Props) {
  const t = useTranslations('adminTemplates')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const submit = () => {
    if (!selected) return
    setError('')
    startTransition(async () => {
      const result = await applyTemplate(eventId, selected)
      if (result.error) {
        setError(result.error)
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setSelected(null)
          setError('')
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
                      {formatDate(tpl.created_at)}
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
    </>
  )
}
