'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus, X } from 'lucide-react'
import { createSlotTemplate } from '@/app/actions/slot-templates'
import { getServerActionClientErrorMessage } from '@/lib/server-action-client-error'
import { CATEGORY_I18N_SLUG, EVENT_CATEGORIES, type EventCategory } from '@/types'

export default function CreateBuildTemplateButton() {
  const t = useTranslations('adminBuildTemplates')
  const tTemplates = useTranslations('adminTemplates')
  const tCommon = useTranslations('common')
  const tActionError = useTranslations('adminActionError')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<EventCategory>('전투')
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState<{ id: string; name: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const reset = () => {
    setOpen(false)
    setName('')
    setCategory('전투')
    setError('')
    setConflict(null)
  }

  const submit = () => {
    setError('')
    setConflict(null)
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof createSlotTemplate>>
      try {
        result = await createSlotTemplate(name, category)
      } catch (error) {
        setError(getServerActionClientErrorMessage(error, {
          expired: tActionError('serverActionExpired'),
          fallback: tActionError('serverError'),
        }))
        return
      }
      if (result.error) {
        setError(result.error)
        return
      }
      if (result.conflictId && result.conflictName) {
        setConflict({ id: result.conflictId, name: result.conflictName })
        return
      }
      if (result.id) router.push(`/admin/dashboard/builds/${result.id}`)
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm px-3 py-1.5 rounded-lg transition-colors"
      >
        <Plus size={14} />
        {t('createButton')}
      </button>
    )
  }

  return (
    <div className="bg-gray-900 border border-amber-500/40 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-white text-sm font-semibold">{t('createTitle')}</h3>
        <button
          type="button"
          onClick={reset}
          className="text-gray-500 hover:text-white"
          aria-label={tCommon('cancel')}
        >
          <X size={16} />
        </button>
      </div>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={80}
        autoFocus
        placeholder={t('namePlaceholder')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !pending) {
            e.preventDefault()
            submit()
          }
        }}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
      />
      <div className="inline-flex bg-gray-800 border border-gray-700 rounded-lg p-0.5 text-xs font-semibold">
        {EVENT_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`px-3 py-1 rounded-md transition-colors ${
              category === c ? 'bg-amber-500 text-black' : 'text-gray-400 hover:text-white'
            }`}
          >
            {tTemplates(`slotTemplateCategory_${CATEGORY_I18N_SLUG[c]}`)}
          </button>
        ))}
      </div>
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      )}
      {conflict && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 space-y-2">
          <p className="text-amber-200 text-xs">
            {t('createConflict', { name: conflict.name })}
          </p>
          <button
            type="button"
            onClick={() => router.push(`/admin/dashboard/builds/${conflict.id}`)}
            className="text-amber-300 hover:text-amber-200 text-xs font-semibold underline"
          >
            {t('createConflictGoEdit')}
          </button>
        </div>
      )}
      <div className="flex items-center gap-2 justify-end">
        <button
          type="button"
          onClick={reset}
          disabled={pending}
          className="text-gray-400 hover:text-white text-sm px-3 py-1.5"
        >
          {tCommon('cancel')}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending || name.trim().length === 0}
          className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-semibold text-sm px-4 py-1.5 rounded-lg transition-colors"
        >
          {pending ? t('creatingDots') : t('createSubmit')}
        </button>
      </div>
    </div>
  )
}
