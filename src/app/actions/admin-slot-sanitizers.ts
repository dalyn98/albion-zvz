// 슬롯 저장 (savePartySlots / updateSingleSlot) 공통 sanitizer + slotToRow.
// 'use server' 가 아닌 순수 헬퍼 모듈 — 외부 의존성 없이 입력만 정리하므로
// 'use server' actions 에서 자유롭게 import 해 쓰면 된다.
//
// 함수들은 입력의 모양만 검증하고 raw 값을 깎아 jsonb 컬럼이 채워질 형태로
// 반환한다 (DB CHECK / TRIGGER 가 의미 검증). 비어있는 결과는 null 로 반환해
// 컬럼이 NULL 로 들어가게 한다.

import type { getTranslations } from 'next-intl/server'
import type {
  BombSquadKind,
  ConditionalSlotOptions,
  DependentSlotKey,
  GearOption,
  GearSpec,
  GearSpecs,
  SlotKey,
  SlotSpells,
} from '@/types'
import {
  BOMB_SQUAD_KINDS,
  CATEGORY_PARTY_LIMITS,
  MAX_GEAR_OPTIONS,
  SLOT_KEYS,
  GEAR_TIER_MIN,
  GEAR_TIER_MAX,
  GEAR_ENCHANT_MIN,
  GEAR_ENCHANT_MAX,
  FREE_ITEM_NAME,
  NO_OFFHAND_OPTION_ID,
  NO_OFFHAND_OPTION_NAME,
  isTierlessSlot,
  isSpecLessSlot,
  isNoOffhandOption,
} from '@/types'

export type AdminErrorTranslator = Awaited<ReturnType<typeof getTranslations<'adminActionError'>>>

// 카테고리와 무관하게 존재할 수 있는 가장 큰 파티 번호 — 입력이 터무니없이
// 크면 아래 category-aware 검증 이전에 빠르게 차단.
// CATEGORY_PARTY_LIMITS 의 max 중 최대값. 호출자가 이미 알지 못해도 되도록
// 사전 계산해 상수로 둔다.
export const HARD_MAX_PARTIES = Math.max(
  ...Object.values(CATEGORY_PARTY_LIMITS).map((l) => l.max),
)
export const MAX_SLOTS_PER_PARTY = 20
export const MAX_PARTY_NAME_LENGTH = 40

const MAX_ITEM_ID_LENGTH = 80
const MAX_ITEM_NAME_LENGTH = 120
const MAX_SPELL_ID_LENGTH = 80
const ITEM_ID_RE = /^[A-Z0-9_@]+$/i
const SPELL_ID_RE = /^[A-Z0-9_]+$/i
const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/

export interface SlotPayload {
  id?: string
  slot_number: number
  is_hidden: boolean
  role_name: string
  notes: string
  items: Record<SlotKey, { name: string; id: string }>
  options: Record<SlotKey, GearOption[]>
  spells: SlotSpells
  specs?: Partial<Record<SlotKey, GearSpec>>
  // Migration 050: per-slot auto-regear opt-out. Optional for compatibility
  // with template-shaped callers that don't know about this flag yet.
  auto_regear_excluded?: boolean
  // Migration 069: per-slot manual regear opt-out.
  manual_regear_excluded?: boolean
  // Migration 134: 솔로밤 슬롯. 파티가 밤스쿼드일 때만 의미 있음 (DB 트리거가
  // 검증). 솔로밤이면 슬롯 옵션은 비어 있을 수 있고 멤버가 free-form 으로
  // 빌드를 채워 신청한다.
  is_solo_bomb?: boolean
  // Migration 139: 무기 픽이 다른 종류 후보를 좁히는 룰. 비어 있거나 누락이면
  // 기존 *_options 가 그대로 후보로 쓰인다.
  conditional_options?: ConditionalSlotOptions | null
}

type SlotGearRowFields =
  & { [K in SlotKey as `${K}_options`]: GearOption[] | null }
  & { [K in SlotKey as `${K}_name`]: string | null }
  & { [K in SlotKey as `${K}_id`]: string | null }

export type SlotRow = {
  guild_id?: string
  party_id: string
  slot_number: number
  is_hidden: boolean
  role_name: string | null
  notes: string | null
  spells: SlotSpells | null
  gear_specs: GearSpecs | null
  auto_regear_excluded: boolean
  manual_regear_excluded: boolean
  is_solo_bomb: boolean
  conditional_options: ConditionalSlotOptions | null
} & SlotGearRowFields

// Migration 041: party-level bomb-squad metadata. All fields optional on input
// so older callers (templates, tests) can omit. sanitizePartyMeta enforces the
// "kind required when flag is on, name/caller only when flag is on" rules.
export interface PartyMetaPayload {
  is_bomb_squad?: boolean
  bomb_squad_kind?: BombSquadKind | null
  name?: string | null
  caller_discord_id?: string | null
}

