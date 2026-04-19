import { getAppSetting } from '@/lib/app-settings'
import { listRoleRewards } from '@/app/actions/regear-admin'
import SettingsTabs from '@/components/SettingsTabs'
import { DEFAULT_LANDING_CTA_TEXT } from '@/app/page'

const DEFAULT_EVENT_NOTIFICATION_MESSAGE = '새 이벤트가 등록되었습니다.'

// Never prerender — settings values can change from the admin UI and we want
// every visit to read the live row, not a snapshot from build time.
export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const [message, bannerUrl, ctaText, { rewards, error: rewardsError }] = await Promise.all([
    getAppSetting('event_notification_message', DEFAULT_EVENT_NOTIFICATION_MESSAGE),
    getAppSetting('landing_banner_url', ''),
    getAppSetting('landing_cta_text', ''),
    listRoleRewards(),
  ])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">설정</h1>
        <p className="text-gray-500 text-sm mt-1">사이트 전역 설정을 카테고리별로 관리합니다.</p>
      </div>

      <SettingsTabs
        notificationMessage={message}
        rewards={rewards}
        rewardsError={rewardsError}
        landingBannerUrl={bannerUrl}
        landingCtaText={ctaText}
        defaultLandingCtaText={DEFAULT_LANDING_CTA_TEXT}
      />
    </div>
  )
}
