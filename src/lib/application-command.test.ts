import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  receipt: null as Record<string, unknown> | null,
  receiptError: null as { message: string } | null,
  rpc: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: () => ({
    from: mocks.from,
    rpc: mocks.rpc,
  }),
}))

import {
  executeApplicationCommand,
  loadApplicationCommandReceipt,
  type ApplicationCommandContext,
} from './application-command'

const guildId = '11111111-1111-4111-8111-111111111111'
const idempotencyKey = '22222222-2222-4222-8222-222222222222'
const confirmationToken = '33333333-3333-4333-8333-333333333333'

function context(
  overrides: Partial<ApplicationCommandContext> = {},
): ApplicationCommandContext {
  return {
    guildId,
    actorDiscordId: '123456789012345678',
    actorUsername: 'Member',
    source: 'web',
    correlationId: idempotencyKey,
    idempotencyKey,
    ...overrides,
  }
}

describe('application command boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.receipt = null
    mocks.receiptError = null
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data: mocks.receipt,
        error: mocks.receiptError,
      })),
    }
    mocks.from.mockReturnValue(query)
    mocks.rpc.mockResolvedValue({
      data: { refId: 'result-1', replayed: false },
      error: null,
    })
  })

  it('passes a null confirmation token for web commands', async () => {
    await expect(executeApplicationCommand({
      commandName: 'point.transfer',
      context: context(),
      requestPayload: { transfers: [] },
    })).resolves.toMatchObject({ refId: 'result-1' })

    expect(mocks.rpc).toHaveBeenCalledWith(
      'execute_application_command',
      expect.objectContaining({
        p_source: 'web',
        p_confirmation_token: null,
      }),
    )
  })

  it('requires a valid confirmation token for every Discord execution', async () => {
    await expect(executeApplicationCommand({
      commandName: 'point.transfer',
      context: context({ source: 'discord' }),
      requestPayload: { transfers: [] },
    })).rejects.toMatchObject({
      code: 'application_command_invalid',
    })
    expect(mocks.rpc).not.toHaveBeenCalled()

    await executeApplicationCommand({
      commandName: 'point.transfer',
      context: context({
        source: 'discord',
        confirmationToken,
      }),
      requestPayload: { transfers: [] },
    })
    expect(mocks.rpc).toHaveBeenCalledWith(
      'execute_application_command',
      expect.objectContaining({
        p_source: 'discord',
        p_confirmation_token: confirmationToken,
      }),
    )
  })

  it('replays only an identical actor, source, command, and request', async () => {
    mocks.receipt = {
      command_name: 'point.transfer',
      actor_discord_id: '123456789012345678',
      source: 'web',
      request_payload: { transfers: [{ amount: 10, discord_id: 'recipient' }] },
      result: { refId: 'existing' },
    }
    await expect(loadApplicationCommandReceipt(
      'point.transfer',
      context(),
      { transfers: [{ discord_id: 'recipient', amount: 10 }] },
    )).resolves.toEqual({ refId: 'existing', replayed: true })

    await expect(loadApplicationCommandReceipt(
      'point.transfer',
      context({ source: 'discord', confirmationToken }),
      { transfers: [{ discord_id: 'recipient', amount: 10 }] },
    )).rejects.toMatchObject({
      code: 'application_command_idempotency_conflict',
    })
  })
})
