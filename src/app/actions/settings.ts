'use server'


import { publicActionError } from '@/lib/public-action-error'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAnyCapability } from '@/lib/auth'
import { getAppSetting, type AppSettingKey } from '@/lib/app-settings'
import { getSession } from '@/lib/session'
import { getSessionGuildId, getTenantDiscordConfig } from '@/lib/tenant'
import { AODP_ALLOWED_CITIES } from '@/lib/shop/aodp-constants'
import { isAlbionServer, type AlbionServer } from '@/lib/albion-gameinfo'
import { isValidTenantTimezone } from '@/lib/timezone'
import { getTenantTimezone } from '@/lib/timezone-server'
import { isSuperAdminSession } from '@/lib/super-admin'
import { SLOT_ROLES, SLOT_KEYS } from '@/types'
import { logAdminAction } from '@/lib/admin-audit'
import { toYoutubeEmbedUrl } from '@/lib/youtube-embed'
import { toDiscordInviteUrl } from '@/lib/discord-invite-url'
import { verifyDiscordInviteForGuild } from '@/lib/discord-invite-verification'
import { CAP } from '@/lib/permissions'
import { isAdminNotificationTopic } from '@/lib/admin-notification-topics'
import { isDiscordId, normalizeDiscordIdList } from '@/lib/discord-id'
import {
  LOG_OPERATING_START_KEYS,
  isValidLogOperatingStart,
  parseLogOperatingStart,
} from '@/lib/log-operating-start'
import {
  TIER_ENCHANT_SUM_MAX,
  TIER_ENCHANT_SUM_MIN,
  parseTierEnchantSumSetting,
} from '@/lib/shop/import-tier-enchant-filter'
import { NOTICE_IMAGE_SIZE_VALUES } from '@/lib/notice-image-size'
import {
  REGEAR_CLAIM_CEILING_BONUS_MAX,
  REGEAR_CLAIM_CEILING_BONUS_MIN,
} from '@/lib/regear-claim-ceiling'
import { revalidatePublicShopCache } from '@/lib/shop/cache'
import { markPublicGuildProfileCacheStale } from '@/lib/guild-profile-cache'
import { invalidateAppSettingsCache } from '@/lib/app-settings-invalidation'
import { invalidateTenantDirectoryCache } from '@/lib/tenant-cache'
import {
  isRegearFulfillmentMode,
  type RegearFulfillmentMode,
} from '@/lib/regear-support'
import { isRegearSupported } from '@/lib/regear-support-server'
import { resolveGuildFeatureForSettingKey } from '@/lib/guild-features'
import { requireGuildFeatureUse } from '@/lib/guild-features-server'

const EDITABLE_KEYS: readonly AppSettingKey[] = [
  'event_notification_message',
  'landing_cta_text',
  'regear_notice_message',
  'events_notice_message',
  'regear_window_minutes',
  'regear_max_deaths_per_event',
  'regear_eligibility_days',
  'regear_payout_rate_percent',
  'regear_overcharge_payout_rate_percent',
  'regear_video_payout_rate_percent',
  'regear_video_claim_ceiling_bonus_silver',
  'shop_discount_rate',
  'shop_delivery_notice',
  'shop_delivery_notice_image_size',
  'shop_import_exclude_tier_enchant_sum_lte',
  'shop_import_exclude_tier_enchant_sum_gte',
  'log_start_shop_chest_at',
  'log_start_siphon_at',
  'siphon_accounting_mode',
  'albion_server',
  'albion_home_guild_id',
  'aodp_cities',
  'aodp_price_mode',
  'aodp_min_quality',
  'auto_regear_enabled',
  'exchange_recent_gameplay_video_required',
  'auto_regear_skip_low_confidence',
  'craft_regear_enabled',
  'auto_regear_excluded_slots',
  'cd_badge_roles',
  'active_member_role_ids',
  'allow_unverified_member_access',
  'regear_require_verification',
  'alliance_regear_enabled',
  'regear_overcharge_enabled',
  'regear_discord_role_policy_enabled',
  'event_dm_lead_minutes',
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
  'guild_profile_youtube_url',
  'admin_notifications_enabled',
  'admin_notification_channel_id',
  'admin_notification_role_ids',
  'admin_notification_topics',
  'admin_notification_digest_minutes',
  'tactics_experimental_enabled',
] as const

