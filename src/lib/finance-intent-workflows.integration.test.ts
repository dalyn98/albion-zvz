import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

async function createMember(guildId: string, discordId: string, username: string): Promise<void> {
  const { error } = await getTestServiceClient().from('guild_avatars').insert({
    guild_id: guildId,
    discord_id: discordId,
    username,
    avatar: null,
    albion_nickname: username,
    albion_server: 'west',
    albion_verified_at: new Date().toISOString(),
  })
  expect(error).toBeNull()
}

describeIntegration('finance intent workflows (migration 336)', () => {
  let tenantA: TestTenant
  let tenantB: TestTenant

  beforeEach(async () => {
    tenantA = await createTestTenant('finance-intent-a')
    tenantB = await createTestTenant('finance-intent-b')
  })

  afterEach(async () => {
    await tenantA?.cleanup()
    await tenantB?.cleanup()
  })

  it('holds exchange points at submission and resolves the hold atomically', async () => {
    const client = getTestServiceClient()
    const discordId = `exchange-${crypto.randomUUID()}`
    await createMember(tenantA.guildId, discordId, 'ExchangeHolder')
    await expect(client.from('point_ledger').insert({
      guild_id: tenantA.guildId,
      discord_id: discordId,
      delta: 1_000,
      reason: 'admin_adjust',
      memo: 'seed',
    })).resolves.toMatchObject({ error: null })

    const { error: legacyDirectInsertError } = await client
      .from('exchange_requests')
      .insert({
        guild_id: tenantA.guildId,
        discord_id: discordId,
        username: 'ExchangeHolder',
        silver: 600,
      })
    expect(legacyDirectInsertError?.message).toContain('EXCHANGE_SUBMIT_RPC_REQUIRED')

    const { data: requestId, error: submitError } = await client.rpc('submit_exchange_request', {
      p_guild_id: tenantA.guildId,
      p_discord_id: discordId,
      p_username: 'ExchangeHolder',
      p_silver: 600,
    })
    expect(submitError).toBeNull()
    expect(requestId).toEqual(expect.any(String))

    const { data: spendableAfterSubmit, error: balanceError } = await client.rpc(
      'member_spendable_point_balance',
      { p_guild_id: tenantA.guildId, p_discord_id: discordId },
    )
    expect(balanceError).toBeNull()
    expect(spendableAfterSubmit).toBe(400)

    const { error: legacyDirectUpdateError } = await client
      .from('exchange_requests')
      .update({ silver: 700 })
      .eq('guild_id', tenantA.guildId)
      .eq('id', requestId)
    expect(legacyDirectUpdateError?.message).toContain('EXCHANGE_PENDING_HOLD_REQUIRED')

    const { error: updateError } = await client.rpc('update_exchange_request_hold', {
      p_id: requestId,
      p_guild_id: tenantA.guildId,
      p_discord_id: discordId,
      p_silver: 800,
    })
    expect(updateError).toBeNull()
    const { data: updatedSpendable } = await client.rpc('member_spendable_point_balance', {
      p_guild_id: tenantA.guildId,
      p_discord_id: discordId,
    })
    expect(updatedSpendable).toBe(200)

    const { error: overdrawError } = await client.rpc('update_exchange_request_hold', {
      p_id: requestId,
      p_guild_id: tenantA.guildId,
      p_discord_id: discordId,
      p_silver: 1_200,
    })
    expect(overdrawError?.message).toContain('INSUFFICIENT_BALANCE')

    const { error: cancelError } = await client.rpc('cancel_exchange_request', {
      p_id: requestId,
      p_guild_id: tenantA.guildId,
      p_discord_id: discordId,
    })
    expect(cancelError).toBeNull()
    const [{ data: cancelled }, { data: spendableAfterCancel }] = await Promise.all([
      client
        .from('exchange_requests')
        .select('status, held_points, hold_status')
        .eq('guild_id', tenantA.guildId)
        .eq('id', requestId)
        .single(),
      client.rpc('member_spendable_point_balance', {
        p_guild_id: tenantA.guildId,
        p_discord_id: discordId,
      }),
    ])
    expect(cancelled).toMatchObject({ status: 'cancelled', held_points: 0, hold_status: 'released' })
    expect(spendableAfterCancel).toBe(1_000)

    const { data: payoutRequestId, error: payoutSubmitError } = await client.rpc(
      'submit_exchange_request',
      {
        p_guild_id: tenantA.guildId,
        p_discord_id: discordId,
        p_username: 'ExchangeHolder',
        p_silver: 500,
      },
    )
    expect(payoutSubmitError).toBeNull()
    const { error: approveError } = await client.rpc('approve_exchange_request', {
      p_id: payoutRequestId,
      p_admin_id: 'admin-1',
      p_admin_username: 'Finance Officer',
      p_guild_id: tenantA.guildId,
    })
    expect(approveError).toBeNull()

    const [{ data: approved }, { data: ledgers }] = await Promise.all([
      client
        .from('exchange_requests')
        .select('status, held_points, hold_status')
        .eq('guild_id', tenantA.guildId)
        .eq('id', payoutRequestId)
        .single(),
      client
        .from('point_ledger')
        .select('delta, reason')
        .eq('guild_id', tenantA.guildId)
        .eq('discord_id', discordId)
        .order('created_at'),
    ])
    expect(approved).toMatchObject({ status: 'approved', held_points: 0, hold_status: 'consumed' })
    expect(ledgers).toEqual(expect.arrayContaining([
      expect.objectContaining({ delta: -500, reason: 'exchange_paid' }),
    ]))
  })

  it('lets an exact member allocate raw treasury evidence once without crossing tenants', async () => {
    const client = getTestServiceClient()
    const discordId = `treasury-${crypto.randomUUID()}`
    await createMember(tenantA.guildId, discordId, 'TreasuryMember')
    const fingerprint = 'a'.repeat(64)
    const { data: deposit, error: depositError } = await client
      .from('guild_treasury_deposits')
      .insert({
        guild_id: tenantA.guildId,
        deposited_at: '2026-08-01T03:00:00Z',
        depositor_name: 'TreasuryMember',
        amount_silver: 25_000,
        source_fingerprint: fingerprint,
        imported_by: 'admin-1',
      })
      .select('id')
      .single()
    expect(depositError).toBeNull()
    await expect(client.from('guild_treasury_deposits').insert({
      guild_id: tenantB.guildId,
      deposited_at: '2026-08-01T03:00:00Z',
      depositor_name: 'TreasuryMember',
      amount_silver: 25_000,
      source_fingerprint: fingerprint,
      imported_by: 'admin-2',
    })).resolves.toMatchObject({ error: null })

    const idempotencyKey = crypto.randomUUID()
    const allocateArgs = {
      p_guild_id: tenantA.guildId,
      p_deposit_id: deposit!.id,
      p_discord_id: discordId,
      p_expected_depositor_name: 'TreasuryMember',
      p_purpose: 'point_top_up',
      p_purpose_note: 'shop points',
      p_idempotency_key: idempotencyKey,
    }
    const { data: first, error: firstError } = await client.rpc(
      'allocate_treasury_deposit',
      allocateArgs,
    )
    expect(firstError).toBeNull()
    expect(first).toMatchObject({ status: 'auto_credited', amountSilver: 25_000 })
    const { data: retried, error: retryError } = await client.rpc(
      'allocate_treasury_deposit',
      allocateArgs,
    )
    expect(retryError).toBeNull()
    expect(retried).toEqual(first)

    const [{ data: ledger }, { data: allocations }] = await Promise.all([
      client
        .from('point_ledger')
        .select('delta, reason')
        .eq('guild_id', tenantA.guildId)
        .eq('discord_id', discordId),
      client
        .from('treasury_deposit_allocations')
        .select('guild_id, deposit_id, discord_id, status')
        .eq('guild_id', tenantA.guildId),
    ])
    expect(ledger).toEqual([{ delta: 25_000, reason: 'donation_approved' }])
    expect(allocations).toHaveLength(1)

    const { error: crossTenantError } = await client.rpc('allocate_treasury_deposit', {
      ...allocateArgs,
      p_guild_id: tenantB.guildId,
      p_idempotency_key: crypto.randomUUID(),
    })
    expect(crossTenantError?.message).toContain('TREASURY_DEPOSIT_NOT_FOUND')
  })

  it('grants one equal special reward batch idempotently to active members only', async () => {
    const client = getTestServiceClient()
    const memberA = `reward-a-${crypto.randomUUID()}`
    const memberB = `reward-b-${crypto.randomUUID()}`
    const outsider = `reward-x-${crypto.randomUUID()}`
    await createMember(tenantA.guildId, memberA, 'Reward Alpha')
    await createMember(tenantA.guildId, memberB, 'Reward Beta')
    await createMember(tenantB.guildId, outsider, 'Reward Outsider')
    const idempotencyKey = crypto.randomUUID()
    const args = {
      p_guild_id: tenantA.guildId,
      p_discord_ids: [memberA, memberB],
      p_amount_per_member: 12_500,
      p_memo: 'Tournament special reward',
      p_actor_discord_id: 'guild-owner',
      p_actor_username: 'Guild Owner',
      p_idempotency_key: idempotencyKey,
      p_confirmation: 'SPECIAL REWARD',
    }
    const { data: first, error: firstError } = await client.rpc('grant_special_reward', args)
    expect(firstError).toBeNull()
    expect(first).toMatchObject({ recipientCount: 2, totalPoints: 25_000, replayed: false })
    const { data: retried, error: retryError } = await client.rpc('grant_special_reward', args)
    expect(retryError).toBeNull()
    expect(retried).toMatchObject({
      grantId: first.grantId,
      recipientCount: 2,
      totalPoints: 25_000,
      replayed: true,
    })

    const [{ data: grants }, { data: members }, { data: ledger }] = await Promise.all([
      client.from('special_reward_grants').select('recipient_count, total_points').eq('guild_id', tenantA.guildId),
      client.from('special_reward_grant_members').select('discord_id').eq('guild_id', tenantA.guildId),
      client.from('point_ledger').select('discord_id, delta, reason').eq('guild_id', tenantA.guildId).eq('reason', 'special_reward'),
    ])
    expect(grants).toEqual([{ recipient_count: 2, total_points: 25_000 }])
    expect(members).toHaveLength(2)
    expect(ledger).toHaveLength(2)
    expect(ledger?.every((row) => row.delta === 12_500 && row.reason === 'special_reward')).toBe(true)

    const { error: payloadConflictError } = await client.rpc('grant_special_reward', {
      ...args,
      p_discord_ids: [memberA],
    })
    expect(payloadConflictError?.message).toContain('SPECIAL_REWARD_IDEMPOTENCY_CONFLICT')

    const { error: crossTenantError } = await client.rpc('grant_special_reward', {
      ...args,
      p_discord_ids: [outsider],
      p_idempotency_key: crypto.randomUUID(),
    })
    expect(crossTenantError?.message).toContain('SPECIAL_REWARD_MEMBER_NOT_FOUND')
    const { error: confirmationError } = await client.rpc('grant_special_reward', {
      ...args,
      p_idempotency_key: crypto.randomUUID(),
      p_confirmation: 'confirm',
    })
    expect(confirmationError?.message).toContain('SPECIAL_REWARD_CONFIRMATION_REQUIRED')
  })
})
