import ItemImage from './ItemImage'
import SpellImage from './SpellImage'
import type { Slot, SlotKey } from '@/types'
import { getSpells, getDisplayWeapon, isFreeItem } from '@/types'

// Rows appear in this fixed top-to-bottom order. Offhand/potion/food/cape
// are omitted because they carry no active spells in practice; if we ever
// store spells there, they'd silently vanish from this panel — catch it
// in review.
const SPELL_ROW_KEYS = ['weapon', 'head', 'armor', 'shoes'] as const
type SpellRowKey = (typeof SPELL_ROW_KEYS)[number]

const GEAR_ICON_SIZE = 22
const SPELL_ICON_SIZE = 30

type RowItem = { key: SpellRowKey; name: string | null; id: string | null; spells: string[] }

function rowGear(slot: Slot, key: SpellRowKey): { name: string | null; id: string | null } {
  if (key === 'weapon') {
    return getDisplayWeapon(slot)
  }
  return { name: slot[`${key}_name`], id: slot[`${key}_id`] }
}

export default function SlotSpellPanel({ slot }: { slot: Slot }) {
  const rows: RowItem[] = []
  for (const key of SPELL_ROW_KEYS) {
    const spells = getSpells(slot.spells, key as SlotKey)
    if (spells.length === 0) continue
    const gear = rowGear(slot, key)
    rows.push({ key, ...gear, spells })
  }

  if (rows.length === 0) return null

  return (
    <div className="rounded-lg border border-purple-500/25 bg-purple-950/15 p-1.5 space-y-1">
      {rows.map(({ key, name, id, spells }) => (
        <div key={key} className="flex items-center gap-1.5">
          {isFreeItem(name, id) ? (
            <div
              style={{ width: GEAR_ICON_SIZE, height: GEAR_ICON_SIZE }}
              className="flex items-center justify-center rounded bg-emerald-900/30 border border-emerald-600/50 text-emerald-300 font-bold text-[8px] flex-shrink-0"
            >
              자유
            </div>
          ) : (
            <div className="flex-shrink-0">
              <ItemImage itemId={id} itemName={name} size={GEAR_ICON_SIZE} />
            </div>
          )}
          <div className="flex flex-wrap gap-0.5">
            {spells.map((spellId) => (
              <SpellImage key={spellId} spellId={spellId} size={SPELL_ICON_SIZE} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