const MAX_VALUE_LENGTH = 500

const REGEAR_OPERATIONAL_KEYS: readonly AppSettingKey[] = [
  'regear_window_minutes',
  'regear_max_deaths_per_event',
  'regear_eligibility_days',
  'regear_payout_rate_percent',
  'regear_overcharge_payout_rate_percent',
  'regear_video_payout_rate_percent',
  'regear_video_claim_ceiling_bonus_silver',
  'auto_regear_enabled',
  'auto_regear_skip_low_confidence',
  'auto_regear_excluded_slots',
  'regear_require_verification',
  'alliance_regear_enabled',
  'regear_overcharge_enabled',
  'regear_discord_role_policy_enabled',
] as const

function settingCaps(key: AppSettingKey): readonly bigint[] {
  if (key === 'exchange_recent_gameplay_video_required') {
    return [CAP.CONTENT_COMPLIANCE_MANAGE]
  }
  if (
    key === 'active_member_role_ids' ||
    key === 'admin_notifications_enabled' ||
    key === 'admin_notification_channel_id' ||
    key === 'admin_notification_role_ids' ||
    key === 'admin_notification_topics' ||
    key === 'admin_notification_digest_minutes'
  ) {
    return [CAP.SETTINGS_PERMISSIONS]
  }
  if (key.startsWith('guild_profile_') || key === 'landing_cta_text') {
    return [CAP.SETTINGS_GUILD_PROFILE]
  }
  if (
    key === 'shop_discount_rate' ||
    key === 'shop_delivery_notice' ||
    key === 'shop_delivery_notice_image_size' ||
    key === 'aodp_cities' ||
    key === 'aodp_price_mode' ||
    key === 'aodp_min_quality'
  ) {
    return [CAP.SHOP_PRICING]
  }
  if (
    key === 'log_start_shop_chest_at' ||
    key === 'shop_import_exclude_tier_enchant_sum_lte' ||
    key === 'shop_import_exclude_tier_enchant_sum_gte'
  ) {
    return [CAP.INVENTORY_MANAGE, CAP.CHEST_LOG_PASTE]
  }
  if (key === 'log_start_siphon_at' || key === 'siphon_accounting_mode') {
    return [CAP.SIPHON_MANAGE]
  }
  if (
    key === 'auto_regear_enabled' ||
    key === 'auto_regear_skip_low_confidence' ||
    key === 'craft_regear_enabled' ||
    key === 'events_auto_start_enabled' ||
    key === 'allow_unverified_member_access' ||
    key === 'member_dashboard_enabled' ||
    key === 'regear_require_verification' ||
    key === 'alliance_regear_enabled' ||
    key === 'regear_overcharge_enabled' ||
    key === 'regear_discord_role_policy_enabled'
    || key === 'tactics_experimental_enabled'
  ) {
    return [CAP.SETTINGS_TOGGLES]
  }
  return [CAP.SETTINGS_GENERAL]
}

// Keys for which an empty value is meaningful (= "unset, fall back to
// application default"). Other keys reject empty input.
const ALLOW_EMPTY_KEYS: readonly AppSettingKey[] = [
  'landing_cta_text',
  // Empty message = hide the regear notice banner entirely.
  'regear_notice_message',
  'events_notice_message',
  // 빈 값 = /shop 상단 공지 배너 숨김.
  'shop_delivery_notice',
  // 빈 값 = 해당 티어+인챈트 합계 조건은 비활성.
  'shop_import_exclude_tier_enchant_sum_lte',
  'shop_import_exclude_tier_enchant_sum_gte',
  // 빈 값 = 해당 로그 기능은 과거 전체를 운영 대상에 포함.
  'log_start_shop_chest_at',
  'log_start_siphon_at',
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
  // 빈 값 = YouTube 위젯 숨김.
  'guild_profile_youtube_url',
  // 빈 값 = 관리자 알림 채널 미설정. enabled=true 여도 전송하지 않는다.
  'admin_notification_channel_id',
] as const

