'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import ItemPicker from './ItemPicker'
import type { SlotInput } from './SlotEditor'
import { SLOT_PICKER_CATEGORY, SLOT_ROLES } from '@/types'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import {
  previewBatchItems,
  type BatchApplyScope,
  type BatchItemPicks,
} from '@/lib/slot-workspace'
import { useBodyScrollLock } from './useBodyScrollLock'

// Party-wide item batch apply for potion + mount. Unlike BatchApplySpecsModal
// (which fills tier/enchant metadata without touching item identity), this
// overwrites the fixed item name/id for every slot in the party.
// Slots in option (multi) mode are skipped — their fixed columns are null by
// convention and should stay that way.

type Pick = { name: string; id: string } | null

interface Props {
  slots: SlotInput[]
  selectedSlotIds?: readonly string[]
  onApply: (picks: BatchItemPicks, scope: BatchApplyScope) => void
  onClose: () => void
}

export default function BatchApplyItemsModal({
  slots,
  selectedSlotIds = [],
  onApply,
  onClose,
}: Props) {
  const t = useTranslations('adminParty')
  const tGear = useTranslations('gear')
  const tCommon = useTranslations('common')
  const tRole = useTranslations('slotRole')
  const [potion, setPotion] = useState<Pick>(null)
  const [mount, setMount] = useState<Pick>(null)
  const [scope, setScope] = useState<BatchApplyScope>(
    selectedSlotIds.length > 0 ? 'selected' : 'all',
  )
  useBodyScrollLock(true)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const picks = { potion, mount }
  const preview = previewBatchItems(slots, picks, scope, selectedSlotIds)

  const canApply = preview.changedFields > 0

  const apply = () => {
    if (!canApply) return
    onApply(picks, scope)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-items-modal-title"
        className="bg-gray-900 border border-gray-700 w-full sm:max-w-xl sm:rounded-2xl rounded-t-2xl max-h-[92dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
          <h3 id="batch-items-modal-title" className="font-bold text-white text-base">{t('batchItemsTitle')}</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white"
            aria-label={tCommon('close')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
          <p className="text-gray-400 text-xs leading-relaxed">{t('batchItemsHint')}</p>
          <p className="text-amber-300/80 text-xs leading-relaxed">
            {t('batchItemsOverwriteHint')}
          </p>

          <div>
            <label className="text-gray-400 text-[11px] font-semibold block mb-1">
              {t('batchScopeLabel')}
            </label>
            <select
              value={scope}
              onChange={(event) => setScope(event.target.value as BatchApplyScope)}
              className="w-full min-h-10 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
            >
              <option value="all">{t('batchScopeAll')}</option>
              {selectedSlotIds.length > 0 && (
                <option value="selected">
                  {t('batchScopeSelected', { count: selectedSlotIds.length })}
                </option>
              )}
              {SLOT_ROLES.map((role) => (
                <option key={role} value={role}>{translateSlotRole(role, tRole)}</option>
              ))}
            </select>
          </div>

          <ItemPicker
            label={`${tGear('potion')} (${t('batchItemsPotionLabel')})`}
            category={SLOT_PICKER_CATEGORY.potion}
            itemName={potion?.name ?? null}
            itemId={potion?.id ?? null}
            onChange={(name, id) => setPotion({ name, id })}
            onClear={() => setPotion(null)}
          />

          <ItemPicker
            label={`${tGear('mount')} (${t('batchItemsMountLabel')})`}
            category={SLOT_PICKER_CATEGORY.mount}
            itemName={mount?.name ?? null}
            itemId={mount?.id ?? null}
            onChange={(name, id) => setMount({ name, id })}
            onClear={() => setMount(null)}
          />

          <dl className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-3">
            <PreviewStat label={t('batchPreviewTargets')} value={preview.targetSlots} />
            <PreviewStat label={t('batchPreviewChangedSlots')} value={preview.changedSlots} accent />
            <PreviewStat label={t('batchPreviewChangedFields')} value={preview.changedFields} />
            <PreviewStat label={t('batchPreviewOverwritten')} value={preview.overwrittenFields} warn />
            <PreviewStat label={t('batchPreviewSkippedMulti')} value={preview.skippedOptionSlots} />
          </dl>
          {!potion && !mount && (
            <p className="text-gray-600 text-[11px]">{t('batchItemsNoSelection')}</p>
          )}
        </div>

        <div className="flex-shrink-0 border-t border-gray-700 px-4 py-3 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white text-sm px-4 py-2"
          >
            {tCommon('cancel')}
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={!canApply}
            className="ml-auto bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold px-6 py-2 rounded-lg text-sm"
          >
            {t('batchItemsApply')}
          </button>
        </div>
      </div>
    </div>
  )
}

function PreviewStat({
  label,
  value,
  accent = false,
  warn = false,
}: {
  label: string
  value: number
  accent?: boolean
  warn?: boolean
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950/50 px-2.5 py-2">
      <dt className="text-gray-500">{label}</dt>
      <dd className={`mt-0.5 font-bold tabular-nums ${warn && value > 0 ? 'text-amber-300' : accent ? 'text-emerald-300' : 'text-gray-200'}`}>
        {value}
      </dd>
    </div>
  )
}
