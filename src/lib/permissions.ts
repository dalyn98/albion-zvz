// Granular permission 시스템 (BigInt 비트필드).
//
// 디자인 요지:
//   - 각 capability = 1 비트. BigInt 로 표현해 BIGINT (8 byte) 컬럼 1개로 직렬화.
//   - PostgreSQL BIGINT 는 signed int8 (max 2^63 - 1) → bit 0..62 안전, 63 금지.
//   - JSON 직렬화 시 BigInt 그대로 못 보내니 base-10 string 으로 ↔ 변환.
//   - 기존 isAdmin = true 인 세션은 ALL_CAPABILITIES 마스크 부여 → 코드 점진
//     마이그 도중 권한 누락 사고 0.
//
// 마이그레이션 정책:
//   1) 라이브러리 + DB 테이블 (153_permission_capabilities.sql) 부터 도입
//   2) SessionPayload.capabilities (string) 필드 추가, callback 에서 resolve
//   3) 라우트별로 `if (!session.isAdmin)` → `if (!sessionHas(session, CAP.X))`
//      점진 전환. legacy admin 은 ALL 비트라 동작 동일.
//   4) 신규 기능 (#17/#18/#19) 은 처음부터 capability 기반 게이트로 작성.

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Capability 정의 ─────────────────────────────────────────
// 비트 인덱스는 영구. 한번 부여한 bit 는 절대 재배치하지 않는다 — DB 의 기존
// 값과 의미가 어긋난다. 새 capability 는 가장 큰 사용 비트 +1 에 추가.

export const CAP = {
  // 멤버 & 디스코드 동기화
  MEMBERS_VIEW: 1n << 0n,
  MEMBERS_MANAGE: 1n << 1n,

  // 리기어
  REGEAR_APPROVE: 1n << 2n,
  REGEAR_EDIT_PRICE: 1n << 3n,
  REGEAR_BULK_ACTION: 1n << 4n,

  // 이벤트
  EVENT_CREATE_COMBAT: 1n << 5n,
  EVENT_CREATE_FF: 1n << 6n,
  EVENT_CREATE_GANKING: 1n << 7n,
  EVENT_MANAGE: 1n << 8n,

  // 상점 & 인벤토리
  INVENTORY_MANAGE: 1n << 9n,
  INVENTORY_DELIVER: 1n << 10n,
  SHOP_PRICING: 1n << 11n,

  // 크래프트
  CRAFT_TASK_CREATE: 1n << 12n,
  CRAFT_TASK_DELIVER: 1n << 13n,
  CRAFT_MASTER: 1n << 14n,

  // 전투 / 킬보드 / 봄
  KILLBOARD_SYNC: 1n << 15n,
  BATTLES_MANAGE: 1n << 16n,
  BOMB_SQUAD_CALL: 1n << 17n,

  // 설정 / 길드 프로필
  SETTINGS_GENERAL: 1n << 18n,
  SETTINGS_TOGGLES: 1n << 19n,
  SETTINGS_GUILD_PROFILE: 1n << 20n,
  SETTINGS_PERMISSIONS: 1n << 21n,

  // 신규 (#17/#18/#19) + 감사
  CHEST_LOG_PASTE: 1n << 22n,
  SIPHON_MANAGE: 1n << 23n,
  WAR_LOADOUT_VALIDATE: 1n << 24n,
  WAR_LOADOUT_CONFIGURE: 1n << 25n,
  AUDIT_VIEW: 1n << 26n,

  // 운영 리포트
  STATS_VIEW: 1n << 27n,
  // Deprecated. The game flow uses on-demand exchange requests instead of
  // month-end settlement periods. Keep the bit reserved so old DB masks do
  // not change meaning, but do not expose it in CAPABILITY_GROUPS.
  SETTLEMENT_MANAGE: 1n << 28n,
} as const

export type CapabilityKey = keyof typeof CAP

export const DEPRECATED_CAPABILITY_KEYS = [
  'SETTLEMENT_MANAGE',
] as const satisfies readonly CapabilityKey[]

export const ACTIVE_CAPABILITY_KEYS = Object.keys(CAP).filter(
  (key): key is CapabilityKey =>
    !(DEPRECATED_CAPABILITY_KEYS as readonly string[]).includes(key),
)

// 모든 capability 의 OR. legacy isAdmin = true 인 세션에 부여하는 마스크.
// 새 capability 추가 시 자동 포함 (Object.values 사용).
export const ALL_CAPABILITIES: bigint = Object.values(CAP).reduce(
  (acc, bit) => acc | bit,
  0n,
)

