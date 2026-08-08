import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('event tentative slot recommendations (migration 410)', () => {
  let tenant: TestTenant
  let eventId: string
  let partyId: string
  let healerSlotId: string
  let dpsSlotId: string
  let memberId: string

  beforeEach(async () => {
    tenant = await createTestTenant(`tentative-recommendation-${crypto.randomUUID().slice(0, 8)}`)
    eventId = crypto.randomUUID()
    partyId = crypto.randomUUID()
    healerSlotId = crypto.randomUUID()
    dpsSlotId = crypto.randomUUID()
    memberId = `member-${crypto.randomUUID()}`
    const client = getTestServiceClient()

    expect((await client.from('events').insert({
      id: eventId,
      guild_id: tenant.guildId,
      title: 'Tentative recommendation',
      gather_time: '',
      gather_location: '',
      status: 'published',
      category: '전투',
    })).error).toBeNull()
    expect((await client.from('parties').insert({
      id: partyId,
      guild_id: tenant.guildId,
      event_id: eventId,
      party_number: 1,
    })).error).toBeNull()
    expect((await client.from('slots').insert([
      {
        id: healerSlotId,
        guild_id: tenant.guildId,
        party_id: partyId,
        slot_number: 1,
        role_name: 'Healer',
      },
      {
        id: dpsSlotId,
        guild_id: tenant.guildId,
        party_id: partyId,
        slot_number: 2,
        role_name: 'EngageDps',
      },
    ])).error).toBeNull()
    expect((await client.from('event_tentative_signups').insert({
      guild_id: tenant.guildId,
      event_id: eventId,
      discord_id: memberId,
      username: 'Tentative Member',
      possible_roles: ['Healer'],
    })).error).toBeNull()
  })

  afterEach(async () => {
    await tenant?.cleanup()
  })

  it('sets only a matching empty slot, then clears it when the slot fills', async () => {
    const client = getTestServiceClient()
    const mismatch = await client.rpc('set_event_tentative_slot_recommendation', {
      p_guild_id: tenant.guildId,
      p_event_id: eventId,
      p_discord_id: memberId,
      p_slot_id: dpsSlotId,
      p_actor_discord_id: 'manager-1',
    })
    expect(mismatch.error?.message).toContain('TENTATIVE_RECOMMENDATION_ROLE_MISMATCH')

    const recommended = await client.rpc('set_event_tentative_slot_recommendation', {
      p_guild_id: tenant.guildId,
      p_event_id: eventId,
      p_discord_id: memberId,
      p_slot_id: healerSlotId,
      p_actor_discord_id: 'manager-1',
    })
    expect(recommended.error).toBeNull()

    const current = await client
      .from('event_tentative_signups')
      .select('recommended_slot_id, recommended_by_discord_id, recommended_at')
      .eq('guild_id', tenant.guildId)
      .eq('event_id', eventId)
      .eq('discord_id', memberId)
      .single()
    expect(current.error).toBeNull()
    expect(current.data).toMatchObject({
      recommended_slot_id: healerSlotId,
      recommended_by_discord_id: 'manager-1',
    })
    expect(current.data?.recommended_at).not.toBeNull()

    const filled = await client
      .from('slots')
      .update({
        assigned_discord_id: `other-${crypto.randomUUID()}`,
        assigned_username: 'Other Member',
      })
      .eq('guild_id', tenant.guildId)
      .eq('id', healerSlotId)
    expect(filled.error).toBeNull()

    const cleared = await client
      .from('event_tentative_signups')
      .select('recommended_slot_id, recommended_by_discord_id, recommended_at')
      .eq('guild_id', tenant.guildId)
      .eq('event_id', eventId)
      .eq('discord_id', memberId)
      .single()
    expect(cleared.error).toBeNull()
    expect(cleared.data).toEqual({
      recommended_slot_id: null,
      recommended_by_discord_id: null,
      recommended_at: null,
    })
  })

  it('rejects a matching slot from another event and all changes after operational start', async () => {
    const client = getTestServiceClient()
    const otherEventId = crypto.randomUUID()
    const otherPartyId = crypto.randomUUID()
    const otherSlotId = crypto.randomUUID()
    expect((await client.from('events').insert({
      id: otherEventId,
      guild_id: tenant.guildId,
      title: 'Other event',
      gather_time: '',
      gather_location: '',
      status: 'published',
      category: '전투',
    })).error).toBeNull()
    expect((await client.from('parties').insert({
      id: otherPartyId,
      guild_id: tenant.guildId,
      event_id: otherEventId,
      party_number: 1,
    })).error).toBeNull()
    expect((await client.from('slots').insert({
      id: otherSlotId,
      guild_id: tenant.guildId,
      party_id: otherPartyId,
      slot_number: 1,
      role_name: 'Healer',
    })).error).toBeNull()

    const crossEvent = await client.rpc('set_event_tentative_slot_recommendation', {
      p_guild_id: tenant.guildId,
      p_event_id: eventId,
      p_discord_id: memberId,
      p_slot_id: otherSlotId,
      p_actor_discord_id: 'manager-1',
    })
    expect(crossEvent.error?.message).toContain('TENTATIVE_RECOMMENDATION_SLOT_UNAVAILABLE')

    expect((await client
      .from('events')
      .update({ battle_started_at: new Date().toISOString() })
      .eq('guild_id', tenant.guildId)
      .eq('id', eventId)).error).toBeNull()
    const afterStart = await client.rpc('set_event_tentative_slot_recommendation', {
      p_guild_id: tenant.guildId,
      p_event_id: eventId,
      p_discord_id: memberId,
      p_slot_id: healerSlotId,
      p_actor_discord_id: 'manager-1',
    })
    expect(afterStart.error?.message).toContain('TENTATIVE_RECOMMENDATION_CLOSED')
  })
})
