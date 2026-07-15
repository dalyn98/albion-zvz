import { describe, expect, it } from 'vitest'
import {
  buildAllianceContentAdminCandidatePreviews,
  buildAllianceContentSessionCandidates,
  buildVideoRequirementDrafts,
  isMenheraAllianceContentComplianceEnabled,
  resolveAllianceContentCandidateParticipants,
  selectAllianceContentBattleParticipantIds,
} from './alliance-content-compliance'

describe('isMenheraAllianceContentComplianceEnabled', () => {
  it('allows the staged feature only for an enabled Menhera tenant', () => {
    expect(isMenheraAllianceContentComplianceEnabled('menhera', 'true')).toBe(true)
    expect(isMenheraAllianceContentComplianceEnabled('menhera', 'false')).toBe(false)
    expect(isMenheraAllianceContentComplianceEnabled('another-guild', 'true')).toBe(false)
  })
})

describe('buildAllianceContentSessionCandidates', () => {
  it('deduplicates split matchup rows and groups nearby battles into one content session', () => {
    const candidates = buildAllianceContentSessionCandidates(
      [
        {
          battleRecordId: 'battle-1',
          startedAt: '2026-07-13T10:00:00.000Z',
          endedAt: '2026-07-13T10:30:00.000Z',
          participantAlbionIds: ['player-a', 'player-b'],
        },
        // 같은 원본 전투의 상대별 분리 행. 참가자/종료 시각은 합쳐져야 하지만
        // 컨텐츠 횟수는 절대 2회가 되면 안 된다.
        {
          battleRecordId: 'battle-1',
          startedAt: '2026-07-13T10:00:00.000Z',
          endedAt: '2026-07-13T10:40:00.000Z',
          participantAlbionIds: ['player-c'],
        },
        {
          battleRecordId: 'battle-2',
          startedAt: '2026-07-13T11:20:00.000Z',
          endedAt: '2026-07-13T12:00:00.000Z',
          participantAlbionIds: ['player-b', 'player-d'],
        },
        {
          battleRecordId: 'battle-3',
          startedAt: '2026-07-13T14:00:00.000Z',
          endedAt: '2026-07-13T14:30:00.000Z',
          participantAlbionIds: ['player-e'],
        },
      ],
      90,
    )

    expect(candidates).toEqual([
      {
        battleRecordIds: ['battle-1', 'battle-2'],
        startedAt: '2026-07-13T10:00:00.000Z',
        endedAt: '2026-07-13T12:00:00.000Z',
        participantAlbionIds: ['player-a', 'player-b', 'player-c', 'player-d'],
      },
      {
        battleRecordIds: ['battle-3'],
        startedAt: '2026-07-13T14:00:00.000Z',
        endedAt: '2026-07-13T14:30:00.000Z',
        participantAlbionIds: ['player-e'],
      },
    ])
  })
})

describe('alliance content candidate participants', () => {
  it('falls back to raw battle players when snapshots are missing', () => {
    expect(selectAllianceContentBattleParticipantIds([], ['member-b', 'member-a', 'member-b'])).toEqual([
      'member-a',
      'member-b',
    ])
    expect(selectAllianceContentBattleParticipantIds(['snapshot-member'], ['raw-member'])).toEqual([
      'snapshot-member',
    ])
  })

  it('shows every active guild member and marks linked members recorded on confirmation', () => {
    const participants = resolveAllianceContentCandidateParticipants(
      ['member-a', 'member-b', 'former-member', 'unlinked-member', 'enemy-player'],
      [
        { albionPlayerId: 'member-a', albionPlayerName: 'Alpha' },
        { albionPlayerId: 'member-b', albionPlayerName: 'Bravo' },
        { albionPlayerId: 'unlinked-member', albionPlayerName: 'Charlie' },
      ],
      [
        {
          discordId: 'discord-b',
          username: 'BravoDiscord',
          albionPlayerId: 'member-b',
        },
        {
          discordId: 'discord-former',
          username: 'FormerDiscord',
          albionPlayerId: 'former-member',
        },
        {
          discordId: 'discord-a',
          username: 'AlphaDiscord',
          albionPlayerId: 'member-a',
        },
      ],
    )

    expect(participants).toEqual([
      {
        discordId: 'discord-a',
        username: 'AlphaDiscord',
        albionNickname: 'Alpha',
        isSiteLinked: true,
      },
      {
        discordId: 'discord-b',
        username: 'BravoDiscord',
        albionNickname: 'Bravo',
        isSiteLinked: true,
      },
      {
        discordId: null,
        username: null,
        albionNickname: 'Charlie',
        isSiteLinked: false,
      },
    ])
  })

  it('removes battles without guild participants and orders remaining candidates newest first', () => {
    const candidates = buildAllianceContentAdminCandidatePreviews(
      [
        {
          battleRecordId: 'old-guild-battle',
          startedAt: '2026-07-13T10:00:00.000Z',
          endedAt: '2026-07-13T10:20:00.000Z',
          participantAlbionIds: ['member-a'],
        },
        {
          battleRecordId: 'new-enemy-only-battle',
          startedAt: '2026-07-13T16:00:00.000Z',
          endedAt: '2026-07-13T16:20:00.000Z',
          participantAlbionIds: ['enemy-player'],
        },
        {
          battleRecordId: 'newest-guild-battle',
          startedAt: '2026-07-13T20:00:00.000Z',
          endedAt: '2026-07-13T20:20:00.000Z',
          participantAlbionIds: ['member-b'],
        },
      ],
      90,
      [
        { albionPlayerId: 'member-a', albionPlayerName: 'Alpha' },
        { albionPlayerId: 'member-b', albionPlayerName: 'Bravo' },
      ],
      [],
    )

    expect(candidates.map((candidate) => candidate.battleRecordIds)).toEqual([
      ['newest-guild-battle'],
      ['old-guild-battle'],
    ])
  })
})

describe('buildVideoRequirementDrafts', () => {
  it('creates one seven-day duty per three unassigned confirmed participations', () => {
    const requirements = buildVideoRequirementDrafts(
      [
        { sessionId: 'session-1', endedAt: '2026-07-01T20:00:00.000Z' },
        { sessionId: 'session-2', endedAt: '2026-07-03T20:00:00.000Z' },
        { sessionId: 'session-3', endedAt: '2026-07-05T20:00:00.000Z' },
        { sessionId: 'session-4', endedAt: '2026-07-07T20:00:00.000Z' },
      ],
      new Set(),
    )

    expect(requirements).toEqual([
      {
        sessionIds: ['session-1', 'session-2', 'session-3'],
        dueAt: '2026-07-12T20:00:00.000Z',
      },
    ])
  })

  it('never rebuilds a duty from sessions already bound to an earlier requirement', () => {
    const requirements = buildVideoRequirementDrafts(
      [
        { sessionId: 'session-1', endedAt: '2026-07-01T20:00:00.000Z' },
        { sessionId: 'session-2', endedAt: '2026-07-03T20:00:00.000Z' },
        { sessionId: 'session-3', endedAt: '2026-07-05T20:00:00.000Z' },
        { sessionId: 'session-4', endedAt: '2026-07-07T20:00:00.000Z' },
        { sessionId: 'session-5', endedAt: '2026-07-09T20:00:00.000Z' },
        { sessionId: 'session-6', endedAt: '2026-07-11T20:00:00.000Z' },
      ],
      new Set(['session-1', 'session-2', 'session-3']),
    )

    expect(requirements).toEqual([
      {
        sessionIds: ['session-4', 'session-5', 'session-6'],
        dueAt: '2026-07-18T20:00:00.000Z',
      },
    ])
  })
})
