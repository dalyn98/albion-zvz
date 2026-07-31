import type { AbstractIntlMessages } from 'next-intl'

export const CLIENT_MESSAGE_NAMESPACES = [
  'adminActiveMemberRoles',
  'adminActionError',
  'adminAdminNotifications',
  'adminAdminRoles',
  'adminAlbionHomeGuild',
  'adminAllowUnverified',
  'adminAodp',
  'adminAutoRegearSlots',
  'adminBackup',
  'adminBombSquadCallerRoles',
  'adminBuildTemplates',
  'adminCdBadge',
  'adminCraft',
  'adminCraftOrderReview',
  'adminDashboard',
  'adminDonationReview',
  'adminEditEvent',
  'adminEventAutoStart',
  'adminEventCreatorCategoryRoles',
  'adminEventCreatorRoles',
  'adminEventCreatorRolesGroup',
  'adminEventsNotice',
  'adminEventDmLead',
  'adminEventForm',
  'adminEventPayoutCreate',
  'adminEventPayoutReview',
  'adminExchangeReview',
  'adminFirstRun',
  'adminGuildProfile',
  'adminGuildProfileToggle',
  'adminInventory',
  'adminKillbotPage',
  'adminLanding',
  'adminLogOperatingStart',
  'adminLootAuditPage',
  'adminMemberTradeReview',
  'adminNewEvent',
  'adminParty',
  'adminPointAdjust',
  'adminQuickStarterPanel',
  'adminRegearAnomaly',
  'adminRegearLimits',
  'adminRegearMode',
  'adminRegearNotice',
  'adminRegearPayoutRate',
  'adminRegearRolePolicies',
  'adminRegearRoleRateFloors',
  'adminRegearReview',
  'adminRegearWindows',
  'adminRoleRewards',
  'adminSettings',
  'adminShopBlacklist',
  'adminShopImport',
  'adminShopImportFilter',
  'adminShopInventory',
  'adminShopOrderReview',
  'adminShopPage',
  'adminShopSilverRate',
  'adminSiphonPage',
  'adminTemplates',
  'adminTimezone',
  'albionIdentityProfile',
  'albionIdentityReview',
  'albionOnboarding',
  'allianceContent',
  'approvalWorkflow',
  'archive',
  'armor',
  'battleTracking',
  'buildSheetRecruitment',
  'collapsibleList',
  'common',
  'craftOrders',
  'craftPickup',
  'craftQueue',
  'demo',
  'discordDm',
  'donation',
  'errors',
  'event',
  'eventSidebar',
  'eventGuestInvite',
  'eventGuestExperience',
  'eventGuestProfile',
  'eventOperations',
  'eventParticipationCloseout',
  'eventRegearParticipants',
  'eventRegearRoleOverrides',
  'eventTentative',
  'eventTentativeAction',
  'exchangeActions',
  'forceOnboardButton',
  'gear',
  'home',
  'imageCrop',
  'languageSetting',
  'localGuildAccount',
  'me',
  'memberActionError',
  'memberTrade',
  'memberInvite',
  'memberTour',
  'members',
  'myTimezone',
  'nav',
  'noticeBannerAdmin',
  'onboard',
  'permissions',
  'picker',
  'publicGuildProfile',
  'publicMarketing',
  'publishEventBanner',
  'regear',
  'regearBreakdown',
  'regearBuildSnapshot',
  'regearRejectReason',
  'regearTrackedDeaths',
  'regearWindow',
  'requestExchange',
  'shop',
  'shopBaselineForm',
  'shopCatalog',
  'shopMyOrders',
  'sidebar',
  'slot',
  'slotRole',
  'tactics',
  'time',
  'toast',
  'unsavedChanges',
  'welcomeLanguage',
  'workspaceLifecycle',
] as const

export const MARKETING_CLIENT_MESSAGE_NAMESPACES = [
  'common',
  'publicMarketing',
  'sidebar',
] as const

export const DEMO_CLIENT_MESSAGE_NAMESPACES = [
  'adminActionError',
  'adminCraft',
  'adminCraftOrderReview',
  'adminDashboard',
  'adminDonationReview',
  'adminEventPayoutReview',
  'adminExchangeReview',
  'adminInventory',
  'adminLogOperatingStart',
  'adminMemberTradeReview',
  'adminParty',
  'adminRegearMode',
  'adminRegearReview',
  'adminSettings',
  'adminShopOrderReview',
  'adminSiphonPage',
  'adminTemplates',
  'battleTracking',
  'armor',
  'collapsibleList',
  'common',
  'craftOrders',
  'craftQueue',
  'demo',
  'event',
  'eventSidebar',
  'eventTentative',
  'eventTentativeAction',
  'gear',
  'home',
  'memberInvite',
  'members',
  'nav',
  'permissions',
  'picker',
  'publicMarketing',
  'regear',
  'regearRejectReason',
  'shop',
  'shopCatalog',
  'shopMyOrders',
  'sidebar',
  'slot',
  'slotRole',
  'tactics',
  'toast',
  'unsavedChanges',
] as const

