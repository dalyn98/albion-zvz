'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAdmin } from '@/lib/auth'
import { getAppSetting, type AppSettingKey } from '@/lib/app-settings'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { AODP_ALLOWED_CITIES } from '@/lib/shop/aodp-constants'
import { isAlbionServer, type AlbionServer } from '@/lib/albion-gameinfo'
import { isValidTenantTimezone } from '@/lib/timezone'
import { isSuperAdminSession } from '@/lib/super-admin'
import { SLOT_ROLES, SLOT_KEYS } from '@/types'
import { logAdminAction } from '@/lib/admin-audit'

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
  'auto_regear_skip_low_confidence',
  'auto_regear_excluded_slots',
  'cd_badge_roles',
  'active_member_role_ids',
  'allow_unverified_member_access',
  'regear_require_verification',
  'regear_overcharge_enabled',
  'guild_profile_enabled',
  'member_dashboard_enabled',
  'guild_profile_description',
  'guild_profile_accent_color',
  'guild_profile_show_members',
  'guild_profile_show_battles',
  'guild_profile_show_regear_stats',
  'guild_profile_show_leaderboard',
  'guild_profile_show_admin_team',
  'guild_profile_show_stats',
  'guild_profile_show_weapons',
  'guild_profile_show_rivals',
  'guild_profile_show_activity',
  'guild_profile_recruitment_status',
  'guild_profile_discord_invite_url',
  'guild_profile_server',
  'guild_profile_active_hours',
  'guild_profile_languages',
  'guild_profile_recruiting_roles',
  'guild_profile_join_steps',
  'guild_profile_event_schedule',
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
  // 빈 배열 = 어떤 슬롯도 자동 리기어에서 제외하지 않음 (= 모든 슬롯 합산).
  'auto_regear_excluded_slots',
  // 빈 배열 = 역할 검사 생략, 디스코드 서버 재적 여부만으로 탈퇴 판정.
  'active_member_role_ids',
  // 빈 문자열 = 홈 길드 미설정. 모든 온보딩이 [미인증] 으로만 저장된다.
  'albion_home_guild_id',
  // 빈 값 = 길드 소개 섹션 숨김.
  'guild_profile_description',
  // 빈 값 = CTA 비활성. 모집 상태 배지는 그대로 노출.
  'guild_profile_discord_invite_url',
  // 빈 값 = 자동 감지(albion_guild_members.albion_server majority).
  'guild_profile_server',
  // 빈 값 = hero 칩에서 활동 시간대 숨김.
  'guild_profile_active_hours',
  // 빈 값 = hero 칩에서 언어 숨김.
  'guild_profile_languages',
  // 빈 값 = 모집 포지션 카드 숨김.
  'guild_profile_recruiting_roles',
  // 빈 값 = 가입 절차 카드 숨김.
  'guild_profile_join_steps',
  // 빈 값 = 정기 이벤트 일정 섹션 숨김.
  'guild_profile_event_schedule',
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
  'auto_regear_excluded_slots',
] as const

// Integer-string keys. Must parse as a positive integer within the declared
// range. UI stores raw numbers; the app layer reads via getAppSetting and
// re-parses with a fallback.
const INTEGER_RANGES: Partial<Record<AppSettingKey, { min: number; max: number }>> = {
  regear_window_minutes: { min: 1, max: 240 },
  regear_max_deaths_per_event: { min: 1, max: 10 },
  regear_payout_rate_percent: { min: 1, max: 100 },
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
  'auto_regear_skip_low_confidence',
  'allow_unverified_member_access',
  'regear_require_verification',
  'regear_overcharge_enabled',
  'guild_profile_enabled',
  'member_dashboard_enabled',
  'guild_profile_show_members',
  'guild_profile_show_battles',
  'guild_profile_show_regear_stats',
  'guild_profile_show_leaderboard',
  'guild_profile_show_admin_team',
  'guild_profile_show_stats',
  'guild_profile_show_weapons',
  'guild_profile_show_rivals',
  'guild_profile_show_activity',
] as const

