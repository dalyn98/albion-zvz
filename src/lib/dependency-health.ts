import 'server-only'
import { getAdminClient } from '@/lib/supabase-admin'
import {
  getSupabaseErrorCode,
  publicSupabaseFailureMessage,
} from '@/lib/supabase-query-error'

const DEFAULT_TIMEOUT_MS = 8000
const RECENT_CRON_LIMIT = 8

export type DependencyStatus = 'ok' | 'degraded' | 'down'

export interface DependencyCheck {
  name: string
  status: DependencyStatus
  code: string | null
  message: string
  latencyMs: number
}

export interface CronRunHealthSummary {
  jobName: string
  status: string
  startedAt: string
  completedAt: string | null
  error: string | null
}

export interface DependencyHealth {
  ok: boolean
  status: DependencyStatus
  ts: number
  checks: DependencyCheck[]
  cronRuns?: CronRunHealthSummary[]
}

interface DependencyHealthOptions {
  includeCron?: boolean
  timeoutMs?: number
  db?: DependencyHealthDb
  now?: () => number
}

interface SupabaseQueryResult<T> {
  data: T | null
  error: unknown
}

interface DependencyHealthDb {
  from(table: string): {
    select(columns: string): {
      limit(count: number): PromiseLike<SupabaseQueryResult<unknown>>
      order(
        column: string,
        options: { ascending: boolean },
      ): {
        limit(count: number): PromiseLike<SupabaseQueryResult<unknown>>
      }
    }
  }
}

interface CronRunRow {
  job_name: string
  status: string
  started_at: string
  completed_at: string | null
  error: string | null
}

class DependencyTimeoutError extends Error {
  constructor(label: string, timeoutMs: number) {
    super(`${label} timed out after ${timeoutMs}ms`)
    this.name = 'DependencyTimeoutError'
  }
}

export async function getDependencyHealth(
  options: DependencyHealthOptions = {},
): Promise<DependencyHealth> {
  const db: DependencyHealthDb = options.db ?? getAdminClient()
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const now = options.now ?? Date.now
  const checks = await Promise.all([
    runSupabaseCheck('supabase_rest_tenants', timeoutMs, async () =>
      db.from('tenants').select('id').limit(1),
    ),
    runSupabaseCheck('supabase_rest_app_settings', timeoutMs, async () =>
      db.from('app_settings').select('key').limit(1),
    ),
  ])

  let cronRuns: CronRunHealthSummary[] | undefined
  if (options.includeCron) {
    const cronHealth = await runCronRunsCheck(db, timeoutMs)
    checks.push(cronHealth.check)
    cronRuns = cronHealth.runs
  }

  const status = summarizeStatus(checks)
  return {
    ok: status === 'ok',
    status,
    ts: now(),
    checks,
    ...(cronRuns ? { cronRuns } : {}),
  }
}

async function runCronRunsCheck(
  db: DependencyHealthDb,
  timeoutMs: number,
): Promise<{ check: DependencyCheck; runs: CronRunHealthSummary[] }> {
  const startedAt = Date.now()
  try {
    const result = await queryWithTimeout<SupabaseQueryResult<unknown>>(
      'cron_runs',
      db
        .from('cron_runs')
        .select('job_name, status, started_at, completed_at, error')
        .order('started_at', { ascending: false })
        .limit(RECENT_CRON_LIMIT),
      timeoutMs,
    )
    return {
      check: resultToCheck('cron_runs', result, Date.now() - startedAt),
      runs: isCronRunRows(result.data)
        ? result.data.map((row) => ({
            jobName: row.job_name,
            status: row.status,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            error: row.error ? row.error.slice(0, 240) : null,
          }))
        : [],
    }
  } catch (error) {
    return {
      check: {
        name: 'cron_runs',
        status: 'down',
        code: getSupabaseErrorCode(error),
        message: publicSupabaseFailureMessage(error),
        latencyMs: Date.now() - startedAt,
      },
      runs: [],
    }
  }
}

function isCronRunRows(value: unknown): value is CronRunRow[] {
  return Array.isArray(value)
}

async function runSupabaseCheck(
  name: string,
  timeoutMs: number,
  buildQuery: () => PromiseLike<SupabaseQueryResult<unknown>>,
): Promise<DependencyCheck> {
  const startedAt = Date.now()
  try {
    const result = await queryWithTimeout(name, buildQuery(), timeoutMs)
    return resultToCheck(name, result, Date.now() - startedAt)
  } catch (error) {
    return {
      name,
      status: 'down',
      code: getSupabaseErrorCode(error),
      message: publicSupabaseFailureMessage(error),
      latencyMs: Date.now() - startedAt,
    }
  }
}

async function queryWithTimeout<T>(
  label: string,
  query: PromiseLike<T>,
  timeoutMs: number,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new DependencyTimeoutError(label, timeoutMs)), timeoutMs)
  })
  try {
    return await Promise.race([Promise.resolve(query), timeoutPromise])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

function resultToCheck<T>(
  name: string,
  result: SupabaseQueryResult<T>,
  latencyMs = 0,
): DependencyCheck {
  if (!result.error) {
    return {
      name,
      status: 'ok',
      code: null,
      message: 'ok',
      latencyMs,
    }
  }
  return {
    name,
    status: 'down',
    code: getSupabaseErrorCode(result.error),
    message: publicSupabaseFailureMessage(result.error),
    latencyMs,
  }
}

function summarizeStatus(checks: readonly DependencyCheck[]): DependencyStatus {
  if (checks.some((check) => check.status === 'down')) return 'down'
  if (checks.some((check) => check.status === 'degraded')) return 'degraded'
  return 'ok'
}
