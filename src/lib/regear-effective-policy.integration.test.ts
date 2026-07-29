import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

interface EventPolicyFixture {
  eventId: string
  partyId: string | null
  slotId: string | null
  policyVersionId: string
  startedAt: string
  config: Record<string, unknown>
  participant: Record<string, unknown>
}

async function createEventPolicyFixture(
  tenant: TestTenant,
  category: '전투' | 'FF' = '전투',
): Promise<EventPolicyFixture> {
  const client = getTestServiceClient()
  const eventId = crypto.randomUUID()
  const policyVersionId = crypto.randomUUID()
  const startedAt = new Date().toISOString()
  const discordId = category === '전투' ? 'combat-member' : 'ff-member'
  const username = category === '전투' ? 'Combat Member' : 'FF Member'

  const { error: eventError } = await client.from('events').insert({
    id: eventId,
    guild_id: tenant.guildId,
    title: `${category} effective regear policy`,
    gather_time: '',
    gather_location: '',
    status: 'published',
    category,
    regear_policy: 'role',
    regear_silver_cap: null,
    regear_max_deaths_per_member: null,
    regear_video_policy: 'inherit',
    regear_video_payout_rate_percent: null,
    regear_video_claim_ceiling_bonus_silver: null,
    regear_video_rate_applies_without_proof: false,
    regear_auto_policy: 'inherit',
  })
  expect(eventError).toBeNull()

  let partyId: string | null = null
  let slotId: string | null = null
  if (category === '전투') {
    partyId = crypto.randomUUID()
    slotId = crypto.randomUUID()
    const { error: partyError } = await client.from('parties').insert({
      id: partyId,
      guild_id: tenant.guildId,
      event_id: eventId,
      party_number: 1,
    })
    expect(partyError).toBeNull()
    const { error: slotError } = await client.from('slots').insert({
      id: slotId,
      guild_id: tenant.guildId,
      party_id: partyId,
      slot_number: 1,
      role_name: 'EngageDps',
      assigned_discord_id: discordId,
      assigned_username: username,
    })
    expect(slotError).toBeNull()
  } else {
    const { error: participantError } = await client
      .from('event_regear_participants')
      .insert({
        guild_id: tenant.guildId,
        event_id: eventId,
        discord_id: discordId,
        username,
        role_name: 'EngageDps',
      })
    expect(participantError).toBeNull()
  }

  return {
    eventId,
    partyId,
    slotId,
    policyVersionId,
    startedAt,
    config: {
      version: 1,
      scope: 'event',
      policyVersionId,
      capturedAt: startedAt,
      guildId: tenant.guildId,
      eventId,
      event: {
        category,
        policy: 'role',
        silverCap: null,
        maxDeathsPerMember: null,
        videoPolicy: 'inherit',
        videoPayoutRatePercent: null,
        videoClaimCeilingBonusSilver: null,
        videoRateAppliesWithoutProof: false,
        autoPolicy: 'inherit',
      },
      guild: {
        basePayoutRatePercent: 100,
        videoPayoutRatePercent: 100,
        videoClaimCeilingBonusSilver: 0,
        maxDeathsPerMember: 1,
      },
      roleRewards: [],
      roleOverrides: [],
      discordRolePolicy: { enabled: false, policies: [] },
      discordRoleRateFloors: [],
      freeWindow: null,
    },
    participant: {
      policyVersionId,
      discordId,
      username,
      roleName: 'EngageDps',
      manualExcluded: false,
      autoExcluded: category !== '전투',
      manualPolicy: { allowed: true },
      autoPolicy: { allowed: category === '전투' },
      sources: { scope: 'event' },
    },
  }
}

async function startFixture(
  tenant: TestTenant,
  fixture: EventPolicyFixture,
  participants: Record<string, unknown>[] = [fixture.participant],
) {
  return getTestServiceClient().rpc('start_event_with_regear_policy_snapshots', {
    p_guild_id: tenant.guildId,
    p_event_id: fixture.eventId,
    p_started_at: fixture.startedAt,
    p_policy_version_id: fixture.policyVersionId,
    p_policy_config_snapshot: fixture.config,
    p_participant_snapshots: participants,
  })
}

