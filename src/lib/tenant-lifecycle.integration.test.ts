import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('tenant preservation and deletion lifecycle (325-327)', () => {
  let tenant: TestTenant
  const actorDiscordId = '899999999999999991'
  const memberDiscordId = '899999999999999992'

  beforeEach(async () => {
    tenant = await createTestTenant(
      `tenant-lifecycle-${crypto.randomUUID().slice(0, 8)}`,
    )
    const client = getTestServiceClient()
    const now = new Date().toISOString()
    expect(
      (
        await client
          .from('tenants')
          .update({
            name: 'Lifecycle Test Guild',
            bot_installed_at: now,
            created_by_discord_id: actorDiscordId,
            member_role_ids: ['899999999999999993'],
            admin_role_ids: ['899999999999999994'],
            event_channel_id: '899999999999999995',
          })
          .eq('id', tenant.guildId)
      ).error,
    ).toBeNull()
    expect(
      (
        await client.from('app_settings').upsert(
          [
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
              value: 'Lifecycle Test Guild',
              updated_at: now,
            },
            {
              guild_id: tenant.guildId,
              key: 'regear_support_enabled',
              value: 'false',
              updated_at: now,
            },
            {
              guild_id: tenant.guildId,
              key: 'events_auto_start_enabled',
              value: 'true',
              updated_at: now,
            },
          ],
          { onConflict: 'guild_id,key' },
        )
      ).error,
    ).toBeNull()
    expect(
      (
        await client.from('guild_avatars').insert({
          guild_id: tenant.guildId,
          discord_id: memberDiscordId,
          username: 'Preserved Member',
          avatar: null,
        })
      ).error,
    ).toBeNull()
  })

  afterEach(async () => {
    const client = getTestServiceClient()
    const { data: request } = await client
      .from('tenant_deletion_requests')
      .select('id,status')
      .eq('guild_id', tenant.guildId)
      .in('status', ['pending', 'purging'])
      .maybeSingle()
    if (request?.status === 'pending') {
      await client.rpc('cancel_tenant_deletion', {
        p_request_id: request.id,
        p_actor_discord_id: actorDiscordId,
        p_actor_authenticated_at: new Date().toISOString(),
        p_expected_guild_name: 'Lifecycle Test Guild',
        p_confirm_restore: true,
      })
    }
    await tenant?.cleanup()
  })

  async function requestDeletion(
    overrides: Partial<{
      actorAuthenticatedAt: string
      expectedGuildName: string
      confirmIrreversible: boolean
    }> = {},
  ) {
    return getTestServiceClient().rpc('request_tenant_deletion', {
      p_guild_id: tenant.guildId,
      p_actor_discord_id: actorDiscordId,
      p_actor_authenticated_at:
        overrides.actorAuthenticatedAt ?? new Date().toISOString(),
      p_expected_guild_name:
        overrides.expectedGuildName ?? 'Lifecycle Test Guild',
      p_confirm_irreversible:
        overrides.confirmIrreversible ?? true,
      p_reason: 'Integration lifecycle verification',
    })
  }

  it('suspends on bot removal without deleting data and restores only a ready tenant', async () => {
    const client = getTestServiceClient()
    const suspended = await client.rpc('suspend_tenant_for_bot_removal', {
      p_guild_id: tenant.guildId,
      p_observed_at: new Date().toISOString(),
    })
    expect(suspended.error).toBeNull()
    expect(suspended.data).toBe(true)

    const { data: suspendedTenant, error: suspendedError } = await client
      .from('tenants')
      .select('status,lifecycle_reason,bot_installed_at,bot_removed_at')
      .eq('id', tenant.guildId)
      .single()
    expect(suspendedError).toBeNull()
    expect(suspendedTenant).toMatchObject({
      status: 'suspended',
      lifecycle_reason: 'bot_removed',
      bot_installed_at: null,
    })
    expect(suspendedTenant?.bot_removed_at).toBeTruthy()

    const { count: preservedMembers, error: memberError } = await client
      .from('guild_avatars')
      .select('discord_id', { count: 'exact', head: true })
      .eq('guild_id', tenant.guildId)
    expect(memberError).toBeNull()
    expect(preservedMembers).toBe(1)

    const restored = await client.rpc('restore_tenant_after_bot_install', {
      p_guild_id: tenant.guildId,
      p_guild_name: 'Lifecycle Test Guild',
      p_installer_discord_id: actorDiscordId,
    })
    expect(restored.error).toBeNull()
    expect(restored.data?.[0]?.tenant_status).toBe('active')

    expect(
      (
        await client
          .from('tenants')
          .select('status,lifecycle_reason,bot_removed_at')
          .eq('id', tenant.guildId)
          .single()
      ).data,
    ).toMatchObject({
      status: 'active',
      lifecycle_reason: null,
      bot_removed_at: null,
    })
  })

  it('does not let bot reconciliation override a policy suspension', async () => {
    const client = getTestServiceClient()
    expect(
      (
        await client
          .from('tenants')
          .update({
            status: 'suspended',
            lifecycle_reason: 'policy',
            lifecycle_changed_at: new Date().toISOString(),
          })
          .eq('id', tenant.guildId)
      ).error,
    ).toBeNull()

    expect(
      (
        await client.rpc('suspend_tenant_for_bot_removal', {
          p_guild_id: tenant.guildId,
          p_observed_at: new Date().toISOString(),
        })
      ).error,
    ).toBeNull()
    const restored = await client.rpc('restore_tenant_after_bot_install', {
      p_guild_id: tenant.guildId,
      p_guild_name: 'Lifecycle Test Guild',
      p_installer_discord_id: actorDiscordId,
    })
    expect(restored.error).toBeNull()
    expect(restored.data?.[0]?.tenant_status).toBe('suspended')
    expect(
      (
        await client
          .from('tenants')
          .select('status,lifecycle_reason')
          .eq('id', tenant.guildId)
          .single()
      ).data,
    ).toEqual({
      status: 'suspended',
      lifecycle_reason: 'policy',
    })
  })

  it('uses the policy command without changing bot ownership or bypassing readiness', async () => {
    const client = getTestServiceClient()
    const suspended = await client.rpc('set_tenant_policy_suspension', {
      p_guild_id: tenant.guildId,
      p_suspended: true,
      p_actor_discord_id: actorDiscordId,
    })
    expect(suspended.error).toBeNull()
    expect(suspended.data).toMatchObject({
      status: 'suspended',
      idempotent: false,
    })
    expect(
      (
        await client
          .from('tenants')
          .select('status,lifecycle_reason,bot_installed_at')
          .eq('id', tenant.guildId)
          .single()
      ).data,
    ).toMatchObject({
      status: 'suspended',
      lifecycle_reason: 'policy',
    })
    expect(
      (
        await client
          .from('tenants')
          .select('bot_installed_at')
          .eq('id', tenant.guildId)
          .single()
      ).data?.bot_installed_at,
    ).toBeTruthy()

    const restored = await client.rpc('set_tenant_policy_suspension', {
      p_guild_id: tenant.guildId,
      p_suspended: false,
      p_actor_discord_id: actorDiscordId,
    })
    expect(restored.error).toBeNull()
    expect(restored.data).toMatchObject({
      status: 'active',
      idempotent: false,
    })
  })

  it('requires strong confirmation and blocks deletion while obligations are open', async () => {
    const stale = await requestDeletion({
      actorAuthenticatedAt: new Date(
        Date.now() - 11 * 60 * 1000,
      ).toISOString(),
    })
    expect(stale.error?.message).toContain(
      'WORKSPACE_DELETE_REAUTH_REQUIRED',
    )
    const wrongName = await requestDeletion({
      expectedGuildName: 'Wrong Guild',
    })
    expect(wrongName.error?.message).toContain(
      'WORKSPACE_DELETE_NAME_MISMATCH',
    )
    const unchecked = await requestDeletion({
      confirmIrreversible: false,
    })
    expect(unchecked.error?.message).toContain(
      'WORKSPACE_DELETE_CONFIRMATION_REQUIRED',
    )

    const sourceId = crypto.randomUUID()
    expect(
      (
        await getTestServiceClient().from('point_escrows').insert({
          guild_id: tenant.guildId,
          discord_id: memberDiscordId,
          amount: 100,
          status: 'held',
          source_kind: 'member_trade_order',
          source_id: sourceId,
        })
      ).error,
    ).toBeNull()
    const blocked = await requestDeletion()
    expect(blocked.error?.message).toContain(
      'WORKSPACE_DELETE_BLOCKED_OPEN_OBLIGATIONS',
    )
    expect(
      (
        await getTestServiceClient()
          .from('tenants')
          .select('status')
          .eq('id', tenant.guildId)
          .single()
      ).data?.status,
    ).toBe('active')

    expect(
      (
        await getTestServiceClient()
          .from('point_escrows')
          .delete()
          .eq('guild_id', tenant.guildId)
          .eq('source_id', sourceId)
      ).error,
    ).toBeNull()
  })

  it('preserves data during the 30-day window, rejects direct delete, and allows cancellation', async () => {
    const client = getTestServiceClient()
    const requested = await requestDeletion()
    expect(requested.error).toBeNull()
    expect(requested.data?.idempotent).toBe(false)
    const requestId = requested.data?.request_id as string
    const purgeAt = new Date(requested.data?.purge_at as string)
    expect(purgeAt.getTime()).toBeGreaterThanOrEqual(
      Date.now() + 30 * 24 * 60 * 60 * 1000 - 10_000,
    )

    const idempotent = await requestDeletion()
    expect(idempotent.error).toBeNull()
    expect(idempotent.data).toMatchObject({
      request_id: requestId,
      idempotent: true,
    })

    const { data: tenantState, error: tenantStateError } = await client
      .from('tenants')
      .select('status,lifecycle_reason,deletion_requested_at,purge_at')
      .eq('id', tenant.guildId)
      .single()
    expect(tenantStateError).toBeNull()
    expect(tenantState?.status).toBe('deletion_pending')
    expect(tenantState?.lifecycle_reason).toBe('deletion_requested')
    expect(tenantState?.deletion_requested_at).toBeTruthy()

    const { count: preservedMembers, error: memberError } = await client
      .from('guild_avatars')
      .select('discord_id', { count: 'exact', head: true })
      .eq('guild_id', tenant.guildId)
    expect(memberError).toBeNull()
    expect(preservedMembers).toBe(1)

    const directDelete = await client
      .from('tenants')
      .delete()
      .eq('id', tenant.guildId)
    expect(directDelete.error?.message).toContain(
      'TENANT_DELETE_REQUIRES_PURGE_CLAIM',
    )

    const notDue = await client.rpc('claim_due_tenant_deletions', {
      p_limit: 20,
    })
    expect(notDue.error).toBeNull()
    expect(
      (notDue.data ?? []).some(
        (row: { request_id: string }) => row.request_id === requestId,
      ),
    ).toBe(false)

    const cancelled = await client.rpc('cancel_tenant_deletion', {
      p_request_id: requestId,
      p_actor_discord_id: actorDiscordId,
      p_actor_authenticated_at: new Date().toISOString(),
      p_expected_guild_name: 'Lifecycle Test Guild',
      p_confirm_restore: true,
    })
    expect(cancelled.error).toBeNull()
    expect(cancelled.data).toMatchObject({
      status: 'cancelled',
      tenant_status: 'active',
      idempotent: false,
    })

    expect(
      (
        await client
          .from('tenants')
          .select('status,deletion_requested_at,purge_at')
          .eq('id', tenant.guildId)
          .single()
      ).data,
    ).toEqual({
      status: 'active',
      deletion_requested_at: null,
      purge_at: null,
    })
    expect(
      (
        await client
          .from('tenant_deletion_requests')
          .select('status,cancelled_by')
          .eq('id', requestId)
          .single()
      ).data,
    ).toEqual({
      status: 'cancelled',
      cancelled_by: actorDiscordId,
    })
  })

  it('keeps the tenant cascade inside its guild and retains global identities and other guilds', async () => {
    const client = getTestServiceClient()
    const otherTenant = await createTestTenant(
      `tenant-lifecycle-other-${crypto.randomUUID().slice(0, 8)}`,
    )
    const profileId = crypto.randomUUID()
    const startedEventId = crypto.randomUUID()
    const startedPartyId = crypto.randomUUID()
    try {
      expect(
        (
          await client.from('guild_avatars').insert({
            guild_id: otherTenant.guildId,
            discord_id: memberDiscordId,
            username: 'Other Guild Member',
            avatar: null,
          })
        ).error,
      ).toBeNull()
      expect(
        (
          await client.from('account_albion_profiles').insert({
            id: profileId,
            discord_id: memberDiscordId,
            albion_server: 'west',
            albion_player_id: `player-${profileId}`,
            albion_player_name: 'GlobalIdentity',
            is_primary: true,
          })
        ).error,
      ).toBeNull()
      expect(
        (
          await client.from('events').insert({
            id: startedEventId,
            guild_id: tenant.guildId,
            title: 'Immutable event removed only by tenant purge',
            gather_time: '',
            gather_at: new Date().toISOString(),
            gather_location: '',
            status: 'published',
            category: '전투',
            created_by: actorDiscordId,
          })
        ).error,
      ).toBeNull()
      expect(
        (
          await client.from('parties').insert({
            id: startedPartyId,
            guild_id: tenant.guildId,
            event_id: startedEventId,
            party_number: 1,
          })
        ).error,
      ).toBeNull()
      expect(
        (
          await client.from('slots').insert({
            id: crypto.randomUUID(),
            guild_id: tenant.guildId,
            party_id: startedPartyId,
            slot_number: 1,
            role_name: '탱커',
          })
        ).error,
      ).toBeNull()
      expect(
        (
          await client
            .from('events')
            .update({ battle_started_at: new Date().toISOString() })
            .eq('guild_id', tenant.guildId)
            .eq('id', startedEventId)
        ).error,
      ).toBeNull()

      expect(
        (
          await client
            .from('tenants')
            .delete()
            .eq('id', tenant.guildId)
        ).error,
      ).toBeNull()

      expect(
        (
          await client
            .from('tenants')
            .select('id', { count: 'exact', head: true })
            .eq('id', tenant.guildId)
        ).count,
      ).toBe(0)
      expect(
        (
          await client
            .from('events')
            .select('id', { count: 'exact', head: true })
            .eq('id', startedEventId)
        ).count,
      ).toBe(0)
      expect(
        (
          await client
            .from('guild_avatars')
            .select('discord_id', { count: 'exact', head: true })
            .eq('guild_id', tenant.guildId)
        ).count,
      ).toBe(0)
      expect(
        (
          await client
            .from('guild_avatars')
            .select('discord_id', { count: 'exact', head: true })
            .eq('guild_id', otherTenant.guildId)
            .eq('discord_id', memberDiscordId)
        ).count,
      ).toBe(1)
      expect(
        (
          await client
            .from('account_albion_profiles')
            .select('id', { count: 'exact', head: true })
            .eq('id', profileId)
        ).count,
      ).toBe(1)
    } finally {
      await client
        .from('account_albion_profiles')
        .delete()
        .eq('id', profileId)
      await otherTenant.cleanup()
    }
  })
})
