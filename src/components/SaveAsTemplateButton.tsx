'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Save, X } from 'lucide-react'
import { saveEventAsTemplate } from '@/app/actions/templates'

interface Props {
  eventId: string
  defaultName: string
}

export default function SaveAsTemplateButton({ eventId, defaultName }: Props) {
  const t = useTranslations('adminTemplates')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(defaultName)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const submit = () => {
    setError('')
    startTransition(async () => {
      const result = await saveEventAsTemplate(eventId, name)
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
          setName(defaultName)
          setError('')
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
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <h3 className="font-bold text-white text-base">{t('saveAsTemplateButton')}</h3>
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                className="p-1 text-gray-400 hover:text-white"
                aria-label={tCommon('close')}
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-gray-400 text-xs">
                {t('saveAsTemplateDescription')}
              </p>
              <div>
                <label className="text-gray-400 text-xs font-semibold block mb-1">{t('nameLabel')}</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
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
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-700">
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
                disabled={pending || !name.trim()}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold px-4 py-2 rounded-lg text-sm"
              >
                {pending ? t('savingDots') : tCommon('save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
