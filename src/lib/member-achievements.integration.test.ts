import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'
import { extractWeaponCategory } from '@/lib/weapon-category'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('member achievement persistence and visibility (migs 308-310)', () => {
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

  it('keeps evidence idempotent, tenant-scoped, and immutable to service clients', async () => {
    const client = getTestServiceClient()
    const evidenceId = crypto.randomUUID()
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
      .select('id')
      .single()
    expect(inserted.error).toBeNull()
    expect(inserted.data?.id).toBeTruthy()

    const duplicate = await client.from('member_achievements').insert(row)
    expect(duplicate.error?.code).toBe('23505')

    const otherTenant = await client.from('member_achievements').insert({
      ...row,
      guild_id: tenantB.guildId,
    })
    expect(otherTenant.error).toBeNull()

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
