import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { withCronRun } from './cron-run'

const mocks = vi.hoisted(() => ({
  getAdminClient: vi.fn(),
  logError: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: mocks.getAdminClient,
}))

vi.mock('@/lib/log', () => ({
  log: {
    error: mocks.logError,
  },
}))

function request(secret: string | null): Request {
  const headers = new Headers()
  if (secret !== null) headers.set('authorization', `Bearer ${secret}`)
  return new Request('https://example.test/api/cron/test', { headers })
}

function createDb(options: {
  start?: Array<{ run_id: string; started: boolean; reason: string | null }>
  startError?: { message: string } | null
} = {}) {
  const start = options.start ?? [{ run_id: 'run-1', started: true, reason: null }]
  const rpc = vi.fn(async (name: string) => {
    if (name === 'try_start_cron_run') {
      return { data: start, error: options.startError ?? null }
    }
    if (name === 'finish_cron_run') {
      return { data: null, error: null }
    }
    return { data: null, error: null }
  })
  return { rpc }
}

function cronRouteFiles(dir = join(process.cwd(), 'src', 'app', 'api', 'cron')): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) return cronRouteFiles(fullPath)
    return entry.name === 'route.ts' ? [fullPath] : []
  })
}

describe('withCronRun', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    mocks.getAdminClient.mockReset()
    mocks.logError.mockReset()
  })

  it('fails closed when CRON_SECRET is not configured', async () => {
    vi.stubEnv('CRON_SECRET', '')

    const response = await withCronRun(request('anything'), { jobName: 'test-job' }, async () => ({}))

    expect(response.status).toBe(500)
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    await expect(response.json()).resolves.toEqual({ error: 'CRON_SECRET not configured' })
    expect(mocks.getAdminClient).not.toHaveBeenCalled()
  })

  it('rejects missing or mismatched bearer tokens before touching Supabase', async () => {
    vi.stubEnv('CRON_SECRET', '1234567890123456')

    const missing = await withCronRun(request(null), { jobName: 'test-job' }, async () => ({}))
    const wrong = await withCronRun(request('1234567890123457'), { jobName: 'test-job' }, async () => ({}))
    const longWrong = await withCronRun(
      request('1234567890123456-extra'),
      { jobName: 'test-job' },
      async () => ({}),
    )

    expect(missing.status).toBe(401)
    expect(wrong.status).toBe(401)
    expect(longWrong.status).toBe(401)
    expect(missing.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(mocks.getAdminClient).not.toHaveBeenCalled()
  })

  it('returns a lock-held skip without calling the handler', async () => {
    vi.stubEnv('CRON_SECRET', '1234567890123456')
    const db = createDb({
      start: [{ run_id: 'run-locked', started: false, reason: 'lock-held' }],
    })
    mocks.getAdminClient.mockReturnValue(db)
    const handler = vi.fn()

    const response = await withCronRun(request('1234567890123456'), { jobName: 'test-job' }, handler)

    expect(response.status).toBe(202)
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    await expect(response.json()).resolves.toEqual({ skipped: 'lock-held', run_id: 'run-locked' })
    expect(handler).not.toHaveBeenCalled()
    expect(db.rpc).toHaveBeenCalledTimes(1)
  })

  it('starts and finishes successful cron work with the response body', async () => {
    vi.stubEnv('CRON_SECRET', '1234567890123456')
    const db = createDb()
    mocks.getAdminClient.mockReturnValue(db)

    const response = await withCronRun(request('1234567890123456'), { jobName: 'test-job' }, async () =>
      NextResponse.json({ ok: true }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(db.rpc).toHaveBeenCalledWith('try_start_cron_run', {
      p_job_name: 'test-job',
      p_lease_seconds: 600,
    })
    expect(db.rpc).toHaveBeenCalledWith('finish_cron_run', {
      p_run_id: 'run-1',
      p_status: 'succeeded',
      p_response: { ok: true },
      p_error: null,
    })
  })

  it('marks handler exceptions as failed cron runs', async () => {
    vi.stubEnv('CRON_SECRET', '1234567890123456')
    const db = createDb()
    mocks.getAdminClient.mockReturnValue(db)

    const response = await withCronRun(request('1234567890123456'), { jobName: 'test-job' }, async () => {
      throw new Error('boom')
    })

    expect(response.status).toBe(500)
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    await expect(response.json()).resolves.toEqual({ error: 'boom' })
    expect(db.rpc).toHaveBeenCalledWith('finish_cron_run', {
      p_run_id: 'run-1',
      p_status: 'failed',
      p_response: null,
      p_error: 'boom',
    })
    expect(mocks.logError).toHaveBeenCalledWith(
      '[cron] handler failed',
      expect.any(Error),
      expect.objectContaining({ job_name: 'test-job', run_id: 'run-1' }),
    )
  })

  it('keeps every cron route behind the shared cron runner', () => {
    const offenders = cronRouteFiles()
      .filter((filePath) => {
        const source = readFileSync(filePath, 'utf8')
        return !/from ['"]@\/lib\/cron-run['"]/.test(source) || !/\bwithCronRun\s*\(/.test(source)
      })
      .map((filePath) => filePath.replace(`${process.cwd()}/`, ''))

    expect(offenders).toEqual([])
  })
})
