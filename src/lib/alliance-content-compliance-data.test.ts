import { beforeEach, describe, expect, it, vi } from 'vitest'

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
})
