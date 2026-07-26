import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('free regear window payout rates (mig 284)', () => {
  let tenant: TestTenant

  beforeEach(async () => {
    tenant = await createTestTenant('regear-window-rate')
  })

  afterEach(async () => {
    await tenant?.cleanup()
  })

  it('stores a tenant-scoped rate through 1000% and rejects larger values', async () => {
    const client = getTestServiceClient()
    const { data: stored, error: storedError } = await client
      .from('regear_windows')
      .insert({
        guild_id: tenant.guildId,
        title: 'CTA 자유 리기어',
        payout_rate_percent: 125,
      })
      .select('guild_id, payout_rate_percent')
      .single()

    expect(storedError).toBeNull()
    expect(stored).toMatchObject({
      guild_id: tenant.guildId,
      payout_rate_percent: 125,
    })

    const { error: invalidRateError } = await client
      .from('regear_windows')
      .insert({
        guild_id: tenant.guildId,
        title: 'Invalid rate',
        payout_rate_percent: 1001,
      })

    expect(invalidRateError?.code).toBe('23514')
  })
})
