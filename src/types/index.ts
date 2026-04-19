export interface Event {
  id: string
  title: string
  gather_time: string
  gather_at: string | null
  gather_location: string
  special_notes: string | null
  is_active: boolean
  battle_started_at: string | null
  created_at: string
}

export interface Party {
  id: string
  event_id: string
  party_number: number
}

export interface WeaponOption {
  name: string
  id: string
}

export interface Slot {
  id: string
  party_id: string
  slot_number: number
  role_name: string | null
  notes: string | null
  weapon_name: string | null; weapon_id: string | null
  weapon_options: WeaponOption[] | null
  head_name: string | null;   head_id: string | null
  armor_name: string | null;  armor_id: string | null
  shoes_name: string | null;  shoes_id: string | null
  offhand_name: string | null;offhand_id: string | null
  potion_name: string | null; potion_id: string | null
  food_name: string | null;   food_id: string | null
  cape_name: string | null;   cape_id: string | null
  spells: SlotSpells | null
  assigned_discord_id: string | null
  assigned_username: string | null
  assigned_weapon_name: string | null
  assigned_weapon_id: string | null
}

// Returns the weapon to display for a slot. The assignment takes priority
// (member-picked weapon), then the admin-specified fixed weapon.
export function getDisplayWeapon(
  slot: Pick<Slot, 'weapon_name' | 'weapon_id' | 'assigned_weapon_name' | 'assigned_weapon_id'>,
): { name: string | null; id: string | null } {
  if (slot.assigned_weapon_id) {
    return { name: slot.assigned_weapon_name, id: slot.assigned_weapon_id }
  }
  return { name: slot.weapon_name, id: slot.weapon_id }
}

export function hasWeaponOptions(
  slot: Pick<Slot, 'weapon_options'>,
): slot is Slot & { weapon_options: WeaponOption[] } {
  return Array.isArray(slot.weapon_options) && slot.weapon_options.length > 0
}

export interface PartyWithSlots extends Party {
  slots: Slot[]
}

export type SlotKey = 'weapon' | 'head' | 'armor' | 'shoes' | 'offhand' | 'potion' | 'food' | 'cape'

export const SLOT_LABELS: Record<SlotKey, string> = {
  weapon:  '주무기',
  head:    '머리',
  armor:   '갑옷',
  shoes:   '신발',
  offhand: '보조무기',
  potion:  '포션',
  food:    '음식',
  cape:    '망토',
}

export const SLOT_KEYS: SlotKey[] = ['weapon', 'head', 'armor', 'shoes', 'offhand', 'potion', 'food', 'cape']

// Per-slot spell assignments. Keyed by gear kind (weapon/head/armor/...),
// value is an array of Albion spell uniquenames (e.g. "MOUNTSPELL_INTIMIDATINGAURA").
// Icons are resolved at display time via render.albiononline.com/v1/spell/{uniquename}.png.
export type SlotSpells = Partial<Record<SlotKey, string[]>>

export const MAX_SPELLS_PER_SLOT_ITEM = 4

// One entry in an item's craftable spell pool. `slot` is the slot index from
// items.xml (`slots="N"`). Weapons use 1/2/3 (Q/W/E); passives have slot=null.
export interface SpellPoolEntry {
  name: string
  slot: number | null
}

export function getSpells(spells: SlotSpells | null | undefined, key: SlotKey): string[] {
  return spells?.[key] ?? []
}

export interface AlbionItem {
  uniqueName: string
  displayName: string
}

// Sentinel name stored in `{slot}_name` with a null `{slot}_id` to mark the slot as
// "free choice" — the assigned member picks their own item for this slot.
export const FREE_ITEM_NAME = '자유'

export function isFreeItem(
  name: string | null | undefined,
  id: string | null | undefined,
): boolean {
  return name === FREE_ITEM_NAME && !id
}

export type RegearType = 'death' | 'overcharge'

export const REGEAR_TYPE_LABEL: Record<RegearType, string> = {
  death: '데스',
  overcharge: '오버차지',
}

// For overcharge, the actual payout is the member's claimed amount; for death,
// it's the role reward snapshot. `silver` keeps both meanings (ceiling/payout).
export function regearPayoutSilver(row: {
  silver: number
  request_type: RegearType
  claimed_silver: number | null
}): number {
  return row.request_type === 'overcharge' ? row.claimed_silver ?? 0 : row.silver
}

export const SLOT_ROLES = [
  'Caller',
  'OffTanker',
  'DefTanker',
  'Sup',
  'Healer',
  'Dps',
  'BM',
  '기타',
] as const

export type SlotRole = (typeof SLOT_ROLES)[number]

export interface SlotRoleStyle {
  badge: string
  dot: string
}

export const SLOT_ROLE_STYLES: Record<SlotRole, SlotRoleStyle> = {
  Caller:    { badge: 'bg-lime-500/20 text-lime-300 border border-lime-500/40',   dot: 'bg-lime-400' },
  OffTanker: { badge: 'bg-blue-800/40 text-blue-200 border border-blue-700/50',   dot: 'bg-blue-600' },
  DefTanker: { badge: 'bg-sky-400/20 text-sky-200 border border-sky-400/40',      dot: 'bg-sky-300' },
  Sup:       { badge: 'bg-yellow-500/20 text-yellow-200 border border-yellow-500/40', dot: 'bg-yellow-400' },
  Healer:    { badge: 'bg-green-500/20 text-green-300 border border-green-500/40', dot: 'bg-green-400' },
  Dps:       { badge: 'bg-red-500/20 text-red-300 border border-red-500/40',       dot: 'bg-red-400' },
  BM:        { badge: 'bg-gray-500/30 text-gray-200 border border-gray-500/40',    dot: 'bg-gray-400' },
  '기타':     { badge: 'bg-pink-300/20 text-pink-200 border border-pink-300/40',   dot: 'bg-pink-300' },
}

export function getRoleStyle(role: string | null | undefined): SlotRoleStyle | null {
  if (!role) return null
  return SLOT_ROLE_STYLES[role as SlotRole] ?? null
}
