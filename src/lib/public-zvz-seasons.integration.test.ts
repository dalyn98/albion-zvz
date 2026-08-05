import { createClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  getTestServiceClient,
  getValidatedTestSupabaseEnv,
  hasTestEnv,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip
const anonKey = process.env.TEST_SUPABASE_ANON_KEY?.trim() ?? ''
const describeRls = hasTestEnv() && anonKey ? describe : describe.skip

function utcDateOffset(days: number): string {
  const date = new Date()
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function atUtcNoon(date: string): string {
  return `${date}T12:00:00.000Z`
}

describeIntegration('public ZvZ season snapshot DB invariants (migration 360)', () => {
  const seasonId = crypto.randomUUID()
  const nextSeasonId = crypto.randomUUID()
  const alphaGuildId = crypto.randomUUID()
  const alphaSupportGuildId = crypto.randomUUID()
  const betaGuildId = crypto.randomUUID()
  const alphaAllianceId = crypto.randomUUID()
  const betaAllianceId = crypto.randomUUID()
  const battleIds = [crypto.randomUUID(), crypto.randomUUID()]
  const startDate = utcDateOffset(-5)
  const secondDate = utcDateOffset(-4)
  const nextSeasonDate = utcDateOffset(1)

  function v2AlphaEngagement(input: {
    date: string
    sequence: number
    keyCharacter: string
  }) {
    return {
      engagementKey: input.keyCharacter.repeat(64),
      sequence: input.sequence,
      startedAt: `${input.date}T12:00:00.000Z`,
      endedAt: `${input.date}T12:10:00.000Z`,
      status: 'final',
      result: 'advantage',
      homeForceKey: `a:${alphaAllianceId}`,
      homeForceKind: 'alliance',
      homeForceAlbionId: alphaAllianceId,
      homeForceName: 'Alpha Search Alliance',
      homeAllianceId: alphaAllianceId,
      homeAllianceName: 'Alpha Search Alliance',
      homeSideTeamSize: 30,
      opponentSideTeamSize: 30,
      scale: 'mid',
      homeKills: 5,
      homeDeaths: 3,
      homeKillFame: 1_000_000,
      opponentKillFame: 600_000,
      resultEventCount: 8,
      interventionEventCount: 0,
      eventIds: Array.from({ length: 8 }, (_, index) => `${input.sequence}-${index}`),
      matchups: [{
        opponentForceKey: `a:${betaAllianceId}`,
        opponentForceKind: 'alliance',
        opponentAlbionId: betaAllianceId,
        opponentName: 'Beta Search Alliance',
        opponentAllianceId: betaAllianceId,
        opponentTeamSize: 30,
        role: 'result_eligible',
        eventCount: 8,
        homeKills: 5,
        homeDeaths: 3,
        homeKillFame: 1_000_000,
        opponentKillFame: 600_000,
      }],
      evidence: [
        {
          entityKind: 'alliance',
          entityAlbionId: alphaAllianceId,
          entityName: 'Alpha Search Alliance',
          allianceAlbionId: alphaAllianceId,
          allianceName: 'Alpha Search Alliance',
          ownTeamSize: 30,
          sideTeamSize: 30,
          participationShare: 1,
          battleCredit: 1,
          battlePoints: 25,
          kills: 5,
          deaths: 3,
          killFame: 1_000_000,
          participationKind: 'joint_sortie',
        },
        {
          entityKind: 'guild',
          entityAlbionId: alphaGuildId,
          entityName: 'Alpha Guild',
          allianceAlbionId: alphaAllianceId,
          allianceName: 'Alpha Search Alliance',
          ownTeamSize: 29,
          sideTeamSize: 30,
          participationShare: 29 / 30,
          battleCredit: 29 / 30,
          battlePoints: 25 * 29 / 30,
          kills: 5,
          deaths: 3,
          killFame: 1_000_000,
          participationKind: 'joint_sortie',
        },
        {
          entityKind: 'guild',
          entityAlbionId: alphaSupportGuildId,
          entityName: 'Alpha Support Guild',
          allianceAlbionId: alphaAllianceId,
          allianceName: 'Alpha Search Alliance',
          ownTeamSize: 1,
          sideTeamSize: 30,
          participationShare: 1 / 30,
          battleCredit: 1 / 30,
          battlePoints: 25 / 30,
          kills: 0,
          deaths: 0,
          killFame: 0,
          participationKind: 'joint_sortie',
        },
      ],
    }
  }

  beforeEach(async () => {
    const client = getTestServiceClient()
    await client.from('zvz_seasons').delete().like('name', 'Integration Snapshot %')

    const seed = Date.now() * 10
    const { error: battleError } = await client.from('battle_records').insert([
      {
        id: battleIds[0],
        albion_server: 'west',
        albion_battle_id: seed + 1,
        started_at: atUtcNoon(startDate),
        ended_at: `${startDate}T12:10:00.000Z`,
        total_players: 60,
        total_kills: 19,
        total_fame: 2_000_000,
        cluster_name: 'Season Snapshot One',
        involved_guild_ids: [alphaGuildId, alphaSupportGuildId, betaGuildId],
        involved_alliance_ids: [],
        raw_battle: {},
      },
      {
        id: battleIds[1],
        albion_server: 'west',
        albion_battle_id: seed + 2,
        started_at: atUtcNoon(secondDate),
        ended_at: `${secondDate}T12:10:00.000Z`,
        total_players: 60,
        total_kills: 15,
        total_fame: 1_900_000,
        cluster_name: 'Season Snapshot Two',
        involved_guild_ids: [alphaGuildId, alphaSupportGuildId, betaGuildId],
        involved_alliance_ids: [],
        raw_battle: {},
      },
    ])
    expect(battleError).toBeNull()

    const { error: seasonError } = await client.from('zvz_seasons').insert([
      {
        id: seasonId,
        albion_server: 'west',
        name: `Integration Snapshot ${seasonId.slice(0, 8)}`,
        starts_on: startDate,
      },
      {
        id: nextSeasonId,
        albion_server: 'west',
        name: `Integration Snapshot Next ${nextSeasonId.slice(0, 8)}`,
        starts_on: nextSeasonDate,
      },
    ])
    expect(seasonError).toBeNull()

    const { error: evidenceError } = await client
      .from('guild_weekly_zvz_battle_evidence')
      .insert([
        evidenceRow(
          startDate,
          alphaGuildId,
          battleIds[0],
          'Alpha Guild',
          alphaAllianceId,
          'Alpha Search Alliance',
          30,
          8,
          3,
          1_000_000,
        ),
        evidenceRow(
          startDate,
          betaGuildId,
          battleIds[0],
          'Beta Guild',
          betaAllianceId,
          'Beta Search Alliance',
          30,
          3,
          8,
          1_000_000,
        ),
        evidenceRow(
          secondDate,
          alphaGuildId,
          battleIds[1],
          'Alpha Guild',
          alphaAllianceId,
          'Alpha Search Alliance',
          30,
          2,
          4,
          500_000,
        ),
        evidenceRow(
          secondDate,
          betaGuildId,
          battleIds[1],
          'Beta Guild',
          betaAllianceId,
          'Beta Search Alliance',
          30,
          6,
          3,
          900_000,
        ),
      ])
    expect(evidenceError).toBeNull()

    const { error: forceEvidenceError } = await client
      .from('public_zvz_force_battle_evidence')
      .insert([
        forceEvidenceRow(
          startDate,
          alphaAllianceId,
          battleIds[0],
          'Alpha Search Alliance',
          alphaGuildId,
          'Alpha Guild',
          30,
          8,
          3,
          1_000_000,
        ),
        forceEvidenceRow(
          startDate,
          betaAllianceId,
          battleIds[0],
          'Beta Search Alliance',
          betaGuildId,
          'Beta Guild',
          30,
          3,
          8,
          1_000_000,
        ),
        forceEvidenceRow(
          secondDate,
          alphaAllianceId,
          battleIds[1],
          'Alpha Search Alliance',
          alphaGuildId,
          'Alpha Guild',
          30,
          2,
          4,
          500_000,
        ),
        forceEvidenceRow(
          secondDate,
          betaAllianceId,
          battleIds[1],
          'Beta Search Alliance',
          betaGuildId,
          'Beta Guild',
          30,
          6,
          3,
          900_000,
        ),
      ])
    expect(forceEvidenceError).toBeNull()
  })

  afterEach(async () => {
    const client = getTestServiceClient()
    await client.from('zvz_seasons').delete().in('id', [seasonId, nextSeasonId])
    await client.from('battle_records').delete().in('id', battleIds)
  })

  it('preserves daily cumulative rankings, finality, and the next-season boundary', async () => {
    const client = getTestServiceClient()
    const refreshed = await client.rpc('refresh_guild_zvz_season_snapshots', {
      p_season_id: seasonId,
      p_through_date: utcDateOffset(5),
      p_force: false,
    })
    expect(refreshed.error).toBeNull()
    expect(refreshed.data).toMatchObject({
      season_id: seasonId,
      status: 'refreshed',
      through_date: utcDateOffset(0),
    })

    const { data: snapshots, error: snapshotError } = await client
      .from('zvz_season_snapshots')
      .select('snapshot_date, is_final')
      .eq('season_id', seasonId)
      .order('snapshot_date', { ascending: true })
    expect(snapshotError).toBeNull()
    expect(snapshots).toHaveLength(6)
    expect(snapshots?.[0]).toEqual({
      snapshot_date: startDate,
      is_final: true,
    })
    expect(snapshots?.at(-1)).toEqual({
      snapshot_date: utcDateOffset(0),
      is_final: false,
    })

    const { data: firstDay, error: firstDayError } = await client
      .from('guild_season_zvz_rollups')
      .select('guild_albion_id, zvz_battles, rank, sample_status')
      .eq('season_id', seasonId)
      .eq('snapshot_date', startDate)
      .order('rank', { ascending: true })
    expect(firstDayError).toBeNull()
    expect(firstDay).toEqual([
      {
        guild_albion_id: alphaGuildId,
        zvz_battles: 1,
        rank: 1,
        sample_status: 'insufficient_sample',
      },
      {
        guild_albion_id: betaGuildId,
        zvz_battles: 1,
        rank: 2,
        sample_status: 'insufficient_sample',
      },
    ])

    const { data: cumulative, error: cumulativeError } = await client
      .from('guild_season_zvz_rollups')
      .select('guild_albion_id, zvz_battles, rank, sample_status, score')
      .eq('season_id', seasonId)
      .eq('snapshot_date', secondDate)
      .order('rank', { ascending: true })
    expect(cumulativeError).toBeNull()
    expect(
      cumulative?.map((row) => ({
        ...row,
        score: Number(row.score),
      })),
    ).toEqual([
      {
        guild_albion_id: alphaGuildId,
        zvz_battles: 2,
        rank: 1,
        sample_status: 'ranked',
        score: 134,
      },
      {
        guild_albion_id: betaGuildId,
        zvz_battles: 2,
        rank: 2,
        sample_status: 'ranked',
        score: 124.8,
      },
    ])

    const { data: pairedHistory, error: pairedHistoryError } = await client
      .from('guild_season_zvz_rollups')
      .select('snapshot_date, guild_albion_id')
      .or(
        `and(season_id.eq.${seasonId},snapshot_date.eq.${startDate}),` +
          `and(season_id.eq.${seasonId},snapshot_date.eq.${secondDate})`,
      )
    expect(pairedHistoryError).toBeNull()
    expect(pairedHistory).toHaveLength(4)

    const { error: correctionError } = await client
      .from('guild_weekly_zvz_battle_evidence')
      .update({ kills: 99 })
      .eq('battle_record_id', battleIds[0])
      .eq('guild_albion_id', alphaGuildId)
    expect(correctionError).toBeNull()

    const automaticRefresh = await client.rpc('refresh_guild_zvz_season_snapshots', {
      p_season_id: seasonId,
      p_through_date: utcDateOffset(0),
      p_force: false,
    })
    expect(automaticRefresh.error).toBeNull()
    const { data: frozenEvidence, error: frozenEvidenceError } = await client
      .from('guild_season_zvz_battle_evidence')
      .select('kills')
      .eq('season_id', seasonId)
      .eq('evidence_date', startDate)
      .eq('guild_albion_id', alphaGuildId)
      .single()
    expect(frozenEvidenceError).toBeNull()
    expect(frozenEvidence?.kills).toBe(8)
  })

  it('finds guild and alliance records in the selected historical snapshot', async () => {
    const client = getTestServiceClient()
    const refreshed = await client.rpc('refresh_guild_zvz_season_snapshots', {
      p_season_id: seasonId,
      p_through_date: secondDate,
      p_force: true,
    })
    expect(refreshed.error).toBeNull()

    for (const [index, battleRecordId] of battleIds.entries()) {
      const sourceHash = String(index + 1).repeat(64)
      const projected = await client.rpc('replace_public_zvz_battle_projection', {
        p_battle_record_id: battleRecordId,
        p_source_hash: sourceHash,
        p_coverage: 'complete',
        p_is_candidate: true,
        p_observed_event_count: 8,
        p_expected_event_count: 8,
        p_engagements: [v2AlphaEngagement({
          date: index === 0 ? startDate : secondDate,
          sequence: index + 1,
          keyCharacter: index === 0 ? 'a' : 'b',
        })],
      })
      expect(projected.error).toBeNull()
    }
    const v2Refreshed = await client.rpc('refresh_public_zvz_v2_season_snapshots', {
      p_season_id: seasonId,
      p_through_date: secondDate,
      p_force: true,
    })
    expect(v2Refreshed.error).toBeNull()

    const guildSearch = await client.rpc('search_public_zvz_entities', {
      p_query: 'alpha guild',
      p_albion_server: 'west',
      p_season_id: seasonId,
      p_as_of_date: secondDate,
      p_limit: 12,
    })
    expect(guildSearch.error).toBeNull()
    expect(guildSearch.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          period_kind: 'season',
          season_id: seasonId,
          snapshot_date: secondDate,
          entity_kind: 'guild',
          albion_id: alphaGuildId,
          entity_name: 'Alpha Guild',
          alliance_name: 'Alpha Search Alliance',
          battle_count: 2,
        }),
      ]),
    )

    const allianceSearch = await client.rpc('search_public_zvz_entities', {
      p_query: 'alpha search',
      p_albion_server: 'west',
      p_season_id: seasonId,
      p_as_of_date: secondDate,
      p_limit: 12,
    })
    expect(allianceSearch.error).toBeNull()
    expect(allianceSearch.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          period_kind: 'season',
          season_id: seasonId,
          snapshot_date: secondDate,
          entity_kind: 'alliance',
          albion_id: alphaAllianceId,
          entity_name: 'Alpha Search Alliance',
          battle_count: 2,
          related_guild_count: 2,
        }),
      ]),
    )
  })
})