// JSON array string keys. Must parse to string[] or the upsert is rejected.
const JSON_ARRAY_KEYS: readonly AppSettingKey[] = [
  'aodp_cities',
  'cd_badge_roles',
  'active_member_role_ids',
  'auto_regear_excluded_slots',
  'admin_notification_role_ids',
  'admin_notification_topics',
] as const

// Integer-string keys. Must parse as an integer within the declared
// range. UI stores raw numbers; the app layer reads via getAppSetting and
// re-parses with a fallback.
const INTEGER_RANGES: Partial<Record<AppSettingKey, { min: number; max: number }>> = {
  regear_window_minutes: { min: 1, max: 240 },
  regear_max_deaths_per_event: { min: 1, max: 10 },
  regear_eligibility_days: { min: 1, max: 90 },
  regear_payout_rate_percent: { min: 1, max: 100 },
  regear_overcharge_payout_rate_percent: { min: 1, max: 100 },
  regear_video_payout_rate_percent: { min: 1, max: 100 },
  regear_video_claim_ceiling_bonus_silver: {
    min: REGEAR_CLAIM_CEILING_BONUS_MIN,
    max: REGEAR_CLAIM_CEILING_BONUS_MAX,
  },
  event_dm_lead_minutes: { min: 5, max: 1440 },
  admin_notification_digest_minutes: { min: 0, max: 1440 },
  shop_import_exclude_tier_enchant_sum_lte: {
    min: TIER_ENCHANT_SUM_MIN,
    max: TIER_ENCHANT_SUM_MAX,
  },
  shop_import_exclude_tier_enchant_sum_gte: {
    min: TIER_ENCHANT_SUM_MIN,
    max: TIER_ENCHANT_SUM_MAX,
  },
  // 1 Normal, 2 Good, 3 Outstanding, 4 Excellent, 5 Masterpiece.
  aodp_min_quality: { min: 1, max: 5 },
}

// 실수(decimal) 를 허용하는 키. range 는 inclusive.
const DECIMAL_RANGES: Partial<Record<AppSettingKey, { min: number; max: number }>> = {
  // 상점 환율/할인율 multiplier. 1 = 100% (1:1), 0.5 = 50% (절반 가격).
  shop_discount_rate: { min: 0.01, max: 1 },
}

// Boolean-string keys. Must be exactly 'true' or 'false'.
const BOOLEAN_KEYS: readonly AppSettingKey[] = [
  'events_auto_start_enabled',
  'auto_regear_enabled',
  'exchange_recent_gameplay_video_required',
  'auto_regear_skip_low_confidence',
  'craft_regear_enabled',
  'allow_unverified_member_access',
  'regear_require_verification',
  'alliance_regear_enabled',
  'regear_overcharge_enabled',
  'regear_discord_role_policy_enabled',
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
  'admin_notifications_enabled',
  'tactics_experimental_enabled',
] as const

const DATE_TIME_KEYS: readonly AppSettingKey[] = [
  LOG_OPERATING_START_KEYS.shopChest,
  LOG_OPERATING_START_KEYS.siphon,
] as const

async function normalizeSettingValue(
  key: AppSettingKey,
  value: string,
  guildId: string,
): Promise<string | null> {
  if (!value || !DATE_TIME_KEYS.includes(key)) return value

  const timezone = await getTenantTimezone(guildId)
  const parsed = parseLogOperatingStart(value, timezone)
  return parsed ? parsed.toISOString() : null
}

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
  shop_delivery_notice_image_size: NOTICE_IMAGE_SIZE_VALUES,
  siphon_accounting_mode: ['record', 'personal_custody'] as const,
}

// csv 직렬화 키. 콤마로 split 한 각 토큰이 화이트리스트에 들어 있어야 한다.
// 빈 문자열은 ALLOW_EMPTY_KEYS 가 처리.
const CSV_ENUM_VALUES: Partial<Record<AppSettingKey, readonly string[]>> = {
  guild_profile_languages: ['ko', 'ja', 'en', 'zh', 'es', 'fr', 'de', 'pt'] as const,
}

type DiscordInviteSettingVerification =
  | {
      ok: true
      url: string
      discordGuildId: string
    }
  | {
      ok: false
      errorKey:
        | 'invalidDiscordInviteUrl'
        | 'discordInviteWrongGuild'
        | 'discordInviteVerificationUnavailable'
    }

