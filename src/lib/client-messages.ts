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
] as const

export const MARKETING_CLIENT_MESSAGE_NAMESPACES = [
  'common',
  'publicMarketing',
  'sidebar',
] as const

export const DEMO_CLIENT_MESSAGE_NAMESPACES = [
  'adminCraft',
  'adminCraftOrderReview',
  'adminDashboard',
  'adminDonationReview',
  'adminEventPayoutReview',
  'adminExchangeReview',
  'adminInventory',
  'adminLogOperatingStart',
  'adminParty',
  'adminRegearMode',
  'adminRegearReview',
  'adminSettings',
  'adminShopOrderReview',
  'adminSiphonPage',
  'adminTemplates',
  'battleTracking',
  'collapsibleList',
  'common',
  'craftOrders',
  'craftQueue',
  'demo',
  'event',
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

export const PUBLIC_ACTIVITY_CLIENT_MESSAGE_NAMESPACES = [
  'common',
] as const

export const PUBLIC_TACTIC_CLIENT_MESSAGE_NAMESPACES = [
  'tactics',
] as const

export const PUBLIC_CLIENT_MESSAGE_NAMESPACES = [
  ...MARKETING_CLIENT_MESSAGE_NAMESPACES,
  ...DEMO_CLIENT_MESSAGE_NAMESPACES,
  ...PUBLIC_ACTIVITY_CLIENT_MESSAGE_NAMESPACES,
  ...PUBLIC_TACTIC_CLIENT_MESSAGE_NAMESPACES,
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

export function getClientMessages(messages: AbstractIntlMessages): AbstractIntlMessages {
  return pickClientMessages(messages, CLIENT_MESSAGE_NAMESPACES)
}

export function getPublicClientMessages(messages: AbstractIntlMessages): AbstractIntlMessages {
  return pickClientMessages(messages, PUBLIC_CLIENT_MESSAGE_NAMESPACES)
}

export function getMarketingClientMessages(messages: AbstractIntlMessages): AbstractIntlMessages {
  return pickClientMessages(messages, MARKETING_CLIENT_MESSAGE_NAMESPACES)
}

export function getDemoClientMessages(messages: AbstractIntlMessages): AbstractIntlMessages {
  return pickClientMessages(messages, DEMO_CLIENT_MESSAGE_NAMESPACES)
}

export function getPublicActivityClientMessages(messages: AbstractIntlMessages): AbstractIntlMessages {
  return pickClientMessages(messages, PUBLIC_ACTIVITY_CLIENT_MESSAGE_NAMESPACES)
}

export function getPublicTacticClientMessages(messages: AbstractIntlMessages): AbstractIntlMessages {
  return pickClientMessages(messages, PUBLIC_TACTIC_CLIENT_MESSAGE_NAMESPACES)
}
