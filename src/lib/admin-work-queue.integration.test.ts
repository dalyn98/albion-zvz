import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('admin work queue snapshot (migration 356)', () => {
  let tenantA: TestTenant
  let tenantB: TestTenant
  const actorId = `work-queue-${crypto.randomUUID()}`

  beforeEach(async () => {
    tenantA = await createTestTenant(
      `work-queue-a-${crypto.randomUUID().slice(0, 6)}`,
    )
    tenantB = await createTestTenant(
      `work-queue-b-${crypto.randomUUID().slice(0, 6)}`,
    )
    for (const tenant of [tenantA, tenantB]) {
      const enabled = await getTestServiceClient().rpc(
        'change_guild_feature_state',
        {
          p_guild_id: tenant.guildId,
          p_feature_key: 'guild_economy',
          p_target_state: 'enabled',
          p_config: {},
          p_actor_discord_id: actorId,
        },
      )
      expect(enabled.error).toBeNull()
    }
  })

  afterEach(async () => {
    await tenantA?.cleanup()
    await tenantB?.cleanup()
    for (const tenant of [tenantA, tenantB]) {
      if (!tenant) continue
      const remaining = await getTestServiceClient()
        .from('tenants')
        .select('id')
        .eq('id', tenant.guildId)
      expect(remaining.error).toBeNull()
      expect(remaining.data).toEqual([])
    }
  })

  it('isolates tenants and keeps draining obligations in the shared snapshot', async () => {
    const client = getTestServiceClient()
    const oldestCreatedAt = '2026-08-01T01:00:00Z'
    const donationA = await client.from('donation_requests').insert({
      guild_id: tenantA.guildId,
      discord_id: actorId,
      username: 'Queue Member',
      silver: 1_000,
      screenshot_path: 'work-queue/a.webp',
      status: 'pending',
      created_at: oldestCreatedAt,
    }).select('id').single()
    expect(donationA.error).toBeNull()
    const donationB = await client.from('donation_requests').insert({
      guild_id: tenantB.guildId,
      discord_id: actorId,
      username: 'Other Tenant Member',
      silver: 2_000,
      screenshot_path: 'work-queue/b.webp',
      status: 'pending',
    })
    expect(donationB.error).toBeNull()

    const active = await client.rpc('admin_work_queue_snapshot', {
      p_guild_id: tenantA.guildId,
    })
    expect(active.error).toBeNull()
    expect(active.data).toHaveLength(7)
    const activeDonation = active.data?.find(
      (row: { queue_key: string }) => row.queue_key === 'donation',
    ) as { pending_count: number; oldest_created_at: string } | undefined
    expect(activeDonation?.pending_count).toBe(1)
    expect(Date.parse(activeDonation?.oldest_created_at ?? '')).toBe(
      Date.parse(oldestCreatedAt),
    )

    const draining = await client.rpc('change_guild_feature_state', {
      p_guild_id: tenantA.guildId,
      p_feature_key: 'guild_economy',
      p_target_state: 'disabled',
      p_config: {},
      p_actor_discord_id: actorId,
    })
    expect(draining.error).toBeNull()
    expect(draining.data).toMatchObject({ state: 'draining' })

    const duringDrain = await client.rpc('admin_work_queue_snapshot', {
      p_guild_id: tenantA.guildId,
    })
    expect(duringDrain.error).toBeNull()
    expect(duringDrain.data?.find(
      (row: { queue_key: string }) => row.queue_key === 'donation',
    ))
      .toMatchObject({ pending_count: 1 })

    const resolved = await client.from('donation_requests').update({
      status: 'rejected',
      resolved_at: new Date().toISOString(),
    }).eq('id', donationA.data?.id)
    expect(resolved.error).toBeNull()

    const disabled = await client.rpc('admin_work_queue_snapshot', {
      p_guild_id: tenantA.guildId,
    })
    expect(disabled.error).toBeNull()
    expect(disabled.data?.find(
      (row: { queue_key: string }) => row.queue_key === 'donation',
    ))
      .toMatchObject({ pending_count: 0, oldest_created_at: null })
  })
})
