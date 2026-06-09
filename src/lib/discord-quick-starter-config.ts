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
  '**{name}** Quick Starter\nChoose a button below to open guild tools. If you are not logged in, Discord sign-in will bring you back.'
export const QUICK_STARTER_PANEL_MESSAGE_MAX_LENGTH = 1500

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
