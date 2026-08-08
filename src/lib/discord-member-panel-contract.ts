const PREFIX = 'agm_member:v1'
const POSITIVE_INT_RE = /^[1-9]\d{0,9}$/

export type DiscordMemberPanelAction =
  | { kind: 'event' }
  | { kind: 'exchange' }
  | { kind: 'exchange_submit' }
  | { kind: 'exchange_confirm'; amount: number }
  | { kind: 'exchange_cancel' }
  | { kind: 'regear' }

export const DISCORD_MEMBER_PANEL_CUSTOM_IDS = {
  event: `${PREFIX}:event`,
  exchange: `${PREFIX}:exchange`,
  exchangeSubmit: `${PREFIX}:exchange_submit`,
  exchangeCancel: `${PREFIX}:exchange_cancel`,
  regear: `${PREFIX}:regear`,
} as const

export function buildDiscordMemberPanelExchangeConfirmCustomId(amount: number): string {
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 2_147_483_647) {
    throw new Error('Invalid Discord member panel exchange amount')
  }
  return `${PREFIX}:exchange_confirm:${amount}`
}

export function parseDiscordMemberPanelCustomId(
  value: string | null | undefined,
): DiscordMemberPanelAction | null {
  if (!value) return null
  if (value === DISCORD_MEMBER_PANEL_CUSTOM_IDS.event) return { kind: 'event' }
  if (value === DISCORD_MEMBER_PANEL_CUSTOM_IDS.exchange) return { kind: 'exchange' }
  if (value === DISCORD_MEMBER_PANEL_CUSTOM_IDS.exchangeSubmit) {
    return { kind: 'exchange_submit' }
  }
  if (value === DISCORD_MEMBER_PANEL_CUSTOM_IDS.exchangeCancel) {
    return { kind: 'exchange_cancel' }
  }
  if (value === DISCORD_MEMBER_PANEL_CUSTOM_IDS.regear) return { kind: 'regear' }

  const prefix = `${PREFIX}:exchange_confirm:`
  if (!value.startsWith(prefix)) return null
  const rawAmount = value.slice(prefix.length)
  if (!POSITIVE_INT_RE.test(rawAmount)) return null
  const amount = Number(rawAmount)
  if (!Number.isSafeInteger(amount) || amount > 2_147_483_647) return null
  return { kind: 'exchange_confirm', amount }
}

export function isDiscordMemberPanelCustomId(
  value: string | null | undefined,
): boolean {
  return parseDiscordMemberPanelCustomId(value) !== null
}
