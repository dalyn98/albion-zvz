import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AlbionBattle, AlbionBattlePlayer } from './albion-battles'
import {
  buildBattleEngagementProjection,
  hashBattleEngagementSource,
  type BattleEngagementEventEvidence,
} from './battle-engagements'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'
import {
  fetchTrackedBattleWindows,
  isWithinTrackedWindow,
} from './tracked-kills'

const describeIntegration = hasTestEnv() ? describe : describe.skip
const STARTED_AT = '2026-07-24T00:00:00.000Z'
const ENDED_AT = '2026-07-24T00:30:00.000Z'

describeIntegration('battle engagement projection DB invariants (mig 282/283)', () => {
  let tenant: TestTenant
  let battleRecordId: string | null
  let homeGuildId: string
  let enemyGuildId: string
  let albionBattleId: number
  let eventIdBase: number
  let battle: AlbionBattle
  let projection: ReturnType<typeof buildBattleEngagementProjection>

  beforeEach(async () => {
    tenant = await createTestTenant('battle-engagement')
    battleRecordId = null
    homeGuildId = crypto.randomUUID()
    enemyGuildId = crypto.randomUUID()
    const numericSeed = Date.now() * 1000 + Math.floor(Math.random() * 500)
    albionBattleId = numericSeed
    eventIdBase = numericSeed + 100
    battle = makeBattle({
      battleId: albionBattleId,
      homeGuildId,
      enemyGuildId,
    })
    const sourceHash = hashBattleEngagementSource(battle)
    const client = getTestServiceClient()

    const { error: settingError } = await client.from('app_settings').insert({
      guild_id: tenant.guildId,
      key: 'albion_home_guild_id',
      value: homeGuildId,
    })
    expect(settingError).toBeNull()

    const { data: battleRecord, error: battleError } = await client
      .from('battle_records')
      .insert({
        albion_server: 'west',
        albion_battle_id: albionBattleId,
        started_at: STARTED_AT,
        ended_at: ENDED_AT,
        total_players: 50,
        total_kills: 5,
        total_fame: 5_000,
        cluster_name: 'Integration Cluster',
        involved_guild_ids: [homeGuildId, enemyGuildId],
        involved_alliance_ids: [],
        raw_battle: battle,
        engagement_source_hash: sourceHash,
      })
      .select('id')
      .single()
    expect(battleError).toBeNull()
    battleRecordId = battleRecord?.id ?? null
    expect(battleRecordId).not.toBeNull()

    const { error: legacyError } = await client
      .from('tenant_battle_records')
      .insert({
        guild_id: tenant.guildId,
        battle_record_id: battleRecordId,
        home_guild_id: homeGuildId,
        home_guild_name: 'Home',
        home_team_size: 25,
        home_kills: 3,
        home_deaths: 2,
        home_kill_fame: 3_000,
        opponent_team_size: 25,
        opponent_kills: 2,
        opponent_deaths: 3,
        opponent_kill_fame: 2_000,
        opponent_guild_names: ['Enemy'],
        opponent_alliance_names: [],
        primary_opponent_name: 'Enemy',
        size_category: 'small',
        outcome: 'loss',
        started_at: STARTED_AT,
        main_opponent_force_key: `g:${enemyGuildId}`,
        main_opponent_force_kind: 'guild',
        main_opponent_force_name: 'Enemy',
        main_opponent_team_size: 25,
        main_opponent_kills: 2,
        main_opponent_deaths: 3,
        main_opponent_kill_fame: 2_000,
        is_provisional: false,
      })
    expect(legacyError).toBeNull()

    const evidence = makeEvidence({
      battleId: albionBattleId,
      eventIdBase,
      homeGuildId,
      enemyGuildId,
    })
    const { error: killboardError } = await client.from('killboard_events').insert(
      evidence.map((event, index) => ({
        guild_id: tenant.guildId,
        event_id: event.eventId,
        role: event.role,
        discord_id: null,
        albion_player_id: event.sourcePlayerId,
        player_name: `Home Player ${index}`,
        opponent_name: `Enemy Player ${index}`,
        opponent_guild: 'Enemy',
        opponent_alliance: null,
        fame: event.fame,
        fame_is_observed: true,
        occurred_at: event.occurredAt,
        battle_id: albionBattleId,
        source_guild_id: homeGuildId,
        source_alliance_id: null,
        opponent_guild_id: enemyGuildId,
        opponent_alliance_id: null,
      })),
    )
    expect(killboardError).toBeNull()

    projection = buildBattleEngagementProjection({
      battle,
      homeGuildId,
      events: evidence,
      sourceObservationCount: 2,
      evaluatedAt: '2026-07-24T01:00:00.000Z',
    })
    expect(projection.state).toBe('ready')
    expect(projection.engagements).toHaveLength(1)
    expect(projection.engagements[0]?.result).toBe('advantage')
  })

  afterEach(async () => {
    const client = getTestServiceClient()
    if (battleRecordId) {
      await client.from('battle_records').delete().eq('id', battleRecordId)
    }
    await tenant?.cleanup()
  })

  it('counts a retry token once and requires a distinct second observation', async () => {
    const client = getTestServiceClient()
    const firstToken = crypto.randomUUID()
    const args = {
      p_battle_record_id: battleRecordId,
      p_source_hash: projection.sourceHash,
      p_observed_at: '2026-07-24T01:00:00.000Z',
      p_observation_token: firstToken,
    }

    const first = await client.rpc('observe_battle_engagement_source', args)
    const duplicate = await client.rpc('observe_battle_engagement_source', args)
    const second = await client.rpc('observe_battle_engagement_source', {
      ...args,
      p_observed_at: '2026-07-24T01:05:00.000Z',
      p_observation_token: crypto.randomUUID(),
    })

    expect(first.error).toBeNull()
    expect(first.data?.[0]?.consecutive_observations).toBe(1)
    expect(duplicate.error).toBeNull()
    expect(duplicate.data?.[0]?.consecutive_observations).toBe(1)
    expect(second.error).toBeNull()
    expect(second.data?.[0]?.consecutive_observations).toBe(2)
  })

  it('publishes atomically and replaces the legacy loss with one official win', async () => {
    await observeTwice()
    const client = getTestServiceClient()
    const published = await client.rpc('publish_battle_engagement_projection', {
      p_guild_id: tenant.guildId,
      p_battle_record_id: battleRecordId,
      p_home_guild_id: homeGuildId,
      p_source_hash: projection.sourceHash,
      p_projection: projection,
    })
    expect(published.error).toBeNull()

    const engagementView = await client
      .from('guild_battle_engagements')
      .select('engagement_id, run_state, status, result')
      .eq('tenant_id', tenant.guildId)
    expect(engagementView.error).toBeNull()
    expect(engagementView.data).toEqual([
      expect.objectContaining({
        run_state: 'ready',
        status: 'final',
        result: 'advantage',
      }),
    ])

    const { data: units, error: unitsError } = await client
      .from('guild_battle_stat_units')
      .select('stat_unit_id, outcome, home_kills, home_deaths, is_engagement')
      .eq('guild_id', tenant.guildId)
    expect(unitsError).toBeNull()
    expect(units).toEqual([
      expect.objectContaining({
        outcome: 'win',
        home_kills: 3,
        home_deaths: 2,
        is_engagement: true,
      }),
    ])

    const { count: eventCount, error: eventError } = await client
      .from('guild_battle_stat_events')
      .select('*', { count: 'exact', head: true })
      .eq('guild_id', tenant.guildId)
    expect(eventError).toBeNull()
    expect(eventCount).toBe(5)

    const tracked = await fetchTrackedBattleWindows(client, tenant.guildId)
    expect(
      isWithinTrackedWindow(
        STARTED_AT,
        albionBattleId,
        tracked,
        eventIdBase,
        'killer',
      ),
    ).toBe(true)
    expect(
      isWithinTrackedWindow(
        STARTED_AT,
        albionBattleId,
        tracked,
        eventIdBase + 99,
        'killer',
      ),
    ).toBe(false)

    const rollup = await client.rpc('guild_battle_rollup', {
      p_guild_id: tenant.guildId,
      p_since: null,
      p_bundle_splits: true,
    })
    expect(rollup.error).toBeNull()
    expect(rollup.data?.[0]).toMatchObject({
      battle_count: 1,
      win_count: 1,
      loss_count: 0,
      total_kills: 3,
      total_deaths: 2,
    })
  })

  it('keeps the last good children when a replacement projection is invalid', async () => {
    await observeTwice()
    const client = getTestServiceClient()
    const firstPublish = await client.rpc('publish_battle_engagement_projection', {
      p_guild_id: tenant.guildId,
      p_battle_record_id: battleRecordId,
      p_home_guild_id: homeGuildId,
      p_source_hash: projection.sourceHash,
      p_projection: projection,
    })
    expect(firstPublish.error).toBeNull()

    const before = await client
      .from('battle_engagements')
      .select('id, result')
      .eq('guild_id', tenant.guildId)
      .single()
    expect(before.error).toBeNull()

    const invalidProjection = {
      ...projection,
      engagements: projection.engagements.map((engagement) => ({
        ...engagement,
        status: 'pending',
        result: null,
      })),
    }
    const rejected = await client.rpc('publish_battle_engagement_projection', {
      p_guild_id: tenant.guildId,
      p_battle_record_id: battleRecordId,
      p_home_guild_id: homeGuildId,
      p_source_hash: projection.sourceHash,
      p_projection: invalidProjection,
    })
    expect(rejected.error).not.toBeNull()

    const after = await client
      .from('battle_engagements')
      .select('id, result')
      .eq('guild_id', tenant.guildId)
      .single()
    expect(after.error).toBeNull()
    expect(after.data).toEqual(before.data)
  })

  it('rejects raw K/D tampering before replacing the last good projection', async () => {
    await observeTwice()
    const client = getTestServiceClient()
    const firstPublish = await client.rpc('publish_battle_engagement_projection', {
      p_guild_id: tenant.guildId,
      p_battle_record_id: battleRecordId,
      p_home_guild_id: homeGuildId,
      p_source_hash: projection.sourceHash,
      p_projection: projection,
    })
    expect(firstPublish.error).toBeNull()

    const before = await client
      .from('battle_engagements')
      .select('id, result, home_kills, home_deaths')
      .eq('guild_id', tenant.guildId)
      .single()
    expect(before.error).toBeNull()

    const rejected = await client.rpc('publish_battle_engagement_projection', {
      p_guild_id: tenant.guildId,
      p_battle_record_id: battleRecordId,
      p_home_guild_id: homeGuildId,
      p_source_hash: projection.sourceHash,
      p_projection: {
        ...projection,
        rawHomeKills: projection.rawHomeKills + 1,
      },
    })
    expect(rejected.error?.message).toContain(
      'BATTLE_ENGAGEMENT_RAW_TOTAL_MISMATCH',
    )

    const after = await client
      .from('battle_engagements')
      .select('id, result, home_kills, home_deaths')
      .eq('guild_id', tenant.guildId)
      .single()
    expect(after.error).toBeNull()
    expect(after.data).toEqual(before.data)
  })

  it('rejects derived total tampering and rolls the child replacement back', async () => {
    await observeTwice()
    const client = getTestServiceClient()
    const firstPublish = await client.rpc('publish_battle_engagement_projection', {
      p_guild_id: tenant.guildId,
      p_battle_record_id: battleRecordId,
      p_home_guild_id: homeGuildId,
      p_source_hash: projection.sourceHash,
      p_projection: projection,
    })
    expect(firstPublish.error).toBeNull()

    const before = await client
      .from('battle_engagements')
      .select('id, result, home_kill_fame')
      .eq('guild_id', tenant.guildId)
      .single()
    expect(before.error).toBeNull()

    const rejected = await client.rpc('publish_battle_engagement_projection', {
      p_guild_id: tenant.guildId,
      p_battle_record_id: battleRecordId,
      p_home_guild_id: homeGuildId,
      p_source_hash: projection.sourceHash,
      p_projection: {
        ...projection,
        engagements: projection.engagements.map((engagement) => ({
          ...engagement,
          homeKillFame: engagement.homeKillFame + 1,
        })),
      },
    })
    expect(rejected.error?.message).toContain('BATTLE_ENGAGEMENT_TOTAL_MISMATCH')

    const after = await client
      .from('battle_engagements')
      .select('id, result, home_kill_fame')
      .eq('guild_id', tenant.guildId)
      .single()
    expect(after.error).toBeNull()
    expect(after.data).toEqual(before.data)
  })

  it('does not accept an unobserved fame value as official result evidence', async () => {
    await observeTwice()
    const client = getTestServiceClient()
    const { error: updateError } = await client
      .from('killboard_events')
      .update({ fame_is_observed: false })
      .eq('guild_id', tenant.guildId)
      .eq('event_id', eventIdBase)
      .eq('role', 'killer')
    expect(updateError).toBeNull()

    const rejected = await client.rpc('publish_battle_engagement_projection', {
      p_guild_id: tenant.guildId,
      p_battle_record_id: battleRecordId,
      p_home_guild_id: homeGuildId,
      p_source_hash: projection.sourceHash,
      p_projection: projection,
    })
    expect(rejected.error?.message).toContain(
      'BATTLE_ENGAGEMENT_EVENT_SOURCE_MISMATCH',
    )
  })

  it('recomputes the 20% judgment instead of trusting a supplied result', async () => {
    await observeTwice()
    const client = getTestServiceClient()
    const rejected = await client.rpc('publish_battle_engagement_projection', {
      p_guild_id: tenant.guildId,
      p_battle_record_id: battleRecordId,
      p_home_guild_id: homeGuildId,
      p_source_hash: projection.sourceHash,
      p_projection: {
        ...projection,
        engagements: projection.engagements.map((engagement) => ({
          ...engagement,
          result: 'even',
        })),
      },
    })

    expect(rejected.error?.message).toContain(
      'BATTLE_ENGAGEMENT_RESULT_MISMATCH',
    )
  })

  it('recomputes opponent team size instead of trusting matchup payloads', async () => {
    await observeTwice()
    const client = getTestServiceClient()
    const rejected = await client.rpc('publish_battle_engagement_projection', {
      p_guild_id: tenant.guildId,
      p_battle_record_id: battleRecordId,
      p_home_guild_id: homeGuildId,
      p_source_hash: projection.sourceHash,
      p_projection: {
        ...projection,
        engagements: projection.engagements.map((engagement) => ({
          ...engagement,
          matchups: engagement.matchups.map((matchup) => ({
            ...matchup,
            opponentTeamSize: matchup.opponentTeamSize + 1,
          })),
        })),
      },
    })

    expect(rejected.error?.message).toContain(
      'BATTLE_ENGAGEMENT_MATCHUP_MISMATCH',
    )
  })

  it('keeps official projection tables read-only outside the publisher RPC', async () => {
    const client = getTestServiceClient()
    const directInsert = await client.from('battle_engagement_runs').insert({
      guild_id: tenant.guildId,
      battle_record_id: battleRecordId,
      home_guild_id: homeGuildId,
      source_hash: projection.sourceHash,
      source_observation_count: 1,
      state: 'collecting',
      reason: 'source_not_stable',
      raw_home_kills: projection.rawHomeKills,
      raw_home_deaths: projection.rawHomeDeaths,
      collected_home_kills: 0,
      collected_home_deaths: 0,
      unidentified_event_count: 0,
      ignored_non_home_event_count: 0,
      evaluated_at: projection.evaluatedAt,
    })

    expect(directInsert.error?.code).toBe('42501')
  })

  it('hides the old result immediately when the raw source hash changes', async () => {
    await observeTwice()
    const client = getTestServiceClient()
    const published = await client.rpc('publish_battle_engagement_projection', {
      p_guild_id: tenant.guildId,
      p_battle_record_id: battleRecordId,
      p_home_guild_id: homeGuildId,
      p_source_hash: projection.sourceHash,
      p_projection: projection,
    })
    expect(published.error).toBeNull()

    const { error: updateError } = await client
      .from('battle_records')
      .update({ engagement_source_hash: 'f'.repeat(64) })
      .eq('id', battleRecordId)
    expect(updateError).toBeNull()

    const { count, error } = await client
      .from('guild_battle_stat_units')
      .select('*', { count: 'exact', head: true })
      .eq('guild_id', tenant.guildId)
    expect(error).toBeNull()
    expect(count).toBe(0)
  })

  async function observeTwice(): Promise<void> {
    const client = getTestServiceClient()
    for (const [index, observedAt] of [
      '2026-07-24T01:00:00.000Z',
      '2026-07-24T01:05:00.000Z',
    ].entries()) {
      const { error } = await client.rpc('observe_battle_engagement_source', {
        p_battle_record_id: battleRecordId,
        p_source_hash: projection.sourceHash,
        p_observed_at: observedAt,
        p_observation_token: crypto.randomUUID(),
      })
      expect(error, `observation ${index + 1}`).toBeNull()
    }
  }
})

