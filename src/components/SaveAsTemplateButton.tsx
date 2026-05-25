'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Save, X, AlertTriangle } from 'lucide-react'
import { saveEventAsTemplate, type TemplateSummary } from '@/app/actions/templates'
import { formatDate } from '@/lib/format-datetime'
import { DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone'

interface Props {
  eventId: string
  defaultName: string
  templates: TemplateSummary[]
  timezone?: string
}

type Mode = 'new' | 'overwrite'

export default function SaveAsTemplateButton({
  eventId,
  defaultName,
  templates,
  timezone = DEFAULT_TENANT_TIMEZONE,
}: Props) {
  const t = useTranslations('adminTemplates')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('new')
  const [name, setName] = useState(defaultName)
  const [error, setError] = useState('')
  const [conflictName, setConflictName] = useState<string | null>(null)
  const [overwriteTarget, setOverwriteTarget] = useState<TemplateSummary | null>(null)
  const [pending, startTransition] = useTransition()

  const closeModal = () => {
    setOpen(false)
    setConflictName(null)
    setOverwriteTarget(null)
  }

  const runSaveNew = (overwrite: boolean) => {
    setError('')
    startTransition(async () => {
      const result = await saveEventAsTemplate(eventId, name, { overwrite })
      if (result.error) {
        setError(result.error)
        setConflictName(null)
        return
      }
      if (result.conflictId && !overwrite) {
        // 같은 이름의 기존 템플릿 발견 — 사용자에게 덮어쓰기 의사 확인.
        setConflictName(result.conflictName ?? name)
        return
      }
      closeModal()
      router.refresh()
    })
  }

  const runSaveOverwriteById = (target: TemplateSummary) => {
    setError('')
    startTransition(async () => {
      const result = await saveEventAsTemplate(eventId, '', { overwriteId: target.id })
      if (result.error) {
        setError(result.error)
        return
      }
      closeModal()
      router.refresh()
    })
  }

  const submitNew = () => {
    if (!name.trim()) return
    runSaveNew(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMode('new')
          setName(defaultName)
          setError('')
          setConflictName(null)
          setOverwriteTarget(null)
          setOpen(true)
        }}
        className="flex items-center gap-1.5 text-xs font-medium text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg px-3 py-2 transition-colors"
      >
        <Save size={13} />
        {t('saveAsTemplateButton')}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => !pending && closeModal()}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md max-h-[88dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
              <h3 className="font-bold text-white text-base">{t('saveAsTemplateButton')}</h3>
              <button
                type="button"
                onClick={() => !pending && closeModal()}
                className="p-1 text-gray-400 hover:text-white"
                aria-label={tCommon('close')}
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex border-b border-gray-700 flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  setMode('new')
                  setError('')
                }}
                className={`flex-1 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  mode === 'new'
                    ? 'text-amber-300 border-amber-400'
                    : 'text-gray-400 border-transparent hover:text-white'
                }`}
              >
                {t('saveModeNew')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('overwrite')
                  setError('')
                }}
                className={`flex-1 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  mode === 'overwrite'
                    ? 'text-amber-300 border-amber-400'
                    : 'text-gray-400 border-transparent hover:text-white'
                }`}
              >
                {t('saveModeOverwrite')}
              </button>
            </div>

            {mode === 'new' ? (
              <>
                <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
                  <p className="text-gray-400 text-xs">{t('saveAsTemplateDescription')}</p>
                  <div>
                    <label className="text-gray-400 text-xs font-semibold block mb-1">
                      {t('nameLabel')}
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value)
                        setConflictName(null)
                      }}
                      placeholder={t('templateNamePlaceholder')}
                      maxLength={80}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                      autoFocus
                    />
                  </div>
                  {error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                      <p className="text-red-400 text-xs">{error}</p>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-700 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => !pending && closeModal()}
                    className="text-gray-400 hover:text-white text-sm px-3 py-2"
                    disabled={pending}
                  >
                    {tCommon('cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={submitNew}
                    disabled={pending || !name.trim()}
                    className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold px-4 py-2 rounded-lg text-sm"
                  >
                    {pending ? t('savingDots') : tCommon('save')}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
                {templates.length === 0 ? (
                  <p className="text-gray-500 text-xs text-center py-6">
                    {t('saveOverwriteListEmpty')}
                  </p>
                ) : (
                  <>
                    <p className="text-gray-400 text-xs leading-relaxed">
                      {t('saveOverwriteListHint')}
                    </p>
                    {templates.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => setOverwriteTarget(tpl)}
                        disabled={pending}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border bg-gray-800 border-gray-700 hover:bg-gray-700 hover:border-amber-500/50 text-left transition-colors disabled:opacity-50"
                      >
                        <span className="text-white text-sm truncate">{tpl.name}</span>
                        <span className="text-gray-500 text-[10px] font-mono flex-shrink-0">
                          {t('saveOverwriteByIdSavedAt', {
                            when: formatDate(tpl.created_at, timezone),
                          })}
                        </span>
                      </button>
                    ))}
                  </>
                )}
                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                    <p className="text-red-400 text-xs">{error}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {conflictName && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
          onClick={() => !pending && setConflictName(null)}
        >
          <div
            className="bg-gray-900 border border-amber-500/40 rounded-2xl w-full max-w-sm p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle size={18} className="text-amber-400 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <h3 className="font-bold text-white text-base">{t('saveOverwriteTitle')}</h3>
                <p className="text-gray-300 text-xs leading-relaxed">
                  {t('saveOverwriteBody', { name: conflictName })}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => !pending && setConflictName(null)}
                disabled={pending}
                className="text-gray-400 hover:text-white text-sm px-3 py-2 disabled:opacity-40"
              >
                {tCommon('cancel')}
              </button>
              <button
                type="button"
                onClick={() => runSaveNew(true)}
                disabled={pending}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold px-4 py-2 rounded-lg text-sm"
              >
                {pending ? t('savingDots') : t('saveOverwriteConfirmBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {overwriteTarget && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
          onClick={() => !pending && setOverwriteTarget(null)}
        >
          <div
            className="bg-gray-900 border border-amber-500/40 rounded-2xl w-full max-w-sm p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle size={18} className="text-amber-400 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <h3 className="font-bold text-white text-base">{t('saveOverwriteByIdConfirmTitle')}</h3>
                <p className="text-gray-300 text-xs leading-relaxed">
                  {t('saveOverwriteByIdConfirmBody', { name: overwriteTarget.name })}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => !pending && setOverwriteTarget(null)}
                disabled={pending}
                className="text-gray-400 hover:text-white text-sm px-3 py-2 disabled:opacity-40"
              >
                {tCommon('cancel')}
              </button>
              <button
                type="button"
                onClick={() => runSaveOverwriteById(overwriteTarget)}
                disabled={pending}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold px-4 py-2 rounded-lg text-sm"
              >
                {pending ? t('savingDots') : t('saveOverwriteConfirmBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
