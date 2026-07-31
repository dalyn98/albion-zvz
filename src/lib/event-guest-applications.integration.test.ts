import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

interface GuestEventFixture {
  eventId: string
  partyId: string
  slotIds: string[]
}

describeIntegration('passwordless event guest applications (migrations 331-332)', () => {
  let tenant: TestTenant

  beforeEach(async () => {
    tenant = await createTestTenant('event-guest-applications')
  })

  afterEach(async () => {
    await tenant?.cleanup()
  })

  async function createEvent(slotCount = 2): Promise<GuestEventFixture> {
    const client = getTestServiceClient()
    const eventId = crypto.randomUUID()
    const partyId = crypto.randomUUID()
    const { error: eventError } = await client.from('events').insert({
      id: eventId,
      guild_id: tenant.guildId,
      title: 'Guest event',
      gather_time: '',
      gather_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      gather_location: 'Bridgewatch',
      status: 'published',
      category: '전투',
      guest_regear_enabled: true,
    })
    expect(eventError).toBeNull()

    const { error: partyError } = await client.from('parties').insert({
      id: partyId,
      guild_id: tenant.guildId,
      event_id: eventId,
      party_number: 1,
    })
    expect(partyError).toBeNull()

    const slotIds = Array.from({ length: slotCount }, () => crypto.randomUUID())
    const { error: slotError } = await client.from('slots').insert(
      slotIds.map((id, index) => ({
        id,
        guild_id: tenant.guildId,
        party_id: partyId,
        slot_number: index + 1,
        role_name: 'Dps',
      })),
    )
    expect(slotError).toBeNull()
    return { eventId, partyId, slotIds }
  }

  async function createGuestProfile(input: {
    eventId: string
    guestId?: string
    displayName: string
    characterName: string
    playerId?: string | null
  }): Promise<string> {
    const client = getTestServiceClient()
    const guestId = input.guestId ?? `guest_${crypto.randomUUID()}`
    const { error: guestError } = await client.from('guests').insert({
      guild_id: tenant.guildId,
      discord_id: guestId,
      username: input.displayName,
      preferred_language: 'ko',
    })
    expect(guestError).toBeNull()
    const playerId = input.playerId ?? null
    const { error: profileError } = await client
      .from('event_guest_profiles')
      .insert({
        guild_id: tenant.guildId,
        event_id: input.eventId,
        discord_id: guestId,
        display_name: input.displayName,
        preferred_language: 'ko',
        albion_server: 'west',
        albion_player_id: playerId,
        albion_character_name: input.characterName,
        albion_guild_name: null,
        character_verified: Boolean(playerId),
      })
    expect(profileError).toBeNull()
    return guestId
  }

  async function assignGuest(input: {
    fixture: GuestEventFixture
    guestId: string
    slotId: string
    username: string
    idempotencyKey: string
    secretHash: string
  }) {
    return getTestServiceClient().rpc('assign_guest_event_slot', {
      p_guild_id: tenant.guildId,
      p_event_id: input.fixture.eventId,
      p_guest_id: input.guestId,
      p_slot_id: input.slotId,
      p_username: input.username,
      p_picks: {},
      p_idempotency_key: input.idempotencyKey,
      p_management_secret_hash: input.secretHash,
    })
  }

  it('atomically assigns, rotates recovery, prevents character reuse, and preserves withdrawn history', async () => {
    const client = getTestServiceClient()
    const fixture = await createEvent()
    const guestId = await createGuestProfile({
      eventId: fixture.eventId,
      displayName: 'Guest One',
      characterName: 'GuestCharacter',
      playerId: 'official-player-one',
    })
    const idempotencyKey = crypto.randomUUID()

    const first = await assignGuest({
      fixture,
      guestId,
      slotId: fixture.slotIds[0],
      username: 'Guest One',
      idempotencyKey,
      secretHash: 'a'.repeat(64),
    })
    expect(first.error).toBeNull()
    expect(first.data).toMatchObject({
      status: 'assigned',
      replayed: false,
    })

    const { data: application, error: applicationError } = await client
      .from('event_guest_applications')
      .select('id, status, albion_player_id')
      .eq('guild_id', tenant.guildId)
      .eq('event_id', fixture.eventId)
      .eq('guest_id', guestId)
      .single()
    expect(applicationError).toBeNull()
    expect(application).toMatchObject({
      status: 'assigned',
      albion_player_id: 'official-player-one',
    })
    const { data: assignedSlot } = await client
      .from('slots')
      .select('assigned_discord_id')
      .eq('guild_id', tenant.guildId)
      .eq('id', fixture.slotIds[0])
      .single()
    expect(assignedSlot?.assigned_discord_id).toBe(guestId)

    const replay = await assignGuest({
      fixture,
      guestId,
      slotId: fixture.slotIds[0],
      username: 'Guest One',
      idempotencyKey,
      secretHash: 'b'.repeat(64),
    })
    expect(replay.error).toBeNull()
    expect(replay.data).toMatchObject({
      application_id: application?.id,
      status: 'assigned',
      replayed: true,
    })
    const { data: grants } = await client
      .from('event_guest_management_grants')
      .select('secret_hash, revoked_at')
      .eq('guild_id', tenant.guildId)
      .eq('application_id', application!.id)
      .order('created_at')
    expect(grants).toEqual([
      { secret_hash: 'a'.repeat(64), revoked_at: expect.any(String) },
      { secret_hash: 'b'.repeat(64), revoked_at: null },
    ])

    const duplicateGuestId = await createGuestProfile({
      eventId: fixture.eventId,
      displayName: 'Impersonator',
      characterName: 'GuestCharacter',
      playerId: 'official-player-one',
    })
    const duplicate = await assignGuest({
      fixture,
      guestId: duplicateGuestId,
      slotId: fixture.slotIds[1],
      username: 'Impersonator',
      idempotencyKey: crypto.randomUUID(),
      secretHash: 'c'.repeat(64),
    })
    expect(duplicate.error?.message).toContain(
      'GUEST_CHARACTER_ALREADY_APPLIED',
    )
    const { count: duplicateApplications } = await client
      .from('event_guest_applications')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', tenant.guildId)
      .eq('guest_id', duplicateGuestId)
    expect(duplicateApplications).toBe(0)

    const cancelled = await client.rpc('cancel_guest_event_application', {
      p_guild_id: tenant.guildId,
      p_event_id: fixture.eventId,
      p_guest_id: guestId,
    })
    expect(cancelled.error).toBeNull()
    const [{ data: withdrawn }, { data: activeGrant }, { data: clearedSlot }] =
      await Promise.all([
        client
          .from('event_guest_applications')
          .select('id, status, cancellation_reason, cancelled_at')
          .eq('guild_id', tenant.guildId)
          .eq('event_id', fixture.eventId)
          .eq('guest_id', guestId)
          .single(),
        client
          .from('event_guest_management_grants')
          .select('id')
          .eq('guild_id', tenant.guildId)
          .eq('application_id', application!.id)
          .is('revoked_at', null)
          .single(),
        client
          .from('slots')
          .select('assigned_discord_id')
          .eq('guild_id', tenant.guildId)
          .eq('id', fixture.slotIds[0])
          .single(),
      ])
    expect(withdrawn).toMatchObject({
      id: application?.id,
      status: 'withdrawn',
      cancellation_reason: 'guest_withdrawal',
      cancelled_at: expect.any(String),
    })
    expect(activeGrant?.id).toEqual(expect.any(String))
    expect(clearedSlot?.assigned_discord_id).toBeNull()
  })

  it('rolls back the losing side of a concurrent slot claim without partial recovery state', async () => {
    const client = getTestServiceClient()
    const fixture = await createEvent(1)
    const firstGuest = await createGuestProfile({
      eventId: fixture.eventId,
      displayName: 'First Guest',
      characterName: 'FirstCharacter',
    })
    const secondGuest = await createGuestProfile({
      eventId: fixture.eventId,
      displayName: 'Second Guest',
      characterName: 'SecondCharacter',
    })

    const results = await Promise.all([
      assignGuest({
        fixture,
        guestId: firstGuest,
        slotId: fixture.slotIds[0],
        username: 'First Guest',
        idempotencyKey: crypto.randomUUID(),
        secretHash: 'd'.repeat(64),
      }),
      assignGuest({
        fixture,
        guestId: secondGuest,
        slotId: fixture.slotIds[0],
        username: 'Second Guest',
        idempotencyKey: crypto.randomUUID(),
        secretHash: 'e'.repeat(64),
      }),
    ])
    expect(results.filter((result) => !result.error)).toHaveLength(1)
    expect(results.filter((result) => result.error)).toHaveLength(1)

    const [{ count: applicationCount }, { count: grantCount }] =
      await Promise.all([
        client
          .from('event_guest_applications')
          .select('id', { count: 'exact', head: true })
          .eq('guild_id', tenant.guildId)
          .eq('event_id', fixture.eventId),
        client
          .from('event_guest_management_grants')
          .select('id', { count: 'exact', head: true })
          .eq('guild_id', tenant.guildId)
          .eq('event_id', fixture.eventId),
      ])
    expect(applicationCount).toBe(1)
    expect(grantCount).toBe(1)
  })

  it('locks guest identity at start and enforces actual-participant manual death regear', async () => {
    const client = getTestServiceClient()
    const fixture = await createEvent(1)
    const guestId = await createGuestProfile({
      eventId: fixture.eventId,
      displayName: 'Confirmed Guest',
      characterName: 'ConfirmedCharacter',
    })
    const assigned = await assignGuest({
      fixture,
      guestId,
      slotId: fixture.slotIds[0],
      username: 'Confirmed Guest',
      idempotencyKey: crypto.randomUUID(),
      secretHash: 'f'.repeat(64),
    })
    expect(assigned.error).toBeNull()

    const startedAt = new Date(
      Date.now() - 2 * 60 * 60 * 1000,
    ).toISOString()
    const { error: startError } = await client
      .from('events')
      .update({ battle_started_at: startedAt })
      .eq('guild_id', tenant.guildId)
      .eq('id', fixture.eventId)
    expect(startError).toBeNull()

    const profileMutation = await client
      .from('event_guest_profiles')
      .update({ albion_character_name: 'ChangedAfterStart' })
      .eq('guild_id', tenant.guildId)
      .eq('event_id', fixture.eventId)
      .eq('discord_id', guestId)
    expect(profileMutation.error?.message).toContain(
      'event_guest_participation_locked',
    )
    const cancellation = await client.rpc(
      'cancel_guest_event_application',
      {
        p_guild_id: tenant.guildId,
        p_event_id: fixture.eventId,
        p_guest_id: guestId,
      },
    )
    expect(cancellation.error?.message).toContain(
      'event_regear_roster_locked',
    )

    const request = {
      guild_id: tenant.guildId,
      event_id: fixture.eventId,
      event_title_snapshot: 'Guest event',
      discord_id: guestId,
      username: 'Confirmed Guest',
      role_name: 'Dps',
      silver: 1_000,
      claimed_silver: 1_000,
      request_type: 'death',
      auto_generated: false,
    }
    const beforeCloseout = await client
      .from('regear_requests')
      .insert(request)
    expect(beforeCloseout.error?.message).toContain(
      'event_actual_participant_required',
    )

    const closeout = await client.rpc(
      'finalize_event_participation_closeout',
      {
        p_guild_id: tenant.guildId,
        p_event_id: fixture.eventId,
        p_idempotency_key: crypto.randomUUID(),
        p_reward_per_member: 0,
        p_memo: null,
        p_entries: [
          {
            discordId: guestId,
            username: 'Confirmed Guest',
            source: 'slot',
            included: true,
            roleNames: ['Dps'],
            evidenceStatus: 'not_checked',
            activityBattleCount: 0,
            note: null,
          },
        ],
        p_finalized_by: '100000000000000001',
        p_finalized_by_username: 'Officer',
      },
    )
    expect(closeout.error).toBeNull()

    const autoAttempt = await client.from('regear_requests').insert({
      ...request,
      auto_generated: true,
    })
    expect(autoAttempt.error?.message).toContain(
      'event_guest_auto_regear_forbidden',
    )
    const overchargeAttempt = await client.from('regear_requests').insert({
      ...request,
      request_type: 'overcharge',
    })
    expect(overchargeAttempt.error?.message).toContain(
      'event_guest_regear_death_only',
    )
    const manualDeath = await client
      .from('regear_requests')
      .insert(request)
      .select('id')
      .single()
    expect(manualDeath.error).toBeNull()
    expect(manualDeath.data?.id).toEqual(expect.any(String))
  })
})
