import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('event state snapshot (mig 273)', () => {
  let tenant: TestTenant

  beforeEach(async () => {
    tenant = await createTestTenant('event-state-snapshot')
  })

  afterEach(async () => {
    await tenant?.cleanup()
  })

  it('changes after a live slot assignment and rejects a different tenant scope', async () => {
    const client = getTestServiceClient()
    const eventId = crypto.randomUUID()
    const partyId = crypto.randomUUID()
    const { error: eventError } = await client.from('events').insert({
      id: eventId,
      guild_id: tenant.guildId,
      title: 'Snapshot event',
      gather_time: '',
      gather_location: '',
      status: 'published',
      category: '전투',
    })
    expect(eventError).toBeNull()
    const { error: partyError } = await client.from('parties').insert({
      id: partyId,
      guild_id: tenant.guildId,
      event_id: eventId,
      party_number: 1,
    })
    expect(partyError).toBeNull()

    const slotId = crypto.randomUUID()
    const { error: slotError } = await client.from('slots').insert({
      id: slotId,
      guild_id: tenant.guildId,
      party_id: partyId,
      slot_number: 1,
      role_name: 'Healer',
    })
    expect(slotError).toBeNull()

    const { data: before, error: beforeError } = await client.rpc(
      'get_event_state_snapshot',
      { p_guild_id: tenant.guildId, p_event_id: eventId },
    )
    expect(beforeError).toBeNull()

    const { error: assignmentError } = await client
      .from('slots')
      .update({
        assigned_discord_id: '1234567890',
        assigned_username: 'Snapshot Member',
      })
      .eq('guild_id', tenant.guildId)
      .eq('id', slotId)
    expect(assignmentError).toBeNull()

    const { data: after, error: afterError } = await client.rpc(
      'get_event_state_snapshot',
      { p_guild_id: tenant.guildId, p_event_id: eventId },
    )
    expect(afterError).toBeNull()
    expect((after as { fingerprint: string }).fingerprint).not.toBe(
      (before as { fingerprint: string }).fingerprint,
    )

    const otherTenant = await createTestTenant('event-state-other')
    try {
      const { data: crossTenant, error: crossTenantError } = await client.rpc(
        'get_event_state_snapshot',
        { p_guild_id: otherTenant.guildId, p_event_id: eventId },
      )
      expect(crossTenantError).toBeNull()
      expect(crossTenant).toBeNull()
    } finally {
      await otherTenant.cleanup()
    }
  })
})