async function verifyDiscordInviteSetting(
  guildId: string,
  rawUrl: string,
): Promise<DiscordInviteSettingVerification> {
  if (!rawUrl) return { ok: true, url: '', discordGuildId: '' }

  const tenant = await getTenantDiscordConfig(guildId)
  if (!tenant?.botInstalled) {
    return { ok: false, errorKey: 'discordInviteVerificationUnavailable' }
  }

  const result = await verifyDiscordInviteForGuild(rawUrl, tenant.discordGuildId)
  if (result.status === 'verified') {
    return {
      ok: true,
      url: result.canonicalUrl,
      discordGuildId: result.discordGuildId,
    }
  }
  if (result.status === 'wrong_guild') {
    return { ok: false, errorKey: 'discordInviteWrongGuild' }
  }
  if (result.status === 'unavailable') {
    return { ok: false, errorKey: 'discordInviteVerificationUnavailable' }
  }
  return { ok: false, errorKey: 'invalidDiscordInviteUrl' }
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
        if (key === 'admin_notification_role_ids') {
          if (!normalizeDiscordIdList(parsed)) {
            return { error: tErr('invalidInput') }
          }
        }
        if (key === 'admin_notification_topics') {
          const invalid = (parsed as string[]).filter((topic) => !isAdminNotificationTopic(topic))
          if (invalid.length > 0) {
            return { error: tErr('invalidInput') }
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
    if (trimmed && DATE_TIME_KEYS.includes(key) && !isValidLogOperatingStart(trimmed)) {
      return { error: tErr('invalidDateTime') }
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
    // YouTube URL 은 임의 iframe src 허용 시 XSS 벡터 — sanitizer 통과 못한 값은
    // 저장 자체 차단. 어드민이 잘못된 URL 을 즉시 인지.
    if (trimmed && key === 'guild_profile_youtube_url') {
      if (!toYoutubeEmbedUrl(trimmed)) {
        return { error: tErr('invalidYoutubeUrl') }
      }
    }
    if (trimmed && key === 'guild_profile_discord_invite_url') {
      if (!toDiscordInviteUrl(trimmed)) {
        return { error: tErr('invalidDiscordInviteUrl') }
      }
    }
    if (trimmed && key === 'admin_notification_channel_id' && !isDiscordId(trimmed)) {
      return { error: tErr('invalidInput') }
    }
    const db = await requireAnyCapability(settingCaps(key))
    // Multi-tenant: app_settings PK 가 (guild_id, key) 복합이므로 upsert 타겟도
    // 두 컬럼 모두 지정. 세션에 guildId 가 없으면 primary tenant 로 fallback.
    const session = await getSession()
    if (!session) return { error: tErr('serverError') }
    const guildId = await getSessionGuildId(session)
    const settingFeature = resolveGuildFeatureForSettingKey(key)
    if (settingFeature) {
      await requireGuildFeatureUse(guildId, settingFeature, 'setup')
    }
    if (key === 'craft_regear_enabled') {
      return { error: tErr('regearSupportConfigurationRequired') }
    }
    if (
      REGEAR_OPERATIONAL_KEYS.includes(key) &&
      !(await isRegearSupported(guildId))
    ) {
      return { error: tErr('regearSupportDisabled') }
    }
    let normalizedValue = await normalizeSettingValue(key, trimmed, guildId)
    if (normalizedValue === null) return { error: tErr('invalidDateTime') }
    let settingRows: Array<{
      guild_id: string
      key: AppSettingKey
      value: string
      updated_at: string
    }> | null = null
    if (key === 'guild_profile_discord_invite_url') {
      const verification = await verifyDiscordInviteSetting(guildId, trimmed)
      if (!verification.ok) return { error: tErr(verification.errorKey) }
      normalizedValue = verification.url
      const updatedAt = new Date().toISOString()
      settingRows = [
        {
          guild_id: guildId,
          key,
          value: verification.url,
          updated_at: updatedAt,
        },
        {
          guild_id: guildId,
          key: 'guild_profile_discord_invite_guild_id',
          value: verification.discordGuildId,
          updated_at: updatedAt,
        },
      ]
    }
    if (
      key === 'shop_import_exclude_tier_enchant_sum_lte' ||
      key === 'shop_import_exclude_tier_enchant_sum_gte'
    ) {
      const otherKey =
        key === 'shop_import_exclude_tier_enchant_sum_lte'
          ? 'shop_import_exclude_tier_enchant_sum_gte'
          : 'shop_import_exclude_tier_enchant_sum_lte'
      const otherValue = await getAppSetting(otherKey, '', guildId)
      const lteValue =
        key === 'shop_import_exclude_tier_enchant_sum_lte' ? trimmed : otherValue
      const gteValue =
        key === 'shop_import_exclude_tier_enchant_sum_gte' ? trimmed : otherValue
      const lte = parseTierEnchantSumSetting(lteValue)
      const gte = parseTierEnchantSumSetting(gteValue)
      if (lte !== null && gte !== null && lte >= gte) {
        return { error: tErr('invalidInput') }
      }
    }
    const { error } = await db.from('app_settings').upsert(
      settingRows ?? {
        guild_id: guildId,
        key,
        value: normalizedValue,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'guild_id,key' },
    )
    if (error) return { error: await publicActionError(error, 'actions/settings') }
    invalidateAppSettingsCache(guildId)
    revalidatePath('/admin/dashboard/settings')
    if (key === 'tactics_experimental_enabled') {
      revalidatePath('/tactics')
      revalidatePath('/admin/dashboard/tactics')
    }
    if (
      key === 'regear_payout_rate_percent' ||
      key === 'regear_overcharge_payout_rate_percent' ||
      key === 'regear_video_payout_rate_percent' ||
      key === 'regear_video_claim_ceiling_bonus_silver'
    ) {
      revalidatePath('/admin/dashboard/regear')
      revalidatePath('/admin/dashboard/approvals')
      revalidatePath('/regear')
      revalidatePath('/me')
    }
    if (
      key === 'shop_delivery_notice' ||
      key === 'shop_delivery_notice_image_url' ||
      key === 'shop_delivery_notice_image_size' ||
      key === 'log_start_shop_chest_at' ||
      key === 'shop_import_exclude_tier_enchant_sum_lte' ||
      key === 'shop_import_exclude_tier_enchant_sum_gte' ||
      key === 'shop_discount_rate' ||
      key === 'aodp_cities' ||
      key === 'aodp_price_mode' ||
      key === 'aodp_min_quality'
    ) {
      revalidatePath('/admin/dashboard/shop')
      revalidatePublicShopCache(guildId)
      revalidatePath('/shop')
    }
    if (key === 'log_start_siphon_at' || key === 'siphon_accounting_mode') {
      revalidatePath('/admin/dashboard/siphon')
      revalidatePath('/me')
      revalidatePath('/me/siphon')
      revalidatePath('/', 'layout')
    }
    if (key === 'auto_regear_enabled') {
      // 슬롯 편집기의 opt-out 체크박스 가시성이 이 값에 의존.
      revalidatePath('/admin/dashboard/events', 'layout')
    }
    if (key === 'exchange_recent_gameplay_video_required') {
      revalidatePath('/admin/dashboard/content-compliance')
      revalidatePath('/me')
      revalidatePath('/me/wallet')
    }
    if (key === 'auto_regear_excluded_slots') {
      revalidatePath('/admin/dashboard/settings')
    }
    if (
      key === 'active_member_role_ids' ||
      key === 'admin_notifications_enabled' ||
      key === 'admin_notification_channel_id' ||
      key === 'admin_notification_role_ids' ||
      key === 'admin_notification_topics' ||
      key === 'admin_notification_digest_minutes'
    ) {
      revalidatePath('/admin/dashboard/permissions')
      revalidatePath('/admin/dashboard/settings')
    }
    if (key.startsWith('guild_profile_')) {
      // 공개 프로필 페이지가 이 값들을 직접 읽어 표시 — 어드민 저장 즉시 반영.
      markPublicGuildProfileCacheStale(guildId)
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
      details: { kind: 'app_setting', key, value: normalizedValue },
    })
    return {}
  } catch (e) {
    return { error: await publicActionError(e, 'actions/settings') }
  }
}

export interface UpdateRegearSupportConfigurationInput {
  supported: boolean
  fulfillmentMode: RegearFulfillmentMode | null
}

function revalidateRegearSupportPaths(): void {
  revalidatePath('/admin/dashboard/settings')
  revalidatePath('/admin/dashboard/regear')
  revalidatePath('/admin/dashboard/approvals')
  revalidatePath('/admin/dashboard/craft')
  revalidatePath('/admin/dashboard/events', 'layout')
  revalidatePath('/regear')
  revalidatePath('/me')
  revalidatePath('/me/requests')
  revalidatePath('/craft/queue')
  revalidatePath('/craft/my-tasks')
  revalidatePath('/craft/inventory')
  revalidatePath('/', 'layout')
}

export async function updateRegearSupportConfiguration(
  input: UpdateRegearSupportConfigurationInput,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    if (
      !input ||
      typeof input !== 'object' ||
      typeof input.supported !== 'boolean'
    ) {
      return { error: tErr('invalidInput') }
    }
    if (input.supported && !isRegearFulfillmentMode(input.fulfillmentMode)) {
      return { error: tErr('regearFulfillmentRequired') }
    }
    if (!input.supported && input.fulfillmentMode !== null) {
      return { error: tErr('invalidInput') }
    }

    const db = await requireAnyCapability([CAP.SETTINGS_TOGGLES])
    const session = await getSession()
    if (!session) return { error: tErr('serverError') }
    const guildId = await getSessionGuildId(session)
    const { error } = await db.rpc('change_guild_feature_state', {
      p_guild_id: guildId,
      p_feature_key: 'supply',
      p_target_state: input.supported ? 'enabled' : 'disabled',
      p_config: input.supported
        ? { mode: input.fulfillmentMode === 'crafted' ? 'craft' : 'silver' }
        : {},
      p_actor_discord_id: session.discordId,
    })
    if (error) {
      return {
        error: await publicActionError(
          error,
          'actions/settings.regear-support',
        ),
      }
    }

    invalidateAppSettingsCache(guildId)
    revalidateRegearSupportPaths()
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'settings.update',
      targetKind: 'setting',
      details: {
        kind: 'regear_support_configuration',
        supported: input.supported,
        fulfillmentMode: input.supported ? input.fulfillmentMode : null,
      },
    })
    return {}
  } catch (error) {
    return {
      error: await publicActionError(
        error,
        'actions/settings.regear-support',
      ),
    }
  }
}

