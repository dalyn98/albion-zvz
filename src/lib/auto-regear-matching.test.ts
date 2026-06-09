import { describe, expect, it, vi } from 'vitest'
import { findTrackedBattleIdsForEvents } from './auto-regear-matching'

function createTenantBattleDb(rows: unknown[]) {
  const calls: Array<{ method: string; column: string; value: unknown }> = []
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      calls.push({ method: 'eq', column, value })
      return query
    }),
    gte: vi.fn((column: string, value: unknown) => {
      calls.push({ method: 'gte', column, value })
      return query
    }),
    lte: vi.fn((column: string, value: unknown) => {
      calls.push({ method: 'lte', column, value })
      return query
    }),
    then: (resolve: (value: { data: unknown[]; error: null }) => void) => {
      resolve({ data: rows, error: null })
    },
  }
  const db = {
    from: vi.fn((table: string) => {
      expect(table).toBe('tenant_battle_records')
      return query
    }),
  }
  return { db, query, calls }
}

describe('findTrackedBattleIdsForEvents', () => {
  it('loads one broad tenant battle range and maps matches back per event window', async () => {
    const { db, query, calls } = createTenantBattleDb([
      {
        started_at: '2026-06-09T00:30:00.000Z',
        home_team_size: 20,
        battle_records: {
          albion_battle_id: '1001',
          cluster_name: 'Deepwood Copse',
          ended_at: '2026-06-09T00:50:00.000Z',
        },
      },
      {
        started_at: '2026-06-09T02:30:00.000Z',
        home_team_size: 25,
        battle_records: {
          albion_battle_id: 1002,
          cluster_name: 'Sunfang Ravine',
          ended_at: '2026-06-09T02:55:00.000Z',
        },
      },
    ])

    const result = await findTrackedBattleIdsForEvents(db as never, 'guild-1', [
      { eventId: 'event-a', battleStartedAtIso: '2026-06-09T00:00:00.000Z' },
      { eventId: 'event-b', battleStartedAtIso: '2026-06-09T02:00:00.000Z' },
    ])

    expect(db.from).toHaveBeenCalledTimes(1)
    expect(query.select).toHaveBeenCalledTimes(1)
    expect(calls).toEqual([
      { method: 'eq', column: 'guild_id', value: 'guild-1' },
      { method: 'gte', column: 'started_at', value: '2026-06-08T23:45:00.000Z' },
      { method: 'lte', column: 'started_at', value: '2026-06-09T06:00:00.000Z' },
    ])
    expect(result.get('event-a')?.map((battle) => battle.albionBattleId)).toEqual([1001, 1002])
    expect(result.get('event-b')?.map((battle) => battle.albionBattleId)).toEqual([1002])
  })
})
