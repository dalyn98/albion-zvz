import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAppSetting: vi.fn(),
  getTenantDiscordConfig: vi.fn(),
}))

vi.mock('@/lib/app-settings', () => ({
  getAppSetting: mocks.getAppSetting,
}))

vi.mock('@/lib/tenant', () => ({
  getTenantDiscordConfig: mocks.getTenantDiscordConfig,
}))

import {
  isAllianceContentComplianceAvailable,
  requireAllianceContentComplianceAvailable,
} from './alliance-content-compliance-access'

describe('alliance content compliance application boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAppSetting.mockResolvedValue('true')
  })

  it('enables the feature only when the tenant is Menhera and its switch is on', async () => {
    mocks.getTenantDiscordConfig.mockResolvedValue({ slug: 'menhera' })

    await expect(isAllianceContentComplianceAvailable('guild-1')).resolves.toBe(true)
    expect(mocks.getAppSetting).toHaveBeenCalledWith(
      'alliance_content_compliance_enabled',
      'false',
      'guild-1',
    )
  })

  it('rejects a non-Menhera tenant even if a stale setting remains enabled', async () => {
    mocks.getTenantDiscordConfig.mockResolvedValue({ slug: 'another-guild' })

    await expect(isAllianceContentComplianceAvailable('guild-2')).resolves.toBe(false)
    await expect(requireAllianceContentComplianceAvailable('guild-2')).rejects.toThrow(
      'ALLIANCE_CONTENT_FEATURE_UNAVAILABLE',
    )
  })
})
