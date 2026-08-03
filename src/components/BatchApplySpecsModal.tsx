'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import type { SlotInput } from './SlotEditor'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import type { GearSpec, SlotKey } from '@/types'
import {
  SLOT_ROLES,
  GEAR_ENCHANT_MIN,
  GEAR_ENCHANT_MAX,
  GEAR_FLAT_MIN,
  GEAR_FLAT_MAX,
  GEAR_ENCHANT_COLOR_CLASS,
  flatToSpec,
  specToFlat,
} from '@/types'
import { useBodyScrollLock } from './useBodyScrollLock'
import {
  previewBatchSpecs,
  previewResetBatchSpecs,
  type BatchApplyScope,
} from '@/lib/slot-workspace'
import {
  expandBatchGroupSpecs,
  type BatchGroupSpecs,
  type BatchSpecKey,
} from '@/lib/batch-spec-groups'

export type BatchSpecsScope = BatchApplyScope

interface BatchGroup {
  id: BatchSpecKey
  labelKey: string
  includeTier: boolean
}

// Mount is intentionally absent — it has no tier/enchant concept (see
// SPEC_LESS_SLOT_KEYS in types).
const BATCH_GROUPS: BatchGroup[] = [
  { id: 'weapon',  labelKey: 'batchGroupWeapon',  includeTier: true },
  { id: 'offhand', labelKey: 'batchGroupOffhand', includeTier: true },
  { id: 'head',    labelKey: 'batchGroupHead',    includeTier: true },
  { id: 'armor',   labelKey: 'batchGroupArmor',   includeTier: true },
  { id: 'shoes',   labelKey: 'batchGroupShoes',   includeTier: true },
  { id: 'cape',    labelKey: 'batchGroupCape',    includeTier: true },
  { id: 'food',    labelKey: 'batchGroupFood',    includeTier: false },
  { id: 'potion',  labelKey: 'batchGroupPotion',  includeTier: false },
]

const EMPTY_GROUP_SPECS: BatchGroupSpecs = {
  weapon: {},
  offhand: {},
  head: {},
  armor: {},
  shoes: {},
  cape: {},
  food: {},
  potion: {},
}

interface Props {
  slots: SlotInput[]
  selectedSlotIds?: readonly string[]
  onApply: (scope: BatchSpecsScope, specs: Partial<Record<SlotKey, GearSpec>>) => void
  onReset: (scope: BatchSpecsScope) => void
  onClose: () => void
}

