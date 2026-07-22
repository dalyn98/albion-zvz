import { describe, expect, it } from 'vitest'
import { resolveEventCloseout } from './event-closeout'

describe('resolveEventCloseout', () => {
  it('keeps the closeout blocked until a tracked battle is linked', () => {
    expect(
      resolveEventCloseout({
        linkedBattleCount: 0,
        pendingRegearCount: 0,
        lootAuditRequired: true,
        lootAudits: [],
      }),
    ).toEqual({
      battle: 'blocked',
      regear: 'complete',
      loot: 'action_needed',
      completedSteps: 1,
      totalSteps: 3,
      ready: false,
    })
  })

  it('surfaces pending regear and unresolved loot as follow-up work', () => {
    expect(
      resolveEventCloseout({
        linkedBattleCount: 2,
        pendingRegearCount: 3,
        lootAuditRequired: true,
        lootAudits: [{ status: 'open', unresolvedFindingsCount: 2 }],
      }),
    ).toEqual({
      battle: 'complete',
      regear: 'action_needed',
      loot: 'action_needed',
      completedSteps: 1,
      totalSteps: 3,
      ready: false,
    })
  })

  it('marks the event ready when battle, regear, and loot checks are settled', () => {
    expect(
      resolveEventCloseout({
        linkedBattleCount: 3,
        pendingRegearCount: 0,
        lootAuditRequired: true,
        lootAudits: [{ status: 'resolved', unresolvedFindingsCount: 0 }],
      }),
    ).toMatchObject({
      battle: 'complete',
      regear: 'complete',
      loot: 'complete',
      completedSteps: 3,
      totalSteps: 3,
      ready: true,
    })
  })

  it('does not require a loot audit for non-loot events', () => {
    expect(
      resolveEventCloseout({
        linkedBattleCount: 1,
        pendingRegearCount: 0,
        lootAuditRequired: false,
        lootAudits: [],
      }),
    ).toEqual({
      battle: 'complete',
      regear: 'complete',
      loot: 'not_applicable',
      completedSteps: 2,
      totalSteps: 2,
      ready: true,
    })
  })
})
