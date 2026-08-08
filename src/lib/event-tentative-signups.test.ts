import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAdminClient: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: mocks.getAdminClient,
}))

import {
  listTentativeSignupsForGuild,
  sanitizeTentativeRoles,
} from './event-tentative-signups'

interface QueryCall {
  method: string
  args: unknown[]
}

function createSignupsQuery(data: unknown[]) {
  const calls: QueryCall[] = []
  const query = {
    select: (...args: unknown[]) => {
      calls.push({ method: 'select', args })
      return query
    },
    eq: (...args: unknown[]) => {
      calls.push({ method: 'eq', args })
      return query
    },
    order: (...args: unknown[]) => {
      calls.push({ method: 'order', args })
      return Promise.resolve({ data, error: null })
    },
  }
  return { query, calls }
}

function createEventQuery(snapshotVersionId: string | null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: {
        tentative_snapshot_version_id: snapshotVersionId,
        tentative_snapshotted_at: snapshotVersionId
          ? '2026-05-26T00:00:00.000Z'
          : null,
      },
      error: null,
    }),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  return query
}

describe('event tentative signup reads', () => {
  beforeEach(() => {
    mocks.getAdminClient.mockReset()
  })

  it('sanitizes DPS role arrays while preserving first current valid order', () => {
    expect(sanitizeTentativeRoles(['EngageDps', 'invalid', 'BrawlerDps', 'EngageDps', 1])).toEqual([
      'EngageDps',
      'BrawlerDps',
    ])
  })

  it('lists rows by explicit guild scope instead of session-derived scope', async () => {
    const { query, calls } = createSignupsQuery([
      {
        id: 'row-1',
        event_id: 'event-1',
        discord_id: 'member-1',
        username: 'Member',
        possible_roles: ['Sup', 'bad'],
        notes: null,
        created_at: '2026-05-25T00:00:00.000Z',
        updated_at: '2026-05-25T00:00:00.000Z',
      },
    ])
    const from = vi.fn((table: string) => {
      if (table === 'events') return createEventQuery(null)
      expect(table).toBe('event_tentative_signups')
      return query
    })
    mocks.getAdminClient.mockReturnValue({ from })

    await expect(listTentativeSignupsForGuild('event-1', 'guild-1')).resolves.toEqual({
      rows: [
        {
          id: 'row-1',
          event_id: 'event-1',
          discord_id: 'member-1',
          username: 'Member',
          possible_roles: ['Sup'],
          notes: null,
          recommended_slot_id: null,
          recommended_by_discord_id: null,
          recommended_at: null,
          created_at: '2026-05-25T00:00:00.000Z',
          updated_at: '2026-05-25T00:00:00.000Z',
        },
      ],
    })
    expect(calls).toContainEqual({ method: 'eq', args: ['guild_id', 'guild-1'] })
    expect(calls).toContainEqual({ method: 'eq', args: ['event_id', 'event-1'] })
    expect(calls).toContainEqual({ method: 'order', args: ['created_at', { ascending: true }] })
  })

  it('reads the immutable start snapshot after the event has been frozen', async () => {
    const { query, calls } = createSignupsQuery([
      {
        id: 'snapshot-1',
        event_id: 'event-1',
        discord_id: 'member-1',
        username: 'Member',
        possible_roles: ['Healer'],
        notes: 'available',
        source_created_at: '2026-05-25T00:00:00.000Z',
        source_updated_at: '2026-05-25T01:00:00.000Z',
      },
    ])
    const from = vi.fn((table: string) => {
      if (table === 'events') return createEventQuery('version-1')
      expect(table).toBe('event_tentative_signup_snapshots')
      return query
    })
    mocks.getAdminClient.mockReturnValue({ from })

    await expect(
      listTentativeSignupsForGuild('event-1', 'guild-1'),
    ).resolves.toEqual({
      rows: [
        {
          id: 'snapshot-1',
          event_id: 'event-1',
          discord_id: 'member-1',
          username: 'Member',
          possible_roles: ['Healer'],
          notes: 'available',
          recommended_slot_id: null,
          recommended_by_discord_id: null,
          recommended_at: null,
          created_at: '2026-05-25T00:00:00.000Z',
          updated_at: '2026-05-25T01:00:00.000Z',
        },
      ],
    })
    expect(calls).toContainEqual({
      method: 'order',
      args: ['source_created_at', { ascending: true }],
    })
  })
})
