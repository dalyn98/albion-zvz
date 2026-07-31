import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('verified character membership transfer (migration 323)', () => {
  let previousTenant: TestTenant
  let targetTenant: TestTenant

  beforeEach(async () => {
    previousTenant = await createTestTenant(
      `character-transfer-old-${crypto.randomUUID().slice(0, 8)}`,
    )
    targetTenant = await createTestTenant(
      `character-transfer-new-${crypto.randomUUID().slice(0, 8)}`,
    )
  })

  afterEach(async () => {
    await targetTenant?.cleanup()
    await previousTenant?.cleanup()
  })

  async function memberId(
    guildId: string,
    discordId: string,
  ): Promise<string> {
    const { data, error } = await getTestServiceClient()
      .from('guild_member_access_identities')
      .select('guild_member_id')
      .eq('guild_id', guildId)
      .eq('identity_type', 'discord')
      .eq('subject_id', discordId)
      .single()
    expect(error).toBeNull()
    return data?.guild_member_id as string
  }

  async function insertProfile(input: {
    discordId: string
    playerId: string
    playerName: string
  }): Promise<string> {
    const { data, error } = await getTestServiceClient()
      .from('account_albion_profiles')
      .insert({
        discord_id: input.discordId,
        albion_server: 'west',
        albion_player_id: input.playerId,
        albion_player_name: input.playerName,
        current_guild_id: 'official-home-guild',
        current_guild_name: 'Official Home Guild',
        is_primary: true,
        source: 'member_onboarding',
        verified_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    expect(error).toBeNull()
    return data?.id as string
  }

  it('atomically moves only the character period and preserves old business ownership', async () => {
    const client = getTestServiceClient()
    const playerId = `verified-transfer-${crypto.randomUUID()}`
    const previousDiscordId = '811111111111111111'
    const targetDiscordId = '822222222222222222'
    const observedAt = new Date().toISOString()

    const previousAvatar = await client.from('guild_avatars').insert({
      guild_id: previousTenant.guildId,
      discord_id: previousDiscordId,
      username: 'Previous Member',
      avatar: null,
      albion_server: 'west',
      albion_player_id: playerId,
      albion_nickname: 'TransferName',
      albion_verified_at: observedAt,
    })
    expect(previousAvatar.error).toBeNull()
    const previousMemberId = await memberId(
      previousTenant.guildId,
      previousDiscordId,
    )

    const previousProfileId = await insertProfile({
      discordId: previousDiscordId,
      playerId,
      playerName: 'TransferName',
    })
    const previousLink = await client
      .from('account_albion_tenant_links')
      .insert({
        guild_id: previousTenant.guildId,
        discord_id: previousDiscordId,
        profile_id: previousProfileId,
        albion_server: 'west',
        albion_player_id: playerId,
        albion_player_name: 'TransferName',
        current_guild_id: 'previous-home-guild',
        current_guild_name: 'Previous Home Guild',
        relation: 'home_guild',
        trust_status: 'trusted',
        status_reason: 'discord_role_and_roster_match',
        verified_at: observedAt,
        trusted_at: observedAt,
      })
    expect(previousLink.error).toBeNull()

    const eventId = crypto.randomUUID()
    const partyId = crypto.randomUUID()
    expect(
      (
        await client.from('events').insert({
          id: eventId,
          guild_id: previousTenant.guildId,
          title: 'Historical event',
          gather_time: '',
          gather_location: '',
          status: 'published',
          category: '전투',
        })
      ).error,
    ).toBeNull()
    expect(
      (
        await client.from('parties').insert({
          id: partyId,
          guild_id: previousTenant.guildId,
          event_id: eventId,
          party_number: 1,
        })
      ).error,
    ).toBeNull()
    const slotId = crypto.randomUUID()
    expect(
      (
        await client.from('slots').insert({
          id: slotId,
          guild_id: previousTenant.guildId,
          party_id: partyId,
          slot_number: 1,
          role_name: 'Healer',
          assigned_discord_id: previousDiscordId,
          assigned_username: 'Previous Member',
        })
      ).error,
    ).toBeNull()
    const regearId = crypto.randomUUID()
    expect(
      (
        await client.from('regear_requests').insert({
          id: regearId,
          guild_id: previousTenant.guildId,
          event_id: eventId,
          event_title_snapshot: 'Historical event',
          discord_id: previousDiscordId,
          username: 'Previous Member',
          role_name: 'Healer',
          silver: 1_000,
          claimed_silver: 1_000,
        })
      ).error,
    ).toBeNull()
    expect(
      (
        await client.from('point_ledger').insert({
          guild_id: previousTenant.guildId,
          discord_id: previousDiscordId,
          delta: 50,
          reason: 'admin_adjust',
          memo: 'Historical balance',
        })
      ).error,
    ).toBeNull()

    const targetAvatar = await client.from('guild_avatars').insert({
      guild_id: targetTenant.guildId,
      discord_id: targetDiscordId,
      username: 'Target Member',
      avatar: null,
      albion_server: 'west',
      albion_player_id: playerId,
      albion_nickname: 'TransferName',
      albion_verified_at: null,
    })
    expect(targetAvatar.error).toBeNull()
    const targetMemberId = await memberId(
      targetTenant.guildId,
      targetDiscordId,
    )
    const targetProfileId = await insertProfile({
      discordId: targetDiscordId,
      playerId,
      playerName: 'TransferName',
    })

    const targetLink = await client
      .from('account_albion_tenant_links')
      .insert({
        guild_id: targetTenant.guildId,
        discord_id: targetDiscordId,
        profile_id: targetProfileId,
        albion_server: 'west',
        albion_player_id: playerId,
        albion_player_name: 'TransferName',
        current_guild_id: 'official-home-guild',
        current_guild_name: 'Official Home Guild',
        relation: 'home_guild',
        trust_status: 'trusted',
        status_reason: 'discord_role_and_roster_match',
        verified_at: observedAt,
        trusted_at: observedAt,
      })
    expect(targetLink.error).toBeNull()

    const [
      memberships,
      previousMember,
      targetMember,
      previousAccess,
      previousAvatarAfter,
      previousLinkAfter,
      slot,
      regear,
      ledger,
      conflicts,
      auditRows,
    ] = await Promise.all([
      client
        .from('guild_character_memberships')
        .select(
          'guild_id, guild_member_id, ended_at, ended_reason, relation, trust_status',
        )
        .eq('albion_server', 'west')
        .eq('albion_player_id', playerId)
        .order('started_at'),
      client
        .from('guild_member_records')
        .select('id, status, withdrawn_at')
        .eq('guild_id', previousTenant.guildId)
        .eq('id', previousMemberId)
        .single(),
      client
        .from('guild_member_records')
        .select('id, status, withdrawn_at')
        .eq('guild_id', targetTenant.guildId)
        .eq('id', targetMemberId)
        .single(),
      client
        .from('guild_member_access_identities')
        .select('revoked_at')
        .eq('guild_id', previousTenant.guildId)
        .eq('guild_member_id', previousMemberId)
        .eq('identity_type', 'discord')
        .single(),
      client
        .from('guild_avatars')
        .select('withdrawn_at')
        .eq('guild_id', previousTenant.guildId)
        .eq('discord_id', previousDiscordId)
        .single(),
      client
        .from('account_albion_tenant_links')
        .select('relation, trust_status, status_reason, revoked_at')
        .eq('guild_id', previousTenant.guildId)
        .eq('discord_id', previousDiscordId)
        .single(),
      client
        .from('slots')
        .select('guild_id, assigned_discord_id, assigned_guild_member_id')
        .eq('id', slotId)
        .single(),
      client
        .from('regear_requests')
        .select('guild_id, discord_id, guild_member_id')
        .eq('id', regearId)
        .single(),
      client
        .from('point_ledger')
        .select('guild_id, discord_id, delta')
        .eq('guild_id', previousTenant.guildId)
        .eq('discord_id', previousDiscordId),
      client
        .from('guild_member_identity_conflicts')
        .select('conflict_type, status, resolved_at, diagnostic')
        .eq('guild_id', targetTenant.guildId)
        .eq('guild_member_id', targetMemberId)
        .eq('conflict_type', 'character_active_elsewhere'),
      client
        .from('admin_audit_log')
        .select('guild_id, action, target_id')
        .in('guild_id', [previousTenant.guildId, targetTenant.guildId])
        .in('action', [
          'member.character.transfer_out',
          'member.character.transfer_in',
        ])
        .order('action'),
    ])

    expect(memberships.error).toBeNull()
    expect(memberships.data).toHaveLength(2)
    expect(memberships.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          guild_id: previousTenant.guildId,
          guild_member_id: previousMemberId,
          ended_reason: 'character_transferred',
        }),
        expect.objectContaining({
          guild_id: targetTenant.guildId,
          guild_member_id: targetMemberId,
          ended_at: null,
          relation: 'home_guild',
          trust_status: 'trusted',
        }),
      ]),
    )
    expect(
      memberships.data?.filter((membership) => membership.ended_at === null),
    ).toHaveLength(1)

    expect(previousMember.error).toBeNull()
    expect(previousMember.data).toMatchObject({
      id: previousMemberId,
      status: 'withdrawn',
    })
    expect(previousMember.data?.withdrawn_at).not.toBeNull()
    expect(targetMember.error).toBeNull()
    expect(targetMember.data).toMatchObject({
      id: targetMemberId,
      status: 'active',
      withdrawn_at: null,
    })
    expect(previousAccess.data?.revoked_at).not.toBeNull()
    expect(previousAvatarAfter.data?.withdrawn_at).not.toBeNull()
    expect(previousLinkAfter.data).toMatchObject({
      relation: 'external',
      trust_status: 'revoked',
      status_reason: 'character_transferred',
    })
    expect(previousLinkAfter.data?.revoked_at).not.toBeNull()

    expect(slot.data).toEqual({
      guild_id: previousTenant.guildId,
      assigned_discord_id: previousDiscordId,
      assigned_guild_member_id: previousMemberId,
    })
    expect(regear.data).toEqual({
      guild_id: previousTenant.guildId,
      discord_id: previousDiscordId,
      guild_member_id: previousMemberId,
    })
    expect(ledger.data).toEqual([
      {
        guild_id: previousTenant.guildId,
        discord_id: previousDiscordId,
        delta: 50,
      },
    ])

    expect(conflicts.error).toBeNull()
    expect(conflicts.data).toHaveLength(1)
    expect(conflicts.data?.[0]).toMatchObject({
      conflict_type: 'character_active_elsewhere',
      status: 'resolved',
      diagnostic: {
        resolution: 'verified_home_guild_transfer',
      },
    })
    expect(conflicts.data?.[0]?.resolved_at).not.toBeNull()
    expect(auditRows.error).toBeNull()
    expect(auditRows.data).toEqual([
      {
        guild_id: targetTenant.guildId,
        action: 'member.character.transfer_in',
        target_id: targetMemberId,
      },
      {
        guild_id: previousTenant.guildId,
        action: 'member.character.transfer_out',
        target_id: previousMemberId,
      },
    ])
  })
})
