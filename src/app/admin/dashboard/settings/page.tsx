import { getAppSetting } from '@/lib/app-settings'
import { listRoleRewards } from '@/app/actions/regear-admin'
import SettingsTabs from '@/components/SettingsTabs'
import type { AlbionServer } from '@/components/AlbionServerForm'
import { getTranslations } from 'next-intl/server'
import { SLOT_ROLES, type SlotRole } from '@/types'

const DEFAULT_EVENT_NOTIFICATION_MESSAGE = '새 이벤트가 등록되었습니다.'

// Never prerender — settings values can change from the admin UI and we want
// every visit to read the live row, not a snapshot from build time.
export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const [
    message,
    bannerUrl,
    ctaText,
    regearNoticeMessage,
    regearNoticeImageUrl,
    eventsNoticeMessage,
    eventsNoticeImageUrl,
    eventCreatorRoleIdsRaw,
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
    cdBadgeRolesRaw,
    { rewards, error: rewardsError },
    tLanding,
    t,
  ] = await Promise.all([
    getAppSetting('event_notification_message', DEFAULT_EVENT_NOTIFICATION_MESSAGE),
    getAppSetting('landing_banner_url', ''),
    getAppSetting('landing_cta_text', ''),
    getAppSetting('regear_notice_message', ''),
    getAppSetting('regear_notice_image_url', ''),
    getAppSetting('events_notice_message', ''),
    getAppSetting('events_notice_image_url', ''),
    getAppSetting('event_creator_role_ids', '[]'),
    getAppSetting('bomb_squad_caller_role_ids', '[]'),
    getAppSetting('active_member_role_ids', '[]'),
    getAppSetting('last_member_sync_at', ''),
    getAppSetting('regear_window_minutes', '60'),
    getAppSetting('regear_max_deaths_per_event', '1'),
    getAppSetting('regear_payout_rate_percent', '100'),
    getAppSetting('events_auto_start_enabled', 'false'),
    getAppSetting('albion_server', 'east'),
    getAppSetting('albion_home_guild_id', ''),
    getAppSetting('auto_regear_enabled', 'false'),
    getAppSetting('cd_badge_roles', '["Dps"]'),
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
        bombSquadCallerRoleIds={bombSquadCallerRoleIds}
        activeMemberRoleIds={activeMemberRoleIds}
        lastMemberSyncAt={lastMemberSyncAt}
        regearWindowMinutes={regearWindowMinutes}
        regearMaxDeaths={regearMaxDeaths}
        regearPayoutRatePercent={regearPayoutRatePercent}
        eventsAutoStartEnabled={eventsAutoStartEnabled}
        albionServer={albionServer}
        albionHomeGuildId={albionHomeGuildId}
        autoRegearEnabled={autoRegearEnabled}
        cdBadgeRoles={cdBadgeRoles}
      />
    </div>
  )
}
