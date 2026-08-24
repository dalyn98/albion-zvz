import 'server-only'

import type { getAdminClient } from '@/lib/supabase-admin'

type SupabaseAdminClient = ReturnType<typeof getAdminClient>

const CRON_RUN_RETENTION_DAYS = 30
const CRON_RUN_PRUNE_LIMIT = 5_000
const DELETE_CHUNK_SIZE = 200

export interface CronRunPruneResult {
  deleted: number
  cutoff: string
  remainingBatch: boolean
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size))
  }
  return result
}

export async function expireMemberTradeOrders(
  db: SupabaseAdminClient,
): Promise<unknown> {
  const { data, error } = await db.rpc('expire_member_trade_orders')
  if (error) throw new Error(error.message)
  return data ?? null
}

export async function expireStaleCronRuns(
  db: SupabaseAdminClient,
): Promise<{ expired: number }> {
  const { data, error } = await db.rpc('expire_stale_cron_runs')
  if (error) throw new Error(error.message)
  return { expired: typeof data === 'number' ? data : Number(data ?? 0) }
}

export async function pruneCronRunHistory(
  db: SupabaseAdminClient,
  now = new Date(),
): Promise<CronRunPruneResult> {
  const cutoff = new Date(
    now.getTime() - CRON_RUN_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()
  const { data, error } = await db
    .from('cron_runs')
    .select('id')
    .neq('status', 'running')
    .lt('started_at', cutoff)
    .order('started_at', { ascending: true })
    .limit(CRON_RUN_PRUNE_LIMIT)
  if (error) throw new Error(error.message)

  const ids = (data ?? []).map((row) => row.id as string)
  let deleted = 0
  for (const batch of chunks(ids, DELETE_CHUNK_SIZE)) {
    const { data: removed, error: deleteError } = await db
      .from('cron_runs')
      .delete()
      .in('id', batch)
      .select('id')
    if (deleteError) throw new Error(deleteError.message)
    deleted += removed?.length ?? 0
  }

  return {
    deleted,
    cutoff,
    remainingBatch: ids.length === CRON_RUN_PRUNE_LIMIT,
  }
}
