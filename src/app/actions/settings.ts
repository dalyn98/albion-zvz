'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAdmin } from '@/lib/auth'
import type { AppSettingKey } from '@/lib/app-settings'
import { AODP_ALLOWED_CITIES } from '@/lib/shop/aodp-constants'
import { SLOT_ROLES } from '@/types'

const EDITABLE_KEYS: readonly AppSettingKey[] = [
  'event_notification_message',
  'landing_cta_text',
  'regear_notice_message',
  'events_notice_message',
  'event_creator_role_ids',
  'bomb_squad_caller_role_ids',
  'regear_window_minutes',
  'regear_max_deaths_per_event',
  'events_auto_start_enabled',
  'regear_payout_rate_percent',
  'shop_silver_to_point_rate',
  'shop_delivery_notice',
  'albion_server',
  'aodp_cities',
  'aodp_price_mode',
  'aodp_min_quality',
  'auto_regear_enabled',
  'cd_badge_roles',
  'active_member_role_ids',
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
  // Empty JSON array '[]' = no member is eligible to be a bomb squad caller;
  // per-party caller picker will be empty and parties can still be created
  // but without a caller (admin/event creator can still approve).
  'bomb_squad_caller_role_ids',
  // 빈 배열 = 어떤 역할군에도 CD 뱃지 표시 안 함 (기능 전체 off 에 가까움).
  'cd_badge_roles',
  // 빈 배열 = 역할 검사 생략, 디스코드 서버 재적 여부만으로 탈퇴 판정.
  'active_member_role_ids',
] as const

// JSON array string keys. Must parse to string[] or the upsert is rejected.
const JSON_ARRAY_KEYS: readonly AppSettingKey[] = [
  'event_creator_role_ids',
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
  // 1p = N silver. 1 이 기본(AODP 그대로 환산). 값이 커질수록 동일 시세 → 더 작은
  // 포인트 가격이 된다.
  shop_silver_to_point_rate: { min: 1, max: 1_000_000 },
  // 1 Normal, 2 Good, 3 Outstanding, 4 Excellent, 5 Masterpiece.
  aodp_min_quality: { min: 1, max: 5 },
}

// Boolean-string keys. Must be exactly 'true' or 'false'.
const BOOLEAN_KEYS: readonly AppSettingKey[] = [
  'events_auto_start_enabled',
  'auto_regear_enabled',
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
    const { error } = await db
      .from('app_settings')
      .upsert({ key, value: trimmed, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard/settings')
    if (
      key === 'shop_delivery_notice' ||
      key === 'shop_silver_to_point_rate' ||
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
