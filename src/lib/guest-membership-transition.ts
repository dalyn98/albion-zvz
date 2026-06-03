import { log } from '@/lib/log'
import type { getAdminClient } from '@/lib/supabase-admin'

type SupabaseAdminClient = ReturnType<typeof getAdminClient>

export async function removeGuestRecordForMember(
  db: SupabaseAdminClient,
  input: {
    guildId: string
    discordId: string
    source: string
  },
): Promise<{ ok: boolean }> {
  const { error } = await db
    .from('guests')
    .delete()
    .eq('guild_id', input.guildId)
    .eq('discord_id', input.discordId)

  if (error) {
    log.warn('[guest-membership-transition] cleanup failed', {
      guild_id: input.guildId,
      discord_id: input.discordId,
      source: input.source,
      error: error.message,
    })
    return { ok: false }
  }

  return { ok: true }
}
