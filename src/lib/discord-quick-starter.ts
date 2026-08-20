import { tenantUrl } from '@/lib/tenant-resolver'
import {
  MESSAGE_FLAG_IS_COMPONENTS_V2,
  type DiscordChannelMessageComponent,
  type DiscordContainerComponent,
} from '@/lib/discord-interactions'
import { buildDiscordAppLoginCustomId } from '@/lib/discord-app-login'
import { DISCORD_MEMBER_PANEL_CUSTOM_IDS } from '@/lib/discord-member-panel-contract'
import {
  DEFAULT_DISCORD_QUICK_STARTER_BUTTON_LABELS,
  DEFAULT_DISCORD_QUICK_STARTER_PANEL_COLOR,
  DISCORD_QUICK_STARTER_DESTINATIONS,
  type DiscordQuickStarterButtonLabels,
} from '@/lib/discord-quick-starter-config'
import type { DiscordComponentsV2ChannelPayload } from '@/lib/discord'
import type { DiscordQuickStarterDestination } from '@/lib/discord-quick-starter-types'

export {
  DEFAULT_DISCORD_QUICK_STARTER_BUTTON_LABELS,
  DEFAULT_DISCORD_QUICK_STARTER_PANEL_COLOR,
  DEFAULT_DISCORD_QUICK_STARTER_PANEL_DESCRIPTION,
  DEFAULT_DISCORD_QUICK_STARTER_PANEL_FOOTER,
  DEFAULT_DISCORD_QUICK_STARTER_PANEL_MESSAGE,
  DEFAULT_DISCORD_QUICK_STARTER_PANEL_TITLE,
  DISCORD_QUICK_STARTER_DESTINATIONS,
  QUICK_STARTER_PANEL_DESCRIPTION_MAX_LENGTH,
  QUICK_STARTER_PANEL_FOOTER_MAX_LENGTH,
  QUICK_STARTER_PANEL_MESSAGE_MAX_LENGTH,
  QUICK_STARTER_PANEL_TITLE_MAX_LENGTH,
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
  destinations?: readonly DiscordQuickStarterDestination[]
}): DiscordChannelMessageComponent[] {
  const destinations = new Set(
    input.destinations ?? DISCORD_QUICK_STARTER_DESTINATIONS,
  )
  const sections: DiscordContainerComponent['components'] = []

  if (destinations.has('events')) {
    sections.push({
      type: 9,
      components: [{
        type: 10,
        content: `### ${QUICK_STARTER_BUTTON_EMOJI.events} ${input.labels.events}\n${input.labels.eventsDescription}`,
      }],
      accessory: {
        type: 2,
        style: 1,
        label: input.labels.events,
        emoji: { name: QUICK_STARTER_BUTTON_EMOJI.events },
        custom_id: DISCORD_MEMBER_PANEL_CUSTOM_IDS.event,
      },
    })
  }
  if (destinations.has('wallet')) {
    sections.push({
      type: 9,
      components: [{
        type: 10,
        content: `### 💱 ${input.labels.wallet}\n${input.labels.exchangeDescription}`,
      }],
      accessory: {
        type: 2,
        // Entry actions share one visual weight. Green is reserved for the
        // final financial confirmation shown after the member reviews it.
        style: 1,
        label: input.labels.wallet,
        emoji: { name: '💱' },
        custom_id: DISCORD_MEMBER_PANEL_CUSTOM_IDS.exchange,
      },
    })
  }
  if (destinations.has('regear')) {
    sections.push({
      type: 9,
      components: [{
        type: 10,
        content: `### ${QUICK_STARTER_BUTTON_EMOJI.regear} ${input.labels.regear}\n${input.labels.regearDescription}`,
      }],
      accessory: {
        type: 2,
        style: 1,
        label: input.labels.regear,
        emoji: { name: QUICK_STARTER_BUTTON_EMOJI.regear },
        custom_id: DISCORD_MEMBER_PANEL_CUSTOM_IDS.regear,
      },
    })
  }

  sections.push(
    { type: 14, divider: true, spacing: 1 },
    {
      type: 1,
      components: [{
        type: 2,
        style: 2,
        label: input.labels.login,
        emoji: { name: '🔐' },
        custom_id: buildDiscordAppLoginCustomId('me'),
      }],
    },
  )

  return [{
    type: 17,
    components: sections,
  }]
}

export function formatDiscordQuickStarterPanelMessage(input: {
  template: string
  tenantName: string
}): string {
  return input.template.replace(/\{name\}/g, input.tenantName)
}

function discordColorFromHex(value: string): number {
  const normalized = value.startsWith('#') ? value.slice(1) : value
  return Number.parseInt(normalized, 16)
}

export function buildDiscordQuickStarterMessagePayload(input: {
  discordGuildId: string
  tenantName: string
  titleTemplate: string
  descriptionTemplate: string
  color?: string
  footerTemplate?: string
  labels?: DiscordQuickStarterButtonLabels
  destinations?: readonly DiscordQuickStarterDestination[]
}): DiscordComponentsV2ChannelPayload {
  const title = formatDiscordQuickStarterPanelMessage({
    template: input.titleTemplate,
    tenantName: input.tenantName,
  })
  const description = formatDiscordQuickStarterPanelMessage({
    template: input.descriptionTemplate,
    tenantName: input.tenantName,
  })
  const footer = formatDiscordQuickStarterPanelMessage({
    template: input.footerTemplate ?? '',
    tenantName: input.tenantName,
  }).trim()
  const components = buildDiscordQuickStarterComponents({
    discordGuildId: input.discordGuildId,
    labels: input.labels ?? DEFAULT_DISCORD_QUICK_STARTER_BUTTON_LABELS,
    destinations: input.destinations,
  })
  const container = components[0]
  if (container?.type !== 17) throw new Error('Discord member panel container missing')
  container.accent_color = discordColorFromHex(
    input.color ?? DEFAULT_DISCORD_QUICK_STARTER_PANEL_COLOR,
  )
  container.components.unshift(
    { type: 10, content: `## ${title}` },
    { type: 10, content: description },
    { type: 14, divider: true, spacing: 1 },
  )
  if (footer) {
    container.components.push({ type: 10, content: `-# ${footer}` })
  }

  return {
    content: null,
    embeds: [],
    flags: MESSAGE_FLAG_IS_COMPONENTS_V2,
    allowed_mentions: { parse: [] },
    components,
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
