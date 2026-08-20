import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('event operational cancellation', () => {
  let tenant: TestTenant

  beforeEach(async () => {
    tenant = await createTestTenant('event-operational-cancellation')
  })

  afterEach(async () => {
    await tenant?.cleanup()
  })

  it('soft-cancels only the tenant event while preserving its start boundary', async () => {
    const client = getTestServiceClient()
    const eventId = crypto.randomUUID()
    const startedAt = new Date().toISOString()
    const { error: insertError } = await client.from('events').insert({
      id: eventId,
      guild_id: tenant.guildId,
      title: 'Cancelled CTA',
      gather_time: '',
      gather_at: startedAt,
      gather_location: 'Bridgewatch',
      status: 'published',
      category: '전투',
    })
    expect(insertError).toBeNull()
    const { error: startError } = await client
      .from('events')
      .update({ battle_started_at: startedAt })
      .eq('guild_id', tenant.guildId)
      .eq('id', eventId)
    expect(startError).toBeNull()

    const { data: changed, error: cancelError } = await client.rpc(
      'cancel_event_operations',
      {
        p_guild_id: tenant.guildId,
        p_event_id: eventId,
        p_actor_discord_id: 'admin-1',
      },
    )
    expect(cancelError).toBeNull()
    expect(changed).toBe(true)

    const { data: cancelled } = await client
      .from('events')
      .select('status, battle_started_at, operational_cancelled_at, operational_cancelled_by, exclude_from_participation_stats, auto_regear_processed_at')
      .eq('guild_id', tenant.guildId)
      .eq('id', eventId)
      .single()
    expect(cancelled).toMatchObject({
      status: 'cancelled',
      battle_started_at: startedAt,
      operational_cancelled_by: 'admin-1',
      exclude_from_participation_stats: true,
    })
    expect(cancelled?.operational_cancelled_at).toEqual(expect.any(String))
    expect(cancelled?.auto_regear_processed_at).toEqual(expect.any(String))

    const { data: replayed, error: replayError } = await client.rpc(
      'cancel_event_operations',
      {
        p_guild_id: tenant.guildId,
        p_event_id: eventId,
        p_actor_discord_id: 'admin-1',
      },
    )
    expect(replayError).toBeNull()
    expect(replayed).toBe(false)
  })
})