describeRls('public ZvZ season service boundary (migration 360)', () => {
  it('allows service reads while denying anonymous and authenticated clients', async () => {
    const env = getValidatedTestSupabaseEnv()
    expect(env).not.toBeNull()
    if (!env) return

    const service = getTestServiceClient()
    const anonymous = createClient(env.url, anonKey, {
      auth: { persistSession: false },
    })
    const authenticated = createClient(env.url, anonKey, {
      auth: { persistSession: false },
    })
    const email = `zvz-season-rls-${crypto.randomUUID()}@example.test`
    const password = `Rls-${crypto.randomUUID()}-Aa1!`
    const created = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    expect(created.error).toBeNull()

    try {
      const signIn = await authenticated.auth.signInWithPassword({
        email,
        password,
      })
      expect(signIn.error).toBeNull()

      for (const table of [
        'zvz_seasons',
        'zvz_season_snapshots',
        'guild_season_zvz_rollups',
        'guild_season_zvz_battle_evidence',
        'public_zvz_force_battle_evidence',
      ]) {
        const serviceRead = await service.from(table).select('*').limit(1)
        expect(serviceRead.error, table).toBeNull()

        const anonRead = await anonymous.from(table).select('*').limit(1)
        expect(anonRead.error?.code, table).toBe('42501')

        const authenticatedRead = await authenticated.from(table).select('*').limit(1)
        expect(authenticatedRead.error?.code, table).toBe('42501')
      }

      const [anonRpc, authenticatedRpc] = await Promise.all([
        anonymous.rpc('refresh_current_guild_zvz_season_snapshots'),
        authenticated.rpc('refresh_current_guild_zvz_season_snapshots'),
      ])
      expect(anonRpc.error?.code).toBe('42501')
      expect(authenticatedRpc.error?.code).toBe('42501')

      const [anonSearch, authenticatedSearch] = await Promise.all([
        anonymous.rpc('search_public_zvz_entities', {
          p_query: 'alpha',
          p_albion_server: 'west',
          p_season_id: null,
          p_as_of_date: null,
          p_limit: 12,
        }),
        authenticated.rpc('search_public_zvz_entities', {
          p_query: 'alpha',
          p_albion_server: 'west',
          p_season_id: null,
          p_as_of_date: null,
          p_limit: 12,
        }),
      ])
      expect(anonSearch.error?.code).toBe('42501')
      expect(authenticatedSearch.error?.code).toBe('42501')
    } finally {
      if (created.data.user) {
        await service.auth.admin.deleteUser(created.data.user.id)
      }
    }
  })
})

