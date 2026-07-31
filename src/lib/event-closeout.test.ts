import { describe, expect, it } from 'vitest'
import { isLatestLootAuditSettled, resolveEventCloseout } from './event-closeout'

describe('resolveEventCloseout', () => {
  it('keeps the closeout blocked until a tracked battle is linked', () => {
    expect(
      resolveEventCloseout({
        battleRequired: true,
        linkedBattleCount: 0,
        pendingRegearCount: 0,
        lootAuditRequired: true,
        lootAuditSettled: false,
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
        battleRequired: true,
        linkedBattleCount: 2,
        pendingRegearCount: 3,
        lootAuditRequired: true,
        lootAuditSettled: false,
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
        battleRequired: true,
        linkedBattleCount: 3,
        pendingRegearCount: 0,
        lootAuditRequired: true,
        lootAuditSettled: true,
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

  it('uses the latest audit when a new audit reopens the loot check', () => {
    expect(
      isLatestLootAuditSettled([
        { status: 'open', unresolvedFindingsCount: 1 },
        { status: 'resolved', unresolvedFindingsCount: 0 },
      ]),
    ).toBe(false)
  })

  it('does not require a loot audit for non-loot events', () => {
    expect(
      resolveEventCloseout({
        battleRequired: true,
        linkedBattleCount: 1,
        pendingRegearCount: 0,
        lootAuditRequired: false,
        lootAuditSettled: false,
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

  it('treats an event with no battle, regear, or loot work as valid closeout', () => {
    expect(
      resolveEventCloseout({
        battleRequired: false,
        linkedBattleCount: 0,
        pendingRegearCount: 0,
        lootAuditRequired: false,
        lootAuditSettled: false,
      }),
    ).toEqual({
      battle: 'not_applicable',
      regear: 'complete',
      loot: 'not_applicable',
      completedSteps: 1,
      totalSteps: 1,
      ready: true,
    })
  })
})
