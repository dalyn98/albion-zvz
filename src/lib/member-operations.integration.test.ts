import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('member operations (mig 280)', () => {
  let tenant: TestTenant

  beforeEach(async () => {
    tenant = await createTestTenant('member-operations')
  })

  afterEach(async () => {
    await tenant?.cleanup()
  })

  async function createMember(discordId: string): Promise<void> {
    const client = getTestServiceClient()
    const { error } = await client.from('guild_avatars').insert({
      guild_id: tenant.guildId,
      discord_id: discordId,
      username: `Member ${discordId}`,
      avatar: null,
    })
    expect(error).toBeNull()
  }

  it('stores a bounded trial and preserves resolution time until status changes', async () => {
    const client = getTestServiceClient()
    await createMember('trial-member')

    const { error: trialError } = await client.rpc('save_member_trial', {
      p_guild_id: tenant.guildId,
      p_discord_id: 'trial-member',
      p_status: 'trial',
      p_started_on: '2026-07-22',
      p_review_due_on: '2026-08-05',
      p_notes: '',
      p_actor: 'admin-1',
    })
    expect(trialError).toBeNull()

    const originalResolution = '2026-07-30T12:34:56.000Z'
    const { error: seedResolutionError } = await client
      .from('member_trial_profiles')
      .update({ status: 'accepted', resolved_at: originalResolution, updated_by: 'admin-2' })
      .eq('guild_id', tenant.guildId)
      .eq('discord_id', 'trial-member')
    expect(seedResolutionError).toBeNull()

    const { error: sameStatusError } = await client.rpc('save_member_trial', {
      p_guild_id: tenant.guildId,
      p_discord_id: 'trial-member',
      p_status: 'accepted',
      p_started_on: '2026-07-22',
      p_review_due_on: '2026-08-06',
      p_notes: 'updated note',
      p_actor: 'admin-3',
    })
    expect(sameStatusError).toBeNull()

    const { data } = await client
      .from('member_trial_profiles')
      .select('status, started_on, review_due_on, resolved_at, notes')
      .eq('guild_id', tenant.guildId)
      .eq('discord_id', 'trial-member')
      .single()
    expect(data).toMatchObject({
      status: 'accepted',
      started_on: '2026-07-22',
      review_due_on: '2026-08-06',
      notes: 'updated note',
    })
    expect(new Date(data?.resolved_at as string).toISOString()).toBe(originalResolution)

    const { error: transitionError } = await client.rpc('save_member_trial', {
      p_guild_id: tenant.guildId,
      p_discord_id: 'trial-member',
      p_status: 'rejected',
      p_started_on: '2026-07-22',
      p_review_due_on: '2026-08-06',
      p_notes: 'final review',
      p_actor: 'admin-4',
    })
    expect(transitionError).toBeNull()
    const { data: transitioned } = await client
      .from('member_trial_profiles')
      .select('status, resolved_at')
      .eq('guild_id', tenant.guildId)
      .eq('discord_id', 'trial-member')
      .single()
    expect(transitioned?.status).toBe('rejected')
    expect(new Date(transitioned?.resolved_at as string).toISOString()).not.toBe(
      originalResolution,
    )
  })

  it('rejects cross-tenant members, invalid ranges, and forged absence actors', async () => {
    const client = getTestServiceClient()
    await createMember('available-member')
    const otherTenant = await createTestTenant('member-operations-other')
    try {
      const { error: crossTenantError } = await client.from('member_trial_profiles').insert({
        guild_id: otherTenant.guildId,
        discord_id: 'available-member',
        status: 'trial',
        started_on: '2026-07-22',
        review_due_on: '2026-08-05',
        updated_by: 'admin-1',
      })
      expect(crossTenantError).not.toBeNull()

      const { error: invalidRangeError } = await client.from('member_absences').insert({
        guild_id: tenant.guildId,
        discord_id: 'available-member',
        starts_on: '2026-07-22',
        ends_on: '2026-10-22',
        created_by: 'available-member',
      })
      expect(invalidRangeError).not.toBeNull()

      const { error: forgedActorError } = await client.from('member_absences').insert({
        guild_id: tenant.guildId,
        discord_id: 'available-member',
        starts_on: '2026-07-22',
        ends_on: '2026-07-25',
        created_by: 'other-member',
      })
      expect(forgedActorError).not.toBeNull()
    } finally {
      await otherTenant.cleanup()
    }
  })

  it('serializes self-service absence creation and rejects overlaps', async () => {
    const client = getTestServiceClient()
    await createMember('rpc-member')

    const { data: createdId, error: createError } = await client.rpc(
      'create_member_absence',
      {
        p_guild_id: tenant.guildId,
        p_discord_id: 'rpc-member',
        p_starts_on: '2026-07-21',
        p_ends_on: '2026-08-05',
        p_reason: 'Vacation',
        p_today: '2026-07-22',
      },
    )
    expect(createError).toBeNull()
    expect(createdId).toEqual(expect.any(String))

    const { error: overlapError } = await client.rpc(
      'create_member_absence',
      {
        p_guild_id: tenant.guildId,
        p_discord_id: 'rpc-member',
        p_starts_on: '2026-08-05',
        p_ends_on: '2026-08-07',
        p_reason: '',
        p_today: '2026-07-22',
      },
    )
    expect(overlapError?.message).toContain('ABSENCE_OVERLAP')
  })

  it('moves trial and absence ownership during an account merge', async () => {
    const client = getTestServiceClient()
    const sourceId = '111111111111111111'
    const targetId = '222222222222222222'
    await createMember(sourceId)
    await createMember(targetId)

    const { error: trialError } = await client.rpc('save_member_trial', {
      p_guild_id: tenant.guildId,
      p_discord_id: sourceId,
      p_status: 'trial',
      p_started_on: '2026-07-22',
      p_review_due_on: '2026-08-05',
      p_notes: 'merge me',
      p_actor: '333333333333333333',
    })
    expect(trialError).toBeNull()
    const { error: absenceError } = await client.rpc('create_member_absence', {
      p_guild_id: tenant.guildId,
      p_discord_id: sourceId,
      p_starts_on: '2026-08-10',
      p_ends_on: '2026-08-12',
      p_reason: 'away',
      p_today: '2026-07-22',
    })
    expect(absenceError).toBeNull()

    const { data: preview, error: previewError } = await client.rpc(
      'preview_member_account_merge',
      {
        p_guild_id: tenant.guildId,
        p_from_discord_id: sourceId,
        p_to_discord_id: targetId,
      },
    )
    expect(previewError).toBeNull()
    expect(preview).toMatchObject({
      canMerge: true,
      counts: { member_trial_profiles: 1, member_absences: 1 },
    })

    const { error: mergeError } = await client.rpc('merge_member_accounts', {
      p_guild_id: tenant.guildId,
      p_from_discord_id: sourceId,
      p_to_discord_id: targetId,
      p_actor_discord_id: '333333333333333333',
      p_reason: 'test merge',
    })
    expect(mergeError).toBeNull()

    const [{ data: trial }, { data: absences }] = await Promise.all([
      client
        .from('member_trial_profiles')
        .select('discord_id, notes')
        .eq('guild_id', tenant.guildId),
      client
        .from('member_absences')
        .select('discord_id, created_by, reason')
        .eq('guild_id', tenant.guildId),
    ])
    expect(trial).toEqual([{ discord_id: targetId, notes: 'merge me' }])
    expect(absences).toEqual([{
      discord_id: targetId,
      created_by: targetId,
      reason: 'away',
    }])
  })
})
