import { changeGuildMemberNickname } from '@/lib/discord'
import { log } from '@/lib/log'
import { getTenantDiscordConfig } from '@/lib/tenant'

export type DiscordNicknameSyncSource =
  | 'member_onboarding'
  | 'member_refresh'
  | 'admin_approve'

export type DiscordNicknameSyncResult =
  | { status: 'synced' }
  | { status: 'skipped'; reason: 'empty_nickname' | 'missing_tenant_config' }
  | { status: 'failed'; error: string }

export async function syncDiscordGuildNickname(input: {
  guildId: string
  discordId: string
  nickname: string
  source: DiscordNicknameSyncSource
}): Promise<DiscordNicknameSyncResult> {
  const nickname = input.nickname.trim()
  if (!nickname) return { status: 'skipped', reason: 'empty_nickname' }

  const tenantConfig = await getTenantDiscordConfig(input.guildId)
  if (!tenantConfig) return { status: 'skipped', reason: 'missing_tenant_config' }

  try {
    await changeGuildMemberNickname(tenantConfig.discordGuildId, input.discordId, nickname)
    return { status: 'synced' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.warn('[discord-nickname-sync] failed', {
      source: input.source,
      tenant_id: input.guildId,
      discord_id: input.discordId,
      nickname,
      error: message,
    })
    return { status: 'failed', error: message }
  }
}
