'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Image as ImageIcon, Megaphone, Settings, Shield, Timer } from 'lucide-react'
import { useTranslations } from 'next-intl'
import NotificationSettingsForm from './NotificationSettingsForm'
import RoleRewardsEditor from './RoleRewardsEditor'
import LandingBannerForm from './LandingBannerForm'
import LandingCtaTextForm from './LandingCtaTextForm'
import NoticeSettingForm, { NOTICE_MAX_LENGTH } from './NoticeSettingForm'
import AdminRoleSetting from './AdminRoleSetting'
import EventCreatorRolesGroup from './EventCreatorRolesGroup'
import BombSquadCallerRolesSetting from './BombSquadCallerRolesSetting'
import SettingsGroup from './SettingsGroup'
import ActiveMemberRolesSetting from './ActiveMemberRolesSetting'
import RegearLimitsForm from './RegearLimitsForm'
import RegearPayoutRateForm from './RegearPayoutRateForm'
import EventAutoStartForm from './EventAutoStartForm'
import AlbionHomeGuildForm from './AlbionHomeGuildForm'
import AllowUnverifiedAccessForm from './AllowUnverifiedAccessForm'
import type { AlbionServer } from '@/lib/albion-gameinfo'
import AutoRegearToggleForm from './AutoRegearToggleForm'
import RegearRequireVerificationForm from './RegearRequireVerificationForm'
import CdBadgeRolesForm from './CdBadgeRolesForm'
import type { RoleReward } from '@/app/actions/regear-admin'
import type { SlotRole } from '@/types'

type TabKey =
  | 'basic'
  | 'landing'
  | 'notices'
  | 'permissions'
  | 'events'

interface TabDef {
  key: TabKey
  labelKey:
    | 'tabBasic'
    | 'tabLanding'
    | 'tabNotices'
    | 'tabPermissions'
    | 'tabEvents'
  icon: React.ComponentType<{ size?: number; className?: string }>
}

const TABS: readonly TabDef[] = [
  { key: 'basic', labelKey: 'tabBasic', icon: Settings },
  { key: 'notices', labelKey: 'tabNotices', icon: Megaphone },
  { key: 'permissions', labelKey: 'tabPermissions', icon: Shield },
  { key: 'events', labelKey: 'tabEvents', icon: Timer },
  { key: 'landing', labelKey: 'tabLanding', icon: ImageIcon },
]

const DEFAULT_TAB: TabKey = 'basic'

interface Props {
  adminRoleIds: string[]
  notificationMessage: string
  rewards: RoleReward[]
  rewardsError?: string
  landingBannerUrl: string
  landingCtaText: string
  defaultLandingCtaText: string
  regearNoticeMessage: string
  regearNoticeImageUrl: string
  eventsNoticeMessage: string
  eventsNoticeImageUrl: string
  eventCreatorRoleIds: string[]
  eventCreatorCombatRoleIds: string[]
  eventCreatorFfRoleIds: string[]
  eventCreatorGankingRoleIds: string[]
  bombSquadCallerRoleIds: string[]
  activeMemberRoleIds: string[]
  lastMemberSyncAt: string | null
  regearWindowMinutes: number
  regearMaxDeaths: number
  regearPayoutRatePercent: number
  eventsAutoStartEnabled: boolean
  albionServer: AlbionServer
  albionHomeGuildId: string
  albionHomeGuildName: string | null
  autoRegearEnabled: boolean
  autoRegearDelayMinutes: number
  regearRequireVerification: boolean
  cdBadgeRoles: SlotRole[]
  allowUnverifiedMemberAccess: boolean
}

function isTabKey(value: string | null): value is TabKey {
  return (
    value === 'basic' ||
    value === 'landing' ||
    value === 'notices' ||
    value === 'permissions' ||
    value === 'events'
  )
}

