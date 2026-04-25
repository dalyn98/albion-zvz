import { getAppSetting } from '@/lib/app-settings'
import { listRoleRewards } from '@/app/actions/regear-admin'
import SettingsTabs from '@/components/SettingsTabs'
import { getGuild, type AlbionServer } from '@/lib/albion-gameinfo'
import { getTranslations } from 'next-intl/server'
import { SLOT_ROLES, type SlotRole } from '@/types'
import { getSession } from '@/lib/session'
import { getSessionGuildId, getTenantDiscordConfig } from '@/lib/tenant'

// 알림 메시지의 기본값은 빈 문자열 — 폼은 초기값이 비어 있으면 locale 별
// `messagePlaceholder` 를 노출하므로, 관리자는 자신이 사용하는 언어의 예시를
// 본 채로 직접 입력하게 된다. 비-한국어 길드 관리자가 한국어 기본값을 그대로
// 보던 문제 해결.
export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  // 관리자 역할은 app_settings 이 아니라 tenants.admin_role_ids 에 저장된다.
  // proxy.ts 의 /admin/dashboard 게이트를 통과한 시점에 세션은 유효하지만,
  // 레거시 세션(guildId 없음) 대비 getSessionGuildId 의 primary-tenant fallback 을 거친다.
  const session = await getSession()
  const sessionGuildId = session ? await getSessionGuildId(session) : null
  const tenantConfig = sessionGuildId ? await getTenantDiscordConfig(sessionGuildId) : null
  const adminRoleIds = tenantConfig?.adminRoleIds ?? []

  // getAppSetting 은 guildId 를 명시해야 현재 tenant 의 값을 읽는다 — 미지정 시
  // primary tenant 로 fallback 되어 다른 길드의 설정이 보일 수 있다.
  const tenantId = sessionGuildId ?? undefined

  const [
    message,
    bannerUrl,
    ctaText,
    regearNoticeMessage,
    regearNoticeImageUrl,
    eventsNoticeMessage,
    eventsNoticeImageUrl,
    eventCreatorRoleIdsRaw,
    eventCreatorCombatIdsRaw,
    eventCreatorFfIdsRaw,
    eventCreatorGankingIdsRaw,
    bombSquadCallerRoleIdsRaw,
    activeMemberRoleIdsRaw,
    lastMemberSyncAtRaw,
    regearWindowMinutesRaw,
    regearMaxDeathsRaw,
    regearPayoutRatePercentRaw,
    eventsAutoStartRaw,
    albionServerRaw,
    albionHomeGuildId,
    autoRegearEnabledRaw,
    autoRegearDelayRaw,
    regearRequireVerificationRaw,
    cdBadgeRolesRaw,
    allowUnverifiedMemberAccessRaw,
    { rewards, error: rewardsError },
    tLanding,
    t,
  ] = await Promise.all([
    getAppSetting('event_notification_message', '', tenantId),
    getAppSetting('landing_banner_url', '', tenantId),
    getAppSetting('landing_cta_text', '', tenantId),
    getAppSetting('regear_notice_message', '', tenantId),
    getAppSetting('regear_notice_image_url', '', tenantId),
    getAppSetting('events_notice_message', '', tenantId),
    getAppSetting('events_notice_image_url', '', tenantId),
    getAppSetting('event_creator_role_ids', '[]', tenantId),
    getAppSetting('event_creator_role_ids_combat', '[]', tenantId),
    getAppSetting('event_creator_role_ids_ff', '[]', tenantId),
    getAppSetting('event_creator_role_ids_ganking', '[]', tenantId),
    getAppSetting('bomb_squad_caller_role_ids', '[]', tenantId),
    getAppSetting('active_member_role_ids', '[]', tenantId),
    getAppSetting('last_member_sync_at', '', tenantId),
    getAppSetting('regear_window_minutes', '60', tenantId),
    getAppSetting('regear_max_deaths_per_event', '1', tenantId),
    getAppSetting('regear_payout_rate_percent', '100', tenantId),
    getAppSetting('events_auto_start_enabled', 'false', tenantId),
    getAppSetting('albion_server', 'east', tenantId),
    getAppSetting('albion_home_guild_id', '', tenantId),
    getAppSetting('auto_regear_enabled', 'false', tenantId),
    getAppSetting('auto_regear_delay_minutes', '15', tenantId),
    getAppSetting('regear_require_verification', 'true', tenantId),
    getAppSetting('cd_badge_roles', '["Dps"]', tenantId),
    // 기본값 'true' — 기존 동작(미인증 멤버도 접근 가능) 유지. 관리자가 끌
    // 때만 layout 게이트가 /onboarding/albion 으로 강제 리다이렉트.
    getAppSetting('allow_unverified_member_access', 'true', tenantId),
    listRoleRewards(),
    getTranslations('landing'),
    getTranslations('adminSettings'),
  ])

  // JSON 파싱 실패/잘못된 shape 은 빈 배열로 degrade — UI 를 깨뜨리기보다
  // 비활성 상태(=admin 만 이벤트 생성) 로 보이게 한다.
  const parseRoleIds = (raw: string): string[] => {
    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter((v): v is string => typeof v === 'string' && v.length > 0)
    } catch {
      return []
    }
  }
  const eventCreatorRoleIds = parseRoleIds(eventCreatorRoleIdsRaw)
  const eventCreatorCombatRoleIds = parseRoleIds(eventCreatorCombatIdsRaw)
  const eventCreatorFfRoleIds = parseRoleIds(eventCreatorFfIdsRaw)
  const eventCreatorGankingRoleIds = parseRoleIds(eventCreatorGankingIdsRaw)
  const bombSquadCallerRoleIds = parseRoleIds(bombSquadCallerRoleIdsRaw)
  const activeMemberRoleIds = parseRoleIds(activeMemberRoleIdsRaw)
  const lastMemberSyncAt = lastMemberSyncAtRaw || null

  // Numeric/boolean settings degrade to sane defaults if the DB value is
  // missing or malformed — admin can correct via the new form.
  const parseInteger = (raw: string, fallback: number): number => {
    const parsed = Number(raw)
    return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback
  }
  const regearWindowMinutes = parseInteger(regearWindowMinutesRaw, 60)
  const regearMaxDeaths = parseInteger(regearMaxDeathsRaw, 1)
  const parsedPayoutRate = Number(regearPayoutRatePercentRaw)
  const regearPayoutRatePercent =
    Number.isFinite(parsedPayoutRate) &&
    Number.isInteger(parsedPayoutRate) &&
    parsedPayoutRate >= 1 &&
    parsedPayoutRate <= 100
      ? parsedPayoutRate
      : 100
  const eventsAutoStartEnabled = eventsAutoStartRaw === 'true'

  // DB에 잘못된 값이 박혀있을 경우(과거 마이그레이션 실수 등) 기본값으로 degrade.
  const albionServer: AlbionServer =
    albionServerRaw === 'west' || albionServerRaw === 'east' || albionServerRaw === 'europe'
      ? albionServerRaw
      : 'east'

  const autoRegearEnabled = autoRegearEnabledRaw === 'true'
  const parsedAutoDelay = Number(autoRegearDelayRaw)
  const autoRegearDelayMinutes =
    Number.isFinite(parsedAutoDelay) &&
    Number.isInteger(parsedAutoDelay) &&
    parsedAutoDelay >= 5 &&
    parsedAutoDelay <= 120
      ? parsedAutoDelay
      : 15
  // 기본값 'true' — 인증 게이트가 켜진 상태로 시작. 'false' 만 OFF 로 해석.
  const regearRequireVerification = regearRequireVerificationRaw !== 'false'
  // 'true' 이외는 모두 false 로 해석 — 유일한 opt-out 경로는 명시적 'false'.
  const allowUnverifiedMemberAccess = allowUnverifiedMemberAccessRaw !== 'false'

  // 저장돼 있는 홈 길드 UUID 를 이름으로 역조회. Gameinfo 장애/삭제된 길드는
  // null 로 폴백해 UI 가 ID 만 노출하도록 둔다 — 실패해도 저장 흐름은 막지 않는다.
  const initialHomeGuildName = albionHomeGuildId
    ? (await getGuild(albionServer, albionHomeGuildId))?.Name ?? null
    : null

  // SLOT_ROLES 에 없는 값은 drop — UI 토글이 조용히 잃어버리는 것보다
  // 관리자에게 재저장을 유도하는 편이 명확.
  const slotRoleSet: ReadonlySet<string> = new Set(SLOT_ROLES)
  let cdBadgeRoles: SlotRole[] = ['Dps']
  try {
    const parsed = JSON.parse(cdBadgeRolesRaw)
    if (Array.isArray(parsed)) {
      cdBadgeRoles = parsed.filter(
        (v): v is SlotRole => typeof v === 'string' && slotRoleSet.has(v),
      )
    }
  } catch {
    // 손상된 값 — 기본값으로 degrade.
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">{t('pageTitle')}</h1>
        <p className="text-gray-500 text-sm mt-1">{t('pageDescription')}</p>
      </div>

      <SettingsTabs
        adminRoleIds={adminRoleIds}
        notificationMessage={message}
        rewards={rewards}
        rewardsError={rewardsError}
        landingBannerUrl={bannerUrl}
        landingCtaText={ctaText}
        defaultLandingCtaText={tLanding('defaultCta')}
        regearNoticeMessage={regearNoticeMessage}
        regearNoticeImageUrl={regearNoticeImageUrl}
        eventsNoticeMessage={eventsNoticeMessage}
        eventsNoticeImageUrl={eventsNoticeImageUrl}
        eventCreatorRoleIds={eventCreatorRoleIds}
        eventCreatorCombatRoleIds={eventCreatorCombatRoleIds}
        eventCreatorFfRoleIds={eventCreatorFfRoleIds}
        eventCreatorGankingRoleIds={eventCreatorGankingRoleIds}
        bombSquadCallerRoleIds={bombSquadCallerRoleIds}
        activeMemberRoleIds={activeMemberRoleIds}
        lastMemberSyncAt={lastMemberSyncAt}
        regearWindowMinutes={regearWindowMinutes}
        regearMaxDeaths={regearMaxDeaths}
        regearPayoutRatePercent={regearPayoutRatePercent}
        eventsAutoStartEnabled={eventsAutoStartEnabled}
        albionServer={albionServer}
        albionHomeGuildId={albionHomeGuildId}
        albionHomeGuildName={initialHomeGuildName}
        autoRegearEnabled={autoRegearEnabled}
        autoRegearDelayMinutes={autoRegearDelayMinutes}
        regearRequireVerification={regearRequireVerification}
        cdBadgeRoles={cdBadgeRoles}
        allowUnverifiedMemberAccess={allowUnverifiedMemberAccess}
      />
    </div>
  )
}
