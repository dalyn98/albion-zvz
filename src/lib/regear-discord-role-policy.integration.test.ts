import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('Discord role regear policy payout rates (mig 249)', () => {
  let tenant: TestTenant

  beforeEach(async () => {
    tenant = await createTestTenant('regear-policy-rate')
  })

  afterEach(async () => {
    await tenant?.cleanup()
  })

  it('stores a tenant-scoped payout rate and rejects values outside 1..100', async () => {
    const client = getTestServiceClient()
    const basePolicy = {
      guild_id: tenant.guildId,
      discord_role_id: '123456789012345678',
      discord_role_name: 'Core DPS',
      regear_role_group: 'dps',
      silver_cap: 3_000_000,
    }

    const { data: stored, error: storedError } = await client
      .from('regear_discord_role_policies')
      .insert({ ...basePolicy, payout_rate_percent: 55 })
      .select('guild_id, payout_rate_percent')
      .single()
    expect(storedError).toBeNull()
    expect(stored).toMatchObject({
      guild_id: tenant.guildId,
      payout_rate_percent: 55,
    })

    const { error: invalidRateError } = await client
      .from('regear_discord_role_policies')
      .insert({
        ...basePolicy,
        discord_role_id: '987654321098765432',
        payout_rate_percent: 0,
      })
    expect(invalidRateError?.code).toBe('23514')
  })
})
