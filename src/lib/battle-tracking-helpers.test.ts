import { describe, expect, it } from 'vitest'
import {
  buildBattleForceEdgeRows,
  buildBattleForceSummaryRows,
  buildBattleRecordRow,
  buildFinalMatchupRows,
  buildLegacyBackfillRows,
  buildProvisionalTenantRow,
  shouldRetainProvisionalMatchup,
} from './battle-tracking-helpers'
import type {
  AlbionBattle,
  AlbionBattleAlliance,
  AlbionBattleGuild,
  AlbionBattlePlayer,
} from './albion-battles'
import { buildBattlePlayerSummaries } from './albion-battles'

// 도메인 invariant 화석화: AGENTS.md #8 — /battles 판정 규칙.
//   - 10명 미만 갱크 자동 제외 (home 또는 mainOpp < 10 → 행 없음)
//   - 한 battle 의 다중 alliance/force 는 상대별로 분리 매치업 row 생성
//   - K/D/Fame 은 force 별 killboard 페어 필터링 → 다른 force 와의 교전이 한 row 에 섞이지 않음
//
// build-* 헬퍼들은 cron route 와 server action 양쪽에서 호출되어 매치업 row 를 만드는
// 단일 진입점. 컷오프/분리 규칙이 어긋나면 마이그 098 (mainOpponent 모델) 회귀.

const HOME_GUILD = 'home-guild-id'

function makePlayer(overrides: Partial<AlbionBattlePlayer> & {
  guildId: string
  id?: string
}): AlbionBattlePlayer {
  return {
    name: 'player',
    kills: 0,
    deaths: 0,
    killFame: 0,
    guildName: '',
    allianceName: null,
    allianceId: null,
    id: overrides.id ?? `p-${Math.random().toString(36).slice(2, 8)}`,
    ...overrides,
  }
}

function makeGuild(overrides: Partial<AlbionBattleGuild> & { id: string; name: string }): AlbionBattleGuild {
  return {
    kills: 0,
    deaths: 0,
    killFame: 0,
    alliance: '',
    allianceId: '',
    ...overrides,
  }
}

function makeAlliance(overrides: Partial<AlbionBattleAlliance> & { id: string; name: string }): AlbionBattleAlliance {
  return {
    kills: 0,
    deaths: 0,
    killFame: 0,
    ...overrides,
  }
}

// teamSize 명의 플레이어를 길드에 채워넣는 helper. raw_battle.players 카운트가
// computeSides 의 teamSize 산출 근거라 인원 수를 맞춰 채워야 한다.
function addPlayers(
  players: Record<string, AlbionBattlePlayer>,
  guild: AlbionBattleGuild,
  count: number,
) {
  for (let i = 0; i < count; i++) {
    const id = `${guild.id}-p${i}`
    players[id] = makePlayer({
      guildId: guild.id,
      guildName: guild.name,
      allianceId: guild.allianceId || null,
      allianceName: guild.alliance || null,
      id,
    })
  }
}

interface GuildSpec {
  id: string
  name: string
  teamSize: number
  kills?: number
  deaths?: number
  killFame?: number
  allianceId?: string
  allianceName?: string
}

interface AllianceSpec {
  id: string
  name: string
}

function makeBattle(specs: {
  battleId?: number
  guilds: GuildSpec[]
  alliances?: AllianceSpec[]
  startTime?: string
  endTime?: string
}): AlbionBattle {
  const guilds: Record<string, AlbionBattleGuild> = {}
  const players: Record<string, AlbionBattlePlayer> = {}
  for (const g of specs.guilds) {
    const guild = makeGuild({
      id: g.id,
      name: g.name,
      kills: g.kills ?? 0,
      deaths: g.deaths ?? 0,
      killFame: g.killFame ?? 0,
      allianceId: g.allianceId ?? '',
      alliance: g.allianceName ?? '',
    })
    guilds[g.id] = guild
    addPlayers(players, guild, g.teamSize)
  }
  const alliances: Record<string, AlbionBattleAlliance> = {}
  for (const a of specs.alliances ?? []) {
    alliances[a.id] = makeAlliance({ id: a.id, name: a.name })
  }
  const totalKills = specs.guilds.reduce((s, g) => s + (g.kills ?? 0), 0)
  const totalFame = specs.guilds.reduce((s, g) => s + (g.killFame ?? 0), 0)
  return {
    id: specs.battleId ?? 1,
    startTime: specs.startTime ?? '2026-05-15T00:00:00Z',
    endTime: specs.endTime ?? '2026-05-15T00:15:00Z',
    totalFame,
    totalKills,
    clusterName: 'TestZone',
    players,
    guilds,
    alliances,
  }
}

