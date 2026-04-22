'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus, ChevronDown, ChevronUp } from 'lucide-react'
import SlotEditor, { emptySlotInput, type SlotInput } from './SlotEditor'
import type { GearOption, GearSpec, GearSpecs, SlotKey, SlotSpells } from '@/types'
import { GEAR_ENCHANT_MAX, GEAR_ENCHANT_MIN, GEAR_TIER_MAX, GEAR_TIER_MIN, SLOT_KEYS, isTierlessSlot, isSpecLessSlot } from '@/types'
import { updateTemplate, type TemplateData, type TemplateRecord } from '@/app/actions/templates'

function sanitizeGearOptions(opts: GearOption[] | null | undefined): GearOption[] | null {
  if (!Array.isArray(opts)) return null
  const clean = opts.filter((o) => o && typeof o.id === 'string' && o.id && typeof o.name === 'string' && o.name)
  const seen = new Set<string>()
  const deduped = clean.filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)))
  return deduped.length > 0 ? deduped.map((o) => ({ name: o.name, id: o.id })) : null
}

// Mirrors sanitizeSpells in admin.ts; keeping client-side too because the
// template save path persists JSONB directly without going through slotToRow.
function sanitizeSpells(spells: Record<SlotKey, string[]>): SlotSpells | null {
  const out: SlotSpells = {}
  for (const key of SLOT_KEYS) {
    const raw = spells[key]
    if (!Array.isArray(raw)) continue
    const seen = new Set<string>()
    const cleaned: string[] = []
    for (const v of raw) {
      if (typeof v !== 'string') continue
      const trimmed = v.trim()
      if (!trimmed || seen.has(trimmed)) continue
      seen.add(trimmed)
      cleaned.push(trimmed)
    }
    if (cleaned.length > 0) out[key] = cleaned
  }
  return Object.keys(out).length > 0 ? out : null
}

function sanitizeGearSpecs(specs: Record<SlotKey, GearSpec>): GearSpecs | null {
  const out: GearSpecs = {}
  for (const key of SLOT_KEYS) {
    if (isSpecLessSlot(key)) continue
    const raw = specs[key]
    if (!raw) continue
    const entry: GearSpec = {}
    if (
      !isTierlessSlot(key) &&
      typeof raw.tier === 'number' &&
      raw.tier >= GEAR_TIER_MIN &&
      raw.tier <= GEAR_TIER_MAX
    ) {
      entry.tier = raw.tier
    }
    if (typeof raw.enchant === 'number' && raw.enchant >= GEAR_ENCHANT_MIN && raw.enchant <= GEAR_ENCHANT_MAX) {
      entry.enchant = raw.enchant
    }
    if (entry.tier != null || entry.enchant != null) out[key] = entry
  }
  return Object.keys(out).length > 0 ? out : null
}

const MAX_PARTIES = 4

interface PartyState {
  party_number: number
  slots: SlotInput[]
}

function templateToPartyStates(data: TemplateData): PartyState[] {
  const byNumber = new Map(data.parties.map((p) => [p.party_number, p]))
  return Array.from({ length: MAX_PARTIES }, (_, i) => {
    const partyNumber = i + 1
    const party = byNumber.get(partyNumber)
    return {
      party_number: partyNumber,
      slots: (party?.slots ?? []).map((s) => ({
        slot_number: s.slot_number,
        is_hidden: false,
        role_name: s.role_name ?? '',
        notes: s.notes ?? '',
        auto_regear_excluded: false,
        assigned_username: null,
        items: SLOT_KEYS.reduce((acc, k) => ({
          ...acc,
          [k]: {
            name: (s[`${k}_name`] as string | null) ?? '',
            id: (s[`${k}_id`] as string | null) ?? '',
          },
        }), {} as Record<SlotKey, { name: string; id: string }>),
        options: SLOT_KEYS.reduce((acc, k) => ({
          ...acc,
          [k]: (s[`${k}_options`] as GearOption[] | null) ?? [],
        }), {} as Record<SlotKey, GearOption[]>),
        spells: SLOT_KEYS.reduce((acc, k) => ({
          ...acc,
          [k]: s.spells?.[k] ?? [],
        }), {} as Record<SlotKey, string[]>),
        specs: SLOT_KEYS.reduce((acc, k) => ({
          ...acc,
          [k]: { ...(s.gear_specs?.[k] ?? {}) },
        }), {} as Record<SlotKey, GearSpec>),
      })),
    }
  })
}

function partyStatesToTemplateData(parties: PartyState[]): TemplateData {
  return {
    parties: parties
      .filter((p) => p.slots.length > 0)
      .map((p) => ({
        party_number: p.party_number,
        slots: p.slots.map((s, idx) => {
          const cleanedOptions = SLOT_KEYS.reduce(
            (acc, k) => ({ ...acc, [k]: sanitizeGearOptions(s.options[k]) }),
            {} as Record<SlotKey, GearOption[] | null>,
          )
          const perSlot = SLOT_KEYS.reduce(
            (acc, k) => {
              const hasOpts = cleanedOptions[k] !== null
              return {
                ...acc,
                [`${k}_options`]: cleanedOptions[k],
                [`${k}_name`]: hasOpts ? null : s.items[k].name || null,
                [`${k}_id`]: hasOpts ? null : s.items[k].id || null,
              }
            },
            {} as Record<string, unknown>,
          )
          return {
            slot_number: idx + 1,
            role_name: s.role_name || null,
            notes: s.notes || null,
            spells: sanitizeSpells(s.spells),
            gear_specs: sanitizeGearSpecs(s.specs),
            ...perSlot,
          } as TemplateData['parties'][number]['slots'][number]
        }),
      })),
  }
}

