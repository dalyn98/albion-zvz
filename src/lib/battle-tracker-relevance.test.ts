import { describe, expect, it } from 'vitest'
import type { AlbionBattle } from './albion-battles'
import {
  filterBattlesRelevantToTrackingSubjects,
  isBattleRelevantToTrackingSubject,
} from './battle-tracker-relevance'

function battleWithGuilds(
  guilds: Array<{ id: string; allianceId?: string }>,
): AlbionBattle {
  return {
    id: 1,
    startTime: '2026-06-13T00:00:00Z',
    endTime: '2026-06-13T00:10:00Z',
    totalFame: 0,
    totalKills: 0,
    clusterName: null,
    guilds: Object.fromEntries(
      guilds.map((guild) => [
        guild.id,
        {
          id: guild.id,
          name: guild.id,
          kills: 0,
          deaths: 0,
          killFame: 0,
          alliance: guild.allianceId ?? '',
          allianceId: guild.allianceId ?? '',
        },
      ]),
    ),
    alliances: {},
    players: {},
  }
}

describe('battle tracker relevance filtering', () => {
  it('keeps direct guild battles', () => {
    expect(
      isBattleRelevantToTrackingSubject(battleWithGuilds([{ id: 'home' }]), {
        homeGuildId: 'home',
        homeAllianceId: null,
      }),
    ).toBe(true)
  })

  it('keeps alliance-only battles for shadow projections', () => {
    expect(
      isBattleRelevantToTrackingSubject(
        battleWithGuilds([{ id: 'ally', allianceId: 'alliance' }]),
        {
          homeGuildId: 'home',
          homeAllianceId: 'alliance',
        },
      ),
    ).toBe(true)
  })

  it('drops unrelated public recent battles before DB writes', () => {
    const direct = battleWithGuilds([{ id: 'home' }])
    const unrelated = battleWithGuilds([{ id: 'other', allianceId: 'other-alliance' }])

    expect(
      filterBattlesRelevantToTrackingSubjects([direct, unrelated], [
        { homeGuildId: 'home', homeAllianceId: 'alliance' },
      ]),
    ).toEqual([direct])
  })
})
