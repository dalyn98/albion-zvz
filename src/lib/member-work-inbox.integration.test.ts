import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('member work inbox snapshot (migration 349)', () => {
  let tenantA: TestTenant
  let tenantB: TestTenant
  const discordId = `inbox-${crypto.randomUUID()}`

  beforeEach(async () => {
    tenantA = await createTestTenant(`member-inbox-a-${crypto.randomUUID().slice(0, 6)}`)
    tenantB = await createTestTenant(`member-inbox-b-${crypto.randomUUID().slice(0, 6)}`)
    for (const tenant of [tenantA, tenantB]) {
      const { error } = await getTestServiceClient().from('guild_avatars').insert({
        guild_id: tenant.guildId,
        discord_id: discordId,
        username: 'Inbox Member',
        avatar: null,
        is_admin: true,
      })
      expect(error).toBeNull()
      const enabled = await getTestServiceClient().rpc('change_guild_feature_state', {
        p_guild_id: tenant.guildId,
        p_feature_key: 'guild_economy',
        p_target_state: 'enabled',
        p_config: {},
        p_actor_discord_id: discordId,
      })
      expect(enabled.error).toBeNull()
    }
  })

  afterEach(async () => {
    await tenantA?.cleanup()
    await tenantB?.cleanup()
  })

  it('isolates the active guild and keeps draining work visible', async () => {
    const client = getTestServiceClient()
    const insertA = await client.from('donation_requests').insert({
      guild_id: tenantA.guildId,
      discord_id: discordId,
      username: 'Inbox Member',
      silver: 1_000,
      screenshot_path: 'member-inbox/a.webp',
      status: 'pending',
    }).select('id').single()
    expect(insertA.error).toBeNull()
    const insertB = await client.from('donation_requests').insert({
      guild_id: tenantB.guildId,
      discord_id: discordId,
      username: 'Inbox Member',
      silver: 2_000,
      screenshot_path: 'member-inbox/b.webp',
      status: 'pending',
    })
    expect(insertB.error).toBeNull()

    const first = await client.rpc('member_work_inbox_snapshot', {
      p_guild_id: tenantA.guildId,
      p_discord_id: discordId,
      p_include_history: true,
      p_history_limit: 50,
    })
    expect(first.error).toBeNull()
    expect(first.data).toEqual([
      expect.objectContaining({
        item_key: `donation:${insertA.data?.id}`,
        domain: 'donation',
        bucket: 'waiting_on_guild',
        stage: 'donation_review',
        amount: 1_000,
      }),
    ])

    const draining = await client.rpc('change_guild_feature_state', {
      p_guild_id: tenantA.guildId,
      p_feature_key: 'guild_economy',
      p_target_state: 'disabled',
      p_config: {},
      p_actor_discord_id: discordId,
    })
    expect(draining.error).toBeNull()
    expect(draining.data).toMatchObject({ state: 'draining' })

    const duringDrain = await client.rpc('member_work_inbox_snapshot', {
      p_guild_id: tenantA.guildId,
      p_discord_id: discordId,
      p_include_history: false,
      p_history_limit: 0,
    })
    expect(duringDrain.error).toBeNull()
    expect(duringDrain.data).toHaveLength(1)
    expect(duringDrain.data?.[0]).toMatchObject({ bucket: 'waiting_on_guild' })
  })

  it('requires a trusted official character before exposing a matching treasury deposit', async () => {
    const client = getTestServiceClient()
    const playerId = `player-${crypto.randomUUID()}`
    const link = await client.from('account_albion_tenant_links').insert({
      guild_id: tenantA.guildId,
      discord_id: discordId,
      albion_server: 'west',
      albion_player_id: playerId,
      albion_player_name: 'InboxCharacter',
      relation: 'home_guild',
      trust_status: 'trusted',
    })
    expect(link.error).toBeNull()
    const deposit = await client.from('guild_treasury_deposits').insert({
      guild_id: tenantA.guildId,
      deposited_at: '2026-08-01T03:00:00Z',
      depositor_name: 'inboxcharacter',
      amount_silver: 25_000,
      source_fingerprint: 'b'.repeat(64),
      imported_by: 'operator',
    }).select('id').single()
    expect(deposit.error).toBeNull()

    const snapshot = await client.rpc('member_work_inbox_snapshot', {
      p_guild_id: tenantA.guildId,
      p_discord_id: discordId,
      p_include_history: true,
      p_history_limit: 50,
    })
    expect(snapshot.error).toBeNull()
    expect(snapshot.data).toEqual([
      expect.objectContaining({
        item_key: `treasury_deposit:${deposit.data?.id}`,
        bucket: 'action_required',
        stage: 'treasury_purpose',
        next_actor: 'member',
      }),
    ])

    const draining = await client.rpc('change_guild_feature_state', {
      p_guild_id: tenantA.guildId,
      p_feature_key: 'guild_economy',
      p_target_state: 'disabled',
      p_config: {},
      p_actor_discord_id: discordId,
    })
    expect(draining.error).toBeNull()
    expect(draining.data).toMatchObject({ state: 'draining', openWork: true })

    const blockedImport = await client.from('guild_treasury_deposits').insert({
      guild_id: tenantA.guildId,
      deposited_at: '2026-08-02T03:00:00Z',
      depositor_name: 'InboxCharacter',
      amount_silver: 30_000,
      source_fingerprint: 'c'.repeat(64),
      imported_by: 'operator',
    })
    expect(blockedImport.error?.message).toContain(
      'FEATURE_USE_BLOCKED:guild_economy:draining',
    )

    const allocated = await client.rpc('allocate_treasury_deposit', {
      p_guild_id: tenantA.guildId,
      p_deposit_id: deposit.data?.id,
      p_discord_id: discordId,
      p_expected_depositor_name: 'InboxCharacter',
      p_purpose: 'guild_donation',
      p_purpose_note: 'guild support',
      p_idempotency_key: crypto.randomUUID(),
    })
    expect(allocated.error).toBeNull()
    const state = await client.from('guild_feature_states')
      .select('state')
      .eq('guild_id', tenantA.guildId)
      .eq('feature_key', 'guild_economy')
      .single()
    expect(state.error).toBeNull()
    expect(state.data?.state).toBe('disabled')
  })

  it('classifies shop confirmation and both sides of a member trade from source state', async () => {
    const client = getTestServiceClient()
    for (const featureKey of ['guild_shop', 'member_market']) {
      const enabled = await client.rpc('change_guild_feature_state', {
        p_guild_id: tenantA.guildId,
        p_feature_key: featureKey,
        p_target_state: 'enabled',
        p_config: {},
        p_actor_discord_id: discordId,
      })
      expect(enabled.error).toBeNull()
    }

    const shopOrder = await client.from('shop_orders').insert({
      guild_id: tenantA.guildId,
      discord_id: discordId,
      username: 'Inbox Member',
      total_points: 10_000,
      status: 'pending',
    }).select('id').single()
    expect(shopOrder.error).toBeNull()
    const shopItem = await client.from('shop_order_items').insert({
      guild_id: tenantA.guildId,
      order_id: shopOrder.data?.id,
      unique_name: 'T4_MAIN_SWORD',
      enchant: 0,
      quality: 1,
      name_ko: 'Broadsword',
      quantity: 1,
      unit_points: 10_000,
      subtotal_points: 10_000,
    })
    expect(shopItem.error).toBeNull()
    const priceReview = await client.from('shop_order_price_reviews').insert({
      guild_id: tenantA.guildId,
      order_id: shopOrder.data?.id,
      requested_total_points: 10_000,
      proposed_total_points: 12_000,
      status: 'awaiting_member',
      proposed_by: 'operator',
      idempotency_key: crypto.randomUUID(),
    }).select('id').single()
    expect(priceReview.error).toBeNull()

    const listing = await client.from('member_trade_listings').insert({
      guild_id: tenantA.guildId,
      seller_discord_id: discordId,
      seller_username: 'Inbox Member',
      unique_name: 'T4_MAIN_AXE',
      enchant: 0,
      quality: 1,
      name_ko: 'Battleaxe',
      quantity_total: 1,
      quantity_available: 0,
      unit_points: 15_000,
      status: 'sold_out',
    }).select('id').single()
    expect(listing.error).toBeNull()
    const tradeOrder = await client.from('member_trade_orders').insert({
      guild_id: tenantA.guildId,
      listing_id: listing.data?.id,
      buyer_discord_id: 'buyer-1',
      buyer_username: 'Buyer',
      seller_discord_id: discordId,
      seller_username: 'Inbox Member',
      unique_name: 'T4_MAIN_AXE',
      enchant: 0,
      quality: 1,
      name_ko: 'Battleaxe',
      quantity: 1,
      unit_points: 15_000,
      total_points: 15_000,
      status: 'awaiting_delivery',
      delivery_due_at: '2026-08-10T00:00:00Z',
    }).select('id').single()
    expect(tradeOrder.error).toBeNull()

    const actionSnapshot = await client.rpc('member_work_inbox_snapshot', {
      p_guild_id: tenantA.guildId,
      p_discord_id: discordId,
      p_include_history: false,
      p_history_limit: 0,
    })
    expect(actionSnapshot.error).toBeNull()
    expect(actionSnapshot.data).toEqual(expect.arrayContaining([
      expect.objectContaining({
        item_key: `shop:${shopOrder.data?.id}`,
        bucket: 'action_required',
        stage: 'shop_price_confirmation',
      }),
      expect.objectContaining({
        item_key: `member_trade:${tradeOrder.data?.id}`,
        bucket: 'action_required',
        stage: 'trade_seller_delivery',
      }),
    ]))

    expect((await client.from('shop_order_price_reviews').update({
      status: 'member_confirmed',
      member_confirmed_at: new Date().toISOString(),
    }).eq('id', priceReview.data?.id)).error).toBeNull()
    expect((await client.from('member_trade_orders').update({
      status: 'delivered',
      delivered_at: new Date().toISOString(),
    }).eq('id', tradeOrder.data?.id)).error).toBeNull()

    const waitingSnapshot = await client.rpc('member_work_inbox_snapshot', {
      p_guild_id: tenantA.guildId,
      p_discord_id: discordId,
      p_include_history: false,
      p_history_limit: 0,
    })
    expect(waitingSnapshot.error).toBeNull()
    expect(waitingSnapshot.data).toEqual(expect.arrayContaining([
      expect.objectContaining({
        item_key: `shop:${shopOrder.data?.id}`,
        bucket: 'waiting_on_guild',
        stage: 'shop_preparing',
      }),
      expect.objectContaining({
        item_key: `member_trade:${tradeOrder.data?.id}`,
        bucket: 'waiting_on_guild',
        stage: 'trade_waiting_buyer',
      }),
    ]))
  })
})
