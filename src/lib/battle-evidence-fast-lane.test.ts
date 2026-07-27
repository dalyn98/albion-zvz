import { describe, expect, it } from 'vitest'
import {
  buildMissingParticipantEvidenceRequests,
  buildBattleEvidenceRows,
  type AlbionBattleEvidenceEvent,
} from './battle-evidence-fast-lane'
import type { AlbionBattle } from './albion-battles'

function event(overrides: Partial<AlbionBattleEvidenceEvent> = {}): AlbionBattleEvidenceEvent {
  return {
    EventId: 101,
    BattleId: 999,
    TimeStamp: '2026-07-24T00:01:00.000Z',
    TotalVictimKillFame: 12_345,
    Killer: {
      Id: 'home-player',
      Name: 'Home Player',
      GuildId: 'home-guild',
      GuildName: 'Home',
      AllianceId: 'home-alliance',
      AllianceName: 'Home Alliance',
      AverageItemPower: 1_503.4,
      Equipment: { MainHand: { Type: 'T8_MAIN_SWORD' } },
    },
    Victim: {
      Id: 'opponent-player',
      Name: 'Opponent Player',
      GuildId: 'opponent-guild',
      GuildName: 'Opponent',
      AllianceId: 'opponent-alliance',
      AllianceName: 'Opponent Alliance',
    },
    ...overrides,
  }
}

describe('buildBattleEvidenceRows', () => {
  it('이벤트 당시 양측 ID와 킬페임을 tenant killboard 행에 보존한다', () => {
    const rows = buildBattleEvidenceRows({
      guildId: 'tenant-1',
      homeGuildId: 'home-guild',
      battleId: 999,
      events: [event()],
      discordIdByPlayerId: new Map([['home-player', 'discord-1']]),
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      guild_id: 'tenant-1',
      event_id: 101,
      role: 'killer',
      discord_id: 'discord-1',
      source_guild_id: 'home-guild',
      source_alliance_id: 'home-alliance',
      opponent_guild_id: 'opponent-guild',
      opponent_alliance_id: 'opponent-alliance',
      fame: 12_345,
      fame_is_observed: true,
      item_power: 1_503,
      battle_id: 999,
    })
  })

  it('누락된 킬페임은 실제 0과 구분해 검증 불가 근거로 보존한다', () => {
    const rows = buildBattleEvidenceRows({
      guildId: 'tenant-1',
      homeGuildId: 'home-guild',
      battleId: 999,
      events: [event({ TotalVictimKillFame: undefined })],
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      fame: 0,
      fame_is_observed: false,
    })
  })

  it('홈 길드가 피해자인 단방향 데스도 victim 근거로 만든다', () => {
    const base = event()
    const rows = buildBattleEvidenceRows({
      guildId: 'tenant-1',
      homeGuildId: 'home-guild',
      battleId: 999,
      events: [
        {
          ...base,
          Killer: base.Victim,
          Victim: base.Killer,
        },
      ],
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      role: 'victim',
      albion_player_id: 'home-player',
      source_guild_id: 'home-guild',
      opponent_guild_id: 'opponent-guild',
    })
  })

  it('다른 battle 또는 홈 길드와 무관한 이벤트는 적재하지 않는다', () => {
    const unrelated = event({
      BattleId: 1000,
      Killer: {
        Id: 'third',
        Name: 'Third',
        GuildId: 'third-guild',
        GuildName: 'Third Guild',
      },
    })
    expect(
      buildBattleEvidenceRows({
        guildId: 'tenant-1',
        homeGuildId: 'home-guild',
        battleId: 999,
        events: [unrelated],
      }),
    ).toEqual([])
  })

  it('같은 event/role 중복 응답은 한 행으로 만든다', () => {
    const evidence = event()
    const rows = buildBattleEvidenceRows({
      guildId: 'tenant-1',
      homeGuildId: 'home-guild',
      battleId: 999,
      events: [evidence, evidence],
    })
    expect(rows).toHaveLength(1)
  })
})

describe('buildMissingParticipantEvidenceRequests', () => {
  const battle = {
    id: 999,
    startTime: '2026-07-24T00:00:00.000Z',
    endTime: '2026-07-24T00:30:00.000Z',
    totalFame: 0,
    totalKills: 3,
    clusterName: 'Test',
    players: {
      'home-player': {
        id: 'home-player',
        name: 'Home Player',
        kills: 2,
        deaths: 1,
        killFame: 0,
        guildId: 'home-guild',
        guildName: 'Home',
        allianceId: null,
        allianceName: null,
      },
    },
    guilds: {
      'home-guild': {
        id: 'home-guild',
        name: 'Home',
        kills: 2,
        deaths: 1,
        killFame: 0,
        allianceId: '',
        alliance: '',
      },
    },
    alliances: {},
  } satisfies AlbionBattle

  it('전투 전용 응답이 일부뿐이면 부족한 역할만 보완 조회한다', () => {
    const requests = buildMissingParticipantEvidenceRequests({
      battle,
      homeGuildId: 'home-guild',
      rows: [
        {
          event_id: 1,
          role: 'killer',
          albion_player_id: 'home-player',
          source_guild_id: 'home-guild',
          opponent_guild: 'Enemy',
          opponent_guild_id: 'enemy-guild',
          fame_is_observed: true,
        },
      ],
    })

    expect(requests).toEqual([
      { playerId: 'home-player', kind: 'kills' },
      { playerId: 'home-player', kind: 'deaths' },
    ])
  })

  it('예전 행의 미관측 킬페임이나 빠진 상대 ID를 완료 근거로 세지 않는다', () => {
    const requests = buildMissingParticipantEvidenceRequests({
      battle,
      homeGuildId: 'home-guild',
      rows: [
        {
          event_id: 1,
          role: 'killer',
          albion_player_id: 'home-player',
          source_guild_id: 'home-guild',
          opponent_guild: 'Enemy',
          opponent_guild_id: 'enemy-guild',
          fame_is_observed: false,
        },
        {
          event_id: 2,
          role: 'killer',
          albion_player_id: 'home-player',
          source_guild_id: 'home-guild',
          opponent_guild: 'Enemy',
          opponent_guild_id: null,
          fame_is_observed: true,
        },
        {
          event_id: 3,
          role: 'victim',
          albion_player_id: 'home-player',
          source_guild_id: 'home-guild',
          opponent_guild: 'Enemy',
          opponent_guild_id: 'enemy-guild',
          fame_is_observed: true,
        },
      ],
    })

    expect(requests).toEqual([{ playerId: 'home-player', kind: 'kills' }])
  })

  it('중복 이벤트 응답은 수집 건수를 부풀리지 않는다', () => {
    const row = {
      event_id: 1,
      role: 'killer' as const,
      albion_player_id: 'home-player',
      source_guild_id: 'home-guild',
      opponent_guild: 'Enemy',
      opponent_guild_id: 'enemy-guild',
      fame_is_observed: true,
    }
    const requests = buildMissingParticipantEvidenceRequests({
      battle,
      homeGuildId: 'home-guild',
      rows: [row, row],
    })

    expect(requests).toContainEqual({
      playerId: 'home-player',
      kind: 'kills',
    })
  })
})
