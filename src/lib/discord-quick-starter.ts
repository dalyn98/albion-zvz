import { tenantUrl } from '@/lib/tenant-resolver'
import type { DiscordMessageComponent } from '@/lib/discord-interactions'

export const DISCORD_QUICK_STARTER_DESTINATIONS = [
  'verify',
  'events',
  'me',
  'regear',
  'shop',
  'wallet',
  'craft',
  'guide',
] as const

export type DiscordQuickStarterDestination =
  typeof DISCORD_QUICK_STARTER_DESTINATIONS[number]

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

const DESTINATION_SET: ReadonlySet<string> = new Set(DISCORD_QUICK_STARTER_DESTINATIONS)

export function isDiscordQuickStarterDestination(
  value: string | null | undefined,
): value is DiscordQuickStarterDestination {
  return !!value && DESTINATION_SET.has(value)
}

function canonicalSiteUrl(path: string): string {
  const url = tenantUrl(null, path)
  if (url.startsWith('https://') || url.startsWith('http://')) return url
  return `https://albion-guildmanager.com${path.startsWith('/') ? path : `/${path}`}`
}

export function buildDiscordOpenUrl(input: {
  discordGuildId: string
  destination: DiscordQuickStarterDestination
}): string {
  const params = new URLSearchParams({
    guild: input.discordGuildId,
    dest: input.destination,
  })
  return canonicalSiteUrl(`/discord/open?${params.toString()}`)
}

export function buildDiscordQuickStarterComponents(input: {
  discordGuildId: string
  labels: DiscordQuickStarterButtonLabels
}): DiscordMessageComponent[] {
  const buttons = DISCORD_QUICK_STARTER_DESTINATIONS.map((destination) => ({
    type: 2 as const,
    style: 5 as const,
    label: input.labels[destination],
    url: buildDiscordOpenUrl({
      discordGuildId: input.discordGuildId,
      destination,
    }),
  }))

  return [
    { type: 1, components: buttons.slice(0, 4) },
    { type: 1, components: buttons.slice(4, 8) },
  ]
}

export function quickStarterDestinationPath(
  destination: Exclude<DiscordQuickStarterDestination, 'verify' | 'guide'>,
): string {
  switch (destination) {
    case 'events':
      return '/events'
    case 'me':
      return '/me'
    case 'regear':
      return '/regear'
    case 'shop':
      return '/shop'
    case 'wallet':
      return '/me/wallet'
    case 'craft':
      return '/craft/queue'
  }
}
