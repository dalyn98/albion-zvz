'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Image as ImageIcon, Shield, Timer, Coins, Building2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import NotificationSettingsForm from './NotificationSettingsForm'
import EventDmLeadMinutesForm from './EventDmLeadMinutesForm'
import RoleRewardsEditor from './RoleRewardsEditor'
import LandingBannerForm from './LandingBannerForm'
import LandingCtaTextForm from './LandingCtaTextForm'
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
import TenantTimezoneForm from './TenantTimezoneForm'
import type { AlbionServer } from '@/lib/albion-gameinfo'
import RegearModeCard from './RegearModeCard'
import CdBadgeRolesForm from './CdBadgeRolesForm'
import type { RoleReward } from '@/app/actions/regear-admin'
import type { SlotRole } from '@/types'

type TabKey =
  | 'guild'
  | 'permissions'
  | 'events'
  | 'regear'
  | 'landing'

interface TabDef {
  key: TabKey
  labelKey:
    | 'tabGuild'
    | 'tabPermissions'
    | 'tabEvents'
    | 'tabRegear'
    | 'tabLanding'
  icon: React.ComponentType<{ size?: number; className?: string }>
}

const TABS: readonly TabDef[] = [
  { key: 'guild', labelKey: 'tabGuild', icon: Building2 },
  { key: 'permissions', labelKey: 'tabPermissions', icon: Shield },
  { key: 'events', labelKey: 'tabEvents', icon: Timer },
  { key: 'regear', labelKey: 'tabRegear', icon: Coins },
  { key: 'landing', labelKey: 'tabLanding', icon: ImageIcon },
]

const DEFAULT_TAB: TabKey = 'guild'

interface Props {
  adminRoleIds: string[]
  notificationMessage: string
  rewards: RoleReward[]
  rewardsError?: string
  landingBannerUrl: string
  landingCtaText: string
  defaultLandingCtaText: string
  eventCreatorRoleIds: string[]
  eventCreatorCombatRoleIds: string[]
  eventCreatorFfRoleIds: string[]
  eventCreatorGankingRoleIds: string[]
  bombSquadCallerRoleIds: string[]
  activeMemberRoleIds: string[]
  lastMemberSyncAt: string | null
  regearWindowMinutes: number
  regearMaxDeaths: number
  regearEligibilityDays: number
  regearPayoutRatePercent: number
  eventsAutoStartEnabled: boolean
  albionServer: AlbionServer
  albionHomeGuildId: string
  albionHomeGuildName: string | null
  autoRegearEnabled: boolean
  craftRegearEnabled: boolean
  regearRequireVerification: boolean
  cdBadgeRoles: SlotRole[]
  allowUnverifiedMemberAccess: boolean
  tenantTimezone: string
  eventDmLeadMinutes: number
}

function isTabKey(value: string | null): value is TabKey {
  return (
    value === 'guild' ||
    value === 'permissions' ||
    value === 'events' ||
    value === 'regear' ||
    value === 'landing'
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
  eventCreatorRoleIds,
  eventCreatorCombatRoleIds,
  eventCreatorFfRoleIds,
  eventCreatorGankingRoleIds,
  bombSquadCallerRoleIds,
  activeMemberRoleIds,
  lastMemberSyncAt,
  regearWindowMinutes,
  regearMaxDeaths,
  regearEligibilityDays,
  regearPayoutRatePercent,
  eventsAutoStartEnabled,
  albionServer,
  albionHomeGuildId,
  albionHomeGuildName,
  autoRegearEnabled,
  craftRegearEnabled,
  regearRequireVerification,
  cdBadgeRoles,
  allowUnverifiedMemberAccess,
  tenantTimezone,
  eventDmLeadMinutes,
}: Props) {
  const t = useTranslations('adminSettings')
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
        {active === 'guild' && (
          <SettingsGroup
            title={t('guildGroupTitle')}
            description={t('guildGroupDescription')}
          >
            <AlbionHomeGuildForm
              embedded
              initialServer={albionServer}
              initialGuildId={albionHomeGuildId}
              initialGuildName={albionHomeGuildName}
            />
            <TenantTimezoneForm embedded initialTimezone={tenantTimezone} />
            <AllowUnverifiedAccessForm
              embedded
              initialAllowed={allowUnverifiedMemberAccess}
            />
          </SettingsGroup>
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
            <ActiveMemberRolesSetting
              initialRoleIds={activeMemberRoleIds}
              initialLastSyncAt={lastMemberSyncAt}
            />
          </div>
        )}
        {active === 'events' && (
          <div className="space-y-4">
            <SettingsGroup
              title={t('eventOpsGroupTitle')}
              description={t('eventOpsGroupDescription')}
            >
              <EventAutoStartForm embedded initialEnabled={eventsAutoStartEnabled} />
              <CdBadgeRolesForm embedded initialRoles={cdBadgeRoles} />
            </SettingsGroup>
            <SettingsGroup
              title={t('eventNoticeGroupTitle')}
              description={t('eventNoticeGroupDescription')}
            >
              <NotificationSettingsForm embedded initialMessage={notificationMessage} />
              <EventDmLeadMinutesForm embedded initialMinutes={eventDmLeadMinutes} />
            </SettingsGroup>
          </div>
        )}
        {active === 'regear' && (
          <div className="space-y-4">
            <SettingsGroup
              title={t('regearGroupTitle')}
              description={t('regearGroupDescription')}
            >
              <RegearModeCard
                embedded
                initialAutoEnabled={autoRegearEnabled}
                initialCraftEnabled={craftRegearEnabled}
                initialRequireVerification={regearRequireVerification}
              />
              <RegearLimitsForm
                embedded
                initialWindowMinutes={regearWindowMinutes}
                initialMaxDeaths={regearMaxDeaths}
                initialEligibilityDays={regearEligibilityDays}
              />
              <RegearPayoutRateForm embedded initialPercent={regearPayoutRatePercent} />
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
        {active === 'landing' && (
          <div className="space-y-4">
            <LandingCtaTextForm
              initialText={landingCtaText}
              defaultText={defaultLandingCtaText}
            />
            <LandingBannerForm currentUrl={landingBannerUrl} />
          </div>
        )}
      </div>
    </div>
  )
}
