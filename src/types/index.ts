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
  // Migration 032: 공지를 올릴 Discord 채널 ID. NULL 이면 tenant 설정의
  // event_channel_id 를 fallback 으로 사용한다.
  notify_channel_id: string | null
  // Migration 105: true 면 채널 공지에 @everyone 을 함께 멘션한다.
  // notify_role_id 와 독립 동작 — 둘 다 켜져 있으면 둘 다 멘션된다.
  notify_everyone: boolean
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
  // 모집 화면의 기본 UX. slots = 기존 파티/슬롯 지정, build_sheet = 빌드표
  // 중심 모집, hybrid = 빌드표로 모집하되 운영진이 슬롯 확정.
  recruitment_mode: EventRecruitmentMode
  // When true, this event remains operational but its slot assignments are
  // omitted from generic event participation statistics.
  exclude_from_participation_stats: boolean
  // FF/갱킹 이벤트에서 수동 리기어 상한을 이벤트 단위로 override 할 수 있다.
  // 전투 카테고리는 application code 에서 항상 'role' 로 강제한다.
  regear_policy: EventRegearPolicy
  regear_silver_cap: number | null
  regear_max_deaths_per_member: number | null
  regear_video_policy: EventRegearVideoPolicy
  regear_video_payout_rate_percent: number | null
  regear_video_claim_ceiling_bonus_silver: number | null
  regear_video_rate_applies_without_proof: boolean
  regear_auto_policy: EventRegearAutoPolicy
  created_at: string
}

export const EVENT_CATEGORIES = ['전투', 'FF', '갱킹'] as const
export type EventCategory = (typeof EVENT_CATEGORIES)[number]

export const EVENT_RECRUITMENT_MODES = ['slots', 'build_sheet', 'hybrid'] as const
export type EventRecruitmentMode = (typeof EVENT_RECRUITMENT_MODES)[number]

export const EVENT_REGEAR_POLICIES = ['role', 'event', 'disabled'] as const
export type EventRegearPolicy = (typeof EVENT_REGEAR_POLICIES)[number]

export const EVENT_REGEAR_VIDEO_POLICIES = ['inherit', 'disabled', 'custom'] as const
export type EventRegearVideoPolicy = (typeof EVENT_REGEAR_VIDEO_POLICIES)[number]

export const EVENT_REGEAR_AUTO_POLICIES = ['inherit', 'disabled'] as const
export type EventRegearAutoPolicy = (typeof EVENT_REGEAR_AUTO_POLICIES)[number]

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

// 카테고리별 파티 수 제한. 전투는 기본 4파티·최대 99파티, FF/갱킹은 소규모
// 스쿼드 단위라 기본 1파티·최대 2파티로 제한한다. 편집 페이지가 이 값을 사용해
// 초기 렌더 개수와 "파티 추가" 버튼 상한을 결정.
export interface CategoryPartyLimits {
  default: number
  max: number
}

export const MAX_COMBAT_EVENT_PARTIES = 99

export const CATEGORY_PARTY_LIMITS: Record<EventCategory, CategoryPartyLimits> = {
  '전투': { default: 4, max: MAX_COMBAT_EVENT_PARTIES },
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

export const NO_OFFHAND_OPTION_ID = '__NO_OFFHAND__'
export const NO_OFFHAND_OPTION_NAME = '없음'

export function isNoOffhandOption(option: { id?: string | null } | null | undefined): boolean {
  return option?.id === NO_OFFHAND_OPTION_ID
}

export const MAX_GEAR_OPTIONS = 12

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
  // Migration 134: 솔로밤 슬롯. is_bomb_squad 파티 안에서만 true 가능. 멤버가
  // 신청 시 자기 빌드를 free-form 으로 직접 입력하고 (어드민이 미리 옵션을
  // 안 채워둠), 콜러는 승인에서 제외 — 어드민/이벤트 작성자만 승인.
  is_solo_bomb: boolean
  // Migration 139: 무기 픽이 다른 종류 (armor/shoes/...) 후보를 좁히는 룰.
  // shape: { armor: { "<weapon_id>": [{name,id}], ... }, shoes: { ... }, ... }
  // 매핑이 있으면 베이스 *_options 대신 이걸로 검증. 없으면 베이스 폴백.
  conditional_options: ConditionalSlotOptions | null
}