describe('buildProvisionalTenantRow — 컷오프', () => {
  it('홈 길드 인원 < 10 → null (gank 컷)', () => {
    const battle = makeBattle({
      guilds: [
        { id: HOME_GUILD, name: 'Home', teamSize: 9 },
        { id: 'opp', name: 'Opp', teamSize: 30 },
      ],
    })
    expect(
      buildProvisionalTenantRow({
        guildId: 't1',
        battleRecordId: 'br1',
        battle,
        homeGuildId: HOME_GUILD,
        startedAt: battle.startTime,
      }),
    ).toBeNull()
  })

  it('가장 큰 상대 force < 10 → null (mainOpp 컷)', () => {
    const battle = makeBattle({
      guilds: [
        { id: HOME_GUILD, name: 'Home', teamSize: 30 },
        { id: 'opp', name: 'Opp', teamSize: 8 },
      ],
    })
    expect(
      buildProvisionalTenantRow({
        guildId: 't1',
        battleRecordId: 'br1',
        battle,
        homeGuildId: HOME_GUILD,
        startedAt: battle.startTime,
      }),
    ).toBeNull()
  })

  it('홈 길드가 battle 에 없음 → null', () => {
    const battle = makeBattle({
      guilds: [
        { id: 'other', name: 'Other', teamSize: 30 },
        { id: 'opp', name: 'Opp', teamSize: 30 },
      ],
    })
    expect(
      buildProvisionalTenantRow({
        guildId: 't1',
        battleRecordId: 'br1',
        battle,
        homeGuildId: HOME_GUILD,
        startedAt: battle.startTime,
      }),
    ).toBeNull()
  })

  it('양측 ≥10 → provisional row 생성 (is_provisional=true, force_kind=pending)', () => {
    const battle = makeBattle({
      guilds: [
        { id: HOME_GUILD, name: 'Home', teamSize: 25, kills: 5, deaths: 2, killFame: 1_000_000 },
        { id: 'opp', name: 'Opp', teamSize: 30, kills: 2, deaths: 5, killFame: 400_000 },
      ],
    })
    const row = buildProvisionalTenantRow({
      guildId: 't1',
      battleRecordId: 'br1',
      battle,
      homeGuildId: HOME_GUILD,
      startedAt: battle.startTime,
    })
    expect(row).not.toBeNull()
    expect(row?.is_provisional).toBe(true)
    expect(row?.main_opponent_force_kind).toBe('pending')
    expect(row?.main_opponent_force_key).toBe('__pending__')
    expect(row?.match_index).toBe(1)
    expect(row?.match_total).toBe(1)
    expect(row?.main_opponent_team_size).toBe(30)
    expect(row?.outcome).toBe('win')
  })

  it('카테고리는 max(home, mainOpp) 기반 — 25 vs 110 → zerg', () => {
    const battle = makeBattle({
      guilds: [
        { id: HOME_GUILD, name: 'Home', teamSize: 25 },
        { id: 'opp', name: 'Opp', teamSize: 110 },
      ],
    })
    const row = buildProvisionalTenantRow({
      guildId: 't1',
      battleRecordId: 'br1',
      battle,
      homeGuildId: HOME_GUILD,
      startedAt: battle.startTime,
    })
    expect(row?.size_category).toBe('zerg')
  })
})

