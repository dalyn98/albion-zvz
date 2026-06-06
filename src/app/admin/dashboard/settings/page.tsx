import { getAppSetting } from '@/lib/app-settings'
import { listRoleRewards } from '@/app/actions/regear-admin'
import type { LocalGuildAccountSummary } from '@/app/actions/local-guild-account'
import SettingsTabs from '@/components/SettingsTabsLazy'
import { getGuild, isAlbionServer, type AlbionServer } from '@/lib/albion-gameinfo'
import { getTranslations } from 'next-intl/server'
import { SLOT_ROLES, SLOT_KEYS, type SlotRole, type SlotKey } from '@/types'
import { getSession } from '@/lib/session'
import { getSessionGuildId, getTenantDiscordConfig } from '@/lib/tenant'
import { DEFAULT_TENANT_TIMEZONE, isValidTenantTimezone } from '@/lib/timezone'
import { isSuperAdminSession } from '@/lib/super-admin'
import {
  loadAdminPermissionRoleSettings,
  type AdminPermissionRoleSettings,
} from '@/lib/admin-permission-settings'
import { getSettingsAccessFlags } from '@/lib/settings-access'
import { getAdminClient } from '@/lib/supabase-admin'
import {
  DEFAULT_ADMIN_NOTIFICATION_TOPICS,
  parseAdminNotificationTopics,
} from '@/lib/admin-notification-topics'

// 알림 메시지의 기본값은 빈 문자열 — 폼은 초기값이 비어 있으면 locale 별
// `messagePlaceholder` 를 노출하므로, 관리자는 자신이 사용하는 언어의 예시를
// 본 채로 직접 입력하게 된다. 비-한국어 길드 관리자가 한국어 기본값을 그대로
// 보던 문제 해결.
export const dynamic = 'force-dynamic'

async function loadLocalGuildAccountSummaries(
  tenantId: string,
  allowed: boolean,
): Promise<LocalGuildAccountSummary[]> {
  if (!allowed) return []
  const { data, error } = await getAdminClient()
    .from('guild_local_accounts')
    .select(
      'id, subject, albion_server, albion_player_name, relation, trust_status, created_at, last_login_at, revoked_at',
    )
    .eq('guild_id', tenantId)
    .order('updated_at', { ascending: false })
    .limit(200)
  if (error) return []
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    subject: row.subject as string,
    server: row.albion_server as string,
    nickname: row.albion_player_name as string,
    relation: row.relation as string,
    trustStatus: row.trust_status as string,
    createdAt: (row.created_at as string | null) ?? null,
    lastLoginAt: (row.last_login_at as string | null) ?? null,
    revokedAt: (row.revoked_at as string | null) ?? null,
  }))
}

