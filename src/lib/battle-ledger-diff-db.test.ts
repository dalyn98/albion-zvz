import { describe, expect, it } from 'vitest'
import {
  getBattleProjectionDiffReport,
  refreshBattleProjectionDiffs,
} from './battle-ledger-diff-db'

type DiffRow = {
  id: string
  battle_record_id: string
  legacy_tenant_id: string | null
  legacy_tenant_battle_record_id: string | null
  subject_albion_id: string
  diff_type:
    | 'missing_shadow_projection'
    | 'missing_legacy_projection'
    | 'opponent_mismatch'
    | 'meaningful_policy_mismatch'
    | 'result_estimate_mismatch'
  legacy_payload: Record<string, unknown>
  shadow_payload: Record<string, unknown>
  detected_at: string
  resolved_at: string | null
}

function diffRow(id: string, resolved: boolean): DiffRow {
  return {
    id,
    battle_record_id: `battle-${id}`,
    legacy_tenant_id: `tenant-${id}`,
    legacy_tenant_battle_record_id: `legacy-${id}`,
    subject_albion_id: `guild-${id}`,
    diff_type: id.endsWith('0') ? 'missing_legacy_projection' : 'opponent_mismatch',
    legacy_payload: {},
    shadow_payload: id.endsWith('0')
      ? { relation_scopes: ['direct', 'alliance'] }
      : { relation_scope: 'direct' },
    detected_at: '2026-06-01T10:00:00Z',
    resolved_at: resolved ? '2026-06-01T11:00:00Z' : null,
  }
}

function createReportDb(input: { activeRows: DiffRow[]; resolvedRows: DiffRow[] }) {
  const calls = {
    active: [] as Array<[number, number]>,
    resolved: [] as Array<[number, number]>,
  }

  const db = {
    from(table: string) {
      expect(table).toBe('battle_projection_diffs')
      let kind: 'active' | 'resolved' | null = null
      const query = {
        select() {
          return query
        },
        is(column: string, value: null) {
          expect(column).toBe('resolved_at')
          expect(value).toBeNull()
          kind = 'active'
          return query
        },
        not(column: string, operator: string, value: null) {
          expect(column).toBe('resolved_at')
          expect(operator).toBe('is')
          expect(value).toBeNull()
          kind = 'resolved'
          return query
        },
        gte() {
          return query
        },
        order() {
          return query
        },
        async range(from: number, to: number) {
          if (!kind) throw new Error('range called before resolved_at filter')
          calls[kind].push([from, to])
          const rows = kind === 'active' ? input.activeRows : input.resolvedRows
          return { data: rows.slice(from, to + 1), error: null }
        },
      }
      return query
    },
  }

  return { db, calls }
}

type LegacyComparisonDbRow = {
  id: string
  guild_id: string
  battle_record_id: string
  home_guild_id: string
  home_guild_name: string
  main_opponent_force_key: string
  main_opponent_force_kind: 'alliance'
  main_opponent_force_name: string
  main_opponent_team_size: number
  size_category: string
  outcome: 'win' | 'loss' | 'tie'
  is_provisional: boolean
  started_at: string
}

type ShadowComparisonDbRow = {
  battle_record_id: string
  subject_albion_id: string
  subject_name: string
  relation_scope: 'direct'
  opponent_force_key: string
  opponent_force_kind: 'alliance'
  opponent_force_name: string
  opponent_team_size: number
  status: 'final'
  evidence_source: 'battle_summary'
  is_meaningful: boolean
  view_policy: 'default_meaningful'
  result_estimate: 'advantage'
  legacy_outcome: 'win' | 'loss' | 'tie'
  evaluated_at: string
}

type ExistingComparisonDbRow = {
  id: string
  battle_record_id: string
  legacy_tenant_battle_record_id: string | null
  subject_type: 'guild'
  subject_albion_id: string
  diff_type:
    | 'missing_shadow_projection'
    | 'missing_legacy_projection'
    | 'opponent_mismatch'
    | 'meaningful_policy_mismatch'
    | 'result_estimate_mismatch'
  resolved_at: string | null
}