export const PUBLIC_ACTIVITY_CLIENT_MESSAGE_NAMESPACES = ['common'] as const

export const PUBLIC_TACTIC_CLIENT_MESSAGE_NAMESPACES = ['tactics'] as const

export const APP_GATE_CLIENT_MESSAGE_NAMESPACES = [
  'common',
  'errors',
  'unsavedChanges',
] as const

export const APP_SHELL_CHROME_CLIENT_MESSAGE_NAMESPACES = [
  'albionOnboarding',
  'common',
  'errors',
  'memberTour',
  'unsavedChanges',
  'sidebar',
  'nav',
] as const

export const APP_SHELL_ROOT_CLIENT_MESSAGE_NAMESPACES = [
  ...APP_SHELL_CHROME_CLIENT_MESSAGE_NAMESPACES,
  'approvalWorkflow',
  'adminSettings',
  'home',
  'imageCrop',
  'noticeBannerAdmin',
  'workspaceLifecycle',
] as const

export const APP_ROUTE_CLIENT_MESSAGE_NAMESPACES = {
  events: [
    'adminActionError',
    'adminEditEvent',
    'adminParty',
    'adminTemplates',
    'armor',
    'buildSheetRecruitment',
    'demo',
    'event',
    'eventSidebar',
    'eventGuestInvite',
    'eventGuestExperience',
    'eventGuestProfile',
    'eventOperations',
    'eventParticipationCloseout',
    'eventTentative',
    'eventTentativeAction',
    'gear',
    'picker',
    'publishEventBanner',
    'regear',
    'slot',
    'slotRole',
    'tactics',
    'toast',
  ],
  regear: [
    'gear',
    'regear',
    'regearTrackedDeaths',
    'regearWindow',
    'slotRole',
    'toast',
  ],
  shop: ['shop', 'shopCatalog', 'shopMyOrders'],
  craft: ['adminInventory', 'craftOrders', 'craftQueue', 'gear', 'slotRole'],
  me: [
    'adminTimezone',
    'albionIdentityProfile',
    'allianceContent',
    'collapsibleList',
    'craftPickup',
    'discordDm',
    'donation',
    'exchangeActions',
    'gear',
    'languageSetting',
    'me',
    'memberActionError',
    'myTimezone',
    'picker',
    'regear',
    'regearBreakdown',
    'regearBuildSnapshot',
    'regearRejectReason',
    'requestExchange',
    'slotRole',
    'toast',
  ],
  members: [
    'adminPointAdjust',
    'albionIdentityProfile',
    'collapsibleList',
    'members',
    'slotRole',
  ],
  archive: ['archive'],
  tactics: ['tactics'],
  market: ['memberTrade'],
  guildLogin: ['localGuildAccount'],
  onboard: ['onboard', 'slotRole', 'workspaceLifecycle'],
  onboarding: [],
  welcomeLanguage: ['welcomeLanguage'],
  admin: [
    'adminActionError',
    'adminActiveMemberRoles',
    'adminAdminNotifications',
    'adminAdminRoles',
    'adminAlbionHomeGuild',
    'adminAllowUnverified',
    'adminAodp',
    'adminAutoRegearSlots',
    'adminBackup',
    'adminBombSquadCallerRoles',
    'adminBuildTemplates',
    'adminCdBadge',
    'adminCraft',
    'adminCraftOrderReview',
    'adminDashboard',
    'adminDonationReview',
    'adminEditEvent',
    'adminEventAutoStart',
    'adminEventCreatorCategoryRoles',
    'adminEventCreatorRoles',
    'adminEventCreatorRolesGroup',
    'adminEventDmLead',
    'adminEventForm',
    'adminEventPayoutCreate',
    'adminEventPayoutReview',
    'adminExchangeReview',
    'adminFirstRun',
    'adminGuildProfile',
    'adminGuildProfileToggle',
    'adminInventory',
    'adminKillbotPage',
    'adminLanding',
    'adminLogOperatingStart',
    'adminLootAuditPage',
    'adminMemberTradeReview',
    'adminParty',
    'adminPointAdjust',
    'adminQuickStarterPanel',
    'adminRegearAnomaly',
    'adminRegearLimits',
    'adminRegearMode',
    'adminRegearPayoutRate',
    'adminRegearReview',
    'adminRegearRolePolicies',
    'adminRegearRoleRateFloors',
    'adminRegearWindows',
    'adminRoleRewards',
    'adminShopBlacklist',
    'adminShopImport',
    'adminShopImportFilter',
    'adminShopInventory',
    'adminShopOrderReview',
    'adminShopPage',
    'adminShopSilverRate',
    'adminSiphonPage',
    'adminTemplates',
    'adminTimezone',
    'albionIdentityProfile',
    'albionIdentityReview',
    'allianceContent',
    'armor',
    'buildSheetRecruitment',
    'collapsibleList',
    'craftOrders',
    'demo',
    'eventSidebar',
    'eventOperations',
    'eventRegearParticipants',
    'eventRegearRoleOverrides',
    'eventTentative',
    'eventTentativeAction',
    'forceOnboardButton',
    'gear',
    'members',
    'permissions',
    'picker',
    'publishEventBanner',
    'regearBreakdown',
    'regearRejectReason',
    'shop',
    'shopBaselineForm',
    'slot',
    'slotRole',
    'tactics',
    'time',
    'toast',
    'workspaceLifecycle',
  ],
  publicMarketing: ['adminGuildProfile', 'publicGuildProfile'],
} as const

