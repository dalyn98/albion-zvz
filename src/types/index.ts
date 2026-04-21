export interface Event {
  id: string
  title: string
  gather_time: string
  gather_at: string | null
  gather_location: string
  special_notes: string | null
  is_active: boolean
  battle_started_at: string | null
  // 과반수의 event_battles.outcome 에서 자동 집계. 동수이면 null 로 남는다.
  outcome: 'win' | 'loss' | null
  finalized_at: string | null
  // Migration 030: 이벤트 Discord 채널 공지 시 @멘션할 역할 ID. NULL 이면
  // 멘션 없이 조용히 올린다.
  notify_role_id: string | null
  // Migration 032: 공지를 올릴 Discord 채널 ID. NULL 이면 env 기반 기본 채널
  // (DISCORD_EVENT_CHANNEL_ID) 로 fallback.
  notify_channel_id: string | null
  created_at: string
}

export type EventOutcome = 'win' | 'loss'

export interface EventBattle {
  id: string
  event_id: string
  battle_number: number
  opponent_guild: string
  // Migration 024: FK to opponent_guilds. `opponent_guild` (text) stays as a
  // display snapshot so renaming/deleting a guild doesn't mutate history.
  opponent_guild_id: string | null
  outcome: EventOutcome
  // Migration 028: Discord ID of the per-battle MVP. NULL means not recorded.
  mvp_discord_id: string | null
  created_at: string
}

export interface OpponentGuild {
  id: string
  name: string
  notes: string | null
  created_at: string
}

export interface Party {
  id: string
  event_id: string
  party_number: number
}

export interface GearOption {
  name: string
  id: string
  // Multi 모드에서 옵션별로 다른 스킬을 고를 수 있도록 옵션 자체에 스킬을
  // 매단다. null/undefined 이면 해당 옵션에 지정된 스킬이 없음. Single/free
  // 모드에서는 `slot.spells[key]` 를 계속 사용하므로 이 필드는 무시된다.
  spells?: string[]
}

/** @deprecated Use GearOption — this alias exists for older imports only. */
export type WeaponOption = GearOption

// Target gear spec: what tier/enchant the member should bring. Both optional
// because admin may specify only one (e.g. "T8 any enchant").
export interface GearSpec {
  tier?: number
  enchant?: number
}

export type GearSpecs = Partial<Record<SlotKey, GearSpec>>

// Albion gear quality ranges. Tier 2-3 exist in game but zvz builds always
// start from T4; we lock the picker to T4-T8 to match what admins specify.
export const GEAR_TIER_MIN = 4
export const GEAR_TIER_MAX = 8
export const GEAR_ENCHANT_MIN = 0
export const GEAR_ENCHANT_MAX = 4

// Enchant level color mapping — Albion's in-game visual cue. 0 has no color
// (base white), 1-4 map to green/blue/purple/yellow respectively.
export const GEAR_ENCHANT_COLOR_CLASS: Record<number, string> = {
  0: 'text-gray-300',
  1: 'text-green-400',
  2: 'text-sky-400',
  3: 'text-purple-400',
  4: 'text-yellow-300',
}

export function formatTierEnchant(spec: GearSpec | null | undefined): string | null {
  if (!spec) return null
  const { tier, enchant } = spec
  if (tier == null && enchant == null) return null
  if (tier != null && enchant != null) return `T${tier}.${enchant}`
  if (tier != null) return `T${tier}`
  return `@${enchant}`
}

export function getSlotGearSpec(
  specs: GearSpecs | null | undefined,
  key: SlotKey,
): GearSpec | null {
  const spec = specs?.[key]
  if (!spec) return null
  if (spec.tier == null && spec.enchant == null) return null
  return spec
}

export interface Slot {
  id: string
  party_id: string
  slot_number: number
  // Admins can hide individual builds so members don't see them in the event
  // sidebar. Assignment data is preserved so unhiding restores the slot as-is.
  is_hidden: boolean
  role_name: string | null
  notes: string | null
  weapon_name: string | null; weapon_id: string | null
  head_name: string | null;   head_id: string | null
  armor_name: string | null;  armor_id: string | null
  shoes_name: string | null;  shoes_id: string | null
  offhand_name: string | null;offhand_id: string | null
  potion_name: string | null; potion_id: string | null
  food_name: string | null;   food_id: string | null
  cape_name: string | null;   cape_id: string | null
  weapon_options: GearOption[] | null
  head_options: GearOption[] | null
  armor_options: GearOption[] | null
  shoes_options: GearOption[] | null
  offhand_options: GearOption[] | null
  potion_options: GearOption[] | null
  food_options: GearOption[] | null
  cape_options: GearOption[] | null
  spells: SlotSpells | null
  // Migration 035: per-slot target tier/enchant the member is expected to
  // bring. Independent of item_id (which is the archetype reference).
  gear_specs: GearSpecs | null
  assigned_discord_id: string | null
  assigned_username: string | null
  // Set by admin when a signed-up member actually showed up in-game. NULL
  // after battle start means "no-show". See migration 027.
  attended_at: string | null
  assigned_weapon_name: string | null;  assigned_weapon_id: string | null
  assigned_head_name: string | null;    assigned_head_id: string | null
  assigned_armor_name: string | null;   assigned_armor_id: string | null
  assigned_shoes_name: string | null;   assigned_shoes_id: string | null
  assigned_offhand_name: string | null; assigned_offhand_id: string | null
  assigned_potion_name: string | null;  assigned_potion_id: string | null
  assigned_food_name: string | null;    assigned_food_id: string | null
  assigned_cape_name: string | null;    assigned_cape_id: string | null
}

