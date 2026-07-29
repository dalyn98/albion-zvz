import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  unstableCache: vi.fn(),
}))

vi.mock('next/cache', () => ({
  unstable_cache: mocks.unstableCache,
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
}))

vi.mock('@/lib/log', () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

import {
  eventRenderSnapshotCacheKey,
  isEventRenderSnapshotCacheDisabled,
  loadEventRenderRevision,
  loadEventRenderSnapshot,
} from './event-render-snapshot'

beforeEach(() => {
  mocks.from.mockReset()
  mocks.rpc.mockReset()
  mocks.unstableCache.mockReset()
  mocks.unstableCache.mockImplementation((fn: () => Promise<unknown>) => fn)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('event render snapshot cache identity', () => {
  it('partitions cached snapshots by tenant, event, and monotonic revision', () => {
    expect(eventRenderSnapshotCacheKey({
      guildId: 'guild-a',
      eventId: 'event-a',
      stateRevision: '41',
    })).toEqual(['event-render-snapshot', 'guild-a', 'event-a', '41'])

    expect(eventRenderSnapshotCacheKey({
      guildId: 'guild-b',
      eventId: 'event-a',
      stateRevision: '41',
    })).not.toEqual(eventRenderSnapshotCacheKey({
      guildId: 'guild-a',
      eventId: 'event-a',
      stateRevision: '41',
    }))

    expect(eventRenderSnapshotCacheKey({
      guildId: 'guild-a',
      eventId: 'event-a',
      stateRevision: '42',
    })).not.toEqual(eventRenderSnapshotCacheKey({
      guildId: 'guild-a',
      eventId: 'event-a',
      stateRevision: '41',
    }))
  })

  it('only enables the emergency bypass for an explicit true value', () => {
    expect(isEventRenderSnapshotCacheDisabled(undefined)).toBe(false)
    expect(isEventRenderSnapshotCacheDisabled('false')).toBe(false)
    expect(isEventRenderSnapshotCacheDisabled('1')).toBe(false)
    expect(isEventRenderSnapshotCacheDisabled('true')).toBe(true)
  })

  it('reads the O(1) tenant-scoped revision snapshot', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        fingerprint: '42',
        battle_started_at: null,
        gather_at: '2026-07-21T10:00:00.000Z',
      },
      error: null,
    })

    await expect(loadEventRenderRevision({
      guildId: 'guild-a',
      eventId: 'event-a',
    })).resolves.toEqual({
      fingerprint: '42',
      battle_started_at: null,
      gather_at: '2026-07-21T10:00:00.000Z',
    })
    expect(mocks.rpc).toHaveBeenCalledWith('get_event_state_snapshot', {
      p_guild_id: 'guild-a',
      p_event_id: 'event-a',
    })
  })

  it('caches and normalizes the viewer-neutral event tree', async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
    }
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    query.maybeSingle.mockResolvedValue({
      data: {
        id: 'event-a',
        title: 'Event',
        status: 'published',
        state_revision: 42,
        parties: [
          {
            id: 'party-2',
            party_number: 2,
            slots: [
              { id: 'slot-2', slot_number: 2, is_hidden: false },
              { id: 'slot-hidden', slot_number: 1, is_hidden: true },
              { id: 'slot-1', slot_number: 1, is_hidden: false },
            ],
          },
          { id: 'party-1', party_number: 1, slots: [] },
        ],
      },
      error: null,
    })
    mocks.from.mockReturnValue(query)

    const result = await loadEventRenderSnapshot({
      guildId: 'guild-a',
      eventId: 'event-a',
      stateRevision: '42',
    })

    expect(mocks.unstableCache).toHaveBeenCalledWith(
      expect.any(Function),
      ['event-render-snapshot', 'guild-a', 'event-a', '42'],
      { revalidate: 300 },
    )
    expect(query.eq).toHaveBeenCalledWith('guild_id', 'guild-a')
    expect(query.eq).toHaveBeenCalledWith('id', 'event-a')
    expect(query.select).toHaveBeenCalledWith(
      expect.stringContaining('regear_policy_version_id'),
    )
    expect(query.select).toHaveBeenCalledWith(
      expect.stringContaining('regear_policy_snapshotted_at'),
    )
    expect(query.select).toHaveBeenCalledWith(
      expect.stringContaining('tentative_snapshot_version_id'),
    )
    expect(query.select).toHaveBeenCalledWith(
      expect.stringContaining('tentative_snapshotted_at'),
    )
    expect(result?.parties.map((party) => party.party_number)).toEqual([1, 2])
    expect(result?.parties[1]?.slots.map((slot) => slot.id)).toEqual(['slot-1', 'slot-2'])
  })
})
