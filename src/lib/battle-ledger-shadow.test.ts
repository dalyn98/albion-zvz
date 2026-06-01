import { describe, expect, it } from 'vitest'
import type {
  AlbionBattle,
  AlbionBattleAlliance,
  AlbionBattleGuild,
  AlbionBattlePlayer,
} from './albion-battles'
import {
  buildBattleLedgerShadowRows,
  buildGuildBattleViewProjections,
} from './battle-ledger-shadow'

const HOME_GUILD = 'home-guild-id'
const HOME_ALLIANCE = 'home-alliance-id'
const BATTLE_RECORD_ID = '00000000-0000-0000-0000-000000000001'

function makePlayer(
  overrides: Partial<AlbionBattlePlayer> & { id: string; guildId: string },
): AlbionBattlePlayer {
  return {
    name: overrides.name ?? `Player ${overrides.id}`,
    kills: overrides.kills ?? 0,
    deaths: overrides.deaths ?? 0,
    killFame: overrides.killFame ?? 0,
    guildName: overrides.guildName ?? '',
    guildId: overrides.guildId,
    allianceName: overrides.allianceName ?? null,
    allianceId: overrides.allianceId ?? null,
    id: overrides.id,
  }
}

function makeGuild(
  overrides: Partial<AlbionBattleGuild> & { id: string; name: string },
): AlbionBattleGuild {
  return {
    id: overrides.id,
    name: overrides.name,
    kills: overrides.kills ?? 0,
    deaths: overrides.deaths ?? 0,
    killFame: overrides.killFame ?? 0,
    alliance: overrides.alliance ?? '',
    allianceId: overrides.allianceId ?? '',
  }
}

function makeAlliance(
  overrides: Partial<AlbionBattleAlliance> & { id: string; name: string },
): AlbionBattleAlliance {
  return {
    id: overrides.id,
    name: overrides.name,
    kills: overrides.kills ?? 0,
    deaths: overrides.deaths ?? 0,
    killFame: overrides.killFame ?? 0,
  }
}

function addPlayers(
  players: Record<string, AlbionBattlePlayer>,
  guild: AlbionBattleGuild,
  count: number,
) {
  for (let i = 0; i < count; i++) {
    const id = `${guild.id}-p${i}`
    players[id] = makePlayer({
      id,
      guildId: guild.id,
      guildName: guild.name,
      allianceId: guild.allianceId || null,
      allianceName: guild.alliance || null,
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

function makeBattle(specs: {
  battleId?: number
  guilds: GuildSpec[]
  alliances?: Array<{ id: string; name: string }>
}): AlbionBattle {
  const guilds: Record<string, AlbionBattleGuild> = {}
  const players: Record<string, AlbionBattlePlayer> = {}
  for (const spec of specs.guilds) {
    const guild = makeGuild({
      id: spec.id,
      name: spec.name,
      kills: spec.kills,
      deaths: spec.deaths,
      killFame: spec.killFame,
      allianceId: spec.allianceId ?? '',
      alliance: spec.allianceName ?? '',
    })
    guilds[guild.id] = guild
    addPlayers(players, guild, spec.teamSize)
  }
  const alliances: Record<string, AlbionBattleAlliance> = {}
  for (const spec of specs.alliances ?? []) {
    alliances[spec.id] = makeAlliance({
      id: spec.id,
      name: spec.name,
      kills: specs.guilds
        .filter((g) => g.allianceId === spec.id)
        .reduce((sum, g) => sum + (g.kills ?? 0), 0),
      deaths: specs.guilds
        .filter((g) => g.allianceId === spec.id)
        .reduce((sum, g) => sum + (g.deaths ?? 0), 0),
      killFame: specs.guilds
        .filter((g) => g.allianceId === spec.id)
        .reduce((sum, g) => sum + (g.killFame ?? 0), 0),
    })
  }
  return {
    id: specs.battleId ?? 99,
    startTime: '2026-05-28T14:00:00Z',
    endTime: '2026-05-28T14:20:00Z',
    totalFame: specs.guilds.reduce((sum, g) => sum + (g.killFame ?? 0), 0),
    totalKills: specs.guilds.reduce((sum, g) => sum + (g.kills ?? 0), 0),
    clusterName: 'Shadow Plain',
    guilds,
    alliances,
    players,
  }
}

describe('buildBattleLedgerShadowRows', () => {
  it('preserves source snapshots while creating registry entities for guilds, alliances, and players', () => {
    const battle = makeBattle({
      guilds: [
        {
          id: HOME_GUILD,
          name: 'Menhera',
          teamSize: 12,
          kills: 4,
          deaths: 2,
          killFame: 1200,
          allianceId: HOME_ALLIANCE,
          allianceName: 'MGM',
        },
        { id: 'opp-guild', name: 'Vina', teamSize: 14, kills: 2, deaths: 4, killFame: 800 },
      ],
      alliances: [{ id: HOME_ALLIANCE, name: 'MGM' }],
    })

    const rows = buildBattleLedgerShadowRows({
      battleRecordId: BATTLE_RECORD_ID,
      server: 'east',
      battle,
      fetchedAt: '2026-05-28T14:25:00Z',
    })

    expect(rows.snapshot.rawHash).toMatch(/^[a-f0-9]{64}$/)
    expect(rows.registryEntities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityType: 'guild', albionId: HOME_GUILD, currentName: 'Menhera' }),
        expect.objectContaining({ entityType: 'alliance', albionId: HOME_ALLIANCE, currentName: 'MGM' }),
        expect.objectContaining({ entityType: 'player', albionId: `${HOME_GUILD}-p0` }),
      ]),
    )
    expect(rows.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          participantType: 'guild',
          entityAlbionId: HOME_GUILD,
          entityName: 'Menhera',
          allianceAlbionId: HOME_ALLIANCE,
          teamSize: 12,
        }),
        expect.objectContaining({
          participantType: 'player',
          entityAlbionId: `${HOME_GUILD}-p0`,
          guildAlbionId: HOME_GUILD,
          entityName: `Player ${HOME_GUILD}-p0`,
        }),
      ]),
    )
  })
})

