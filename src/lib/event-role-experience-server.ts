import 'server-only'
import type { getAdminClient } from '@/lib/supabase-admin'
import { log } from '@/lib/log'
import {
  buildRoleExperienceCounts,
  collectRoleExperienceTargets,
  type RoleExperienceCounts,
  type RoleExperiencePartyLike,
  type RoleExperienceRow,
} from './event-role-experience'

type SupabaseAdminClient = ReturnType<typeof getAdminClient>

interface LoadEventRoleExperienceCountsInput {
  db: SupabaseAdminClient
  guildId: string
  currentEventId: string
  parties: readonly RoleExperiencePartyLike[]
}

export async function loadEventRoleExperienceCounts({
  db,
  guildId,
  currentEventId,
  parties,
}: LoadEventRoleExperienceCountsInput): Promise<RoleExperienceCounts> {
  const targets = collectRoleExperienceTargets(parties)
  if (targets.length === 0) return {}

  const discordIds = Array.from(new Set(targets.map((target) => target.discordId)))
  const roleNames = Array.from(new Set(targets.map((target) => target.roleName)))

  try {
    const { data, error } = await db
      .from('slots')
      .select('assigned_discord_id, role_name, parties!inner(event_id)')
      .eq('guild_id', guildId)
      .in('assigned_discord_id', discordIds)
      .in('role_name', roleNames)
      .not('assigned_discord_id', 'is', null)
      .not('role_name', 'is', null)

    if (error) {
      log.error('[event-role-experience] failed to load slot history', error, {
        guildId,
        currentEventId,
      })
      return {}
    }

    return buildRoleExperienceCounts((data ?? []) as RoleExperienceRow[], currentEventId)
  } catch (error: unknown) {
    log.error('[event-role-experience] unexpected slot history failure', error, {
      guildId,
      currentEventId,
    })
    return {}
  }
}
