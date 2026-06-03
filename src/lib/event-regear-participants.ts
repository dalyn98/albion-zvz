import { getAdminClient } from '@/lib/supabase-admin'
import { SLOT_ROLES, type SlotRole } from '@/types'

export interface EventRegearParticipantRow {
  id: string
  event_id: string
  discord_id: string
  username: string
  role_name: SlotRole
  added_by: string | null
  added_by_username: string | null
  created_at: string
  updated_at: string
}

export function sanitizeEventRegearParticipantRole(value: unknown): SlotRole | null {
  return typeof value === 'string' && SLOT_ROLES.includes(value as SlotRole)
    ? (value as SlotRole)
    : null
}

export async function listEventRegearParticipantsForGuild(
  eventId: string,
  guildId: string,
): Promise<{ rows: EventRegearParticipantRow[]; error?: string }> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('event_regear_participants')
    .select('id, event_id, discord_id, username, role_name, added_by, added_by_username, created_at, updated_at')
    .eq('guild_id', guildId)
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })

  if (error) return { rows: [], error: error.message }

  const rows: EventRegearParticipantRow[] = (data ?? [])
    .map((row) => {
      const role = sanitizeEventRegearParticipantRole(row.role_name)
      if (!role) return null
      return {
        id: row.id,
        event_id: row.event_id,
        discord_id: row.discord_id,
        username: row.username,
        role_name: role,
        added_by: row.added_by ?? null,
        added_by_username: row.added_by_username ?? null,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }
    })
    .filter((row): row is EventRegearParticipantRow => row !== null)

  return { rows }
}