export function sanitizePartyMeta(
  meta: PartyMetaPayload | undefined,
  tErr: AdminErrorTranslator,
): { row: {
  name: string | null
  is_bomb_squad: boolean
  bomb_squad_kind: BombSquadKind | null
  caller_discord_id: string | null
} } | { error: string } {
  const isBomb = meta?.is_bomb_squad === true
  if (!isBomb) {
    return {
      row: {
        name: null,
        is_bomb_squad: false,
        bomb_squad_kind: null,
        caller_discord_id: null,
      },
    }
  }
  const kind = meta?.bomb_squad_kind
  if (!kind || !BOMB_SQUAD_KINDS.includes(kind)) {
    return { error: tErr('bombSquadKindRequired') }
  }
  const rawName = typeof meta?.name === 'string' ? meta.name.trim() : ''
  if (rawName.length > MAX_PARTY_NAME_LENGTH) {
    return { error: tErr('partyNameTooLong', { max: MAX_PARTY_NAME_LENGTH }) }
  }
  const rawCaller = typeof meta?.caller_discord_id === 'string' ? meta.caller_discord_id.trim() : ''
  return {
    row: {
      name: rawName || null,
      is_bomb_squad: true,
      bomb_squad_kind: kind,
      caller_discord_id: rawCaller || null,
    },
  }
}

function sanitizeOptionSpells(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of raw) {
    if (typeof v !== 'string') continue
    const trimmed = sanitizeSpellId(v)
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out.length > 0 ? out : undefined
}

function sanitizeItemId(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > MAX_ITEM_ID_LENGTH || !ITEM_ID_RE.test(trimmed)) {
    return null
  }
  return trimmed
}

function sanitizeSpellId(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > MAX_SPELL_ID_LENGTH || !SPELL_ID_RE.test(trimmed)) {
    return null
  }
  return trimmed
}

function sanitizeDisplayName(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > MAX_ITEM_NAME_LENGTH || CONTROL_CHAR_RE.test(trimmed)) {
    return null
  }
  return trimmed
}

function sanitizeGearOption(option: GearOption): GearOption | null {
  if (isNoOffhandOption(option)) return null
  const id = sanitizeItemId(option.id)
  const name = sanitizeDisplayName(option.name)
  if (!id || !name) return null
  const spells = sanitizeOptionSpells(option.spells)
  return spells ? { name, id, spells } : { name, id }
}

function sanitizeConditionalGearOption(
  key: DependentSlotKey,
  option: GearOption,
): GearOption | null {
  if (key === 'offhand' && isNoOffhandOption(option)) {
    return { name: NO_OFFHAND_OPTION_NAME, id: NO_OFFHAND_OPTION_ID }
  }
  return sanitizeGearOption(option)
}

export function sanitizeFixedGearItem(
  item: { name?: unknown; id?: unknown } | null | undefined,
): { name: string | null; id: string | null } {
  const rawName = typeof item?.name === 'string' ? item.name : ''
  const rawId = typeof item?.id === 'string' ? item.id : ''
  if (rawName === FREE_ITEM_NAME && rawId.trim() === '') {
    return { name: FREE_ITEM_NAME, id: null }
  }
  const id = sanitizeItemId(rawId)
  const name = sanitizeDisplayName(rawName)
  if (!id || !name) return { name: null, id: null }
  return { name, id }
}

export function sanitizeGearOptions(opts: unknown): GearOption[] | null {
  if (!Array.isArray(opts)) return null
  const clean = opts
    .filter((o) => o && typeof o.id === 'string' && typeof o.name === 'string')
    .map((o) => sanitizeGearOption(o))
    .filter((o): o is GearOption => o !== null)
  // Dedupe by id, preserving order.
  const seen = new Set<string>()
  const deduped = clean.filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)))
  const capped = deduped.slice(0, MAX_GEAR_OPTIONS)
  return capped.length > 0 ? capped : null
}

// Drops non-string entries, dedupes within each kind, and strips empty
// buckets so the stored JSONB stays minimal. Returns null when no bucket
// has any spells — NULL in the column conveys "not configured".
export function sanitizeSpells(spells: SlotSpells | null | undefined): SlotSpells | null {
  if (!spells || typeof spells !== 'object') return null
  const out: SlotSpells = {}
  for (const key of SLOT_KEYS) {
    const raw = spells[key]
    if (!Array.isArray(raw)) continue
    const seen = new Set<string>()
    const cleaned: string[] = []
    for (const v of raw) {
      if (typeof v !== 'string') continue
      const trimmed = sanitizeSpellId(v)
      if (!trimmed || seen.has(trimmed)) continue
      seen.add(trimmed)
      cleaned.push(trimmed)
    }
    if (cleaned.length > 0) out[key] = cleaned
  }
  return Object.keys(out).length > 0 ? out : null
}