export default function SettingsTabs({
  adminRoleIds,
  notificationMessage,
  rewards,
  rewardsError,
  landingBannerUrl,
  landingCtaText,
  defaultLandingCtaText,
  regearNoticeMessage,
  regearNoticeImageUrl,
  eventsNoticeMessage,
  eventsNoticeImageUrl,
  eventCreatorRoleIds,
  eventCreatorCombatRoleIds,
  eventCreatorFfRoleIds,
  eventCreatorGankingRoleIds,
  bombSquadCallerRoleIds,
  activeMemberRoleIds,
  lastMemberSyncAt,
  regearWindowMinutes,
  regearMaxDeaths,
  regearPayoutRatePercent,
  eventsAutoStartEnabled,
  albionServer,
  albionHomeGuildId,
  albionHomeGuildName,
  autoRegearEnabled,
  autoRegearDelayMinutes,
  regearRequireVerification,
  cdBadgeRoles,
  allowUnverifiedMemberAccess,
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
        {active === 'basic' && (
          <SettingsGroup
            title={t('basicGroupTitle')}
            description={t('basicGroupDescription')}
          >
            <AlbionHomeGuildForm
              embedded
              initialServer={albionServer}
              initialGuildId={albionHomeGuildId}
              initialGuildName={albionHomeGuildName}
            />
            <AllowUnverifiedAccessForm
              embedded
              initialAllowed={allowUnverifiedMemberAccess}
            />
            <ActiveMemberRolesSetting
              embedded
              initialRoleIds={activeMemberRoleIds}
              initialLastSyncAt={lastMemberSyncAt}
            />
          </SettingsGroup>
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
        {active === 'permissions' && (
          <div className="space-y-4">
            <AdminRoleSetting initialRoleIds={adminRoleIds} />
            <EventCreatorRolesGroup
              legacyRoleIds={eventCreatorRoleIds}
              combatRoleIds={eventCreatorCombatRoleIds}
              ffRoleIds={eventCreatorFfRoleIds}
              gankingRoleIds={eventCreatorGankingRoleIds}
            />
            <BombSquadCallerRolesSetting initialRoleIds={bombSquadCallerRoleIds} />
          </div>
        )}
        {active === 'events' && (
          <div className="space-y-4">
            <SettingsGroup
              title={t('regearGroupTitle')}
              description={t('regearGroupDescription')}
            >
              <RegearLimitsForm
                embedded
                initialWindowMinutes={regearWindowMinutes}
                initialMaxDeaths={regearMaxDeaths}
              />
              <RegearPayoutRateForm embedded initialPercent={regearPayoutRatePercent} />
              <RegearRequireVerificationForm
                embedded
                initialEnabled={regearRequireVerification}
              />
              <AutoRegearToggleForm
                embedded
                initialEnabled={autoRegearEnabled}
                initialDelayMinutes={autoRegearDelayMinutes}
              />
            </SettingsGroup>
            <SettingsGroup
              title={t('eventOpsGroupTitle')}
              description={t('eventOpsGroupDescription')}
            >
              <EventAutoStartForm embedded initialEnabled={eventsAutoStartEnabled} />
              <CdBadgeRolesForm embedded initialRoles={cdBadgeRoles} />
              <div className="space-y-3">
                <p className="text-gray-500 text-xs">{t('rewardsDescription')}</p>
                {rewardsError && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                    <p className="text-red-400 text-sm">{rewardsError}</p>
                  </div>
                )}
                <RoleRewardsEditor rewards={rewards} />
              </div>
            </SettingsGroup>
          </div>
        )}
        {active === 'notices' && (
          <div className="space-y-4">
            <SettingsGroup
              title={t('discordNoticeGroupTitle')}
              description={t('discordNoticeGroupDescription')}
            >
              <NotificationSettingsForm embedded initialMessage={notificationMessage} />
            </SettingsGroup>
            <SettingsGroup
              title={t('inPageNoticeGroupTitle')}
              description={t('inPageNoticeGroupDescription')}
            >
              <NoticeSettingForm
                embedded
                settingKey="events_notice_message"
                target="events"
                initialMessage={eventsNoticeMessage}
                initialImageUrl={eventsNoticeImageUrl}
                title={tEventsNotice('title')}
                description={tEventsNotice('description')}
                label={tEventsNotice('label')}
                placeholder={tEventsNotice('placeholder')}
                clearLabel={tEventsNotice('clear')}
                clearTooltip={tEventsNotice('clearTooltip')}
                tooLongMessage={tEventsNotice('tooLong', { max: NOTICE_MAX_LENGTH })}
              />
              <NoticeSettingForm
                embedded
                settingKey="regear_notice_message"
                target="regear"
                initialMessage={regearNoticeMessage}
                initialImageUrl={regearNoticeImageUrl}
                title={tRegearNotice('title')}
                description={tRegearNotice('description')}
                label={tRegearNotice('label')}
                placeholder={tRegearNotice('placeholder')}
                clearLabel={tRegearNotice('clear')}
                clearTooltip={tRegearNotice('clearTooltip')}
                tooLongMessage={tRegearNotice('tooLong', { max: NOTICE_MAX_LENGTH })}
              />
            </SettingsGroup>
          </div>
        )}
      </div>
    </div>
  )
}
