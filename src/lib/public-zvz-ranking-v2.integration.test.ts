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

describeIntegration('public ZvZ ranking DB invariants (migrations 372-390)', () => {
  const seasonId = crypto.randomUUID()
  const battleRecordId = crypto.randomUUID()
  const guildId = crypto.randomUUID()
  const supportGuildId = crypto.randomUUID()
  const allianceId = crypto.randomUUID()
  const sourceHash = 'a'.repeat(64)
  const startDate = utcDateOffset(-2)
  const today = utcDateOffset(0)

  function engagement(input: {
    keyCharacter: string
    sequence: number
    hour: number
    sideSize: number
    opponentSideSize?: number
    ownSize: number
    scale: 'small' | 'mid' | 'large' | 'zerg'
    share: number
  }) {
    const opponentSideSize = input.opponentSideSize ?? input.sideSize
    return {
      engagementKey: input.keyCharacter.repeat(64),
      sequence: input.sequence,
      startedAt: `${startDate}T${String(input.hour).padStart(2, '0')}:00:00.000Z`,
      endedAt: `${startDate}T${String(input.hour).padStart(2, '0')}:10:00.000Z`,
      status: 'final',
      result: 'advantage',
      homeForceKey: `a:${allianceId}`,
      homeForceKind: 'alliance',
      homeForceAlbionId: allianceId,
      homeForceName: 'V2 Alliance',
      homeAllianceId: allianceId,
      homeAllianceName: 'V2 Alliance',
      homeSideTeamSize: input.sideSize,
      opponentSideTeamSize: opponentSideSize,
      scale: input.scale,
      homeKills: 5,
      homeDeaths: 2,
      homeKillFame: 1_000_000,
      opponentKillFame: 400_000,
      resultEventCount: 7,
      interventionEventCount: 0,
      eventIds: Array.from({ length: 7 }, (_, index) => `${input.sequence}-${index}`),
      matchups: [{
        opponentForceKey: `g:opponent-${input.sequence}`,
        opponentForceKind: 'guild',
        opponentAlbionId: `opponent-${input.sequence}`,
        opponentName: `Opponent ${input.sequence}`,
        opponentAllianceId: null,
        opponentTeamSize: opponentSideSize,
        role: 'result_eligible',
        eventCount: 7,
        homeKills: 5,
        homeDeaths: 2,
        homeKillFame: 1_000_000,
        opponentKillFame: 400_000,
      }],
      evidence: [
        {
          entityKind: 'alliance',
          entityAlbionId: allianceId,
          entityName: 'V2 Alliance',
          allianceAlbionId: allianceId,
          allianceName: 'V2 Alliance',
          ownTeamSize: input.sideSize,
          sideTeamSize: input.sideSize,
          participationShare: 1,
          battleCredit: 1,
          battlePoints: 25,
          kills: 5,
          deaths: 2,
          killFame: 1_000_000,
          participationKind: 'joint_sortie',
        },
        {
          entityKind: 'guild',
          entityAlbionId: guildId,
          entityName: 'V2 Guild',
          allianceAlbionId: allianceId,
          allianceName: 'V2 Alliance',
          ownTeamSize: input.ownSize,
          sideTeamSize: input.sideSize,
          participationShare: input.share,
          battleCredit: input.share,
          battlePoints: input.share * 25,
          kills: 2,
          deaths: 1,
          killFame: 400_000,
          participationKind: 'joint_sortie',
        },
        {
          entityKind: 'guild',
          entityAlbionId: supportGuildId,
          entityName: 'V2 Support Guild',
          allianceAlbionId: allianceId,
          allianceName: 'V2 Alliance',
          ownTeamSize: 1,
          sideTeamSize: input.sideSize,
          participationShare: 1 / input.sideSize,
          battleCredit: 1 / input.sideSize,
          battlePoints: 25 / input.sideSize,
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
    await client.from('zvz_seasons').delete().eq('id', seasonId)
    await client.from('battle_records').delete().eq('id', battleRecordId)
    const seed = Date.now() * 10
    const { error: battleError } = await client.from('battle_records').insert({
      id: battleRecordId,
      albion_server: 'west',
      albion_battle_id: seed,
      started_at: `${startDate}T12:00:00.000Z`,
      ended_at: `${startDate}T16:00:00.000Z`,
      total_players: 200,
      total_kills: 14,
      total_fame: 2_800_000,
      cluster_name: null,
      involved_guild_ids: [guildId, supportGuildId],
      involved_alliance_ids: [allianceId],
      raw_battle: {},
      engagement_source_hash: sourceHash,
    })
    expect(battleError).toBeNull()
    const { error: seasonError } = await client.from('zvz_seasons').insert({
      id: seasonId,
      albion_server: 'west',
      name: `V2 Integration ${seasonId.slice(0, 8)}`,
      starts_on: startDate,
    })
    expect(seasonError).toBeNull()
  })

  afterEach(async () => {
    const client = getTestServiceClient()
    await client.from('zvz_seasons').delete().eq('id', seasonId)
    await client.from('battle_records').delete().eq('id', battleRecordId)
  })

  it('replaces projections atomically and builds separate overall/size rankings', async () => {
    const client = getTestServiceClient()
    const engagements = [
      engagement({
        keyCharacter: 'b',
        sequence: 1,
        hour: 13,
        sideSize: 100,
        ownSize: 5,
        scale: 'zerg',
        share: 0.05,
      }),
      engagement({
        keyCharacter: 'c',
        sequence: 2,
        hour: 15,
        sideSize: 40,
        ownSize: 20,
        scale: 'mid',
        share: 0.5,
      }),
    ].map((projected) => ({
      ...projected,
      evidence: projected.evidence.map((row) => ({
        ...row,
        averageItemPower: row.entityKind === 'alliance' ? 1600 : 1650,
        itemPowerSampleCount: row.ownTeamSize,
      })),
    }))
    const replaced = await client.rpc('replace_public_zvz_battle_projection', {
      p_battle_record_id: battleRecordId,
      p_source_hash: sourceHash,
      p_coverage: 'complete',
      p_is_candidate: true,
      p_observed_event_count: 14,
      p_expected_event_count: 14,
      p_engagements: engagements,
    })
    expect(replaced.error).toBeNull()
    expect(replaced.data).toMatchObject({ engagements: 2, evidence: 6 })
    const itemPower = await client.rpc('apply_public_zvz_battle_item_power', {
      p_battle_record_id: battleRecordId,
      p_source_hash: sourceHash,
      p_engagements: engagements,
    })
    expect(itemPower.error).toBeNull()
    expect(itemPower.data).toBe(6)

    const refreshed = await client.rpc('refresh_public_zvz_v2_season_snapshots', {
      p_season_id: seasonId,
      p_through_date: today,
      p_force: true,
    })
    expect(refreshed.error).toBeNull()

    const { data: overall, error: overallError } = await client
      .from('public_zvz_v2_season_rollups')
      .select(
        'entity_kind, entity_albion_id, scope, engagement_count, equivalent_battles, representative_size, battle_points, size_points, combat_points, efficiency_points, activity_points, average_item_power, item_power_sample_count, score, rank, sample_status, score_formula_version',
      )
      .eq('season_id', seasonId)
      .eq('snapshot_date', today)
      .eq('scope', 'overall')
      .order('entity_kind')
    expect(overallError).toBeNull()
    const normalized = overall?.map((row) => ({
      ...row,
      equivalent_battles: Number(row.equivalent_battles),
      representative_size: Number(row.representative_size),
      battle_points: Number(row.battle_points),
      size_points: Number(row.size_points),
      combat_points: Number(row.combat_points),
      efficiency_points: Number(row.efficiency_points),
      activity_points: Number(row.activity_points),
      average_item_power: row.average_item_power === null
        ? null
        : Number(row.average_item_power),
      score: Number(row.score),
    }))
    expect(normalized).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entity_kind: 'alliance',
        entity_albion_id: allianceId,
        engagement_count: 2,
        equivalent_battles: 2,
        representative_size: 70,
        battle_points: 50,
        size_points: 144.117647,
        average_item_power: 1600,
        item_power_sample_count: 140,
        score_formula_version: 'agm_zvz_v5',
        rank: 1,
        sample_status: 'ranked',
      }),
      expect.objectContaining({
        entity_kind: 'guild',
        entity_albion_id: guildId,
        engagement_count: 2,
        equivalent_battles: 0.55,
        representative_size: 12.5,
        battle_points: 13.75,
        size_points: 38.888889,
        average_item_power: 1650,
        item_power_sample_count: 25,
        score_formula_version: 'agm_zvz_v5',
        rank: 1,
        sample_status: 'ranked',
      }),
    ]))

    const { data: scoped, error: scopedError } = await client
      .from('public_zvz_v2_season_rollups')
      .select('entity_kind, scope, size_points, sample_status')
      .eq('season_id', seasonId)
      .eq('snapshot_date', today)
      .neq('scope', 'overall')
    expect(scopedError).toBeNull()
    expect(scoped?.every((row) => Number(row.size_points) === 0)).toBe(true)
    expect(scoped?.every((row) => row.sample_status === 'insufficient_sample')).toBe(true)
  })

  it('returns both guild and alliance ranks from entity search', async () => {
    const client = getTestServiceClient()
    await client.rpc('replace_public_zvz_battle_projection', {
      p_battle_record_id: battleRecordId,
      p_source_hash: sourceHash,
      p_coverage: 'complete',
      p_is_candidate: true,
      p_observed_event_count: 14,
      p_expected_event_count: 14,
      p_engagements: [
        engagement({ keyCharacter: 'b', sequence: 1, hour: 13, sideSize: 100, ownSize: 5, scale: 'zerg', share: 0.05 }),
        engagement({ keyCharacter: 'c', sequence: 2, hour: 15, sideSize: 40, ownSize: 20, scale: 'mid', share: 0.5 }),
      ],
    })
    await client.rpc('refresh_public_zvz_v2_season_snapshots', {
      p_season_id: seasonId,
      p_through_date: today,
      p_force: true,
    })
    const result = await client.rpc('search_public_zvz_entities', {
      p_query: 'V2',
      p_albion_server: 'west',
      p_season_id: seasonId,
      p_as_of_date: today,
      p_limit: 12,
    })
    expect(result.error).toBeNull()
    expect(result.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ entity_kind: 'guild', albion_id: guildId, rank: 1 }),
      expect.objectContaining({ entity_kind: 'alliance', albion_id: allianceId, rank: 1 }),
    ]))
  })

  it('keeps a stale single-guild sortie as a guild log without an alliance rank', async () => {
    const client = getTestServiceClient()
    const projected = engagement({
      keyCharacter: 'f',
      sequence: 1,
      hour: 13,
      sideSize: 30,
      ownSize: 30,
      scale: 'mid',
      share: 1,
    })
    projected.evidence = projected.evidence
      .filter((row) => row.entityAlbionId !== supportGuildId)
      .map((row) => ({
        ...row,
        participationKind: 'single_guild_sortie',
      }))

    const replaced = await client.rpc('replace_public_zvz_battle_projection', {
      p_battle_record_id: battleRecordId,
      p_source_hash: sourceHash,
      p_coverage: 'complete',
      p_is_candidate: true,
      p_observed_event_count: 7,
      p_expected_event_count: 7,
      p_engagements: [projected],
    })
    expect(replaced.error).toBeNull()

    const { data: engagements, error: engagementError } = await client
      .from('public_zvz_engagements')
      .select('id, home_force_kind, home_force_albion_id')
      .eq('battle_record_id', battleRecordId)
    expect(engagementError).toBeNull()
    expect(engagements).toHaveLength(1)

    const { data: evidence, error: evidenceError } = await client
      .from('public_zvz_entity_engagement_evidence')
      .select('entity_kind, entity_albion_id, participation_kind')
      .eq('engagement_id', engagements?.[0]?.id ?? '')
    expect(evidenceError).toBeNull()
    expect(evidence).toEqual([
      expect.objectContaining({
        entity_kind: 'guild',
        entity_albion_id: guildId,
        participation_kind: 'single_guild_sortie',
      }),
    ])

    const refreshed = await client.rpc('refresh_public_zvz_v2_season_snapshots', {
      p_season_id: seasonId,
      p_through_date: today,
      p_force: true,
    })
    expect(refreshed.error).toBeNull()

    const { data: rollups, error: rollupError } = await client
      .from('public_zvz_v2_season_rollups')
      .select('entity_kind, entity_albion_id')
      .eq('season_id', seasonId)
      .eq('snapshot_date', today)
      .eq('scope', 'overall')
    expect(rollupError).toBeNull()
    expect(rollups).toEqual([
      expect.objectContaining({
        entity_kind: 'guild',
        entity_albion_id: guildId,
      }),
    ])
  })

  it('keeps uneven fights overall but excludes them from scale rankings', async () => {
    const client = getTestServiceClient()
    const replaced = await client.rpc('replace_public_zvz_battle_projection', {
      p_battle_record_id: battleRecordId,
      p_source_hash: sourceHash,
      p_coverage: 'complete',
      p_is_candidate: true,
      p_observed_event_count: 14,
      p_expected_event_count: 14,
      p_engagements: [
        engagement({
          keyCharacter: 'd',
          sequence: 1,
          hour: 13,
          sideSize: 30,
          opponentSideSize: 40,
          ownSize: 15,
          scale: 'small',
          share: 0.5,
        }),
        engagement({
          keyCharacter: 'e',
          sequence: 2,
          hour: 15,
          sideSize: 30,
          opponentSideSize: 50,
          ownSize: 15,
          scale: 'small',
          share: 0.5,
        }),
      ],
    })
    expect(replaced.error).toBeNull()

    const refreshed = await client.rpc('refresh_public_zvz_v2_season_snapshots', {
      p_season_id: seasonId,
      p_through_date: today,
      p_force: true,
    })
    expect(refreshed.error).toBeNull()

    const { data: engagements, error: engagementError } = await client
      .from('public_zvz_engagements')
      .select('sequence, scale, qualification_version')
      .eq('battle_record_id', battleRecordId)
      .order('sequence')
    expect(engagementError).toBeNull()
    expect(engagements).toEqual([
      expect.objectContaining({
        sequence: 1,
        scale: 'mid',
        qualification_version: 'agm_zvz_v2_comp75',
      }),
      expect.objectContaining({
        sequence: 2,
        scale: 'large',
        qualification_version: 'agm_zvz_v2_comp75',
      }),
    ])

    const { data: rollups, error: rollupError } = await client
      .from('public_zvz_v2_season_rollups')
      .select('scope, engagement_count')
      .eq('season_id', seasonId)
      .eq('snapshot_date', today)
      .eq('entity_kind', 'alliance')
      .eq('entity_albion_id', allianceId)
      .order('scope')
    expect(rollupError).toBeNull()
    expect(rollups).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'overall', engagement_count: 2 }),
      expect.objectContaining({ scope: 'mid', engagement_count: 1 }),
    ]))
    expect(rollups?.some((row) => row.scope === 'large')).toBe(false)
  })

  it('invalidates both snapshot generations when a season boundary changes', async () => {
    const client = getTestServiceClient()
    const [legacyRefresh, v2Refresh] = await Promise.all([
      client.rpc('refresh_guild_zvz_season_snapshots', {
        p_season_id: seasonId,
        p_through_date: today,
        p_force: true,
      }),
      client.rpc('refresh_public_zvz_v2_season_snapshots', {
        p_season_id: seasonId,
        p_through_date: today,
        p_force: true,
      }),
    ])
    expect(legacyRefresh.error).toBeNull()
    expect(v2Refresh.error).toBeNull()

    const before = await Promise.all([
      client
        .from('zvz_season_snapshots')
        .select('*', { count: 'exact', head: true })
        .eq('season_id', seasonId),
      client
        .from('public_zvz_v2_season_snapshots')
        .select('*', { count: 'exact', head: true })
        .eq('season_id', seasonId),
    ])
    expect(before[0].count).toBeGreaterThan(0)
    expect(before[1].count).toBeGreaterThan(0)

    const { error: updateError } = await client
      .from('zvz_seasons')
      .update({ starts_on: utcDateOffset(-3) })
      .eq('id', seasonId)
    expect(updateError).toBeNull()

    const after = await Promise.all([
      client
        .from('zvz_season_snapshots')
        .select('*', { count: 'exact', head: true })
        .eq('season_id', seasonId),
      client
        .from('public_zvz_v2_season_snapshots')
        .select('*', { count: 'exact', head: true })
        .eq('season_id', seasonId),
    ])
    expect(after[0].count).toBe(0)
    expect(after[1].count).toBe(0)
  })

  it('uses the necessary 40-player floor as the fast DB backfill prefilter', async () => {
    const client = getTestServiceClient()
    const { error: belowFloorUpdateError } = await client
      .from('battle_records')
      .update({ total_players: 39 })
      .eq('id', battleRecordId)
    expect(belowFloorUpdateError).toBeNull()

    const belowFloor = await client.rpc(
      'list_public_zvz_projection_backfill_candidates',
      { p_limit: 100 },
    )
    expect(belowFloor.error).toBeNull()
    expect(belowFloor.data?.some(
      (row: { battle_record_id: string }) => row.battle_record_id === battleRecordId,
    )).toBe(false)

    const { error: updateError } = await client
      .from('battle_records')
      .update({ total_players: 40 })
      .eq('id', battleRecordId)
    expect(updateError).toBeNull()

    const officialFloor = await client.rpc(
      'list_public_zvz_projection_backfill_candidates',
      { p_limit: 100 },
    )
    expect(officialFloor.error).toBeNull()
    expect(officialFloor.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ battle_record_id: battleRecordId }),
    ]))
  })
})

