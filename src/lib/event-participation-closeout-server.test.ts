import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAdminClient: vi.fn(),
  sendLocalizedDm: vi.fn(),
  logError: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: mocks.getAdminClient,
}))

vi.mock('@/lib/discord-dm-localized', () => ({
  sendLocalizedDiscordDmToUser: mocks.sendLocalizedDm,
}))

vi.mock('@/lib/log', () => ({
  log: {
    error: mocks.logError,
  },
}))

import {
  processEventParticipationAutoCloseout,
  processEventParticipationNotificationOutbox,
  resolveEventParticipationAutoCloseoutState,
} from './event-participation-closeout-server'

describe('resolveEventParticipationAutoCloseoutState', () => {
  it('derives the snapshotted deadline and preserves pause state', () => {
    expect(
      resolveEventParticipationAutoCloseoutState({
        enabled: true,
        reviewStartedAt: '2026-08-02T14:00:00.000Z',
        pausedAt: '2026-08-02T15:00:00.000Z',
        delayHours: 12,
      }),
    ).toEqual({
      enabled: true,
      paused: true,
      reviewStartedAt: '2026-08-02T14:00:00.000Z',
      dueAt: '2026-08-03T02:00:00.000Z',
    })
  })
})

describe('processEventParticipationAutoCloseout', () => {
  it('summarizes atomic database outcomes and logs individual failures', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          guild_id: 'guild-1',
          event_id: 'event-1',
          closeout_id: 'closeout-1',
          outcome: 'finalized',
          error_message: null,
        },
        {
          guild_id: 'guild-2',
          event_id: 'event-2',
          closeout_id: null,
          outcome: 'failed',
          error_message: 'roster changed',
        },
      ],
      error: null,
    })
    mocks.getAdminClient.mockReturnValue({ rpc })

    await expect(
      processEventParticipationAutoCloseout({ limit: 10 }),
    ).resolves.toEqual({ scanned: 2, finalized: 1, failed: 1 })
    expect(rpc).toHaveBeenCalledWith(
      'finalize_due_event_participation_closeouts',
      { p_limit: 10 },
    )
    expect(mocks.logError).toHaveBeenCalledWith(
      '[event-participation-closeout] automatic closeout failed',
      expect.any(Error),
      { guild_id: 'guild-2', event_id: 'event-2' },
    )
  })
})

interface SavedUpdate {
  payload: Record<string, unknown>
  filters: Array<[string, unknown]>
}

function createDb(rows: unknown[], updates: SavedUpdate[]) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: rows, error: null }),
    from: vi.fn(() => {
      let payload: Record<string, unknown> = {}
      const filters: Array<[string, unknown]> = []
      const query = {
        update(next: Record<string, unknown>) {
          payload = next
          return query
        },
        eq(column: string, value: unknown) {
          filters.push([column, value])
          return query
        },
        then(
          resolve: (value: { error: null }) => unknown,
          reject?: (reason: unknown) => unknown,
        ) {
          updates.push({ payload, filters })
          return Promise.resolve({ error: null }).then(resolve, reject)
        },
      }
      return query
    }),
  }
}

function claimedRow(id: string, discordId: string, rewardPerMember: number) {
  return {
    id,
    guild_id: 'guild-1',
    event_id: 'event-1',
    closeout_id: 'closeout-1',
    entry_id: `entry-${id}`,
    discord_id: discordId,
    payload: {
      eventTitle: 'CTA',
      rewardPerMember,
    },
    attempts: 1,
  }
}

describe('processEventParticipationNotificationOutbox', () => {
  beforeEach(() => {
    mocks.getAdminClient.mockReset()
    mocks.sendLocalizedDm.mockReset()
    mocks.logError.mockReset()
  })

  it('persists sent, skipped, and retryable failed delivery outcomes', async () => {
    const updates: SavedUpdate[] = []
    const db = createDb(
      [
        claimedRow('sent', '100000000000000001', 100),
        claimedRow('skipped', '100000000000000002', 0),
        claimedRow('failed', '100000000000000003', 100),
      ],
      updates,
    )
    mocks.getAdminClient.mockReturnValue(db)
    const payloadKeys: string[] = []
    mocks.sendLocalizedDm.mockImplementation(
      async (
        discordId: string,
        _guildId: string,
        buildPayload: (
          t: (key: string) => string,
          locale: string,
        ) => Promise<{ body: string }> | { body: string },
      ) => {
        const payload = await buildPayload((key) => key, 'ko')
        payloadKeys.push(payload.body)
        if (discordId === '100000000000000001') {
          return { attempted: 1, succeeded: 1 }
        }
        if (discordId === '100000000000000002') {
          return { attempted: 0, succeeded: 0 }
        }
        return { attempted: 1, succeeded: 0 }
      },
    )

    await expect(
      processEventParticipationNotificationOutbox({
        limit: 3,
        closeoutId: 'closeout-1',
      }),
    ).resolves.toEqual({
      claimed: 3,
      sent: 1,
      skipped: 1,
      failed: 1,
    })

    expect(db.rpc).toHaveBeenCalledWith(
      'claim_event_participation_notification_outbox',
      {
        p_limit: 3,
        p_closeout_id: 'closeout-1',
        p_lease_seconds: 300,
      },
    )
    expect(updates.map((row) => row.payload.status)).toEqual([
      'sent',
      'skipped',
      'failed',
    ])
    expect(payloadKeys).toEqual([
      'eventParticipationFinalizedBody',
      'eventParticipationFinalizedNoRewardBody',
      'eventParticipationFinalizedBody',
    ])
  })

  it('releases a thrown delivery with a bounded failure reason', async () => {
    const updates: SavedUpdate[] = []
    mocks.getAdminClient.mockReturnValue(
      createDb(
        [claimedRow('throws', '100000000000000004', 100)],
        updates,
      ),
    )
    mocks.sendLocalizedDm.mockRejectedValue(new Error('discord unavailable'))

    await expect(
      processEventParticipationNotificationOutbox(),
    ).resolves.toEqual({
      claimed: 1,
      sent: 0,
      skipped: 0,
      failed: 1,
    })
    expect(updates).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({
          status: 'failed',
          locked_at: null,
          last_error: 'discord unavailable',
        }),
      }),
    ])
  })

  it('skips anonymous event guests without attempting a Discord delivery', async () => {
    const updates: SavedUpdate[] = []
    mocks.getAdminClient.mockReturnValue(
      createDb(
        [
          claimedRow(
            'anonymous',
            'guest_00000000-0000-4000-8000-000000000001',
            100,
          ),
        ],
        updates,
      ),
    )

    await expect(
      processEventParticipationNotificationOutbox(),
    ).resolves.toEqual({
      claimed: 1,
      sent: 0,
      skipped: 1,
      failed: 0,
    })
    expect(mocks.sendLocalizedDm).not.toHaveBeenCalled()
    expect(updates).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({
          status: 'skipped',
          last_error: null,
        }),
      }),
    ])
  })
})
