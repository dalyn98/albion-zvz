import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('application command idempotency (migration 311)', () => {
  let tenant: TestTenant
  const senderId = '111111111111111111'
  const recipientId = '222222222222222222'
  const discordGuildId = '333333333333333333'

  beforeEach(async () => {
    tenant = await createTestTenant('application-command')
    const client = getTestServiceClient()
    const { error: memberError } = await client.from('guild_avatars').insert([
      {
        guild_id: tenant.guildId,
        discord_id: senderId,
        username: 'Sender',
        avatar: null,
      },
      {
        guild_id: tenant.guildId,
        discord_id: recipientId,
        username: 'Recipient',
        avatar: null,
      },
    ])
    expect(memberError).toBeNull()
    const { error: balanceError } = await client.from('point_ledger').insert({
      guild_id: tenant.guildId,
      discord_id: senderId,
      delta: 500,
      reason: 'admin_adjust',
      memo: 'application command fixture',
    })
    expect(balanceError).toBeNull()
  })

  afterEach(async () => {
    await tenant?.cleanup()
  })

  function transferPayload(amount = 120) {
    return {
      request: {
        transfers: [{
          discord_id: recipientId,
          amount,
          memo: 'supply',
        }],
      },
      execution: {
        spendableBefore: 500,
        transfers: [{
          discord_id: recipientId,
          username: 'Recipient',
          amount,
          memo: 'supply',
        }],
      },
    }
  }

  async function insertConfirmation(input: {
    token: string
    idempotencyKey: string
    interactionId: string
    request: Record<string, unknown>
    createdAt?: string
    expiresAt?: string
    cancelledAt?: string | null
  }) {
    const now = Date.now()
    const { error } = await getTestServiceClient()
      .from('application_command_confirmations')
      .insert({
        token: input.token,
        guild_id: tenant.guildId,
        discord_guild_id: discordGuildId,
        source_interaction_id: input.interactionId,
        command_name: 'point.transfer',
        idempotency_key: input.idempotencyKey,
        correlation_id: input.interactionId,
        actor_discord_id: senderId,
        request_payload: input.request,
        created_at: input.createdAt ?? new Date(now).toISOString(),
        expires_at: input.expiresAt ?? new Date(now + 5 * 60 * 1000).toISOString(),
        cancelled_at: input.cancelledAt ?? null,
      })
    expect(error).toBeNull()
  }

  async function executeTransfer(input: {
    idempotencyKey: string
    interactionId: string
    token: string | null
    amount?: number
  }) {
    const payload = transferPayload(input.amount)
    return getTestServiceClient().rpc('execute_application_command', {
      p_guild_id: tenant.guildId,
      p_command_name: 'point.transfer',
      p_idempotency_key: input.idempotencyKey,
      p_correlation_id: input.interactionId,
      p_actor_discord_id: senderId,
      p_actor_username: 'Sender',
      p_source: input.token ? 'discord' : 'web',
      p_request_payload: payload.request,
      p_execution_payload: payload.execution,
      p_confirmation_token: input.token,
    })
  }

  it('executes one ledger mutation for concurrent confirmation retries', async () => {
    const token = crypto.randomUUID()
    const idempotencyKey = crypto.randomUUID()
    const interactionId = '444444444444444444'
    const payload = transferPayload()
    await insertConfirmation({
      token,
      idempotencyKey,
      interactionId,
      request: payload.request,
    })

    const [first, second] = await Promise.all([
      executeTransfer({ token, idempotencyKey, interactionId }),
      executeTransfer({ token, idempotencyKey, interactionId }),
    ])
    expect(first.error).toBeNull()
    expect(second.error).toBeNull()
    const results = [first.data, second.data] as Array<Record<string, unknown>>
    expect(results.map((row) => row.replayed).sort()).toEqual([false, true])
    expect(results[0].refId).toBe(results[1].refId)

    const { data: ledger, error: ledgerError } = await getTestServiceClient()
      .from('point_ledger')
      .select('discord_id, delta, reason, ref_id')
      .eq('guild_id', tenant.guildId)
      .eq('ref_id', results[0].refId as string)
      .order('delta')
    expect(ledgerError).toBeNull()
    expect(ledger).toEqual([
      {
        discord_id: senderId,
        delta: -120,
        reason: 'transfer_out',
        ref_id: results[0].refId,
      },
      {
        discord_id: recipientId,
        delta: 120,
        reason: 'transfer_in',
        ref_id: results[0].refId,
      },
    ])

    const { data: confirmation } = await getTestServiceClient()
      .from('application_command_confirmations')
      .select('confirmed_at, cancelled_at')
      .eq('token', token)
      .single()
    expect(confirmation?.confirmed_at).toBeTruthy()
    expect(confirmation?.cancelled_at).toBeNull()
  })

  it('rejects expired, cancelled, and payload-swapped confirmations', async () => {
    const now = Date.now()
    const expired = {
      token: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
      interactionId: '555555555555555555',
    }
    await insertConfirmation({
      ...expired,
      request: transferPayload().request,
      createdAt: new Date(now - 10 * 60 * 1000).toISOString(),
      expiresAt: new Date(now - 5 * 60 * 1000).toISOString(),
    })
    const expiredResult = await executeTransfer(expired)
    expect(expiredResult.error?.message).toContain(
      'application_command_confirmation_expired',
    )

    const cancelled = {
      token: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
      interactionId: '666666666666666666',
    }
    await insertConfirmation({
      ...cancelled,
      request: transferPayload().request,
      cancelledAt: new Date().toISOString(),
    })
    const cancelledResult = await executeTransfer(cancelled)
    expect(cancelledResult.error?.message).toContain(
      'application_command_confirmation_cancelled',
    )

    const swapped = {
      token: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
      interactionId: '777777777777777777',
    }
    await insertConfirmation({
      ...swapped,
      request: transferPayload().request,
    })
    const swappedResult = await executeTransfer({ ...swapped, amount: 121 })
    expect(swappedResult.error?.message).toContain(
      'application_command_confirmation_invalid',
    )

    const { count } = await getTestServiceClient()
      .from('point_ledger')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', tenant.guildId)
      .in('reason', ['transfer_in', 'transfer_out'])
    expect(count).toBe(0)
  })
})
