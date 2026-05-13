import { describe, expect, it } from 'vitest'
import { bundleSplitBattles, type BundleableRow } from './battle-bundling'

// 도메인 invariant: 마이그 098 이후 한 albion battle 이 multi-main-opponent 매치업으로
// 분리될 때, 통계/업적의 "전투 카운트" 는 force 합산으로 1전투. K/D 는 force 끼리 disjoint
// 라 단순 합산이고, outcome 과 main_opponent_team_size 는 "가장 큰 force" 가 메인 매치업.

function makeRow(overrides: Partial<BundleableRow> = {}): BundleableRow {
  return {
    battle_record_id: 'b1',
    outcome: 'win',
    home_kills: 0,
    home_deaths: 0,
    home_team_size: 0,
    main_opponent_team_size: 0,
    ...overrides,
  }
}

describe('bundleSplitBattles', () => {
  it('returns empty array for empty input', () => {
    expect(bundleSplitBattles([])).toEqual([])
  })

  it('passes through a single non-split row unchanged', () => {
    const row = makeRow({
      battle_record_id: 'b1',
      outcome: 'win',
      home_kills: 5,
      home_deaths: 1,
      home_team_size: 20,
      main_opponent_team_size: 22,
    })
    const result = bundleSplitBattles([row])
    expect(result).toEqual([
      {
        battleRecordId: 'b1',
        outcome: 'win',
        homeKills: 5,
        homeDeaths: 1,
        homeTeamSize: 20,
        mainOpponentTeamSize: 22,
      },
    ])
  })

  it('sums K/D across split forces of the same albion battle', () => {
    const rows = [
      makeRow({ battle_record_id: 'b1', home_kills: 5, home_deaths: 2, main_opponent_team_size: 25 }),
      makeRow({ battle_record_id: 'b1', home_kills: 3, home_deaths: 1, main_opponent_team_size: 10 }),
    ]
    const result = bundleSplitBattles(rows)
    expect(result).toHaveLength(1)
    expect(result[0].homeKills).toBe(8)
    expect(result[0].homeDeaths).toBe(3)
  })

  it('adopts outcome and mainOpponentTeamSize from the row with the largest main_opponent_team_size', () => {
    // force A (small 매치업) win, force B (큰 매치업) loss → 진짜 메인은 B → outcome loss.
    const rows = [
      makeRow({ battle_record_id: 'b1', outcome: 'win', main_opponent_team_size: 12 }),
      makeRow({ battle_record_id: 'b1', outcome: 'loss', main_opponent_team_size: 45 }),
    ]
    const result = bundleSplitBattles(rows)
    expect(result[0].outcome).toBe('loss')
    expect(result[0].mainOpponentTeamSize).toBe(45)
  })

  it('uses max home_team_size as a safety net when rows disagree', () => {
    // 같은 albion battle 의 force 분리는 home_team_size 가 같아야 정상이지만,
    // 데이터 불일치 시 max 채택 (집계 누락 방지).
    const rows = [
      makeRow({ battle_record_id: 'b1', home_team_size: 18 }),
      makeRow({ battle_record_id: 'b1', home_team_size: 20 }),
    ]
    const result = bundleSplitBattles(rows)
    expect(result[0].homeTeamSize).toBe(20)
  })

  it('groups multiple albion battles independently', () => {
    const rows = [
      makeRow({ battle_record_id: 'b1', home_kills: 1 }),
      makeRow({ battle_record_id: 'b2', home_kills: 2 }),
      makeRow({ battle_record_id: 'b1', home_kills: 3 }),
    ]
    const result = bundleSplitBattles(rows)
    expect(result).toHaveLength(2)
    const b1 = result.find((b) => b.battleRecordId === 'b1')
    const b2 = result.find((b) => b.battleRecordId === 'b2')
    expect(b1?.homeKills).toBe(4)
    expect(b2?.homeKills).toBe(2)
  })
})
