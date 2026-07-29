import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  revalidatePath: vi.fn(),
  requireAnyCapability: vi.fn(),
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  processOutbox: vi.fn(),
  publicActionError: vi.fn(),
}))

vi.mock('next/server', () => ({
  after: mocks.after,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

vi.mock('@/lib/auth', () => ({
  requireAnyCapability: mocks.requireAnyCapability,
}))

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: mocks.getSessionGuildId,
}))

vi.mock('@/lib/event-participation-closeout-server', () => ({
  processEventParticipationNotificationOutbox: mocks.processOutbox,
}))

vi.mock('@/lib/public-action-error', () => ({
  publicActionError: mocks.publicActionError,
}))

import { finalizeEventParticipationCloseout } from './event-participation-closeout'

const EVENT_ID = '123e4567-e89b-42d3-a456-426614174000'
const IDEMPOTENCY_KEY = '123e4567-e89b-42d3-a456-426614174001'
const CLOSEOUT_ID = '123e4567-e89b-42d3-a456-426614174002'

function validEntry(discordId = 'member-1') {
  return {
    discordId,
    username: 'Member',
    source: 'slot' as const,
    included: true,
    roleNames: ['Healer'],
    evidenceStatus: 'activity_confirmed' as const,
    activityBattleCount: 1,
    note: null,
  }
}

describe('finalizeEventParticipationCloseout', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.publicActionError.mockResolvedValue('publicError')
    mocks.processOutbox.mockResolvedValue({
      claimed: 1,
      sent: 1,
      skipped: 0,
      failed: 0,
    })
  })

  it('rejects rewards above the database invariant before authorization', async () => {
    await expect(
      finalizeEventParticipationCloseout({
        eventId: EVENT_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        rewardPerMember: 2_000_000_001,
        entries: [],
      }),
    ).resolves.toEqual({ error: 'invalidInput' })

    expect(mocks.requireAnyCapability).not.toHaveBeenCalled()
  })

  it('rejects duplicate roster identities before calling the atomic RPC', async () => {
    await expect(
      finalizeEventParticipationCloseout({
        eventId: EVENT_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        rewardPerMember: 100,
        entries: [validEntry(), validEntry()],
      }),
    ).resolves.toEqual({ error: 'invalidRoster' })

    expect(mocks.requireAnyCapability).not.toHaveBeenCalled()
  })

  it('calls one RPC and schedules only the durable notification drain', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        closeoutId: CLOSEOUT_ID,
        eventId: EVENT_ID,
        participantCount: 1,
        totalReward: 100,
        finalizedAt: '2026-07-29T00:00:00.000Z',
        replayed: false,
      },
      error: null,
    })
    mocks.requireAnyCapability.mockResolvedValue({ rpc })
    mocks.getSession.mockResolvedValue({
      discordId: 'admin-1',
      username: 'Admin',
    })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')

    await expect(
      finalizeEventParticipationCloseout({
        eventId: EVENT_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        rewardPerMember: 100,
        memo: ' confirmed ',
        entries: [validEntry()],
      }),
    ).resolves.toEqual({
      closeout: {
        id: CLOSEOUT_ID,
        eventId: EVENT_ID,
        participantCount: 1,
        totalReward: 100,
        finalizedAt: '2026-07-29T00:00:00.000Z',
        replayed: false,
      },
    })

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith(
      'finalize_event_participation_closeout',
      expect.objectContaining({
        p_guild_id: 'guild-1',
        p_event_id: EVENT_ID,
        p_idempotency_key: IDEMPOTENCY_KEY,
        p_reward_per_member: 100,
        p_memo: 'confirmed',
        p_finalized_by: 'admin-1',
        p_finalized_by_username: 'Admin',
      }),
    )
    expect(mocks.after).toHaveBeenCalledTimes(1)

    const drain = mocks.after.mock.calls[0]?.[0] as
      (() => Promise<void>) | undefined
    expect(drain).toBeTypeOf('function')
    await drain?.()
    expect(mocks.processOutbox).toHaveBeenCalledWith({
      limit: 100,
      closeoutId: CLOSEOUT_ID,
    })
  })

  it('maps an exact-roster race to an actionable localized error', async () => {
    mocks.requireAnyCapability.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          message: 'event_participation_closeout_slot_roster_changed',
        },
      }),
    })
    mocks.getSession.mockResolvedValue({
      discordId: 'admin-1',
      username: 'Admin',
    })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')

    await expect(
      finalizeEventParticipationCloseout({
        eventId: EVENT_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        rewardPerMember: 0,
        entries: [validEntry()],
      }),
    ).resolves.toEqual({ error: 'rosterChanged' })
    expect(mocks.after).not.toHaveBeenCalled()
  })
})
