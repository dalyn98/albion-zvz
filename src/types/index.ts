export interface Event {
  id: string
  title: string
  gather_time: string
  gather_at: string | null
  gather_location: string
  special_notes: string | null
  is_active: boolean
  battle_started_at: string | null
  // Migration 030: 이벤트 Discord 채널 공지 시 @멘션할 역할 ID. NULL 이면
  // 멘션 없이 조용히 올린다.
  notify_role_id: string | null
  // Migration 032: 공지를 올릴 Discord 채널 ID. NULL 이면 env 기반 기본 채널
  // (DISCORD_EVENT_CHANNEL_ID) 로 fallback.
  notify_channel_id: string | null
  // Migration 039: Discord ID of the event creator. NULL for legacy events
  // created before this column existed — those remain admin-only for edits.
  created_by: string | null
  // Migration 059: 발행 상태. 'draft' = 관리자만 보임, 공개 /events 숨김.
  // 'published' = 공개. createEvent 는 draft 로만 만들고, publishEvent 가
  // gather_at 을 검증 후 published 로 전이시킨다.
  status: 'draft' | 'published'
  // Migration 063+064: 이벤트 카테고리. '전투' = 정식 ZvZ, 'FF' = 페임파밍,
  // '갱킹' = 소규모 PvP 갱킹. 홈 목록에서 카테고리별로 분리 표시하고, 개인 알림
  // 설정(notify_combat / notify_ff / notify_ganking)에 따라 DM 대상을 필터링한다.
  category: EventCategory
  created_at: string
}

export const EVENT_CATEGORIES = ['전투', 'FF', '갱킹'] as const
export type EventCategory = (typeof EVENT_CATEGORIES)[number]

// 각 카테고리별 notify 플래그가 매핑되는 DB 컬럼명. 한 군데서만 관리해
// notifications / discord-dm / 컴포넌트가 동일한 이름을 쓴다.
export const CATEGORY_NOTIFY_COLUMN: Record<EventCategory, 'notify_combat' | 'notify_ff' | 'notify_ganking'> = {
  '전투': 'notify_combat',
  'FF': 'notify_ff',
  '갱킹': 'notify_ganking',
}

// 카테고리 값을 그대로 번역 키로 쓸 수 없어 (ascii-safe 아님) 별도 slug 매핑.
// i18n 에서는 `category_${slug}` 형식으로 참조한다.
export const CATEGORY_I18N_SLUG: Record<EventCategory, 'combat' | 'ff' | 'ganking'> = {
  '전투': 'combat',
  'FF': 'ff',
  '갱킹': 'ganking',
}

// 카테고리별 파티 수 제한. 전투는 기본 4파티·최대 10파티, FF/갱킹은 소규모
// 스쿼드 단위라 기본 1파티·최대 2파티로 제한한다. 편집 페이지가 이 값을 사용해
// 초기 렌더 개수와 "파티 추가" 버튼 상한을 결정.
export interface CategoryPartyLimits {
  default: number
  max: number
}
export const CATEGORY_PARTY_LIMITS: Record<EventCategory, CategoryPartyLimits> = {
  '전투': { default: 4, max: 10 },
  'FF': { default: 1, max: 2 },
  '갱킹': { default: 1, max: 2 },
}

export type BombSquadKind = 'melee' | 'ranged'

export const BOMB_SQUAD_KINDS: readonly BombSquadKind[] = ['melee', 'ranged']

