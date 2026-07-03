import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getTranslations: vi.fn(),
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  getAdminClient: vi.fn(),
}))

vi.mock('next-intl/server', () => ({
  getTranslations: mocks.getTranslations,
}))

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: mocks.getSessionGuildId,
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: mocks.getAdminClient,
}))

vi.mock('@/lib/member-sync', () => ({
  runMemberSync: vi.fn(),
}))

vi.mock('@/lib/admin-audit', () => ({
  logAdminAction: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  requireCapability: vi.fn(),
}))

import { listMembersDirectory } from './members-admin'

interface QueryState {
  table: string
  filters: Array<{ method: string; column: string; value: unknown }>
}

function createQueryDb() {
  const tableCalls: string[] = []
  const db = {
    from: vi.fn((table: string) => {
      tableCalls.push(table)
      const state: QueryState = { table, filters: [] }
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((column: string, value: unknown) => {
          state.filters.push({ method: 'eq', column, value })
          return query
        }),
        is: vi.fn((column: string, value: unknown) => {
          state.filters.push({ method: 'is', column, value })
          return query
        }),
        not: vi.fn((column: string, value: unknown) => {
          state.filters.push({ method: 'not', column, value })
          return query
        }),
        order: vi.fn(() => query),
        then: (resolve: (value: { data: unknown[]; error: null }) => void) => {
          resolve({ data: resolveRows(state), error: null })
        },
      }
      return query
    }),
  }
  return { db, tableCalls }
}

function resolveRows(state: QueryState): unknown[] {
  if (state.table === 'slots') {
    return [
      {
        assigned_discord_id: 'member-1',
        role_name: 'EngageDps',
        weapon_id: 'T8_2H_BOW',
        assigned_weapon_id: null,
        parties: { event_id: 'event-1' },
      },
      {
        assigned_discord_id: 'guest-1',
        role_name: 'Healer',
        weapon_id: 'T8_MAIN_HOLYSTAFF',
        assigned_weapon_id: null,
        parties: { event_id: 'event-2' },
      },
    ]
  }
  if (state.table === 'guests') {
    return [
      {
        discord_id: 'guest-1',
        username: 'Guest One',
        avatar: null,
        joined_at: '2026-06-09T00:00:00.000Z',
        preferred_language: 'ko',
      },
    ]
  }
  if (state.table === 'albion_guild_members') {
    return []
  }
  if (state.table === 'guild_avatars') {
    const withdrawnFilter = state.filters.find((filter) => filter.column === 'withdrawn_at')
    if (withdrawnFilter?.method === 'is') {
      return [
        {
          discord_id: 'member-1',
          username: 'Member One',
          avatar: null,
          is_admin: false,
          updated_at: '2026-06-09T00:00:00.000Z',
          preferred_language: 'ko',
        },
      ]
    }
    if (withdrawnFilter?.method === 'not') {
      return [
        {
          discord_id: 'member-2',
          username: 'Former Member',
          avatar: null,
          updated_at: '2026-06-08T00:00:00.000Z',
          withdrawn_at: '2026-06-09T00:00:00.000Z',
          preferred_language: 'en',
        },
      ]
    }
    return []
  }
  return []
}

describe('listMembersDirectory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getTranslations.mockResolvedValue((key: string) => key)
    mocks.getSession.mockResolvedValue({ discordId: 'member-1', username: 'Member One' })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
  })

  it('shares one slots scan across members, withdrawn members, and guests', async () => {
    const { db, tableCalls } = createQueryDb()
    mocks.getAdminClient.mockReturnValue(db)

    const result = await listMembersDirectory()

    expect(result.members).toHaveLength(1)
    expect(result.guests).toHaveLength(1)
    expect(result.withdrawnMembers).toHaveLength(1)
    expect(tableCalls.filter((table) => table === 'slots')).toHaveLength(1)
    expect(result.members[0].participation_count).toBe(1)
    expect(result.guests[0].participation_count).toBe(1)
  })
})