export default function BatchApplySpecsModal({
  slots,
  selectedSlotIds = [],
  onApply,
  onReset,
  onClose,
}: Props) {
  const t = useTranslations('adminParty')
  const tCommon = useTranslations('common')
  const tRole = useTranslations('slotRole')
  const [scope, setScope] = useState<BatchSpecsScope>(
    selectedSlotIds.length > 0 ? 'selected' : 'all',
  )
  const [groupSpecs, setGroupSpecs] = useState<BatchGroupSpecs>(EMPTY_GROUP_SPECS)
  useBodyScrollLock(true)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const replaceGroupSpec = (id: BatchSpecKey, spec: GearSpec) => {
    setGroupSpecs((prev) => ({ ...prev, [id]: spec }))
  }

  const updateGroupEnchant = (id: BatchSpecKey, enchant: number | undefined) => {
    setGroupSpecs((prev) => {
      const next: GearSpec = { ...prev[id] }
      if (enchant == null) delete next.enchant
      else next.enchant = enchant
      return { ...prev, [id]: next }
    })
  }

  const expandedSpecs = expandBatchGroupSpecs(groupSpecs)

  const hasAnySpec = Object.keys(expandedSpecs).length > 0
  const preview = previewBatchSpecs(slots, expandedSpecs, scope, selectedSlotIds)
  const resetPreview = previewResetBatchSpecs(slots, scope, selectedSlotIds)

  const apply = () => {
    if (!hasAnySpec || preview.changedFields === 0) return
    onApply(scope, expandedSpecs)
    onClose()
  }

  const reset = () => {
    if (resetPreview.changedFields === 0) return
    onReset(scope)
    onClose()
  }

  const flats: number[] = []
  for (let f = GEAR_FLAT_MIN; f <= GEAR_FLAT_MAX; f++) flats.push(f)
  const enchants: number[] = []
  for (let e = GEAR_ENCHANT_MIN; e <= GEAR_ENCHANT_MAX; e++) enchants.push(e)

  return createPortal(
    <div
      className="fixed inset-0 z-[80] bg-black/70 flex items-end sm:items-center justify-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-spec-modal-title"
        className="bg-gray-900 border border-gray-700 w-full sm:max-w-xl sm:rounded-2xl rounded-t-2xl max-h-[92dvh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
          <h3 id="batch-spec-modal-title" className="font-bold text-white text-base">{t('batchSpecTitle')}</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-gray-400 hover:bg-gray-800 hover:text-white"
            aria-label={tCommon('close')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-4">
          <p className="text-gray-400 text-xs leading-relaxed">{t('batchSpecHint')}</p>

          <div>
            <label className="text-gray-400 text-[11px] font-semibold block mb-1">
              {t('batchSpecScope')}
            </label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as BatchSpecsScope)}
              className="w-full min-h-10 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
            >
              <option value="all">{t('batchSpecScopeAll')}</option>
              {selectedSlotIds.length > 0 && (
                <option value="selected">
                  {t('batchScopeSelected', { count: selectedSlotIds.length })}
                </option>
              )}
              {SLOT_ROLES.map((role) => (
                <option key={role} value={role}>
                  {translateSlotRole(role, tRole)}
                </option>
              ))}
            </select>
            <p className="text-gray-500 text-[11px] mt-1">
              {t('batchSpecTargetCount', { count: preview.targetSlots })}
            </p>
          </div>

          <div className="space-y-2">
            {BATCH_GROUPS.map((group) => {
              const g = groupSpecs[group.id]
              const enchantColor =
                g.enchant != null
                  ? GEAR_ENCHANT_COLOR_CLASS[g.enchant] ?? 'text-white'
                  : 'text-white'
              const currentFlat = specToFlat(g)
              return (
                <div key={group.id} className="flex items-center gap-2">
                  <span className="text-amber-400 text-[11px] font-semibold w-20 flex-shrink-0">
                    {t(group.labelKey)}
                  </span>
                  {group.includeTier ? (
                    <select
                      value={currentFlat ?? ''}
                      onChange={(e) =>
                        replaceGroupSpec(
                          group.id,
                          e.target.value ? flatToSpec(Number(e.target.value)) : {},
                        )
                      }
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500"
                      aria-label={`${t(group.labelKey)} ${t('specFlat')}`}
                    >
                      <option value="">{t('specFlatAny')}</option>
                      {flats.map((flat) => (
                        <option key={flat} value={flat}>
                          {flat}F
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      value={g.enchant ?? ''}
                      onChange={(e) =>
                        updateGroupEnchant(group.id, e.target.value ? Number(e.target.value) : undefined)
                      }
                      className={`bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-amber-500 ${enchantColor}`}
                      aria-label={`${t(group.labelKey)} ${t('specEnchant')}`}
                    >
                      <option value="">{t('specEnchantAny')}</option>
                      {enchants.map((level) => (
                        <option key={level} value={level}>
                          @{level}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )
            })}
          </div>

          <p className="text-gray-500 text-[11px] leading-relaxed">{t('batchSpecFillHint')}</p>
          <dl className="grid grid-cols-3 gap-2 text-[11px]">
            <div className="rounded-lg border border-gray-800 bg-gray-950/50 px-2.5 py-2">
              <dt className="text-gray-500">{t('batchPreviewTargets')}</dt>
              <dd className="mt-0.5 font-bold text-gray-200 tabular-nums">{preview.targetSlots}</dd>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-950/50 px-2.5 py-2">
              <dt className="text-gray-500">{t('batchPreviewChangedSlots')}</dt>
              <dd className="mt-0.5 font-bold text-emerald-300 tabular-nums">{preview.changedSlots}</dd>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-950/50 px-2.5 py-2">
              <dt className="text-gray-500">{t('batchPreviewChangedFields')}</dt>
              <dd className="mt-0.5 font-bold text-gray-200 tabular-nums">{preview.changedFields}</dd>
            </div>
          </dl>

          <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] p-3">
            <p className="text-red-200 text-xs font-semibold">{t('batchSpecResetTitle')}</p>
            <p className="mt-1 text-gray-400 text-[11px] leading-relaxed">
              {t('batchSpecResetHint', {
                slots: resetPreview.changedSlots,
                fields: resetPreview.changedFields,
              })}
            </p>
            <button
              type="button"
              onClick={reset}
              disabled={resetPreview.changedFields === 0}
              className="mt-2 inline-flex min-h-9 items-center rounded-lg px-3 text-xs font-bold text-red-300 transition-colors hover:bg-red-500/10 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('batchSpecReset')}
            </button>
          </div>
        </div>

        <div className="safe-area-bottom flex-shrink-0 border-t border-gray-700 px-4 py-3 flex gap-2">
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
            disabled={!hasAnySpec || preview.changedFields === 0}
            className="ml-auto bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold px-6 py-2 rounded-lg text-sm"
          >
            {t('batchSpecApply')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
