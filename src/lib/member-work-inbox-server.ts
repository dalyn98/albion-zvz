import 'server-only'

import type { getAdminClient } from '@/lib/supabase-admin'
import {
  buildMemberWorkInboxSnapshot,
  createEmptyMemberWorkInboxSnapshot,
  type MemberWorkInboxSnapshot,
} from '@/lib/member-work-inbox'

type AdminDbClient = ReturnType<typeof getAdminClient>

export async function loadMemberWorkInboxSnapshot(
  db: AdminDbClient,
  guildId: string,
  discordId: string,
  options: {
    includeHistory?: boolean
    historyLimit?: number
  } = {},
): Promise<MemberWorkInboxSnapshot> {
  const historyLimit = Math.max(0, Math.min(Math.trunc(options.historyLimit ?? 50), 200))
  const { data, error } = await db.rpc('member_work_inbox_snapshot', {
    p_guild_id: guildId,
    p_discord_id: discordId,
    p_include_history: options.includeHistory !== false,
    p_history_limit: historyLimit,
  })

  if (error || !Array.isArray(data)) {
    return createEmptyMemberWorkInboxSnapshot(false)
  }
  return buildMemberWorkInboxSnapshot(data)
}
