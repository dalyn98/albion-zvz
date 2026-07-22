import 'server-only'

import { getAdminClient } from '@/lib/supabase-admin'
import { resolveUserCapabilities } from '@/lib/permissions'
import type { DiscordInteractionPayload } from '@/lib/discord-interactions'

const DISCORD_ID_PATTERN = /^\d{5,30}$/

export interface DiscordCommandTenant {
  id: string
  slug: string
  name: string
  createdByDiscordId: string | null
  adminRoleIds: string[]
}

export interface DiscordCommandActor {
  guildId: string
  discordGuildId: string
  discordId: string
  username: string
  roleIds: string[]
  isMember: boolean
  isAdmin: boolean
  capabilities: bigint
}

export type DiscordCommandActorResult =
  | { ok: true; actor: DiscordCommandActor }
  | { ok: false; error: 'not_in_guild' | 'not_member' }

export async function resolveDiscordCommandActor(input: {
  tenant: DiscordCommandTenant
  payload: DiscordInteractionPayload
  requireMember?: boolean
}): Promise<DiscordCommandActorResult> {
  const discordGuildId = input.payload.guild_id
  const discordId = input.payload.member?.user?.id ?? input.payload.user?.id ?? null
  if (
    !discordGuildId ||
    !discordId ||
    !DISCORD_ID_PATTERN.test(discordGuildId) ||
    !DISCORD_ID_PATTERN.test(discordId)
  ) {
    return { ok: false, error: 'not_in_guild' }
  }

  const db = getAdminClient()
  const { data: memberRow, error: memberError } = await db
    .from('guild_avatars')
    .select('username, withdrawn_at')
    .eq('guild_id', input.tenant.id)
    .eq('discord_id', discordId)
    .maybeSingle()
  if (memberError) throw new Error(memberError.message)

  const roleIds = (input.payload.member?.roles ?? []).filter((roleId) =>
    DISCORD_ID_PATTERN.test(roleId)
  )
  const isOwner = input.tenant.createdByDiscordId === discordId
  const hasAdminRole = input.tenant.adminRoleIds.some((roleId) => roleIds.includes(roleId))
  const { data: overrideRow } = await db
    .from('tenant_admin_overrides')
    .select('discord_id')
    .eq('tenant_id', input.tenant.id)
    .eq('discord_id', discordId)
    .maybeSingle()
  const isAdmin = isOwner || hasAdminRole || !!overrideRow
  const isMember = !!memberRow && !memberRow.withdrawn_at
  if (input.requireMember && !isMember) {
    return { ok: false, error: 'not_member' }
  }

  const capabilities = await resolveUserCapabilities(db, {
    guildId: input.tenant.id,
    discordId,
    discordRoleIds: roleIds,
    isLegacyAdmin: isAdmin,
  })

  return {
    ok: true,
    actor: {
      guildId: input.tenant.id,
      discordGuildId,
      discordId,
      username:
        (memberRow?.username as string | null)?.trim() ||
        input.payload.member?.nick?.trim() ||
        input.payload.member?.user?.global_name?.trim() ||
        input.payload.member?.user?.username?.trim() ||
        input.payload.user?.global_name?.trim() ||
        input.payload.user?.username?.trim() ||
        `<@${discordId}>`,
      roleIds,
      isMember,
      isAdmin,
      capabilities,
    },
  }
}