// 슬롯 conditional options: 한 종류 (현재는 weapon) 의 픽이 결정되면 거기에
// 의존하는 다른 종류의 후보를 좁힌다. weapon 자체는 키에 들어가지 않음
// (의존성 시작점이라).
export type DependentSlotKey = Exclude<SlotKey, 'weapon'>
export type ConditionalSlotOptions = Partial<
  Record<DependentSlotKey, Record<string, GearOption[]>>
>

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
  if (assignedName || assignedId) return { name: assignedName, id: assignedId }
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

// Migration 139: 무기 픽 ID 가 주어지면 conditional_options 매핑이 있는 종류는
// 좁힌 후보를, 없으면 베이스 *_options 를 반환한다. weapon 자체는 의존성 시작점
// 이므로 conditional 미적용 (항상 베이스). RPC assign_slot 의 검증 룩업과 동일.
export function getEffectiveGearOptions(
  slot: SlotGearOptionsFields & { conditional_options: ConditionalSlotOptions | null },
  key: SlotKey,
  weaponId: string | null | undefined,
): GearOption[] | null {
  const base = getGearOptions(slot, key)
  if (key === 'weapon' || !weaponId || !slot.conditional_options) return base
  const perWeapon = slot.conditional_options[key as DependentSlotKey]
  if (!perWeapon) return base
  const narrowed = perWeapon[weaponId]
  if (!Array.isArray(narrowed)) return base
  return narrowed
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
  'EngageDps',
  'BrawlerDps',
  'BM',
  '기타',
] as const

export type SlotRole = (typeof SLOT_ROLES)[number]
export const LEGACY_SLOT_ROLES = ['Dps'] as const
export type LegacySlotRole = (typeof LEGACY_SLOT_ROLES)[number]
export type KnownSlotRole = SlotRole | LegacySlotRole

export interface SlotRoleStyle {
  badge: string
  dot: string
}

export const SLOT_ROLE_STYLES: Record<KnownSlotRole, SlotRoleStyle> = {
  Caller:    { badge: 'bg-lime-500/20 text-lime-300 border border-lime-500/40',   dot: 'bg-lime-400' },
  OffTanker: { badge: 'bg-blue-800/40 text-blue-200 border border-blue-700/50',   dot: 'bg-blue-600' },
  DefTanker: { badge: 'bg-sky-400/20 text-sky-200 border border-sky-400/40',      dot: 'bg-sky-300' },
  Sup:       { badge: 'bg-yellow-500/20 text-yellow-200 border border-yellow-500/40', dot: 'bg-yellow-400' },
  Healer:    { badge: 'bg-green-500/20 text-green-300 border border-green-500/40', dot: 'bg-green-400' },
  Dps:       { badge: 'bg-rose-500/20 text-rose-200 border border-rose-500/40',    dot: 'bg-rose-400' },
  EngageDps: { badge: 'bg-rose-500/20 text-rose-200 border border-rose-500/40',    dot: 'bg-rose-400' },
  BrawlerDps:{ badge: 'bg-orange-500/20 text-orange-200 border border-orange-500/40', dot: 'bg-orange-400' },
  BM:        { badge: 'bg-gray-500/30 text-gray-200 border border-gray-500/40',    dot: 'bg-gray-400' },
  '기타':     { badge: 'bg-pink-300/20 text-pink-200 border border-pink-300/40',   dot: 'bg-pink-300' },
}

export function getRoleStyle(role: string | null | undefined): SlotRoleStyle | null {
  if (!role) return null
  return SLOT_ROLE_STYLES[role as KnownSlotRole] ?? null
}
