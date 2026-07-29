import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('public member activity tenant boundary', () => {
  let tenant: TestTenant

  beforeEach(async () => {
    tenant = await createTestTenant('public-member-activity')
  })

  afterEach(async () => {
    await tenant?.cleanup()
  })

  it('stops resolving an opted-in member link when its tenant is suspended', async () => {
    const client = getTestServiceClient()
    const token = crypto.randomUUID()
    const { error: linkError } = await client
      .from('account_albion_tenant_links')
      .insert({
        guild_id: tenant.guildId,
        discord_id: '911111111111111111',
        albion_server: 'west',
        albion_player_id: 'public-member-player',
        albion_player_name: 'Public Member',
        public_activity_token: token,
        public_activity_enabled: true,
        public_activity_enabled_at: new Date().toISOString(),
        public_leaderboard_enabled: false,
      })
    expect(linkError).toBeNull()

    const resolveLink = () =>
      client
        .from('account_albion_tenant_links')
        .select(
          'guild_id, discord_id, public_leaderboard_enabled, tenants!inner(slug, name, status)',
        )
        .eq('public_activity_token', token)
        .eq('public_activity_enabled', true)
        .eq('tenants.status', 'active')
        .is('revoked_at', null)
        .maybeSingle()

    const active = await resolveLink()
    expect(active.error).toBeNull()
    expect(active.data).toMatchObject({
      guild_id: tenant.guildId,
      discord_id: '911111111111111111',
    })

    const { error: suspensionError } = await client
      .from('tenants')
      .update({ status: 'suspended' })
      .eq('id', tenant.guildId)
    expect(suspensionError).toBeNull()

    const suspended = await resolveLink()
    expect(suspended.error).toBeNull()
    expect(suspended.data).toBeNull()
  })
})
