'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Save, X } from 'lucide-react'
import { saveSlotAsTemplate } from '@/app/actions/slot-templates'
import { slotInputToTemplateData } from '@/lib/slot-template-shape'
import { CATEGORY_I18N_SLUG, EVENT_CATEGORIES, type EventCategory } from '@/types'
import type { SlotInput } from './SlotEditor'

interface Props {
  slot: SlotInput
  defaultName: string
  // 편집 중인 이벤트 카테고리가 있다면 초기값으로 사용. 없으면 '전투' 기본.
  defaultCategory?: EventCategory
}

const MAX_NAME_LENGTH = 80

export default function SaveSlotAsTemplateButton({ slot, defaultName, defaultCategory }: Props) {
  const t = useTranslations('adminTemplates')
  const tCommon = useTranslations('common')
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(defaultName)
  const [category, setCategory] = useState<EventCategory>(defaultCategory ?? '전투')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const runSave = (data: ReturnType<typeof slotInputToTemplateData>, overwrite: boolean) => {
    startTransition(async () => {
      const result = await saveSlotAsTemplate(name, data, category, overwrite)
      if (result.error) {
        setError(result.error)
        return
      }
      if (result.requiresConfirmation) {
        // 같은 이름의 템플릿이 이미 있다 — 사용자가 덮어쓰기를 확정해야만 update 진행.
        const confirmMsg = t('slotTemplateOverwriteConfirm', { name: name.trim() })
        if (typeof window !== 'undefined' && window.confirm(confirmMsg)) {
          runSave(data, true)
        }
        return
      }
      setSaved(true)
      setOpen(false)
    })
  }

  const submit = () => {
    setError('')
    setSaved(false)
    const data = slotInputToTemplateData(slot)
    runSave(data, false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setName(defaultName)
          setCategory(defaultCategory ?? '전투')
          setError('')
          setSaved(false)
          setOpen(true)
        }}
        className="flex items-center gap-1 text-[11px] font-medium text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-md px-2 py-1 transition-colors"
        title={t('slotTemplateSaveTooltip')}
      >
        <Save size={11} />
        {t('slotTemplateSaveBtn')}
      </button>

      {saved && (
        <span className="text-[11px] text-emerald-400 ml-1 self-center">{tCommon('saved')}</span>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <h3 className="font-bold text-white text-base">{t('slotTemplateSaveTitle')}</h3>
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
                {t('slotTemplateSaveDescription')}
              </p>
              <div>
                <label className="text-gray-400 text-xs font-semibold block mb-1">{t('nameLabel')}</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('slotTemplatePlaceholder')}
                  maxLength={MAX_NAME_LENGTH}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs font-semibold block mb-1">
                  {t('slotTemplateCategoryLabel')}
                </label>
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
                      {t(`slotTemplateCategory_${CATEGORY_I18N_SLUG[c]}`)}
                    </button>
                  ))}
                </div>
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
