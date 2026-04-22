// Computes the effective cooldown of a weapon's E-slot spell after leather
// armor passives and food buffs stack, using Albion's diminishing-returns
// formula from the wiki (Statistic Caps):
//
//   effectiveCd = baseCd / (1 + Σ cdr)
//
// Each source contributes a raw cdr decimal (e.g. leather chest = 0.05).
// Raw values sum, then DR converts the sum into an effective multiplier —
// this matches how the game tooltip shows reduced cooldowns in-game.
//
// Source collection rules (confirmed with product owner):
//   - Multi-option slot: only counted when the member has picked an option
//     (assigned_*_id is set); otherwise the slot contributes nothing because
//     we don't know which item will be worn.
//   - Single/fixed slot: always counted — except when the slot is the "자유"
//     sentinel (isFreeItem), which means admin left the choice wide open.
//   - Weapon E-spell display itself: skipped for multi-option weapon slots
//     that have no assignment (no single "selected" spell to annotate).

import type { Slot, SlotKey } from '@/types'
import { isFreeItem } from '@/types'
import itemSpellsJson from '@/data/albion-item-spells.json'
import spellSlotsJson from '@/data/albion-spell-slots.json'
import cooldownsJson from '@/data/albion-spell-cooldowns.json'

type ItemSpellEntry = { name: string; slot: number | null; type: 'active' | 'passive' }
const ITEM_SPELLS = itemSpellsJson as unknown as Record<string, ItemSpellEntry[]>

type SpellSlotInfo = { slot: number | null; type: 'active' | 'passive' }
const SPELL_SLOTS = spellSlotsJson as Record<string, SpellSlotInfo>

type CooldownsData = {
  spells: Record<string, { baseCd: number }>
  modifiers: Record<string, { cdr: number }>
  foodSpell: Record<string, string>
}
const CD_DATA = cooldownsJson as CooldownsData

// Which weapon-slot active spell should carry the CD badge for a given
// weapon item. Defaults to slot 3 (E-slot) — the member's headline spell
// across almost every weapon.
//
// Exception: the basic Mace (T4~T8_MAIN_MACE, no artifact suffix) — its
// W-slot (slot 2, e.g. GROUNDSHAKER / CHARGE_ROOT / GUARDRUNE / PBAOE_PULL)
// is the real main skill for guilds running base mace tanks; MACELEAP on
// slot 3 is a mobility tool, not a rotation keystone. Artifact maces
// (MAIN_MACE_HELL/MORGANA/KEEPER/AVALON/CRYSTAL) swap in a signature E
// spell (SHRINKINGSMASH etc.) so they keep the slot-3 default.
const BASE_MACE_RE = /^T\d_MAIN_MACE$/

function targetCdSlot(weaponItemId: string | null | undefined): number {
  if (weaponItemId && BASE_MACE_RE.test(weaponItemId)) return 2
  return 3
}

// Returns true when the spell sits in the CD-target slot for its weapon.
// Callers that don't know the weapon id (non-weapon rows) pass null, and
// we fall back to the default slot 3.
export function isCdTargetSpell(
  spellId: string,
  weaponItemId: string | null | undefined,
): boolean {
  const info = SPELL_SLOTS[spellId]
  if (info?.type !== 'active') return false
  return info.slot === targetCdSlot(weaponItemId)
}

// Strips an Albion enchantment suffix (`@1`/`@2`/`@3`) — item-spells maps
// keys to the base item, so we look up both the full id and its base form
// when resolving passive spells.
function baseId(itemId: string): string {
  const at = itemId.indexOf('@')
  return at === -1 ? itemId : itemId.slice(0, at)
}

// For CDR aggregation: returns the item id to use for a given slot, or null
// to skip it. Honors the multi-option and free-item exclusion rules.
function resolveCdrSourceItem(slot: Slot, key: SlotKey): string | null {
  const options = slot[`${key}_options`]
  if (Array.isArray(options) && options.length > 0) {
    // Multi-option: need an explicit pick, otherwise unknown.
    const assignedId = slot[`assigned_${key}_id`]
    return assignedId ?? null
  }
  // Single/fixed mode. Prefer assigned (member's own pick) over admin default.
  const name = slot[`assigned_${key}_name`] ?? slot[`${key}_name`]
  const id = slot[`assigned_${key}_id`] ?? slot[`${key}_id`]
  if (isFreeItem(name, id)) return null
  return id
}

// Walks an armor/head/shoes item's spell pool and returns every CDR buff it
// contributes. Usually at most one per item (the dedicated CD_REDUCTION
// passive), but we collect them all in case an artifact layers additional
// CDR — safer than hardcoding a single-entry assumption.
function collectArmorCdr(itemId: string): { spell: string; cdr: number }[] {
  const spells = ITEM_SPELLS[itemId] ?? ITEM_SPELLS[baseId(itemId)]
  if (!spells) return []
  const out: { spell: string; cdr: number }[] = []
  for (const s of spells) {
    const mod = CD_DATA.modifiers[s.name]
    if (mod && mod.cdr > 0) {
      out.push({ spell: s.name, cdr: mod.cdr })
    }
  }
  return out
}

