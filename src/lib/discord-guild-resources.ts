import 'server-only'

import { unstable_cache } from 'next/cache'

const DISCORD_API = 'https://discord.com/api/v10'
const DISCORD_GUILD_RESOURCE_REVALIDATE_SECONDS = 5 * 60

export interface RawDiscordRole {
  id: string
  name: string
  color: number
  position: number
  managed?: boolean
  permissions?: string
}

export interface RawDiscordChannel {
  id: string
  name: string
  type: number
  position: number
  parent_id: string | null
}

export class DiscordGuildResourceError extends Error {
  constructor(
    readonly resource: 'roles' | 'channels',
    readonly discordGuildId: string,
    readonly status?: number,
    readonly response?: string,
  ) {
    super(`Discord guild ${resource} request failed`)
    this.name = 'DiscordGuildResourceError'
  }
}

export function isDiscordGuildResourceError(
  error: unknown,
): error is DiscordGuildResourceError {
  return error instanceof DiscordGuildResourceError
}

async function fetchGuildResource<T>(
  discordGuildId: string,
  resource: 'roles' | 'channels',
): Promise<T[]> {
  const botToken = process.env.DISCORD_BOT_TOKEN
  if (!botToken) {
    throw new DiscordGuildResourceError(resource, discordGuildId)
  }

  const res = await fetch(`${DISCORD_API}/guilds/${discordGuildId}/${resource}`, {
    headers: { Authorization: `Bot ${botToken}` },
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new DiscordGuildResourceError(resource, discordGuildId, res.status, text)
  }

  return (await res.json()) as T[]
}

export const fetchDiscordGuildRoles = unstable_cache(
  async (discordGuildId: string): Promise<RawDiscordRole[]> => {
    return fetchGuildResource<RawDiscordRole>(discordGuildId, 'roles')
  },
  ['discord-guild-roles-v1'],
  { revalidate: DISCORD_GUILD_RESOURCE_REVALIDATE_SECONDS },
)

export const fetchDiscordGuildChannels = unstable_cache(
  async (discordGuildId: string): Promise<RawDiscordChannel[]> => {
    return fetchGuildResource<RawDiscordChannel>(discordGuildId, 'channels')
  },
  ['discord-guild-channels-v1'],
  { revalidate: DISCORD_GUILD_RESOURCE_REVALIDATE_SECONDS },
)
