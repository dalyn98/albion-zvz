'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, ChevronDown, ChevronUp, ArrowUp, ArrowDown, Eye, EyeOff, Package, Beaker } from 'lucide-react'
import SlotEditor, { emptySlotInput, type SlotInput } from './SlotEditor'
import BatchApplySpecsModal, { type BatchSpecsScope } from './BatchApplySpecsModal'
import BatchApplyItemsModal from './BatchApplyItemsModal'
import type { GearOption, GearSpec, SlotKey } from '@/types'
import { SLOT_KEYS } from '@/types'
import { savePartySlots } from '@/app/actions/admin'
import type { PartyWithSlots } from '@/types'
import { useRegisterSave } from './EventEditSaveRegistry'

function slotToInput(s: import('@/types').Slot): SlotInput {
  return {
    id: s.id,
    slot_number: s.slot_number,
    is_hidden: s.is_hidden,
    role_name: s.role_name ?? '',
    notes: s.notes ?? '',
    assigned_username: s.assigned_username,
    items: SLOT_KEYS.reduce((acc, k) => ({
      ...acc,
      [k]: {
        name: s[`${k}_name`] ?? '',
        id: s[`${k}_id`] ?? '',
      },
    }), {} as Record<SlotKey, { name: string; id: string }>),
    options: SLOT_KEYS.reduce((acc, k) => ({
      ...acc,
      [k]: s[`${k}_options`] ?? [],
    }), {} as Record<SlotKey, GearOption[]>),
    spells: SLOT_KEYS.reduce((acc, k) => ({
      ...acc,
      [k]: s.spells?.[k] ?? [],
    }), {} as Record<SlotKey, string[]>),
    specs: SLOT_KEYS.reduce((acc, k) => ({
      ...acc,
      [k]: s.gear_specs?.[k] ?? {},
    }), {} as Record<SlotKey, GearSpec>),
  }
}

interface Props {
  eventId: string
  partyNumber: number
  initialData: PartyWithSlots | null
}

