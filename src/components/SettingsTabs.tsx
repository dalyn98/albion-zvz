'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Bell, Coins, Image as ImageIcon, UserPlus, Megaphone, Shield, Timer } from 'lucide-react'
import { useTranslations } from 'next-intl'
import NotificationSettingsForm from './NotificationSettingsForm'
import RoleRewardsEditor from './RoleRewardsEditor'
import LandingBannerForm from './LandingBannerForm'
import LandingCtaTextForm from './LandingCtaTextForm'
import GuestInviteSettingsForm from './GuestInviteSettingsForm'
import NoticeSettingForm, { NOTICE_MAX_LENGTH } from './NoticeSettingForm'
import EventCreatorRolesSetting from './EventCreatorRolesSetting'
import BombSquadCallerRolesSetting from './BombSquadCallerRolesSetting'
import ActiveMemberRolesSetting from './ActiveMemberRolesSetting'
import RegearLimitsForm from './RegearLimitsForm'
import RegearPayoutRateForm from './RegearPayoutRateForm'
import EventAutoStartForm from './EventAutoStartForm'
import AlbionServerForm, { type AlbionServer } from './AlbionServerForm'
import AodpSettingsForm from './AodpSettingsForm'
import AutoRegearToggleForm from './AutoRegearToggleForm'
import CdBadgeRolesForm from './CdBadgeRolesForm'
import type { RoleReward } from '@/app/actions/regear-admin'
import type { SlotRole } from '@/types'

type TabKey =
  | 'notifications'
  | 'rewards'
  | 'landing'
  | 'guests'
  | 'notices'
  | 'permissions'
  | 'events'

interface TabDef {
  key: TabKey
  labelKey:
    | 'tabNotifications'
    | 'tabRewards'
    | 'tabLanding'
    | 'tabGuests'
    | 'tabNotices'
    | 'tabPermissions'
    | 'tabEvents'
  icon: React.ComponentType<{ size?: number; className?: string }>
}

const TABS: readonly TabDef[] = [
  { key: 'notifications', labelKey: 'tabNotifications', icon: Bell },
  { key: 'rewards', labelKey: 'tabRewards', icon: Coins },
  { key: 'notices', labelKey: 'tabNotices', icon: Megaphone },
  { key: 'permissions', labelKey: 'tabPermissions', icon: Shield },
  { key: 'events', labelKey: 'tabEvents', icon: Timer },
  { key: 'landing', labelKey: 'tabLanding', icon: ImageIcon },
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
  guestInviteToken: string
  regearNoticeMessage: string
  eventsNoticeMessage: string
  eventCreatorRoleIds: string[]
  bombSquadCallerRoleIds: string[]
  activeMemberRoleIds: string[]
  lastMemberSyncAt: string | null
  regearWindowMinutes: number
  regearMaxDeaths: number
  regearPayoutRatePercent: number
  eventsAutoStartEnabled: boolean
  albionServer: AlbionServer
  aodpCities: string[]
  aodpPriceMode: 'spot' | 'avg_1d' | 'avg_3d' | 'avg_7d' | 'avg_14d'
  aodpMinQuality: 1 | 2 | 3 | 4 | 5
  autoRegearEnabled: boolean
  cdBadgeRoles: SlotRole[]
  origin: string
}

function isTabKey(value: string | null): value is TabKey {
  return (
    value === 'notifications' ||
    value === 'rewards' ||
    value === 'landing' ||
    value === 'guests' ||
    value === 'notices' ||
    value === 'permissions' ||
    value === 'events'
  )
}

export default function SettingsTabs({
  notificationMessage,
  rewards,
  rewardsError,
  landingBannerUrl,
  landingCtaText,
  defaultLandingCtaText,
  guestInviteToken,
  regearNoticeMessage,
  eventsNoticeMessage,
  eventCreatorRoleIds,
  bombSquadCallerRoleIds,
  activeMemberRoleIds,
  lastMemberSyncAt,
  regearWindowMinutes,
  regearMaxDeaths,
  regearPayoutRatePercent,
  eventsAutoStartEnabled,
  albionServer,
  aodpCities,
  aodpPriceMode,
  aodpMinQuality,
  autoRegearEnabled,
  cdBadgeRoles,
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
        {active === 'guests' && (
          <GuestInviteSettingsForm initialToken={guestInviteToken} origin={origin} />
        )}
        {active === 'permissions' && (
          <div className="space-y-4">
            <EventCreatorRolesSetting initialRoleIds={eventCreatorRoleIds} />
            <BombSquadCallerRolesSetting initialRoleIds={bombSquadCallerRoleIds} />
            <ActiveMemberRolesSetting
              initialRoleIds={activeMemberRoleIds}
              initialLastSyncAt={lastMemberSyncAt}
            />
          </div>
        )}
        {active === 'events' && (
          <div className="space-y-4">
            <AlbionServerForm initialServer={albionServer} />
            <AodpSettingsForm
              initialCities={aodpCities}
              initialMode={aodpPriceMode}
              initialMinQuality={aodpMinQuality}
            />
            <RegearLimitsForm
              initialWindowMinutes={regearWindowMinutes}
              initialMaxDeaths={regearMaxDeaths}
            />
            <RegearPayoutRateForm initialPercent={regearPayoutRatePercent} />
            <AutoRegearToggleForm initialEnabled={autoRegearEnabled} />
            <EventAutoStartForm initialEnabled={eventsAutoStartEnabled} />
            <CdBadgeRolesForm initialRoles={cdBadgeRoles} />
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
              tooLongMessage={tEventsNotice('tooLong', { max: NOTICE_MAX_LENGTH })}
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
              tooLongMessage={tRegearNotice('tooLong', { max: NOTICE_MAX_LENGTH })}
            />
          </div>
        )}
      </div>
    </div>
  )
}
