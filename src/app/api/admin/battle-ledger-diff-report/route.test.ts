import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getAdminClient: vi.fn(),
  getSuperAdminSession: vi.fn(),
  getBattleProjectionDiffReport: vi.fn(),
}))

vi.mock('@/lib/super-admin', () => ({
  getSuperAdminSession: mocks.getSuperAdminSession,
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: mocks.getAdminClient,
}))

vi.mock('@/lib/battle-ledger-diff-db', () => ({
  getBattleProjectionDiffReport: mocks.getBattleProjectionDiffReport,
}))

import { GET } from './route'

function request(path: string): NextRequest {
  return new NextRequest(`https://example.test${path}`)
}

function expectNoStore(response: Response) {
  expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
  expect(response.headers.get('pragma')).toBe('no-cache')
  expect(response.headers.get('expires')).toBe('0')
}

describe('GET /api/admin/battle-ledger-diff-report', () => {
  beforeEach(() => {
    mocks.getAdminClient.mockReset()
    mocks.getSuperAdminSession.mockReset()
    mocks.getBattleProjectionDiffReport.mockReset()
  })

  it('requires a super-admin session before parsing diagnostics params', async () => {
    mocks.getSuperAdminSession.mockResolvedValue(null)

    const response = await GET(request('/api/admin/battle-ledger-diff-report?limit=50'))

    expect(response.status).toBe(401)
    expectNoStore(response)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(mocks.getAdminClient).not.toHaveBeenCalled()
    expect(mocks.getBattleProjectionDiffReport).not.toHaveBeenCalled()
  })

  it('rejects fractional limits instead of silently flooring to zero samples', async () => {
    mocks.getSuperAdminSession.mockResolvedValue({ discordId: 'super-admin' })

    const response = await GET(request('/api/admin/battle-ledger-diff-report?limit=0.5'))

    expect(response.status).toBe(400)
    expectNoStore(response)
    await expect(response.json()).resolves.toEqual({
      error: 'limit must be an integer in [1, 200]',
    })
    expect(mocks.getAdminClient).not.toHaveBeenCalled()
    expect(mocks.getBattleProjectionDiffReport).not.toHaveBeenCalled()
  })

  it('passes validated integer limits to the diff report generator', async () => {
    const db = { from: vi.fn() }
    mocks.getSuperAdminSession.mockResolvedValue({ discordId: 'super-admin' })
    mocks.getAdminClient.mockReturnValue(db)
    mocks.getBattleProjectionDiffReport.mockResolvedValue({
      generatedAt: '2026-06-02T00:00:00.000Z',
      active: { total: 0, byType: {} },
      recentResolved: { total: 0, byType: {} },
      activeSamples: [],
      recentResolvedSamples: [],
    })

    const response = await GET(request('/api/admin/battle-ledger-diff-report?since_hours=168&limit=25'))

    expect(response.status).toBe(200)
    expectNoStore(response)
    expect(mocks.getBattleProjectionDiffReport).toHaveBeenCalledWith(
      expect.objectContaining({
        db,
        sampleLimit: 25,
      }),
    )
  })

  it('marks internal error responses as non-cacheable', async () => {
    const db = { from: vi.fn() }
    mocks.getSuperAdminSession.mockResolvedValue({ discordId: 'super-admin' })
    mocks.getAdminClient.mockReturnValue(db)
    mocks.getBattleProjectionDiffReport.mockRejectedValue(new Error('report failed'))

    const response = await GET(request('/api/admin/battle-ledger-diff-report?limit=25'))

    expect(response.status).toBe(500)
    expectNoStore(response)
    await expect(response.json()).resolves.toEqual({ error: 'report failed' })
  })
})
