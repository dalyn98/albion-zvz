import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  enableTestTenantFeatures,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('member trade listing lifecycle (mig 254)', () => {
  let tenant: TestTenant

  beforeEach(async () => {
    tenant = await createTestTenant('member-trade-lifecycle')
    await enableTestTenantFeatures(tenant.guildId, ['member_market'])
  })

  afterEach(async () => {
    await tenant?.cleanup()
  })

  it('only lets the owner pause, resume, and close a listing within its tenant', async () => {
    const client = getTestServiceClient()
    const sellerDiscordId = `seller-${crypto.randomUUID()}`
    const { data: listing, error: insertError } = await client
      .from('member_trade_listings')
      .insert({
        guild_id: tenant.guildId,
        seller_discord_id: sellerDiscordId,
        seller_username: 'Lifecycle seller',
        unique_name: 'T6_MAIN_SWORD',
        enchant: 0,
        name_ko: '테스트 검',
        quantity_total: 3,
        quantity_available: 3,
        unit_points: 500,
        title: 'Lifecycle listing',
      })
      .select('id, status')
      .single()
    expect(insertError).toBeNull()

    const { data: paused, error: pauseError } = await client.rpc(
      'update_member_trade_listing_lifecycle',
      {
        p_listing_id: listing!.id,
        p_guild_id: tenant.guildId,
        p_seller_discord_id: sellerDiscordId,
        p_action: 'pause',
      },
    )
    expect(pauseError).toBeNull()
    expect(paused).toBe('pause')

    const { data: resumed, error: resumeError } = await client.rpc(
      'update_member_trade_listing_lifecycle',
      {
        p_listing_id: listing!.id,
        p_guild_id: tenant.guildId,
        p_seller_discord_id: sellerDiscordId,
        p_action: 'resume',
      },
    )
    expect(resumeError).toBeNull()
    expect(resumed).toBe('resume')

    const { data: closed, error: closeError } = await client.rpc(
      'update_member_trade_listing_lifecycle',
      {
        p_listing_id: listing!.id,
        p_guild_id: tenant.guildId,
        p_seller_discord_id: sellerDiscordId,
        p_action: 'close',
      },
    )
    expect(closeError).toBeNull()
    expect(closed).toBe('close')

    const { data: persisted } = await client
      .from('member_trade_listings')
      .select('status, closed_at')
      .eq('id', listing!.id)
      .single()
    expect(persisted).toMatchObject({ status: 'closed' })
    expect(persisted?.closed_at).toBeTruthy()

    const { error: foreignSellerError } = await client.rpc(
      'update_member_trade_listing_lifecycle',
      {
        p_listing_id: listing!.id,
        p_guild_id: tenant.guildId,
        p_seller_discord_id: 'another-seller',
        p_action: 'pause',
      },
    )
    expect(foreignSellerError?.message).toContain('LISTING_NOT_FOUND')
  })
})
