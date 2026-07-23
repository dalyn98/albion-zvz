'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AlertTriangle } from 'lucide-react'
import {
  updateSlotTemplate,
  type SlotTemplateRecord,
} from '@/app/actions/slot-templates'
import { getServerActionClientErrorMessage } from '@/lib/server-action-client-error'
import { applyTemplateToSlotInput, slotInputToTemplateData } from '@/lib/slot-template-shape'
import { CATEGORY_I18N_SLUG, EVENT_CATEGORIES, type EventCategory } from '@/types'
import SlotEditor, { emptySlotInput, type SlotInput } from './SlotEditor'
import { useReportDirty } from './UnsavedChangesProvider'
import { useBodyScrollLock } from './useBodyScrollLock'

interface BuildTemplateEditorProps {
  template: SlotTemplateRecord
  timezone: string
}

export default function BuildTemplateEditor({ template, timezone }: BuildTemplateEditorProps) {
  const t = useTranslations('adminBuildTemplates')
  const tTemplates = useTranslations('adminTemplates')
  const tCommon = useTranslations('common')
  const tActionError = useTranslations('adminActionError')
  const router = useRouter()
  const [name, setName] = useState(template.name)
  const [category, setCategory] = useState<EventCategory>(template.category)
  const [slot, setSlot] = useState<SlotInput>(() =>
    applyTemplateToSlotInput(emptySlotInput(1), template.data),
  )
  const [error, setError] = useState('')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [conflict, setConflict] = useState<{ id: string; name: string } | null>(null)
  const [pending, startTransition] = useTransition()
  useBodyScrollLock(conflict !== null)
  const [savedSerialized, setSavedSerialized] = useState(() =>
    JSON.stringify({
      name: template.name,
      category: template.category,
      slot: applyTemplateToSlotInput(emptySlotInput(1), template.data),
    }),
  )
  const dirty = JSON.stringify({ name, category, slot }) !== savedSerialized
  useReportDirty(`build-template-editor:${template.id}`, dirty)

  const runSave = (overwrite: boolean) => {
    setError('')
    setSavedAt(null)
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof updateSlotTemplate>>
      try {
        result = await updateSlotTemplate(
          template.id,
          {
            name,
            category,
            data: slotInputToTemplateData(slot),
          },
          { overwrite },
        )
      } catch (error) {
        setError(getServerActionClientErrorMessage(error, {
          expired: tActionError('serverActionExpired'),
          fallback: tActionError('serverError'),
        }))
        setConflict(null)
        return
      }
      if (result.error) {
        setError(result.error)
        setConflict(null)
        return
      }
      if (result.conflictId && result.conflictName && !overwrite) {
        setConflict({ id: result.conflictId, name: result.conflictName })
        return
      }
      setConflict(null)
      setSavedAt(Date.now())
      setSavedSerialized(JSON.stringify({ name, category, slot }))
      router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
        <div>
          <label className="text-gray-400 text-[11px] font-semibold block mb-1">{t('nameLabel')}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-base text-white focus:outline-none focus:border-amber-500"
          />
        </div>
        <div>
          <label className="text-gray-400 text-[11px] font-semibold block mb-1">{t('categoryLabel')}</label>
          <div className="inline-flex bg-gray-800 border border-gray-700 rounded-lg p-0.5 text-xs font-semibold">
            {EVENT_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  category === c ? 'bg-amber-500 text-black' : 'text-gray-400 hover:text-white'
                }`}
              >
                {tTemplates(`slotTemplateCategory_${CATEGORY_I18N_SLUG[c]}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-white">{t('buildConfigTitle')}</h2>
          <p className="text-gray-400 text-xs sm:text-sm mt-1">{t('buildConfigDescription')}</p>
        </div>
        <SlotEditor
          slot={slot}
          partyNumber={1}
          autoRegearEnabled={false}
          eventCategory={category}
          timezone={timezone}
          presentation="workspace"
          onChange={setSlot}
          onDelete={() => setSlot(emptySlotInput(1))}
        />
      </section>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <div className="sticky bottom-4 z-30 flex items-center justify-end gap-3 pointer-events-none">
        {savedAt && !pending && (
          <span className="pointer-events-auto bg-gray-900/90 backdrop-blur border border-gray-700 text-green-400 text-xs px-2.5 py-1.5 rounded-lg shadow-lg">
            {t('savedMessage')}
          </span>
        )}
        <button
          type="button"
          onClick={() => runSave(false)}
          disabled={pending}
          className="pointer-events-auto bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold px-6 py-2.5 rounded-xl text-sm transition-colors shadow-lg shadow-black/40"
        >
          {pending ? t('savingDots') : t('saveButton')}
        </button>
      </div>

      {conflict && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
          onClick={() => !pending && setConflict(null)}
        >
          <div
            className="bg-gray-900 border border-amber-500/40 rounded-2xl w-full max-w-sm p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle size={18} className="text-amber-400 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <h3 className="font-bold text-white text-base">{t('overwriteTitle')}</h3>
                <p className="text-gray-300 text-xs leading-relaxed">
                  {t('overwriteBody', { name: conflict.name })}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => !pending && setConflict(null)}
                disabled={pending}
                className="text-gray-400 hover:text-white text-sm px-3 py-2 disabled:opacity-40"
              >
                {tCommon('cancel')}
              </button>
              <button
                type="button"
                onClick={() => runSave(true)}
                disabled={pending}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold px-4 py-2 rounded-lg text-sm"
              >
                {pending ? t('savingDots') : t('overwriteConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