function makeBattle(input: {
  battleId: number
  homeGuildId: string
  enemyGuildId: string
}): AlbionBattle {
  const players: Record<string, AlbionBattlePlayer> = {}
  for (let index = 0; index < 25; index += 1) {
    for (const [guildId, guildName] of [
      [input.homeGuildId, 'Home'],
      [input.enemyGuildId, 'Enemy'],
    ] as const) {
      const playerId = `${guildId}-player-${index}`
      players[playerId] = {
        id: playerId,
        name: playerId,
        kills: 0,
        deaths: 0,
        killFame: 0,
        guildId,
        guildName,
        allianceId: null,
        allianceName: null,
      }
    }
  }
  return {
    id: input.battleId,
    startTime: STARTED_AT,
    endTime: ENDED_AT,
    totalFame: 5_000,
    totalKills: 5,
    clusterName: 'Integration Cluster',
    players,
    guilds: {
      [input.homeGuildId]: {
        id: input.homeGuildId,
        name: 'Home',
        kills: 3,
        deaths: 2,
        killFame: 3_000,
        allianceId: '',
        alliance: '',
      },
      [input.enemyGuildId]: {
        id: input.enemyGuildId,
        name: 'Enemy',
        kills: 2,
        deaths: 3,
        killFame: 2_000,
        allianceId: '',
        alliance: '',
      },
    },
    alliances: {},
  }
}

function makeEvidence(input: {
  battleId: number
  eventIdBase: number
  homeGuildId: string
  enemyGuildId: string
}): BattleEngagementEventEvidence[] {
  return Array.from({ length: 5 }, (_, index) => {
    const role = index < 3 ? 'killer' : 'victim'
    return {
      eventId: String(input.eventIdBase + index),
      battleId: input.battleId,
      role,
      sourcePlayerId: `${input.homeGuildId}-player-${index}`,
      sourceGuildId: input.homeGuildId,
      sourceAllianceId: null,
      opponentGuildId: input.enemyGuildId,
      opponentGuildName: 'Enemy',
      opponentAllianceId: null,
      opponentAllianceName: null,
      fame: 1_000,
      fameIsObserved: true,
      occurredAt: new Date(Date.parse(STARTED_AT) + (index + 1) * 1_000).toISOString(),
    }
  })
}
