import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  enableTestTenantFeatures,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip
const DIGEST = 'a'.repeat(64)

type JsonObject = Record<string, unknown>

describeIntegration('same-guild atomic recovery (migrations 303-304)', () => {
  let tenantA: TestTenant
  let tenantB: TestTenant
  let memberId: string
  let pendingExchangeId: string

  beforeEach(async () => {
    tenantA = await createTestTenant('guild-recovery-a')
    tenantB = await createTestTenant('guild-recovery-b')
    await Promise.all([
      enableTestTenantFeatures(tenantA.guildId, ['guild_shop']),
      enableTestTenantFeatures(tenantB.guildId, ['guild_shop']),
    ])
    memberId = `recovery-member-${crypto.randomUUID()}`
    pendingExchangeId = crypto.randomUUID()
    const client = getTestServiceClient()

    const { error: settingsError } = await client.from('app_settings').upsert([
      {
        guild_id: tenantA.guildId,
        key: 'albion_home_guild_id',
        value: `logical-a-${tenantA.guildId}`,
      },
      {
        guild_id: tenantB.guildId,
        key: 'albion_home_guild_id',
        value: `logical-b-${tenantB.guildId}`,
      },
    ], { onConflict: 'guild_id,key' })
    expect(settingsError).toBeNull()

    const { error: memberError } = await client.from('guild_avatars').insert({
      guild_id: tenantA.guildId,
      discord_id: memberId,
      username: 'Recovery Member',
      avatar: null,
    })
    expect(memberError).toBeNull()

    const [{ error: pointError }, { error: stockError }, { error: exchangeError }] =
      await Promise.all([
        client.from('point_ledger').insert({
          guild_id: tenantA.guildId,
          discord_id: memberId,
          delta: 100,
          reason: 'admin_adjust',
          memo: 'recovery fixture',
        }),
        client.from('shop_inventory').insert({
          guild_id: tenantA.guildId,
          unique_name: 'T4_MAIN_SWORD',
          enchant: 0,
          quality: 4,
          stock: 5,
          name_ko: '브로드소드',
        }),
        client.from('exchange_requests').insert({
          id: pendingExchangeId,
          guild_id: tenantA.guildId,
          discord_id: memberId,
          username: 'Recovery Member',
          silver: 20,
          status: 'pending',
          held_points: 20,
          hold_status: 'held',
          held_at: new Date().toISOString(),
        }),
      ])
    expect(pointError).toBeNull()
    expect(stockError).toBeNull()
    expect(exchangeError).toBeNull()
  })

  afterEach(async () => {
    await tenantA?.cleanup()
    await tenantB?.cleanup()
  })

  async function exportManifest(): Promise<JsonObject> {
    const client = getTestServiceClient()
    const { data, error } = await client.rpc('export_guild_recovery_state', {
      p_guild_id: tenantA.guildId,
    })
    expect(error).toBeNull()
    const exported = data as JsonObject
    return {
      kind: 'guild-operational-recovery',
      schemaVersion: 2,
      backupId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      source: {
        workspaceId: exported.sourceWorkspaceId,
        albionGuildId: exported.sourceAlbionGuildId,
        guildName: exported.sourceGuildName,
      },
      state: structuredClone(exported.state),
      integrity: { algorithm: 'SHA-256', digest: DIGEST },
    }
  }

  async function registerManifest(manifest: JsonObject): Promise<void> {
    const { error } = await getTestServiceClient().rpc(
      'register_guild_recovery_manifest',
      {
        p_guild_id: tenantA.guildId,
        p_manifest: manifest,
        p_verified_sha256: DIGEST,
      },
    )
    expect(error).toBeNull()
  }

  it('rejects another tenant in both preview and apply without mutation', async () => {
    const client = getTestServiceClient()
    const manifest = await exportManifest()
    await registerManifest(manifest)

    const { error: previewError } = await client.rpc(
      'preview_guild_recovery_manifest',
      {
        p_guild_id: tenantB.guildId,
        p_manifest: manifest,
        p_verified_sha256: DIGEST,
      },
    )
    expect(previewError?.message).toContain('GUILD_RECOVERY_SOURCE_MISMATCH')

    const { error: applyError } = await client.rpc(
      'restore_guild_recovery_manifest',
      {
        p_guild_id: tenantB.guildId,
        p_manifest: manifest,
        p_verified_sha256: DIGEST,
        p_idempotency_key: crypto.randomUUID(),
        p_actor_discord_id: 'admin-b',
        p_actor_username: 'Admin B',
      },
    )
    expect(applyError?.message).toContain('GUILD_RECOVERY_SOURCE_MISMATCH')

    const { count } = await client
      .from('guild_recovery_runs')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', tenantB.guildId)
    expect(count).toBe(0)
  })

  it('restores balances and finished stock with a durable snapshot, diff, and audit receipt', async () => {
    const client = getTestServiceClient()
    const manifest = await exportManifest()
    const state = manifest.state as Record<string, JsonObject[]>
    state.pointBalances[0].balance = '250'
    state.shopInventory[0].stock = 2
    const idempotencyKey = crypto.randomUUID()
    await registerManifest(manifest)

    const { data: receipt, error } = await client.rpc(
      'restore_guild_recovery_manifest',
      {
        p_guild_id: tenantA.guildId,
        p_manifest: manifest,
        p_verified_sha256: DIGEST,
        p_idempotency_key: idempotencyKey,
        p_actor_discord_id: 'admin-a',
        p_actor_username: 'Admin A',
      },
    )
    expect(error).toBeNull()
    expect((receipt as JsonObject).safetySnapshotStored).toBe(true)

    const [{ data: ledger }, { data: stock }, { data: run }, { data: audit }] =
      await Promise.all([
        client
          .from('point_ledger')
          .select('delta')
          .eq('guild_id', tenantA.guildId)
          .eq('discord_id', memberId),
        client
          .from('shop_inventory')
          .select('stock')
          .eq('guild_id', tenantA.guildId)
          .eq('unique_name', 'T4_MAIN_SWORD')
          .single(),
        client
          .from('guild_recovery_runs')
          .select('safety_snapshot, before_summary, after_summary, restore_diff')
          .eq('guild_id', tenantA.guildId)
          .eq('idempotency_key', idempotencyKey)
          .single(),
        client
          .from('admin_audit_log')
          .select('action, details')
          .eq('guild_id', tenantA.guildId)
          .eq('action', 'backup.import')
          .single(),
      ])
    expect(ledger?.reduce((sum, row) => sum + row.delta, 0)).toBe(250)
    expect(stock?.stock).toBe(2)
    expect(run?.safety_snapshot).toBeTruthy()
    expect(run?.before_summary).toBeTruthy()
    expect(run?.after_summary).toBeTruthy()
    expect(run?.restore_diff).toBeTruthy()
    expect(audit?.action).toBe('backup.import')

    const { data: replay, error: replayError } = await client.rpc(
      'restore_guild_recovery_manifest',
      {
        p_guild_id: tenantA.guildId,
        p_manifest: manifest,
        p_verified_sha256: DIGEST,
        p_idempotency_key: idempotencyKey,
        p_actor_discord_id: 'admin-a',
        p_actor_username: 'Admin A',
      },
    )
    expect(replayError).toBeNull()
    expect((replay as JsonObject).replayed).toBe(true)
  })

  it('releases a point hold when recovery closes an omitted pending exchange', async () => {
    const client = getTestServiceClient()
    const manifest = await exportManifest()
    const state = manifest.state as Record<string, JsonObject[]>
    state.exchangeRequests = []
    await registerManifest(manifest)

    const { error } = await client.rpc('restore_guild_recovery_manifest', {
      p_guild_id: tenantA.guildId,
      p_manifest: manifest,
      p_verified_sha256: DIGEST,
      p_idempotency_key: crypto.randomUUID(),
      p_actor_discord_id: 'admin-a',
      p_actor_username: 'Admin A',
    })
    expect(error).toBeNull()

    const { data: exchange, error: exchangeError } = await client
      .from('exchange_requests')
      .select('status, held_points, hold_status, hold_resolved_at')
      .eq('guild_id', tenantA.guildId)
      .eq('id', pendingExchangeId)
      .single()
    expect(exchangeError).toBeNull()
    expect(exchange).toMatchObject({
      status: 'rejected',
      held_points: 0,
      hold_status: 'released',
    })
    expect(exchange?.hold_resolved_at).toBeTruthy()
  })

  it('rolls back earlier obligation changes when a later restored row violates a constraint', async () => {
    const client = getTestServiceClient()
    const manifest = await exportManifest()
    const state = manifest.state as Record<string, JsonObject[]>
    const invalidExchange = {
      ...state.exchangeRequests[0],
      id: crypto.randomUUID(),
      silver: -1,
    }
    state.exchangeRequests = [invalidExchange]
    state.pointBalances[0].balance = '999'
    state.shopInventory[0].stock = 1
    const idempotencyKey = crypto.randomUUID()
    await registerManifest(manifest)

    const { error } = await client.rpc('restore_guild_recovery_manifest', {
      p_guild_id: tenantA.guildId,
      p_manifest: manifest,
      p_verified_sha256: DIGEST,
      p_idempotency_key: idempotencyKey,
      p_actor_discord_id: 'admin-a',
      p_actor_username: 'Admin A',
    })
    expect(error).not.toBeNull()

    const [
      { data: exchange },
      { data: ledger },
      { data: stock },
      { count: runCount },
    ] = await Promise.all([
      client
        .from('exchange_requests')
        .select('status')
        .eq('guild_id', tenantA.guildId)
        .eq('id', pendingExchangeId)
        .single(),
      client
        .from('point_ledger')
        .select('delta')
        .eq('guild_id', tenantA.guildId)
        .eq('discord_id', memberId),
      client
        .from('shop_inventory')
        .select('stock')
        .eq('guild_id', tenantA.guildId)
        .eq('unique_name', 'T4_MAIN_SWORD')
        .single(),
      client
        .from('guild_recovery_runs')
        .select('id', { count: 'exact', head: true })
        .eq('guild_id', tenantA.guildId)
        .eq('idempotency_key', idempotencyKey),
    ])
    expect(exchange?.status).toBe('pending')
    expect(ledger?.reduce((sum, row) => sum + row.delta, 0)).toBe(100)
    expect(stock?.stock).toBe(5)
    expect(runCount).toBe(0)
  })

  it('rejects nested member or finance data in a cross-guild template package', async () => {
    const client = getTestServiceClient()
    const unsafeName = `unsafe-${crypto.randomUUID()}`
    const { error } = await client.rpc('import_guild_template_package', {
      p_guild_id: tenantB.guildId,
      p_package: {
        kind: 'guild-template-package',
        schemaVersion: 1,
        packageId: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        source: { guildName: 'Source Guild' },
        templates: {
          events: [{
            name: unsafeName,
            data: {
              parties: [{
                party_number: 1,
                slots: [{
                  slot_number: 1,
                  assigned_discord_id: memberId,
                }],
              }],
            },
          }],
          slots: [],
        },
        integrity: { algorithm: 'SHA-256', digest: DIGEST },
      },
    })

    expect(error?.message).toContain('GUILD_TEMPLATE_PACKAGE_INVALID')
    const { count } = await client
      .from('event_templates')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', tenantB.guildId)
      .eq('name', unsafeName)
    expect(count).toBe(0)
  })
})
