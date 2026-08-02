import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  enableTestTenantFeatures,
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

describeIntegration('event participation closeout (migrations 301-302)', () => {
  let tenant: TestTenant

  beforeEach(async () => {
    tenant = await createTestTenant('participation-closeout')
    await enableTestTenantFeatures(tenant.guildId, ['guild_economy'])
  })

  afterEach(async () => {
    await tenant?.cleanup()
  })

  async function createEventFixture(options?: {
    assigned?: Array<{ discordId: string; username: string; role: string }>
    startedAt?: string | null
    title?: string
  }): Promise<EventFixture> {
    const client = getTestServiceClient()
    const eventId = crypto.randomUUID()
    const partyId = crypto.randomUUID()
    const assigned = options?.assigned ?? []
    const { error: eventError } = await client.from('events').insert({
      id: eventId,
      guild_id: tenant.guildId,
      title: options?.title ?? 'Participation closeout',
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

    const slotIds: string[] = []
    for (let index = 0; index < assigned.length; index += 1) {
      const member = assigned[index]
      const slotId = crypto.randomUUID()
      slotIds.push(slotId)
      const { error: slotError } = await client.from('slots').insert({
        id: slotId,
        guild_id: tenant.guildId,
        party_id: partyId,
        slot_number: index + 1,
        role_name: member.role,
        assigned_discord_id: member.discordId,
        assigned_username: member.username,
      })
      expect(slotError).toBeNull()
    }

    if (options?.startedAt) {
      const { error: startError } = await client
        .from('events')
        .update({ battle_started_at: options.startedAt })
        .eq('guild_id', tenant.guildId)
        .eq('id', eventId)
      expect(startError).toBeNull()
    }

    return { eventId, partyId, slotIds }
  }

  it('keeps requests tentative, cleans only assignment, and freezes unassigned availability', async () => {
    const client = getTestServiceClient()
    const fixture = await createEventFixture()
    const requestedId = `requested-${crypto.randomUUID()}`
    const remainingId = `remaining-${crypto.randomUUID()}`
    const slotId = crypto.randomUUID()
    const { error: slotError } = await client.from('slots').insert({
      id: slotId,
      guild_id: tenant.guildId,
      party_id: fixture.partyId,
      slot_number: 1,
      role_name: 'Healer',
    })
    expect(slotError).toBeNull()

    const { error: tentativeError } = await client
      .from('event_tentative_signups')
      .insert([
        {
          guild_id: tenant.guildId,
          event_id: fixture.eventId,
          discord_id: requestedId,
          username: 'Requested Member',
          possible_roles: ['Healer'],
        },
        {
          guild_id: tenant.guildId,
          event_id: fixture.eventId,
          discord_id: remainingId,
          username: 'Remaining Member',
          possible_roles: ['Sup', 'Healer'],
        },
      ])
    expect(tentativeError).toBeNull()

    const { error: requestError } = await client
      .from('slots')
      .update({
        requested_discord_id: requestedId,
        requested_username: 'Requested Member',
      })
      .eq('guild_id', tenant.guildId)
      .eq('id', slotId)
    expect(requestError).toBeNull()
    const { count: afterRequestCount } = await client
      .from('event_tentative_signups')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', tenant.guildId)
      .eq('event_id', fixture.eventId)
    expect(afterRequestCount).toBe(2)

    const { error: assignError } = await client
      .from('slots')
      .update({
        requested_discord_id: null,
        requested_username: null,
        assigned_discord_id: requestedId,
        assigned_username: 'Requested Member',
      })
      .eq('guild_id', tenant.guildId)
      .eq('id', slotId)
    expect(assignError).toBeNull()

    const { data: liveRows, error: liveError } = await client
      .from('event_tentative_signups')
      .select('discord_id')
      .eq('guild_id', tenant.guildId)
      .eq('event_id', fixture.eventId)
    expect(liveError).toBeNull()
    expect(liveRows?.map((row) => row.discord_id)).toEqual([remainingId])

    const startedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const { error: startError } = await client
      .from('events')
      .update({ battle_started_at: startedAt })
      .eq('guild_id', tenant.guildId)
      .eq('id', fixture.eventId)
    expect(startError).toBeNull()

    const { data: event } = await client
      .from('events')
      .select('tentative_snapshot_version_id, tentative_snapshotted_at')
      .eq('guild_id', tenant.guildId)
      .eq('id', fixture.eventId)
      .single()
    expect(event?.tentative_snapshot_version_id).toBeTruthy()
    expect(new Date(event!.tentative_snapshotted_at).toISOString()).toBe(startedAt)

    const { data: snapshots, error: snapshotError } = await client
      .from('event_tentative_signup_snapshots')
      .select('discord_id, possible_roles')
      .eq('guild_id', tenant.guildId)
      .eq('event_id', fixture.eventId)
    expect(snapshotError).toBeNull()
    expect(snapshots).toEqual([
      {
        discord_id: remainingId,
        possible_roles: ['Sup', 'Healer'],
      },
    ])

    const { error: postStartAssignmentError } = await client
      .from('slots')
      .update({
        assigned_discord_id: remainingId,
        assigned_username: 'Remaining Member',
      })
      .eq('guild_id', tenant.guildId)
      .eq('id', slotId)
    if (postStartAssignmentError?.message.includes('event_regear_roster_locked')) {
      expect(postStartAssignmentError.message).not.toContain(
        'event_tentative_recruitment_closed',
      )
    } else {
      expect(postStartAssignmentError?.message).toContain(
        'event_operational_composition_locked',
      )
    }

    const { data: snapshotsAfterAssignment } = await client
      .from('event_tentative_signup_snapshots')
      .select('discord_id')
      .eq('guild_id', tenant.guildId)
      .eq('event_id', fixture.eventId)
    expect(snapshotsAfterAssignment).toEqual([{ discord_id: remainingId }])

    const { error: lateInsertError } = await client
      .from('event_tentative_signups')
      .insert({
        guild_id: tenant.guildId,
        event_id: fixture.eventId,
        discord_id: `late-${crypto.randomUUID()}`,
        username: 'Late',
        possible_roles: ['Dps'],
      })
    expect(lateInsertError?.message).toContain(
      'event_tentative_recruitment_closed',
    )

    const { error: lateDeleteError } = await client
      .from('event_tentative_signups')
      .delete()
      .eq('guild_id', tenant.guildId)
      .eq('event_id', fixture.eventId)
      .eq('discord_id', remainingId)
    expect(lateDeleteError?.message).toContain(
      'event_tentative_recruitment_closed',
    )

    const { error: eventDeleteError } = await client
      .from('events')
      .delete()
      .eq('guild_id', tenant.guildId)
      .eq('id', fixture.eventId)
    expect(eventDeleteError?.message).toContain('event_operational_snapshot_locked')
  })

  it('closes recruitment when an event is inserted already started', async () => {
    const client = getTestServiceClient()
    const eventId = crypto.randomUUID()
    const startedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const { error: eventError } = await client.from('events').insert({
      id: eventId,
      guild_id: tenant.guildId,
      title: 'Already started',
      gather_time: '',
      gather_location: '',
      status: 'published',
      category: '전투',
      battle_started_at: startedAt,
    })
    expect(eventError).toBeNull()

    const { data: event, error: readError } = await client
      .from('events')
      .select('tentative_snapshot_version_id, tentative_snapshotted_at')
      .eq('guild_id', tenant.guildId)
      .eq('id', eventId)
      .single()
    expect(readError).toBeNull()
    expect(event?.tentative_snapshot_version_id).toBeTruthy()
    expect(new Date(event!.tentative_snapshotted_at).toISOString()).toBe(startedAt)

    const { error: signupError } = await client
      .from('event_tentative_signups')
      .insert({
        guild_id: tenant.guildId,
        event_id: eventId,
        discord_id: `late-${crypto.randomUUID()}`,
        username: 'Late',
        possible_roles: ['Healer'],
      })
    expect(signupError?.message).toContain('event_tentative_recruitment_closed')
  })

  it('atomically finalizes exact exceptions and remains idempotent and tenant-scoped', async () => {
    const client = getTestServiceClient()
    const assignedA = `assigned-a-${crypto.randomUUID()}`
    const assignedB = `assigned-b-${crypto.randomUUID()}`
    const manual = `manual-${crypto.randomUUID()}`
    const startedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const fixture = await createEventFixture({
      title: 'Atomic attendance',
      assigned: [
        { discordId: assignedA, username: 'Assigned A', role: 'Healer' },
        { discordId: assignedB, username: 'Assigned B', role: 'Sup' },
      ],
      startedAt,
    })
    const { error: avatarError } = await client.from('guild_avatars').insert({
      guild_id: tenant.guildId,
      discord_id: manual,
      username: 'Walk In',
    })
    expect(avatarError).toBeNull()

    const entries = [
      {
        discordId: assignedA,
        username: 'Ignored client name',
        source: 'slot',
        included: true,
        roleNames: ['wrong'],
        evidenceStatus: 'activity_confirmed',
        activityBattleCount: 2,
        note: null,
      },
      {
        discordId: assignedB,
        username: 'Assigned B',
        source: 'slot',
        included: false,
        roleNames: ['Sup'],
        evidenceStatus: 'activity_not_found',
        activityBattleCount: 0,
        note: 'no-show',
      },
      {
        discordId: manual,
        username: 'Forged client name',
        source: 'manual',
        included: true,
        roleNames: [],
        evidenceStatus: 'activity_only',
        activityBattleCount: 1,
        note: null,
      },
    ]
    const idempotencyKey = crypto.randomUUID()
    const rpcArgs = {
      p_guild_id: tenant.guildId,
      p_event_id: fixture.eventId,
      p_idempotency_key: idempotencyKey,
      p_reward_per_member: 1000,
      p_memo: 'confirmed once',
      p_entries: entries,
      p_finalized_by: 'admin-1',
      p_finalized_by_username: 'Admin',
    }
    const { data, error } = await client.rpc(
      'finalize_event_participation_closeout',
      rpcArgs,
    )
    expect(error).toBeNull()
    const result = data as {
      closeoutId: string
      participantCount: number
      totalReward: number
      replayed: boolean
    }
    expect(result).toMatchObject({
      participantCount: 2,
      totalReward: 2000,
      replayed: false,
    })

    const { data: savedEntries, error: entriesError } = await client
      .from('event_participation_closeout_entries')
      .select(
        'id, discord_id, username, source, decision, role_names, reward_amount',
      )
      .eq('guild_id', tenant.guildId)
      .eq('closeout_id', result.closeoutId)
      .order('discord_id')
    expect(entriesError).toBeNull()
    expect(savedEntries).toHaveLength(3)
    expect(
      savedEntries?.find((row) => row.discord_id === assignedA),
    ).toMatchObject({
      username: 'Assigned A',
      source: 'slot',
      decision: 'included',
      role_names: ['Healer'],
      reward_amount: 1000,
    })
    expect(
      savedEntries?.find((row) => row.discord_id === assignedB),
    ).toMatchObject({
      decision: 'excluded',
      reward_amount: 0,
    })
    expect(
      savedEntries?.find((row) => row.discord_id === manual),
    ).toMatchObject({
      username: 'Walk In',
      source: 'manual',
      decision: 'included',
    })

    const includedEntryIds = (savedEntries ?? [])
      .filter((row) => row.decision === 'included')
      .map((row) => row.id)
    const { data: ledgerRows, error: ledgerError } = await client
      .from('point_ledger')
      .select('discord_id, delta, reason, ref_id')
      .eq('guild_id', tenant.guildId)
      .in('ref_id', includedEntryIds)
      .order('discord_id')
    expect(ledgerError).toBeNull()
    expect(ledgerRows).toHaveLength(2)
    expect(ledgerRows?.every((row) => row.delta === 1000)).toBe(true)
    expect(
      ledgerRows?.every((row) => row.reason === 'event_payout_approved'),
    ).toBe(true)

    const { count: auditCount } = await client
      .from('admin_audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', tenant.guildId)
      .eq('action', 'event.participation.finalize')
      .eq('target_id', fixture.eventId)
    expect(auditCount).toBe(1)
    const { count: outboxCount } = await client
      .from('event_participation_notification_outbox')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', tenant.guildId)
      .eq('closeout_id', result.closeoutId)
    expect(outboxCount).toBe(2)

    const { data: replay, error: replayError } = await client.rpc(
      'finalize_event_participation_closeout',
      rpcArgs,
    )
    expect(replayError).toBeNull()
    expect(replay).toMatchObject({
      closeoutId: result.closeoutId,
      replayed: true,
    })

    const { count: closeoutCount } = await client
      .from('event_participation_closeouts')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', tenant.guildId)
      .eq('event_id', fixture.eventId)
    expect(closeoutCount).toBe(1)

    const { error: secondKeyError } = await client.rpc(
      'finalize_event_participation_closeout',
      {
        ...rpcArgs,
        p_idempotency_key: crypto.randomUUID(),
      },
    )
    expect(secondKeyError?.message).toContain(
      'event_participation_closeout_already_finalized',
    )

    const otherTenant = await createTestTenant('participation-other')
    try {
      const { error: crossTenantError } = await client.rpc(
        'finalize_event_participation_closeout',
        {
          ...rpcArgs,
          p_guild_id: otherTenant.guildId,
          p_idempotency_key: crypto.randomUUID(),
        },
      )
      expect(crossTenantError?.message).toContain('event_not_found')
    } finally {
      await otherTenant.cleanup()
    }

    const { data: claimed, error: claimError } = await client.rpc(
      'claim_event_participation_notification_outbox',
      {
        p_limit: 100,
        p_closeout_id: result.closeoutId,
        p_lease_seconds: 300,
      },
    )
    expect(claimError).toBeNull()
    expect(claimed).toHaveLength(2)
    const { data: claimedAgain, error: claimAgainError } = await client.rpc(
      'claim_event_participation_notification_outbox',
      {
        p_limit: 100,
        p_closeout_id: result.closeoutId,
        p_lease_seconds: 300,
      },
    )
    expect(claimAgainError).toBeNull()
    expect(claimedAgain).toHaveLength(0)
  })

  it('rolls back invalid rosters, blocks unresolved legacy payouts, and supports zero reward', async () => {
    const client = getTestServiceClient()
    const member = `member-${crypto.randomUUID()}`
    const startedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const invalidFixture = await createEventFixture({
      assigned: [{ discordId: member, username: 'Member', role: 'Healer' }],
      startedAt,
    })
    const invalidKey = crypto.randomUUID()
    const { error: invalidError } = await client.rpc(
      'finalize_event_participation_closeout',
      {
        p_guild_id: tenant.guildId,
        p_event_id: invalidFixture.eventId,
        p_idempotency_key: invalidKey,
        p_reward_per_member: 100,
        p_memo: null,
        p_entries: [],
        p_finalized_by: 'admin-1',
        p_finalized_by_username: 'Admin',
      },
    )
    expect(invalidError?.message).toContain(
      'event_participation_closeout_slot_roster_changed',
    )
    const { count: rolledBackCount } = await client
      .from('event_participation_closeouts')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', tenant.guildId)
      .eq('event_id', invalidFixture.eventId)
    expect(rolledBackCount).toBe(0)

    const legacyFixture = await createEventFixture({ startedAt })
    const { error: legacyInsertError } = await client
      .from('event_payout_requests')
      .insert({
        guild_id: tenant.guildId,
        event_id: legacyFixture.eventId,
        silver_per_member: 100,
        participants: [],
        participant_count: 0,
        total_silver: 0,
        status: 'pending',
        created_by: 'admin-1',
        created_by_username: 'Admin',
      })
    expect(legacyInsertError).toBeNull()
    const { error: legacyError } = await client.rpc(
      'finalize_event_participation_closeout',
      {
        p_guild_id: tenant.guildId,
        p_event_id: legacyFixture.eventId,
        p_idempotency_key: crypto.randomUUID(),
        p_reward_per_member: 0,
        p_memo: null,
        p_entries: [],
        p_finalized_by: 'admin-1',
        p_finalized_by_username: 'Admin',
      },
    )
    expect(legacyError?.message).toContain(
      'event_participation_closeout_legacy_payout_exists',
    )

    const tentativeOnlyFixture = await createEventFixture()
    const tentativeOnlyId = `tentative-only-${crypto.randomUUID()}`
    const { error: tentativeOnlyInsertError } = await client
      .from('event_tentative_signups')
      .insert({
        guild_id: tenant.guildId,
        event_id: tentativeOnlyFixture.eventId,
        discord_id: tentativeOnlyId,
        username: 'Tentative Only',
        possible_roles: ['Dps'],
      })
    expect(tentativeOnlyInsertError).toBeNull()
    const { error: tentativeOnlyStartError } = await client
      .from('events')
      .update({ battle_started_at: startedAt })
      .eq('guild_id', tenant.guildId)
      .eq('id', tentativeOnlyFixture.eventId)
    expect(tentativeOnlyStartError).toBeNull()

    const { error: tentativeOnlyCloseoutError } = await client.rpc(
      'finalize_event_participation_closeout',
      {
        p_guild_id: tenant.guildId,
        p_event_id: tentativeOnlyFixture.eventId,
        p_idempotency_key: crypto.randomUUID(),
        p_reward_per_member: 100,
        p_memo: null,
        p_entries: [
          {
            discordId: tentativeOnlyId,
            username: 'Tentative Only',
            source: 'manual',
            included: true,
            roleNames: ['Dps'],
            evidenceStatus: 'not_checked',
            activityBattleCount: 0,
            note: null,
          },
        ],
        p_finalized_by: 'admin-1',
        p_finalized_by_username: 'Admin',
      },
    )
    expect(tentativeOnlyCloseoutError?.message).toContain(
      'event_participation_closeout_manual_member_unknown',
    )
    const { count: tentativeOnlyCloseoutCount } = await client
      .from('event_participation_closeouts')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', tenant.guildId)
      .eq('event_id', tentativeOnlyFixture.eventId)
    expect(tentativeOnlyCloseoutCount).toBe(0)

    const zeroFixture = await createEventFixture({
      assigned: [{ discordId: member, username: 'Member', role: 'Healer' }],
      startedAt,
    })
    const { data: zeroData, error: zeroError } = await client.rpc(
      'finalize_event_participation_closeout',
      {
        p_guild_id: tenant.guildId,
        p_event_id: zeroFixture.eventId,
        p_idempotency_key: crypto.randomUUID(),
        p_reward_per_member: 0,
        p_memo: 'record only',
        p_entries: [
          {
            discordId: member,
            username: 'Member',
            source: 'slot',
            included: true,
            roleNames: ['Healer'],
            evidenceStatus: 'not_checked',
            activityBattleCount: 0,
            note: null,
          },
        ],
        p_finalized_by: 'admin-1',
        p_finalized_by_username: 'Admin',
      },
    )
    expect(zeroError).toBeNull()
    expect(zeroData).toMatchObject({
      participantCount: 1,
      totalReward: 0,
    })

    const { data: zeroEntries } = await client
      .from('event_participation_closeout_entries')
      .select('id')
      .eq('guild_id', tenant.guildId)
      .eq('event_id', zeroFixture.eventId)
    const zeroEntryIds = (zeroEntries ?? []).map((row) => row.id)
    const { count: zeroLedgerCount } = await client
      .from('point_ledger')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', tenant.guildId)
      .in('ref_id', zeroEntryIds)
    expect(zeroLedgerCount).toBe(0)
  })
})
