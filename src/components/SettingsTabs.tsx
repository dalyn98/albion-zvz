'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Bell, Image as ImageIcon, Shield, Timer, Coins, Building2, Blocks } from 'lucide-react'
import { useTranslations } from 'next-intl'
import NotificationSettingsForm from './NotificationSettingsForm'
import EventChannelSetting from './EventChannelSetting'
import EventDmLeadMinutesForm from './EventDmLeadMinutesForm'
import EventParticipationAutoCloseoutSettingsForm from './EventParticipationAutoCloseoutSettingsForm'
import RoleRewardsEditor from './RoleRewardsEditor'
import RegearDiscordRolePoliciesEditor from './RegearDiscordRolePoliciesEditor'
import RegearDiscordRoleRateFloorsEditor from './RegearDiscordRoleRateFloorsEditor'
import LandingBannerForm from './LandingBannerForm'
import LandingCtaTextForm from './LandingCtaTextForm'
import SettingsGroup from './SettingsGroup'
import RegearLimitsForm from './RegearLimitsForm'
import RegearPayoutRateForm from './RegearPayoutRateForm'
import EventAutoStartForm from './EventAutoStartForm'
import AlbionHomeGuildForm from './AlbionHomeGuildForm'
import AllowUnverifiedAccessForm from './AllowUnverifiedAccessForm'
import TenantTimezoneForm from './TenantTimezoneForm'
import LogOperatingStartSettingsForm from './LogOperatingStartSettingsForm'
import type { AlbionServer } from '@/lib/albion-gameinfo'
import RegearModeCard from './RegearModeCard'
import CdBadgeRolesForm from './CdBadgeRolesForm'
import AutoRegearSlotsForm from './AutoRegearSlotsForm'
import PermissionRoleSettingsPanel from './PermissionRoleSettingsPanel'
import LocalGuildAccountSettingsForm from './LocalGuildAccountSettingsForm'
import AdminNotificationSettingsForm from './AdminNotificationSettingsForm'
import QuickStarterPanelSettingsForm from './QuickStarterPanelSettingsForm'
import type { RoleReward } from '@/app/actions/regear-admin'
import type { RegearDiscordRolePolicy } from '@/app/actions/regear-role-policies'
import type { RegearDiscordRoleRateFloor } from '@/app/actions/regear-role-rate-floors'
import type { LocalGuildAccountSummary } from '@/app/actions/local-guild-account'
import type { SlotRole, SlotKey } from '@/types'
import type { AdminNotificationTopic } from '@/lib/admin-notification-topics'
import {
  getAvailableSettingsTabs,
  type SettingsAccessFlags,
  type SettingsTabKey,
} from '@/lib/settings-access'
import type { LogOperatingStartDomain } from '@/lib/log-operating-start'
import type { TenantLifecycleState } from '@/lib/tenant-lifecycle'
import WorkspaceLifecycleCard from './WorkspaceLifecycleCard'
import TacticsExperimentalSettingsForm from './TacticsExperimentalSettingsForm'
import FeatureSettingsPanel from './FeatureSettingsPanel'
import {
  isConfigurableGuildFeatureKey,
  type GuildFeatureSnapshot,
} from '@/lib/guild-features'
import { resolveDiscordQuickStarterDestinations } from '@/lib/discord-quick-starter-availability'

interface TabDef {
  key: SettingsTabKey
  labelKey:
    | 'tabGuild'
    | 'tabFeatures'
    | 'tabPermissions'
    | 'tabNotifications'
    | 'tabEvents'
    | 'tabRegear'
    | 'tabLanding'
  icon: React.ComponentType<{ size?: number; className?: string }>
}

const TABS: readonly TabDef[] = [
  { key: 'guild', labelKey: 'tabGuild', icon: Building2 },
  { key: 'features', labelKey: 'tabFeatures', icon: Blocks },
  { key: 'permissions', labelKey: 'tabPermissions', icon: Shield },
  { key: 'notifications', labelKey: 'tabNotifications', icon: Bell },
  { key: 'events', labelKey: 'tabEvents', icon: Timer },
  { key: 'regear', labelKey: 'tabRegear', icon: Coins },
  { key: 'landing', labelKey: 'tabLanding', icon: ImageIcon },
]

