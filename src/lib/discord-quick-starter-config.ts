import type { DiscordQuickStarterDestination } from '@/lib/discord-quick-starter-types'

export const DISCORD_QUICK_STARTER_DESTINATIONS = [
  'verify',
  'events',
  'me',
  'guide',
  'regear',
  'shop',
  'wallet',
  'craft',
] as const satisfies readonly DiscordQuickStarterDestination[]

export interface DiscordQuickStarterButtonLabels {
  login: string
  verify: string
  events: string
  me: string
  regear: string
  shop: string
  wallet: string
  craft: string
  guide: string
  eventsDescription: string
  exchangeDescription: string
  regearDescription: string
}

export const DEFAULT_DISCORD_QUICK_STARTER_PANEL_MESSAGE =
  '**{name}** Member Center\nJoin events, request a point exchange, and start regear from one Discord panel.'
export const QUICK_STARTER_PANEL_MESSAGE_MAX_LENGTH = 1500

export const DEFAULT_DISCORD_QUICK_STARTER_PANEL_TITLE = '{name} Member Center'
export const DEFAULT_DISCORD_QUICK_STARTER_PANEL_DESCRIPTION =
  'Join events, request a point exchange, and start regear from one Discord panel.\nYour balance and request details are only shown to you.'
export const DEFAULT_DISCORD_QUICK_STARTER_PANEL_COLOR = '#f59e0b'
export const DEFAULT_DISCORD_QUICK_STARTER_PANEL_FOOTER = 'Albion Guild Manager'

export const QUICK_STARTER_PANEL_TITLE_MAX_LENGTH = 256
export const QUICK_STARTER_PANEL_DESCRIPTION_MAX_LENGTH = 1500
export const QUICK_STARTER_PANEL_FOOTER_MAX_LENGTH = 120

export const DEFAULT_DISCORD_QUICK_STARTER_BUTTON_LABELS: DiscordQuickStarterButtonLabels = {
  login: 'Discord Login / Refresh',
  verify: 'Verify',
  events: 'Events',
  me: 'My Page',
  regear: 'Regear',
  shop: 'Shop',
  wallet: 'Wallet',
  craft: 'Craft',
  guide: 'Guide',
  eventsDescription: 'View upcoming events and join without leaving Discord.',
  exchangeDescription: 'Request a point-to-silver exchange with a final confirmation.',
  regearDescription: 'Check exact eligibility and open the protected request flow.',
}
