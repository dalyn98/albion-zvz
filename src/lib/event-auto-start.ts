import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { log } from '@/lib/log'
import { startEventWithEffectiveRegearPolicies } from '@/lib/regear-effective-policy-server'

type DbClient = SupabaseClient

export interface DueEventStartRow {
  id: string
  guild_id: string
  gather_at: string
}

export interface EventAutoStartFailure {
  event_id: string
  guild_id: string
  error: string
}

export interface EventAutoStartResult {
  scanned: number
  started: Array<{ event_id: string; guild_id: string; battle_started_at: string }>
  failures: EventAutoStartFailure[]
}

type StartEvent = typeof startEventWithEffectiveRegearPolicies

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500)
}

async function alreadyStartedAt(
  db: DbClient,
  row: DueEventStartRow,
): Promise<string | null> {
  const { data, error } = await db
    .from('events')
    .select('battle_started_at')
    .eq('guild_id', row.guild_id)
    .eq('id', row.id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return typeof data?.battle_started_at === 'string' ? data.battle_started_at : null
}

export async function executeDueEventStarts(
  db: DbClient,
  rows: readonly DueEventStartRow[],
  startEvent: StartEvent = startEventWithEffectiveRegearPolicies,
): Promise<EventAutoStartResult> {
  const result: EventAutoStartResult = {
    scanned: rows.length,
    started: [],
    failures: [],
  }

  for (const row of rows) {
    try {
      await startEvent({
        db,
        guildId: row.guild_id,
        eventId: row.id,
        startedAt: row.gather_at,
      })
      result.started.push({
        event_id: row.id,
        guild_id: row.guild_id,
        battle_started_at: row.gather_at,
      })
      log.info('[event-auto-start] started event', {
        tenant_id: row.guild_id,
        event_id: row.id,
        gather_at: row.gather_at,
      })
    } catch (error) {
      // A cron tick and a just-in-time member request can race. Treat the
      // winner's committed start as success instead of surfacing a false
      // operational failure.
      if (errorMessage(error).includes('event_already_started')) {
        try {
          const startedAt = await alreadyStartedAt(db, row)
          if (startedAt) {
            result.started.push({
              event_id: row.id,
              guild_id: row.guild_id,
              battle_started_at: startedAt,
            })
            continue
          }
        } catch (readError) {
          log.error('[event-auto-start] race verification failed', readError, {
            tenant_id: row.guild_id,
            event_id: row.id,
          })
        }
      }

      const message = errorMessage(error)
      result.failures.push({
        event_id: row.id,
        guild_id: row.guild_id,
        error: message,
      })
      log.error('[event-auto-start] failed to start event', error, {
        tenant_id: row.guild_id,
        event_id: row.id,
      })
    }
  }

  return result
}

export async function startDuePublishedEvents(input: {
  db: DbClient
  now?: Date
  guildId?: string
  eventIds?: readonly string[]
}): Promise<EventAutoStartResult> {
  if (input.eventIds?.length === 0) {
    return { scanned: 0, started: [], failures: [] }
  }

  const now = input.now ?? new Date()
  let query = input.db
    .from('events')
    .select('id, guild_id, gather_at, tenants!inner(status)')
    .eq('tenants.status', 'active')
    .is('battle_started_at', null)
    .not('published_at', 'is', null)
    .not('gather_at', 'is', null)
    .eq('status', 'published')
    .lte('gather_at', now.toISOString())
    .order('gather_at', { ascending: true })
    .limit(1_000)

  if (input.guildId) query = query.eq('guild_id', input.guildId)
  if (input.eventIds) query = query.in('id', [...input.eventIds])

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const rows = (data ?? []).map((row) => ({
    id: row.id as string,
    guild_id: row.guild_id as string,
    gather_at: row.gather_at as string,
  }))
  return executeDueEventStarts(input.db, rows)
}
