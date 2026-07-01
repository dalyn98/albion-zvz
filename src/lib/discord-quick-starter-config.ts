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
  verify: string
  events: string
  me: string
  regear: string
  shop: string
  wallet: string
  craft: string
  guide: string
}

export const DEFAULT_DISCORD_QUICK_STARTER_PANEL_MESSAGE =
  '**{name}** Start here\nUse the buttons below to open guild tools. Need slash commands? Run `/agm help`.'
export const QUICK_STARTER_PANEL_MESSAGE_MAX_LENGTH = 1500

export const DEFAULT_DISCORD_QUICK_STARTER_PANEL_TITLE = '{name} Quick Starter'
export const DEFAULT_DISCORD_QUICK_STARTER_PANEL_DESCRIPTION =
  'Use the buttons below to open guild tools.\nNeed slash commands? Run `/agm help`.'
export const DEFAULT_DISCORD_QUICK_STARTER_PANEL_COLOR = '#f59e0b'
export const DEFAULT_DISCORD_QUICK_STARTER_PANEL_FOOTER = 'Albion Guild Manager'

export const QUICK_STARTER_PANEL_TITLE_MAX_LENGTH = 256
export const QUICK_STARTER_PANEL_DESCRIPTION_MAX_LENGTH = 1500
export const QUICK_STARTER_PANEL_FOOTER_MAX_LENGTH = 120

export const DEFAULT_DISCORD_QUICK_STARTER_BUTTON_LABELS: DiscordQuickStarterButtonLabels = {
  verify: 'Verify',
  events: 'Events',
  me: 'My Page',
  regear: 'Regear',
  shop: 'Shop',
  wallet: 'Wallet',
  craft: 'Craft',
  guide: 'Guide',
}
