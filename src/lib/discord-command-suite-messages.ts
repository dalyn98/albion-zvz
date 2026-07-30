import type { Locale } from '@/i18n/locales'

export interface DiscordCommandSuiteMessages {
  notMember: string
  notAuthorized: string
  invalidInput: string
  noResults: string
  openWeb: string
  confirmButton: string
  cancelButton: string
  confirmationTitle: string
  confirmationExpires: string
  confirmationExpired: string
  confirmationCancelled: string
  confirmationUnavailable: string
  transferConfirmation: string
  transferCompleted: string
  shopOrderConfirmation: string
  shopOrderCompleted: string
  craftDeliveryConfirmation: string
  craftDeliveryCompleted: string
  eventStartConfirmation: string
  eventStartCompleted: string
  inventoryWarning: string
  helpReady: string
  summaryTitle: string
  summaryBody: string
  noUpcomingEvent: string
  eventTitle: string
  eventCancelled: string
  eventCancelNone: string
  eventCancelRequiresWeb: string
  transferReady: string
  historyTitle: string
  historyLine: string
  statsTitle: string
  statsCombatLine: string
  statsBattleLine: string
  statsOutcomeLine: string
  windowWeek: string
  windowMonth: string
  windowAll: string
  metricKills: string
  metricParticipation: string
  metricSurvival: string
  metricKd: string
  metricWinrate: string
  leaderboardTitle: string
  battleTitle: string
  battleTeamLine: string
  regearEligibleReady: string
  regearDisabled: string
  regearStatusTitle: string
  regearStatusLine: string
  craftQueueTitle: string
  craftMineTitle: string
  craftClaimed: string
  craftReleased: string
  craftDelivered: string
  craftPickedUp: string
  crafterOnly: string
  craftDisabled: string
  siphonUnverified: string
  siphonBalanceTitle: string
  siphonBalanceLine: string
  siphonHistoryTitle: string
  shopStatusTitle: string
  shopStatusLine: string
  shopOrdered: string
  shopReordered: string
  shopPriceUnavailable: string
  shopOrderAdminTitle: string
  shopOrderAdminBody: string
  approvalsTitle: string
  approvalLine: string
  approvalRegearSummary: string
  approvalExchangeSummary: string
  approvalDonationSummary: string
  approvalShopSummary: string
  approvalEventPayoutSummary: string
  approvalCraftSummary: string
  eventDraftCreated: string
  eventStarted: string
  labels: {
    unknown: string
    status: Record<string, string>
    approvalKind: Record<string, string>
    battleOutcome: Record<string, string>
    pointReason: Record<string, string>
  }
}

export async function loadDiscordCommandSuiteMessages(
  locale: Locale,
): Promise<DiscordCommandSuiteMessages> {
  const dict = (await import(`../messages/${locale}.json`)).default as Record<string, unknown>
  return dict.discordCommandSuite as DiscordCommandSuiteMessages
}

export function formatDiscordCommandMessage(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`))
}

function localizedCodeLabel(
  value: unknown,
  labels: Record<string, string>,
  fallback: string,
): string {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return labels[key] ?? fallback
}

export function discordStatusLabel(
  value: unknown,
  messages: DiscordCommandSuiteMessages,
): string {
  return localizedCodeLabel(value, messages.labels.status, messages.labels.unknown)
}

export function discordApprovalKindLabel(
  value: unknown,
  messages: DiscordCommandSuiteMessages,
): string {
  return localizedCodeLabel(value, messages.labels.approvalKind, messages.labels.unknown)
}

export function discordBattleOutcomeLabel(
  value: unknown,
  messages: DiscordCommandSuiteMessages,
): string {
  return localizedCodeLabel(value, messages.labels.battleOutcome, messages.labels.unknown)
}

export function discordPointReasonLabel(
  value: unknown,
  messages: DiscordCommandSuiteMessages,
): string {
  return localizedCodeLabel(value, messages.labels.pointReason, messages.labels.unknown)
}