export default function TemplateEditor({ template }: { template: TemplateRecord }) {
  const t = useTranslations('adminTemplates')
  const router = useRouter()
  const [name, setName] = useState(template.name)
  const [parties, setParties] = useState<PartyState[]>(() => templateToPartyStates(template.data))
  const [error, setError] = useState('')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()

  const updateParty = (partyNumber: number, updater: (prev: PartyState) => PartyState) => {
    setParties((prev) => prev.map((p) => (p.party_number === partyNumber ? updater(p) : p)))
  }

  const addSlot = (partyNumber: number) => {
    updateParty(partyNumber, (p) => {
      if (p.slots.length >= 20) return p
      const nextNum = p.slots.length > 0 ? Math.max(...p.slots.map((s) => s.slot_number)) + 1 : 1
      return { ...p, slots: [...p.slots, emptySlotInput(nextNum)] }
    })
  }

  const updateSlot = (partyNumber: number, idx: number, updated: SlotInput) => {
    updateParty(partyNumber, (p) => ({
      ...p,
      slots: p.slots.map((s, i) => (i === idx ? updated : s)),
    }))
  }

  const deleteSlot = (partyNumber: number, idx: number) => {
    updateParty(partyNumber, (p) => ({
      ...p,
      slots: p.slots.filter((_, i) => i !== idx),
    }))
  }

  const save = () => {
    setError('')
    setSavedAt(null)
    startTransition(async () => {
      const data = partyStatesToTemplateData(parties)
      const result = await updateTemplate(template.id, name, data)
      if (result.error) {
        setError(result.error)
        return
      }
      setSavedAt(Date.now())
      router.refresh()
    })
  }

  return (
    <div className="space-y-6 sm:space-y-8">
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

      <hr className="border-gray-700" />

      <section className="space-y-3 sm:space-y-4">
        <div>
          <h2 className="text-lg font-bold text-white">{t('partyConfigTitle')}</h2>
          <p className="text-gray-400 text-xs sm:text-sm mt-1">
            {t('partyConfigDescription', { max: MAX_PARTIES })}
          </p>
        </div>
        <div className="space-y-3">
          {parties.map((party) => (
            <PartyPanel
              key={party.party_number}
              party={party}
              onAddSlot={() => addSlot(party.party_number)}
              onUpdateSlot={(idx, updated) => updateSlot(party.party_number, idx, updated)}
              onDeleteSlot={(idx) => deleteSlot(party.party_number, idx)}
            />
          ))}
        </div>
      </section>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <div className="sticky bottom-0 bg-black/80 backdrop-blur-sm -mx-4 px-4 py-3 border-t border-gray-800 flex items-center gap-3">
        {savedAt && !pending && (
          <span className="text-green-400 text-xs">{t('savedMessage')}</span>
        )}
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="ml-auto bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold px-6 py-2.5 rounded-xl text-sm transition-colors"
        >
          {pending ? t('savingDots') : t('saveButton')}
        </button>
      </div>
    </div>
  )
}

interface PartyPanelProps {
  party: PartyState
  onAddSlot: () => void
  onUpdateSlot: (idx: number, updated: SlotInput) => void
  onDeleteSlot: (idx: number) => void
}

function PartyPanel({ party, onAddSlot, onUpdateSlot, onDeleteSlot }: PartyPanelProps) {
  const t = useTranslations('adminTemplates')
  return (
    <details className="group border border-gray-700 rounded-xl overflow-hidden" open={party.slots.length > 0}>
      <summary className="flex items-center justify-between px-4 py-3 bg-gray-900 cursor-pointer hover:bg-gray-800 list-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-3">
          <span className="bg-amber-500/20 text-amber-400 text-sm font-bold px-2.5 py-0.5 rounded">
            {t('partyBadge', { num: party.party_number })}
          </span>
          <span className="text-gray-400 text-sm">
            {t('slotCount', { count: party.slots.length })}
          </span>
        </div>
        <ChevronDown size={16} className="text-gray-400 group-open:hidden" />
        <ChevronUp size={16} className="text-gray-400 hidden group-open:block" />
      </summary>

      <div className="p-4 space-y-3 border-t border-gray-700">
        {party.slots.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-4">
            {t('noSlotsHint')}
          </p>
        )}

        {party.slots.map((slot, idx) => (
          <SlotEditor
            key={idx}
            slot={slot}
            partyNumber={party.party_number}
            autoRegearEnabled={false}
            onChange={(updated) => onUpdateSlot(idx, updated)}
            onDelete={() => onDeleteSlot(idx)}
          />
        ))}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onAddSlot}
            disabled={party.slots.length >= 20}
            className="flex items-center gap-1 text-amber-400 hover:text-amber-300 disabled:text-gray-600 text-sm font-medium"
          >
            <Plus size={14} /> {t('addSlot', { count: party.slots.length })}
          </button>
        </div>
      </div>
    </details>
  )
}