export interface GuildProfileSettingsInput {
  description: string
  accentColor: string
  recruitmentStatus: string
  discordInviteUrl: string
  youtubeUrl: string
}

export async function updateGuildProfileSettings(
  input: GuildProfileSettingsInput,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    if (
      !input ||
      typeof input.description !== 'string' ||
      typeof input.accentColor !== 'string' ||
      typeof input.recruitmentStatus !== 'string' ||
      typeof input.discordInviteUrl !== 'string' ||
      typeof input.youtubeUrl !== 'string'
    ) {
      return { error: tErr('invalidInput') }
    }
    const description = input.description.trim()
    const discordInviteUrl = input.discordInviteUrl.trim()
    const youtubeUrl = input.youtubeUrl.trim()
    if (
      description.length > MAX_VALUE_LENGTH ||
      discordInviteUrl.length > MAX_VALUE_LENGTH ||
      youtubeUrl.length > MAX_VALUE_LENGTH
    ) {
      return { error: tErr('valueTooLong', { max: MAX_VALUE_LENGTH }) }
    }
    if (!ENUM_VALUES.guild_profile_accent_color?.includes(input.accentColor)) {
      return { error: tErr('invalidInput') }
    }
    if (!ENUM_VALUES.guild_profile_recruitment_status?.includes(input.recruitmentStatus)) {
      return { error: tErr('invalidInput') }
    }
    const normalizedDiscordInviteUrl = discordInviteUrl
      ? toDiscordInviteUrl(discordInviteUrl)
      : ''
    if (discordInviteUrl && !normalizedDiscordInviteUrl) {
      return { error: tErr('invalidDiscordInviteUrl') }
    }
    if (youtubeUrl && !toYoutubeEmbedUrl(youtubeUrl)) {
      return { error: tErr('invalidYoutubeUrl') }
    }

    const db = await requireAnyCapability([CAP.SETTINGS_GUILD_PROFILE])
    const session = await getSession()
    if (!session) return { error: tErr('serverError') }
    const guildId = await getSessionGuildId(session)
    const inviteVerification = await verifyDiscordInviteSetting(
      guildId,
      normalizedDiscordInviteUrl ?? '',
    )
    if (!inviteVerification.ok) {
      return { error: tErr(inviteVerification.errorKey) }
    }
    const updatedAt = new Date().toISOString()
    const values: Array<{ key: AppSettingKey; value: string }> = [
      { key: 'guild_profile_description', value: description },
      { key: 'guild_profile_accent_color', value: input.accentColor },
      { key: 'guild_profile_recruitment_status', value: input.recruitmentStatus },
      { key: 'guild_profile_discord_invite_url', value: inviteVerification.url },
      {
        key: 'guild_profile_discord_invite_guild_id',
        value: inviteVerification.discordGuildId,
      },
      { key: 'guild_profile_youtube_url', value: youtubeUrl },
    ]
    const { error } = await db.from('app_settings').upsert(
      values.map(({ key, value }) => ({ guild_id: guildId, key, value, updated_at: updatedAt })),
      { onConflict: 'guild_id,key' },
    )
    if (error) return { error: await publicActionError(error, 'actions/settings') }

    invalidateAppSettingsCache(guildId)
    markPublicGuildProfileCacheStale(guildId)
    revalidatePath('/admin/dashboard/guild-profile')
    revalidatePath('/public/g/[slug]', 'page')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'settings.update',
      targetKind: 'setting',
      details: { keys: values.map(({ key }) => key) },
    })
    return {}
  } catch (e) {
    return { error: await publicActionError(e, 'actions/settings') }
  }
}

