import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('tenant regear support write boundary (migs 313-314)', () => {
  let tenant: TestTenant

  beforeEach(async () => {
    tenant = await createTestTenant('regear-support')
  })

  afterEach(async () => {
    await tenant?.cleanup()
  })

  it('treats a missing onboarding choice as unsupported', async () => {
    const client = getTestServiceClient()
    const guildId = crypto.randomUUID()
    const { error: tenantError } = await client.from('tenants').insert({
      id: guildId,
      discord_guild_id: `pending-${guildId}`,
      slug: `pending-${guildId}`,
      name: 'Pending onboarding tenant',
      status: 'pending',
      settings: {},
    })
    expect(tenantError).toBeNull()

    try {
      const support = await client
        .from('app_settings')
        .select('value')
        .eq('guild_id', guildId)
        .eq('key', 'regear_support_enabled')
        .maybeSingle()
      expect(support.error).toBeNull()
      expect(support.data).toBeNull()

      const blocked = await client.from('regear_requests').insert({
        guild_id: guildId,
        event_id: null,
        event_title_snapshot: 'Must not be created',
        discord_id: 'pending-member',
        username: 'Pending Member',
        role_name: 'Dps',
        silver: 1_000,
        claimed_silver: 1_000,
      })
      expect(blocked.error?.message).toContain('REGEAR_SUPPORT_DISABLED')
    } finally {
      await client.from('tenants').delete().eq('id', guildId)
    }
  })

  it('preserves reads while freezing request and window writes until support is restored', async () => {
    const client = getTestServiceClient()
    const { data: request, error: requestError } = await client
      .from('regear_requests')
      .insert({
        guild_id: tenant.guildId,
        event_id: null,
        event_title_snapshot: 'Historical regear',
        discord_id: 'regear-support-member',
        username: 'Member',
        role_name: 'Dps',
        silver: 1_000,
        claimed_silver: 1_000,
      })
      .select('id')
      .single()
    expect(requestError).toBeNull()

    const { data: window, error: windowError } = await client
      .from('regear_windows')
      .insert({
        guild_id: tenant.guildId,
        title: 'Open window',
        max_deaths_per_member: 1,
      })
      .select('id')
      .single()
    expect(windowError).toBeNull()

    const { data: craftTask, error: craftTaskError } = await client
      .from('craft_tasks')
      .insert({
        guild_id: tenant.guildId,
        task_kind: 'regear',
        regear_request_id: request!.id,
        status: 'queued',
      })
      .select('id')
      .single()
    expect(craftTaskError).toBeNull()

    const { error: disableError } = await client
      .from('app_settings')
      .update({ value: 'false', updated_at: new Date().toISOString() })
      .eq('guild_id', tenant.guildId)
      .eq('key', 'regear_support_enabled')
    expect(disableError).toBeNull()

    const { data: preserved, error: readError } = await client
      .from('regear_requests')
      .select('id, status')
      .eq('guild_id', tenant.guildId)
      .eq('id', request!.id)
      .single()
    expect(readError).toBeNull()
    expect(preserved?.id).toBe(request!.id)

    const requestUpdate = await client
      .from('regear_requests')
      .update({ admin_notes: 'must remain frozen' })
      .eq('guild_id', tenant.guildId)
      .eq('id', request!.id)
    expect(requestUpdate.error?.message).toContain('REGEAR_SUPPORT_DISABLED')

    const windowUpdate = await client
      .from('regear_windows')
      .update({ title: 'must remain frozen' })
      .eq('guild_id', tenant.guildId)
      .eq('id', window!.id)
    expect(windowUpdate.error?.message).toContain('REGEAR_SUPPORT_DISABLED')

    const requestDelete = await client
      .from('regear_requests')
      .delete()
      .eq('guild_id', tenant.guildId)
      .eq('id', request!.id)
    expect(requestDelete.error?.message).toContain('REGEAR_SUPPORT_DISABLED')

    const craftTaskUpdate = await client
      .from('craft_tasks')
      .update({ status: 'cancelled' })
      .eq('guild_id', tenant.guildId)
      .eq('id', craftTask!.id)
    expect(craftTaskUpdate.error?.message).toContain('REGEAR_SUPPORT_DISABLED')

    const craftTaskDelete = await client
      .from('craft_tasks')
      .delete()
      .eq('guild_id', tenant.guildId)
      .eq('id', craftTask!.id)
    expect(craftTaskDelete.error?.message).toContain('REGEAR_SUPPORT_DISABLED')

    const newCraftTask = await client.from('craft_tasks').insert({
      guild_id: tenant.guildId,
      task_kind: 'regear',
      regear_request_id: request!.id,
      status: 'queued',
    })
    expect(newCraftTask.error?.message).toContain('REGEAR_SUPPORT_DISABLED')

    const newRequest = await client.from('regear_requests').insert({
      guild_id: tenant.guildId,
      event_id: null,
      event_title_snapshot: 'Blocked request',
      discord_id: 'blocked-member',
      username: 'Blocked',
      role_name: 'Dps',
      silver: 1_000,
      claimed_silver: 1_000,
    })
    expect(newRequest.error?.message).toContain('REGEAR_SUPPORT_DISABLED')

    const { error: enableError } = await client
      .from('app_settings')
      .update({ value: 'true', updated_at: new Date().toISOString() })
      .eq('guild_id', tenant.guildId)
      .eq('key', 'regear_support_enabled')
    expect(enableError).toBeNull()

    const restoredUpdate = await client
      .from('regear_requests')
      .update({ admin_notes: 'support restored' })
      .eq('guild_id', tenant.guildId)
      .eq('id', request!.id)
    expect(restoredUpdate.error).toBeNull()

    const restoredTaskUpdate = await client
      .from('craft_tasks')
      .update({ status: 'cancelled' })
      .eq('guild_id', tenant.guildId)
      .eq('id', craftTask!.id)
    expect(restoredTaskUpdate.error).toBeNull()
  })

  it('cannot move frozen history into a supported tenant to bypass the old tenant gate', async () => {
    const client = getTestServiceClient()
    const other = await createTestTenant('regear-support-move-target')
    try {
      const { data: request, error: requestError } = await client
        .from('regear_requests')
        .insert({
          guild_id: tenant.guildId,
          event_id: null,
          event_title_snapshot: 'Frozen origin',
          discord_id: 'move-member',
          username: 'Move Member',
          role_name: 'Dps',
          silver: 1_000,
          claimed_silver: 1_000,
        })
        .select('id')
        .single()
      expect(requestError).toBeNull()

      const { error: disableError } = await client
        .from('app_settings')
        .update({ value: 'false' })
        .eq('guild_id', tenant.guildId)
        .eq('key', 'regear_support_enabled')
      expect(disableError).toBeNull()

      const moved = await client
        .from('regear_requests')
        .update({ guild_id: other.guildId })
        .eq('id', request!.id)
      expect(moved.error?.message).toContain('REGEAR_SUPPORT_DISABLED')
    } finally {
      await other.cleanup()
    }
  })

  it('allows an unsupported tenant deletion cascade without retaining orphaned history', async () => {
    const client = getTestServiceClient()
    const cascadeTenant = await createTestTenant('regear-support-cascade')
    const { data: request, error: requestError } = await client
      .from('regear_requests')
      .insert({
        guild_id: cascadeTenant.guildId,
        event_id: null,
        event_title_snapshot: 'Cascade history',
        discord_id: 'cascade-member',
        username: 'Cascade Member',
        role_name: 'Dps',
        silver: 1_000,
        claimed_silver: 1_000,
      })
      .select('id')
      .single()
    expect(requestError).toBeNull()

    const { data: window, error: windowError } = await client
      .from('regear_windows')
      .insert({
        guild_id: cascadeTenant.guildId,
        title: 'Cascade window',
        max_deaths_per_member: 1,
      })
      .select('id')
      .single()
    expect(windowError).toBeNull()

    const { data: task, error: taskError } = await client
      .from('craft_tasks')
      .insert({
        guild_id: cascadeTenant.guildId,
        task_kind: 'regear',
        regear_request_id: request!.id,
        status: 'queued',
      })
      .select('id')
      .single()
    expect(taskError).toBeNull()

    const { error: disableError } = await client
      .from('app_settings')
      .update({ value: 'false' })
      .eq('guild_id', cascadeTenant.guildId)
      .eq('key', 'regear_support_enabled')
    expect(disableError).toBeNull()

    const { error: tenantDeleteError } = await client
      .from('tenants')
      .delete()
      .eq('id', cascadeTenant.guildId)
    expect(tenantDeleteError).toBeNull()

    const [requestCheck, windowCheck, taskCheck] = await Promise.all([
      client.from('regear_requests').select('id').eq('id', request!.id).maybeSingle(),
      client.from('regear_windows').select('id').eq('id', window!.id).maybeSingle(),
      client.from('craft_tasks').select('id').eq('id', task!.id).maybeSingle(),
    ])
    expect(requestCheck.data).toBeNull()
    expect(windowCheck.data).toBeNull()
    expect(taskCheck.data).toBeNull()
  })

  it('does not treat independent guild craft orders as regear writes', async () => {
    const client = getTestServiceClient()
    const { data: order, error: orderError } = await client
      .from('craft_orders')
      .insert({
        guild_id: tenant.guildId,
        item_id: 'T8_MAIN_SWORD',
        item_name: 'Broadsword',
        quantity: 1,
        unit_price_silver: 10_000,
        posted_by_discord_id: 'admin',
        posted_by_username: 'Admin',
      })
      .select('id')
      .single()
    expect(orderError).toBeNull()

    const { error: disableError } = await client
      .from('app_settings')
      .update({ value: 'false' })
      .eq('guild_id', tenant.guildId)
      .eq('key', 'regear_support_enabled')
    expect(disableError).toBeNull()

    const { data: task, error: taskError } = await client
      .from('craft_tasks')
      .insert({
        guild_id: tenant.guildId,
        task_kind: 'guild_order',
        craft_order_id: order!.id,
        order_quantity: 1,
        status: 'queued',
      })
      .select('id')
      .single()
    expect(taskError).toBeNull()

    const { error: updateError } = await client
      .from('craft_tasks')
      .update({ status: 'cancelled' })
      .eq('guild_id', tenant.guildId)
      .eq('id', task!.id)
    expect(updateError).toBeNull()
  })
})