const DEFAULT_TAB: SettingsTabKey = 'guild'

interface Props {
  access: SettingsAccessFlags
  guildFeatureSnapshot: GuildFeatureSnapshot
  notificationMessage: string
  eventChannelId: string
  rewards: RoleReward[]
  rewardsError?: string
  regearDiscordRolePolicyEnabled: boolean
  regearDiscordRolePolicies: RegearDiscordRolePolicy[]
  regearDiscordRoleRateFloors: RegearDiscordRoleRateFloor[]
  landingBannerUrl: string
  landingCtaText: string
  defaultLandingCtaText: string
  activeMemberRoleIds: string[]
  lastMemberSyncAt: string | null
  regearWindowMinutes: number
  regearMaxDeaths: number
  regearEligibilityDays: number
  regearPayoutRatePercent: number
  regearOverchargePayoutRatePercent: number
  regearVideoPayoutRatePercent: number
  regearVideoClaimCeilingBonusSilver: number
  albionServer: AlbionServer | null
  albionHomeGuildId: string
  albionHomeGuildName: string | null
  autoRegearEnabled: boolean
  tacticsExperimentalEnabled: boolean
  autoRegearExcludedSlots: SlotKey[]
  regearSupported: boolean
  craftRegearEnabled: boolean
  regearRequireVerification: boolean
  allianceRegearEnabled: boolean
  regearOverchargeEnabled: boolean
  regearOverchargeVideoRequired: boolean
  autoRegearSkipLowConfidence: boolean
  cdBadgeRoles: SlotRole[]
  allowUnverifiedMemberAccess: boolean
  localGuildAccountsEnabled: boolean
  localGuildInviteConfigured: boolean
  initialLocalGuildAccounts: LocalGuildAccountSummary[]
  adminNotificationsEnabled: boolean
  adminNotificationChannelId: string
  adminNotificationRoleIds: string[]
  adminNotificationTopics: AdminNotificationTopic[]
  adminNotificationDigestMinutes: number
  tenantTimezone: string
  logStartShopChestAt: string
  logStartSiphonAt: string
  eventDmLeadMinutes: number
  eventParticipationAutoCloseoutHours: number
  eventParticipationAutoCloseoutEnabled: boolean
  quickStarterPanelChannelId: string
  quickStarterPanelTitle: string
  quickStarterPanelDescription: string
  quickStarterPanelColor: string
  quickStarterPanelFooter: string
  quickStarterPanelDefaultTitle: string
  quickStarterPanelDefaultDescription: string
  quickStarterPanelDefaultColor: string
  quickStarterPanelDefaultFooter: string
  quickStarterPanelMessageId: string
  quickStarterPanelMessageChannelId: string
  quickStarterPanelPublishedAt: string
  quickStarterPanelMessageUrl: string
  quickStarterPanelTenantName: string
  isSuperAdmin: boolean
  workspaceLifecycle: TenantLifecycleState | null
  workspaceLifecycleRecentlyAuthenticated: boolean
}

function isTabKey(value: string | null): value is SettingsTabKey {
  return (
    value === 'guild' ||
    value === 'features' ||
    value === 'permissions' ||
    value === 'notifications' ||
    value === 'events' ||
    value === 'regear' ||
    value === 'landing'
  )
}