describe('shouldRetainProvisionalMatchup — delayed killboard grace', () => {
  it('keeps a provisional battle while killboard pairs may still arrive', () => {
    expect(shouldRetainProvisionalMatchup({
      battleEndedAt: '2026-07-17T06:43:35Z',
      evaluatedAt: '2026-07-17T11:43:34Z',
      killboardPairCount: 0,
    })).toBe(true)
  })

  it('allows finalization as soon as a killboard pair arrives', () => {
    expect(shouldRetainProvisionalMatchup({
      battleEndedAt: '2026-07-17T06:43:35Z',
      evaluatedAt: '2026-07-17T06:55:00Z',
      killboardPairCount: 1,
    })).toBe(false)
  })

  it('allows cleanup after the grace period expires without pairs', () => {
    expect(shouldRetainProvisionalMatchup({
      battleEndedAt: '2026-07-17T06:43:35Z',
      evaluatedAt: '2026-07-17T12:43:35Z',
      killboardPairCount: 0,
    })).toBe(false)
  })

  it('keeps malformed timestamps instead of deleting the only projection', () => {
    expect(shouldRetainProvisionalMatchup({
      battleEndedAt: 'invalid',
      evaluatedAt: '2026-07-17T12:43:35Z',
      killboardPairCount: 0,
    })).toBe(true)
  })
})

describe('battle force summaries / edges — shared battle cache', () => {
  it('guild level 과 alliance level force summary 를 둘 다 만든다', () => {
    const battle = makeBattle({
      alliances: [
        { id: 'A1', name: 'Ally-A' },
        { id: 'B1', name: 'Ally-B' },
      ],
      guilds: [
        { id: HOME_GUILD, name: 'Home', teamSize: 12, allianceId: 'A1', allianceName: 'Ally-A', kills: 3, deaths: 2, killFame: 500_000 },
        { id: 'home-ally', name: 'HomeAlly', teamSize: 8, allianceId: 'A1', allianceName: 'Ally-A', kills: 1, deaths: 1, killFame: 100_000 },
        { id: 'opp', name: 'Opp', teamSize: 15, allianceId: 'B1', allianceName: 'Ally-B', kills: 2, deaths: 4, killFame: 300_000 },
      ],
    })

    const rows = buildBattleForceSummaryRows('br1', battle)

    const allyA = rows.find((r) => r.force_level === 'alliance' && r.force_key === 'a:A1')
    expect(allyA).toMatchObject({
      battle_record_id: 'br1',
      force_kind: 'alliance',
      force_name: 'Ally-A',
      team_size: 20,
      kills: 4,
      deaths: 3,
      kill_fame: 600_000,
      guild_ids: [HOME_GUILD, 'home-ally'],
    })
    expect(rows.find((r) => r.force_level === 'guild' && r.force_key === `g:${HOME_GUILD}`)).toMatchObject({
      force_name: 'Home',
      team_size: 12,
    })
  })

  it('force edge 는 양쪽 tenant 가 같은 EventId 를 수집해도 한 번만 센다', () => {
    const battle = makeBattle({
      alliances: [
        { id: 'A1', name: 'Ally-A' },
        { id: 'B1', name: 'Ally-B' },
      ],
      guilds: [
        { id: HOME_GUILD, name: 'Home', teamSize: 12, allianceId: 'A1', allianceName: 'Ally-A' },
        { id: 'opp', name: 'Opp', teamSize: 15, allianceId: 'B1', allianceName: 'Ally-B' },
      ],
    })

    const rows = buildBattleForceEdgeRows({
      battleRecordId: 'br1',
      battle,
      evaluatedAt: '2026-05-15T00:30:00Z',
      events: [
        {
          eventId: '100',
          sourceHomeGuildId: HOME_GUILD,
          role: 'killer',
          opponentGuild: 'Opp',
          opponentAlliance: 'Ally-B',
          fame: 250_000,
        },
        {
          eventId: '100',
          sourceHomeGuildId: 'opp',
          role: 'victim',
          opponentGuild: 'Home',
          opponentAlliance: 'Ally-A',
          fame: 250_000,
        },
      ],
    })

    const guildEdge = rows.find((r) => r.force_level === 'guild')
    const allianceEdge = rows.find((r) => r.force_level === 'alliance')
    expect(guildEdge?.event_count).toBe(1)
    expect(allianceEdge?.event_count).toBe(1)
    expect(guildEdge?.is_meaningful).toBe(true)
    expect(allianceEdge?.is_meaningful).toBe(true)
    expect((guildEdge?.a_kills ?? 0) + (guildEdge?.b_kills ?? 0)).toBe(1)
    expect((guildEdge?.a_kill_fame ?? 0) + (guildEdge?.b_kill_fame ?? 0)).toBe(250_000)
  })

  it('직접 이벤트가 있어도 한쪽 force 가 10명 미만이면 weak edge 로 남긴다', () => {
    const battle = makeBattle({
      guilds: [
        { id: HOME_GUILD, name: 'Home', teamSize: 12 },
        { id: 'small', name: 'Small', teamSize: 5 },
      ],
    })

    const rows = buildBattleForceEdgeRows({
      battleRecordId: 'br1',
      battle,
      evaluatedAt: '2026-05-15T00:30:00Z',
      events: [
        {
          eventId: '101',
          sourceHomeGuildId: HOME_GUILD,
          role: 'killer',
          opponentGuild: 'Small',
          opponentAlliance: null,
          fame: 10_000,
        },
      ],
    })

    expect(rows.find((r) => r.force_level === 'guild')).toMatchObject({
      event_count: 1,
      is_meaningful: false,
      confidence: 'weak',
    })
  })

  it('player summary 는 raw K/D 에 killboard evidence 의 무기/IP 를 보강한다', () => {
    const battle = makeBattle({
      guilds: [
        { id: HOME_GUILD, name: 'Home', teamSize: 1 },
        { id: 'opp', name: 'Opp', teamSize: 1 },
      ],
    })
    battle.players[`${HOME_GUILD}-p0`] = {
      ...battle.players[`${HOME_GUILD}-p0`],
      name: 'PlayerOne',
      kills: 2,
      deaths: 1,
      killFame: 300_000,
    }

    const players = buildBattlePlayerSummaries(battle, [
      {
        playerId: `${HOME_GUILD}-p0`,
        itemPower: 1475,
        equipment: { MainHand: { Type: 'T8_MAIN_HOLYSTAFF@3' } },
        occurredAt: '2026-05-15T00:10:00Z',
      },
    ])

    const player = players.find((p) => p.playerId === `${HOME_GUILD}-p0`)
    expect(player).toMatchObject({
      playerName: 'PlayerOne',
      kills: 2,
      deaths: 1,
      itemPower: 1475,
      weaponId: 'T8_MAIN_HOLYSTAFF@3',
    })
  })
})