describeIntegration('effective regear policy snapshot invariants (migs 298-300)', () => {
  let tenant: TestTenant

  beforeEach(async () => {
    tenant = await createTestTenant('effective-regear-policy')
  })

  afterEach(async () => {
    await tenant?.cleanup()
  })

  it('atomically validates and freezes the combat roster and policy inputs', async () => {
    const client = getTestServiceClient()
    const fixture = await createEventPolicyFixture(tenant)
    const roleOverrides = [{
      roleName: 'EngageDps',
      enabled: true,
      silverCap: 1_000_000,
      payoutRatePercent: 100,
    }]

    const { error: replaceError } = await client.rpc(
      'replace_event_regear_role_overrides',
      {
        p_guild_id: tenant.guildId,
        p_event_id: fixture.eventId,
        p_rows: roleOverrides,
        p_updated_by: 'admin-1',
      },
    )
    expect(replaceError).toBeNull()

    const { error: staleConfigError } = await startFixture(tenant, fixture)
    expect(staleConfigError?.message).toContain('event_regear_policy_config_changed')
    fixture.config.roleOverrides = roleOverrides

    const { error: duplicateError } = await startFixture(tenant, fixture, [
      fixture.participant,
      fixture.participant,
    ])
    expect(duplicateError?.message).toContain('event_regear_roster_changed')

    const { data: beforeStart } = await client
      .from('events')
      .select('battle_started_at, regear_policy_version_id')
      .eq('guild_id', tenant.guildId)
      .eq('id', fixture.eventId)
      .single()
    expect(beforeStart).toMatchObject({
      battle_started_at: null,
      regear_policy_version_id: null,
    })

    const { data: started, error: startError } = await startFixture(tenant, fixture)
    expect(startError).toBeNull()
    expect(started).toMatchObject({
      policy_version_id: fixture.policyVersionId,
      participant_snapshot_count: 1,
    })

    const { error: gearOnlyError } = await client
      .from('slots')
      .update({ notes: 'Gear-only edits remain available' })
      .eq('guild_id', tenant.guildId)
      .eq('id', fixture.slotId!)
    expect(gearOnlyError).toBeNull()

    const { error: roleMutationError } = await client
      .from('slots')
      .update({ role_name: 'Healer' })
      .eq('guild_id', tenant.guildId)
      .eq('id', fixture.slotId!)
    expect(roleMutationError?.message).toContain('event_regear_roster_locked')

    const { error: policyMutationError } = await client
      .from('events')
      .update({ regear_policy: 'disabled' })
      .eq('guild_id', tenant.guildId)
      .eq('id', fixture.eventId)
    expect(policyMutationError?.message).toContain('event_regear_policy_locked')

    const { error: overrideMutationError } = await client.rpc(
      'replace_event_regear_role_overrides',
      {
        p_guild_id: tenant.guildId,
        p_event_id: fixture.eventId,
        p_rows: [],
        p_updated_by: 'admin-1',
      },
    )
    expect(overrideMutationError?.message).toContain('event_regear_policy_locked')

    const { error: partyDeleteError } = await client
      .from('parties')
      .delete()
      .eq('guild_id', tenant.guildId)
      .eq('id', fixture.partyId!)
    expect(partyDeleteError?.message).toContain('event_regear_roster_locked')

    const otherTenant = await createTestTenant('effective-regear-policy-other')
    try {
      const crossTenantFixture = {
        ...fixture,
        config: {
          ...fixture.config,
          guildId: otherTenant.guildId,
        },
      }
      const { error: crossTenantError } = await startFixture(
        otherTenant,
        crossTenantFixture,
      )
      expect(crossTenantError?.message).toContain('event_not_found')
    } finally {
      await otherTenant.cleanup()
    }
  })

  it('adds a non-combat late exception and its policy snapshot in one transaction', async () => {
    const client = getTestServiceClient()
    const fixture = await createEventPolicyFixture(tenant, 'FF')
    const { error: startError } = await startFixture(tenant, fixture)
    expect(startError).toBeNull()

    const { error: unpairedInsertError } = await client
      .from('event_regear_participants')
      .insert({
        guild_id: tenant.guildId,
        event_id: fixture.eventId,
        discord_id: 'late-member',
        username: 'Late Member',
        role_name: 'Healer',
      })
    expect(unpairedInsertError?.message).toContain('event_regear_participant_locked')

    const { data: snapshotId, error: lateError } = await client.rpc(
      'add_event_regear_exception_participant',
      {
        p_guild_id: tenant.guildId,
        p_event_id: fixture.eventId,
        p_policy_version_id: fixture.policyVersionId,
        p_discord_id: 'late-member',
        p_username: 'Late Member',
        p_role_name: 'Healer',
        p_added_by: 'admin-1',
        p_added_by_username: 'Admin',
        p_manual_policy_snapshot: { allowed: true },
        p_auto_policy_snapshot: { allowed: false },
        p_source_snapshot: { scope: 'late-exception' },
      },
    )
    expect(lateError).toBeNull()
    expect(snapshotId).toEqual(expect.any(String))

    const [{ data: participant }, { data: snapshot }] = await Promise.all([
      client
        .from('event_regear_participants')
        .select('discord_id, role_name')
        .eq('guild_id', tenant.guildId)
        .eq('event_id', fixture.eventId)
        .eq('discord_id', 'late-member')
        .single(),
      client
        .from('event_regear_policy_snapshots')
        .select('id, policy_version_id, discord_id, role_name')
        .eq('guild_id', tenant.guildId)
        .eq('event_id', fixture.eventId)
        .eq('discord_id', 'late-member')
        .single(),
    ])
    expect(participant).toMatchObject({ discord_id: 'late-member', role_name: 'Healer' })
    expect(snapshot).toMatchObject({
      id: snapshotId,
      policy_version_id: fixture.policyVersionId,
      discord_id: 'late-member',
      role_name: 'Healer',
    })
  })

  it('rejects cross-scope request links while preserving history on event deletion', async () => {
    const client = getTestServiceClient()
    const fixture = await createEventPolicyFixture(tenant)
    const { error: startError } = await startFixture(tenant, fixture)
    expect(startError).toBeNull()

    const { data: snapshot } = await client
      .from('event_regear_policy_snapshots')
      .select('id')
      .eq('guild_id', tenant.guildId)
      .eq('event_id', fixture.eventId)
      .single()
    expect(snapshot?.id).toEqual(expect.any(String))

    const otherEventId = crypto.randomUUID()
    const { error: otherEventError } = await client.from('events').insert({
      id: otherEventId,
      guild_id: tenant.guildId,
      title: 'Other event',
      gather_time: '',
      gather_location: '',
      status: 'published',
      category: '전투',
    })
    expect(otherEventError).toBeNull()

    const requestBase = {
      guild_id: tenant.guildId,
      event_title_snapshot: 'Frozen event',
      username: 'Combat Member',
      role_name: 'EngageDps',
      silver: 1_000,
      claimed_silver: 1_000,
      auto_generated: false,
      event_regear_policy_snapshot_id: snapshot!.id,
    }
    const { error: wrongEventError } = await client.from('regear_requests').insert({
      ...requestBase,
      event_id: otherEventId,
      discord_id: 'wrong-event-member',
    })
    expect(wrongEventError?.message).toContain('regear_policy_snapshot_scope_mismatch')

    const { data: request, error: requestError } = await client
      .from('regear_requests')
      .insert({
        ...requestBase,
        event_id: fixture.eventId,
        discord_id: 'combat-member',
      })
      .select('id')
      .single()
    expect(requestError).toBeNull()

    const { error: deleteError } = await client
      .from('events')
      .delete()
      .eq('guild_id', tenant.guildId)
      .eq('id', fixture.eventId)
    expect(deleteError).toBeNull()

    const { data: preserved, error: preservedError } = await client
      .from('regear_requests')
      .select('event_id, event_regear_policy_snapshot_id, regear_origin_type')
      .eq('guild_id', tenant.guildId)
      .eq('id', request!.id)
      .single()
    expect(preservedError).toBeNull()
    expect(preserved).toEqual({
      event_id: null,
      event_regear_policy_snapshot_id: null,
      regear_origin_type: 'event',
    })
  })

  it('atomically links automatic requests to the same participant snapshot', async () => {
    const client = getTestServiceClient()
    const fixture = await createEventPolicyFixture(tenant)
    const { error: startError } = await startFixture(tenant, fixture)
    expect(startError).toBeNull()

    const { data: snapshot } = await client
      .from('event_regear_policy_snapshots')
      .select('id')
      .eq('guild_id', tenant.guildId)
      .eq('event_id', fixture.eventId)
      .eq('discord_id', 'combat-member')
      .single()

    const { data: requestId, error } = await client.rpc(
      'create_auto_regear_request_with_policy_snapshot',
      {
        p_guild_id: tenant.guildId,
        p_event_id: fixture.eventId,
        p_event_title: 'Automatic frozen policy',
        p_discord_id: 'combat-member',
        p_username: 'Combat Member',
        p_role_name: 'EngageDps',
        p_silver: 1_000,
        p_claimed_silver: 1_000,
        p_payout_silver: 1_000,
        p_killboard_event_id: 9_000_001,
        p_gear_breakdown: {},
        p_price_warning_level: null,
        p_fulfillment_mode: 'silver',
        p_build_snapshot: null,
        p_craft_requested_slots: null,
        p_regear_policy_snapshot: fixture.participant.autoPolicy,
        p_event_regear_policy_snapshot_id: snapshot!.id,
      },
    )
    expect(error).toBeNull()
    expect(requestId).toEqual(expect.any(String))

    const { data: request } = await client
      .from('regear_requests')
      .select('event_regear_policy_snapshot_id, regear_origin_type')
      .eq('guild_id', tenant.guildId)
      .eq('id', requestId as string)
      .single()
    expect(request).toEqual({
      event_regear_policy_snapshot_id: snapshot!.id,
      regear_origin_type: 'auto',
    })
  })
})
