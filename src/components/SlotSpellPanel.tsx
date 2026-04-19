'use client'

import { Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import ItemImage from './ItemImage'
import SpellImage from './SpellImage'
import type { Slot, SlotKey } from '@/types'
import { getSpells, getDisplayGear, isFreeItem } from '@/types'
import spellSlotsJson from '@/data/albion-spell-slots.json'

// Rows appear in this fixed top-to-bottom order. Offhand/potion/food/cape
// are omitted because they carry no active spells in practice; if we ever
// store spells there, they'd silently vanish from this panel — catch it
// in review.
const SPELL_ROW_KEYS = ['weapon', 'head', 'armor', 'shoes'] as const
type SpellRowKey = (typeof SPELL_ROW_KEYS)[number]

const GEAR_ICON_SIZE = 44
const SPELL_ICON_SIZE = 45

type RowItem = { key: SpellRowKey; name: string | null; id: string | null; spells: string[] }

function rowGear(slot: Slot, key: SpellRowKey): { name: string | null; id: string | null } {
  return getDisplayGear(slot, key as SlotKey)
}

// Derived at build time from items.xml — spell uniqueName → slot+type.
// Slot meaning depends on type: active → weapon Q/W/E position (1/2/3),
// passive → which passive slot a passive fills (1/2). null = no slot attr.
type SpellSlotInfo = { slot: number | null; type: 'active' | 'passive' }
const SPELL_SLOTS = spellSlotsJson as Record<string, SpellSlotInfo>

interface SpellGroup {
  key: string
  type: 'active' | 'passive'
  slot: number | null
  spellIds: string[]
}

// Groups spells sharing the same (type, slot) tuple. In Albion, spells in the
// same slot are mutually exclusive in-game — picking multiple in the admin
// editor means "member can choose any one of these", not "all are equipped".
function groupSpellsBySlot(spellIds: string[]): SpellGroup[] {
  const buckets = new Map<string, SpellGroup>()
  const order: string[] = []
  for (const id of spellIds) {
    const info = SPELL_SLOTS[id]
    const type = info?.type ?? 'active'
    const slot = info?.slot ?? null
    const key = `${type}:${slot ?? 'x'}`
    const existing = buckets.get(key)
    if (existing) {
      existing.spellIds.push(id)
      continue
    }
    buckets.set(key, { key, type, slot, spellIds: [id] })
    order.push(key)
  }
  return order.map((k) => buckets.get(k)!)
}

type SpellTranslator = ReturnType<typeof useTranslations>

function groupLabel(g: SpellGroup, tSpell: SpellTranslator): string {
  if (g.type === 'active') {
    return g.slot === null ? tSpell('active') : tSpell('activeSlot', { n: g.slot })
  }
  return g.slot === null ? tSpell('passive') : tSpell('passiveSlot', { n: g.slot })
}

// Displays a small "스킬" badge that reveals a 4-row gear+spells panel on
// hover/focus — mirrors NoteTooltip so mobile users get the same tap-to-open
// affordance across both info surfaces.
export default function SlotSpellPanel({ slot }: { slot: Slot }) {
  const tSpell = useTranslations('slot.spell')
  const tSlot = useTranslations('slot')
  const rows: RowItem[] = []
  for (const key of SPELL_ROW_KEYS) {
    const spells = getSpells(slot.spells, key as SlotKey)
    if (spells.length === 0) continue
    const gear = rowGear(slot, key)
    rows.push({ key, ...gear, spells })
  }

  if (rows.length === 0) return null

  return (
    <div className="group/spells relative inline-block">
      <span
        tabIndex={0}
        role="button"
        aria-label={tSpell('view')}
        className="inline-flex items-center gap-0.5 text-[12px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-200 border border-purple-500/30 hover:bg-purple-500/20 cursor-help focus:outline-none focus:ring-1 focus:ring-purple-500/50"
      >
        <Sparkles size={10} />
        {tSpell('label')}
      </span>
      <div
        role="tooltip"
        className="hidden group-hover/spells:block group-focus-within/spells:block absolute z-30 top-full left-0 mt-1 min-w-[280px] max-w-[92vw] bg-gray-950 border border-purple-500/40 rounded-lg p-2 shadow-xl pointer-events-none space-y-1.5"
      >
        {rows.map(({ key, name, id, spells }) => (
          <div key={key} className="flex items-start gap-1.5">
            {isFreeItem(name, id) ? (
              <div
                style={{ width: GEAR_ICON_SIZE, height: GEAR_ICON_SIZE }}
                className="flex items-center justify-center rounded bg-emerald-900/30 border border-emerald-600/50 text-emerald-300 font-bold text-[10px] flex-shrink-0"
              >
                {tSlot('free')}
              </div>
            ) : (
              <div className="flex-shrink-0">
                <ItemImage itemId={id} itemName={name} size={GEAR_ICON_SIZE} />
              </div>
            )}
            <div className="flex flex-wrap gap-x-2 gap-y-1 items-start">
              {groupSpellsBySlot(spells).map((group) => {
                const isMulti = group.spellIds.length > 1
                const label = groupLabel(group, tSpell)
                if (!isMulti) {
                  return (
                    <div key={group.key} className="flex gap-0.5" title={label}>
                      {group.spellIds.map((spellId) => (
                        <SpellImage key={spellId} spellId={spellId} size={SPELL_ICON_SIZE} />
                      ))}
                    </div>
                  )
                }
                return (
                  <div
                    key={group.key}
                    className="flex flex-col items-center gap-0.5"
                    title={tSpell('pickOneInGame', { label })}
                  >
                    <div className="flex gap-0.5 p-0.5 rounded-md border border-amber-500/50 bg-amber-500/10">
                      {group.spellIds.map((spellId) => (
                        <SpellImage key={spellId} spellId={spellId} size={SPELL_ICON_SIZE} />
                      ))}
                    </div>
                    <span className="text-amber-300 text-[10px] font-bold leading-none">
                      {tSpell('pickOne')}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
