import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

async function createMember(guildId: string, discordId: string): Promise<void> {
  const client = getTestServiceClient()
  const { error } = await client.from('guild_avatars').insert({
    guild_id: guildId,
    discord_id: discordId,
    username: 'Shop Member',
    avatar: null,
  })
  expect(error).toBeNull()
  const { error: ledgerError } = await client.from('point_ledger').insert({
    guild_id: guildId,
    discord_id: discordId,
    delta: 2_000,
    reason: 'admin_adjust',
    memo: 'shop test seed',
  })
  expect(ledgerError).toBeNull()
}

async function createOrder(guildId: string, discordId: string, totalPoints: number) {
  const client = getTestServiceClient()
  const sku = `T4_TEST_${crypto.randomUUID().replaceAll('-', '').toUpperCase()}`
  const { error: inventoryError } = await client.from('shop_inventory').insert({
    guild_id: guildId,
    unique_name: sku,
    enchant: 0,
    quality: 1,
    stock: 2,
    name_ko: '테스트 장비',
    manual_price: totalPoints,
  })
  expect(inventoryError).toBeNull()
  const { data: order, error: orderError } = await client
    .from('shop_orders')
    .insert({
      guild_id: guildId,
      discord_id: discordId,
      username: 'Shop Member',
      total_points: totalPoints,
    })
    .select('id')
    .single()
  expect(orderError).toBeNull()
  const { error: itemError } = await client.from('shop_order_items').insert({
    guild_id: guildId,
    order_id: order!.id,
    unique_name: sku,
    enchant: 0,
    quality: 1,
    name_ko: '테스트 장비',
    quantity: 1,
    unit_points: totalPoints,
    subtotal_points: totalPoints,
  })
  expect(itemError).toBeNull()
  return { id: order!.id as string, sku }
}

describeIntegration('shop price review and recovery (migration 337)', () => {
  let tenantA: TestTenant
  let tenantB: TestTenant

  beforeEach(async () => {
    tenantA = await createTestTenant('shop-review-a')
    tenantB = await createTestTenant('shop-review-b')
  })

  afterEach(async () => {
    await tenantA?.cleanup()
    await tenantB?.cleanup()
  })

  it('requires member reconfirmation for an increase and freezes the approved total', async () => {
    const client = getTestServiceClient()
    const discordId = `shop-${crypto.randomUUID()}`
    await createMember(tenantA.guildId, discordId)
    const order = await createOrder(tenantA.guildId, discordId, 400)

    const approveArgs = {
      p_id: order.id,
      p_admin_id: 'admin-1',
      p_guild_id: tenantA.guildId,
      p_admin_note: null,
      p_total_points_override: 600,
      p_pickup_note: 'Chest 1',
    }
    const { error: prematureApproveError } = await client.rpc('approve_shop_order', approveArgs)
    expect(prematureApproveError?.message).toContain('PRICE_RECONFIRMATION_REQUIRED')

    const proposalKey = crypto.randomUUID()
    const proposalArgs = {
      p_guild_id: tenantA.guildId,
      p_order_id: order.id,
      p_admin_id: 'admin-1',
      p_proposed_total_points: 600,
      p_proposal_note: 'Market quote increased',
      p_idempotency_key: proposalKey,
    }
    const { data: proposed, error: proposeError } = await client.rpc(
      'propose_shop_order_price_review',
      proposalArgs,
    )
    expect(proposeError).toBeNull()
    expect(proposed).toMatchObject({ replayed: false })
    const { data: replayedProposal } = await client.rpc(
      'propose_shop_order_price_review',
      proposalArgs,
    )
    expect(replayedProposal).toMatchObject({ review_id: proposed.review_id, replayed: true })

    const { error: crossTenantError } = await client.rpc('confirm_shop_order_price_review', {
      p_guild_id: tenantB.guildId,
      p_review_id: proposed.review_id,
      p_discord_id: discordId,
      p_idempotency_key: crypto.randomUUID(),
    })
    expect(crossTenantError?.message).toContain('PRICE_REVIEW_NOT_FOUND')

    const confirmationKey = crypto.randomUUID()
    const confirmationArgs = {
      p_guild_id: tenantA.guildId,
      p_review_id: proposed.review_id,
      p_discord_id: discordId,
      p_idempotency_key: confirmationKey,
    }
    const { data: confirmed, error: confirmError } = await client.rpc(
      'confirm_shop_order_price_review',
      confirmationArgs,
    )
    expect(confirmError).toBeNull()
    expect(confirmed).toMatchObject({ replayed: false })
    const { data: confirmedReplay } = await client.rpc(
      'confirm_shop_order_price_review',
      confirmationArgs,
    )
    expect(confirmedReplay).toMatchObject({ replayed: true })

    const { error: approveError } = await client.rpc('approve_shop_order', approveArgs)
    expect(approveError).toBeNull()
    const [{ data: approved }, { data: review }, { data: ledger }] = await Promise.all([
      client
        .from('shop_orders')
        .select('status, original_total_points, total_points, price_frozen_at')
        .eq('guild_id', tenantA.guildId)
        .eq('id', order.id)
        .single(),
      client
        .from('shop_order_price_reviews')
        .select('status')
        .eq('guild_id', tenantA.guildId)
        .eq('id', proposed.review_id)
        .single(),
      client
        .from('point_ledger')
        .select('delta, reason')
        .eq('guild_id', tenantA.guildId)
        .eq('discord_id', discordId)
        .eq('reason', 'shop_purchase'),
    ])
    expect(approved).toMatchObject({
      status: 'approved',
      original_total_points: 400,
      total_points: 600,
      price_frozen_at: expect.any(String),
    })
    expect(review).toEqual({ status: 'applied' })
    expect(ledger).toEqual([{ delta: -600, reason: 'shop_purchase' }])

    const { error: frozenError } = await client
      .from('shop_orders')
      .update({ total_points: 601 })
      .eq('guild_id', tenantA.guildId)
      .eq('id', order.id)
    expect(frozenError?.message).toContain('APPROVED_PRICE_FROZEN')
  })

  it('records one recovery receipt and replays the same destructive request safely', async () => {
    const client = getTestServiceClient()
    const discordId = `reset-${crypto.randomUUID()}`
    await createMember(tenantA.guildId, discordId)
    await createOrder(tenantA.guildId, discordId, 300)
    const key = crypto.randomUUID()
    const args = {
      p_guild_id: tenantA.guildId,
      p_admin_id: 'admin-1',
      p_cancel_note: 'Recovery reset',
      p_idempotency_key: key,
    }
    const { data: first, error: firstError } = await client.rpc(
      'execute_shop_inventory_reset_recovery',
      args,
    )
    expect(firstError).toBeNull()
    expect(first).toMatchObject({ replayed: false, inventory_rows_deleted: 1, orders_cancelled: 1 })
    const { data: replay, error: replayError } = await client.rpc(
      'execute_shop_inventory_reset_recovery',
      args,
    )
    expect(replayError).toBeNull()
    expect(replay).toMatchObject({
      replayed: true,
      receipt_id: first.receipt_id,
      inventory_rows_deleted: 1,
      orders_cancelled: 1,
    })

    const { data: receipts } = await client
      .from('shop_recovery_receipts')
      .select('operation')
      .eq('guild_id', tenantA.guildId)
    expect(receipts).toEqual([{ operation: 'inventory_reset' }])
  })
})
