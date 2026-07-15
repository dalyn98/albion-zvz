import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('UX event database invariants', () => {
  let client: ReturnType<typeof getTestServiceClient>
  let tenant: TestTenant

  beforeEach(async () => {
    client = getTestServiceClient()
    tenant = await createTestTenant('ux-events')
  })

  afterEach(async () => {
    await tenant.cleanup()
  })

  it('stores a tenant-scoped allowlisted workflow event', async () => {
    const flowId = crypto.randomUUID()
    const { error } = await client.from('ux_events').insert({
      guild_id: tenant.guildId,
      flow_id: flowId,
      actor_kind: 'admin',
      event_type: 'surface_view',
      surface: 'admin_approvals',
      elapsed_ms: 120,
      metadata: { viewport: 'desktop' },
    })
    expect(error).toBeNull()

    const { data, error: readError } = await client
      .from('ux_events')
      .select('guild_id, flow_id, actor_kind, event_type, surface, elapsed_ms, metadata')
      .eq('guild_id', tenant.guildId)
      .eq('flow_id', flowId)
      .single()

    expect(readError).toBeNull()
    expect(data).toMatchObject({
      guild_id: tenant.guildId,
      flow_id: flowId,
      actor_kind: 'admin',
      event_type: 'surface_view',
      surface: 'admin_approvals',
      elapsed_ms: 120,
      metadata: { viewport: 'desktop' },
    })
  })

  it('rejects values outside the database event allowlist', async () => {
    const { error } = await client.from('ux_events').insert({
      guild_id: tenant.guildId,
      flow_id: crypto.randomUUID(),
      actor_kind: 'admin',
      event_type: 'identity_capture',
      surface: 'admin_approvals',
      metadata: {},
    })

    expect(error?.code).toBe('23514')
  })

  it('deletes telemetry when its tenant is deleted', async () => {
    const guildId = tenant.guildId
    const { error } = await client.from('ux_events').insert({
      guild_id: guildId,
      flow_id: crypto.randomUUID(),
      actor_kind: 'member',
      event_type: 'navigation_action',
      surface: 'member_home',
      metadata: { target: 'wallet' },
    })
    expect(error).toBeNull()

    await tenant.cleanup()
    const { count, error: readError } = await client
      .from('ux_events')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', guildId)
    expect(readError).toBeNull()
    expect(count).toBe(0)
  })

  it('enables the staged refresh for Menhera without opting in a new tenant', async () => {
    const { data: menhera, error: tenantError } = await client
      .from('tenants')
      .select('id')
      .eq('slug', 'menhera')
      .single()
    expect(tenantError).toBeNull()

    const { data: enabled, error: settingError } = await client
      .from('app_settings')
      .select('value')
      .eq('guild_id', menhera!.id)
      .eq('key', 'ux_refresh_v2_enabled')
      .single()
    expect(settingError).toBeNull()
    expect(enabled?.value).toBe('true')

    const { count, error: otherTenantError } = await client
      .from('app_settings')
      .select('guild_id', { count: 'exact', head: true })
      .eq('guild_id', tenant.guildId)
      .eq('key', 'ux_refresh_v2_enabled')
    expect(otherTenantError).toBeNull()
    expect(count).toBe(0)
  })
})
