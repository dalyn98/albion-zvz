import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getAdminClient: vi.fn(),
  buildLegacyBackfillRows: vi.fn(),
  areBattlelogFeaturesPaused: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: mocks.getAdminClient,
}))

vi.mock('@/lib/battle-tracking-helpers', () => ({
  buildLegacyBackfillRows: mocks.buildLegacyBackfillRows,
}))

vi.mock('@/lib/battlelog-pause', () => ({
  BATTLELOG_PAUSED_API_STATUS: 503,
  areBattlelogFeaturesPaused: mocks.areBattlelogFeaturesPaused,
  getBattlelogPausePayload: (area: string) => ({
    paused: true,
    feature: 'battlelog',
    area,
    reason: 'ui_ux_refresh',
    message: 'Battlelog features are temporarily paused while the UI/UX refresh is in progress.',
  }),
}))

import { GET } from './route'

function request(path: string, secret: string | null): NextRequest {
  const headers = new Headers()
  if (secret !== null) headers.set('authorization', `Bearer ${secret}`)
  return new NextRequest(`https://example.test${path}`, { headers })
}

function expectNoStore(response: Response) {
  expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
  expect(response.headers.get('pragma')).toBe('no-cache')
  expect(response.headers.get('expires')).toBe('0')
}

function createEmptyBackfillDb() {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    lt: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(async () => ({ data: [], error: null })),
  }
  const db = {
    from: vi.fn(() => builder),
  }
  return { db, builder }
}

describe('GET /api/admin/battle-matchup-backfill', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    mocks.getAdminClient.mockReset()
    mocks.buildLegacyBackfillRows.mockReset()
    mocks.areBattlelogFeaturesPaused.mockReset()
    mocks.areBattlelogFeaturesPaused.mockReturnValue(false)
  })

  it('fails closed when CRON_SECRET is not configured', async () => {
    vi.stubEnv('CRON_SECRET', '')

    const response = await GET(request('/api/admin/battle-matchup-backfill', 'anything'))

    expect(response.status).toBe(500)
    expectNoStore(response)
    await expect(response.json()).resolves.toEqual({ error: 'CRON_SECRET not configured' })
    expect(mocks.getAdminClient).not.toHaveBeenCalled()
  })

  it('rejects mismatched bearer tokens before touching Supabase', async () => {
    vi.stubEnv('CRON_SECRET', '1234567890123456')

    const response = await GET(request('/api/admin/battle-matchup-backfill', '1234567890123457'))

    expect(response.status).toBe(401)
    expectNoStore(response)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(mocks.getAdminClient).not.toHaveBeenCalled()
  })

  it('validates stale mode input after cron authorization but before querying Supabase', async () => {
    vi.stubEnv('CRON_SECRET', '1234567890123456')

    const response = await GET(request('/api/admin/battle-matchup-backfill?mode=stale', '1234567890123456'))

    expect(response.status).toBe(400)
    expectNoStore(response)
    await expect(response.json()).resolves.toEqual({
      error: 'mode=stale requires ?before=<ISO timestamp>',
    })
    expect(mocks.getAdminClient).not.toHaveBeenCalled()
  })

  it('returns paused after cron authorization without querying Supabase', async () => {
    vi.stubEnv('CRON_SECRET', '1234567890123456')
    mocks.areBattlelogFeaturesPaused.mockReturnValue(true)

    const response = await GET(request('/api/admin/battle-matchup-backfill?limit=25', '1234567890123456'))

    expect(response.status).toBe(503)
    expectNoStore(response)
    await expect(response.json()).resolves.toMatchObject({
      paused: true,
      feature: 'battlelog',
      area: 'battle-matchup-backfill',
    })
    expect(mocks.getAdminClient).not.toHaveBeenCalled()
  })

  it('keeps the legacy empty-batch response for authorized callers', async () => {
    vi.stubEnv('CRON_SECRET', '1234567890123456')
    const { db, builder } = createEmptyBackfillDb()
    mocks.getAdminClient.mockReturnValue(db)

    const response = await GET(request('/api/admin/battle-matchup-backfill?limit=25', '1234567890123456'))

    expect(response.status).toBe(200)
    expectNoStore(response)
    await expect(response.json()).resolves.toEqual({
      mode: 'legacy',
      processed: 0,
      inserted: 0,
      deleted_no_engagement: 0,
      remaining_estimate: 0,
      errors: [],
    })
    expect(db.from).toHaveBeenCalledWith('tenant_battle_records')
    expect(builder.eq).toHaveBeenCalledWith('main_opponent_force_key', '__legacy__')
    expect(builder.limit).toHaveBeenCalledWith(25)
  })

  it('does not prefix-parse malformed limit values', async () => {
    vi.stubEnv('CRON_SECRET', '1234567890123456')
    const { db, builder } = createEmptyBackfillDb()
    mocks.getAdminClient.mockReturnValue(db)

    const response = await GET(request('/api/admin/battle-matchup-backfill?limit=25abc', '1234567890123456'))

    expect(response.status).toBe(200)
    expectNoStore(response)
    expect(builder.limit).toHaveBeenCalledWith(200)
  })
})