function evidenceRow(
  date: string,
  guildId: string,
  battleRecordId: string,
  guildName: string,
  allianceId: string,
  allianceName: string,
  teamSize: number,
  kills: number,
  deaths: number,
  killFame: number,
) {
  return {
    week_start: startOfUtcWeek(date),
    albion_server: 'west',
    guild_albion_id: guildId,
    battle_record_id: battleRecordId,
    battle_started_at: atUtcNoon(date),
    guild_name: guildName,
    alliance_albion_id: allianceId,
    alliance_name: allianceName,
    team_size: teamSize,
    kills,
    deaths,
    kill_fame: killFame,
    qualification_version: 'agm_zvz_v1',
  }
}

function forceEvidenceRow(
  date: string,
  allianceId: string,
  battleRecordId: string,
  allianceName: string,
  guildId: string,
  guildName: string,
  teamSize: number,
  kills: number,
  deaths: number,
  killFame: number,
) {
  return {
    week_start: startOfUtcWeek(date),
    albion_server: 'west',
    battle_record_id: battleRecordId,
    battle_started_at: atUtcNoon(date),
    force_key: `a:${allianceId}`,
    force_kind: 'alliance',
    force_name: allianceName,
    alliance_albion_id: allianceId,
    alliance_name: allianceName,
    guild_ids: [guildId],
    guild_names: [guildName],
    team_size: teamSize,
    kills,
    deaths,
    kill_fame: killFame,
    qualification_version: 'agm_zvz_v2_20plus',
  }
}

function startOfUtcWeek(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`)
  const day = date.getUTCDay()
  date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1))
  return date.toISOString().slice(0, 10)
}
