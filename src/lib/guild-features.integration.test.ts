import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('guild feature state catalog (migration 350)', () => {
  let tenant: TestTenant
  const actorDiscordId = '899999999999999985'

  beforeEach(async () => {
    tenant = await createTestTenant(
      `feature-state-${crypto.randomUUID().slice(0, 8)}`,
    )
    const { error } = await getTestServiceClient().from('guild_avatars').insert({
      guild_id: tenant.guildId,
      discord_id: actorDiscordId,
      username: 'Feature State Operator',
      avatar: null,
      is_admin: true,
    })
    expect(error).toBeNull()
  })

  afterEach(async () => {
    await tenant?.cleanup()
  })

  async function change(
    featureKey: string,
    targetState: 'disabled' | 'setup_required' | 'enabled',
    config: Record<string, unknown> = {},
  ) {
    return getTestServiceClient().rpc('change_guild_feature_state', {
      p_guild_id: tenant.guildId,
      p_feature_key: featureKey,
      p_target_state: targetState,
      p_config: config,
      p_actor_discord_id: actorDiscordId,
    })
  }

  it('gives new tenants core access and makes optional modules self-serve', async () => {
    const result = await getTestServiceClient()
      .from('guild_feature_states')
      .select('feature_key,state,config')
      .eq('guild_id', tenant.guildId)
    expect(result.error).toBeNull()
    expect(result.data).toHaveLength(14)
    const states = new Map(result.data?.map((row) => [row.feature_key, row.state]))
    expect(states.get('events')).toBe('enabled')
    expect(states.get('settings_and_permissions')).toBe('enabled')
    // createTestTenant explicitly opts into regear through the legacy setting.
    expect(states.get('supply')).toBe('enabled')
    expect(states.get('guild_economy')).toBe('disabled')
    expect(states.get('guild_shop')).toBe('disabled')
    expect(states.has('battlelog')).toBe(false)
  })

  it('rejects direct state writes and records actor-scoped command history', async () => {
    const direct = await getTestServiceClient().from('guild_feature_states').update({
      state: 'enabled',
    }).eq('guild_id', tenant.guildId).eq('feature_key', 'tactics')
    expect(direct.error?.code).toBe('42501')

    const enabled = await change('tactics', 'enabled')
    expect(enabled.error).toBeNull()
    expect(enabled.data).toMatchObject({
      featureKey: 'tactics',
      previousState: 'disabled',
      state: 'enabled',
    })

    const event = await getTestServiceClient()
      .from('guild_feature_state_events')
      .select('feature_key,from_state,to_state,source,actor_discord_id,actor_member_id')
      .eq('guild_id', tenant.guildId)
      .eq('feature_key', 'tactics')
      .eq('source', 'operator_command')
      .single()
    expect(event.error).toBeNull()
    expect(event.data).toMatchObject({
      feature_key: 'tactics',
      from_state: 'disabled',
      to_state: 'enabled',
      source: 'operator_command',
      actor_discord_id: actorDiscordId,
    })
    expect(event.data?.actor_member_id).toBeTruthy()
  })

  it('enforces dependencies without crossing tenant boundaries', async () => {
    const blocked = await change('guild_shop', 'enabled')
    expect(blocked.error?.message).toContain(
      'FEATURE_DEPENDENCY_REQUIRED:guild_economy',
    )

    expect((await change('guild_economy', 'enabled')).error).toBeNull()
    expect((await change('guild_shop', 'enabled')).error).toBeNull()

    const economyBlocked = await change('guild_economy', 'disabled')
    expect(economyBlocked.error?.message).toContain('FEATURE_DEPENDENTS_ACTIVE')

    expect((await change('guild_shop', 'disabled')).error).toBeNull()
    expect((await change('guild_economy', 'disabled')).error).toBeNull()
  })

  it('drains existing obligations, blocks new intake, then finalizes automatically', async () => {
    const client = getTestServiceClient()
    expect((await change('guild_economy', 'enabled')).error).toBeNull()
    const pending = await client.from('donation_requests').insert({
      guild_id: tenant.guildId,
      discord_id: actorDiscordId,
      username: 'Donor',
      silver: 1000,
      screenshot_path: 'integration/receipt.webp',
      status: 'pending',
    }).select('id').single()
    expect(pending.error).toBeNull()

    const disabled = await change('guild_economy', 'disabled')
    expect(disabled.error).toBeNull()
    expect(disabled.data).toMatchObject({ state: 'draining', openWork: true })

    const blockedIntake = await client.from('donation_requests').insert({
      guild_id: tenant.guildId,
      discord_id: actorDiscordId,
      username: 'Second Donor',
      silver: 2000,
      screenshot_path: 'integration/second.webp',
      status: 'pending',
    })
    expect(blockedIntake.error?.message).toContain(
      'FEATURE_USE_BLOCKED:guild_economy:draining',
    )

    const processUse = await client.rpc('assert_guild_feature_use', {
      p_guild_id: tenant.guildId,
      p_feature_key: 'guild_economy',
      p_use: 'process',
    })
    expect(processUse.error).toBeNull()
    expect(processUse.data).toBe('draining')

    const resolved = await client.from('donation_requests').update({
      status: 'rejected',
      resolved_at: new Date().toISOString(),
    }).eq('id', pending.data?.id)
    expect(resolved.error).toBeNull()

    const state = await client.from('guild_feature_states')
      .select('state')
      .eq('guild_id', tenant.guildId)
      .eq('feature_key', 'guild_economy')
      .single()
    expect(state.error).toBeNull()
    expect(state.data?.state).toBe('disabled')

    const retry = await client.rpc('finalize_draining_guild_feature', {
      p_guild_id: tenant.guildId,
      p_feature_key: 'guild_economy',
    })
    expect(retry.error).toBeNull()
    expect(retry.data).toBe(false)
  })

  it('keeps legacy regear settings and the central supply mode in sync', async () => {
    const client = getTestServiceClient()
    const crafted = await change('supply', 'enabled', { mode: 'craft' })
    expect(crafted.error).toBeNull()

    const settings = await client.from('app_settings')
      .select('key,value')
      .eq('guild_id', tenant.guildId)
      .in('key', ['regear_support_enabled', 'craft_regear_enabled'])
    expect(settings.error).toBeNull()
    expect(new Map(settings.data?.map((row) => [row.key, row.value]))).toEqual(
      new Map([
        ['regear_support_enabled', 'true'],
        ['craft_regear_enabled', 'true'],
      ]),
    )

    const legacy = await client.from('app_settings').upsert({
      guild_id: tenant.guildId,
      key: 'craft_regear_enabled',
      value: 'false',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'guild_id,key' })
    expect(legacy.error).toBeNull()

    const supply = await client.from('guild_feature_states')
      .select('state,config')
      .eq('guild_id', tenant.guildId)
      .eq('feature_key', 'supply')
      .single()
    expect(supply.error).toBeNull()
    expect(supply.data).toEqual({ state: 'enabled', config: { mode: 'silver' } })
  })
})
