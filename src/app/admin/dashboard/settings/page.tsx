import { getAppSetting } from '@/lib/app-settings'
import { listRoleRewards } from '@/app/actions/regear-admin'
import SettingsTabs from '@/components/SettingsTabs'
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
    aggregateStartDate,
    aggregateEndDate,
    guestInviteToken,
    regearNoticeMessage,
    eventsNoticeMessage,
    eventCreatorRoleIdsRaw,
    { rewards, error: rewardsError },
    tLanding,
    t,
  ] = await Promise.all([
    getAppSetting('event_notification_message', DEFAULT_EVENT_NOTIFICATION_MESSAGE),
    getAppSetting('landing_banner_url', ''),
    getAppSetting('landing_cta_text', ''),
    getAppSetting('members_aggregate_start_date', ''),
    getAppSetting('members_aggregate_end_date', ''),
    getAppSetting('guest_invite_token', ''),
    getAppSetting('regear_notice_message', ''),
    getAppSetting('events_notice_message', ''),
    getAppSetting('event_creator_role_ids', '[]'),
    listRoleRewards(),
    getTranslations('landing'),
    getTranslations('adminSettings'),
  ])

  // JSON 파싱 실패/잘못된 shape 은 빈 배열로 degrade — UI 를 깨뜨리기보다
  // 비활성 상태(=admin 만 이벤트 생성) 로 보이게 한다.
  let eventCreatorRoleIds: string[] = []
  try {
    const parsed = JSON.parse(eventCreatorRoleIdsRaw)
    if (Array.isArray(parsed)) {
      eventCreatorRoleIds = parsed.filter(
        (v): v is string => typeof v === 'string' && v.length > 0,
      )
    }
  } catch {
    eventCreatorRoleIds = []
  }

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
        aggregateStartDate={aggregateStartDate}
        aggregateEndDate={aggregateEndDate}
        guestInviteToken={guestInviteToken}
        regearNoticeMessage={regearNoticeMessage}
        eventsNoticeMessage={eventsNoticeMessage}
        eventCreatorRoleIds={eventCreatorRoleIds}
        origin={origin}
      />
    </div>
  )
}
