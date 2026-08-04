import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getTestServiceClient, hasTestEnv } from '@/test/integration-helpers'

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
        allianceForce(
          firstBattleId,
          firstAllianceId,
          homeGuildId,
          'First Alliance',
          'Home Guild',
          20,
          6,
          4,
          1_000_000,
        ),
        allianceForce(
          firstBattleId,
          enemyAllianceId,
          enemyGuildId,
          'Enemy Alliance',
          'Enemy Guild',
          20,
          4,
          6,
          800_000,
        ),
        guildForce(
          firstBattleId,
          firstAllianceId,
          homeGuildId,
          'First Alliance',
          'Home Guild',
          20,
          6,
          4,
          1_000_000,
        ),
        guildForce(
          firstBattleId,
          enemyAllianceId,
          enemyGuildId,
          'Enemy Alliance',
          'Enemy Guild',
          20,
          4,
          6,
          800_000,
        ),
        allianceForce(
          secondBattleId,
          latestAllianceId,
          homeGuildId,
          'Latest Alliance',
          'Home Guild',
          35,
          2,
          5,
          500_000,
        ),
        allianceForce(
          secondBattleId,
          enemyAllianceId,
          enemyGuildId,
          'Enemy Alliance',
          'Enemy Guild',
          30,
          5,
          2,
          900_000,
        ),
        guildForce(
          secondBattleId,
          latestAllianceId,
          homeGuildId,
          'Latest Alliance',
          'Home Guild',
          35,
          2,
          5,
          500_000,
        ),
        guildForce(
          secondBattleId,
          enemyAllianceId,
          enemyGuildId,
          'Enemy Alliance',
          'Enemy Guild',
          30,
          5,
          2,
          900_000,
        ),
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
      qualification_version: 'agm_zvz_v2_20plus',
      evidence_rows: 4,
      force_evidence_rows: 4,
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
    expect(Number(rollup?.avg_force_size)).toBe(27.5)
    expect(Number(rollup?.battle_points)).toBe(50)
    expect(Number(rollup?.kill_points)).toBe(24)
    expect(Number(rollup?.kd_bonus_points)).toBe(0)
    expect(Number(rollup?.kill_fame_points)).toBe(3)
    expect(Number(rollup?.force_size_points)).toBe(41.25)
    expect(Number(rollup?.death_penalty_points)).toBe(0.5)
    expect(Number(rollup?.score)).toBe(117.75)

    const { data: evidence, error: evidenceError } = await client
      .from('guild_weekly_zvz_battle_evidence')
      .select(
        'alliance_albion_id, alliance_name, team_size, kills, deaths, kill_fame, qualification_version',
      )
      .eq('week_start', WEEK_START)
      .eq('albion_server', 'east')
      .eq('guild_albion_id', homeGuildId)
      .order('battle_started_at', { ascending: true })
    expect(evidenceError).toBeNull()
    expect(evidence).toEqual([
      {
        alliance_albion_id: firstAllianceId,
        alliance_name: 'First Alliance',
        team_size: 20,
        kills: 6,
        deaths: 4,
        kill_fame: 1_000_000,
        qualification_version: 'agm_zvz_v2_20plus',
      },
      {
        alliance_albion_id: latestAllianceId,
        alliance_name: 'Latest Alliance',
        team_size: 35,
        kills: 2,
        deaths: 5,
        kill_fame: 500_000,
        qualification_version: 'agm_zvz_v2_20plus',
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

  it('preserves a 24v20 alliance fight when every member guild is below the score floor', async () => {
    const client = getTestServiceClient()
    const fragmentedBattleIdSeed = Date.now() * 10 + 9
    const fragmentedAllianceId = crypto.randomUUID()
    const fragmentedEnemyAllianceId = crypto.randomUUID()
    const fragmentedGuildIds = Array.from({ length: 6 }, () => crypto.randomUUID())
    const { data: battle, error: battleError } = await client
      .from('battle_records')
      .insert({
        albion_server: 'east',
        albion_battle_id: fragmentedBattleIdSeed,
        started_at: '2099-01-07T12:00:00.000Z',
        ended_at: '2099-01-07T12:10:00.000Z',
        total_players: 44,
        total_kills: 15,
        total_fame: 2_000_000,
        cluster_name: 'Fragmented Alliances',
        involved_guild_ids: fragmentedGuildIds,
        involved_alliance_ids: [
          fragmentedAllianceId,
          fragmentedEnemyAllianceId,
        ],
        raw_battle: {},
      })
      .select('id')
      .single()
    expect(battleError).toBeNull()
    expect(battle).not.toBeNull()
    const fragmentedBattleId = battle!.id
    battleRecordIds.push(fragmentedBattleId)

    const guildNames = fragmentedGuildIds.map((_, index) => `Fragment ${index + 1}`)
    const { error: forceError } = await client
      .from('battle_force_summaries')
      .insert([
        allianceMultiForce(
          fragmentedBattleId,
          fragmentedAllianceId,
          'Fragmented Home',
          fragmentedGuildIds.slice(0, 3),
          guildNames.slice(0, 3),
          24,
          13,
          0,
          1_600_000,
        ),
        allianceMultiForce(
          fragmentedBattleId,
          fragmentedEnemyAllianceId,
          'Fragmented Enemy',
          fragmentedGuildIds.slice(3),
          guildNames.slice(3),
          20,
          2,
          17,
          400_000,
        ),
        guildForce(
          fragmentedBattleId,
          fragmentedAllianceId,
          fragmentedGuildIds[0],
          'Fragmented Home',
          guildNames[0],
          9,
          6,
          0,
          700_000,
        ),
        guildForce(
          fragmentedBattleId,
          fragmentedAllianceId,
          fragmentedGuildIds[1],
          'Fragmented Home',
          guildNames[1],
          8,
          4,
          0,
          500_000,
        ),
        guildForce(
          fragmentedBattleId,
          fragmentedAllianceId,
          fragmentedGuildIds[2],
          'Fragmented Home',
          guildNames[2],
          7,
          3,
          0,
          400_000,
        ),
        guildForce(
          fragmentedBattleId,
          fragmentedEnemyAllianceId,
          fragmentedGuildIds[3],
          'Fragmented Enemy',
          guildNames[3],
          7,
          1,
          6,
          170_000,
        ),
        guildForce(
          fragmentedBattleId,
          fragmentedEnemyAllianceId,
          fragmentedGuildIds[4],
          'Fragmented Enemy',
          guildNames[4],
          7,
          1,
          6,
          130_000,
        ),
        guildForce(
          fragmentedBattleId,
          fragmentedEnemyAllianceId,
          fragmentedGuildIds[5],
          'Fragmented Enemy',
          guildNames[5],
          6,
          0,
          5,
          100_000,
        ),
      ])
    expect(forceError).toBeNull()

    const refreshed = await client.rpc('refresh_guild_weekly_zvz_rollups', {
      p_week_start: WEEK_START,
    })
    expect(refreshed.error).toBeNull()
    expect(refreshed.data).toMatchObject({
      evidence_rows: 4,
      force_evidence_rows: 6,
      rows: 2,
    })

    const { data: forceEvidence, error: forceEvidenceError } = await client
      .from('public_zvz_force_battle_evidence')
      .select(
        'alliance_albion_id, alliance_name, guild_ids, team_size, qualification_version',
      )
      .eq('battle_record_id', fragmentedBattleId)
      .order('team_size', { ascending: false })
    expect(forceEvidenceError).toBeNull()
    expect(forceEvidence).toEqual([
      {
        alliance_albion_id: fragmentedAllianceId,
        alliance_name: 'Fragmented Home',
        guild_ids: fragmentedGuildIds.slice(0, 3),
        team_size: 24,
        qualification_version: 'agm_zvz_v2_20plus',
      },
      {
        alliance_albion_id: fragmentedEnemyAllianceId,
        alliance_name: 'Fragmented Enemy',
        guild_ids: fragmentedGuildIds.slice(3),
        team_size: 20,
        qualification_version: 'agm_zvz_v2_20plus',
      },
    ])

    const { count: guildEvidenceCount, error: guildEvidenceError } = await client
      .from('guild_weekly_zvz_battle_evidence')
      .select('*', { count: 'exact', head: true })
      .eq('battle_record_id', fragmentedBattleId)
    expect(guildEvidenceError).toBeNull()
    expect(guildEvidenceCount).toBe(0)
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

function allianceMultiForce(
  battleRecordId: string,
  allianceId: string,
  allianceName: string,
  guildIds: string[],
  guildNames: string[],
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
    guild_ids: guildIds,
    guild_names: guildNames,
    team_size: teamSize,
    kills,
    deaths,
    kill_fame: killFame,
  }
}
