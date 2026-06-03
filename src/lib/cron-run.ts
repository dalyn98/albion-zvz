import 'server-only'
import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { log } from '@/lib/log'
import { withNoStore } from '@/lib/no-store-response'

type SupabaseAdminClient = ReturnType<typeof getAdminClient>

interface CronRunStartRow {
  run_id: string
  started: boolean
  reason: string | null
}

interface CronRunContext {
  db: SupabaseAdminClient
  runId: string
}

interface CronRunOptions {
  jobName: string
  leaseSeconds?: number
}

type CronRunHandler = (ctx: CronRunContext) => Promise<Response | NextResponse | unknown>

function isValidCronAuthorization(authHeader: string | null, secret: string): boolean {
  if (!authHeader?.startsWith('Bearer ')) return false
  const candidate = authHeader.slice('Bearer '.length)
  const expectedBytes = Buffer.from(secret)
  const candidateBytes = Buffer.from(candidate)
  if (expectedBytes.length !== candidateBytes.length) return false
  return timingSafeEqual(expectedBytes, candidateBytes)
}

export function validateCronRequest(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return withNoStore(NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 }))
  }
  const authHeader = request.headers.get('authorization')
  if (!isValidCronAuthorization(authHeader, secret)) {
    return withNoStore(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
  }
  return null
}

function asResponse(result: Response | NextResponse | unknown): Response {
  if (result instanceof Response) return withNoStore(result)
  return withNoStore(NextResponse.json(result ?? {}))
}

async function responseBodyForLog(response: Response): Promise<unknown> {
  try {
    const text = await response.clone().text()
    if (!text) return null
    try {
      return JSON.parse(text) as unknown
    } catch {
      return { text: text.slice(0, 1000) }
    }
  } catch {
    return null
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function withCronRun(
  request: Request,
  options: CronRunOptions,
  handler: CronRunHandler,
): Promise<Response> {
  const authError = validateCronRequest(request)
  if (authError) return authError

  const db = getAdminClient()
  const { data, error } = await db.rpc('try_start_cron_run', {
    p_job_name: options.jobName,
    p_lease_seconds: options.leaseSeconds ?? 600,
  })
  if (error) {
    log.error('[cron] start failed', error, { job_name: options.jobName })
    return withNoStore(NextResponse.json({ error: error.message }, { status: 500 }))
  }

  const start = Array.isArray(data) ? (data[0] as CronRunStartRow | undefined) : undefined
  if (!start?.run_id) {
    log.error('[cron] start returned no run id', undefined, { job_name: options.jobName })
    return withNoStore(NextResponse.json({ error: 'cron start failed' }, { status: 500 }))
  }

  if (!start.started) {
    return withNoStore(
      NextResponse.json(
        { skipped: start.reason ?? 'lock-held', run_id: start.run_id },
        { status: 202 },
      ),
    )
  }

  try {
    const response = asResponse(await handler({ db, runId: start.run_id }))
    const body = await responseBodyForLog(response)
    const status = response.status >= 500 ? 'failed' : 'succeeded'
    const finishError =
      response.status >= 500 && body && typeof body === 'object' && 'error' in body
        ? String((body as { error?: unknown }).error)
        : null

    const { error: endError } = await db.rpc('finish_cron_run', {
      p_run_id: start.run_id,
      p_status: status,
      p_response: body,
      p_error: finishError,
    })
    if (endError) {
      log.error('[cron] finish failed', endError, {
        job_name: options.jobName,
        run_id: start.run_id,
      })
    }
    return response
  } catch (error) {
    const message = errorMessage(error)
    await db.rpc('finish_cron_run', {
      p_run_id: start.run_id,
      p_status: 'failed',
      p_response: null,
      p_error: message,
    })
    log.error('[cron] handler failed', error, {
      job_name: options.jobName,
      run_id: start.run_id,
    })
    return withNoStore(NextResponse.json({ error: message }, { status: 500 }))
  }
}
