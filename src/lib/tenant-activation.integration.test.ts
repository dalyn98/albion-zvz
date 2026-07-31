import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('tenant onboarding activation (migration 324)', () => {
  let tenant: TestTenant
  const actorDiscordId = '833333333333333333'

  beforeEach(async () => {
    tenant = await createTestTenant(
      `tenant-activation-${crypto.randomUUID().slice(0, 8)}`,
    )
    const { error } = await getTestServiceClient()
      .from('tenants')
      .update({
        status: 'pending',
        bot_installed_at: new Date().toISOString(),
        created_by_discord_id: actorDiscordId,
        member_role_ids: ['844444444444444444'],
        admin_role_ids: ['855555555555555555'],
        event_channel_id: '866666666666666666',
      })
      .eq('id', tenant.guildId)
    expect(error).toBeNull()
  })

  afterEach(async () => {
    await getTestServiceClient()
      .from('app_settings')
      .delete()
      .eq('guild_id', tenant.guildId)
    await getTestServiceClient()
      .from('permission_role_grants')
      .delete()
      .eq('guild_id', tenant.guildId)
    await tenant?.cleanup()
  })

  async function seedRequiredSettings(input: {
    regearSupport: boolean
    craftRegear?: boolean
  }): Promise<void> {
    const now = new Date().toISOString()
    const rows = [
      {
        guild_id: tenant.guildId,
        key: 'tenant_timezone',
        value: 'Asia/Seoul',
        updated_at: now,
      },
      {
        guild_id: tenant.guildId,
        key: 'albion_server',
        value: 'west',
        updated_at: now,
      },
      {
        guild_id: tenant.guildId,
        key: 'albion_home_guild_id',
        value: `home-${tenant.guildId}`,
        updated_at: now,
      },
      {
        guild_id: tenant.guildId,
        key: 'albion_home_guild_name',
        value: 'Activation Guild',
        updated_at: now,
      },
      {
        guild_id: tenant.guildId,
        key: 'regear_support_enabled',
        value: input.regearSupport ? 'true' : 'false',
        updated_at: now,
      },
      {
        guild_id: tenant.guildId,
        key: 'events_auto_start_enabled',
        value: 'true',
        updated_at: now,
      },
    ]
    if (input.craftRegear !== undefined) {
      rows.push({
        guild_id: tenant.guildId,
        key: 'craft_regear_enabled',
        value: input.craftRegear ? 'true' : 'false',
        updated_at: now,
      })
    }
    const { error } = await getTestServiceClient()
      .from('app_settings')
      .upsert(rows, { onConflict: 'guild_id,key' })
    expect(error).toBeNull()
  }

  it('rejects an incomplete or forged activation and activates after all required state exists', async () => {
    const client = getTestServiceClient()
    const forged = await client.rpc('activate_tenant_after_onboarding', {
      p_guild_id: tenant.guildId,
      p_actor_discord_id: '877777777777777777',
    })
    expect(forged.error?.message).toContain('ONBOARDING_OWNER_REQUIRED')

    const incomplete = await client.rpc('activate_tenant_after_onboarding', {
      p_guild_id: tenant.guildId,
      p_actor_discord_id: actorDiscordId,
    })
    expect(incomplete.error?.message).toContain(
      'ONBOARDING_TIMEZONE_REQUIRED',
    )

    await seedRequiredSettings({ regearSupport: false })
    const activated = await client.rpc('activate_tenant_after_onboarding', {
      p_guild_id: tenant.guildId,
      p_actor_discord_id: actorDiscordId,
    })
    expect(activated.error).toBeNull()
    expect(activated.data).toBe(tenant.slug)

    const { data, error } = await client
      .from('tenants')
      .select('status')
      .eq('id', tenant.guildId)
      .single()
    expect(error).toBeNull()
    expect(data?.status).toBe('active')
  })

  it('requires a supported guild to choose silver or crafted fulfillment', async () => {
    const client = getTestServiceClient()
    await seedRequiredSettings({ regearSupport: true })
    expect(
      (
        await client
          .from('app_settings')
          .delete()
          .eq('guild_id', tenant.guildId)
          .eq('key', 'craft_regear_enabled')
      ).error,
    ).toBeNull()

    const missingMode = await client.rpc(
      'activate_tenant_after_onboarding',
      {
        p_guild_id: tenant.guildId,
        p_actor_discord_id: actorDiscordId,
      },
    )
    expect(missingMode.error?.message).toContain(
      'ONBOARDING_REGEAR_MODE_REQUIRED',
    )

    await seedRequiredSettings({
      regearSupport: true,
      craftRegear: false,
    })
    const activated = await client.rpc('activate_tenant_after_onboarding', {
      p_guild_id: tenant.guildId,
      p_actor_discord_id: actorDiscordId,
    })
    expect(activated.error).toBeNull()
    expect(activated.data).toBe(tenant.slug)
  })
})
