import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

interface DeliveryClaim {
  claimed: boolean
  status: string
  claimToken?: string
}

interface DomainClaim {
  id: string
  guild_id: string
  claim_token: string
  attempts: number
}

describeIntegration('reliable Discord delivery claims (migration 338)', () => {
  let tenant: TestTenant

  beforeEach(async () => {
    tenant = await createTestTenant(`delivery-${crypto.randomUUID().slice(0, 8)}`)
  })

  afterEach(async () => {
    await tenant?.cleanup()
  })

  async function claimAdmin(sourceId: string): Promise<DeliveryClaim> {
    const { data, error } = await getTestServiceClient().rpc(
      'claim_admin_notification_delivery',
      {
        p_guild_id: tenant.guildId,
        p_topic: 'craft',
        p_source_table: 'supply_fulfillment',
        p_source_id: sourceId,
        p_delivery_kind: 'channel',
        p_lease_seconds: 300,
      },
    )
    expect(error).toBeNull()
    return data as unknown as DeliveryClaim
  }

  async function completeAdmin(input: {
    sourceId: string
    claimToken: string
    status: 'sent' | 'failed'
  }): Promise<boolean> {
    const { data, error } = await getTestServiceClient().rpc(
      'complete_admin_notification_delivery',
      {
        p_guild_id: tenant.guildId,
        p_topic: 'craft',
        p_source_table: 'supply_fulfillment',
        p_source_id: input.sourceId,
        p_delivery_kind: 'channel',
        p_claim_token: input.claimToken,
        p_status: input.status,
        p_discord_channel_id: input.status === 'sent' ? '811111111111111111' : null,
        p_discord_message_id: input.status === 'sent' ? '822222222222222222' : null,
        p_error: input.status === 'failed' ? 'temporary failure' : null,
      },
    )
    expect(error).toBeNull()
    return data as boolean
  }

  it('serializes one admin delivery and only accepts the active claim token', async () => {
    const sourceId = crypto.randomUUID()
    const first = await claimAdmin(sourceId)
    expect(first).toMatchObject({ claimed: true, status: 'processing' })
    expect(first.claimToken).toMatch(/^[0-9a-f-]{36}$/)

    await expect(claimAdmin(sourceId)).resolves.toEqual({
      claimed: false,
      status: 'processing',
    })
    await expect(completeAdmin({
      sourceId,
      claimToken: crypto.randomUUID(),
      status: 'sent',
    })).resolves.toBe(false)
    await expect(completeAdmin({
      sourceId,
      claimToken: first.claimToken!,
      status: 'sent',
    })).resolves.toBe(true)

    await expect(claimAdmin(sourceId)).resolves.toEqual({
      claimed: false,
      status: 'sent',
    })
    const { data, error } = await getTestServiceClient()
      .from('admin_notification_deliveries')
      .select('status, attempts, claim_token, delivered_at, discord_channel_id, discord_message_id')
      .eq('guild_id', tenant.guildId)
      .eq('source_id', sourceId)
      .single()
    expect(error).toBeNull()
    expect(data).toMatchObject({
      status: 'sent',
      attempts: 1,
      claim_token: null,
      discord_channel_id: '811111111111111111',
      discord_message_id: '822222222222222222',
    })
    expect(data?.delivered_at).toBeTruthy()
  })

  it('releases a failed admin delivery for a bounded retry', async () => {
    const sourceId = crypto.randomUUID()
    const first = await claimAdmin(sourceId)
    await expect(completeAdmin({
      sourceId,
      claimToken: first.claimToken!,
      status: 'failed',
    })).resolves.toBe(true)

    const retry = await claimAdmin(sourceId)
    expect(retry).toMatchObject({ claimed: true, status: 'processing' })
    expect(retry.claimToken).not.toBe(first.claimToken)
    const { data, error } = await getTestServiceClient()
      .from('admin_notification_deliveries')
      .select('attempts, last_error')
      .eq('guild_id', tenant.guildId)
      .eq('source_id', sourceId)
      .single()
    expect(error).toBeNull()
    expect(data).toEqual({ attempts: 2, last_error: null })
  })

  it('claims the target domain outbox row once and guards completion by row lease', async () => {
    const client = getTestServiceClient()
    const discordId = '833333333333333333'
    const avatar = await client.from('guild_avatars').insert({
      guild_id: tenant.guildId,
      discord_id: discordId,
      username: 'Delivery Member',
      avatar: null,
    })
    expect(avatar.error).toBeNull()
    const identity = await client
      .from('guild_member_access_identities')
      .select('guild_member_id')
      .eq('guild_id', tenant.guildId)
      .eq('identity_type', 'discord')
      .eq('subject_id', discordId)
      .single()
    expect(identity.error).toBeNull()

    const outboxId = crypto.randomUUID()
    const inserted = await client.from('domain_outbox').insert({
      id: outboxId,
      guild_id: tenant.guildId,
      topic: 'craft.ready_for_pickup',
      aggregate_kind: 'supply_fulfillment',
      aggregate_id: crypto.randomUUID(),
      recipient_kind: 'member',
      recipient_member_id: identity.data!.guild_member_id,
      payload: { eventTitle: 'CTA', boxNumber: 7 },
      correlation_id: `delivery-test:${outboxId}`,
      // The worker RPC intentionally claims across every tenant. Keep this
      // fixture ahead of unrelated outbox rows left by other integration
      // scenarios so this test can request a one-row batch deterministically.
      available_at: '2000-01-01T00:00:00.000Z',
    })
    expect(inserted.error).toBeNull()

    const first = await client.rpc('claim_domain_outbox', {
      p_limit: 1,
      p_lease_seconds: 300,
    })
    expect(first.error).toBeNull()
    expect(first.data).toHaveLength(1)
    const claim = first.data![0] as unknown as DomainClaim
    expect(claim).toMatchObject({
      id: outboxId,
      guild_id: tenant.guildId,
      attempts: 1,
    })
    expect(claim.claim_token).toMatch(/^[0-9a-f-]{36}$/)

    const wrong = await client.rpc('complete_domain_outbox', {
      p_id: outboxId,
      p_claim_token: crypto.randomUUID(),
      p_status: 'sent',
      p_error: null,
    })
    expect(wrong.error).toBeNull()
    expect(wrong.data).toBe(false)

    const stillClaimed = await client
      .from('domain_outbox')
      .select('status, attempts, claim_token')
      .eq('id', outboxId)
      .single()
    expect(stillClaimed.error).toBeNull()
    expect(stillClaimed.data).toEqual({
      status: 'processing',
      attempts: 1,
      claim_token: claim.claim_token,
    })

    const completed = await client.rpc('complete_domain_outbox', {
      p_id: outboxId,
      p_claim_token: claim.claim_token,
      p_status: 'sent',
      p_error: null,
    })
    expect(completed.error).toBeNull()
    expect(completed.data).toBe(true)

    const row = await client
      .from('domain_outbox')
      .select('status, attempts, claim_token, claimed_at, delivered_at')
      .eq('id', outboxId)
      .single()
    expect(row.error).toBeNull()
    expect(row.data).toMatchObject({
      status: 'sent',
      attempts: 1,
      claim_token: null,
      claimed_at: null,
    })
    expect(row.data?.delivered_at).toBeTruthy()
  })

  it('backs off a failed domain delivery instead of burning all retries in one run', async () => {
    const client = getTestServiceClient()
    const outboxId = crypto.randomUUID()
    const inserted = await client.from('domain_outbox').insert({
      id: outboxId,
      guild_id: tenant.guildId,
      topic: 'craft.pickup_collected',
      aggregate_kind: 'supply_fulfillment',
      aggregate_id: crypto.randomUUID(),
      recipient_kind: 'admin',
      recipient_member_id: null,
      payload: {},
      correlation_id: `delivery-backoff:${outboxId}`,
      available_at: '2000-01-01T00:00:00.000Z',
    })
    expect(inserted.error).toBeNull()

    const claimed = await client.rpc('claim_domain_outbox', {
      p_limit: 1,
      p_lease_seconds: 300,
    })
    expect(claimed.error).toBeNull()
    expect(claimed.data).toHaveLength(1)
    const claim = claimed.data![0] as unknown as DomainClaim

    const beforeFailure = Date.now()
    const failed = await client.rpc('complete_domain_outbox', {
      p_id: outboxId,
      p_claim_token: claim.claim_token,
      p_status: 'failed',
      p_error: 'temporary failure',
    })
    expect(failed.error).toBeNull()
    expect(failed.data).toBe(true)

    const row = await client
      .from('domain_outbox')
      .select('status, attempts, available_at, last_error')
      .eq('id', outboxId)
      .single()
    expect(row.error).toBeNull()
    expect(row.data).toMatchObject({
      status: 'failed',
      attempts: 1,
      last_error: 'temporary failure',
    })
    expect(Date.parse(row.data!.available_at)).toBeGreaterThanOrEqual(beforeFailure + 55_000)

    const immediateRetry = await client.rpc('claim_domain_outbox', {
      p_limit: 1,
      p_lease_seconds: 300,
    })
    expect(immediateRetry.error).toBeNull()
    expect(immediateRetry.data).toEqual([])
  })
})
