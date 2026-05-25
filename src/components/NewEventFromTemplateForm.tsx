'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { LayoutTemplate } from 'lucide-react'
import { createEventFromTemplate, type TemplateSummary } from '@/app/actions/templates'
import { CATEGORY_I18N_SLUG, type EventCategory } from '@/types'
import { useReportDirty } from './UnsavedChangesProvider'

interface Props {
  templates: TemplateSummary[]
  allowedCategories: EventCategory[]
}

export default function NewEventFromTemplateForm({
  templates,
  allowedCategories,
}: Props) {
  const router = useRouter()
  const t = useTranslations('adminNewEvent')
  const tForm = useTranslations('adminEventForm')
  const tCommon = useTranslations('common')
  const titleId = useId()
  const visibleCategories: EventCategory[] = allowedCategories
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<EventCategory>(visibleCategories[0] ?? '전투')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useReportDirty('new-event-template', title.trim() !== '' || templateId !== (templates[0]?.id ?? ''))

  const submit = async () => {
    const trimmed = title.trim()
    if (!templateId || !trimmed) {
      setError(t('templateStartRequired'))
      return
    }
    setError('')
    setLoading(true)
    const result = await createEventFromTemplate(templateId, { title: trimmed, category })
    if (result.error || !result.id) {
      setError(result.error ?? t('templateStartFailed'))
      setLoading(false)
      return
    }
    router.push(`/admin/dashboard/events/${result.id}`)
  }

  if (templates.length === 0) {
    return (
      <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-5">
        <div className="flex items-start gap-2">
          <LayoutTemplate size={16} className="text-sky-300 mt-0.5" />
          <div>
            <h2 className="font-bold text-white text-sm">{t('templateStartTitle')}</h2>
            <p className="text-gray-500 text-xs mt-1">{t('templateStartEmpty')}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
      <div className="flex items-start gap-2">
        <LayoutTemplate size={16} className="text-sky-300 mt-0.5" />
        <div>
          <h2 className="font-bold text-white">{t('templateStartTitle')}</h2>
          <p className="text-gray-400 text-xs mt-1">{t('templateStartDescription')}</p>
        </div>
      </div>

      <div>
        <label className="text-gray-400 text-xs mb-1 block">{t('templateLabel')}</label>
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
        >
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={titleId} className="text-gray-400 text-xs mb-1 block">{tForm('titleLabel')}</label>
        <input
          id={titleId}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !loading) submit()
          }}
          placeholder={tForm('titlePlaceholder')}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-base text-white placeholder-gray-500 focus:outline-none focus:border-sky-500"
        />
      </div>

      <div>
        <label className="text-gray-400 text-xs mb-1 block">{tForm('categoryLabel')}</label>
        <div className="inline-flex bg-gray-800 border border-gray-700 rounded-lg p-0.5 text-sm font-semibold">
          {visibleCategories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`px-4 py-1.5 rounded-md transition-colors ${
                category === c ? 'bg-sky-500 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {tForm(`category_${CATEGORY_I18N_SLUG[c]}`)}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={loading || !title.trim() || !templateId}
        className="bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-lg transition-colors"
      >
        {loading ? tCommon('saving') : t('templateStartSubmit')}
      </button>
    </div>
  )
}
