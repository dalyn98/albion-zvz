import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('Discord role regear rate floors (mig 291)', () => {
  let tenantA: TestTenant
  let tenantB: TestTenant

  beforeEach(async () => {
    ;[tenantA, tenantB] = await Promise.all([
      createTestTenant('regear-rate-floor-a'),
      createTestTenant('regear-rate-floor-b'),
    ])
  })

  afterEach(async () => {
    await Promise.all([tenantA?.cleanup(), tenantB?.cleanup()])
  })

  it('stores the same Discord role independently for each tenant', async () => {
    const client = getTestServiceClient()
    const discordRoleId = '123456789012345678'
    const { error } = await client.from('regear_discord_role_rate_floors').insert([
      {
        guild_id: tenantA.guildId,
        discord_role_id: discordRoleId,
        discord_role_name: 'Mentor',
        minimum_payout_rate_percent: 110,
      },
      {
        guild_id: tenantB.guildId,
        discord_role_id: discordRoleId,
        discord_role_name: 'Mentor',
        minimum_payout_rate_percent: 125,
      },
    ])
    expect(error).toBeNull()

    const { data, error: selectError } = await client
      .from('regear_discord_role_rate_floors')
      .select('guild_id, minimum_payout_rate_percent')
      .eq('guild_id', tenantA.guildId)
    expect(selectError).toBeNull()
    expect(data).toEqual([
      {
        guild_id: tenantA.guildId,
        minimum_payout_rate_percent: 110,
      },
    ])
  })

  it('rejects duplicate tenant roles and rates above the allowed maximum', async () => {
    const client = getTestServiceClient()
    const base = {
      guild_id: tenantA.guildId,
      discord_role_id: '123456789012345678',
      discord_role_name: 'Mentor',
    }
    expect(
      (await client.from('regear_discord_role_rate_floors').insert({
        ...base,
        minimum_payout_rate_percent: 110,
      })).error,
    ).toBeNull()

    const duplicate = await client.from('regear_discord_role_rate_floors').insert({
      ...base,
      minimum_payout_rate_percent: 120,
    })
    expect(duplicate.error?.code).toBe('23505')

    const invalid = await client.from('regear_discord_role_rate_floors').insert({
      ...base,
      discord_role_id: '987654321098765432',
      minimum_payout_rate_percent: 1001,
    })
    expect(invalid.error?.code).toBe('23514')
  })
})
