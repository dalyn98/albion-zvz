import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

interface AccessIdentityRow {
  guild_id: string
  guild_member_id: string
  identity_type: 'discord' | 'local'
  subject_id: string
  revoked_at: string | null
}

describeIntegration('stable guild member records (migs 315-318)', () => {
  let tenant: TestTenant
  const extraTenants: TestTenant[] = []

  beforeEach(async () => {
    tenant = await createTestTenant(`member-record-${crypto.randomUUID().slice(0, 8)}`)
  })

  afterEach(async () => {
    for (const extra of extraTenants.splice(0)) {
      await extra.cleanup()
    }
    await tenant?.cleanup()
  })

  async function createAvatar(
    guildId: string,
    discordId: string,
    input: {
      username?: string
      server?: 'west' | 'east' | 'europe'
      playerId?: string
      playerName?: string
      verifiedAt?: string | null
    } = {},
  ): Promise<void> {
    const { error } = await getTestServiceClient().from('guild_avatars').insert({
      guild_id: guildId,
      discord_id: discordId,
      username: input.username ?? `Member ${discordId}`,
      avatar: null,
      albion_server: input.server,
      albion_player_id: input.playerId,
      albion_nickname: input.playerName,
      albion_verified_at: input.verifiedAt,
    })
    expect(error).toBeNull()
  }

  async function getAccess(
    guildId: string,
    identityType: 'discord' | 'local',
    subjectId: string,
  ): Promise<AccessIdentityRow> {
    const { data, error } = await getTestServiceClient()
      .from('guild_member_access_identities')
      .select('guild_id, guild_member_id, identity_type, subject_id, revoked_at')
      .eq('guild_id', guildId)
      .eq('identity_type', identityType)
      .eq('subject_id', subjectId)
      .single()
    expect(error).toBeNull()
    return data as AccessIdentityRow
  }

  it('isolates records by tenant while allowing one Discord user in multiple guilds', async () => {
    const other = await createTestTenant(`member-record-other-${crypto.randomUUID().slice(0, 8)}`)
    extraTenants.push(other)
    const discordId = '711111111111111111'

    await createAvatar(tenant.guildId, discordId)
    await createAvatar(other.guildId, discordId)

    const [first, second] = await Promise.all([
      getAccess(tenant.guildId, 'discord', discordId),
      getAccess(other.guildId, 'discord', discordId),
    ])
    expect(first.guild_member_id).not.toBe(second.guild_member_id)

    const crossTenantInsert = await getTestServiceClient()
      .from('guild_member_access_identities')
      .insert({
        guild_id: other.guildId,
        guild_member_id: first.guild_member_id,
        identity_type: 'local',
        subject_id: `local:${crypto.randomUUID()}`,
        source: 'integration_test',
      })
    expect(crossTenantInsert.error?.code).toBe('23503')

    const regear = await getTestServiceClient().from('regear_requests').insert({
      guild_id: tenant.guildId,
      event_id: null,
      event_title_snapshot: 'Legacy ownership remains',
      discord_id: discordId,
      username: 'Legacy Member',
      role_name: 'Dps',
      silver: 1_000,
      claimed_silver: 1_000,
    })
    expect(regear.error).toBeNull()

    const ledger = await getTestServiceClient().from('point_ledger').insert({
      guild_id: tenant.guildId,
      discord_id: discordId,
      delta: 10,
      reason: 'admin_adjust',
      memo: 'Phase 2A legacy read regression',
    })
    expect(ledger.error).toBeNull()
  })

  it('blocks simultaneous active guild links for one official character', async () => {
    const other = await createTestTenant(`character-unique-${crypto.randomUUID().slice(0, 8)}`)
    extraTenants.push(other)
    await createAvatar(tenant.guildId, '722222222222222221')
    await createAvatar(other.guildId, '722222222222222222')
    const first = await getAccess(tenant.guildId, 'discord', '722222222222222221')
    const second = await getAccess(other.guildId, 'discord', '722222222222222222')

    const firstInsert = await getTestServiceClient()
      .from('guild_character_memberships')
      .insert({
        guild_id: tenant.guildId,
        guild_member_id: first.guild_member_id,
        albion_server: 'east',
        albion_player_id: 'official-player-shared',
        albion_player_name: 'MutableNameOne',
        relation: 'home_guild',
        trust_status: 'trusted',
        source: 'integration_test',
      })
    expect(firstInsert.error).toBeNull()

    const blocked = await getTestServiceClient()
      .from('guild_character_memberships')
      .insert({
        guild_id: other.guildId,
        guild_member_id: second.guild_member_id,
        albion_server: 'east',
        albion_player_id: 'official-player-shared',
        albion_player_name: 'CompletelyDifferentNickname',
        relation: 'home_guild',
        trust_status: 'trusted',
        source: 'integration_test',
      })
    expect(blocked.error?.code).toBe('23505')

    const endedAt = new Date(Date.now() + 1_000).toISOString()
    const close = await getTestServiceClient()
      .from('guild_character_memberships')
      .update({ ended_at: endedAt, ended_reason: 'transfer_test' })
      .eq('guild_id', tenant.guildId)
      .eq('guild_member_id', first.guild_member_id)
    expect(close.error).toBeNull()

    const afterClose = await getTestServiceClient()
      .from('guild_character_memberships')
      .insert({
        guild_id: other.guildId,
        guild_member_id: second.guild_member_id,
        albion_server: 'east',
        albion_player_id: 'official-player-shared',
        albion_player_name: 'CompletelyDifferentNickname',
        relation: 'home_guild',
        trust_status: 'trusted',
        source: 'integration_test',
      })
    expect(afterClose.error).toBeNull()
  })

  it('reactivates the same member UUID on same-guild rejoin and opens a new character period', async () => {
    const discordId = '733333333333333333'
    await createAvatar(tenant.guildId, discordId, {
      server: 'west',
      playerId: 'official-player-rejoin',
      playerName: 'BeforeLeave',
      verifiedAt: new Date().toISOString(),
    })
    const before = await getAccess(tenant.guildId, 'discord', discordId)

    const withdrawnAt = new Date(Date.now() + 1_000).toISOString()
    const withdraw = await getTestServiceClient()
      .from('guild_avatars')
      .update({ withdrawn_at: withdrawnAt, updated_at: withdrawnAt })
      .eq('guild_id', tenant.guildId)
      .eq('discord_id', discordId)
    expect(withdraw.error).toBeNull()

    const withdrawn = await getTestServiceClient()
      .from('guild_member_records')
      .select('id, status, withdrawn_at')
      .eq('guild_id', tenant.guildId)
      .eq('id', before.guild_member_id)
      .single()
    expect(withdrawn.error).toBeNull()
    expect(withdrawn.data?.status).toBe('withdrawn')
    expect(withdrawn.data?.withdrawn_at).not.toBeNull()

    const rejoinedAt = new Date(Date.now() + 2_000).toISOString()
    const rejoin = await getTestServiceClient()
      .from('guild_avatars')
      .update({ withdrawn_at: null, updated_at: rejoinedAt })
      .eq('guild_id', tenant.guildId)
      .eq('discord_id', discordId)
    expect(rejoin.error).toBeNull()

    const after = await getAccess(tenant.guildId, 'discord', discordId)
    expect(after.guild_member_id).toBe(before.guild_member_id)
    expect(after.revoked_at).toBeNull()

    const record = await getTestServiceClient()
      .from('guild_member_records')
      .select('id, status, withdrawn_at, last_reactivated_at')
      .eq('guild_id', tenant.guildId)
      .eq('id', before.guild_member_id)
      .single()
    expect(record.error).toBeNull()
    expect(record.data).toMatchObject({
      id: before.guild_member_id,
      status: 'active',
      withdrawn_at: null,
    })
    expect(record.data?.last_reactivated_at).not.toBeNull()

    const periods = await getTestServiceClient()
      .from('guild_character_memberships')
      .select('id, ended_at')
      .eq('guild_id', tenant.guildId)
      .eq('guild_member_id', before.guild_member_id)
      .eq('albion_player_id', 'official-player-rejoin')
      .order('started_at')
    expect(periods.error).toBeNull()
    expect(periods.data).toHaveLength(2)
    expect(periods.data?.filter((row) => row.ended_at === null)).toHaveLength(1)
  })

  it('attaches Discord to a local account without replacing its stable history subject', async () => {
    const client = getTestServiceClient()
    const localId = crypto.randomUUID()
    const localSubject = `local:${localId}`
    const discordId = '744444444444444444'

    const localInsert = await client.from('guild_local_accounts').insert({
      id: localId,
      guild_id: tenant.guildId,
      albion_server: 'europe',
      albion_player_id: 'official-player-local-link',
      albion_player_name: 'LocalMember',
      relation: 'home_guild',
      trust_status: 'trusted',
      password_hash: 'scrypt$test$hash',
    })
    expect(localInsert.error).toBeNull()
    await createAvatar(tenant.guildId, localSubject, {
      username: 'LocalMember',
      server: 'europe',
      playerId: 'official-player-local-link',
      playerName: 'LocalMember',
      verifiedAt: new Date().toISOString(),
    })
    const before = await getAccess(tenant.guildId, 'local', localSubject)

    const history = await client.from('point_ledger').insert({
      guild_id: tenant.guildId,
      discord_id: localSubject,
      delta: 25,
      reason: 'admin_adjust',
      memo: 'local history remains on compatibility identity',
    })
    expect(history.error).toBeNull()

    const link = await client
      .from('guild_local_accounts')
      .update({ linked_discord_id: discordId })
      .eq('guild_id', tenant.guildId)
      .eq('id', localId)
    expect(link.error).toBeNull()

    const discordAccess = await getAccess(tenant.guildId, 'discord', discordId)
    expect(discordAccess.guild_member_id).toBe(before.guild_member_id)

    const { data: identities, error: identitiesError } = await client
      .from('guild_member_access_identities')
      .select('identity_type, guild_member_id')
      .eq('guild_id', tenant.guildId)
      .eq('guild_member_id', before.guild_member_id)
      .order('identity_type')
    expect(identitiesError).toBeNull()
    expect(identities).toEqual([
      { identity_type: 'discord', guild_member_id: before.guild_member_id },
      { identity_type: 'local', guild_member_id: before.guild_member_id },
    ])

    const { data: ledgerRows, error: ledgerError } = await client
      .from('point_ledger')
      .select('discord_id, delta')
      .eq('guild_id', tenant.guildId)
      .eq('discord_id', localSubject)
    expect(ledgerError).toBeNull()
    expect(ledgerRows).toEqual([{ discord_id: localSubject, delta: 25 }])
  })

  it('dual-writes Albion links idempotently', async () => {
    const discordId = '755555555555555555'
    await createAvatar(tenant.guildId, discordId)
    const access = await getAccess(tenant.guildId, 'discord', discordId)
    const linkRow = {
      guild_id: tenant.guildId,
      discord_id: discordId,
      albion_server: 'west',
      albion_player_id: 'official-player-dual-write',
      albion_player_name: 'LinkedMember',
      current_guild_id: 'official-guild-id',
      relation: 'home_guild',
      trust_status: 'trusted',
      verified_at: new Date().toISOString(),
      trusted_at: new Date().toISOString(),
    }

    const first = await getTestServiceClient()
      .from('account_albion_tenant_links')
      .insert(linkRow)
    expect(first.error).toBeNull()
    const retry = await getTestServiceClient()
      .from('account_albion_tenant_links')
      .upsert(
        { ...linkRow, albion_player_name: 'RenamedButSameOfficialId' },
        { onConflict: 'guild_id,discord_id' },
      )
    expect(retry.error).toBeNull()

    const memberships = await getTestServiceClient()
      .from('guild_character_memberships')
      .select('guild_member_id, albion_player_id, albion_player_name, ended_at')
      .eq('guild_id', tenant.guildId)
      .eq('albion_player_id', 'official-player-dual-write')
    expect(memberships.error).toBeNull()
    expect(memberships.data).toEqual([
      {
        guild_member_id: access.guild_member_id,
        albion_player_id: 'official-player-dual-write',
        albion_player_name: 'RenamedButSameOfficialId',
        ended_at: null,
      },
    ])
  })

  it('keeps disputed character evidence unresolved instead of reopening a membership', async () => {
    const discordId = '755555555555555556'
    const playerId = 'official-player-disputed'
    await createAvatar(tenant.guildId, discordId, {
      server: 'west',
      playerId,
      playerName: 'DisputedMember',
    })
    const access = await getAccess(tenant.guildId, 'discord', discordId)

    const disputed = await getTestServiceClient()
      .from('account_albion_tenant_links')
      .insert({
        guild_id: tenant.guildId,
        discord_id: discordId,
        albion_server: 'west',
        albion_player_id: playerId,
        albion_player_name: 'DisputedMember',
        relation: 'home_guild',
        trust_status: 'disputed',
        disputed_at: new Date().toISOString(),
      })
    expect(disputed.error).toBeNull()

    const [memberships, conflicts] = await Promise.all([
      getTestServiceClient()
        .from('guild_character_memberships')
        .select('ended_at')
        .eq('guild_id', tenant.guildId)
        .eq('guild_member_id', access.guild_member_id)
        .eq('albion_player_id', playerId),
      getTestServiceClient()
        .from('guild_member_identity_conflicts')
        .select('status, conflict_type, diagnostic')
        .eq('guild_id', tenant.guildId)
        .eq('guild_member_id', access.guild_member_id)
        .eq('conflict_type', 'disputed_character_claim'),
    ])
    expect(memberships.error).toBeNull()
    expect(memberships.data).toHaveLength(1)
    expect(memberships.data?.[0]?.ended_at).not.toBeNull()
    expect(conflicts.error).toBeNull()
    expect(conflicts.data).toEqual([
      {
        status: 'unresolved',
        conflict_type: 'disputed_character_claim',
        diagnostic: {
          relation: 'home_guild',
          trustStatus: 'disputed',
          source: 'dual_write_account_albion_link',
        },
      },
    ])
  })

  it('keeps ambiguous backfill claims separate and retry-safe', async () => {
    const other = await createTestTenant(`ambiguous-backfill-${crypto.randomUUID().slice(0, 8)}`)
    extraTenants.push(other)
    const sharedPlayerId = 'official-player-ambiguous-backfill'
    await createAvatar(tenant.guildId, '766666666666666661', {
      server: 'east',
      playerId: sharedPlayerId,
      playerName: 'FirstClaim',
    })
    await createAvatar(other.guildId, '766666666666666662', {
      server: 'east',
      playerId: sharedPlayerId,
      playerName: 'SecondClaim',
    })

    const guildIds = [tenant.guildId, other.guildId]
    const client = getTestServiceClient()
    expect(
      (
        await client
          .from('guild_member_identity_conflicts')
          .delete()
          .in('guild_id', guildIds)
      ).error,
    ).toBeNull()
    expect(
      (
        await client
          .from('guild_character_memberships')
          .delete()
          .in('guild_id', guildIds)
      ).error,
    ).toBeNull()
    expect(
      (
        await client
          .from('guild_member_access_identities')
          .delete()
          .in('guild_id', guildIds)
      ).error,
    ).toBeNull()
    expect(
      (
        await client
          .from('guild_member_records')
          .delete()
          .in('guild_id', guildIds)
      ).error,
    ).toBeNull()

    const firstBackfill = await client.rpc('backfill_guild_member_records')
    expect(firstBackfill.error).toBeNull()
    const firstState = await Promise.all([
      client
        .from('guild_member_records')
        .select('id, guild_id')
        .in('guild_id', guildIds)
        .order('guild_id'),
      client
        .from('guild_character_memberships')
        .select('id')
        .in('guild_id', guildIds)
        .eq('albion_player_id', sharedPlayerId),
      client
        .from('guild_member_identity_conflicts')
        .select('id, guild_id, conflict_type')
        .in('guild_id', guildIds)
        .eq('conflict_type', 'ambiguous_legacy_active_character')
        .order('guild_id'),
    ])
    for (const result of firstState) expect(result.error).toBeNull()
    expect(firstState[0].data).toHaveLength(2)
    expect(firstState[1].data).toEqual([])
    expect(firstState[2].data).toHaveLength(2)

    const retry = await client.rpc('backfill_guild_member_records')
    expect(retry.error).toBeNull()
    const secondState = await Promise.all([
      client
        .from('guild_member_records')
        .select('id, guild_id')
        .in('guild_id', guildIds)
        .order('guild_id'),
      client
        .from('guild_character_memberships')
        .select('id')
        .in('guild_id', guildIds)
        .eq('albion_player_id', sharedPlayerId),
      client
        .from('guild_member_identity_conflicts')
        .select('id, guild_id, conflict_type')
        .in('guild_id', guildIds)
        .eq('conflict_type', 'ambiguous_legacy_active_character')
        .order('guild_id'),
    ])
    for (const result of secondState) expect(result.error).toBeNull()
    expect(secondState.map((result) => result.data)).toEqual(
      firstState.map((result) => result.data),
    )

    const firstAccess = await getAccess(
      tenant.guildId,
      'discord',
      '766666666666666661',
    )
    const invalidEvidence = await client.rpc(
      'sync_guild_character_membership',
      {
        p_guild_id: tenant.guildId,
        p_guild_member_id: firstAccess.guild_member_id,
        p_albion_server: 'east',
        p_albion_player_id: sharedPlayerId,
        p_albion_player_name: 'InvalidEvidence',
        p_relation: 'invalid_relation',
        p_trust_status: 'claimed',
        p_active: true,
        p_source: 'integration_test',
        p_observed_at: new Date().toISOString(),
      },
    )
    expect(invalidEvidence.error?.message).toContain(
      'INVALID_CHARACTER_RELATION',
    )

    for (const [guildId, discordId, username] of [
      [tenant.guildId, '766666666666666661', 'FirstClaimRefreshed'],
      [other.guildId, '766666666666666662', 'SecondClaimRefreshed'],
    ] as const) {
      const unrelatedAvatarUpdate = await client
        .from('guild_avatars')
        .update({ username })
        .eq('guild_id', guildId)
        .eq('discord_id', discordId)
      expect(unrelatedAvatarUpdate.error).toBeNull()
    }

    const [afterUpdates, conflictsAfterUpdates] = await Promise.all([
      client
        .from('guild_character_memberships')
        .select('id')
        .in('guild_id', guildIds)
        .eq('albion_player_id', sharedPlayerId),
      client
        .from('guild_member_identity_conflicts')
        .select('conflict_type')
        .in('guild_id', guildIds)
        .in('conflict_type', [
          'ambiguous_legacy_active_character',
          'character_active_elsewhere',
        ]),
    ])
    expect(afterUpdates.error).toBeNull()
    expect(afterUpdates.data).toEqual([])
    expect(conflictsAfterUpdates.error).toBeNull()
    expect(conflictsAfterUpdates.data).toHaveLength(2)
    expect(
      conflictsAfterUpdates.data?.every(
        (row) =>
          row.conflict_type === 'ambiguous_legacy_active_character',
      ),
    ).toBe(true)

    const simulatedLeakedPeriod = await client
      .from('guild_character_memberships')
      .insert({
        guild_id: tenant.guildId,
        guild_member_id: firstAccess.guild_member_id,
        albion_server: 'east',
        albion_player_id: sharedPlayerId,
        albion_player_name: 'FirstClaim',
        relation: 'unknown',
        trust_status: 'claimed',
        source: 'dual_write_guild_avatar',
      })
    expect(simulatedLeakedPeriod.error).toBeNull()

    const cleanup = await client.rpc(
      'close_unresolved_ambiguous_character_memberships',
      { p_observed_at: new Date().toISOString() },
    )
    expect(cleanup.error).toBeNull()
    expect(cleanup.data).toBe(1)

    const cleanedPeriod = await client
      .from('guild_character_memberships')
      .select('ended_at, ended_reason')
      .eq('guild_id', tenant.guildId)
      .eq('guild_member_id', firstAccess.guild_member_id)
      .eq('albion_player_id', sharedPlayerId)
      .single()
    expect(cleanedPeriod.error).toBeNull()
    expect(cleanedPeriod.data?.ended_at).not.toBeNull()
    expect(cleanedPeriod.data?.ended_reason).toBe(
      'unresolved_identity_conflict',
    )

    const cleanupRetry = await client.rpc(
      'close_unresolved_ambiguous_character_memberships',
      { p_observed_at: new Date().toISOString() },
    )
    expect(cleanupRetry.error).toBeNull()
    expect(cleanupRetry.data).toBe(0)
  })

  it('converges both Discord identities on the target UUID during existing account merge', async () => {
    const sourceId = '777777777777777771'
    const targetId = '777777777777777772'
    await createAvatar(tenant.guildId, sourceId)
    await createAvatar(tenant.guildId, targetId)
    const sourceBefore = await getAccess(tenant.guildId, 'discord', sourceId)
    const targetBefore = await getAccess(tenant.guildId, 'discord', targetId)
    expect(sourceBefore.guild_member_id).not.toBe(targetBefore.guild_member_id)

    const merge = await getTestServiceClient().rpc('merge_member_accounts', {
      p_guild_id: tenant.guildId,
      p_from_discord_id: sourceId,
      p_to_discord_id: targetId,
      p_actor_discord_id: '777777777777777773',
      p_reason: 'Phase 2A integration test',
    })
    expect(merge.error).toBeNull()

    const [sourceAfter, targetAfter] = await Promise.all([
      getAccess(tenant.guildId, 'discord', sourceId),
      getAccess(tenant.guildId, 'discord', targetId),
    ])
    expect(sourceAfter.guild_member_id).toBe(targetBefore.guild_member_id)
    expect(targetAfter.guild_member_id).toBe(targetBefore.guild_member_id)

    const sourceRecord = await getTestServiceClient()
      .from('guild_member_records')
      .select('status, merged_into_member_id')
      .eq('guild_id', tenant.guildId)
      .eq('id', sourceBefore.guild_member_id)
      .single()
    expect(sourceRecord.error).toBeNull()
    expect(sourceRecord.data).toEqual({
      status: 'merged',
      merged_into_member_id: targetBefore.guild_member_id,
    })
  })
})
