export type EventCloseoutStepState = 'blocked' | 'action_needed' | 'complete' | 'not_applicable'

export interface EventCloseoutLootAudit {
  status: 'open' | 'resolved' | 'archived'
  unresolvedFindingsCount: number
}

export interface EventCloseout {
  battle: EventCloseoutStepState
  regear: EventCloseoutStepState
  loot: EventCloseoutStepState
  completedSteps: number
  totalSteps: number
  ready: boolean
}

export function isLatestLootAuditSettled(
  audits: readonly EventCloseoutLootAudit[],
): boolean {
  const latest = audits[0]
  return latest?.status === 'resolved' && latest.unresolvedFindingsCount === 0
}

export function resolveEventCloseout(input: {
  battleRequired: boolean
  linkedBattleCount: number
  pendingRegearCount: number
  lootAuditRequired: boolean
  lootAuditSettled: boolean
}): EventCloseout {
  const battle: EventCloseoutStepState = !input.battleRequired
    ? 'not_applicable'
    : input.linkedBattleCount > 0
      ? 'complete'
      : 'blocked'
  const regear: EventCloseoutStepState =
    input.pendingRegearCount > 0 ? 'action_needed' : 'complete'
  const loot: EventCloseoutStepState = !input.lootAuditRequired
    ? 'not_applicable'
    : input.lootAuditSettled
      ? 'complete'
      : 'action_needed'

  const states = [battle, regear, loot].filter((state) => state !== 'not_applicable')
  const completedSteps = states.filter((state) => state === 'complete').length

  return {
    battle,
    regear,
    loot,
    completedSteps,
    totalSteps: states.length,
    ready: completedSteps === states.length,
  }
}