describe('buildGuildBattleViewProjections', () => {
  it('marks direct guild participation separately from alliance-only participation', () => {
    const directBattle = makeBattle({
      guilds: [
        { id: HOME_GUILD, name: 'Menhera', teamSize: 12, allianceId: HOME_ALLIANCE, allianceName: 'MGM' },
        { id: 'opp-guild', name: 'Vina', teamSize: 14 },
      ],
      alliances: [{ id: HOME_ALLIANCE, name: 'MGM' }],
    })
    const allianceBattle = makeBattle({
      guilds: [
        { id: 'ally-guild', name: 'Ally', teamSize: 20, allianceId: HOME_ALLIANCE, allianceName: 'MGM' },
        { id: 'opp-guild', name: 'Vina', teamSize: 18 },
      ],
      alliances: [{ id: HOME_ALLIANCE, name: 'MGM' }],
    })

    expect(
      buildGuildBattleViewProjections({
        battleRecordId: BATTLE_RECORD_ID,
        battle: directBattle,
        subjectGuildId: HOME_GUILD,
        subjectGuildName: 'Menhera',
        subjectAllianceId: HOME_ALLIANCE,
        evaluatedAt: '2026-05-28T14:25:00Z',
      })[0],
    ).toMatchObject({ relationScope: 'direct', status: 'provisional', isMeaningful: true })

    expect(
      buildGuildBattleViewProjections({
        battleRecordId: BATTLE_RECORD_ID,
        battle: allianceBattle,
        subjectGuildId: HOME_GUILD,
        subjectGuildName: 'Menhera',
        subjectAllianceId: HOME_ALLIANCE,
        evaluatedAt: '2026-05-28T14:25:00Z',
      })[0],
    ).toMatchObject({ relationScope: 'alliance', status: 'provisional', isMeaningful: true })
  })

  it('keeps low-engagement projections but marks them as not meaningful for default views', () => {
    const battle = makeBattle({
      guilds: [
        { id: 'ally-guild', name: 'Ally', teamSize: 4, allianceId: HOME_ALLIANCE, allianceName: 'MGM' },
        { id: 'opp-guild', name: 'Vina', teamSize: 4 },
      ],
      alliances: [{ id: HOME_ALLIANCE, name: 'MGM' }],
    })

    const [projection] = buildGuildBattleViewProjections({
      battleRecordId: BATTLE_RECORD_ID,
      battle,
      subjectGuildId: HOME_GUILD,
      subjectGuildName: 'Menhera',
      subjectAllianceId: HOME_ALLIANCE,
      evaluatedAt: '2026-05-28T14:25:00Z',
    })

    expect(projection).toMatchObject({
      relationScope: 'alliance',
      isMeaningful: false,
      viewPolicy: 'small_or_low_engagement',
    })
  })

  it('does not default-expose one-sided large fights when the opponent force is under the minimum size', () => {
    const battle = makeBattle({
      guilds: [
        { id: HOME_GUILD, name: 'Menhera', teamSize: 40, allianceId: HOME_ALLIANCE, allianceName: 'MGM' },
        { id: 'straggler-guild', name: 'Straggler', teamSize: 3 },
      ],
      alliances: [{ id: HOME_ALLIANCE, name: 'MGM' }],
    })

    const [projection] = buildGuildBattleViewProjections({
      battleRecordId: BATTLE_RECORD_ID,
      battle,
      subjectGuildId: HOME_GUILD,
      subjectGuildName: 'Menhera',
      subjectAllianceId: HOME_ALLIANCE,
      evaluatedAt: '2026-05-28T14:25:00Z',
    })

    expect(projection).toMatchObject({
      relationScope: 'direct',
      subjectTeamSize: 40,
      opponentTeamSize: 3,
      isMeaningful: false,
      viewPolicy: 'small_or_low_engagement',
    })
  })
})
