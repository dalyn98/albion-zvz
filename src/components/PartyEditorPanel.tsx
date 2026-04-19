'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus, ChevronDown, ChevronUp } from 'lucide-react'
import SlotEditor, { emptySlotInput, type SlotInput } from './SlotEditor'
import type { GearOption, SlotKey } from '@/types'
import { SLOT_KEYS } from '@/types'
import { savePartySlots } from '@/app/actions/admin'
import type { PartyWithSlots } from '@/types'

function slotToInput(s: import('@/types').Slot): SlotInput {
  return {
    id: s.id,
    slot_number: s.slot_number,
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
  }
}

interface Props {
  eventId: string
  partyNumber: number
  initialData: PartyWithSlots | null
}

export default function PartyEditorPanel({ eventId, partyNumber, initialData }: Props) {
  const t = useTranslations('adminParty')
  const router = useRouter()
  const [slots, setSlots] = useState<SlotInput[]>(
    initialData?.slots.map(slotToInput) ?? []
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const addSlot = () => {
    if (slots.length >= 20) return
    const nextNum = slots.length > 0 ? Math.max(...slots.map((s) => s.slot_number)) + 1 : 1
    setSlots([...slots, emptySlotInput(nextNum)])
  }

  const updateSlot = (idx: number, updated: SlotInput) =>
    setSlots(slots.map((s, i) => i === idx ? updated : s))

  const deleteSlot = (idx: number) =>
    setSlots(slots.filter((_, i) => i !== idx))

  const save = async () => {
    setSaving(true)
    setError('')
    const result = await savePartySlots(
      eventId,
      partyNumber,
      initialData?.id ?? null,
      slots.map((s, i) => ({ ...s, slot_number: i + 1 })),
      (initialData?.slots ?? []).map((s) => s.id),
    )
    setSaving(false)
    if (result.error) setError(result.error)
    else router.refresh()
  }

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
        {slots.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-4">
            {t('noSlotsHint')}
          </p>
        )}

        {slots.map((slot, idx) => (
          <SlotEditor
            key={idx}
            slot={slot}
            partyNumber={partyNumber}
            onChange={(updated) => updateSlot(idx, updated)}
            onDelete={() => deleteSlot(idx)}
          />
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

        <button
          onClick={save}
          disabled={saving}
          className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold py-2.5 rounded-xl text-sm transition-colors"
        >
          {saving ? t('savingDots') : t('saveParty', { num: partyNumber })}
        </button>
      </div>
    </details>
  )
}