export default function SettingsTabs({
  access,
  guildFeatureSnapshot,
  notificationMessage,
  eventChannelId,
  rewards,
  rewardsError,
  regearDiscordRolePolicyEnabled,
  regearDiscordRolePolicies,
  regearDiscordRoleRateFloors,
  landingBannerUrl,
  landingCtaText,
  defaultLandingCtaText,
  activeMemberRoleIds,
  lastMemberSyncAt,
  regearWindowMinutes,
  regearMaxDeaths,
  regearEligibilityDays,
  regearPayoutRatePercent,
  regearOverchargePayoutRatePercent,
  regearVideoPayoutRatePercent,
  regearVideoClaimCeilingBonusSilver,
  albionServer,
  albionHomeGuildId,
  albionHomeGuildName,
  autoRegearEnabled,
  tacticsExperimentalEnabled,
  autoRegearExcludedSlots,
  regearSupported,
  craftRegearEnabled,
  regearRequireVerification,
  allianceRegearEnabled,
  regearOverchargeEnabled,
  regearOverchargeVideoRequired,
  autoRegearSkipLowConfidence,
  cdBadgeRoles,
  allowUnverifiedMemberAccess,
  localGuildAccountsEnabled,
  localGuildInviteConfigured,
  initialLocalGuildAccounts,
  adminNotificationsEnabled,
  adminNotificationChannelId,
  adminNotificationRoleIds,
  adminNotificationTopics,
  adminNotificationDigestMinutes,
  tenantTimezone,
  logStartShopChestAt,
  logStartSiphonAt,
  eventDmLeadMinutes,
  eventParticipationAutoCloseoutHours,
  eventParticipationAutoCloseoutEnabled,
  quickStarterPanelChannelId,
  quickStarterPanelTitle,
  quickStarterPanelDescription,
  quickStarterPanelColor,
  quickStarterPanelFooter,
  quickStarterPanelDefaultTitle,
  quickStarterPanelDefaultDescription,
  quickStarterPanelDefaultColor,
  quickStarterPanelDefaultFooter,
  quickStarterPanelMessageId,
  quickStarterPanelMessageChannelId,
  quickStarterPanelPublishedAt,
  quickStarterPanelMessageUrl,
  quickStarterPanelTenantName,
  isSuperAdmin,
  workspaceLifecycle,
  workspaceLifecycleRecentlyAuthenticated,
}: Props) {
  const t = useTranslations('adminSettings')
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const tabListRef = useRef<HTMLElement>(null)
  const activeTabRef = useRef<HTMLButtonElement>(null)
  const [hasHiddenTabs, setHasHiddenTabs] = useState(false)

  const rawTab = searchParams.get('tab')
  const rawFeature = searchParams.get('feature')
  const focusFeature = isConfigurableGuildFeatureKey(rawFeature) ? rawFeature : null
  const availableTabKeys = getAvailableSettingsTabs(access)
  const availableKeySet = new Set<SettingsTabKey>(availableTabKeys)
  const availableTabs = TABS.filter((tab) => availableKeySet.has(tab.key))
  const active = isTabKey(rawTab) && availableKeySet.has(rawTab)
    ? rawTab
    : availableTabs[0]?.key
  const logOperatingDomains: LogOperatingStartDomain[] = [
    ...(access.shopChestLogStart ? (['shopChest'] as const) : []),
    ...(access.siphonLogStart ? (['siphon'] as const) : []),
  ]

  useEffect(() => {
    const tabList = tabListRef.current
    if (!tabList) return

    const updateOverflowHint = () => {
      const remaining = tabList.scrollWidth - tabList.clientWidth - tabList.scrollLeft
      setHasHiddenTabs(remaining > 2)
    }

    updateOverflowHint()
    tabList.addEventListener('scroll', updateOverflowHint, { passive: true })
    window.addEventListener('resize', updateOverflowHint)
    return () => {
      tabList.removeEventListener('scroll', updateOverflowHint)
      window.removeEventListener('resize', updateOverflowHint)
    }
  }, [availableTabs.length])

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest',
    })
  }, [active])

  if (!active) return null

  const selectTab = (next: SettingsTabKey) => {
    if (next === active) return
    const params = new URLSearchParams(searchParams.toString())
    if (next === DEFAULT_TAB) params.delete('tab')
    else params.set('tab', next)
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <nav
          ref={tabListRef}
          role="tablist"
          aria-label={t('categoryLabel')}
          className="flex gap-1 overflow-x-auto border-b border-gray-800"
        >
          {availableTabs.map(({ key, labelKey, icon: Icon }) => {
            const isActive = active === key
            return (
              <button
                key={key}
                ref={isActive ? activeTabRef : undefined}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => selectTab(key)}
                className={`-mb-px flex min-h-10 items-center gap-1.5 whitespace-nowrap border-b-2 px-4 text-sm font-medium transition-colors ${
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
        {hasHiddenTabs && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-gray-950 to-transparent sm:hidden"
          />
        )}
      </div>

      <div role="tabpanel">
        {active === 'features' && access.toggles && (
          <FeatureSettingsPanel
            initialSnapshot={guildFeatureSnapshot}
            focusFeature={focusFeature}
          />
        )}
        {active === 'guild' && (
          <SettingsGroup
            title={t('guildGroupTitle')}
            description={t('guildGroupDescription')}
          >
            {access.general && (
              <AlbionHomeGuildForm
                embedded
                initialServer={albionServer}
                initialGuildId={albionHomeGuildId}
                initialGuildName={albionHomeGuildName}
                editable={!albionHomeGuildId.trim() || isSuperAdmin}
                showFirstTimeWarning={!albionHomeGuildId.trim()}
                isSuperAdmin={isSuperAdmin}
              />
            )}
            {access.general && (
              <TenantTimezoneForm embedded initialTimezone={tenantTimezone} />
            )}
            {logOperatingDomains.length > 0 && (
              <LogOperatingStartSettingsForm
                embedded
                timezone={tenantTimezone}
                domains={logOperatingDomains}
                initialShopChestStartAt={logStartShopChestAt}
                initialSiphonStartAt={logStartSiphonAt}
              />
            )}
            {access.toggles && (
              <AllowUnverifiedAccessForm
                embedded
                initialAllowed={allowUnverifiedMemberAccess}
              />
            )}
            {access.general && (
              <LocalGuildAccountSettingsForm
                embedded
                initialEnabled={localGuildAccountsEnabled}
                hasInviteCode={localGuildInviteConfigured}
                initialAccounts={initialLocalGuildAccounts}
                timezone={tenantTimezone}
              />
            )}
            {access.workspaceLifecycle && workspaceLifecycle && (
              <WorkspaceLifecycleCard
                state={workspaceLifecycle}
                recentlyAuthenticated={
                  workspaceLifecycleRecentlyAuthenticated
                }
              />
            )}
          </SettingsGroup>
        )}
        {active === 'permissions' && access.permissions && (
          <PermissionRoleSettingsPanel
            activeMemberRoleIds={activeMemberRoleIds}
            lastMemberSyncAt={lastMemberSyncAt}
            timezone={tenantTimezone}
          />
        )}
        {active === 'notifications' && access.notifications && (
          <SettingsGroup
            title={t('adminNotificationGroupTitle')}
            description={t('adminNotificationGroupDescription')}
          >
            <AdminNotificationSettingsForm
              embedded
              initialEnabled={adminNotificationsEnabled}
              initialChannelId={adminNotificationChannelId}
              initialRoleIds={adminNotificationRoleIds}
              initialTopics={adminNotificationTopics}
              initialDigestMinutes={adminNotificationDigestMinutes}
            />
          </SettingsGroup>
        )}
        {active === 'events' && (
          <div className="space-y-4">
            {(access.toggles || access.general) && (
              <SettingsGroup
                title={t('eventOpsGroupTitle')}
                description={t('eventOpsGroupDescription')}
              >
                {access.toggles && (
                  <EventAutoStartForm embedded />
                )}
                {access.toggles && (
                  <TacticsExperimentalSettingsForm
                    embedded
                    initialEnabled={tacticsExperimentalEnabled}
                  />
                )}
                {access.general && <CdBadgeRolesForm embedded initialRoles={cdBadgeRoles} />}
                {access.general && (
                  <EventParticipationAutoCloseoutSettingsForm
                    embedded
                    initialEnabled={eventParticipationAutoCloseoutEnabled}
                    initialHours={eventParticipationAutoCloseoutHours}
                  />
                )}
              </SettingsGroup>
            )}
            {access.general && (
              <SettingsGroup
                title={t('eventNoticeGroupTitle')}
                description={t('eventNoticeGroupDescription')}
              >
                <EventChannelSetting embedded initialChannelId={eventChannelId} />
                <NotificationSettingsForm embedded initialMessage={notificationMessage} />
                <EventDmLeadMinutesForm embedded initialMinutes={eventDmLeadMinutes} />
              </SettingsGroup>
            )}
            {access.general && (
              <SettingsGroup
                title={t('quickStarterGroupTitle')}
                description={t('quickStarterGroupDescription')}
              >
                <QuickStarterPanelSettingsForm
                  initialChannelId={quickStarterPanelChannelId}
                  initialTitle={quickStarterPanelTitle}
                  initialDescription={quickStarterPanelDescription}
                  initialColor={quickStarterPanelColor}
                  initialFooter={quickStarterPanelFooter}
                  defaultTitle={quickStarterPanelDefaultTitle}
                  defaultDescription={quickStarterPanelDefaultDescription}
                  defaultColor={quickStarterPanelDefaultColor}
                  defaultFooter={quickStarterPanelDefaultFooter}
                  tenantName={quickStarterPanelTenantName}
                  initialMessageId={quickStarterPanelMessageId}
                  initialMessageChannelId={quickStarterPanelMessageChannelId}
                  initialPublishedAt={quickStarterPanelPublishedAt}
                  initialMessageUrl={quickStarterPanelMessageUrl}
                  availableDestinations={resolveDiscordQuickStarterDestinations(
                    guildFeatureSnapshot,
                    craftRegearEnabled,
                  )}
                />
              </SettingsGroup>
            )}
          </div>
        )}
        {active === 'regear' && (
          <div className="space-y-4">
            <SettingsGroup
              title={t('regearGroupTitle')}
              description={t('regearGroupDescription')}
            >
              {access.toggles && (
                <RegearModeCard
                  embedded
                  initialSupportEnabled={regearSupported}
                  initialAutoEnabled={autoRegearEnabled}
                  initialCraftEnabled={craftRegearEnabled}
                  initialRequireVerification={regearRequireVerification}
                  initialAllianceRegearEnabled={allianceRegearEnabled}
                  initialOverchargeEnabled={regearOverchargeEnabled}
                  initialOverchargeVideoRequired={regearOverchargeVideoRequired}
                  initialSkipLowConfidence={autoRegearSkipLowConfidence}
                />
              )}
              {regearSupported && access.general && (
                <>
                  <RegearLimitsForm
                    embedded
                    initialWindowMinutes={regearWindowMinutes}
                    initialMaxDeaths={regearMaxDeaths}
                    initialEligibilityDays={regearEligibilityDays}
                  />
                  <RegearPayoutRateForm
                    embedded
                    initialPercent={regearPayoutRatePercent}
                    initialOverchargePercent={regearOverchargePayoutRatePercent}
                    initialVideoPercent={regearVideoPayoutRatePercent}
                    initialVideoClaimCeilingBonusSilver={regearVideoClaimCeilingBonusSilver}
                  />
                  <AutoRegearSlotsForm embedded initialExcluded={autoRegearExcludedSlots} />
                </>
              )}
              {regearSupported && access.roleRewards && (
                <div className="space-y-3">
                  <p className="text-gray-500 text-xs">{t('rewardsDescription')}</p>
                  {rewardsError && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                      <p className="text-red-400 text-sm">{rewardsError}</p>
                    </div>
                  )}
                  <RoleRewardsEditor rewards={rewards} />
                  <RegearDiscordRolePoliciesEditor
                    initialEnabled={regearDiscordRolePolicyEnabled}
                    initialPolicies={regearDiscordRolePolicies}
                  />
                  <RegearDiscordRoleRateFloorsEditor
                    initialPolicies={regearDiscordRoleRateFloors}
                  />
                </div>
              )}
            </SettingsGroup>
          </div>
        )}
        {active === 'landing' && access.guildProfile && (
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
