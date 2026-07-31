import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  getTestServiceClient,
  hasTestEnv,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip
const WEEK_START = '2099-01-05'
const NEXT_WEEK_START = '2099-01-12'

describeIntegration('public ZvZ ranking evidence DB invariants (migrations 319/320)', () => {
  const homeGuildId = crypto.randomUUID()
  const enemyGuildId = crypto.randomUUID()
  const firstAllianceId = crypto.randomUUID()
  const latestAllianceId = crypto.randomUUID()
  const enemyAllianceId = crypto.randomUUID()
  const battleRecordIds: string[] = []

  beforeEach(async () => {
    const client = getTestServiceClient()
    const battleIdSeed = Date.now() * 10
    const { data: battles, error: battleError } = await client
      .from('battle_records')
      .insert([
        {
          albion_server: 'east',
          albion_battle_id: battleIdSeed + 1,
          started_at: '2099-01-05T12:00:00.000Z',
          ended_at: '2099-01-05T12:10:00.000Z',
          total_players: 50,
          total_kills: 10,
          total_fame: 1_800_000,
          cluster_name: 'Evidence One',
          involved_guild_ids: [homeGuildId, enemyGuildId],
          involved_alliance_ids: [firstAllianceId, enemyAllianceId],
          raw_battle: {},
        },
        {
          albion_server: 'east',
          albion_battle_id: battleIdSeed + 2,
          started_at: '2099-01-06T12:00:00.000Z',
          ended_at: '2099-01-06T12:10:00.000Z',
          total_players: 65,
          total_kills: 14,
          total_fame: 1_400_000,
          cluster_name: 'Evidence Two',
          involved_guild_ids: [homeGuildId, enemyGuildId],
          involved_alliance_ids: [latestAllianceId, enemyAllianceId],
          raw_battle: {},
        },
      ])
      .select('id, started_at')
      .order('started_at', { ascending: true })
    expect(battleError).toBeNull()
    expect(battles).toHaveLength(2)
    battleRecordIds.push(...(battles ?? []).map((battle) => battle.id))

    const [firstBattleId, secondBattleId] = battleRecordIds
    const { error: forceError } = await client
      .from('battle_force_summaries')
      .insert([
        allianceForce(firstBattleId, firstAllianceId, homeGuildId, 'First Alliance', 'Home Guild', 25, 6, 4, 1_000_000),
        allianceForce(firstBattleId, enemyAllianceId, enemyGuildId, 'Enemy Alliance', 'Enemy Guild', 25, 4, 6, 800_000),
        guildForce(firstBattleId, firstAllianceId, homeGuildId, 'First Alliance', 'Home Guild', 25, 6, 4, 1_000_000),
        guildForce(firstBattleId, enemyAllianceId, enemyGuildId, 'Enemy Alliance', 'Enemy Guild', 25, 4, 6, 800_000),
        allianceForce(secondBattleId, latestAllianceId, homeGuildId, 'Latest Alliance', 'Home Guild', 35, 2, 5, 500_000),
        allianceForce(secondBattleId, enemyAllianceId, enemyGuildId, 'Enemy Alliance', 'Enemy Guild', 30, 5, 2, 900_000),
        guildForce(secondBattleId, latestAllianceId, homeGuildId, 'Latest Alliance', 'Home Guild', 35, 2, 5, 500_000),
        guildForce(secondBattleId, enemyAllianceId, enemyGuildId, 'Enemy Alliance', 'Enemy Guild', 30, 5, 2, 900_000),
      ])
    expect(forceError).toBeNull()
  })

  afterEach(async () => {
    const client = getTestServiceClient()
    await client
      .from('guild_weekly_zvz_rollups')
      .delete()
      .in('week_start', [WEEK_START, NEXT_WEEK_START])
      .in('guild_albion_id', [homeGuildId, enemyGuildId])
    if (battleRecordIds.length > 0) {
      await client.from('battle_records').delete().in('id', battleRecordIds)
      battleRecordIds.length = 0
    }
  })

  it('ranks a non-tenant guild from two exact battle snapshots and preserves history', async () => {
    const client = getTestServiceClient()
    const refreshed = await client.rpc('refresh_guild_weekly_zvz_rollups', {
      p_week_start: WEEK_START,
    })
    expect(refreshed.error).toBeNull()
    expect(refreshed.data).toMatchObject({
      week_start: WEEK_START,
      evidence_rows: 4,
      rows: 2,
    })

    const { data: rollup, error: rollupError } = await client
      .from('guild_weekly_zvz_rollups')
      .select(
        'tenant_id, alliance_albion_id, alliance_name, zvz_battles, kills, deaths, kill_fame, avg_force_size, score, sample_status, score_formula_version, battle_points, kill_points, kd_bonus_points, kill_fame_points, force_size_points, death_penalty_points',
      )
      .eq('week_start', WEEK_START)
      .eq('albion_server', 'east')
      .eq('guild_albion_id', homeGuildId)
      .single()
    expect(rollupError).toBeNull()
    expect(rollup).toMatchObject({
      tenant_id: null,
      alliance_albion_id: latestAllianceId,
      alliance_name: 'Latest Alliance',
      zvz_battles: 2,
      kills: 8,
      deaths: 9,
      kill_fame: 1_500_000,
      sample_status: 'ranked',
      score_formula_version: 'agm_zvz_v1',
    })
    expect(Number(rollup?.avg_force_size)).toBe(30)
    expect(Number(rollup?.battle_points)).toBe(50)
    expect(Number(rollup?.kill_points)).toBe(24)
    expect(Number(rollup?.kd_bonus_points)).toBe(0)
    expect(Number(rollup?.kill_fame_points)).toBe(3)
    expect(Number(rollup?.force_size_points)).toBe(45)
    expect(Number(rollup?.death_penalty_points)).toBe(0.5)
    expect(Number(rollup?.score)).toBe(121.5)

    const { data: evidence, error: evidenceError } = await client
      .from('guild_weekly_zvz_battle_evidence')
      .select('alliance_albion_id, alliance_name, team_size, kills, deaths, kill_fame')
      .eq('week_start', WEEK_START)
      .eq('albion_server', 'east')
      .eq('guild_albion_id', homeGuildId)
      .order('battle_started_at', { ascending: true })
    expect(evidenceError).toBeNull()
    expect(evidence).toEqual([
      {
        alliance_albion_id: firstAllianceId,
        alliance_name: 'First Alliance',
        team_size: 25,
        kills: 6,
        deaths: 4,
        kill_fame: 1_000_000,
      },
      {
        alliance_albion_id: latestAllianceId,
        alliance_name: 'Latest Alliance',
        team_size: 35,
        kills: 2,
        deaths: 5,
        kill_fame: 500_000,
      },
    ])

    const otherWeek = await client.rpc('refresh_guild_weekly_zvz_rollups', {
      p_week_start: NEXT_WEEK_START,
    })
    expect(otherWeek.error).toBeNull()
    const { count, error: historyError } = await client
      .from('guild_weekly_zvz_battle_evidence')
      .select('*', { count: 'exact', head: true })
      .eq('week_start', WEEK_START)
      .eq('guild_albion_id', homeGuildId)
    expect(historyError).toBeNull()
    expect(count).toBe(2)
  })
})

function allianceForce(
  battleRecordId: string,
  allianceId: string,
  guildId: string,
  allianceName: string,
  guildName: string,
  teamSize: number,
  kills: number,
  deaths: number,
  killFame: number,
) {
  return {
    battle_record_id: battleRecordId,
    force_level: 'alliance',
    force_kind: 'alliance',
    force_key: `a:${allianceId}`,
    force_name: allianceName,
    alliance_id: allianceId,
    alliance_name: allianceName,
    guild_ids: [guildId],
    guild_names: [guildName],
    team_size: teamSize,
    kills,
    deaths,
    kill_fame: killFame,
  }
}

function guildForce(
  battleRecordId: string,
  allianceId: string,
  guildId: string,
  allianceName: string,
  guildName: string,
  teamSize: number,
  kills: number,
  deaths: number,
  killFame: number,
) {
  return {
    battle_record_id: battleRecordId,
    force_level: 'guild',
    force_kind: 'guild',
    force_key: `g:${guildId}`,
    force_name: guildName,
    alliance_id: allianceId,
    alliance_name: allianceName,
    guild_ids: [guildId],
    guild_names: [guildName],
    team_size: teamSize,
    kills,
    deaths,
    kill_fame: killFame,
  }
}