// Enum-string keys. Value must be exactly one of the listed members.
const ENUM_VALUES: Partial<Record<AppSettingKey, readonly string[]>> = {
  albion_server: ['west', 'east', 'europe'] as const,
  // spot = 현재가, avg_Nd = 최근 N 일 평균(aodp history 엔드포인트).
  aodp_price_mode: ['spot', 'avg_1d', 'avg_3d', 'avg_7d', 'avg_14d'] as const,
  // 큐레이션된 8색 팔레트. 자유 hex 입력 차단으로 시각 품질 보장.
  guild_profile_accent_color: [
    'amber',
    'rose',
    'emerald',
    'sky',
    'violet',
    'orange',
    'pink',
    'slate',
  ] as const,
  // 모집 상태 — open / selective / closed. closed 면 CTA 미표시.
  guild_profile_recruitment_status: ['open', 'selective', 'closed'] as const,
  // hero 칩 서버 override. '' = 자동 감지(majority). albion_server 와 달리
  // 빈 문자열을 별도 값으로 취급해 enum 에 포함시킨다 — 어드민이 빈 값으로
  // 명시 저장하면 자동 감지로 돌아감.
  guild_profile_server: ['', 'east', 'west', 'europe'] as const,
}

// csv 직렬화 키. 콤마로 split 한 각 토큰이 화이트리스트에 들어 있어야 한다.
// 빈 문자열은 ALLOW_EMPTY_KEYS 가 처리.
const CSV_ENUM_VALUES: Partial<Record<AppSettingKey, readonly string[]>> = {
  guild_profile_languages: ['ko', 'ja', 'en', 'zh', 'es', 'fr', 'de', 'pt'] as const,
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
        if (key === 'auto_regear_excluded_slots') {
          const unknown = (parsed as string[]).filter(
            (s) => !(SLOT_KEYS as readonly string[]).includes(s),
          )
          if (unknown.length > 0) {
            return { error: tErr('invalidEnumValue', { values: SLOT_KEYS.join(', ') }) }
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
    const csvEnum = CSV_ENUM_VALUES[key]
    if (trimmed && csvEnum) {
      const tokens = trimmed
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
      if (tokens.length === 0) {
        return { error: tErr('emptyValue') }
      }
      const unknown = tokens.filter((t) => !csvEnum.includes(t))
      if (unknown.length > 0) {
        return { error: tErr('invalidEnumValue', { values: csvEnum.join(', ') }) }
      }
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
    if (key === 'auto_regear_excluded_slots') {
      revalidatePath('/admin/dashboard/settings')
    }
    if (key.startsWith('guild_profile_')) {
      // 공개 프로필 페이지가 이 값들을 직접 읽어 표시 — 어드민 저장 즉시 반영.
      revalidatePath('/admin/dashboard/guild-profile')
      // /g/<slug> 는 동적 라우트라 layout 단위 무효화로 처리.
      revalidatePath('/public/g/[slug]', 'page')
    }
    if (key === 'cd_badge_roles') {
      // 이벤트 상세의 파티 그리드에서 CD 뱃지 표시가 이 값에 의존.
      revalidatePath('/events/[id]', 'page')
    }
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'settings.update',
      targetKind: 'setting',
      details: { kind: 'app_setting', key, value: trimmed },
    })
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
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'settings.update',
      targetKind: 'setting',
      details: { kind: 'admin_role_ids', roleIds: clean },
    })
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// tenant_timezone 은 IANA 문자열이라 ENUM_VALUES 검증으로 처리하기엔 fallback
// 의미가 너무 강해 (잘못된 값은 reject 가 아니라 'Asia/Seoul' 로 degrade 가 맞음).
// 별도 액션으로 두고 isValidTenantTimezone 으로 4개 프리셋 중 하나만 통과시킨다.
export async function updateTenantTimezone(
  iana: string,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    if (!isValidTenantTimezone(iana)) {
      return { error: tErr('invalidEnumValue', { values: 'Asia/Seoul, Europe/Berlin, America/New_York, America/Sao_Paulo' }) }
    }
    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('serverError') }
    const guildId = await getSessionGuildId(session)
    const { error } = await db.from('app_settings').upsert(
      {
        guild_id: guildId,
        key: 'tenant_timezone',
        value: iana,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'guild_id,key' },
    )
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard/settings')
    // 시간대 변경은 거의 모든 표시 화면(events, regear, leaderboard 등) 에 영향
    // 가지만 layout 단위로 한 번에 무효화하면 hot path 도 같이 깨진다 — 관리자
    // 가 다음 페이지 진입 시 자연 갱신되도록 둔다 (주요 화면 next-intl SSR).
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'settings.update',
      targetKind: 'setting',
      details: { kind: 'tenant_timezone', value: iana },
    })
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// 홈 길드 UUID 는 서버별로 다르기 때문에 albion_server 와 함께 원자적으로 저장
// 해야 한다. 둘을 따로 업데이트하면 서버는 바꿨는데 길드 UUID 는 구 서버의 값
// 이 남아서 온보딩 인증이 전부 실패하는 상태가 된다. 이 액션은 한 번의 upsert
// 로 두 값을 같이 쓴다. guildId 는 빈 문자열 허용(= 홈 길드 해제).
//
// 추가로 한 알비온 길드(UUID) 는 한 사이트에만 연결될 수 있다 (mig 101). 다른
// tenant 가 같은 UUID 를 등록한 상태면 차단 + 사용자 친화 에러 메시지 반환.
// 위저드 단계와 달리 이 액션은 slug 를 손대지 않는다 — 이미 active 상태인
// tenant 의 URL 은 보존(SEO/북마크 등). 슬러그 변경은 별도 마이그레이션 흐름.
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

    // 홈 길드는 한 번 설정되면 잠금 — 이후엔 슈퍼어드민만 변경/해제 가능.
    // 일반 admin 이 알비온 길드 UUID 를 임의로 바꾸면 멤버 인증/킬보드/리기어
    // 데이터가 모두 무효화되기 때문. 초기 설정(현재값 빈 문자열) 은 누구나 가능.
    const currentHomeGuildId = (
      await getAppSetting('albion_home_guild_id', '', sessionGuildId)
    ).trim()
    if (currentHomeGuildId.length > 0 && !isSuperAdminSession(session)) {
      return { error: tErr('homeGuildLocked') }
    }

    if (guildId.length > 0) {
      const { data: conflict } = await db
        .from('app_settings')
        .select('guild_id')
        .eq('key', 'albion_home_guild_id')
        .eq('value', guildId)
        .neq('guild_id', sessionGuildId)
        .limit(1)
      if (Array.isArray(conflict) && conflict.length > 0) {
        return { error: tErr('homeGuildAlreadyRegistered') }
      }
    }

    const now = new Date().toISOString()
    const { error } = await db.from('app_settings').upsert(
      [
        { guild_id: sessionGuildId, key: 'albion_server', value: server, updated_at: now },
        { guild_id: sessionGuildId, key: 'albion_home_guild_id', value: guildId, updated_at: now },
      ],
      { onConflict: 'guild_id,key' },
    )
    if (error) {
      if ((error as { code?: string }).code === '23505') {
        return { error: tErr('homeGuildAlreadyRegistered') }
      }
      return { error: error.message }
    }
    revalidatePath('/admin/dashboard/settings')
    await logAdminAction({
      guildId: sessionGuildId,
      adminDiscordId: session.discordId,
      action: 'settings.update',
      targetKind: 'setting',
      details: { kind: 'albion_home_guild', server, albionGuildId: guildId },
    })
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
