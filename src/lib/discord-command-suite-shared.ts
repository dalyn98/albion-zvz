import type {
  DiscordInteractionOption,
  DiscordInteractionPayload,
  DiscordMessageComponent,
} from '@/lib/discord-interactions'
import type { DiscordCommandTenant } from '@/lib/discord-command-auth'
import { createDiscordAppLoginLink } from '@/lib/discord-app-login'

const DISCORD_OPTION_TYPE_SUBCOMMAND = 1
const DISCORD_OPTION_TYPE_SUBCOMMAND_GROUP = 2
const DISCORD_OPTION_TYPE_STRING = 3
const DISCORD_OPTION_TYPE_INTEGER = 4
const DISCORD_OPTION_TYPE_USER = 6

export const MAX_DISCORD_COMMAND_MEMO_LENGTH = 200
export const DISCORD_COMMAND_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const AGM_COMMAND_PATHS = [
  'setup',
  'help',
  'me.summary',
  'me.verify',
  'event.next',
  'event.browse',
  'event.status',
  'event.cancel',
  'wallet.balance',
  'wallet.send',
  'wallet.withdraw',
  'wallet.history',
  'stats.me',
  'stats.member',
  'stats.leaderboard',
  'stats.battle',
  'regear.eligible',
  'regear.status',
  'craft.queue',
  'craft.mine',
  'craft.claim',
  'craft.release',
  'craft.deliver',
  'craft.pickup',
  'siphon.balance',
  'siphon.history',
  'shop.status',
  'shop.order',
  'shop.reorder',
  'admin.approvals',
  'admin.event-create',
  'admin.event-start',
  'admin.points',
  'admin.quick-publish',
  'admin.dashboard',
] as const

export type AgmCommandPath = (typeof AGM_COMMAND_PATHS)[number]

const AGM_COMMAND_PATH_SET = new Set<string>(AGM_COMMAND_PATHS)

// Discord global command updates are eventually consistent. Retired nodes stay
// accepted server-side during propagation, but are intentionally absent from
// the published catalog so new clients only see the canonical tree.
const LEGACY_DIRECT_PATHS: Readonly<Record<string, AgmCommandPath>> = {
  quick: 'help',
  guide: 'help',
}

const LEGACY_OPEN_PATHS: Readonly<Record<string, AgmCommandPath>> = {
  home: 'me.summary',
  events: 'event.next',
  regear: 'regear.eligible',
  shop: 'shop.status',
  craft: 'craft.queue',
}

const LEGACY_GROUP_PATHS: Readonly<Record<string, AgmCommandPath>> = {
  'me.profile': 'me.summary',
  'wallet.open': 'wallet.balance',
  'admin.killbot': 'admin.dashboard',
}

export interface ParsedDiscordAgmCommand {
  path: AgmCommandPath | null
  options: DiscordInteractionOption[]
}

export function parseDiscordAgmCommand(
  payload: DiscordInteractionPayload,
): ParsedDiscordAgmCommand {
  const first = payload.data?.options?.[0]
  if (!first) return { path: null, options: [] }

  if (first.type === DISCORD_OPTION_TYPE_SUBCOMMAND) {
    if (AGM_COMMAND_PATH_SET.has(first.name)) {
      return { path: first.name as AgmCommandPath, options: first.options ?? [] }
    }
    if (first.name === 'open') {
      const page = stringOption(first.options ?? [], 'page')
      return page && LEGACY_OPEN_PATHS[page]
        ? { path: LEGACY_OPEN_PATHS[page], options: [] }
        : { path: null, options: [] }
    }
    return LEGACY_DIRECT_PATHS[first.name]
      ? { path: LEGACY_DIRECT_PATHS[first.name], options: first.options ?? [] }
      : { path: null, options: [] }
  }

  if (first.type !== DISCORD_OPTION_TYPE_SUBCOMMAND_GROUP) {
    return { path: null, options: [] }
  }
  const second = first.options?.find((option) => option.type === DISCORD_OPTION_TYPE_SUBCOMMAND)
  if (!second) return { path: null, options: [] }
  const path = `${first.name}.${second.name}`
  if (AGM_COMMAND_PATH_SET.has(path)) {
    return { path: path as AgmCommandPath, options: second.options ?? [] }
  }
  return LEGACY_GROUP_PATHS[path]
    ? { path: LEGACY_GROUP_PATHS[path], options: second.options ?? [] }
    : { path: null, options: [] }
}

function option(
  options: readonly DiscordInteractionOption[],
  name: string,
): DiscordInteractionOption | null {
  return options.find((item) => item.name === name) ?? null
}

export function stringOption(
  options: readonly DiscordInteractionOption[],
  name: string,
): string | null {
  const found = option(options, name)
  if (found?.type !== DISCORD_OPTION_TYPE_STRING || typeof found.value !== 'string') return null
  const value = found.value.trim()
  return value || null
}

export function integerOption(
  options: readonly DiscordInteractionOption[],
  name: string,
): number | null {
  const found = option(options, name)
  return found?.type === DISCORD_OPTION_TYPE_INTEGER &&
    typeof found.value === 'number' &&
    Number.isInteger(found.value)
    ? found.value
    : null
}

export function userOption(
  options: readonly DiscordInteractionOption[],
  name: string,
): string | null {
  const found = option(options, name)
  return found?.type === DISCORD_OPTION_TYPE_USER && typeof found.value === 'string'
    ? found.value
    : null
}

export function formatNumber(value: number): string {
  return value.toLocaleString('en-US')
}

export function formatDiscordTimestamp(value: string | null | undefined): string {
  if (!value) return '-'
  const millis = Date.parse(value)
  return Number.isFinite(millis) ? `<t:${Math.floor(millis / 1000)}:F>` : value
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`
}

export function autocompleteLabel(value: string): string {
  return truncate(value.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim(), 100)
}

export async function createDiscordCommandWebLink(
  tenant: DiscordCommandTenant,
  discordId: string,
  path: string,
): Promise<string> {
  return createDiscordAppLoginLink({
    guildId: tenant.id,
    tenantSlug: tenant.slug,
    discordId,
    returnTo: path,
  })
}

export async function webButton(
  tenant: DiscordCommandTenant,
  discordId: string,
  path: string,
  label: string,
): Promise<DiscordMessageComponent[]> {
  const url = await createDiscordCommandWebLink(tenant, discordId, path)
  return [{
    type: 1,
    components: [{ type: 2, style: 5, label, url }],
  }]
}
