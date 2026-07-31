import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('retired member trial and absence data (mig 322)', () => {
  let tenant: TestTenant

  beforeEach(async () => {
    tenant = await createTestTenant('retired-member-operations')
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

  it('preserves read access while denying retired RPC and direct writes', async () => {
    const client = getTestServiceClient()
    await createMember('retired-member')

    const { error: trialRpcError } = await client.rpc('save_member_trial', {
      p_guild_id: tenant.guildId,
      p_discord_id: 'retired-member',
      p_status: 'trial',
      p_started_on: '2026-07-22',
      p_review_due_on: '2026-08-05',
      p_notes: '',
      p_actor: 'admin-1',
    })
    expect(trialRpcError).not.toBeNull()

    const { error: absenceRpcError } = await client.rpc(
      'create_member_absence',
      {
        p_guild_id: tenant.guildId,
        p_discord_id: 'retired-member',
        p_starts_on: '2026-08-05',
        p_ends_on: '2026-08-07',
        p_reason: '',
        p_today: '2026-07-22',
      },
    )
    expect(absenceRpcError).not.toBeNull()

    const { error: trialInsertError } = await client
      .from('member_trial_profiles')
      .insert({
        guild_id: tenant.guildId,
        discord_id: 'retired-member',
        status: 'trial',
        started_on: '2026-07-22',
        review_due_on: '2026-08-05',
        updated_by: 'admin-1',
      })
    expect(trialInsertError).not.toBeNull()

    const { error: absenceInsertError } = await client
      .from('member_absences')
      .insert({
        guild_id: tenant.guildId,
        discord_id: 'retired-member',
        starts_on: '2026-08-05',
        ends_on: '2026-08-07',
        created_by: 'retired-member',
      })
    expect(absenceInsertError).not.toBeNull()

    const [
      { data: trialRows, error: trialReadError },
      { data: absenceRows, error: absenceReadError },
    ] = await Promise.all([
      client
        .from('member_trial_profiles')
        .select('guild_id, discord_id')
        .eq('guild_id', tenant.guildId),
      client
        .from('member_absences')
        .select('guild_id, discord_id')
        .eq('guild_id', tenant.guildId),
    ])
    expect(trialReadError).toBeNull()
    expect(absenceReadError).toBeNull()
    expect(trialRows).toEqual([])
    expect(absenceRows).toEqual([])
  })
})