function createRefreshDb(input: {
  legacyRows: LegacyComparisonDbRow[]
  shadowRows: ShadowComparisonDbRow[]
  existingRows: ExistingComparisonDbRow[]
}) {
  const calls = {
    legacyRanges: [] as Array<[number, number]>,
    shadowRanges: [] as Array<[number, number]>,
    existingRanges: [] as Array<[number, number]>,
    resolvedIds: [] as string[],
    refreshedIds: [] as string[],
    insertedRows: [] as Array<Record<string, unknown>>,
  }

  const selectRowsByTable = (table: string) => {
    if (table === 'tenant_battle_records') return input.legacyRows
    if (table === 'battle_view_projections') return input.shadowRows
    return input.existingRows
  }
  const rangeCallsByTable = (table: string) => {
    if (table === 'tenant_battle_records') return calls.legacyRanges
    if (table === 'battle_view_projections') return calls.shadowRanges
    return calls.existingRanges
  }

  const db = {
    from(table: string) {
      const query = {
        select() {
          return query
        },
        in(column: string, values: string[]) {
          if (column === 'id') {
            calls.resolvedIds.push(...values)
            return Promise.resolve({ error: null })
          }
          return query
        },
        eq(column: string, value: string) {
          if (column === 'id') {
            calls.refreshedIds.push(value)
            return Promise.resolve({ error: null })
          }
          return query
        },
        order() {
          return query
        },
        range(from: number, to: number) {
          rangeCallsByTable(table).push([from, to])
          return Promise.resolve({
            data: selectRowsByTable(table).slice(from, to + 1),
            error: null,
          })
        },
        update() {
          return query
        },
        insert(rows: Array<Record<string, unknown>>) {
          calls.insertedRows.push(...rows)
          return Promise.resolve({ error: null })
        },
      }
      return query
    },
  }

  return { db, calls }
}

describe('getBattleProjectionDiffReport', () => {
  it('paginates report rows before summarizing while limiting samples only', async () => {
    const activeRows = Array.from({ length: 1001 }, (_, i) => diffRow(`active-${i}`, false))
    const resolvedRows = Array.from({ length: 1002 }, (_, i) => diffRow(`resolved-${i}`, true))
    const { db, calls } = createReportDb({ activeRows, resolvedRows })

    const report = await getBattleProjectionDiffReport({
      db: db as never,
      recentResolvedSince: '2026-05-25T00:00:00Z',
      sampleLimit: 2,
    })

    expect(report.active.total).toBe(1001)
    expect(report.recentResolved.total).toBe(1002)
    expect(report.activeSamples).toHaveLength(2)
    expect(report.recentResolvedSamples).toHaveLength(2)
    expect(calls.active).toEqual([
      [0, 999],
      [1000, 1999],
    ])
    expect(calls.resolved).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })
})

describe('refreshBattleProjectionDiffs', () => {
  it('paginates comparison reads before deciding whether to insert or refresh diffs', async () => {
    const comparedAt = '2026-06-01T10:00:00Z'
    const legacyRows: LegacyComparisonDbRow[] = [
      {
        id: 'legacy-match',
        guild_id: 'tenant-1',
        battle_record_id: 'battle-1',
        home_guild_id: 'home-guild',
        home_guild_name: 'Home',
        main_opponent_force_key: 'a:opponent',
        main_opponent_force_kind: 'alliance',
        main_opponent_force_name: 'Opponent',
        main_opponent_team_size: 40,
        size_category: 'middle',
        outcome: 'loss',
        is_provisional: false,
        started_at: '2026-06-01T09:40:00Z',
      },
    ]
    const shadowRows: ShadowComparisonDbRow[] = [
      {
        battle_record_id: 'battle-1',
        subject_albion_id: 'home-guild',
        subject_name: 'Home',
        relation_scope: 'direct',
        opponent_force_key: 'a:opponent',
        opponent_force_kind: 'alliance',
        opponent_force_name: 'Opponent',
        opponent_team_size: 40,
        status: 'final',
        evidence_source: 'battle_summary',
        is_meaningful: true,
        view_policy: 'default_meaningful',
        result_estimate: 'advantage',
        legacy_outcome: 'win',
        evaluated_at: comparedAt,
      },
    ]
    const staleExisting = Array.from({ length: 1000 }, (_, i): ExistingComparisonDbRow => ({
      id: `stale-${i}`,
      battle_record_id: 'battle-1',
      legacy_tenant_battle_record_id: `legacy-stale-${i}`,
      subject_type: 'guild',
      subject_albion_id: 'home-guild',
      diff_type: 'opponent_mismatch',
      resolved_at: null,
    }))
    const matchingExisting: ExistingComparisonDbRow = {
      id: 'existing-match',
      battle_record_id: 'battle-1',
      legacy_tenant_battle_record_id: 'legacy-match',
      subject_type: 'guild',
      subject_albion_id: 'home-guild',
      diff_type: 'result_estimate_mismatch',
      resolved_at: null,
    }
    const { db, calls } = createRefreshDb({
      legacyRows,
      shadowRows,
      existingRows: [...staleExisting, matchingExisting],
    })

    const result = await refreshBattleProjectionDiffs({
      db: db as never,
      battleRecordIds: ['battle-1'],
      subjects: [
        {
          tenantId: 'tenant-1',
          homeGuildId: 'home-guild',
          homeGuildName: 'Home',
        },
      ],
      comparedAt,
    })

    expect(result).toMatchObject({
      activeDiffs: 1,
      insertedDiffs: 0,
      refreshedDiffs: 1,
      resolvedDiffs: 1000,
      errors: [],
    })
    expect(calls.existingRanges).toEqual([
      [0, 999],
      [1000, 1999],
    ])
    expect(calls.refreshedIds).toEqual(['existing-match'])
    expect(calls.insertedRows).toEqual([])
  })
})
