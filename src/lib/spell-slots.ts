import spellSlotsJson from '@/data/albion-spell-slots.json'

export interface SpellSlotInfo {
  slot: number | null
  type: 'active' | 'passive'
}

const SPELL_SLOTS = spellSlotsJson as Record<string, SpellSlotInfo>
const BASE_MACE_RE = /^T\d_MAIN_MACE$/

function targetCdSlot(weaponItemId: string | null | undefined): number {
  return weaponItemId && BASE_MACE_RE.test(weaponItemId) ? 2 : 3
}

export function getSpellSlotInfo(spellId: string): SpellSlotInfo | undefined {
  return SPELL_SLOTS[spellId]
}

export function isCdTargetSpell(
  spellId: string,
  weaponItemId: string | null | undefined,
): boolean {
  const info = SPELL_SLOTS[spellId]
  return info?.type === 'active' && info.slot === targetCdSlot(weaponItemId)
}
