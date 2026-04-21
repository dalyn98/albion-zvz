'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Bell, Coins, Image as ImageIcon, CalendarRange, UserPlus, Megaphone, Shield } from 'lucide-react'
import { useTranslations } from 'next-intl'
import NotificationSettingsForm from './NotificationSettingsForm'
import RoleRewardsEditor from './RoleRewardsEditor'
import LandingBannerForm from './LandingBannerForm'
import LandingCtaTextForm from './LandingCtaTextForm'
import MembersAggregateRangeForm from './MembersAggregateRangeForm'
import GuestInviteSettingsForm from './GuestInviteSettingsForm'
import NoticeSettingForm from './NoticeSettingForm'
import EventCreatorRolesSetting from './EventCreatorRolesSetting'
import BombSquadCallerRolesSetting from './BombSquadCallerRolesSetting'
import type { RoleReward } from '@/app/actions/regear-admin'

type TabKey =
  | 'notifications'
  | 'rewards'
  | 'landing'
  | 'membersRange'
  | 'guests'
  | 'notices'
  | 'permissions'

interface TabDef {
  key: TabKey
  labelKey:
    | 'tabNotifications'
    | 'tabRewards'
    | 'tabLanding'
    | 'tabMembersRange'
    | 'tabGuests'
    | 'tabNotices'
    | 'tabPermissions'
  icon: React.ComponentType<{ size?: number; className?: string }>
}

const TABS: readonly TabDef[] = [
  { key: 'notifications', labelKey: 'tabNotifications', icon: Bell },
  { key: 'rewards', labelKey: 'tabRewards', icon: Coins },
  { key: 'notices', labelKey: 'tabNotices', icon: Megaphone },
  { key: 'permissions', labelKey: 'tabPermissions', icon: Shield },
  { key: 'landing', labelKey: 'tabLanding', icon: ImageIcon },
  { key: 'membersRange', labelKey: 'tabMembersRange', icon: CalendarRange },
  { key: 'guests', labelKey: 'tabGuests', icon: UserPlus },
]

const DEFAULT_TAB: TabKey = 'notifications'

interface Props {
  notificationMessage: string
  rewards: RoleReward[]
  rewardsError?: string
  landingBannerUrl: string
  landingCtaText: string
  defaultLandingCtaText: string
  aggregateStartDate: string
  aggregateEndDate: string
  guestInviteToken: string
  regearNoticeMessage: string
  eventsNoticeMessage: string
  eventCreatorRoleIds: string[]
  bombSquadCallerRoleIds: string[]
  origin: string
}

function isTabKey(value: string | null): value is TabKey {
  return (
    value === 'notifications' ||
    value === 'rewards' ||
    value === 'landing' ||
    value === 'membersRange' ||
    value === 'guests' ||
    value === 'notices' ||
    value === 'permissions'
  )
}

export default function SettingsTabs({
  notificationMessage,
  rewards,
  rewardsError,
  landingBannerUrl,
  landingCtaText,
  defaultLandingCtaText,
  aggregateStartDate,
  aggregateEndDate,
  guestInviteToken,
  regearNoticeMessage,
  eventsNoticeMessage,
  eventCreatorRoleIds,
  bombSquadCallerRoleIds,
  origin,
}: Props) {
  const t = useTranslations('adminSettings')
  const tEventsNotice = useTranslations('adminEventsNotice')
  const tRegearNotice = useTranslations('adminRegearNotice')
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const rawTab = searchParams.get('tab')
  const active: TabKey = isTabKey(rawTab) ? rawTab : DEFAULT_TAB

  const selectTab = (next: TabKey) => {
    if (next === active) return
    const params = new URLSearchParams(searchParams.toString())
    if (next === DEFAULT_TAB) params.delete('tab')
    else params.set('tab', next)
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  return (
    <div className="space-y-4">
      <nav
        role="tablist"
        aria-label={t('categoryLabel')}
        className="flex gap-1 border-b border-gray-800 overflow-x-auto"
      >
        {TABS.map(({ key, labelKey, icon: Icon }) => {
          const isActive = active === key
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => selectTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                isActive
                  ? 'text-amber-300 border-amber-400'
                  : 'text-gray-400 border-transparent hover:text-white'
              }`}
            >
              <Icon size={14} />
              {t(labelKey)}
            </button>
          )
        })}
      </nav>

      <div role="tabpanel">
        {active === 'notifications' && (
          <NotificationSettingsForm initialMessage={notificationMessage} />
        )}
        {active === 'rewards' && (
          <div className="space-y-3">
            <p className="text-gray-500 text-xs">{t('rewardsDescription')}</p>
            {rewardsError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                <p className="text-red-400 text-sm">{rewardsError}</p>
              </div>
            )}
            <RoleRewardsEditor rewards={rewards} />
          </div>
        )}
        {active === 'landing' && (
          <div className="space-y-4">
            <LandingCtaTextForm
              initialText={landingCtaText}
              defaultText={defaultLandingCtaText}
            />
            <LandingBannerForm currentUrl={landingBannerUrl} />
          </div>
        )}
        {active === 'membersRange' && (
          <MembersAggregateRangeForm
            initialStart={aggregateStartDate}
            initialEnd={aggregateEndDate}
          />
        )}
        {active === 'guests' && (
          <GuestInviteSettingsForm initialToken={guestInviteToken} origin={origin} />
        )}
        {active === 'permissions' && (
          <div className="space-y-4">
            <EventCreatorRolesSetting initialRoleIds={eventCreatorRoleIds} />
            <BombSquadCallerRolesSetting initialRoleIds={bombSquadCallerRoleIds} />
          </div>
        )}
        {active === 'notices' && (
          <div className="space-y-4">
            <NoticeSettingForm
              settingKey="events_notice_message"
              initialMessage={eventsNoticeMessage}
              title={tEventsNotice('title')}
              description={tEventsNotice('description')}
              label={tEventsNotice('label')}
              placeholder={tEventsNotice('placeholder')}
              clearLabel={tEventsNotice('clear')}
              clearTooltip={tEventsNotice('clearTooltip')}
              tooLongTemplate={(max) => tEventsNotice('tooLong', { max })}
            />
            <NoticeSettingForm
              settingKey="regear_notice_message"
              initialMessage={regearNoticeMessage}
              title={tRegearNotice('title')}
              description={tRegearNotice('description')}
              label={tRegearNotice('label')}
              placeholder={tRegearNotice('placeholder')}
              clearLabel={tRegearNotice('clear')}
              clearTooltip={tRegearNotice('clearTooltip')}
              tooLongTemplate={(max) => tRegearNotice('tooLong', { max })}
            />
          </div>
        )}
      </div>
    </div>
  )
}