export default function PartyEditorPanel({ eventId, partyNumber, initialData }: Props) {
  const t = useTranslations('adminParty')
  const [slots, setSlots] = useState<SlotInput[]>(
    initialData?.slots.map(slotToInput) ?? []
  )
  const [error, setError] = useState('')
  const [batchModalOpen, setBatchModalOpen] = useState(false)
  const [batchItemsModalOpen, setBatchItemsModalOpen] = useState(false)

  // Overwrite semantics: potion/mount are uniform within a party in practice,
  // so a bulk apply that skips already-set slots would leave accidental holes.
  // Slots configured with option (multi) lists are left untouched — their
  // fixed columns are null by convention and we'd corrupt that shape.
  const applyBatchItems = (picks: {
    potion: { name: string; id: string } | null
    mount: { name: string; id: string } | null
  }) => {
    setSlots((prev) =>
      prev.map((s) => {
        const nextItems = { ...s.items }
        let changed = false
        if (picks.potion && s.options.potion.length === 0) {
          nextItems.potion = { name: picks.potion.name, id: picks.potion.id }
          changed = true
        }
        if (picks.mount && s.options.mount.length === 0) {
          nextItems.mount = { name: picks.mount.name, id: picks.mount.id }
          changed = true
        }
        return changed ? { ...s, items: nextItems } : s
      }),
    )
  }

  const applyBatchSpecs = (
    scope: BatchSpecsScope,
    incoming: Partial<Record<SlotKey, GearSpec>>,
  ) => {
    setSlots((prev) =>
      prev.map((s) => {
        if (scope !== 'all' && s.role_name !== scope) return s
        const nextSpecs = { ...s.specs }
        let changed = false
        for (const key of SLOT_KEYS) {
          const patch = incoming[key]
          if (!patch) continue
          const current = nextSpecs[key] ?? {}
          const merged: GearSpec = { ...current }
          // Fill-empty-only semantics: never override an admin's manual spec.
          if (patch.tier != null && merged.tier == null) {
            merged.tier = patch.tier
            changed = true
          }
          if (patch.enchant != null && merged.enchant == null) {
            merged.enchant = patch.enchant
            changed = true
          }
          nextSpecs[key] = merged
        }
        return changed ? { ...s, specs: nextSpecs } : s
      }),
    )
  }

  const addSlot = () => {
    if (slots.length >= 20) return
    const nextNum = slots.length > 0 ? Math.max(...slots.map((s) => s.slot_number)) + 1 : 1
    setSlots([...slots, emptySlotInput(nextNum)])
  }

  const updateSlot = (idx: number, updated: SlotInput) =>
    setSlots(slots.map((s, i) => i === idx ? updated : s))

  const deleteSlot = (idx: number) =>
    setSlots(slots.filter((_, i) => i !== idx))

  const moveSlot = (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= slots.length) return
    const next = [...slots]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setSlots(next)
  }

  const toggleHide = (idx: number) =>
    setSlots(slots.map((s, i) => i === idx ? { ...s, is_hidden: !s.is_hidden } : s))

  // 상위 저장 바에서 호출될 saver. 개별 저장 버튼이 없어졌으므로 에러만
  // 지역 state 에 반영하고 실제 router.refresh 는 저장 바가 처리.
  const persistParty = async (): Promise<{ error?: string }> => {
    const result = await savePartySlots(
      eventId,
      partyNumber,
      initialData?.id ?? null,
      slots.map((s, i) => ({ ...s, slot_number: i + 1 })),
      (initialData?.slots ?? []).map((s) => s.id),
    )
    if (result.error) {
      setError(result.error)
      return { error: result.error }
    }
    setError('')
    return {}
  }

  useRegisterSave(`party-${partyNumber}`, t('partyBadge', { num: partyNumber }), persistParty)

  return (
    <details className="group border border-gray-700 rounded-xl overflow-hidden">
      <summary className="flex items-center justify-between px-4 py-3 bg-gray-900 cursor-pointer hover:bg-gray-800 list-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-3">
          <span className="bg-amber-500/20 text-amber-400 text-sm font-bold px-2.5 py-0.5 rounded">
            {t('partyBadge', { num: partyNumber })}
          </span>
          <span className="text-gray-400 text-sm">
            {t('slotCount', { count: slots.length })}
          </span>
          <span className="text-green-400 text-xs">
            {t('appliedCount', { count: slots.filter((s) => s.assigned_username).length })}
          </span>
        </div>
        <ChevronDown size={16} className="text-gray-400 group-open:hidden" />
        <ChevronUp size={16} className="text-gray-400 hidden group-open:block" />
      </summary>

      <div className="p-4 space-y-3 border-t border-gray-700">
        {slots.length > 0 && (
          <div className="flex items-center justify-end gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setBatchItemsModalOpen(true)}
              className="flex items-center gap-1 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-amber-300 px-3 py-1.5 rounded-lg"
            >
              <Beaker size={12} />
              {t('batchItemsButton')}
            </button>
            <button
              type="button"
              onClick={() => setBatchModalOpen(true)}
              className="flex items-center gap-1 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-amber-300 px-3 py-1.5 rounded-lg"
            >
              <Package size={12} />
              {t('batchSpecButton')}
            </button>
          </div>
        )}

        {slots.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-4">
            {t('noSlotsHint')}
          </p>
        )}

        {slots.map((slot, idx) => (
          <div
            key={idx}
            className={slot.is_hidden ? 'opacity-60' : undefined}
          >
            <div className="flex items-center justify-between gap-2 px-1 pb-1">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveSlot(idx, -1)}
                  disabled={idx === 0}
                  aria-label={t('moveUp')}
                  title={t('moveUp')}
                  className="p-1 rounded text-gray-400 hover:text-amber-300 hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => moveSlot(idx, 1)}
                  disabled={idx === slots.length - 1}
                  aria-label={t('moveDown')}
                  title={t('moveDown')}
                  className="p-1 rounded text-gray-400 hover:text-amber-300 hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                >
                  <ArrowDown size={14} />
                </button>
                {slot.is_hidden && (
                  <span className="ml-1 bg-gray-700/60 text-gray-300 text-[10px] font-bold px-1.5 py-0.5 rounded">
                    {t('hiddenBadge')}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => toggleHide(idx)}
                aria-label={slot.is_hidden ? t('show') : t('hide')}
                title={slot.is_hidden ? t('show') : t('hide')}
                className="flex items-center gap-1 p-1 rounded text-gray-400 hover:text-amber-300 hover:bg-gray-800 text-xs"
              >
                {slot.is_hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                <span>{slot.is_hidden ? t('show') : t('hide')}</span>
              </button>
            </div>
            <SlotEditor
              slot={slot}
              partyNumber={partyNumber}
              onChange={(updated) => updateSlot(idx, updated)}
              onDelete={() => deleteSlot(idx)}
            />
          </div>
        ))}

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={addSlot}
            disabled={slots.length >= 20}
            className="flex items-center gap-1 text-amber-400 hover:text-amber-300 disabled:text-gray-600 text-sm font-medium"
          >
            <Plus size={14} /> {t('addSlot', { count: slots.length })}
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}
      </div>

      {batchModalOpen && (
        <BatchApplySpecsModal
          slots={slots}
          onApply={applyBatchSpecs}
          onClose={() => setBatchModalOpen(false)}
        />
      )}

      {batchItemsModalOpen && (
        <BatchApplyItemsModal
          slots={slots}
          onApply={applyBatchItems}
          onClose={() => setBatchItemsModalOpen(false)}
        />
      )}
    </details>
  )
}
