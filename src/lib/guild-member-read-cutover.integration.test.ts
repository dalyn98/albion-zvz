import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('stable guild member read cutover (migration 321)', () => {
  let tenant: TestTenant
  const extraTenants: TestTenant[] = []

  beforeEach(async () => {
    tenant = await createTestTenant(
      `member-read-cutover-${crypto.randomUUID().slice(0, 8)}`,
    )
  })

  afterEach(async () => {
    for (const extra of extraTenants.splice(0)) {
      await extra.cleanup()
    }
    await tenant?.cleanup()
  })

  async function createMember(
    target: TestTenant,
    discordId: string,
    username: string,
  ): Promise<string> {
    const client = getTestServiceClient()
    const { error } = await client.from('guild_avatars').insert({
      guild_id: target.guildId,
      discord_id: discordId,
      username,
      avatar: null,
      albion_server: 'west',
      albion_player_id: `player-${target.guildId}-${discordId}`,
      albion_nickname: `Albion ${username}`,
      albion_verified_at: new Date().toISOString(),
    })
    expect(error).toBeNull()
    const { data, error: accessError } = await client
      .from('guild_member_access_identities')
      .select('guild_member_id')
      .eq('guild_id', target.guildId)
      .eq('identity_type', 'discord')
      .eq('subject_id', discordId)
      .single()
    expect(accessError).toBeNull()
    return data?.guild_member_id as string
  }

  async function createEvent(target: TestTenant, title: string) {
    const client = getTestServiceClient()
    const eventId = crypto.randomUUID()
    const partyId = crypto.randomUUID()
    const { error: eventError } = await client.from('events').insert({
      id: eventId,
      guild_id: target.guildId,
      title,
      gather_time: '',
      gather_location: '',
      status: 'published',
      category: '전투',
      // This migration-321 fixture isolates stable ownership projection from
      // the migration-332 closeout gate. It represents an event created before
      // that additive requirement was enabled.
      participation_closeout_required: false,
    })
    expect(eventError).toBeNull()
    const { error: partyError } = await client.from('parties').insert({
      id: partyId,
      guild_id: target.guildId,
      event_id: eventId,
      party_number: 1,
    })
    expect(partyError).toBeNull()
    return { eventId, partyId }
  }

  it('projects member UUIDs onto event and regear writes while preserving contact IDs', async () => {
    const client = getTestServiceClient()
    const discordId = '711111111111111111'
    const memberId = await createMember(tenant, discordId, 'Projection Member')
    const event = await createEvent(tenant, 'Stable ownership')

    const slotId = crypto.randomUUID()
    const slotInsert = await client.from('slots').insert({
      id: slotId,
      guild_id: tenant.guildId,
      party_id: event.partyId,
      slot_number: 1,
      role_name: 'Healer',
      assigned_discord_id: discordId,
      assigned_username: 'Projection Member',
    })
    expect(slotInsert.error).toBeNull()

    const tentativeEvent = await createEvent(tenant, 'Tentative ownership')
    const tentativeInsert = await client.from('event_tentative_signups').insert({
      guild_id: tenant.guildId,
      event_id: tentativeEvent.eventId,
      discord_id: discordId,
      username: 'Projection Member',
      possible_roles: ['Healer'],
    })
    expect(tentativeInsert.error).toBeNull()

    const participantInsert = await client
      .from('event_regear_participants')
      .insert({
        guild_id: tenant.guildId,
        event_id: event.eventId,
        discord_id: discordId,
        username: 'Projection Member',
        role_name: 'Healer',
      })
    expect(participantInsert.error).toBeNull()

    const regearId = crypto.randomUUID()
    const regearInsert = await client.from('regear_requests').insert({
      id: regearId,
      guild_id: tenant.guildId,
      event_id: event.eventId,
      event_title_snapshot: 'Stable ownership',
      discord_id: discordId,
      username: 'Projection Member',
      role_name: 'Healer',
      silver: 1_000,
      claimed_silver: 1_000,
      screenshot_path: null,
    })
    expect(regearInsert.error).toBeNull()

    const [slot, tentative, participant, regear] = await Promise.all([
      client
        .from('slots')
        .select(
          'assigned_discord_id, assigned_guild_member_id, requested_guild_member_id',
        )
        .eq('guild_id', tenant.guildId)
        .eq('id', slotId)
        .single(),
      client
        .from('event_tentative_signups')
        .select('discord_id, guild_member_id')
        .eq('guild_id', tenant.guildId)
        .eq('event_id', tentativeEvent.eventId)
        .single(),
      client
        .from('event_regear_participants')
        .select('discord_id, guild_member_id')
        .eq('guild_id', tenant.guildId)
        .eq('event_id', event.eventId)
        .single(),
      client
        .from('regear_requests')
        .select('discord_id, guild_member_id')
        .eq('guild_id', tenant.guildId)
        .eq('id', regearId)
        .single(),
    ])
    for (const result of [slot, tentative, participant, regear]) {
      expect(result.error).toBeNull()
    }
    expect(slot.data).toMatchObject({
      assigned_discord_id: discordId,
      assigned_guild_member_id: memberId,
      requested_guild_member_id: null,
    })
    expect(tentative.data).toEqual({
      discord_id: discordId,
      guild_member_id: memberId,
    })
    expect(participant.data).toEqual({
      discord_id: discordId,
      guild_member_id: memberId,
    })
    expect(regear.data).toEqual({
      discord_id: discordId,
      guild_member_id: memberId,
    })
  })

  it('keeps guests nullable and rejects an explicitly mismatched member UUID', async () => {
    const client = getTestServiceClient()
    const memberDiscordId = '722222222222222222'
    const memberId = await createMember(
      tenant,
      memberDiscordId,
      'Member in tenant',
    )
    const other = await createTestTenant(
      `member-read-other-${crypto.randomUUID().slice(0, 8)}`,
    )
    extraTenants.push(other)
    const otherMemberId = await createMember(
      other,
      '733333333333333333',
      'Other tenant member',
    )
    expect(otherMemberId).not.toBe(memberId)

    const event = await createEvent(tenant, 'Guest ownership')
    const guestId = `guest:${crypto.randomUUID()}`
    const guest = await client.from('event_tentative_signups').insert({
      guild_id: tenant.guildId,
      event_id: event.eventId,
      discord_id: guestId,
      username: 'Invited guest',
      possible_roles: ['Dps'],
    })
    expect(guest.error).toBeNull()
    const guestRead = await client
      .from('event_tentative_signups')
      .select('guild_member_id')
      .eq('guild_id', tenant.guildId)
      .eq('event_id', event.eventId)
      .eq('discord_id', guestId)
      .single()
    expect(guestRead.error).toBeNull()
    expect(guestRead.data?.guild_member_id).toBeNull()

    const mismatch = await client.from('regear_requests').insert({
      guild_id: tenant.guildId,
      event_id: event.eventId,
      event_title_snapshot: 'Guest ownership',
      discord_id: memberDiscordId,
      guild_member_id: otherMemberId,
      username: 'Member in tenant',
      role_name: 'Dps',
      silver: 1_000,
      claimed_silver: 1_000,
      screenshot_path: null,
    })
    expect(mismatch.error?.message).toContain(
      'GUILD_MEMBER_IDENTITY_MISMATCH',
    )
  })

  it('uses the documented display priority and audits override changes atomically', async () => {
    const client = getTestServiceClient()
    const discordId = '744444444444444444'
    const memberId = await createMember(tenant, discordId, 'Discord Name')

    const before = await client
      .from('guild_member_directory_v1')
      .select(
        'guild_member_id, display_name, display_name_override, discord_id, discord_access_revoked_at',
      )
      .eq('guild_id', tenant.guildId)
      .eq('discord_id', discordId)
      .single()
    expect(before.error).toBeNull()
    expect(before.data).toMatchObject({
      guild_member_id: memberId,
      display_name: 'Albion Discord Name',
      display_name_override: null,
      discord_id: discordId,
      discord_access_revoked_at: null,
    })

    const actorId = '799999999999999999'
    const update = await client.rpc('set_guild_member_display_name', {
      p_guild_id: tenant.guildId,
      p_guild_member_id: memberId,
      p_display_name: '  Guild Label  ',
      p_actor_discord_id: actorId,
    })
    expect(update.error).toBeNull()
    expect(update.data).toMatchObject({
      guildMemberId: memberId,
      displayNameOverride: 'Guild Label',
    })

    const [after, audit] = await Promise.all([
      client
        .from('guild_member_directory_v1')
        .select('display_name, display_name_override')
        .eq('guild_id', tenant.guildId)
        .eq('guild_member_id', memberId)
        .single(),
      client
        .from('admin_audit_log')
        .select('admin_discord_id, action, target_id, target_kind, details')
        .eq('guild_id', tenant.guildId)
        .eq('target_id', memberId)
        .eq('action', 'member.display_name.update')
        .single(),
    ])
    expect(after.error).toBeNull()
    expect(after.data).toEqual({
      display_name: 'Guild Label',
      display_name_override: 'Guild Label',
    })
    expect(audit.error).toBeNull()
    expect(audit.data).toMatchObject({
      admin_discord_id: actorId,
      action: 'member.display_name.update',
      target_id: memberId,
      target_kind: 'member',
      details: {
        before: null,
        after: 'Guild Label',
      },
    })
  })
})
