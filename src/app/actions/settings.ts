'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAdmin } from '@/lib/auth'
import type { AppSettingKey } from '@/lib/app-settings'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { AODP_ALLOWED_CITIES } from '@/lib/shop/aodp-constants'
import { isAlbionServer, type AlbionServer } from '@/lib/albion-gameinfo'
import { SLOT_ROLES } from '@/types'
import { backfillTenantBattleRecords } from '@/app/actions/battle-tracking'

const EDITABLE_KEYS: readonly AppSettingKey[] = [
  'event_notification_message',
  'landing_cta_text',
  'regear_notice_message',
  'events_notice_message',
  'event_creator_role_ids',
  'event_creator_role_ids_combat',
  'event_creator_role_ids_ff',
  'event_creator_role_ids_ganking',
  'bomb_squad_caller_role_ids',
  'regear_window_minutes',
  'regear_max_deaths_per_event',
  'events_auto_start_enabled',
  'regear_payout_rate_percent',
  'shop_discount_rate',
  'shop_delivery_notice',
  'albion_server',
  'albion_home_guild_id',
  'aodp_cities',
  'aodp_price_mode',
  'aodp_min_quality',
  'auto_regear_enabled',
  'cd_badge_roles',
  'active_member_role_ids',
  'allow_unverified_member_access',
  'regear_require_verification',
  'auto_regear_delay_minutes',
] as const

const MAX_VALUE_LENGTH = 500

// Keys for which an empty value is meaningful (= "unset, fall back to
// application default"). Other keys reject empty input.
const ALLOW_EMPTY_KEYS: readonly AppSettingKey[] = [
  'landing_cta_text',
  // Empty message = hide the regear notice banner entirely.
  'regear_notice_message',
  'events_notice_message',
  // 빈 값 = /shop 상단 공지 배너 숨김.
  'shop_delivery_notice',
  // Empty JSON array '[]' = admin-only event creation.
  'event_creator_role_ids',
  'event_creator_role_ids_combat',
  'event_creator_role_ids_ff',
  'event_creator_role_ids_ganking',
  // Empty JSON array '[]' = no member is eligible to be a bomb squad caller;
  // per-party caller picker will be empty and parties can still be created
  // but without a caller (admin/event creator can still approve).
  'bomb_squad_caller_role_ids',
  // 빈 배열 = 어떤 역할군에도 CD 뱃지 표시 안 함 (기능 전체 off 에 가까움).
  'cd_badge_roles',
  // 빈 배열 = 역할 검사 생략, 디스코드 서버 재적 여부만으로 탈퇴 판정.
  'active_member_role_ids',
  // 빈 문자열 = 홈 길드 미설정. 모든 온보딩이 [미인증] 으로만 저장된다.
  'albion_home_guild_id',
] as const

// JSON array string keys. Must parse to string[] or the upsert is rejected.
const JSON_ARRAY_KEYS: readonly AppSettingKey[] = [
  'event_creator_role_ids',
  'event_creator_role_ids_combat',
  'event_creator_role_ids_ff',
  'event_creator_role_ids_ganking',
  'bomb_squad_caller_role_ids',
  'aodp_cities',
  'cd_badge_roles',
  'active_member_role_ids',
] as const

// Integer-string keys. Must parse as a positive integer within the declared
// range. UI stores raw numbers; the app layer reads via getAppSetting and
// re-parses with a fallback.
const INTEGER_RANGES: Partial<Record<AppSettingKey, { min: number; max: number }>> = {
  regear_window_minutes: { min: 1, max: 240 },
  regear_max_deaths_per_event: { min: 1, max: 10 },
  regear_payout_rate_percent: { min: 1, max: 100 },
  // 자동 리기어 cron 이 배틀 시작 후 몇 분 뒤에 이벤트를 처리할지. 너무 짧으면
  // killboard sync 가 victim 을 놓치고, 너무 길면 수동 신청과 경합. 5~120분.
  auto_regear_delay_minutes: { min: 5, max: 120 },
  // 1 Normal, 2 Good, 3 Outstanding, 4 Excellent, 5 Masterpiece.
  aodp_min_quality: { min: 1, max: 5 },
}

