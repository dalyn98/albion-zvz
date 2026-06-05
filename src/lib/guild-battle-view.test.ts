import { describe, expect, it } from 'vitest'
import {
  normalizeGuildBattleListMode,
  normalizeGuildBattleResultFilter,
  resolveGuildBattleDisplayStatus,
  toGuildBattleListRow,
  type GuildBattleViewDbRow,
} from './guild-battle-view'

const baseRow: GuildBattleViewDbRow = {
  id: 'view-1',
  tenant_id: 'tenant-1',
  battle_record_id: 'battle-1',
  legacy_tenant_battle_record_id: 'legacy-1',
  albion_server: 'east',
  albion_battle_id: 123456,
  started_at: '2026-06-04T12:00:00.000Z',
  ended_at: '2026-06-04T12:24:00.000Z',
  cluster_name: 'Basin of Life',
  subject_name: 'Menhera',
  subject_alliance_name: 'MGM',
  relation_scope: 'direct',
  opponent_force_kind: 'alliance',
  opponent_force_name: 'Enemy Coalition',
  subject_team_size: 42,
  subject_kills: 16,
  subject_deaths: 9,
  subject_kill_fame: 12_500_000,
  opponent_team_size: 38,
  opponent_kills: 9,
  opponent_deaths: 16,
  opponent_kill_fame: 8_100_000,
  status: 'final',
  evidence_source: 'battle_summary',
  is_meaningful: true,
  view_policy: 'default_meaningful',
  result_estimate: 'advantage',
  size_category: 'middle',
  legacy_outcome: 'win',
  legacy_row_outcome: 'win',
  legacy_is_provisional: false,
  match_index: 1,
  match_total: 1,
  has_active_diff: false,
  active_diff_types: [],
  evaluated_at: '2026-06-04T12:30:00.000Z',
}

describe('normalizeGuildBattleListMode', () => {
  it('defaults to the default ledger view and whitelists known modes only', () => {
    expect(normalizeGuildBattleListMode(undefined)).toBe('default')
    expect(normalizeGuildBattleListMode('direct')).toBe('direct')
    expect(normalizeGuildBattleListMode('alliance')).toBe('alliance')
    expect(normalizeGuildBattleListMode('excluded')).toBe('excluded')
    expect(normalizeGuildBattleListMode('diffs')).toBe('diffs')
    expect(normalizeGuildBattleListMode('recent')).toBe('default')
    expect(normalizeGuildBattleListMode('zerg')).toBe('default')
  })
})

describe('normalizeGuildBattleResultFilter', () => {
  it('uses projection result estimates instead of legacy win/loss/tie filters', () => {
    expect(normalizeGuildBattleResultFilter(undefined)).toBeNull()
    expect(normalizeGuildBattleResultFilter('advantage')).toBe('advantage')
    expect(normalizeGuildBattleResultFilter('disadvantage')).toBe('disadvantage')
    expect(normalizeGuildBattleResultFilter('even')).toBe('even')
    expect(normalizeGuildBattleResultFilter('unclear')).toBe('unclear')
    expect(normalizeGuildBattleResultFilter('win')).toBeNull()
  })
})

describe('resolveGuildBattleDisplayStatus', () => {
  it('does not expose never-finalizing battle-summary projections as pending', () => {
    expect(resolveGuildBattleDisplayStatus('provisional', false)).toBe('final')
    expect(resolveGuildBattleDisplayStatus('provisional', null)).toBe('final')
  })

  it('keeps true pending legacy rows and low-confidence projections visible', () => {
    expect(resolveGuildBattleDisplayStatus('provisional', true)).toBe('provisional')
    expect(resolveGuildBattleDisplayStatus('low_confidence', false)).toBe('low_confidence')
  })
})

describe('toGuildBattleListRow', () => {
  it('maps a direct meaningful projection to the new ledger list row shape', () => {
    expect(toGuildBattleListRow(baseRow)).toEqual({
      id: 'view-1',
      legacyTenantBattleRecordId: 'legacy-1',
      albionBattleId: 123456,
      clusterName: 'Basin of Life',
      startedAt: '2026-06-04T12:00:00.000Z',
      subjectName: 'Menhera',
      subjectAllianceName: 'MGM',
      relationScope: 'direct',
      opponentForceKind: 'alliance',
      opponentForceName: 'Enemy Coalition',
      subjectTeamSize: 42,
      subjectKills: 16,
      subjectDeaths: 9,
      subjectKillFame: 12_500_000,
      opponentTeamSize: 38,
      opponentKills: 9,
      opponentDeaths: 16,
      opponentKillFame: 8_100_000,
      status: 'final',
      evidenceSource: 'battle_summary',
      isMeaningful: true,
      viewPolicy: 'default_meaningful',
      resultEstimate: 'advantage',
      sizeCategory: 'middle',
      legacyOutcome: 'win',
      legacyRowOutcome: 'win',
      legacyIsProvisional: false,
      matchIndex: 1,
      matchTotal: 1,
      hasActiveDiff: false,
      activeDiffTypes: [],
      evaluatedAt: '2026-06-04T12:30:00.000Z',
    })
  })

  it('keeps excluded and alliance-only projections visible instead of dropping them', () => {
    const row = toGuildBattleListRow({
      ...baseRow,
      id: 'view-2',
      legacy_tenant_battle_record_id: null,
      relation_scope: 'alliance',
      is_meaningful: false,
      view_policy: 'small_or_low_engagement',
      result_estimate: 'unclear',
      size_category: null,
      legacy_outcome: null,
      legacy_row_outcome: null,
      match_index: null,
      match_total: null,
      has_active_diff: true,
      active_diff_types: ['missing_legacy_projection'],
    })

    expect(row).toMatchObject({
      id: 'view-2',
      legacyTenantBattleRecordId: null,
      relationScope: 'alliance',
      isMeaningful: false,
      viewPolicy: 'small_or_low_engagement',
      resultEstimate: 'unclear',
      sizeCategory: null,
      legacyOutcome: null,
      legacyRowOutcome: null,
      matchIndex: 1,
      matchTotal: 1,
      hasActiveDiff: true,
      activeDiffTypes: ['missing_legacy_projection'],
    })
  })

  it('uses the user-facing display status instead of raw ledger projection status', () => {
    expect(
      toGuildBattleListRow({
        ...baseRow,
        status: 'provisional',
        legacy_is_provisional: false,
      }).status,
    ).toBe('final')

    expect(
      toGuildBattleListRow({
        ...baseRow,
        legacy_tenant_battle_record_id: null,
        status: 'provisional',
        legacy_is_provisional: null,
      }).status,
    ).toBe('final')
  })
})
