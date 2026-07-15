import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('event participation-stat exclusion (mig 259)', () => {
  let tenant: TestTenant

  beforeEach(async () => {
    tenant = await createTestTenant('event-participation-stats')
  })

  afterEach(async () => {
    await tenant?.cleanup()
  })

  it('defaults to counted and persists an explicit exclusion flag per tenant event', async () => {
    const client = getTestServiceClient()
    const { error: normalError } = await client
      .from('events')
      .insert({
        guild_id: tenant.guildId,
        title: 'Normal event',
        gather_time: '',
        gather_location: '',
      })
    expect(normalError).toBeNull()

    const { error: excludedError } = await client
      .from('events')
      .insert({
        guild_id: tenant.guildId,
        title: 'Alliance-managed event',
        gather_time: '',
        gather_location: '',
        exclude_from_participation_stats: true,
      })
    expect(excludedError).toBeNull()

    const { data, error } = await client
      .from('events')
      .select('title, exclude_from_participation_stats')
      .eq('guild_id', tenant.guildId)
      .order('title')
    expect(error).toBeNull()
    expect(data).toEqual([
      { title: 'Alliance-managed event', exclude_from_participation_stats: true },
      { title: 'Normal event', exclude_from_participation_stats: false },
    ])
  })
})
