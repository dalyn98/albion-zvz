import { getAdminClient } from '@/lib/supabase-admin'
import { SLOT_ROLES, type SlotRole } from '@/types'

export interface TentativeSignupRow {
  id: string
  event_id: string
  discord_id: string
  username: string
  possible_roles: SlotRole[]
  notes: string | null
  created_at: string
  updated_at: string
}

const slotRoleSet: ReadonlySet<string> = new Set(SLOT_ROLES)

export function sanitizeTentativeRoles(input: unknown): SlotRole[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<SlotRole>()
  const out: SlotRole[] = []
  for (const v of input) {
    if (typeof v !== 'string') continue
    if (!slotRoleSet.has(v)) continue
    const role = v as SlotRole
    if (seen.has(role)) continue
    seen.add(role)
    out.push(role)
  }
  return out
}

export async function listTentativeSignupsForGuild(
  eventId: string,
  guildId: string,
): Promise<{ rows: TentativeSignupRow[]; error?: string }> {
  const { data, error } = await getAdminClient()
    .from('event_tentative_signups')
    .select('id, event_id, discord_id, username, possible_roles, notes, created_at, updated_at')
    .eq('guild_id', guildId)
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })
  if (error) return { rows: [], error: error.message }

  const rows = (data ?? []).map((r) => ({
    ...r,
    possible_roles: sanitizeTentativeRoles(r.possible_roles),
  })) as TentativeSignupRow[]
  return { rows }
}
