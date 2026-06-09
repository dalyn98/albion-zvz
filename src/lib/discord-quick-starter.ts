import { tenantUrl } from '@/lib/tenant-resolver'
import type { DiscordMessageComponent } from '@/lib/discord-interactions'
import {
  DEFAULT_DISCORD_QUICK_STARTER_BUTTON_LABELS,
  DISCORD_QUICK_STARTER_DESTINATIONS,
  type DiscordQuickStarterButtonLabels,
} from '@/lib/discord-quick-starter-config'
import type { DiscordQuickStarterDestination } from '@/lib/discord-quick-starter-types'

export {
  DEFAULT_DISCORD_QUICK_STARTER_BUTTON_LABELS,
  DEFAULT_DISCORD_QUICK_STARTER_PANEL_MESSAGE,
  DISCORD_QUICK_STARTER_DESTINATIONS,
  QUICK_STARTER_PANEL_MESSAGE_MAX_LENGTH,
  type DiscordQuickStarterButtonLabels,
} from '@/lib/discord-quick-starter-config'
export type { DiscordQuickStarterDestination } from '@/lib/discord-quick-starter-types'

const DESTINATION_SET: ReadonlySet<string> = new Set(DISCORD_QUICK_STARTER_DESTINATIONS)
const QUICK_STARTER_BUTTON_EMOJI: Record<DiscordQuickStarterDestination, string> = {
  verify: '✅',
  events: '📅',
  me: '👤',
  guide: '📘',
  regear: '🛡️',
  shop: '🛒',
  wallet: '💰',
  craft: '🔨',
}

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
    emoji: { name: QUICK_STARTER_BUTTON_EMOJI[destination] },
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

export function formatDiscordQuickStarterPanelMessage(input: {
  template: string
  tenantName: string
}): string {
  return input.template.replace(/\{name\}/g, input.tenantName)
}

export function buildDiscordQuickStarterMessagePayload(input: {
  discordGuildId: string
  tenantName: string
  messageTemplate: string
}): {
  content: string
  allowed_mentions: { parse: [] }
  components: DiscordMessageComponent[]
} {
  return {
    content: formatDiscordQuickStarterPanelMessage({
      template: input.messageTemplate,
      tenantName: input.tenantName,
    }),
    allowed_mentions: { parse: [] },
    components: buildDiscordQuickStarterComponents({
      discordGuildId: input.discordGuildId,
      labels: DEFAULT_DISCORD_QUICK_STARTER_BUTTON_LABELS,
    }),
  }
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
