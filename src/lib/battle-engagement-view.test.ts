import { describe, expect, it } from 'vitest'
import {
  toBattleEngagementListItems,
  type BattleEngagementViewDbRow,
} from './battle-engagement-view'

function runRow(
  overrides: Partial<BattleEngagementViewDbRow> = {},
): BattleEngagementViewDbRow {
  return {
    tenant_id: 'tenant-1',
    run_id: 'run-1',
    battle_record_id: 'battle-record-1',
    albion_server: 'west',
    albion_battle_id: 123,
    cluster_name: 'Cluster',
    raw_started_at: '2026-07-24T00:00:00.000Z',
    raw_ended_at: '2026-07-24T00:30:00.000Z',
    total_players: 40,
    total_kills: 3,
    total_fame: 3_000,
    home_guild_id: 'home-guild',
    home_guild_name: 'Home',
    home_alliance_id: null,
    home_alliance_name: null,
    source_hash: 'a'.repeat(64),
    source_observation_count: 1,
    run_state: 'collecting',
    run_reason: 'source_not_stable',
    raw_home_kills: 2,
    raw_home_deaths: 1,
    collected_home_kills: 0,
    collected_home_deaths: 0,
    unidentified_event_count: 0,
    evaluated_at: '2026-07-24T01:00:00.000Z',
    engagement_id: null,
    engagement_key: null,
    sequence: null,
    started_at: null,
    ended_at: null,
    status: null,
    result: null,
    home_kills: null,
    home_deaths: null,
    home_kill_fame: null,
    opponent_kills: null,
    opponent_deaths: null,
    opponent_kill_fame: null,
    result_home_kills: null,
    result_home_deaths: null,
    result_home_kill_fame: null,
    result_opponent_kills: null,
    result_opponent_deaths: null,
    result_opponent_kill_fame: null,
    result_eligible_event_count: null,
    intervention_event_count: null,
    other_event_count: null,
    home_team_size: null,
    home_side_team_size: null,
    is_other_only: null,
    note: null,
    note_updated_at: null,
    opponent_side_team_size: null,
    ...overrides,
  }
}

describe('toBattleEngagementListItems', () => {
  it('교전 묶음이 아직 없어도 legacy 판정 대신 수집 상태를 노출한다', () => {
    const items = toBattleEngagementListItems([runRow()], [])

    expect(items).toEqual([
      expect.objectContaining({
        id: 'run:run-1',
        isRunOnly: true,
        status: 'pending',
        result: null,
        rawHomeKills: 2,
        rawHomeDeaths: 1,
        collectedHomeKills: 0,
        collectedHomeDeaths: 0,
      }),
    ])
  })

  it('교전 묶음이 있으면 상세 링크가 가능한 정상 항목으로 변환한다', () => {
    const items = toBattleEngagementListItems(
      [
        runRow({
          source_observation_count: 2,
          run_state: 'ready',
          run_reason: 'complete',
          engagement_id: 'engagement-1',
          engagement_key: 'b'.repeat(64),
          sequence: 1,
          started_at: '2026-07-24T00:01:00.000Z',
          ended_at: '2026-07-24T00:02:00.000Z',
          status: 'final',
          result: 'advantage',
        }),
      ],
      [],
    )

    expect(items[0]).toMatchObject({
      id: 'engagement-1',
      isRunOnly: false,
      status: 'final',
      result: 'advantage',
    })
  })

  it('검증은 끝났지만 실제 홈 교전이 없으면 제외 대상 보류로 표시한다', () => {
    const items = toBattleEngagementListItems(
      [
        runRow({
          source_observation_count: 2,
          run_state: 'ready',
          run_reason: 'complete',
          raw_home_kills: 0,
          raw_home_deaths: 0,
        }),
      ],
      [],
    )

    expect(items[0]).toMatchObject({
      isRunOnly: true,
      isOtherOnly: true,
      status: 'insufficient_evidence',
      result: null,
    })
  })

  it('규모 미달로 매치업이 비어도 실제 상대측 인원을 표시한다', () => {
    const items = toBattleEngagementListItems(
      [
        runRow({
          source_observation_count: 2,
          run_state: 'ready',
          run_reason: 'complete',
          engagement_id: 'engagement-1',
          engagement_key: 'b'.repeat(64),
          sequence: 1,
          started_at: '2026-07-24T00:01:00.000Z',
          ended_at: '2026-07-24T00:02:00.000Z',
          status: 'insufficient_evidence',
          opponent_side_team_size: 19,
          is_other_only: true,
        }),
      ],
      [],
    )

    expect(items[0]).toMatchObject({
      opponentTeamSize: 19,
      isOtherOnly: true,
      matchups: [],
    })
  })
})