// UI 에서 capability 를 그룹별로 묶어 노출하기 위한 메타.
// 새 카테고리 추가 시 i18n key (capabilityGroup.<key>) 도 같이 4 locale.
export const CAPABILITY_GROUPS: Record<string, CapabilityKey[]> = {
  members: ['MEMBERS_VIEW', 'MEMBERS_MANAGE'],
  regear: ['REGEAR_APPROVE', 'REGEAR_EDIT_PRICE', 'REGEAR_BULK_ACTION'],
  events: [
    'EVENT_CREATE_COMBAT',
    'EVENT_CREATE_FF',
    'EVENT_CREATE_GANKING',
    'EVENT_MANAGE',
  ],
  shop: ['INVENTORY_MANAGE', 'INVENTORY_DELIVER', 'SHOP_PRICING'],
  craft: ['CRAFT_TASK_CREATE', 'CRAFT_TASK_DELIVER', 'CRAFT_MASTER'],
  combat: ['KILLBOARD_SYNC', 'BATTLES_MANAGE', 'BOMB_SQUAD_CALL'],
  settings: [
    'SETTINGS_GENERAL',
    'SETTINGS_TOGGLES',
    'SETTINGS_GUILD_PROFILE',
    'SETTINGS_PERMISSIONS',
  ],
  finance: ['STATS_VIEW'],
  advanced: [
    'CHEST_LOG_PASTE',
    'SIPHON_MANAGE',
    'WAR_LOADOUT_VALIDATE',
    'WAR_LOADOUT_CONFIGURE',
    'AUDIT_VIEW',
  ],
}

// ─── 직렬화 / 검사 ─────────────────────────────────────────────

// BigInt 는 JSON 친화적이지 않으니 string 으로 보관 (cookie / DB row → string).
// 음수/소수/공백/empty 는 0n 으로 안전 fallback — 손상된 cookie 가 권한 폭발로
// 이어지지 않도록.
export function serializeCapabilities(bits: bigint): string {
  if (bits < 0n) return '0'
  return bits.toString(10)
}

export function parseCapabilities(raw: string | null | undefined): bigint {
  if (!raw) return 0n
  const trimmed = raw.trim()
  if (!/^[0-9]+$/.test(trimmed)) return 0n
  try {
    const value = BigInt(trimmed)
    return value < 0n ? 0n : value
  } catch {
    return 0n
  }
}

// 단일 capability 보유 확인. 호출처: server action / RSC.
export function hasCapability(bits: bigint, cap: bigint): boolean {
  return (bits & cap) !== 0n
}

// 여러 capability 중 하나라도 있으면 true (OR 게이트).
export function hasAnyCapability(bits: bigint, caps: readonly bigint[]): boolean {
  for (const cap of caps) {
    if ((bits & cap) !== 0n) return true
  }
  return false
}

// 모든 capability 가 있어야 true (AND 게이트).
export function hasAllCapabilities(bits: bigint, caps: readonly bigint[]): boolean {
  for (const cap of caps) {
    if ((bits & cap) === 0n) return false
  }
  return true
}

// ─── DB resolution ────────────────────────────────────────────
// 로그인 콜백에서 호출. 다음 순서로 비트를 합산:
//   1) isLegacyAdmin = true → base = ALL_CAPABILITIES (기존 어드민 무변경)
//   2) 그렇지 않으면 0n 에서 시작, user 의 Discord role 들의 grant 를 OR
//   3) per-user override 의 granted 비트를 추가 OR
//   4) per-user override 의 revoked 비트를 AND-NOT 으로 제거
// 결과는 항상 0 이상의 BigInt — 직렬화 후 SessionPayload.capabilities 로 저장.

interface ResolveOptions {
  guildId: string
  discordId: string
  discordRoleIds: readonly string[]
  isLegacyAdmin: boolean
}

interface RoleGrantRow {
  capabilities: number | string
}

interface UserOverrideRow {
  capabilities_granted: number | string
  capabilities_revoked: number | string
}

export async function resolveUserCapabilities(
  db: SupabaseClient,
  opts: ResolveOptions,
): Promise<bigint> {
  let bits = opts.isLegacyAdmin ? ALL_CAPABILITIES : 0n

  if (opts.discordRoleIds.length > 0) {
    const { data: rolesRows } = await db
      .from('permission_role_grants')
      .select('capabilities')
      .eq('guild_id', opts.guildId)
      .in('discord_role_id', opts.discordRoleIds)
    const rows = (rolesRows ?? []) as RoleGrantRow[]
    for (const row of rows) {
      bits |= bigintFromNumeric(row.capabilities)
    }
  }

  const { data: overrideRow } = await db
    .from('permission_user_overrides')
    .select('capabilities_granted, capabilities_revoked')
    .eq('guild_id', opts.guildId)
    .eq('discord_id', opts.discordId)
    .maybeSingle()
  if (overrideRow) {
    const row = overrideRow as UserOverrideRow
    bits |= bigintFromNumeric(row.capabilities_granted)
    bits &= ~bigintFromNumeric(row.capabilities_revoked)
  }

  // PostgreSQL bigint 값이 JS BigInt 와 음수 비교에서 어긋날 수 있어 한번 더 가드.
  return bits < 0n ? 0n : bits
}

// supabase-js 는 bigint 컬럼을 환경에 따라 number / string 으로 돌려준다.
// 둘 다 안전 변환 + invalid 는 0n fallback.
function bigintFromNumeric(value: number | string | null): bigint {
  if (value === null || value === undefined) return 0n
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return 0n
    return BigInt(Math.trunc(value))
  }
  return parseCapabilities(value)
}