describe('buildFinalMatchupRows — 매치업 분리', () => {
  it('홈 인원 < 10 → 빈 배열', () => {
    const battle = makeBattle({
      guilds: [
        { id: HOME_GUILD, name: 'Home', teamSize: 9 },
        { id: 'opp', name: 'Opp', teamSize: 30 },
      ],
    })
    const rows = buildFinalMatchupRows({
      guildId: 't1',
      battleRecordId: 'br1',
      battle,
      homeGuildId: HOME_GUILD,
      startedAt: battle.startTime,
      killboardPairs: [{ role: 'killer', opponentGuild: 'Opp', fame: 100 }],
      evaluatedAt: '2026-05-15T00:30:00Z',
    })
    expect(rows).toEqual([])
  })

  it('killboard 페어 0건 → 빈 배열 (placeholder 삭제 신호)', () => {
    const battle = makeBattle({
      guilds: [
        { id: HOME_GUILD, name: 'Home', teamSize: 30 },
        { id: 'opp', name: 'Opp', teamSize: 30 },
      ],
    })
    const rows = buildFinalMatchupRows({
      guildId: 't1',
      battleRecordId: 'br1',
      battle,
      homeGuildId: HOME_GUILD,
      startedAt: battle.startTime,
      killboardPairs: [],
      evaluatedAt: '2026-05-15T00:30:00Z',
    })
    expect(rows).toEqual([])
  })

  it('teamSize < 10 인 force 는 페어가 있어도 제외', () => {
    const battle = makeBattle({
      guilds: [
        { id: HOME_GUILD, name: 'Home', teamSize: 30 },
        { id: 'small-opp', name: 'SmallOpp', teamSize: 5 },
      ],
    })
    const rows = buildFinalMatchupRows({
      guildId: 't1',
      battleRecordId: 'br1',
      battle,
      homeGuildId: HOME_GUILD,
      startedAt: battle.startTime,
      killboardPairs: [
        { role: 'killer', opponentGuild: 'SmallOpp', fame: 1000 },
      ],
      evaluatedAt: '2026-05-15T00:30:00Z',
    })
    expect(rows).toEqual([])
  })

  it('단일 force 와의 교전 → 1개 row, match_index/total=1', () => {
    const battle = makeBattle({
      guilds: [
        { id: HOME_GUILD, name: 'Home', teamSize: 25 },
        { id: 'opp', name: 'Opp', teamSize: 28 },
      ],
    })
    const rows = buildFinalMatchupRows({
      guildId: 't1',
      battleRecordId: 'br1',
      battle,
      homeGuildId: HOME_GUILD,
      startedAt: battle.startTime,
      killboardPairs: [
        { role: 'killer', opponentGuild: 'Opp', fame: 100_000 },
        { role: 'killer', opponentGuild: 'Opp', fame: 200_000 },
        { role: 'victim', opponentGuild: 'Opp', fame: 50_000 },
      ],
      evaluatedAt: '2026-05-15T00:30:00Z',
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].match_index).toBe(1)
    expect(rows[0].match_total).toBe(1)
    expect(rows[0].is_provisional).toBe(false)
    expect(rows[0].home_kills).toBe(2)
    expect(rows[0].home_deaths).toBe(1)
    expect(rows[0].home_kill_fame).toBe(300_000)
    expect(rows[0].main_opponent_kills).toBe(1)
    expect(rows[0].main_opponent_deaths).toBe(2)
    expect(rows[0].main_opponent_kill_fame).toBe(50_000)
  })

  it('다중 alliance 와의 교전 → force 별로 분리 row + match_index 증가', () => {
    // home 길드는 ALLY-A 소속. 상대로 ALLY-B (길드 둘), ALLY-C (길드 하나) 가 등장.
    // alliance 별로 force 그룹화 → 2개 row.
    const battle = makeBattle({
      alliances: [
        { id: 'A1', name: 'Ally-A' },
        { id: 'B1', name: 'Ally-B' },
        { id: 'C1', name: 'Ally-C' },
      ],
      guilds: [
        { id: HOME_GUILD, name: 'Home', teamSize: 30, allianceId: 'A1', allianceName: 'Ally-A' },
        { id: 'b-g1', name: 'Bg1', teamSize: 20, allianceId: 'B1', allianceName: 'Ally-B' },
        { id: 'b-g2', name: 'Bg2', teamSize: 15, allianceId: 'B1', allianceName: 'Ally-B' },
        { id: 'c-g1', name: 'Cg1', teamSize: 15, allianceId: 'C1', allianceName: 'Ally-C' },
      ],
    })
    const rows = buildFinalMatchupRows({
      guildId: 't1',
      battleRecordId: 'br1',
      battle,
      homeGuildId: HOME_GUILD,
      startedAt: battle.startTime,
      killboardPairs: [
        { role: 'killer', opponentGuild: 'Bg1', fame: 100_000 },
        { role: 'killer', opponentGuild: 'Bg2', fame: 50_000 },
        { role: 'victim', opponentGuild: 'Cg1', fame: 80_000 },
        { role: 'killer', opponentGuild: 'Cg1', fame: 30_000 },
      ],
      evaluatedAt: '2026-05-15T00:30:00Z',
    })
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.match_total === 2)).toBe(true)
    expect(rows.map((r) => r.match_index).sort()).toEqual([1, 2])

    // teamSize desc sort → Ally-B (35) 가 첫 번째, Ally-C (15) 가 두 번째
    expect(rows[0].main_opponent_force_key).toBe('a:B1')
    expect(rows[0].main_opponent_team_size).toBe(35)
    // Ally-B 매치업 K/D/Fame: kill 2 (Bg1+Bg2), home_kill_fame 150_000
    expect(rows[0].home_kills).toBe(2)
    expect(rows[0].home_deaths).toBe(0)
    expect(rows[0].home_kill_fame).toBe(150_000)
    expect(rows[0].main_opponent_kill_fame).toBe(0)

    expect(rows[1].main_opponent_force_key).toBe('a:C1')
    expect(rows[1].main_opponent_team_size).toBe(15)
    // Ally-C 매치업 K/D/Fame: kill 1 (Cg1), death 1 (Cg1)
    expect(rows[1].home_kills).toBe(1)
    expect(rows[1].home_deaths).toBe(1)
    expect(rows[1].home_kill_fame).toBe(30_000)
    expect(rows[1].main_opponent_kill_fame).toBe(80_000)
  })

  it('다른 force 와의 페어는 force 별 row 에 섞이지 않음 (force key cross-contamination 방지)', () => {
    const battle = makeBattle({
      alliances: [
        { id: 'A1', name: 'Ally-A' },
        { id: 'B1', name: 'Ally-B' },
        { id: 'C1', name: 'Ally-C' },
      ],
      guilds: [
        { id: HOME_GUILD, name: 'Home', teamSize: 30, allianceId: 'A1', allianceName: 'Ally-A' },
        { id: 'b-g1', name: 'Bg1', teamSize: 20, allianceId: 'B1', allianceName: 'Ally-B' },
        { id: 'c-g1', name: 'Cg1', teamSize: 25, allianceId: 'C1', allianceName: 'Ally-C' },
      ],
    })
    const rows = buildFinalMatchupRows({
      guildId: 't1',
      battleRecordId: 'br1',
      battle,
      homeGuildId: HOME_GUILD,
      startedAt: battle.startTime,
      killboardPairs: [
        // 큰 force C 와의 교전이 압도적으로 많지만 force B 매치업에는 반영되면 안 됨.
        { role: 'killer', opponentGuild: 'Cg1', fame: 500_000 },
        { role: 'killer', opponentGuild: 'Cg1', fame: 500_000 },
        { role: 'killer', opponentGuild: 'Cg1', fame: 500_000 },
        { role: 'killer', opponentGuild: 'Bg1', fame: 100_000 },
      ],
      evaluatedAt: '2026-05-15T00:30:00Z',
    })
    expect(rows).toHaveLength(2)
    const cRow = rows.find((r) => r.main_opponent_force_key === 'a:C1')
    const bRow = rows.find((r) => r.main_opponent_force_key === 'a:B1')
    expect(cRow?.home_kills).toBe(3)
    expect(cRow?.home_kill_fame).toBe(1_500_000)
    expect(bRow?.home_kills).toBe(1)
    expect(bRow?.home_kill_fame).toBe(100_000)
  })

  it('alliance 없는 단독 길드는 forceKind=guild 로 분리', () => {
    const battle = makeBattle({
      guilds: [
        { id: HOME_GUILD, name: 'Home', teamSize: 25 },
        { id: 'opp', name: 'Opp', teamSize: 22 },
      ],
    })
    const rows = buildFinalMatchupRows({
      guildId: 't1',
      battleRecordId: 'br1',
      battle,
      homeGuildId: HOME_GUILD,
      startedAt: battle.startTime,
      killboardPairs: [{ role: 'killer', opponentGuild: 'Opp', fame: 100_000 }],
      evaluatedAt: '2026-05-15T00:30:00Z',
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].main_opponent_force_kind).toBe('guild')
    expect(rows[0].main_opponent_force_key).toBe('g:opp')
  })
})

