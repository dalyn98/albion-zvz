import type { getAdminClient } from '@/lib/supabase-admin'
import type { AppSettingKey } from '@/lib/app-settings'

type SupabaseAdminClient = ReturnType<typeof getAdminClient>

export const IDLE_KILLBOARD_SYNC_INTERVAL_MS = 60 * 60 * 1000
export const IDLE_BATTLE_TRACKER_INTERVAL_MS = 15 * 60 * 1000
export const CRON_EVENT_ACTIVITY_LOOKBACK_MS = 6 * 60 * 60 * 1000
export const CRON_EVENT_ACTIVITY_LOOKAHEAD_MS = 2 * 60 * 60 * 1000

export interface CronRunDecision {
  run: boolean
  reason: 'forced' | 'activity-window' | 'no-previous-run' | 'idle-interval-elapsed' | 'idle-throttle'
  ageMs: number | null
}

interface ShouldRunIdleCronInput {
  force: boolean
  hasActivity: boolean
  lastRunAt: string | null | undefined
  nowMs: number
  idleIntervalMs: number
}

interface AppSettingRow {
  guild_id: string | null
  key: string | null
  value: string | null
}

interface EventGuildRow {
  guild_id: string | null
}

function parseIsoMs(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

export function shouldRunIdleCron(input: ShouldRunIdleCronInput): CronRunDecision {
  if (input.force) return { run: true, reason: 'forced', ageMs: null }
  if (input.hasActivity) return { run: true, reason: 'activity-window', ageMs: null }

  const lastRunMs = parseIsoMs(input.lastRunAt)
  if (lastRunMs === null) return { run: true, reason: 'no-previous-run', ageMs: null }

  const ageMs = Math.max(0, input.nowMs - lastRunMs)
  if (ageMs >= input.idleIntervalMs) {
    return { run: true, reason: 'idle-interval-elapsed', ageMs }
  }

  return { run: false, reason: 'idle-throttle', ageMs }
}

export async function loadTenantCronSettings(
  db: SupabaseAdminClient,
  tenantIds: readonly string[],
  keys: readonly AppSettingKey[],
): Promise<Map<string, Map<string, string>>> {
  if (tenantIds.length === 0 || keys.length === 0) return new Map()

  const { data, error } = await db
    .from('app_settings')
    .select('guild_id, key, value')
    .in('guild_id', tenantIds)
    .in('key', keys)

  if (error) {
    throw new Error(`cron settings select: ${error.message}`)
  }

  const byTenant = new Map<string, Map<string, string>>()
  for (const row of (data ?? []) as AppSettingRow[]) {
    if (!row.guild_id || !row.key || typeof row.value !== 'string') continue
    const settings = byTenant.get(row.guild_id) ?? new Map<string, string>()
    settings.set(row.key, row.value)
    byTenant.set(row.guild_id, settings)
  }
  return byTenant
}

export async function loadEventActivityByTenant(
  db: SupabaseAdminClient,
  tenantIds: readonly string[],
  nowMs = Date.now(),
): Promise<Set<string>> {
  if (tenantIds.length === 0) return new Set()

  const floorIso = new Date(nowMs - CRON_EVENT_ACTIVITY_LOOKBACK_MS).toISOString()
  const ceilingIso = new Date(nowMs + CRON_EVENT_ACTIVITY_LOOKAHEAD_MS).toISOString()

  const [started, scheduled] = await Promise.all([
    db
      .from('events')
      .select('guild_id')
      .in('guild_id', tenantIds)
      .eq('status', 'published')
      .not('battle_started_at', 'is', null)
      .gte('battle_started_at', floorIso),
    db
      .from('events')
      .select('guild_id')
      .in('guild_id', tenantIds)
      .eq('status', 'published')
      .is('battle_started_at', null)
      .not('gather_at', 'is', null)
      .gte('gather_at', floorIso)
      .lte('gather_at', ceilingIso),
  ])

  if (started.error) {
    throw new Error(`started event activity select: ${started.error.message}`)
  }
  if (scheduled.error) {
    throw new Error(`scheduled event activity select: ${scheduled.error.message}`)
  }

  const active = new Set<string>()
  for (const row of [...((started.data ?? []) as EventGuildRow[]), ...((scheduled.data ?? []) as EventGuildRow[])]) {
    if (row.guild_id) active.add(row.guild_id)
  }
  return active
}
