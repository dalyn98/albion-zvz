'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import ItemPicker from './ItemPicker'
import type { SlotInput } from './SlotEditor'
import { SLOT_PICKER_CATEGORY } from '@/types'

// Party-wide item batch apply for potion + mount. Unlike BatchApplySpecsModal
// (which fills tier/enchant metadata without touching item identity), this
// overwrites the fixed item name/id for every slot in the party.
// Slots in option (multi) mode are skipped — their fixed columns are null by
// convention and should stay that way.

type Pick = { name: string; id: string } | null

interface Props {
  slots: SlotInput[]
  onApply: (picks: { potion: Pick; mount: Pick }) => void
  onClose: () => void
}

export default function BatchApplyItemsModal({ slots, onApply, onClose }: Props) {
  const t = useTranslations('adminParty')
  const tGear = useTranslations('gear')
  const tCommon = useTranslations('common')
  const [potion, setPotion] = useState<Pick>(null)
  const [mount, setMount] = useState<Pick>(null)

  const affectedCount = slots.filter(
    (s) =>
      (potion && s.options.potion.length === 0) ||
      (mount && s.options.mount.length === 0),
  ).length

  const canApply = (potion != null || mount != null) && affectedCount > 0

  const apply = () => {
    if (!canApply) return
    onApply({ potion, mount })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 w-full sm:max-w-xl sm:rounded-2xl rounded-t-2xl max-h-[92dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
          <h3 className="font-bold text-white text-base">{t('batchItemsTitle')}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white"
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

          <p className="text-gray-500 text-[11px]">
            {t('batchItemsAffectedCount', { count: affectedCount })}
          </p>
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