// 실수(decimal) 를 허용하는 키. range 는 inclusive.
const DECIMAL_RANGES: Partial<Record<AppSettingKey, { min: number; max: number }>> = {
  // 상점 할인율 — 0 초과 1 이하. 1 이면 할인 없음, 0.5 = 50% 할인.
  shop_discount_rate: { min: 0.01, max: 1 },
}

// Boolean-string keys. Must be exactly 'true' or 'false'.
const BOOLEAN_KEYS: readonly AppSettingKey[] = [
  'events_auto_start_enabled',
  'auto_regear_enabled',
  'allow_unverified_member_access',
  'regear_require_verification',
] as const

// Enum-string keys. Value must be exactly one of the listed members.
const ENUM_VALUES: Partial<Record<AppSettingKey, readonly string[]>> = {
  albion_server: ['west', 'east', 'europe'] as const,
  // spot = 현재가, avg_Nd = 최근 N 일 평균(aodp history 엔드포인트).
  aodp_price_mode: ['spot', 'avg_1d', 'avg_3d', 'avg_7d', 'avg_14d'] as const,
}

export async function updateAppSetting(
  key: AppSettingKey,
  value: string,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    if (!EDITABLE_KEYS.includes(key)) {
      return { error: tErr('unknownSettingKey') }
    }
    const trimmed = value.trim()
    if (!trimmed && !ALLOW_EMPTY_KEYS.includes(key)) {
      return { error: tErr('emptyValue') }
    }
    if (trimmed.length > MAX_VALUE_LENGTH) {
      return { error: tErr('valueTooLong', { max: MAX_VALUE_LENGTH }) }
    }
    if (trimmed && JSON_ARRAY_KEYS.includes(key)) {
      try {
        const parsed = JSON.parse(trimmed)
        if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === 'string' && v.length > 0)) {
          return { error: tErr('invalidJsonArray') }
        }
        // aodp_cities 는 화이트리스트에 없는 도시명이 들어오면 AODP 가 조용히
        // 무시하므로, 저장 시점에 거부해 관리자가 실수 즉시 인지하게 한다.
        if (key === 'aodp_cities') {
          const unknown = (parsed as string[]).filter(
            (c) => !(AODP_ALLOWED_CITIES as readonly string[]).includes(c),
          )
          if (unknown.length > 0) {
            return { error: tErr('invalidEnumValue', { values: AODP_ALLOWED_CITIES.join(', ') }) }
          }
        }
        if (key === 'cd_badge_roles') {
          const unknown = (parsed as string[]).filter(
            (r) => !(SLOT_ROLES as readonly string[]).includes(r),
          )
          if (unknown.length > 0) {
            return { error: tErr('invalidEnumValue', { values: SLOT_ROLES.join(', ') }) }
          }
        }
      } catch {
        return { error: tErr('invalidJsonArray') }
      }
    }
    const range = INTEGER_RANGES[key]
    if (trimmed && range) {
      const parsed = Number(trimmed)
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < range.min || parsed > range.max) {
        return { error: tErr('invalidIntegerRange', { min: range.min, max: range.max }) }
      }
    }
    const decimalRange = DECIMAL_RANGES[key]
    if (trimmed && decimalRange) {
      const parsed = Number(trimmed)
      if (
        !Number.isFinite(parsed) ||
        parsed < decimalRange.min ||
        parsed > decimalRange.max
      ) {
        return {
          error: tErr('invalidIntegerRange', {
            min: decimalRange.min,
            max: decimalRange.max,
          }),
        }
      }
    }
    if (trimmed && BOOLEAN_KEYS.includes(key)) {
      if (trimmed !== 'true' && trimmed !== 'false') {
        return { error: tErr('invalidBoolean') }
      }
    }
    const allowedEnum = ENUM_VALUES[key]
    if (trimmed && allowedEnum && !allowedEnum.includes(trimmed)) {
      return { error: tErr('invalidEnumValue', { values: allowedEnum.join(', ') }) }
    }
    const db = await requireAdmin()
    // Multi-tenant: app_settings PK 가 (guild_id, key) 복합이므로 upsert 타겟도
    // 두 컬럼 모두 지정. 세션에 guildId 가 없으면 primary tenant 로 fallback.
    const session = await getSession()
    if (!session) return { error: tErr('serverError') }
    const guildId = await getSessionGuildId(session)
    const { error } = await db.from('app_settings').upsert(
      { guild_id: guildId, key, value: trimmed, updated_at: new Date().toISOString() },
      { onConflict: 'guild_id,key' },
    )
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard/settings')
    if (
      key === 'shop_delivery_notice' ||
      key === 'shop_discount_rate' ||
      key === 'aodp_cities' ||
      key === 'aodp_price_mode' ||
      key === 'aodp_min_quality'
    ) {
      revalidatePath('/admin/dashboard/shop')
      revalidatePath('/shop')
    }
    if (key === 'auto_regear_enabled') {
      // 슬롯 편집기의 opt-out 체크박스 가시성이 이 값에 의존.
      revalidatePath('/admin/dashboard/events', 'layout')
    }
    if (key === 'cd_badge_roles') {
      // 이벤트 상세의 파티 그리드에서 CD 뱃지 표시가 이 값에 의존.
      revalidatePath('/events/[id]', 'page')
    }
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// 관리자 역할은 app_settings 이 아니라 tenants.admin_role_ids 에 저장된다
// (migration 074). updateAppSetting 의 검증 로직을 재사용할 수 없어서 전용
// 액션을 둔다. 역할 변경은 다음 로그인부터 반영된다 — isAdmin 은 세션 서명
// 시점의 snapshot 이기 때문.
export async function updateTenantAdminRoles(
  roleIds: string[],
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    if (!Array.isArray(roleIds)) return { error: tErr('invalidJsonArray') }
    const clean: string[] = []
    for (const v of roleIds) {
      if (typeof v !== 'string' || v.length === 0) {
        return { error: tErr('invalidJsonArray') }
      }
      if (!clean.includes(v)) clean.push(v)
    }
    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('serverError') }
    const guildId = await getSessionGuildId(session)
    const { error } = await db
      .from('tenants')
      .update({ admin_role_ids: clean })
      .eq('id', guildId)
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard/settings')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// 홈 길드 UUID 는 서버별로 다르기 때문에 albion_server 와 함께 원자적으로 저장
// 해야 한다. 둘을 따로 업데이트하면 서버는 바꿨는데 길드 UUID 는 구 서버의 값
// 이 남아서 온보딩 인증이 전부 실패하는 상태가 된다. 이 액션은 한 번의 upsert
// 로 두 값을 같이 쓴다. guildId 는 빈 문자열 허용(= 홈 길드 해제).
export async function updateAlbionHomeGuild(input: {
  server: string
  guildId: string
}): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    if (!isAlbionServer(input.server)) {
      return { error: tErr('invalidEnumValue', { values: 'west, east, europe' }) }
    }
    const server: AlbionServer = input.server
    const guildId = input.guildId.trim()
    if (guildId.length > MAX_VALUE_LENGTH) {
      return { error: tErr('valueTooLong', { max: MAX_VALUE_LENGTH }) }
    }
    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('serverError') }
    const sessionGuildId = await getSessionGuildId(session)
    const now = new Date().toISOString()
    const { error } = await db.from('app_settings').upsert(
      [
        { guild_id: sessionGuildId, key: 'albion_server', value: server, updated_at: now },
        { guild_id: sessionGuildId, key: 'albion_home_guild_id', value: guildId, updated_at: now },
      ],
      { onConflict: 'guild_id,key' },
    )
    if (error) return { error: error.message }
    // 홈 길드 신규/변경 직후, 이미 cron 이 모아둔 battle_records 를 이 tenant
    // 관점으로 일괄 반영. guildId 가 빈 문자열인 "해제" 케이스는 backfill 내부에서
    // 조기 return.
    if (guildId.length > 0) {
      await backfillTenantBattleRecords(sessionGuildId)
    }
    revalidatePath('/admin/dashboard/settings')
    revalidatePath('/battles')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