// Legacy compatibility export. Admin/event/caller 역할은 이제
// /admin/dashboard/permissions 의 role → capability 명령만 수정할 수 있다.
// 오래 열린 클라이언트 번들이 이 액션을 호출해도 별도 권한 원천을 만들지 않게
// fail closed 한다.
export async function updateTenantAdminRoles(
  _roleIds: string[],
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    void _roleIds
    await requireAnyCapability([CAP.SETTINGS_PERMISSIONS])
    return { error: tErr('invalidInput') }
  } catch (e) {
    return { error: await publicActionError(e, 'actions/settings') }
  }
}

// tenants.event_channel_id 는 이벤트 공지의 기본 Discord 채널이다. 온보딩에서
// "나중에 설정" 으로 넘긴 길드도 Settings > Events 에서 회복할 수 있어야 한다.
export async function updateTenantEventChannel(
  channelId: string,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const trimmed = channelId.trim()
    if (trimmed && !isDiscordId(trimmed)) {
      return { error: tErr('invalidInput') }
    }
    const db = await requireAnyCapability([CAP.SETTINGS_GENERAL])
    const session = await getSession()
    if (!session) return { error: tErr('serverError') }
    const guildId = await getSessionGuildId(session)
    const { error } = await db
      .from('tenants')
      .update({ event_channel_id: trimmed || null })
      .eq('id', guildId)
    if (error) return { error: await publicActionError(error, 'actions/settings') }
    invalidateTenantDirectoryCache()
    revalidatePath('/admin/dashboard')
    revalidatePath('/admin/dashboard/settings')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'settings.update',
      targetKind: 'setting',
      details: { kind: 'event_channel_id', channelId: trimmed || null },
    })
    return {}
  } catch (e) {
    return { error: await publicActionError(e, 'actions/settings') }
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
    const db = await requireAnyCapability([CAP.SETTINGS_GENERAL])
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
    if (error) return { error: await publicActionError(error, 'actions/settings') }
    invalidateAppSettingsCache(guildId)
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
    return { error: await publicActionError(e, 'actions/settings') }
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
    const db = await requireAnyCapability([CAP.SETTINGS_GENERAL])
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
      return { error: await publicActionError(error, 'actions/settings') }
    }
    invalidateAppSettingsCache(sessionGuildId)
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
    return { error: await publicActionError(e, 'actions/settings') }
  }
}
