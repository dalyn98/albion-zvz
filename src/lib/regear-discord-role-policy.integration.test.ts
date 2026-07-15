import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('role regear bonus payout rates (mig 266)', () => {
  let tenant: TestTenant

  beforeEach(async () => {
    tenant = await createTestTenant('regear-policy-rate')
  })

  afterEach(async () => {
    await tenant?.cleanup()
  })

  it('stores tenant-scoped role rates through 1000% and rejects larger values', async () => {
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
      .insert({ ...basePolicy, payout_rate_percent: 125 })
      .select('guild_id, payout_rate_percent')
      .single()
    expect(storedError).toBeNull()
    expect(stored).toMatchObject({
      guild_id: tenant.guildId,
      payout_rate_percent: 125,
    })

    const { error: invalidRateError } = await client
      .from('regear_discord_role_policies')
      .insert({
        ...basePolicy,
        discord_role_id: '987654321098765432',
        payout_rate_percent: 1001,
      })
    expect(invalidRateError?.code).toBe('23514')

    const { error: roleRewardError } = await client.from('role_rewards').insert({
      guild_id: tenant.guildId,
      role_name: 'Bonus DPS',
      silver: 1_000_000,
      payout_rate_percent: 150,
    })
    expect(roleRewardError).toBeNull()

    const { data: event, error: eventError } = await client
      .from('events')
      .insert({
        guild_id: tenant.guildId,
        title: 'Role bonus override',
        gather_time: '',
        gather_location: '',
        category: '전투',
      })
      .select('id')
      .single()
    expect(eventError).toBeNull()

    const { error: eventOverrideError } = await client
      .from('event_regear_role_overrides')
      .insert({
        guild_id: tenant.guildId,
        event_id: event!.id,
        role_name: 'Bonus DPS',
        payout_rate_percent: 175,
      })
    expect(eventOverrideError).toBeNull()
  })

  it('credits a silver payout above the request claim ceiling', async () => {
    const client = getTestServiceClient()
    const { data: request, error: requestError } = await client
      .from('regear_requests')
      .insert({
        guild_id: tenant.guildId,
        event_id: null,
        event_title_snapshot: 'Bonus payout approval',
        discord_id: 'bonus-member',
        username: 'Bonus Member',
        role_name: 'Bonus DPS',
        base_silver: 1_000_000,
        silver: 1_000_000,
        claimed_silver: 1_000_000,
        auto_generated: false,
      })
      .select('id')
      .single()
    expect(requestError).toBeNull()

    const { error: approvalError } = await client.rpc('approve_regear_request', {
      p_id: request!.id,
      p_admin_id: 'integration-admin',
      p_admin_username: 'Integration Admin',
      p_guild_id: tenant.guildId,
      p_payout_silver: 1_250_000,
    })
    expect(approvalError).toBeNull()

    const [{ data: approved, error: approvedError }, { data: ledger, error: ledgerError }] =
      await Promise.all([
        client
          .from('regear_requests')
          .select('status, payout_silver')
          .eq('guild_id', tenant.guildId)
          .eq('id', request!.id)
          .single(),
        client
          .from('point_ledger')
          .select('delta')
          .eq('guild_id', tenant.guildId)
          .eq('ref_id', request!.id)
          .single(),
      ])
    expect(approvedError).toBeNull()
    expect(ledgerError).toBeNull()
    expect(approved).toMatchObject({ status: 'approved', payout_silver: 1_250_000 })
    expect(ledger?.delta).toBe(1_250_000)
  })
})
