import 'server-only'

import { unstable_cache } from 'next/cache'
import { getAdminClient } from '@/lib/supabase-admin'
import { log } from '@/lib/log'
import { SupabaseQueryError } from '@/lib/supabase-query-error'
import { parseEventStateSnapshot, type EventStateSnapshot } from '@/lib/event-state-snapshot'
import { PARTY_WITH_SLOTS_SELECT } from '@/lib/event-query-selects'
import type { Event, PartyWithSlots } from '@/types'

const EVENT_RENDER_SNAPSHOT_REVALIDATE_SECONDS = 300

interface EventRenderSnapshotIdentity {
  guildId: string
  eventId: string
  stateRevision: string
}

export interface EventRenderSnapshot {
  event: Event & { state_revision: number | string }
  parties: PartyWithSlots[]
}

export function eventRenderSnapshotCacheKey(
  input: EventRenderSnapshotIdentity,
): readonly [string, string, string, string] {
  return [
    'event-render-snapshot',
    input.guildId,
    input.eventId,
    input.stateRevision,
  ]
}

export function isEventRenderSnapshotCacheDisabled(value: string | undefined): boolean {
  return value === 'true'
}

export async function loadEventRenderRevision(input: {
  guildId: string
  eventId: string
}): Promise<EventStateSnapshot | null> {
  const db = getAdminClient()
  const { data, error } = await db.rpc('get_event_state_snapshot', {
    p_guild_id: input.guildId,
    p_event_id: input.eventId,
  })
  if (error) {
    log.error('[event-render-snapshot] revision lookup failed', error, {
      tenant_id: input.guildId,
      event_id: input.eventId,
    })
    throw new SupabaseQueryError('Event render revision lookup failed', error)
  }
  return parseEventStateSnapshot(data)
}

async function loadEventRenderSnapshotUncached(
  input: EventRenderSnapshotIdentity,
): Promise<EventRenderSnapshot | null> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('events')
    .select(
      `id, title, gather_time, gather_at, gather_location, special_notes, battle_started_at, operational_ended_at, operational_cancelled_at, operational_cancelled_by, created_by, status, category, recruitment_mode, regear_policy, guest_regear_enabled, regear_policy_version_id, regear_policy_snapshotted_at, tentative_snapshot_version_id, tentative_snapshotted_at, state_revision, parties(${PARTY_WITH_SLOTS_SELECT})`,
    )
    .eq('guild_id', input.guildId)
    .eq('id', input.eventId)
    .eq('parties.guild_id', input.guildId)
    .eq('parties.slots.guild_id', input.guildId)
    .maybeSingle()

  if (error) {
    log.error('[event-render-snapshot] event lookup failed', error, {
      tenant_id: input.guildId,
      event_id: input.eventId,
      state_revision: input.stateRevision,
    })
    throw new SupabaseQueryError('Event render snapshot lookup failed', error)
  }

  const row = data as (Event & {
    state_revision: number | string
    parties: PartyWithSlots[] | null
  }) | null
  if (!row || row.status === 'draft') return null

  const { parties: embeddedParties, ...event } = row
  const parties = (embeddedParties ?? [])
    .map((party) => ({
      ...party,
      slots: [...(party.slots ?? [])]
        .filter((slot) => !slot.is_hidden)
        .sort((left, right) => left.slot_number - right.slot_number),
    }))
    .sort((left, right) => left.party_number - right.party_number) as PartyWithSlots[]

  return { event, parties }
}

export async function loadEventRenderSnapshot(
  input: EventRenderSnapshotIdentity,
): Promise<EventRenderSnapshot | null> {
  if (isEventRenderSnapshotCacheDisabled(
    process.env.AGM_EVENT_RENDER_SNAPSHOT_CACHE_DISABLED,
  )) {
    return loadEventRenderSnapshotUncached(input)
  }

  const load = unstable_cache(
    () => loadEventRenderSnapshotUncached(input),
    [...eventRenderSnapshotCacheKey(input)],
    { revalidate: EVENT_RENDER_SNAPSHOT_REVALIDATE_SECONDS },
  )
  return load()
}
