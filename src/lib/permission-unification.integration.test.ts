import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'
import { CAP } from './permissions'

const describeIntegration = hasTestEnv() ? describe : describe.skip

const ACTOR_A = '900000000000000001'
const ACTOR_B = '900000000000000002'
const ROLE_ADMIN = '800000000000000001'
const ROLE_EVENT = '800000000000000002'
const ROLE_REPLACEMENT = '800000000000000003'
const TARGET_USER = '700000000000000001'

describeIntegration('unified Discord permission commands (305-307)', () => {
  let tenantA: TestTenant
  let tenantB: TestTenant

  beforeEach(async () => {
    tenantA = await createTestTenant('permission-unification-a')
    tenantB = await createTestTenant('permission-unification-b')
    const client = getTestServiceClient()
    const [{ error: ownerAError }, { error: ownerBError }] =
      await Promise.all([
        client
          .from('tenants')
          .update({ created_by_discord_id: ACTOR_A })
          .eq('id', tenantA.guildId),
        client
          .from('tenants')
          .update({ created_by_discord_id: ACTOR_B })
          .eq('id', tenantB.guildId),
      ])
    expect(ownerAError).toBeNull()
    expect(ownerBError).toBeNull()
  })

  afterEach(async () => {
    await tenantA?.cleanup()
    await tenantB?.cleanup()
  })

  it('updates one tenant, projects legacy arrays, audits impact, and rejects a stale editor', async () => {
    const client = getTestServiceClient()
    const capabilities = (CAP.GUILD_ADMIN | CAP.EVENT_CREATE_COMBAT).toString()
    const { error } = await client.rpc('apply_permission_role_grant', {
      p_guild_id: tenantA.guildId,
      p_discord_role_id: ROLE_ADMIN,
      p_discord_role_name: 'ZvZ Officers',
      p_capabilities: capabilities,
      p_actor_discord_id: ACTOR_A,
      p_notes: 'integration role mapping',
      p_expected_updated_at: null,
      p_affected_member_count: 7,
      p_delete: false,
    })
    expect(error).toBeNull()

    const [
      { data: tenantRow },
      { data: combatSetting },
      { data: otherTenant },
      { data: grant },
      { data: audit },
    ] = await Promise.all([
      client
        .from('tenants')
        .select('admin_role_ids')
        .eq('id', tenantA.guildId)
        .single(),
      client
        .from('app_settings')
        .select('value')
        .eq('guild_id', tenantA.guildId)
        .eq('key', 'event_creator_role_ids_combat')
        .single(),
      client
        .from('tenants')
        .select('admin_role_ids')
        .eq('id', tenantB.guildId)
        .single(),
      client
        .from('permission_role_grants')
        .select('capabilities, discord_role_name, updated_at')
        .eq('guild_id', tenantA.guildId)
        .eq('discord_role_id', ROLE_ADMIN)
        .single(),
      client
        .from('admin_audit_log')
        .select('action, target_id, details')
        .eq('guild_id', tenantA.guildId)
        .eq('action', 'permission.role.update')
        .eq('target_id', ROLE_ADMIN)
        .single(),
    ])

    expect(tenantRow?.admin_role_ids).toEqual([ROLE_ADMIN])
    expect(JSON.parse(combatSetting?.value ?? '[]')).toEqual([ROLE_ADMIN])
    expect(otherTenant?.admin_role_ids ?? []).not.toContain(ROLE_ADMIN)
    expect(String(grant?.capabilities)).toBe(capabilities)
    expect(grant?.discord_role_name).toBe('ZvZ Officers')
    expect(audit?.action).toBe('permission.role.update')
    expect(audit?.target_id).toBe(ROLE_ADMIN)
    expect(audit?.details).toEqual(
      expect.objectContaining({
        beforeCapabilities: null,
        afterCapabilities: capabilities,
        affectedMemberCount: 7,
      }),
    )

    const { error: conflict } = await client.rpc(
      'apply_permission_role_grant',
      {
        p_guild_id: tenantA.guildId,
        p_discord_role_id: ROLE_ADMIN,
        p_discord_role_name: 'Stale Name',
        p_capabilities: CAP.GUILD_ADMIN.toString(),
        p_actor_discord_id: ACTOR_A,
        p_notes: '',
        p_expected_updated_at: '2000-01-01T00:00:00.000Z',
        p_affected_member_count: 1,
        p_delete: false,
      },
    )
    expect(conflict?.message).toContain('PERMISSION_ROLE_CONFLICT')
  })

  it('keeps previous-app legacy role writes effective during a rolling deployment', async () => {
    const client = getTestServiceClient()
    const [{ error: adminWriteError }, { error: eventWriteError }] = await Promise.all([
      client
        .from('tenants')
        .update({ admin_role_ids: [ROLE_ADMIN] })
        .eq('id', tenantA.guildId),
      client.from('app_settings').upsert({
        guild_id: tenantA.guildId,
        key: 'event_creator_role_ids_ff',
        value: JSON.stringify([ROLE_EVENT]),
      }, { onConflict: 'guild_id,key' }),
    ])
    expect(adminWriteError).toBeNull()
    expect(eventWriteError).toBeNull()

    const { data: initialRows, error: initialError } = await client
      .from('permission_role_grants')
      .select('discord_role_id, capabilities')
      .eq('guild_id', tenantA.guildId)
      .in('discord_role_id', [ROLE_ADMIN, ROLE_EVENT])
    expect(initialError).toBeNull()
    const initial = new Map(
      (initialRows ?? []).map((row) => [
        row.discord_role_id,
        BigInt(String(row.capabilities)),
      ]),
    )
    expect(initial.get(ROLE_ADMIN)).toBe(CAP.GUILD_ADMIN)
    expect(initial.get(ROLE_EVENT)).toBe(CAP.EVENT_CREATE_FF)

    const [{ error: replaceAdminError }, { error: clearEventError }] = await Promise.all([
      client
        .from('tenants')
        .update({ admin_role_ids: [ROLE_REPLACEMENT] })
        .eq('id', tenantA.guildId),
      client.from('app_settings').upsert({
        guild_id: tenantA.guildId,
        key: 'event_creator_role_ids_ff',
        value: '[]',
      }, { onConflict: 'guild_id,key' }),
    ])
    expect(replaceAdminError).toBeNull()
    expect(clearEventError).toBeNull()

    const [
      { data: finalRows, error: finalError },
      { count: tenantBCount, error: tenantBError },
    ] = await Promise.all([
      client
        .from('permission_role_grants')
        .select('discord_role_id, capabilities')
        .eq('guild_id', tenantA.guildId)
        .in('discord_role_id', [ROLE_ADMIN, ROLE_EVENT, ROLE_REPLACEMENT]),
      client
        .from('permission_role_grants')
        .select('discord_role_id', { count: 'exact', head: true })
        .eq('guild_id', tenantB.guildId)
        .in('discord_role_id', [ROLE_ADMIN, ROLE_EVENT, ROLE_REPLACEMENT]),
    ])
    expect(finalError).toBeNull()
    expect(tenantBError).toBeNull()
    const final = new Map(
      (finalRows ?? []).map((row) => [
        row.discord_role_id,
        BigInt(String(row.capabilities)),
      ]),
    )
    expect(final.get(ROLE_REPLACEMENT)).toBe(CAP.GUILD_ADMIN)
    expect(final.has(ROLE_ADMIN)).toBe(false)
    expect(final.has(ROLE_EVENT)).toBe(false)
    expect(tenantBCount).toBe(0)
  })

  it('rejects local subjects and invalid lifetimes, then retains an early revocation', async () => {
    const client = getTestServiceClient()
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const common = {
      p_guild_id: tenantA.guildId,
      p_capabilities_granted: CAP.AUDIT_VIEW.toString(),
      p_capabilities_revoked: '0',
      p_reason: 'Temporary incident response coverage',
      p_expires_at: expiresAt,
      p_actor_discord_id: ACTOR_A,
      p_notes: '',
      p_expected_updated_at: null,
      p_revoke: false,
      p_revoke_reason: '',
    }

    const { error: localError } = await client.rpc(
      'apply_permission_user_override',
      {
        ...common,
        p_discord_id: 'local:operator',
      },
    )
    expect(localError?.message).toContain('INVALID_PERMISSION_OVERRIDE_INPUT')

    const { error: lifetimeError } = await client.rpc(
      'apply_permission_user_override',
      {
        ...common,
        p_discord_id: TARGET_USER,
        p_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      },
    )
    expect(lifetimeError?.message).toContain(
      'INVALID_PERMISSION_OVERRIDE_LIFETIME',
    )

    const { error: createError } = await client.rpc(
      'apply_permission_user_override',
      {
        ...common,
        p_discord_id: TARGET_USER,
      },
    )
    expect(createError).toBeNull()

    const { data: active } = await client
      .from('permission_user_overrides')
      .select('updated_at, revoked_at, reason, expires_at')
      .eq('guild_id', tenantA.guildId)
      .eq('discord_id', TARGET_USER)
      .single()
    expect(active?.revoked_at).toBeNull()
    expect(active?.reason).toBe(common.p_reason)

    const { error: revokeError } = await client.rpc(
      'apply_permission_user_override',
      {
        ...common,
        p_discord_id: TARGET_USER,
        p_expected_updated_at: active?.updated_at,
        p_revoke: true,
        p_revoke_reason: 'Incident coverage ended early',
      },
    )
    expect(revokeError).toBeNull()

    const [
      { data: retained },
      { count: otherTenantCount },
      { data: audits },
    ] = await Promise.all([
      client
        .from('permission_user_overrides')
        .select('revoked_at, revoked_by_discord_id, revoked_reason')
        .eq('guild_id', tenantA.guildId)
        .eq('discord_id', TARGET_USER)
        .single(),
      client
        .from('permission_user_overrides')
        .select('discord_id', { count: 'exact', head: true })
        .eq('guild_id', tenantB.guildId)
        .eq('discord_id', TARGET_USER),
      client
        .from('admin_audit_log')
        .select('action, details')
        .eq('guild_id', tenantA.guildId)
        .eq('target_id', TARGET_USER)
        .order('created_at', { ascending: true }),
    ])
    expect(retained?.revoked_at).not.toBeNull()
    expect(retained?.revoked_by_discord_id).toBe(ACTOR_A)
    expect(retained?.revoked_reason).toBe('Incident coverage ended early')
    expect(otherTenantCount).toBe(0)
    expect(audits?.map((row) => row.action)).toEqual([
      'permission.user.update',
      'permission.user.revoke',
    ])
  })

  it('uses the same GUILD_ADMIN mapping command during self-serve onboarding', async () => {
    const client = getTestServiceClient()
    const { error: seedError } = await client.rpc(
      'apply_permission_role_grant',
      {
        p_guild_id: tenantA.guildId,
        p_discord_role_id: ROLE_EVENT,
        p_discord_role_name: 'Event Lead',
        p_capabilities: (
          CAP.GUILD_ADMIN |
          CAP.EVENT_CREATE_FF
        ).toString(),
        p_actor_discord_id: ACTOR_A,
        p_notes: '',
        p_expected_updated_at: null,
        p_affected_member_count: 2,
        p_delete: false,
      },
    )
    expect(seedError).toBeNull()

    const { error } = await client.rpc(
      'replace_onboarding_permission_admin_roles',
      {
        p_guild_id: tenantA.guildId,
        p_roles: [{ id: ROLE_REPLACEMENT, name: 'Guild Admin' }],
        p_actor_discord_id: ACTOR_A,
      },
    )
    expect(error).toBeNull()

    const [
      { data: roles },
      { data: tenantRow },
      { data: audit },
    ] = await Promise.all([
      client
        .from('permission_role_grants')
        .select('discord_role_id, capabilities')
        .eq('guild_id', tenantA.guildId)
        .order('discord_role_id'),
      client
        .from('tenants')
        .select('admin_role_ids')
        .eq('id', tenantA.guildId)
        .single(),
      client
        .from('admin_audit_log')
        .select('details')
        .eq('guild_id', tenantA.guildId)
        .eq('action', 'permission.role.update')
        .contains('details', { source: 'self_serve_onboarding' })
        .single(),
    ])

    const roleById = new Map(
      (roles ?? []).map((role) => [
        role.discord_role_id,
        BigInt(String(role.capabilities)),
      ]),
    )
    expect(roleById.get(ROLE_REPLACEMENT)).toBe(CAP.GUILD_ADMIN)
    expect(roleById.get(ROLE_EVENT)).toBe(CAP.EVENT_CREATE_FF)
    expect(tenantRow?.admin_role_ids).toEqual([ROLE_REPLACEMENT])
    expect(audit?.details).toEqual(
      expect.objectContaining({
        source: 'self_serve_onboarding',
        afterAdminRoleIds: [ROLE_REPLACEMENT],
      }),
    )
  })
})