// Drops undefined/out-of-range entries so the stored jsonb stays minimal and
// well-formed. Returns null when no slot has any spec configured.
export function sanitizeGearSpecs(specs: Partial<Record<SlotKey, GearSpec>> | null | undefined): GearSpecs | null {
  if (!specs || typeof specs !== 'object') return null
  const out: GearSpecs = {}
  for (const key of SLOT_KEYS) {
    if (isSpecLessSlot(key)) continue
    const raw = specs[key]
    if (!raw || typeof raw !== 'object') continue
    const clean: GearSpec = {}
    if (
      !isTierlessSlot(key) &&
      typeof raw.tier === 'number' &&
      raw.tier >= GEAR_TIER_MIN &&
      raw.tier <= GEAR_TIER_MAX
    ) {
      clean.tier = raw.tier
    }
    if (
      typeof raw.enchant === 'number' &&
      raw.enchant >= GEAR_ENCHANT_MIN &&
      raw.enchant <= GEAR_ENCHANT_MAX
    ) {
      clean.enchant = raw.enchant
    }
    if (clean.tier != null || clean.enchant != null) out[key] = clean
  }
  return Object.keys(out).length > 0 ? out : null
}

// Migration 139: conditional_options 의 매핑이 베이스 후보 집합과 어긋나지
// 않도록 정리한다. (1) 기준 무기 ID 가 현재 weapon_options 에 없으면 매핑 자체
// drop, (2) 좁힌 후보 중 base 의 *_options 에 없는 항목 drop, (3) 빈 매핑/빈
// 종류는 모두 제거. 베이스 옵션이 비어 있는 종류 (single/free 모드) 도 매핑
// 의미가 없으니 drop. 결과가 완전히 비면 null 을 반환해 jsonb 컬럼을 비운다.
export function sanitizeConditionalOptions(
  raw: ConditionalSlotOptions | null | undefined,
  baseOptions: Record<SlotKey, GearOption[] | null>,
): ConditionalSlotOptions | null {
  if (!raw || typeof raw !== 'object') return null
  const weaponBase = baseOptions.weapon ?? []
  if (weaponBase.length === 0) return null
  const weaponIds = new Set(weaponBase.map((o) => o.id))
  const out: ConditionalSlotOptions = {}
  for (const key of SLOT_KEYS) {
    if (key === 'weapon') continue
    const dependentBase = baseOptions[key]
    if (!Array.isArray(dependentBase) || dependentBase.length === 0) continue
    const baseIds = new Set(dependentBase.map((o) => o.id))
    const perWeapon = raw[key as DependentSlotKey]
    if (!perWeapon || typeof perWeapon !== 'object') continue
    const cleanPerWeapon: Record<string, GearOption[]> = {}
    for (const [weaponId, narrowed] of Object.entries(perWeapon)) {
      if (!weaponIds.has(weaponId)) continue
      if (!Array.isArray(narrowed)) continue
      const seen = new Set<string>()
      const cleaned: GearOption[] = []
      for (const opt of narrowed) {
        if (!opt || typeof opt.id !== 'string' || typeof opt.name !== 'string') continue
        const clean = sanitizeConditionalGearOption(key as DependentSlotKey, opt)
        if (!clean || seen.has(clean.id)) continue
        if (!isNoOffhandOption(clean) && !baseIds.has(clean.id)) continue
        seen.add(clean.id)
        cleaned.push(clean)
      }
      if (cleaned.length > 0) cleanPerWeapon[weaponId] = cleaned
    }
    if (Object.keys(cleanPerWeapon).length > 0) {
      out[key as DependentSlotKey] = cleanPerWeapon
    }
  }
  return Object.keys(out).length > 0 ? out : null
}

export function slotToRow(partyId: string, slot: SlotPayload, guildId?: string): SlotRow {
  const cleanedOptions = SLOT_KEYS.reduce(
    (acc, k) => ({ ...acc, [k]: sanitizeGearOptions(slot.options[k] ?? []) }),
    {} as Record<SlotKey, GearOption[] | null>,
  )
  const cleanedConditional = sanitizeConditionalOptions(slot.conditional_options ?? null, cleanedOptions)
  // When a slot kind has multi-options, the fixed {kind}_name/id columns must
  // be cleared — the member's pick lands in assigned_{kind}_* at assign time.
  // Holding both a fixed item and an option list would let stale fixed data
  // survive a mode switch.
  // guildId 는 INSERT 경로에서만 넘긴다. UPDATE 는 기존 행의 guild_id 를
  // 건드리지 않는다.
  const gearColumns = SLOT_KEYS.reduce((acc, k) => {
    const hasOptions = cleanedOptions[k] !== null
    const fixedItem = sanitizeFixedGearItem(slot.items[k])
    return {
      ...acc,
      [`${k}_options`]: cleanedOptions[k],
      [`${k}_name`]: hasOptions ? null : fixedItem.name,
      [`${k}_id`]: hasOptions ? null : fixedItem.id,
    }
  }, {} as SlotGearRowFields)
  return {
    ...(guildId !== undefined ? { guild_id: guildId } : {}),
    party_id: partyId,
    slot_number: slot.slot_number,
    is_hidden: slot.is_hidden,
    role_name: slot.role_name.trim() || null,
    notes: slot.notes.trim() || null,
    spells: sanitizeSpells(slot.spells),
    gear_specs: sanitizeGearSpecs(slot.specs),
    auto_regear_excluded: slot.auto_regear_excluded === true,
    manual_regear_excluded: slot.manual_regear_excluded === true,
    is_solo_bomb: slot.is_solo_bomb === true,
    conditional_options: cleanedConditional,
    ...gearColumns,
  }
}
