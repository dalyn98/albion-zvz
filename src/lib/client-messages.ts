import type { AbstractIntlMessages } from 'next-intl'

export const CLIENT_MESSAGE_NAMESPACES = [
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
  'adminNewEvent',
  'adminParty',
  'adminPointAdjust',
  'adminQuickStarterPanel',
  'adminRegearAnomaly',
  'adminRegearLimits',
  'adminRegearMode',
  'adminRegearNotice',
  'adminRegearPayoutRate',
  'adminRegearReview',
  'adminRegearWindows',
  'adminRoleRewards',
  'adminSettings',
  'adminShopBlacklist',
  'adminShopImport',
  'adminShopImportFilter',
  'adminShopInventory',
  'adminShopOrderReview',
  'adminShopSilverRate',
  'adminSiphonPage',
  'adminTemplates',
  'adminTimezone',
  'albionIdentityProfile',
  'albionIdentityReview',
  'albionOnboarding',
  'archive',
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
  'eventGuestInvite',
  'eventGuestProfile',
  'eventRegearParticipants',
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
  'memberInvite',
  'memberTour',
  'members',
  'myTimezone',
  'nav',
  'noticeBannerAdmin',
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
  'time',
  'toast',
  'unsavedChanges',
  'welcomeLanguage',
] as const

const APP_SHELL_NAMESPACES = [
  'albionOnboarding',
  'common',
  'errors',
  'memberTour',
  'nav',
  'sidebar',
  'toast',
  'unsavedChanges',
] as const

const MARKETING_NAMESPACES = [
  'common',
  'publicGuildProfile',
  'publicMarketing',
  'sidebar',
] as const

const PUBLIC_GUILD_PROFILE_NAMESPACES = [
  ...MARKETING_NAMESPACES,
  'adminGuildProfile',
  'noticeBannerAdmin',
  'toast',
] as const

const SHOP_NAMESPACES = [
  ...APP_SHELL_NAMESPACES,
  'shop',
  'shopCatalog',
  'shopMyOrders',
] as const

const MEMBERS_NAMESPACES = [
  ...APP_SHELL_NAMESPACES,
  'adminPointAdjust',
  'albionIdentityProfile',
  'members',
  'slotRole',
] as const

const REGEAR_NAMESPACES = [
  ...APP_SHELL_NAMESPACES,
  'adminRegearNotice',
  'gear',
  'noticeBannerAdmin',
  'regear',
  'regearBreakdown',
  'regearBuildSnapshot',
  'regearRejectReason',
  'regearTrackedDeaths',
  'regearWindow',
  'slotRole',
] as const

const ME_NAMESPACES = [
  ...APP_SHELL_NAMESPACES,
  'adminTimezone',
  'albionIdentityProfile',
  'discordDm',
  'donation',
  'exchangeActions',
  'gear',
  'languageSetting',
  'me',
  'memberActionError',
  'myTimezone',
  'regear',
  'regearBreakdown',
  'regearBuildSnapshot',
  'regearRejectReason',
  'requestExchange',
  'slotRole',
] as const

const EVENT_NAMESPACES = [
  ...APP_SHELL_NAMESPACES,
  'adminEditEvent',
  'adminEventPayoutCreate',
  'adminParty',
  'buildSheetRecruitment',
  'demo',
  'event',
  'eventGuestInvite',
  'eventGuestProfile',
  'eventRegearParticipants',
  'eventTentative',
  'eventTentativeAction',
  'gear',
  'noticeBannerAdmin',
  'publishEventBanner',
  'slot',
  'slotRole',
] as const

function pickClientMessages(
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

function normalizePathname(pathname: string): string {
  const pathOnly = pathname.split(/[?#]/, 1)[0] || '/'
  if (pathOnly.length <= 1) return pathOnly
  return pathOnly.replace(/\/+$/, '')
}

export function getClientMessages(messages: AbstractIntlMessages): AbstractIntlMessages {
  return pickClientMessages(messages, CLIENT_MESSAGE_NAMESPACES)
}

export function getClientMessagesForPathname(
  messages: AbstractIntlMessages,
  pathname: string,
): AbstractIntlMessages {
  const normalized = normalizePathname(pathname)
  if (
    normalized === '/public/landing' ||
    normalized === '/public/features' ||
    normalized.startsWith('/public/features/') ||
    normalized === '/public/pricing' ||
    normalized === '/public/faq' ||
    normalized === '/public/privacy' ||
    normalized === '/public/terms' ||
    normalized === '/public/docs' ||
    normalized.startsWith('/public/docs/')
  ) {
    return pickClientMessages(messages, MARKETING_NAMESPACES)
  }
  if (normalized === '/public/g' || normalized.startsWith('/public/g/')) {
    return pickClientMessages(messages, PUBLIC_GUILD_PROFILE_NAMESPACES)
  }
  if (normalized === '/members' || normalized.startsWith('/members/')) {
    return pickClientMessages(messages, MEMBERS_NAMESPACES)
  }
  if (normalized === '/regear') {
    return pickClientMessages(messages, REGEAR_NAMESPACES)
  }
  if (normalized === '/me' || normalized.startsWith('/me/')) {
    return pickClientMessages(messages, ME_NAMESPACES)
  }
  if (normalized === '/events' || normalized.startsWith('/events/')) {
    return pickClientMessages(messages, EVENT_NAMESPACES)
  }
  if (normalized === '/shop') {
    return pickClientMessages(messages, SHOP_NAMESPACES)
  }
  return getClientMessages(messages)
}
