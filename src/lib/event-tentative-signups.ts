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
  const db = getAdminClient()
  const { data: event, error: eventError } = await db
    .from('events')
    .select('tentative_snapshot_version_id, tentative_snapshotted_at')
    .eq('guild_id', guildId)
    .eq('id', eventId)
    .maybeSingle()
  if (eventError) return { rows: [], error: eventError.message }
  if (!event) return { rows: [] }

  const snapshotVersionId = event.tentative_snapshot_version_id as string | null
  const sourceTable = snapshotVersionId
    ? 'event_tentative_signup_snapshots'
    : 'event_tentative_signups'
  const timestampColumns = snapshotVersionId
    ? 'source_created_at, source_updated_at'
    : 'created_at, updated_at'
  const { data, error } = await db
    .from(sourceTable)
    .select(
      `id, event_id, discord_id, username, possible_roles, notes, ${timestampColumns}`,
    )
    .eq('guild_id', guildId)
    .eq('event_id', eventId)
    .order(snapshotVersionId ? 'source_created_at' : 'created_at', {
      ascending: true,
    })
  if (error) return { rows: [], error: error.message }

  const rows = (data ?? []).map((r) => {
    const raw = r as Record<string, unknown>
    return {
      id: String(raw.id),
      event_id: String(raw.event_id),
      discord_id: String(raw.discord_id),
      username: String(raw.username),
      possible_roles: sanitizeTentativeRoles(raw.possible_roles),
      notes: typeof raw.notes === 'string' ? raw.notes : null,
      created_at: String(
        snapshotVersionId ? raw.source_created_at : raw.created_at,
      ),
      updated_at: String(
        snapshotVersionId ? raw.source_updated_at : raw.updated_at,
      ),
    }
  })
  return { rows }
}