export const SHOP_CLIENT_MESSAGE_NAMESPACES = [
  ...APP_SHELL_CHROME_CLIENT_MESSAGE_NAMESPACES,
  'albionOnboarding',
  'memberTour',
  'shop',
  'shopCatalog',
  'shopMyOrders',
] as const

export const LOCAL_GUILD_LOGIN_CLIENT_MESSAGE_NAMESPACES = [
  ...APP_SHELL_CHROME_CLIENT_MESSAGE_NAMESPACES,
  'albionOnboarding',
  'localGuildAccount',
  'memberTour',
] as const

export const PUBLIC_CLIENT_MESSAGE_NAMESPACES = [
  ...MARKETING_CLIENT_MESSAGE_NAMESPACES,
  ...DEMO_CLIENT_MESSAGE_NAMESPACES,
  ...PUBLIC_ACTIVITY_CLIENT_MESSAGE_NAMESPACES,
  ...PUBLIC_TACTIC_CLIENT_MESSAGE_NAMESPACES,
] as const

export function pickClientMessages(
  messages: AbstractIntlMessages,
  namespaces: readonly string[],
): AbstractIntlMessages {
  const selected: Record<string, unknown> = {}
  const namespaceSet = new Set<string>(namespaces)
  for (const [key, value] of Object.entries(messages)) {
    if (namespaceSet.has(key)) selected[key] = value
  }
  return selected as AbstractIntlMessages
}

export function getClientMessages(
  messages: AbstractIntlMessages,
): AbstractIntlMessages {
  return pickClientMessages(messages, CLIENT_MESSAGE_NAMESPACES)
}

export function getAppShellClientMessages(
  messages: AbstractIntlMessages,
  pathname: string,
  options: {
    locked?: boolean
    isDemo?: boolean
    isMarketing?: boolean
    isStandalonePublic?: boolean
  } = {},
): AbstractIntlMessages {
  if (options.locked || options.isStandalonePublic) {
    return pickClientMessages(messages, APP_GATE_CLIENT_MESSAGE_NAMESPACES)
  }
  if (options.isDemo) return getDemoClientMessages(messages)

  const normalized = normalizePathname(pathname)
  if (options.isMarketing && isStaticMarketingPathname(normalized)) {
    return getMarketingClientMessages(messages)
  }
  return pickClientMessages(messages, APP_SHELL_ROOT_CLIENT_MESSAGE_NAMESPACES)
}

export function getPublicClientMessages(
  messages: AbstractIntlMessages,
): AbstractIntlMessages {
  return pickClientMessages(messages, PUBLIC_CLIENT_MESSAGE_NAMESPACES)
}

export function getMarketingClientMessages(
  messages: AbstractIntlMessages,
): AbstractIntlMessages {
  return pickClientMessages(messages, MARKETING_CLIENT_MESSAGE_NAMESPACES)
}

export function getDemoClientMessages(
  messages: AbstractIntlMessages,
): AbstractIntlMessages {
  return pickClientMessages(messages, DEMO_CLIENT_MESSAGE_NAMESPACES)
}

export function getPublicActivityClientMessages(
  messages: AbstractIntlMessages,
): AbstractIntlMessages {
  return pickClientMessages(messages, PUBLIC_ACTIVITY_CLIENT_MESSAGE_NAMESPACES)
}

function normalizePathname(pathname: string): string {
  const pathOnly = pathname.split(/[?#]/, 1)[0] || '/'
  if (pathOnly.length <= 1) return pathOnly
  return pathOnly.replace(/\/+$/, '')
}

function isStaticMarketingPathname(pathname: string): boolean {
  return (
    pathname === '/public/landing' ||
    pathname === '/public/features' ||
    pathname.startsWith('/public/features/') ||
    pathname === '/public/zvz-battles' ||
    pathname.startsWith('/public/zvz-battles/') ||
    pathname === '/public/pricing' ||
    pathname === '/public/faq' ||
    pathname === '/public/privacy' ||
    pathname === '/public/terms' ||
    pathname === '/public/docs' ||
    pathname.startsWith('/public/docs/')
  )
}

export function getPublicTacticClientMessages(
  messages: AbstractIntlMessages,
): AbstractIntlMessages {
  return pickClientMessages(messages, PUBLIC_TACTIC_CLIENT_MESSAGE_NAMESPACES)
}
