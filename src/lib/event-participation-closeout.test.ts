import { describe, expect, it } from 'vitest'
import { buildEventParticipationCloseoutModel } from './event-participation-closeout'

describe('buildEventParticipationCloseoutModel', () => {
  it('uses only confirmed slot assignments as default participants', () => {
    const model = buildEventParticipationCloseoutModel({
      assignments: [
        { discordId: 'assigned-1', username: 'Assigned', roleName: 'Healer' },
      ],
      activities: [
        {
          discordId: 'activity-1',
          username: 'Walk In',
          battleCount: 2,
        },
      ],
      tentative: [
        {
          discordId: 'tentative-1',
          username: 'Available',
          possibleRoles: ['Support'],
          notes: 'maybe',
        },
      ],
      directory: [
        {
          discordId: 'activity-1',
          username: 'Walk In',
          albionNickname: 'WalkIn',
        },
      ],
      activityChecked: true,
    })

    expect(model.candidates.map((candidate) => candidate.discordId)).toEqual([
      'assigned-1',
    ])
    expect(
      model.suggestions.map((suggestion) => [
        suggestion.discordId,
        suggestion.context,
      ]),
    ).toEqual([['activity-1', 'activity']])
    expect(model.tentativeContextCount).toBe(1)
  })

  it('deduplicates multiple assigned slots and preserves their roles', () => {
    const model = buildEventParticipationCloseoutModel({
      assignments: [
        { discordId: 'member-1', username: 'Member', roleName: 'Healer' },
        { discordId: 'member-1', username: 'Member', roleName: 'Support' },
      ],
      activities: [
        { discordId: 'member-1', username: 'Member', battleCount: 3 },
      ],
      tentative: [],
      directory: [],
      activityChecked: true,
    })

    expect(model.candidates).toEqual([
      expect.objectContaining({
        discordId: 'member-1',
        roleNames: ['Healer', 'Support'],
        activityBattleCount: 3,
        evidenceStatus: 'activity_confirmed',
      }),
    ])
  })

  it('highlights assigned members without activity and unassigned activity separately', () => {
    const model = buildEventParticipationCloseoutModel({
      assignments: [
        { discordId: 'no-show', username: 'No Show', roleName: 'Tank' },
        { discordId: 'confirmed', username: 'Confirmed', roleName: 'Dps' },
      ],
      activities: [
        { discordId: 'confirmed', username: 'Confirmed', battleCount: 1 },
        { discordId: 'walk-in', username: 'Walk In', battleCount: 2 },
        {
          discordId: null,
          username: 'Unlinked Albion',
          battleCount: 1,
          albionPlayerId: 'albion-1',
        },
      ],
      tentative: [],
      directory: [{ discordId: 'walk-in', username: 'Walk In' }],
      activityChecked: true,
    })

    expect(model.candidates[0]).toMatchObject({
      discordId: 'no-show',
      evidenceStatus: 'activity_not_found',
    })
    expect(model.suggestions[0]).toMatchObject({
      discordId: 'walk-in',
      context: 'activity',
      evidenceStatus: 'activity_only',
    })
    expect(model.unresolvedActivity).toEqual([
      expect.objectContaining({ albionPlayerId: 'albion-1' }),
    ])
    expect(model.mismatchCount).toBe(3)
  })

  it('does not offer activity identities outside the current guild directory', () => {
    const model = buildEventParticipationCloseoutModel({
      assignments: [],
      activities: [
        {
          discordId: 'former-member',
          username: 'Former Member',
          battleCount: 2,
        },
      ],
      tentative: [],
      directory: [],
      activityChecked: true,
    })

    expect(model.suggestions).toEqual([])
    expect(model.unresolvedActivity).toEqual([
      expect.objectContaining({
        key: 'former-member',
        username: 'Former Member',
      }),
    ])
  })

  it('does not call missing battle evidence a no-show when activity was not checked', () => {
    const model = buildEventParticipationCloseoutModel({
      assignments: [
        { discordId: 'member-1', username: 'Member', roleName: 'Healer' },
      ],
      activities: [],
      tentative: [],
      directory: [],
      activityChecked: false,
    })

    expect(model.candidates[0]?.evidenceStatus).toBe('not_checked')
    expect(model.mismatchCount).toBe(0)
  })
})
