import { describe, expect, it } from 'vitest'
import {
  getMemberPointSummary,
  getPointBalancesByMember,
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

function makePointLedgerDb(rows: PointRow[]) {
  return {
    from(table: string) {
      expect(table).toBe('point_ledger')
      const state: {
        eq: Array<[string, unknown]>
        in: Array<[string, unknown[]]>
        gte: Array<[string, string]>
      } = { eq: [], in: [], gte: [] }
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
        order() {
          return query
        },
        async range(from: number, to: number) {
          let filtered = rows
          for (const [column, value] of state.eq) {
            filtered = filtered.filter((row) => row[column as keyof PointRow] === value)
          }
          for (const [column, values] of state.in) {
            filtered = filtered.filter((row) => values.includes(row[column as keyof PointRow] as never))
          }
          for (const [column, value] of state.gte) {
            filtered = filtered.filter((row) => String(row[column as keyof PointRow] ?? '') >= value)
          }
          return { data: filtered.slice(from, to + 1), error: null }
        },
      }
      return query
    },
  } as never
}

describe('point-ledger helpers', () => {
  it('paginates member point summaries past the PostgREST default page size', async () => {
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

  it('paginates guild and selected-member balance scans', async () => {
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
    const balances = await getPointBalancesByMember(db, 'guild-a', ['member-a', 'member-b'])

    expect(guildRows.error).toBeUndefined()
    expect(guildRows.rows).toHaveLength(1003)
    expect(balances.error).toBeUndefined()
    expect(balances.balances.get('member-a')).toBe(1002)
    expect(balances.balances.get('member-b')).toBe(50)
  })
})
