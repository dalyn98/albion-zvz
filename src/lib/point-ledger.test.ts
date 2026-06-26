import { describe, expect, it } from 'vitest'
import {
  getMemberPointSummary,
  getPointBalancesByMember,
  listMemberPointLedgerEntries,
  listGuildPointBalanceSummaries,
  listGuildPointDeltas,
} from './point-ledger'

interface PointRow {
  id: string
  guild_id: string
  discord_id: string
  delta: number
  reason?: string
  created_at?: string
}

interface BalanceRow {
  guild_id: string
  discord_id: string
  balance: number
  lifetime_earned: number
  lifetime_spent: number
  entries_count: number
}

type TestRow = PointRow | BalanceRow

function readColumn(row: TestRow, column: string): unknown {
  return (row as unknown as Record<string, unknown>)[column]
}

function compareColumnValue(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a == null) return -1
  if (b == null) return 1
  return String(a).localeCompare(String(b))
}

function makePointLedgerDb(rows: PointRow[]) {
  const balanceRows = Array.from(
    rows.reduce((acc, row) => {
      const key = `${row.guild_id}:${row.discord_id}`
      const cur = acc.get(key) ?? {
        guild_id: row.guild_id,
        discord_id: row.discord_id,
        balance: 0,
        lifetime_earned: 0,
        lifetime_spent: 0,
        entries_count: 0,
      }
      cur.balance += row.delta
      if (row.delta > 0) cur.lifetime_earned += row.delta
      if (row.delta < 0) cur.lifetime_spent += -row.delta
      cur.entries_count += 1
      acc.set(key, cur)
      return acc
    }, new Map<string, BalanceRow>()).values(),
  )

  return {
    from(table: string) {
      expect(['point_ledger', 'member_point_balances']).toContain(table)
      const tableRows: TestRow[] = table === 'point_ledger' ? rows : balanceRows
      const state: {
        eq: Array<[string, unknown]>
        in: Array<[string, unknown[]]>
        gte: Array<[string, string]>
        order: Array<[string, boolean]>
      } = { eq: [], in: [], gte: [], order: [] }
      const query = {
        select() {
          return query
        },
        eq(column: string, value: unknown) {
          state.eq.push([column, value])
          return query
        },
        in(column: string, values: unknown[]) {
          state.in.push([column, values])
          return query
        },
        gte(column: string, value: string) {
          state.gte.push([column, value])
          return query
        },
        async maybeSingle() {
          const { data, error } = await query.range(0, 0)
          return { data: data?.[0] ?? null, error }
        },
        order(column: string, options?: { ascending?: boolean }) {
          state.order.push([column, options?.ascending ?? true])
          return query
        },
        async range(from: number, to: number) {
          let filtered = tableRows
          for (const [column, value] of state.eq) {
            filtered = filtered.filter((row) => readColumn(row, column) === value)
          }
          for (const [column, values] of state.in) {
            filtered = filtered.filter((row) => values.includes(readColumn(row, column)))
          }
          for (const [column, value] of state.gte) {
            filtered = filtered.filter((row) => String(readColumn(row, column) ?? '') >= value)
          }
          filtered = [...filtered].sort((a, b) => {
            for (const [column, ascending] of state.order) {
              const result = compareColumnValue(readColumn(a, column), readColumn(b, column))
              if (result !== 0) return ascending ? result : -result
            }
            return 0
          })
          return { data: filtered.slice(from, to + 1), error: null }
        },
      }
      return query
    },
  } as never
}

describe('point-ledger helpers', () => {
  it('reads member point summaries from the balance projection', async () => {
    const rows = Array.from({ length: 1005 }, (_, i) => ({
      id: String(i),
      guild_id: 'guild-a',
      discord_id: 'member-a',
      delta: i % 2 === 0 ? 10 : -3,
    }))
    const { summary, error } = await getMemberPointSummary(
      makePointLedgerDb(rows),
      'guild-a',
      'member-a',
    )

    expect(error).toBeUndefined()
    expect(summary.balance).toBe(3524)
    expect(summary.lifetimeEarned).toBe(5030)
    expect(summary.lifetimeSpent).toBe(1506)
  })

  it('uses projected balances while keeping ledger scans available for backups', async () => {
    const rows = [
      ...Array.from({ length: 1002 }, (_, i) => ({
        id: `a-${i}`,
        guild_id: 'guild-a',
        discord_id: 'member-a',
        delta: 1,
      })),
      { id: 'b-1', guild_id: 'guild-a', discord_id: 'member-b', delta: 50 },
      { id: 'c-1', guild_id: 'guild-b', discord_id: 'member-a', delta: 999 },
    ]
    const db = makePointLedgerDb(rows)

    const guildRows = await listGuildPointDeltas(db, 'guild-a')
    const guildBalances = await listGuildPointBalanceSummaries(db, 'guild-a')
    const balances = await getPointBalancesByMember(db, 'guild-a', ['member-a', 'member-b'])

    expect(guildRows.error).toBeUndefined()
    expect(guildRows.rows).toHaveLength(1003)
    expect(guildBalances.error).toBeUndefined()
    expect(guildBalances.rows).toHaveLength(2)
    expect(balances.error).toBeUndefined()
    expect(balances.balances.get('member-a')).toBe(1002)
    expect(balances.balances.get('member-b')).toBe(50)
  })

  it('can read a limited recent ledger slice for one member in one guild', async () => {
    const rows = [
      {
        id: 'old',
        guild_id: 'guild-a',
        discord_id: 'member-a',
        delta: 100,
        reason: 'regear_approved',
        memo: null,
        created_at: '2026-01-01T00:00:00.000Z',
        handled_by_username: null,
      },
      {
        id: 'newest',
        guild_id: 'guild-a',
        discord_id: 'member-a',
        delta: -40,
        reason: 'shop_purchase',
        memo: null,
        created_at: '2026-01-03T00:00:00.000Z',
        handled_by_username: null,
      },
      {
        id: 'middle',
        guild_id: 'guild-a',
        discord_id: 'member-a',
        delta: 25,
        reason: 'admin_adjust',
        memo: 'attendance',
        created_at: '2026-01-02T00:00:00.000Z',
        handled_by_username: 'Officer',
      },
      {
        id: 'other-member',
        guild_id: 'guild-a',
        discord_id: 'member-b',
        delta: 999,
        reason: 'admin_adjust',
        memo: null,
        created_at: '2026-01-04T00:00:00.000Z',
        handled_by_username: null,
      },
      {
        id: 'other-guild',
        guild_id: 'guild-b',
        discord_id: 'member-a',
        delta: 999,
        reason: 'admin_adjust',
        memo: null,
        created_at: '2026-01-04T00:00:00.000Z',
        handled_by_username: null,
      },
    ]

    const { rows: entries, error } = await listMemberPointLedgerEntries(
      makePointLedgerDb(rows),
      'guild-a',
      'member-a',
      { limit: 2 },
    )

    expect(error).toBeUndefined()
    expect(entries).toEqual([
      {
        id: 'newest',
        delta: -40,
        reason: 'shop_purchase',
        memo: null,
        createdAt: '2026-01-03T00:00:00.000Z',
        handledByUsername: null,
      },
      {
        id: 'middle',
        delta: 25,
        reason: 'admin_adjust',
        memo: 'attendance',
        createdAt: '2026-01-02T00:00:00.000Z',
        handledByUsername: 'Officer',
      },
    ])
  })
})