describe('buildLegacyBackfillRows — killboard 페어 폴백', () => {
  it('홈 인원 < 10 → 빈 배열 (새 컷오프로 옛 75 vs 8 데이터 정리)', () => {
    const battle = makeBattle({
      guilds: [
        { id: HOME_GUILD, name: 'Home', teamSize: 75 },
        { id: 'opp', name: 'Opp', teamSize: 8 },
      ],
    })
    const rows = buildLegacyBackfillRows({
      guildId: 't1',
      battleRecordId: 'br1',
      battle,
      homeGuildId: HOME_GUILD,
      startedAt: battle.startTime,
      killboardPairs: [],
      evaluatedAt: '2026-05-15T00:30:00Z',
    })
    // home_team_size 가 75 라 home cutoff 통과지만 opp < 10 이라 raw fallback 도 빈 결과.
    expect(rows).toEqual([])
  })

  it('killboard 페어가 있으면 페어 기반 force 만 분리 매치업', () => {
    const battle = makeBattle({
      alliances: [
        { id: 'A1', name: 'Ally-A' },
        { id: 'B1', name: 'Ally-B' },
        { id: 'C1', name: 'Ally-C' },
      ],
      guilds: [
        { id: HOME_GUILD, name: 'Home', teamSize: 25, allianceId: 'A1', allianceName: 'Ally-A' },
        { id: 'b-g1', name: 'Bg1', teamSize: 20, allianceId: 'B1', allianceName: 'Ally-B' },
        // C 는 battle 에 있지만 페어 없음 → 분리 매치업 X
        { id: 'c-g1', name: 'Cg1', teamSize: 18, allianceId: 'C1', allianceName: 'Ally-C' },
      ],
    })
    const rows = buildLegacyBackfillRows({
      guildId: 't1',
      battleRecordId: 'br1',
      battle,
      homeGuildId: HOME_GUILD,
      startedAt: battle.startTime,
      killboardPairs: [{ role: 'killer', opponentGuild: 'Bg1', fame: 100_000 }],
      evaluatedAt: '2026-05-15T00:30:00Z',
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].main_opponent_force_key).toBe('a:B1')
    expect(rows[0].home_kills).toBe(1)
    expect(rows[0].home_kill_fame).toBe(100_000)
  })

  it('killboard 페어 0건 → raw_battle 의 모든 ≥10 force 를 분리 매치업으로 (best-effort)', () => {
    const battle = makeBattle({
      alliances: [
        { id: 'A1', name: 'Ally-A' },
        { id: 'B1', name: 'Ally-B' },
      ],
      guilds: [
        { id: HOME_GUILD, name: 'Home', teamSize: 25, allianceId: 'A1', allianceName: 'Ally-A', kills: 4, deaths: 2, killFame: 800_000 },
        { id: 'b-g1', name: 'Bg1', teamSize: 20, allianceId: 'B1', allianceName: 'Ally-B', kills: 3, deaths: 4, killFame: 300_000 },
        { id: 'g-only', name: 'GuildOnly', teamSize: 15, kills: 2, deaths: 3, killFame: 200_000 },
        // 5명짜리 force 는 < 10 컷오프로 제외
        { id: 'small', name: 'Small', teamSize: 5, kills: 0, deaths: 1, killFame: 5_000 },
      ],
    })
    const rows = buildLegacyBackfillRows({
      guildId: 't1',
      battleRecordId: 'br1',
      battle,
      homeGuildId: HOME_GUILD,
      startedAt: battle.startTime,
      killboardPairs: [],
      evaluatedAt: '2026-05-15T00:30:00Z',
    })
    expect(rows).toHaveLength(2)
    const keys = rows.map((r) => r.main_opponent_force_key).sort()
    expect(keys).toEqual(['a:B1', 'g:g-only'])
    // raw fallback 은 force.kills/deaths/killFame 을 그대로 사용
    const bRow = rows.find((r) => r.main_opponent_force_key === 'a:B1')!
    expect(bRow.main_opponent_kills).toBe(3)
    expect(bRow.main_opponent_deaths).toBe(4)
    expect(bRow.main_opponent_kill_fame).toBe(300_000)
  })
})

describe('buildBattleRecordRow — raw_battle 보존', () => {
  it('원본 battle 을 raw_battle 필드에 그대로 저장하고 메타만 추출', () => {
    const battle = makeBattle({
      battleId: 42,
      alliances: [{ id: 'A1', name: 'Ally-A' }],
      guilds: [
        { id: 'g1', name: 'G1', teamSize: 10, kills: 3, killFame: 100_000, allianceId: 'A1' },
        { id: 'g2', name: 'G2', teamSize: 12, kills: 2, killFame: 50_000 },
      ],
    })
    const row = buildBattleRecordRow(battle, 'east')
    expect(row.albion_battle_id).toBe(42)
    expect(row.albion_server).toBe('east')
    expect(row.total_players).toBe(22)
    expect(row.total_kills).toBe(battle.totalKills)
    expect(row.total_fame).toBe(battle.totalFame)
    expect(row.cluster_name).toBe('TestZone')
    expect(row.involved_guild_ids.sort()).toEqual(['g1', 'g2'])
    expect(row.involved_alliance_ids).toEqual(['A1'])
    expect(row.raw_battle).toBe(battle)
    expect(row.engagement_source_hash).toMatch(/^[a-f0-9]{64}$/)
  })
})
