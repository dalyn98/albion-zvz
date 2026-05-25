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

describe('event tentative signup reads', () => {
  beforeEach(() => {
    mocks.getAdminClient.mockReset()
  })

  it('sanitizes role arrays while preserving first valid order', () => {
    expect(sanitizeTentativeRoles(['Dps', 'invalid', 'Healer', 'Dps', 1])).toEqual([
      'Dps',
      'Healer',
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
          created_at: '2026-05-25T00:00:00.000Z',
          updated_at: '2026-05-25T00:00:00.000Z',
        },
      ],
    })
    expect(calls).toContainEqual({ method: 'eq', args: ['guild_id', 'guild-1'] })
    expect(calls).toContainEqual({ method: 'eq', args: ['event_id', 'event-1'] })
    expect(calls).toContainEqual({ method: 'order', args: ['created_at', { ascending: true }] })
  })
})