export interface Party {
  id: string
  event_id: string
  party_number: number
  // Migration 041: custom party name. Only allowed on bomb squad parties —
  // regular parties render as "N파티" derived from party_number.
  name: string | null
  // Migration 041: opt-in flag that switches the party to approval-gated
  // sign-ups (via requested_* slot fields).
  is_bomb_squad: boolean
  // Migration 041: required when is_bomb_squad = true; null otherwise. Drives
  // member-facing badge text (근거리/원거리) and team-comp guidance.
  bomb_squad_kind: BombSquadKind | null
  // Migration 041: Discord ID of the sub-caller who approves sign-ups to this
  // bomb squad. The main event caller (admin) is always authorized regardless
  // of this value. Null for regular parties.
  caller_discord_id: string | null
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

// "Flat" = tier + enchant. 4.4 / 5.3 / 6.2 / 7.1 / 8.0 are all "8 flat" and
// perform roughly equivalently in zvz, so admins specify gear by flat rather
// than picking a specific tier/enchant breakdown.
export const GEAR_FLAT_MIN = GEAR_TIER_MIN + GEAR_ENCHANT_MIN
export const GEAR_FLAT_MAX = GEAR_TIER_MAX + GEAR_ENCHANT_MAX

// Enchant level color mapping — Albion's in-game visual cue. 0 has no color
// (base white), 1-4 map to green/blue/purple/yellow respectively.
export const GEAR_ENCHANT_COLOR_CLASS: Record<number, string> = {
  0: 'text-gray-300',
  1: 'text-green-400',
  2: 'text-sky-400',
  3: 'text-purple-400',
  4: 'text-yellow-300',
}

// Returns the flat value for a spec, or null if either tier or enchant is
// missing (a partial spec can't be meaningfully summed).
export function specToFlat(spec: GearSpec | null | undefined): number | null {
  if (!spec) return null
  if (spec.tier == null || spec.enchant == null) return null
  return spec.tier + spec.enchant
}

// Canonicalizes a flat value to {tier, enchant}: prefer max tier, push the
// remainder into enchant. Legacy breakdowns like 4.4 normalize to 8.0 on
// resave — intentional since the user treats them as equivalent.
export function flatToSpec(flat: number): GearSpec {
  const tier = Math.min(GEAR_TIER_MAX, Math.max(GEAR_TIER_MIN, flat))
  const enchant = Math.max(GEAR_ENCHANT_MIN, Math.min(GEAR_ENCHANT_MAX, flat - tier))
  return { tier, enchant }
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
  mount_name: string | null;  mount_id: string | null
  weapon_options: GearOption[] | null
  head_options: GearOption[] | null
  armor_options: GearOption[] | null
  shoes_options: GearOption[] | null
  offhand_options: GearOption[] | null
  potion_options: GearOption[] | null
  food_options: GearOption[] | null
  cape_options: GearOption[] | null
  mount_options: GearOption[] | null
  spells: SlotSpells | null
  // Migration 035: per-slot target tier/enchant the member is expected to
  // bring. Independent of item_id (which is the archetype reference).
  gear_specs: GearSpecs | null
  // Migration 050: per-slot opt-out for auto-regear. When true, the auto-regear
  // cron will skip this slot's assignee even if the global toggle is ON.
  auto_regear_excluded: boolean
  // Migration 069: per-slot opt-out for manual regear submissions.
  manual_regear_excluded: boolean
  assigned_discord_id: string | null
  assigned_username: string | null
  assigned_weapon_name: string | null;  assigned_weapon_id: string | null
  assigned_head_name: string | null;    assigned_head_id: string | null
  assigned_armor_name: string | null;   assigned_armor_id: string | null
  assigned_shoes_name: string | null;   assigned_shoes_id: string | null
  assigned_offhand_name: string | null; assigned_offhand_id: string | null
  assigned_potion_name: string | null;  assigned_potion_id: string | null
  assigned_food_name: string | null;    assigned_food_id: string | null
  assigned_cape_name: string | null;    assigned_cape_id: string | null
  assigned_mount_name: string | null;   assigned_mount_id: string | null
  // Migration 041: pending bomb squad request. All four are set together or
  // all null — assigned_* stays empty while the request is pending, and is
  // populated from requested_picks by approve_slot_request.
  requested_discord_id: string | null
  requested_username: string | null
  requested_picks: Record<string, { name: string | null; id: string | null }> | null
  requested_at: string | null
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
  | 'mount_name'   | 'mount_id'   | 'assigned_mount_name'   | 'assigned_mount_id'
>

export type SlotGearOptionsFields = Pick<Slot,
  | 'weapon_options' | 'head_options' | 'armor_options' | 'shoes_options'
  | 'offhand_options' | 'potion_options' | 'food_options' | 'cape_options'
  | 'mount_options'
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

export type SlotKey = 'weapon' | 'head' | 'armor' | 'shoes' | 'offhand' | 'potion' | 'food' | 'cape' | 'mount'

export const SLOT_LABELS: Record<SlotKey, string> = {
  weapon:  '주무기',
  head:    '머리',
  armor:   '갑옷',
  shoes:   '신발',
  offhand: '보조무기',
  potion:  '포션',
  food:    '음식',
  cape:    '망토',
  mount:   '탈것',
}

export const SLOT_KEYS: SlotKey[] = ['weapon', 'head', 'armor', 'shoes', 'offhand', 'potion', 'food', 'cape', 'mount']

// Food/potion items already encode their tier in the item id (e.g. T8 Roast Beef),
// so the admin spec only carries the enchant requirement. Weapon/armor/cape
// items have a tier prefix on the id too, but the spec overrides are meaningful
// there because admins often want "any T8 of this family".
export const TIERLESS_SLOT_KEYS: readonly SlotKey[] = ['food', 'potion']

export function isTierlessSlot(key: SlotKey): boolean {
  return TIERLESS_SLOT_KEYS.includes(key)
}

// Mount items don't participate in the tier/enchant spec system at all —
// they're picked as a specific item, no quality override to track.
export const SPEC_LESS_SLOT_KEYS: readonly SlotKey[] = ['mount']

export function isSpecLessSlot(key: SlotKey): boolean {
  return SPEC_LESS_SLOT_KEYS.includes(key)
}

// Event editor restricts gear pickers to T8 (Elder's) only — ZvZ compositions
// never call for lower-tier gear. Consumables (food/potion) and mounts keep
// the full tier range so admins can still prescribe cheaper alternatives.
export const T8_ONLY_SLOT_KEYS: readonly SlotKey[] = ['weapon', 'head', 'armor', 'shoes', 'offhand', 'cape']

export function isT8OnlySlot(key: SlotKey): boolean {
  return T8_ONLY_SLOT_KEYS.includes(key)
}

// Role-dependent primary gear. For BM (battle mount) role the mount is the
// main weapon — everything else (spell panel, card preview) should pivot
// around mount instead of weapon for that role.
export function getPrimaryGearKind(roleName: string | null | undefined): SlotKey {
  return roleName === 'BM' ? 'mount' : 'weapon'
}

// Categories passed to ItemPicker for each slot kind.
export const SLOT_PICKER_CATEGORY: Record<SlotKey, string> = {
  weapon:  'weapon',
  head:    'head',
  armor:   'armor',
  shoes:   'shoes',
  offhand: 'offhand',
  potion:  'potion',
  food:    'food',
  cape:    'cape',
  mount:   'mount',
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

// Unified payout helper. Resolves to the actual credited amount when known:
//   1. payout_silver — set on approved rows after migration 044; reflects the
//      rate-adjusted credit that landed in point_ledger.
//   2. claimed_silver — set on every post-018 row; pending/rejected rows have
//      no payout yet, so the UI shows the member's ask.
//   3. silver — legacy rows inserted before migration 018 unified the flow.
export function regearPayoutSilver(row: {
  silver: number
  claimed_silver: number | null
  payout_silver?: number | null
}): number {
  return row.payout_silver ?? row.claimed_silver ?? row.silver
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
