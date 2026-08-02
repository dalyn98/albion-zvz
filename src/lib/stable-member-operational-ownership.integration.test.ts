import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  enableTestTenantFeatures,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('stable member operational ownership (migration 358)', () => {
  let tenantA: TestTenant
  let tenantB: TestTenant

  beforeEach(async () => {
    tenantA = await createTestTenant(`stable-owner-a-${crypto.randomUUID().slice(0, 6)}`)
    tenantB = await createTestTenant(`stable-owner-b-${crypto.randomUUID().slice(0, 6)}`)
    await Promise.all([
      enableTestTenantFeatures(tenantA.guildId, ['guild_shop', 'member_market']),
      enableTestTenantFeatures(tenantB.guildId, ['guild_shop', 'member_market']),
    ])
  })

  afterEach(async () => {
    await tenantB?.cleanup()
    await tenantA?.cleanup()
  })

  async function createMember(guildId: string, subject: string): Promise<string> {
    const client = getTestServiceClient()
    const { error } = await client.from('guild_avatars').insert({
      guild_id: guildId,
      discord_id: subject,
      username: `Member ${subject}`,
      avatar: null,
    })
    expect(error).toBeNull()

    const { data, error: accessError } = await client
      .from('guild_member_access_identities')
      .select('guild_member_id')
      .eq('guild_id', guildId)
      .eq('identity_type', subject.startsWith('local:') ? 'local' : 'discord')
      .eq('subject_id', subject)
      .single()
    expect(accessError).toBeNull()
    return data!.guild_member_id as string
  }

  async function attachDiscordAlias(
    guildId: string,
    guildMemberId: string,
    subject: string,
  ): Promise<void> {
    const { data, error } = await getTestServiceClient().rpc(
      'attach_guild_member_access_identity',
      {
        p_guild_id: guildId,
        p_guild_member_id: guildMemberId,
        p_identity_type: 'discord',
        p_subject_id: subject,
        p_source: 'integration_stable_owner',
      },
    )
    expect(error).toBeNull()
    expect(data).toBe(guildMemberId)
  }

  it('reads local and Discord access subjects as one point account and work inbox', async () => {
    const client = getTestServiceClient()
    const localSubject = `local:${crypto.randomUUID()}`
    const discordAlias = `discord-${crypto.randomUUID()}`
    const memberId = await createMember(tenantA.guildId, localSubject)

    const point = await client.from('point_ledger').insert({
      guild_id: tenantA.guildId,
      discord_id: localSubject,
      delta: 1_000,
      reason: 'admin_adjust',
      memo: 'stable ownership seed',
    }).select('guild_member_id').single()
    expect(point.error).toBeNull()
    expect(point.data?.guild_member_id).toBe(memberId)

    const exchange = await client.from('exchange_requests').insert({
      guild_id: tenantA.guildId,
      discord_id: localSubject,
      username: 'Local member',
      silver: 200,
      held_points: 200,
      hold_status: 'held',
      held_at: new Date().toISOString(),
      status: 'pending',
    }).select('id,guild_member_id').single()
    expect(exchange.error).toBeNull()
    expect(exchange.data?.guild_member_id).toBe(memberId)

    const donation = await client.from('donation_requests').insert({
      guild_id: tenantA.guildId,
      discord_id: localSubject,
      username: 'Local member',
      silver: 500,
      screenshot_path: 'stable-owner/donation.webp',
      status: 'pending',
    }).select('id,guild_member_id').single()
    expect(donation.error).toBeNull()
    expect(donation.data?.guild_member_id).toBe(memberId)

    const shop = await client.from('shop_orders').insert({
      guild_id: tenantA.guildId,
      discord_id: localSubject,
      username: 'Local member',
      total_points: 100,
      status: 'pending',
    }).select('id,guild_member_id').single()
    expect(shop.error).toBeNull()
    expect(shop.data?.guild_member_id).toBe(memberId)

    await attachDiscordAlias(tenantA.guildId, memberId, discordAlias)

    const snapshot = await client.rpc('member_point_account_snapshot', {
      p_guild_id: tenantA.guildId,
      p_subject_id: discordAlias,
    })
    expect(snapshot.error).toBeNull()
    expect(snapshot.data).toMatchObject({
      guildMemberId: memberId,
      balance: 1_000,
      escrowed: 200,
      spendable: 800,
    })

    const spendable = await client.rpc('member_spendable_point_balance', {
      p_guild_id: tenantA.guildId,
      p_discord_id: discordAlias,
    })
    expect(spendable.error).toBeNull()
    expect(spendable.data).toBe(800)

    const inbox = await client.rpc('member_work_inbox_snapshot', {
      p_guild_id: tenantA.guildId,
      p_discord_id: discordAlias,
      p_include_history: true,
      p_history_limit: 50,
    })
    expect(inbox.error).toBeNull()
    expect(inbox.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ item_key: `exchange:${exchange.data?.id}` }),
      expect.objectContaining({ item_key: `donation:${donation.data?.id}` }),
      expect.objectContaining({ item_key: `shop:${shop.data?.id}` }),
    ]))

    const pendingCounts = await client.rpc('member_pending_request_counts', {
      p_guild_id: tenantA.guildId,
      p_discord_id: discordAlias,
    })
    expect(pendingCounts.error).toBeNull()
    expect(pendingCounts.data).toEqual([
      expect.objectContaining({ exchange: 1, donation: 1 }),
    ])

    const otherMember = await createMember(tenantB.guildId, discordAlias)
    expect(otherMember).not.toBe(memberId)
    expect((await client.from('point_ledger').insert({
      guild_id: tenantB.guildId,
      discord_id: discordAlias,
      delta: 9_000,
      reason: 'admin_adjust',
      memo: 'other tenant',
    })).error).toBeNull()
    const isolated = await client.rpc('member_point_account_snapshot', {
      p_guild_id: tenantA.guildId,
      p_subject_id: discordAlias,
    })
    expect(isolated.data).toMatchObject({ balance: 1_000, spendable: 800 })
  })

  it('projects unresolved historical work only after an exact identity is attached', async () => {
    const client = getTestServiceClient()
    const ownerSubject = `owner-${crypto.randomUUID()}`
    const lateSubject = `late-${crypto.randomUUID()}`
    const memberId = await createMember(tenantA.guildId, ownerSubject)

    const inserted = await client.from('donation_requests').insert({
      guild_id: tenantA.guildId,
      discord_id: lateSubject,
      username: 'Late identity',
      silver: 750,
      screenshot_path: 'stable-owner/late.webp',
      status: 'pending',
    }).select('id,guild_member_id').single()
    expect(inserted.error).toBeNull()
    expect(inserted.data?.guild_member_id).toBeNull()

    await attachDiscordAlias(tenantA.guildId, memberId, lateSubject)

    const projected = await client.from('donation_requests')
      .select('discord_id,guild_member_id')
      .eq('guild_id', tenantA.guildId)
      .eq('id', inserted.data?.id)
      .single()
    expect(projected.error).toBeNull()
    expect(projected.data).toEqual({
      discord_id: lateSubject,
      guild_member_id: memberId,
    })

    const otherMemberId = await createMember(
      tenantB.guildId,
      `other-${crypto.randomUUID()}`,
    )
    const spoofed = await client.from('point_ledger').insert({
      guild_id: tenantA.guildId,
      discord_id: ownerSubject,
      guild_member_id: otherMemberId,
      delta: 1,
      reason: 'admin_adjust',
      memo: 'must fail',
    })
    expect(spoofed.error?.message).toContain('GUILD_MEMBER_IDENTITY_MISMATCH')
  })

  it('keeps legacy subjects but converges stable ownership after a deliberate member merge', async () => {
    const client = getTestServiceClient()
    const targetSubject = `target-${crypto.randomUUID()}`
    const sourceSubject = `source-${crypto.randomUUID()}`
    const targetMemberId = await createMember(tenantA.guildId, targetSubject)
    const sourceMemberId = await createMember(tenantA.guildId, sourceSubject)
    expect(sourceMemberId).not.toBe(targetMemberId)

    const ledger = await client.from('point_ledger').insert({
      guild_id: tenantA.guildId,
      discord_id: sourceSubject,
      delta: 300,
      reason: 'admin_adjust',
      memo: 'merge history',
    }).select('id,guild_member_id').single()
    expect(ledger.data?.guild_member_id).toBe(sourceMemberId)

    const merged = await client.rpc('merge_guild_member_records', {
      p_guild_id: tenantA.guildId,
      p_source_guild_member_id: sourceMemberId,
      p_target_guild_member_id: targetMemberId,
    })
    expect(merged.error).toBeNull()
    expect(merged.data).toBe(true)

    const persisted = await client.from('point_ledger')
      .select('discord_id,guild_member_id')
      .eq('guild_id', tenantA.guildId)
      .eq('id', ledger.data?.id)
      .single()
    expect(persisted.data).toEqual({
      discord_id: sourceSubject,
      guild_member_id: targetMemberId,
    })

    const targetSnapshot = await client.rpc('member_point_account_snapshot', {
      p_guild_id: tenantA.guildId,
      p_subject_id: targetSubject,
    })
    const sourceSnapshot = await client.rpc('member_point_account_snapshot', {
      p_guild_id: tenantA.guildId,
      p_subject_id: sourceSubject,
    })
    expect(targetSnapshot.data).toMatchObject({
      guildMemberId: targetMemberId,
      balance: 300,
    })
    expect(sourceSnapshot.data).toEqual(targetSnapshot.data)
  })

  it('serializes pending exchange intake and payout across linked access subjects', async () => {
    const client = getTestServiceClient()
    const sourceSubject = `source-${crypto.randomUUID()}`
    const targetSubject = `target-${crypto.randomUUID()}`
    const sourceMemberId = await createMember(tenantA.guildId, sourceSubject)
    const targetMemberId = await createMember(tenantA.guildId, targetSubject)

    expect((await client.from('point_ledger').insert({
      guild_id: tenantA.guildId,
      discord_id: sourceSubject,
      delta: 1_000,
      reason: 'admin_adjust',
      memo: 'pre-link balance',
    })).error).toBeNull()

    const merged = await client.rpc('merge_guild_member_records', {
      p_guild_id: tenantA.guildId,
      p_source_guild_member_id: sourceMemberId,
      p_target_guild_member_id: targetMemberId,
    })
    expect(merged.error).toBeNull()

    const submitted = await client.rpc('submit_exchange_request', {
      p_guild_id: tenantA.guildId,
      p_discord_id: targetSubject,
      p_username: 'Target member',
      p_silver: 250,
    })
    expect(submitted.error).toBeNull()

    const duplicate = await client.rpc('submit_exchange_request', {
      p_guild_id: tenantA.guildId,
      p_discord_id: sourceSubject,
      p_username: 'Source alias',
      p_silver: 100,
    })
    expect(duplicate.error?.message).toContain('PENDING_EXCHANGE_EXISTS')

    const approved = await client.rpc('approve_exchange_request', {
      p_id: submitted.data,
      p_admin_id: 'integration-admin',
      p_admin_username: 'Integration Admin',
      p_guild_id: tenantA.guildId,
    })
    expect(approved.error).toBeNull()

    const sourceSnapshot = await client.rpc('member_point_account_snapshot', {
      p_guild_id: tenantA.guildId,
      p_subject_id: sourceSubject,
    })
    const targetSnapshot = await client.rpc('member_point_account_snapshot', {
      p_guild_id: tenantA.guildId,
      p_subject_id: targetSubject,
    })
    expect(sourceSnapshot.data).toMatchObject({
      guildMemberId: targetMemberId,
      balance: 750,
      escrowed: 0,
      spendable: 750,
    })
    expect(targetSnapshot.data).toEqual(sourceSnapshot.data)
  })
})