export default async function SettingsPage() {
  // 관리자 역할은 app_settings 이 아니라 tenants.admin_role_ids 에 저장된다.
  // proxy.ts 의 /admin/dashboard 게이트가 admin 세션을 강제하므로 여기서
  // session 부재는 비정상 — throw 로 명시적 실패.
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  const tenantId = await getSessionGuildId(session)
  const isSuperAdmin = isSuperAdminSession(session)
  const settingsAccess = getSettingsAccessFlags(session.isAdmin, session.capabilities)
  const canManageAnyLogOperatingStart =
    settingsAccess.shopChestLogStart ||
    settingsAccess.siphonLogStart
  const emptyPermissionRoleSettings: AdminPermissionRoleSettings = {
    adminRoleIds: [],
    eventCreatorRoleIds: [],
    eventCreatorCombatRoleIds: [],
    eventCreatorFfRoleIds: [],
    eventCreatorGankingRoleIds: [],
    bombSquadCallerRoleIds: [],
    activeMemberRoleIds: [],
    lastMemberSyncAt: null,
  }

  const [
    permissionRoleSettings,
    tenantConfig,
    message,
    bannerUrl,
    ctaText,
    regearWindowMinutesRaw,
    regearMaxDeathsRaw,
    regearEligibilityDaysRaw,
    regearPayoutRatePercentRaw,
    eventsAutoStartRaw,
    albionServerRaw,
    albionHomeGuildId,
    autoRegearEnabledRaw,
    autoRegearExcludedSlotsRaw,
    autoRegearSkipLowConfidenceRaw,
    craftRegearEnabledRaw,
    regearRequireVerificationRaw,
    allianceRegearEnabledRaw,
    regearOverchargeEnabledRaw,
    cdBadgeRolesRaw,
    allowUnverifiedMemberAccessRaw,
    localGuildAccountsEnabledRaw,
    localGuildInviteHashRaw,
    initialLocalGuildAccounts,
    adminNotificationsEnabledRaw,
    adminNotificationChannelId,
    adminNotificationRoleIdsRaw,
    adminNotificationTopicsRaw,
    adminNotificationDigestMinutesRaw,
    tenantTimezoneRaw,
    logStartShopChestAt,
    logStartSiphonAt,
    eventDmLeadMinutesRaw,
    { rewards, error: rewardsError },
    tLanding,
    t,
  ] = await Promise.all([
    settingsAccess.permissions
      ? loadAdminPermissionRoleSettings(tenantId)
      : Promise.resolve(emptyPermissionRoleSettings),
    settingsAccess.general ? getTenantDiscordConfig(tenantId) : Promise.resolve(null),
    settingsAccess.general
      ? getAppSetting('event_notification_message', '', tenantId)
      : Promise.resolve(''),
    settingsAccess.guildProfile
      ? getAppSetting('landing_banner_url', '', tenantId)
      : Promise.resolve(''),
    settingsAccess.guildProfile
      ? getAppSetting('landing_cta_text', '', tenantId)
      : Promise.resolve(''),
    settingsAccess.general
      ? getAppSetting('regear_window_minutes', '60', tenantId)
      : Promise.resolve('60'),
    settingsAccess.general
      ? getAppSetting('regear_max_deaths_per_event', '1', tenantId)
      : Promise.resolve('1'),
    settingsAccess.general
      ? getAppSetting('regear_eligibility_days', '14', tenantId)
      : Promise.resolve('14'),
    settingsAccess.general
      ? getAppSetting('regear_payout_rate_percent', '100', tenantId)
      : Promise.resolve('100'),
    settingsAccess.toggles
      ? getAppSetting('events_auto_start_enabled', 'false', tenantId)
      : Promise.resolve('false'),
    // 빈 문자열 폴백 — 'east' 폴백은 west/eu 테넌트의 자가-인증 위반.
    // isAlbionServer 로 검증 후 null 로 전달, UI 에서 명시적 선택을 강제한다.
    settingsAccess.general
      ? getAppSetting('albion_server', '', tenantId)
      : Promise.resolve(''),
    settingsAccess.general
      ? getAppSetting('albion_home_guild_id', '', tenantId)
      : Promise.resolve(''),
    settingsAccess.toggles
      ? getAppSetting('auto_regear_enabled', 'false', tenantId)
      : Promise.resolve('false'),
    settingsAccess.general
      ? getAppSetting('auto_regear_excluded_slots', '["food","cape","mount","potion"]', tenantId)
      : Promise.resolve('["food","cape","mount","potion"]'),
    settingsAccess.toggles
      ? getAppSetting('auto_regear_skip_low_confidence', 'false', tenantId)
      : Promise.resolve('false'),
    settingsAccess.toggles
      ? getAppSetting('craft_regear_enabled', 'false', tenantId)
      : Promise.resolve('false'),
    settingsAccess.toggles
      ? getAppSetting('regear_require_verification', 'true', tenantId)
      : Promise.resolve('true'),
    settingsAccess.toggles
      ? getAppSetting('alliance_regear_enabled', 'false', tenantId)
      : Promise.resolve('false'),
    settingsAccess.toggles
      ? getAppSetting('regear_overcharge_enabled', 'false', tenantId)
      : Promise.resolve('false'),
    settingsAccess.general
      ? getAppSetting('cd_badge_roles', '["Dps"]', tenantId)
      : Promise.resolve('["Dps"]'),
    // 기본값 'false' — 홈 길드 인증을 완료하지 않은 멤버는 기본적으로
    // /onboarding/albion 을 끝내기 전까지 사이트 진입을 막는다.
    settingsAccess.toggles
      ? getAppSetting('allow_unverified_member_access', 'false', tenantId)
      : Promise.resolve('false'),
    settingsAccess.general
      ? getAppSetting('local_guild_accounts_enabled', 'false', tenantId)
      : Promise.resolve('false'),
    settingsAccess.general
      ? getAppSetting('local_guild_invite_hash', '', tenantId)
      : Promise.resolve(''),
    loadLocalGuildAccountSummaries(tenantId, settingsAccess.general),
    settingsAccess.notifications
      ? getAppSetting('admin_notifications_enabled', 'false', tenantId)
      : Promise.resolve('false'),
    settingsAccess.notifications
      ? getAppSetting('admin_notification_channel_id', '', tenantId)
      : Promise.resolve(''),
    settingsAccess.notifications
      ? getAppSetting('admin_notification_role_ids', '[]', tenantId)
      : Promise.resolve('[]'),
    settingsAccess.notifications
      ? getAppSetting('admin_notification_topics', JSON.stringify(DEFAULT_ADMIN_NOTIFICATION_TOPICS), tenantId)
      : Promise.resolve(JSON.stringify(DEFAULT_ADMIN_NOTIFICATION_TOPICS)),
    settingsAccess.notifications
      ? getAppSetting('admin_notification_digest_minutes', '0', tenantId)
      : Promise.resolve('0'),
    // 기본값 'Asia/Seoul' — 기존 멘헤라 동작 유지. 잘못된 값이 박혀 있으면
    // 아래 isValidTenantTimezone 으로 다시 한 번 정규화한다.
    settingsAccess.general || canManageAnyLogOperatingStart
      ? getAppSetting('tenant_timezone', 'Asia/Seoul', tenantId)
      : Promise.resolve('Asia/Seoul'),
    settingsAccess.shopChestLogStart
      ? getAppSetting('log_start_shop_chest_at', '', tenantId)
      : Promise.resolve(''),
    settingsAccess.siphonLogStart
      ? getAppSetting('log_start_siphon_at', '', tenantId)
      : Promise.resolve(''),
    settingsAccess.general
      ? getAppSetting('event_dm_lead_minutes', '35', tenantId)
      : Promise.resolve('35'),
    settingsAccess.roleRewards
      ? listRoleRewards()
      : Promise.resolve({ rewards: [], error: undefined }),
    getTranslations('landing'),
    getTranslations('adminSettings'),
  ])

  // Numeric/boolean settings degrade to sane defaults if the DB value is
  // missing or malformed — admin can correct via the new form.
  const parseInteger = (raw: string, fallback: number): number => {
    const parsed = Number(raw)
    return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback
  }
  const regearWindowMinutes = parseInteger(regearWindowMinutesRaw, 60)
  const regearMaxDeaths = parseInteger(regearMaxDeathsRaw, 1)
  // 1-90 일 범위. 손상된 값은 14 (멘헤라 검증된 기본) 로 degrade.
  const parsedEligibility = Number(regearEligibilityDaysRaw)
  const regearEligibilityDays =
    Number.isFinite(parsedEligibility) &&
    Number.isInteger(parsedEligibility) &&
    parsedEligibility >= 1 &&
    parsedEligibility <= 90
      ? parsedEligibility
      : 14
  const parsedPayoutRate = Number(regearPayoutRatePercentRaw)
  const regearPayoutRatePercent =
    Number.isFinite(parsedPayoutRate) &&
    Number.isInteger(parsedPayoutRate) &&
    parsedPayoutRate >= 1 &&
    parsedPayoutRate <= 100
      ? parsedPayoutRate
      : 100
  const eventsAutoStartEnabled = eventsAutoStartRaw === 'true'

  // DB 에 값이 없거나 손상된 경우 null 로 전달 — UI 가 명시적 선택을 강제한다.
  // 'east' 폴백은 west/eu 테넌트의 홈 길드/온보딩이 silent 실패로 이어진다.
  const albionServer: AlbionServer | null = isAlbionServer(albionServerRaw)
    ? albionServerRaw
    : null

  const autoRegearEnabled = autoRegearEnabledRaw === 'true'
  const autoRegearSkipLowConfidence = autoRegearSkipLowConfidenceRaw === 'true'
  const craftRegearEnabled = craftRegearEnabledRaw === 'true'
  // 기본값 'true' — 인증 게이트가 켜진 상태로 시작. 'false' 만 OFF 로 해석.
  const regearRequireVerification = regearRequireVerificationRaw !== 'false'
  // 기본값 'false' — 연합원 수동 리기어는 길드가 명시적으로 켜야 한다.
  const allianceRegearEnabled = allianceRegearEnabledRaw === 'true'
  // 기본값 'false' — 오버차지 신청은 길드가 명시적으로 켜야 멤버 폼에 노출.
  const regearOverchargeEnabled = regearOverchargeEnabledRaw === 'true'
  // 'true' 이외는 모두 false 로 해석 — 유일한 opt-out 경로는 명시적 'false'.
  const allowUnverifiedMemberAccess = allowUnverifiedMemberAccessRaw !== 'false'
  const localGuildAccountsEnabled = localGuildAccountsEnabledRaw === 'true'
  const localGuildInviteConfigured = localGuildInviteHashRaw.trim().length > 0
  const adminNotificationsEnabled = adminNotificationsEnabledRaw === 'true'
  const adminNotificationRoleIds = (() => {
    try {
      const parsed = JSON.parse(adminNotificationRoleIdsRaw)
      return Array.isArray(parsed)
        ? parsed.filter((v): v is string => typeof v === 'string' && /^\d{5,30}$/.test(v))
        : []
    } catch {
      return []
    }
  })()
  const adminNotificationTopics = parseAdminNotificationTopics(adminNotificationTopicsRaw)
  const parsedAdminDigest = Number(adminNotificationDigestMinutesRaw)
  const adminNotificationDigestMinutes =
    Number.isFinite(parsedAdminDigest) &&
    Number.isInteger(parsedAdminDigest) &&
    [0, 30, 60, 180, 1440].includes(parsedAdminDigest)
      ? parsedAdminDigest
      : 0
  // 손상된 IANA 가 박혀 있어도 화면이 깨지진 않도록 기본값으로 정규화.
  const tenantTimezone = isValidTenantTimezone(tenantTimezoneRaw)
    ? tenantTimezoneRaw
    : DEFAULT_TENANT_TIMEZONE
  // DM 임박 알림 lead 분 — 5~1440 분 범위 밖이면 35로 degrade.
  const parsedDmLead = Number(eventDmLeadMinutesRaw)
  const eventDmLeadMinutes =
    Number.isFinite(parsedDmLead) && Number.isInteger(parsedDmLead) && parsedDmLead >= 5 && parsedDmLead <= 1440
      ? parsedDmLead
      : 35

  // 저장돼 있는 홈 길드 UUID 를 이름으로 역조회. Gameinfo 장애/삭제된 길드는
  // null 로 폴백해 UI 가 ID 만 노출하도록 둔다 — 실패해도 저장 흐름은 막지 않는다.
  // albionServer 가 null (= 미설정/손상) 인 경우엔 어느 서버 게임인포를 칠지
  // 모르므로 lookup 스킵.
  const initialHomeGuildName =
    albionServer && albionHomeGuildId
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

  const slotKeySet: ReadonlySet<string> = new Set(SLOT_KEYS)
  let autoRegearExcludedSlots: SlotKey[] = []
  try {
    const parsed = JSON.parse(autoRegearExcludedSlotsRaw)
    if (Array.isArray(parsed)) {
      autoRegearExcludedSlots = parsed.filter(
        (v): v is SlotKey => typeof v === 'string' && slotKeySet.has(v),
      )
    }
  } catch {
    // 손상된 값 — 빈 배열(전부 포함) 로 degrade.
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">{t('pageTitle')}</h1>
        <p className="text-gray-500 text-sm mt-1">{t('pageDescription')}</p>
      </div>

      <SettingsTabs
        adminRoleIds={permissionRoleSettings.adminRoleIds}
        notificationMessage={message}
        eventChannelId={tenantConfig?.eventChannelId ?? ''}
        rewards={rewards}
        rewardsError={rewardsError}
        landingBannerUrl={bannerUrl}
        landingCtaText={ctaText}
        defaultLandingCtaText={tLanding('defaultCta')}
        eventCreatorRoleIds={permissionRoleSettings.eventCreatorRoleIds}
        eventCreatorCombatRoleIds={permissionRoleSettings.eventCreatorCombatRoleIds}
        eventCreatorFfRoleIds={permissionRoleSettings.eventCreatorFfRoleIds}
        eventCreatorGankingRoleIds={permissionRoleSettings.eventCreatorGankingRoleIds}
        bombSquadCallerRoleIds={permissionRoleSettings.bombSquadCallerRoleIds}
        activeMemberRoleIds={permissionRoleSettings.activeMemberRoleIds}
        lastMemberSyncAt={permissionRoleSettings.lastMemberSyncAt}
        regearWindowMinutes={regearWindowMinutes}
        regearMaxDeaths={regearMaxDeaths}
        regearEligibilityDays={regearEligibilityDays}
        regearPayoutRatePercent={regearPayoutRatePercent}
        eventsAutoStartEnabled={eventsAutoStartEnabled}
        albionServer={albionServer}
        albionHomeGuildId={albionHomeGuildId}
        albionHomeGuildName={initialHomeGuildName}
        autoRegearEnabled={autoRegearEnabled}
        autoRegearExcludedSlots={autoRegearExcludedSlots}
        craftRegearEnabled={craftRegearEnabled}
        regearRequireVerification={regearRequireVerification}
        allianceRegearEnabled={allianceRegearEnabled}
        regearOverchargeEnabled={regearOverchargeEnabled}
        autoRegearSkipLowConfidence={autoRegearSkipLowConfidence}
        cdBadgeRoles={cdBadgeRoles}
        allowUnverifiedMemberAccess={allowUnverifiedMemberAccess}
        localGuildAccountsEnabled={localGuildAccountsEnabled}
        localGuildInviteConfigured={localGuildInviteConfigured}
        initialLocalGuildAccounts={initialLocalGuildAccounts}
        adminNotificationsEnabled={adminNotificationsEnabled}
        adminNotificationChannelId={adminNotificationChannelId}
        adminNotificationRoleIds={adminNotificationRoleIds}
        adminNotificationTopics={adminNotificationTopics}
        adminNotificationDigestMinutes={adminNotificationDigestMinutes}
        tenantTimezone={tenantTimezone}
        logStartShopChestAt={logStartShopChestAt}
        logStartSiphonAt={logStartSiphonAt}
        eventDmLeadMinutes={eventDmLeadMinutes}
        isSuperAdmin={isSuperAdmin}
        access={settingsAccess}
      />
    </div>
  )
}
