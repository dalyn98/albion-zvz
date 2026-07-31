import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'
import { extractWeaponCategory } from '@/lib/weapon-category'
import { loadMemberAchievements } from '@/lib/member-achievements'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('stable member achievement persistence and visibility (migs 308-310, 337)', () => {
  let tenantA: TestTenant
  let tenantB: TestTenant

  beforeEach(async () => {
    ;[tenantA, tenantB] = await Promise.all([
      createTestTenant('member-achievement-a'),
      createTestTenant('member-achievement-b'),
    ])
  })

  afterEach(async () => {
    await Promise.all([tenantA?.cleanup(), tenantB?.cleanup()])
  })

  async function createMember(guildId: string, discordId: string): Promise<string> {
    const client = getTestServiceClient()
    const { error } = await client.from('guild_avatars').insert({
      guild_id: guildId,
      discord_id: discordId,
      username: discordId,
      avatar: null,
      albion_server: 'west',
      albion_nickname: discordId,
    })
    expect(error).toBeNull()

    const { data, error: identityError } = await client
      .from('guild_member_access_identities')
      .select('guild_member_id')
      .eq('guild_id', guildId)
      .eq('identity_type', 'discord')
      .eq('subject_id', discordId)
      .single()
    expect(identityError).toBeNull()
    return data?.guild_member_id as string
  }

  it('keeps evidence idempotent, tenant-scoped, and immutable to service clients', async () => {
    const client = getTestServiceClient()
    const evidenceId = crypto.randomUUID()
    const tenantAMemberId = await createMember(tenantA.guildId, 'achievement-member')
    const tenantBMemberId = await createMember(tenantB.guildId, 'achievement-member')
    const row = {
      guild_id: tenantA.guildId,
      discord_id: 'achievement-member',
      achievement_key: 'team_victory',
      track: 'team',
      definition_version: 1,
      evidence_type: 'official_battle',
      evidence_id: evidenceId,
      evidence: { source: 'integration_test' },
      earned_at: '2026-07-20T00:00:00.000Z',
    }

    const inserted = await client
      .from('member_achievements')
      .insert(row)
      .select('id, guild_member_id')
      .single()
    expect(inserted.error).toBeNull()
    expect(inserted.data?.id).toBeTruthy()
    expect(inserted.data?.guild_member_id).toBe(tenantAMemberId)

    const duplicate = await client.from('member_achievements').insert(row)
    expect(duplicate.error?.code).toBe('23505')

    const otherTenant = await client.from('member_achievements').insert({
      ...row,
      guild_id: tenantB.guildId,
    }).select('guild_member_id').single()
    expect(otherTenant.error).toBeNull()
    expect(otherTenant.data?.guild_member_id).toBe(tenantBMemberId)
    expect(otherTenant.data?.guild_member_id).not.toBe(tenantAMemberId)

    const tenantARecords = await client
      .from('member_achievements')
      .select('guild_id, evidence_id')
      .eq('guild_id', tenantA.guildId)
    expect(tenantARecords.error).toBeNull()
    expect(tenantARecords.data).toEqual([
      { guild_id: tenantA.guildId, evidence_id: evidenceId },
    ])

    const update = await client
      .from('member_achievements')
      .update({ evidence: { source: 'tampered' } })
      .eq('id', inserted.data?.id)
    expect(update.error?.code).toBe('42501')

    const deletion = await client
      .from('member_achievements')
      .delete()
      .eq('id', inserted.data?.id)
    expect(deletion.error?.code).toBe('42501')
  })

  it('keeps achievements with the stable history subject when identities merge', async () => {
    const client = getTestServiceClient()
    const sourceDiscordId = `achievement-source-${crypto.randomUUID()}`
    const targetDiscordId = `achievement-target-${crypto.randomUUID()}`
    const sourceMemberId = await createMember(tenantA.guildId, sourceDiscordId)
    const targetMemberId = await createMember(tenantA.guildId, targetDiscordId)
    const evidenceId = crypto.randomUUID()

    const inserted = await client.from('member_achievements').insert({
      guild_id: tenantA.guildId,
      discord_id: sourceDiscordId,
      achievement_key: 'individual_kill_10',
      track: 'individual',
      definition_version: 1,
      evidence_type: 'official_kill_event',
      evidence_id: evidenceId,
      evidence: { source: 'integration_test' },
      earned_at: '2026-07-21T00:00:00.000Z',
    })
    expect(inserted.error).toBeNull()

    const merged = await client.rpc('merge_guild_member_records', {
      p_guild_id: tenantA.guildId,
      p_source_guild_member_id: sourceMemberId,
      p_target_guild_member_id: targetMemberId,
      p_observed_at: '2026-07-22T00:00:00.000Z',
    })
    expect(merged.error).toBeNull()

    const { data: stored, error: storedError } = await client
      .from('member_achievements')
      .select('guild_member_id, discord_id, evidence_id')
      .eq('guild_id', tenantA.guildId)
      .eq('evidence_id', evidenceId)
      .single()
    expect(storedError).toBeNull()
    expect(stored).toEqual({
      guild_member_id: targetMemberId,
      discord_id: sourceDiscordId,
      evidence_id: evidenceId,
    })

    const loadedForTarget = await loadMemberAchievements(
      client,
      tenantA.guildId,
      targetDiscordId,
    )
    expect(loadedForTarget).toEqual([
      expect.objectContaining({
        achievementKey: 'individual_kill_10',
        evidenceId,
      }),
    ])
  })

  it('requires activity sharing before separate leaderboard sharing can be enabled', async () => {
    const client = getTestServiceClient()
    const link = {
      guild_id: tenantA.guildId,
      discord_id: 'visibility-member',
      albion_server: 'west',
      albion_player_id: 'visibility-player',
      albion_player_name: 'Visibility Player',
      public_activity_enabled: false,
      public_leaderboard_enabled: false,
    }
    const inserted = await client
      .from('account_albion_tenant_links')
      .insert(link)
      .select('id')
      .single()
    expect(inserted.error).toBeNull()

    const rejected = await client
      .from('account_albion_tenant_links')
      .update({ public_leaderboard_enabled: true })
      .eq('id', inserted.data?.id)
    expect(rejected.error?.code).toBe('23514')

    const enabled = await client
      .from('account_albion_tenant_links')
      .update({
        public_activity_enabled: true,
        public_activity_enabled_at: '2026-07-20T00:00:00.000Z',
        public_leaderboard_enabled: true,
        public_leaderboard_enabled_at: '2026-07-20T00:00:00.000Z',
      })
      .eq('id', inserted.data?.id)
      .select('public_activity_enabled, public_leaderboard_enabled')
      .single()
    expect(enabled.error).toBeNull()
    expect(enabled.data).toEqual({
      public_activity_enabled: true,
      public_leaderboard_enabled: true,
    })

    const rejectedActivityDisable = await client
      .from('account_albion_tenant_links')
      .update({ public_activity_enabled: false })
      .eq('id', inserted.data?.id)
    expect(rejectedActivityDisable.error?.code).toBe('23514')
  })

  it('keeps the SQL observed-weapon resolver aligned with the app resolver', async () => {
    const client = getTestServiceClient()
    for (const itemType of [
      'T8_MAIN_SWORD@2',
      'T8_2H_HOLYSTAFF_MORGANA',
      'T8_MAIN_DAGGER_KEEPER',
      'T8_2H_SHAPESHIFTER_CRYSTAL',
      'T8_OFF_BOOK_AVALON',
    ]) {
      const result = await client.rpc('resolve_observed_weapon_category', {
        p_item_type: itemType,
      })
      expect(result.error).toBeNull()
      expect(result.data).toBe(extractWeaponCategory(itemType))
    }
  })
})
