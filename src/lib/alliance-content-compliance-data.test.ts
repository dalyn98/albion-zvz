import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

const mocks = vi.hoisted(() => ({
  isAllianceContentComplianceAvailable: vi.fn(),
  getAdminClient: vi.fn(),
}))

vi.mock('@/lib/alliance-content-compliance-access', () => ({
  isAllianceContentComplianceAvailable: mocks.isAllianceContentComplianceAvailable,
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: mocks.getAdminClient,
}))

import { getAllianceContentAdminDashboard } from './alliance-content-compliance-data'

describe('getAllianceContentAdminDashboard', () => {
  beforeEach(() => {
    mocks.isAllianceContentComplianceAvailable.mockReset()
    mocks.getAdminClient.mockReset()
  })

  it('does not build confirmation-pending candidates for a non-Menhera tenant', async () => {
    mocks.isAllianceContentComplianceAvailable.mockResolvedValue(false)

    await expect(getAllianceContentAdminDashboard('other-tenant')).resolves.toMatchObject({
      candidates: [],
      sessions: [],
      pendingSubmissions: [],
    })
    expect(mocks.getAdminClient).not.toHaveBeenCalled()
  })

  it('loads the newest tracked battles before applying the candidate limit', () => {
    const source = readFileSync(
      new URL('./alliance-content-compliance-data.ts', import.meta.url),
      'utf8',
    )

    expect(source).toMatch(
      /from\('tenant_zvz_battle_records'\)[\s\S]*?order\('started_at', \{ ascending: false \}\)[\s\S]*?limit\(500\)/,
    )
  })
})