describeRls('public ZvZ v2 service boundary', () => {
  it('denies anonymous table reads and projection mutation', async () => {
    const env = getValidatedTestSupabaseEnv()
    expect(env).not.toBeNull()
    if (!env) return
    const anonymous = createClient(env.url, anonKey, { auth: { persistSession: false } })
    for (const table of [
      'public_zvz_engagements',
      'public_zvz_entity_engagement_evidence',
      'public_zvz_v2_season_snapshots',
      'public_zvz_v2_season_rollups',
    ]) {
      const result = await anonymous.from(table).select('*').limit(1)
      expect(result.error?.code, table).toBe('42501')
    }
    const rpc = await anonymous.rpc('replace_public_zvz_battle_projection', {
      p_battle_record_id: crypto.randomUUID(),
      p_source_hash: 'a'.repeat(64),
      p_coverage: 'complete',
      p_is_candidate: false,
      p_observed_event_count: 0,
      p_expected_event_count: 0,
      p_engagements: [],
    })
    expect(rpc.error?.code).toBe('42501')
    const itemPowerRpc = await anonymous.rpc('apply_public_zvz_battle_item_power', {
      p_battle_record_id: crypto.randomUUID(),
      p_source_hash: 'a'.repeat(64),
      p_engagements: [],
    })
    expect(itemPowerRpc.error?.code).toBe('42501')
  })
})