// Pick<Slot, ...> helpers for callers that only need the gear-display subset —
// avoids forcing tests/helpers to fabricate the full Slot shape.
export type SlotGearDisplay = Pick<Slot,
  | 'weapon_name'  | 'weapon_id'  | 'assigned_weapon_name'  | 'assigned_weapon_id'
  | 'head_name'    | 'head_id'    | 'assigned_head_name'    | 'assigned_head_id'
  | 'armor_name'   | 'armor_id'   | 'assigned_armor_name'   | 'assigned_armor_id'
  | 'shoes_name'   | 'shoes_id'   | 'assigned_shoes_name'   | 'assigned_shoes_id'
  | 'offhand_name' | 'offhand_id' | 'assigned_offhand_name' | 'assigned_offhand_id'
  | 'potion_name'  | 'potion_id'  | 'assigned_potion_name'  | 'assigned_potion_id'
  | 'food_name'    | 'food_id'    | 'assigned_food_name'    | 'assigned_food_id'
  | 'cape_name'    | 'cape_id'    | 'assigned_cape_name'    | 'assigned_cape_id'
>

export type SlotGearOptionsFields = Pick<Slot,
  | 'weapon_options' | 'head_options' | 'armor_options' | 'shoes_options'
  | 'offhand_options' | 'potion_options' | 'food_options' | 'cape_options'
>

// Returns the gear to display for a slot kind. A member's pick (assigned_*)
// takes priority over the admin-specified fixed gear.
export function getDisplayGear(
  slot: SlotGearDisplay,
  key: SlotKey,
): { name: string | null; id: string | null } {
  const assignedName = slot[`assigned_${key}_name`]
  const assignedId = slot[`assigned_${key}_id`]
  if (assignedId) return { name: assignedName, id: assignedId }
  return { name: slot[`${key}_name`], id: slot[`${key}_id`] }
}

export function getGearOptions(
  slot: SlotGearOptionsFields,
  key: SlotKey,
): GearOption[] | null {
  return slot[`${key}_options`]
}

export function hasGearOptions(
  slot: SlotGearOptionsFields,
  key: SlotKey,
): boolean {
  const opts = slot[`${key}_options`]
  return Array.isArray(opts) && opts.length > 0
}

// Legacy weapon-only helpers — still used by pieces that haven't migrated yet.
export function getDisplayWeapon(slot: SlotGearDisplay): { name: string | null; id: string | null } {
  return getDisplayGear(slot, 'weapon')
}

export function hasWeaponOptions(slot: SlotGearOptionsFields): boolean {
  return hasGearOptions(slot, 'weapon')
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

// Categories passed to ItemPicker for each slot kind. Weapons share the mount
// category because Albion treats mounts as a weapon slot substitute.
export const SLOT_PICKER_CATEGORY: Record<SlotKey, string> = {
  weapon:  'weapon,mount',
  head:    'head',
  armor:   'armor',
  shoes:   'shoes',
  offhand: 'offhand',
  potion:  'potion',
  food:    'food',
  cape:    'cape',
}

// Per-slot spell assignments. Keyed by gear kind (weapon/head/armor/...),
// value is an array of Albion spell uniquenames (e.g. "MOUNTSPELL_INTIMIDATINGAURA").
// Icons are resolved at display time via render.albiononline.com/v1/spell/{uniquename}.png.
export type SlotSpells = Partial<Record<SlotKey, string[]>>

// One entry in an item's craftable spell pool.
// - `type` classifies by name prefix: 'passive' for PASSIVE_*, 'active'
//   otherwise. items.xml has no explicit marker so we rely on the convention.
// - `slot` is items.xml's `slots="N"` attribute. Its meaning depends on type:
//   for active spells on weapons it's the Q/W/E position (1/2/3); for passive
//   spells on armor/head/shoes it partitions passive slots (1/2).
export interface SpellPoolEntry {
  name: string
  slot: number | null
  type: 'active' | 'passive'
}

export function getSpells(spells: SlotSpells | null | undefined, key: SlotKey): string[] {
  return spells?.[key] ?? []
}

export interface AlbionItem {
  uniqueName: string
  displayName: string
}

// Regear 신청 시점에 고정되는 gear 정보. 슬롯이 이후 편집·삭제되어도 관리자
// 검증(인게임에서 실제 착용 확인)을 위해 스냅샷으로 보존. 각 키는 assigned
// 우선, 없으면 고정 gear(`{kind}_name`/`{kind}_id`) 규칙으로 채운다.
export interface GearSnapshotItem {
  name: string | null
  id: string | null
}

export type BuildSnapshot = {
  role_name: string | null
} & Record<SlotKey, GearSnapshotItem>

// Sentinel name stored in `{slot}_name` with a null `{slot}_id` to mark the slot as
// "free choice" — the assigned member picks their own item for this slot.
export const FREE_ITEM_NAME = '자유'

export function isFreeItem(
  name: string | null | undefined,
  id: string | null | undefined,
): boolean {
  return name === FREE_ITEM_NAME && !id
}

// Preserved for historical rows inserted before migration 018 unified the
// flow. New rows always carry claimed_silver; the column stays for audit
// readability but application code no longer branches on it.
export type RegearType = 'death' | 'overcharge'

// Unified payout helper. Post-018 every row has claimed_silver set; the
// fallback to `silver` only matters for legacy rows read during the window
// between deploy and migration apply.
export function regearPayoutSilver(row: {
  silver: number
  claimed_silver: number | null
}): number {
  return row.claimed_silver ?? row.silver
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