// Food items apply their buff via `consumespell`; that spell then carries the
// `magiccooldownreduction` buff. `foodSpell` was built at the item level
// (T4_MEAL_OMELETTE → FOOD_BUFF_CASTSPEED_CDR_P1) with enchanted variants
// keyed as `@1`/`@2`/`@3`, so fall through to the base form if the exact key
// isn't found.
function collectFoodCdr(itemId: string): { spell: string; cdr: number } | null {
  const consumespell =
    CD_DATA.foodSpell[itemId] ?? CD_DATA.foodSpell[baseId(itemId)]
  if (!consumespell) return null
  const mod = CD_DATA.modifiers[consumespell]
  if (!mod || mod.cdr <= 0) return null
  return { spell: consumespell, cdr: mod.cdr }
}

export type OffhandCdrType = 'TORCH' | 'HORN_KEEPER' | 'JESTERCANE_HELL' | 'TOME_CRYSTAL'

export interface CooldownSource {
  key: 'head' | 'armor' | 'shoes' | 'food' | 'offhand'
  itemId: string
  spell: string
  cdr: number
  // Only populated when `key === 'offhand'` — identifies which artifact family
  // contributed the CDR so the tooltip can spell it out (e.g. "Torch", "Horn").
  offhandType?: OffhandCdrType
}

// Offhands with CDR don't expose it via passivespell — the modifier lives on
// the equipmentitem itself as `magiccooldownreduction="0.00XX"` and scales
// with item power + mastery spec at runtime. Product spec (2026-04-22):
// assume 100 mastery; pick a rough fixed value per artifact family. These
// are tuned to match in-game tooltip at T7–T8.0 with 100 spec — the guild
// uses them as planning reference, not exact math.
//
//   Torch               ~5%
//   Horn (Keeper)       ~7.7%
//   Jester Cane (Hell)  ~3.8%
//   Tome (Crystal)      ~3.8%
//
// Suffix matches the portion after `T\d_OFF_` (and after stripping the @N
// enchant suffix). If the upstream adds a new CDR-carrying offhand artifact,
// check items.xml for `<equipmentitem ... slottype="offhand" ... magiccooldownreduction=".."`
// and extend this table.
const OFFHAND_CDR_BY_SUFFIX: Record<string, number> = {
  TORCH: 0.05,
  HORN_KEEPER: 0.077,
  JESTERCANE_HELL: 0.038,
  TOME_CRYSTAL: 0.038,
}

const OFFHAND_SUFFIX_RE = /^T\d_OFF_(.+)$/

function collectOffhandCdr(
  itemId: string,
): { cdr: number; offhandType: OffhandCdrType } | null {
  const m = baseId(itemId).match(OFFHAND_SUFFIX_RE)
  if (!m) return null
  const suffix = m[1]
  const cdr = OFFHAND_CDR_BY_SUFFIX[suffix]
  if (cdr === undefined) return null
  return { cdr, offhandType: suffix as OffhandCdrType }
}

export interface EffectiveCooldown {
  baseCd: number
  sources: CooldownSource[]
  totalRaw: number // un-DR'd sum of source cdrs (for tooltip display)
  effectiveCd: number
}

// Returns the effective CD for a given spell on a given slot, or null when:
//   - The spell isn't in the cooldown table (no recastdelay — passive, etc).
//   - The spell is attached to a weapon row for a multi-option slot that
//     hasn't been assigned yet. The product rule is "only compute for the
//     selected weapon" in that case.
//
// When `weaponRowAssignedOnly` is true, the caller is rendering the badge
// next to a weapon row; we apply the multi-option-must-be-assigned rule.
// When false (reserved for future slots), we skip that gate.
export function computeEffectiveCd(
  slot: Slot,
  spellId: string,
  weaponRowAssignedOnly: boolean = true,
): EffectiveCooldown | null {
  const entry = CD_DATA.spells[spellId]
  if (!entry) return null

  if (weaponRowAssignedOnly) {
    const weaponOptions = slot.weapon_options
    const weaponMulti = Array.isArray(weaponOptions) && weaponOptions.length > 0
    if (weaponMulti && !slot.assigned_weapon_id) {
      return null
    }
  }

  const sources: CooldownSource[] = []
  for (const key of ['head', 'armor', 'shoes'] as const) {
    const itemId = resolveCdrSourceItem(slot, key)
    if (!itemId) continue
    for (const c of collectArmorCdr(itemId)) {
      sources.push({ key, itemId, spell: c.spell, cdr: c.cdr })
    }
  }
  const offhandItemId = resolveCdrSourceItem(slot, 'offhand')
  if (offhandItemId) {
    const off = collectOffhandCdr(offhandItemId)
    if (off) {
      sources.push({
        key: 'offhand',
        itemId: offhandItemId,
        spell: 'OFFHAND_CDR',
        cdr: off.cdr,
        offhandType: off.offhandType,
      })
    }
  }
  const foodItemId = resolveCdrSourceItem(slot, 'food')
  if (foodItemId) {
    const f = collectFoodCdr(foodItemId)
    if (f) sources.push({ key: 'food', itemId: foodItemId, spell: f.spell, cdr: f.cdr })
  }

  const totalRaw = sources.reduce((acc, s) => acc + s.cdr, 0)
  const effectiveCd = entry.baseCd / (1 + totalRaw)
  return { baseCd: entry.baseCd, sources, totalRaw, effectiveCd }
}

// Display helper — 24.8s / 24s depending on caller. Product spec is 1 decimal.
export function formatCooldown(seconds: number): string {
  return `${seconds.toFixed(1)}s`
}
