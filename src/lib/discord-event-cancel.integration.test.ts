import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

interface EventFixture {
  eventId: string
  partyId: string
  slotIds: string[]
}

describeIntegration('Discord event cancellation parity (migration 339)', () => {
  let tenant: TestTenant

  beforeEach(async () => {
    tenant = await createTestTenant(`discord-cancel-${crypto.randomUUID().slice(0, 8)}`)
  })

  afterEach(async () => {
    await tenant?.cleanup()
  })

  async function createEvent(slotCount: number): Promise<EventFixture> {
    const client = getTestServiceClient()
    const eventId = crypto.randomUUID()
    const partyId = crypto.randomUUID()
    const event = await client.from('events').insert({
      id: eventId,
      guild_id: tenant.guildId,
      title: 'Discord cancellation',
      gather_time: '',
      gather_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      gather_location: 'Bridgewatch',
      status: 'published',
      category: '전투',
    })
    expect(event.error).toBeNull()
    const party = await client.from('parties').insert({
      id: partyId,
      guild_id: tenant.guildId,
      event_id: eventId,
      party_number: 1,
    })
    expect(party.error).toBeNull()
    const slotIds = Array.from({ length: slotCount }, () => crypto.randomUUID())
    const slots = await client.from('slots').insert(slotIds.map((id, index) => ({
      id,
      guild_id: tenant.guildId,
      party_id: partyId,
      slot_number: index + 1,
      role_name: 'Dps',
    })))
    expect(slots.error).toBeNull()
    return { eventId, partyId, slotIds }
  }

  it('atomically clears all owned member slots and unfrozen tentative intent', async () => {
    const client = getTestServiceClient()
    const actorId = '811111111111111111'
    const fixture = await createEvent(2)
    const avatar = await client.from('guild_avatars').insert({
      guild_id: tenant.guildId,
      discord_id: actorId,
      username: 'Discord Member',
      avatar: null,
    })
    expect(avatar.error).toBeNull()
    const assigned = await client.from('slots').update({
      assigned_discord_id: actorId,
      assigned_username: 'Discord Member',
      assigned_weapon_name: 'Test Weapon',
      assigned_weapon_id: 'T8_MAIN_SWORD',
    }).eq('id', fixture.slotIds[0])
    expect(assigned.error).toBeNull()
    const requested = await client.from('slots').update({
      requested_discord_id: actorId,
      requested_username: 'Discord Member',
      requested_picks: [{ role: 'Dps' }],
      requested_at: new Date().toISOString(),
    }).eq('id', fixture.slotIds[1])
    expect(requested.error).toBeNull()
    const tentative = await client.from('event_tentative_signups').insert({
      guild_id: tenant.guildId,
      event_id: fixture.eventId,
      discord_id: actorId,
      username: 'Discord Member',
      possible_roles: ['Dps'],
    })
    expect(tentative.error).toBeNull()

    const cancelled = await client.rpc('cancel_member_event_signup', {
      p_guild_id: tenant.guildId,
      p_event_id: fixture.eventId,
      p_discord_id: actorId,
    })
    expect(cancelled.error).toBeNull()
    expect(cancelled.data).toBe(3)

    const slots = await client
      .from('slots')
      .select('assigned_discord_id, assigned_weapon_id, requested_discord_id, requested_picks')
      .in('id', fixture.slotIds)
      .order('slot_number')
    expect(slots.error).toBeNull()
    expect(slots.data).toEqual([
      {
        assigned_discord_id: null,
        assigned_weapon_id: null,
        requested_discord_id: null,
        requested_picks: null,
      },
      {
        assigned_discord_id: null,
        assigned_weapon_id: null,
        requested_discord_id: null,
        requested_picks: null,
      },
    ])
    const { count } = await client
      .from('event_tentative_signups')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', tenant.guildId)
      .eq('event_id', fixture.eventId)
      .eq('discord_id', actorId)
    expect(count).toBe(0)

    const retry = await client.rpc('cancel_member_event_signup', {
      p_guild_id: tenant.guildId,
      p_event_id: fixture.eventId,
      p_discord_id: actorId,
    })
    expect(retry.error).toBeNull()
    expect(retry.data).toBe(0)
  })

  it('withdraws a Discord guest application instead of orphaning its history', async () => {
    const client = getTestServiceClient()
    const guestId = '822222222222222222'
    const fixture = await createEvent(1)
    const guest = await client.from('guests').insert({
      guild_id: tenant.guildId,
      discord_id: guestId,
      username: 'Discord Guest',
      preferred_language: 'ko',
    })
    expect(guest.error).toBeNull()
    const profile = await client.from('event_guest_profiles').insert({
      guild_id: tenant.guildId,
      event_id: fixture.eventId,
      discord_id: guestId,
      display_name: 'Discord Guest',
      preferred_language: 'ko',
      albion_server: 'west',
      albion_player_id: 'discord-guest-player',
      albion_character_name: 'DiscordGuestCharacter',
      albion_guild_name: null,
      character_verified: true,
    })
    expect(profile.error).toBeNull()
    const assigned = await client.rpc('assign_guest_event_slot', {
      p_guild_id: tenant.guildId,
      p_event_id: fixture.eventId,
      p_guest_id: guestId,
      p_slot_id: fixture.slotIds[0],
      p_username: 'Discord Guest',
      p_picks: {},
      p_idempotency_key: crypto.randomUUID(),
      p_management_secret_hash: 'a'.repeat(64),
    })
    expect(assigned.error).toBeNull()

    const cancelled = await client.rpc('cancel_member_event_signup', {
      p_guild_id: tenant.guildId,
      p_event_id: fixture.eventId,
      p_discord_id: guestId,
    })
    expect(cancelled.error).toBeNull()
    expect(cancelled.data).toBe(1)
    const [application, slot] = await Promise.all([
      client
        .from('event_guest_applications')
        .select('status, cancellation_reason, cancelled_at')
        .eq('guild_id', tenant.guildId)
        .eq('event_id', fixture.eventId)
        .eq('guest_id', guestId)
        .single(),
      client
        .from('slots')
        .select('assigned_discord_id')
        .eq('id', fixture.slotIds[0])
        .single(),
    ])
    expect(application.error).toBeNull()
    expect(application.data).toMatchObject({
      status: 'withdrawn',
      cancellation_reason: 'guest_withdrawal',
      cancelled_at: expect.any(String),
    })
    expect(slot.error).toBeNull()
    expect(slot.data?.assigned_discord_id).toBeNull()
  })

  it('keeps legacy request approve and reject commands compatible with stable projection', async () => {
    const client = getTestServiceClient()
    const actorId = '833333333333333333'
    const fixture = await createEvent(2)
    const avatar = await client.from('guild_avatars').insert({
      guild_id: tenant.guildId,
      discord_id: actorId,
      username: 'Requested Member',
      avatar: null,
    })
    expect(avatar.error).toBeNull()
    const requested = await client.from('slots').update({
      requested_discord_id: actorId,
      requested_username: 'Requested Member',
      requested_picks: {},
      requested_at: new Date().toISOString(),
    }).in('id', fixture.slotIds)
    expect(requested.error).toBeNull()

    const approved = await client.rpc('approve_slot_request', {
      p_slot_id: fixture.slotIds[0],
    })
    expect(approved.error).toBeNull()
    const rejected = await client.rpc('reject_slot_request', {
      p_slot_id: fixture.slotIds[1],
    })
    expect(rejected.error).toBeNull()

    const slots = await client
      .from('slots')
      .select(
        'id, assigned_discord_id, assigned_guild_member_id, requested_discord_id, requested_guild_member_id',
      )
      .in('id', fixture.slotIds)
    expect(slots.error).toBeNull()
    const approvedSlot = slots.data?.find((slot) => slot.id === fixture.slotIds[0])
    const rejectedSlot = slots.data?.find((slot) => slot.id === fixture.slotIds[1])
    expect(approvedSlot).toMatchObject({
      assigned_discord_id: actorId,
      assigned_guild_member_id: expect.any(String),
      requested_discord_id: null,
      requested_guild_member_id: null,
    })
    expect(rejectedSlot).toMatchObject({
      assigned_discord_id: null,
      assigned_guild_member_id: null,
      requested_discord_id: null,
      requested_guild_member_id: null,
    })
  })
})
