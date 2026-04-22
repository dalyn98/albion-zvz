import { getAppSetting } from '@/lib/app-settings'
import { listRoleRewards } from '@/app/actions/regear-admin'
import SettingsTabs from '@/components/SettingsTabs'
import type { AlbionServer } from '@/components/AlbionServerForm'
import { AODP_ALLOWED_CITIES } from '@/lib/shop/aodp-constants'
import { getTranslations } from 'next-intl/server'

const DEFAULT_EVENT_NOTIFICATION_MESSAGE = '새 이벤트가 등록되었습니다.'

// Never prerender — settings values can change from the admin UI and we want
// every visit to read the live row, not a snapshot from build time.
export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const [
    message,
    bannerUrl,
    ctaText,
    guestInviteToken,
    regearNoticeMessage,
    eventsNoticeMessage,
    eventCreatorRoleIdsRaw,
    bombSquadCallerRoleIdsRaw,
    regearWindowMinutesRaw,
    regearMaxDeathsRaw,
    regearPayoutRatePercentRaw,
    eventsAutoStartRaw,
    albionServerRaw,
    aodpCitiesRaw,
    aodpPriceModeRaw,
    aodpMinQualityRaw,
    { rewards, error: rewardsError },
    tLanding,
    t,
  ] = await Promise.all([
    getAppSetting('event_notification_message', DEFAULT_EVENT_NOTIFICATION_MESSAGE),
    getAppSetting('landing_banner_url', ''),
    getAppSetting('landing_cta_text', ''),
    getAppSetting('guest_invite_token', ''),
    getAppSetting('regear_notice_message', ''),
    getAppSetting('events_notice_message', ''),
    getAppSetting('event_creator_role_ids', '[]'),
    getAppSetting('bomb_squad_caller_role_ids', '[]'),
    getAppSetting('regear_window_minutes', '60'),
    getAppSetting('regear_max_deaths_per_event', '1'),
    getAppSetting('regear_payout_rate_percent', '100'),
    getAppSetting('events_auto_start_enabled', 'false'),
    getAppSetting('albion_server', 'east'),
    getAppSetting('aodp_cities', ''),
    getAppSetting('aodp_price_mode', 'spot'),
    getAppSetting('aodp_min_quality', '1'),
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

  const aodpAllowedSet: ReadonlySet<string> = new Set(AODP_ALLOWED_CITIES)
  let aodpCities: string[] = [...AODP_ALLOWED_CITIES]
  if (aodpCitiesRaw) {
    try {
      const parsed = JSON.parse(aodpCitiesRaw)
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter(
          (v): v is string => typeof v === 'string' && aodpAllowedSet.has(v),
        )
        if (filtered.length > 0) aodpCities = filtered
      }
    } catch {
      // 손상된 값 — 전체 도시로 fallback.
    }
  }

  type AodpPriceMode = 'spot' | 'avg_1d' | 'avg_3d' | 'avg_7d' | 'avg_14d'
  const aodpPriceMode: AodpPriceMode =
    aodpPriceModeRaw === 'spot' ||
    aodpPriceModeRaw === 'avg_1d' ||
    aodpPriceModeRaw === 'avg_3d' ||
    aodpPriceModeRaw === 'avg_7d' ||
    aodpPriceModeRaw === 'avg_14d'
      ? aodpPriceModeRaw
      : 'spot'

  const aodpMinQualityParsed = Number(aodpMinQualityRaw)
  const aodpMinQuality: 1 | 2 | 3 | 4 | 5 =
    aodpMinQualityParsed === 1 ||
    aodpMinQualityParsed === 2 ||
    aodpMinQualityParsed === 3 ||
    aodpMinQualityParsed === 4 ||
    aodpMinQualityParsed === 5
      ? aodpMinQualityParsed
      : 1

  // Prefer the deployed public URL so the invite link we show to the admin
  // matches what recipients will actually visit.
  const origin = (process.env.APP_URL ?? '').replace(/\/$/, '')

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
        guestInviteToken={guestInviteToken}
        regearNoticeMessage={regearNoticeMessage}
        eventsNoticeMessage={eventsNoticeMessage}
        eventCreatorRoleIds={eventCreatorRoleIds}
        bombSquadCallerRoleIds={bombSquadCallerRoleIds}
        regearWindowMinutes={regearWindowMinutes}
        regearMaxDeaths={regearMaxDeaths}
        regearPayoutRatePercent={regearPayoutRatePercent}
        eventsAutoStartEnabled={eventsAutoStartEnabled}
        albionServer={albionServer}
        aodpCities={aodpCities}
        aodpPriceMode={aodpPriceMode}
        aodpMinQuality={aodpMinQuality}
        origin={origin}
      />
    </div>
  )
}
