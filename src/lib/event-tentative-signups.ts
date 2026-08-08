import { getAdminClient } from '@/lib/supabase-admin'
import { SLOT_ROLES, type PartyWithSlots, type SlotRole } from '@/types'

const slotRoleSet: ReadonlySet<string> = new Set(SLOT_ROLES)

export interface TentativeSignupRow {
  id: string
  event_id: string
  discord_id: string
  username: string
  possible_roles: SlotRole[]
  notes: string | null
  recommended_slot_id: string | null
  recommended_by_discord_id: string | null
  recommended_at: string | null
  created_at: string
  updated_at: string
}

export interface TentativeSlotRecommendationOption {
  id: string
  partyNumber: number
  partyName: string | null
  slotNumber: number
  roleName: SlotRole
}

export function buildTentativeSlotRecommendationOptions(
  parties: PartyWithSlots[],
): TentativeSlotRecommendationOption[] {
  const options: TentativeSlotRecommendationOption[] = []
  for (const party of parties) {
    for (const slot of party.slots) {
      if (
        slot.is_hidden ||
        slot.assigned_discord_id ||
        slot.requested_discord_id ||
        !slot.role_name ||
        !slotRoleSet.has(slot.role_name)
      ) {
        continue
      }
      options.push({
        id: slot.id,
        partyNumber: party.party_number,
        partyName: party.is_bomb_squad ? party.name?.trim() || null : null,
        slotNumber: slot.slot_number,
        roleName: slot.role_name as SlotRole,
      })
    }
  }
  return options
}

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
      `id, event_id, discord_id, username, possible_roles, notes, recommended_slot_id, recommended_by_discord_id, recommended_at, ${timestampColumns}`,
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
      recommended_slot_id:
        typeof raw.recommended_slot_id === 'string' ? raw.recommended_slot_id : null,
      recommended_by_discord_id:
        typeof raw.recommended_by_discord_id === 'string'
          ? raw.recommended_by_discord_id
          : null,
      recommended_at:
        typeof raw.recommended_at === 'string' ? raw.recommended_at : null,
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
