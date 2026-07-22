export type OperationsQueueKey =
  | 'regear'
  | 'exchange'
  | 'donation'
  | 'shop'
  | 'memberTrade'
  | 'eventPayout'
  | 'craft'

export type OperationsQueueUrgency = 'normal' | 'watch' | 'overdue'

export interface OperationsQueueInput {
  key: OperationsQueueKey
  count: number
  oldestCreatedAt: string | null
}

export interface OperationsQueueRow extends OperationsQueueInput {
  oldestAgeHours: number | null
  urgency: OperationsQueueUrgency
}

const WATCH_AGE_HOURS = 12
const OVERDUE_AGE_HOURS = 24

function resolveAgeHours(createdAt: string | null, nowMs: number): number | null {
  if (!createdAt) return null

  const createdAtMs = Date.parse(createdAt)
  if (!Number.isFinite(createdAtMs) || createdAtMs > nowMs) return null

  return Math.floor((nowMs - createdAtMs) / 3_600_000)
}

function resolveUrgency(ageHours: number | null): OperationsQueueUrgency {
  if (ageHours === null || ageHours < WATCH_AGE_HOURS) return 'normal'
  if (ageHours < OVERDUE_AGE_HOURS) return 'watch'
  return 'overdue'
}

export function buildOperationsQueueRows(
  queues: readonly OperationsQueueInput[],
  nowMs: number,
): OperationsQueueRow[] {
  return queues
    .filter((queue) => queue.count > 0)
    .map((queue) => {
      const oldestAgeHours = resolveAgeHours(queue.oldestCreatedAt, nowMs)
      return {
        ...queue,
        oldestAgeHours,
        urgency: resolveUrgency(oldestAgeHours),
      }
    })
    .sort((left, right) => {
      const leftAge = left.oldestAgeHours ?? -1
      const rightAge = right.oldestAgeHours ?? -1
      if (leftAge !== rightAge) return rightAge - leftAge
      if (left.count !== right.count) return right.count - left.count
      return left.key.localeCompare(right.key)
    })
}

export type EventReadinessStatus = 'unconfigured' | 'needsMembers' | 'full'

export interface EventReadinessInput {
  totalSlots: number
  assignedSlots: number
}

export interface EventReadinessSummary {
  totalSlots: number
  assignedSlots: number
  openSlots: number
  fillPercent: number
  status: EventReadinessStatus
}

export function summarizeEventReadiness({
  totalSlots,
  assignedSlots,
}: EventReadinessInput): EventReadinessSummary {
  const safeTotalSlots = Math.max(0, Math.floor(totalSlots))
  const safeAssignedSlots = Math.min(
    safeTotalSlots,
    Math.max(0, Math.floor(assignedSlots)),
  )

  if (safeTotalSlots === 0) {
    return {
      totalSlots: 0,
      assignedSlots: 0,
      openSlots: 0,
      fillPercent: 0,
      status: 'unconfigured',
    }
  }

  const openSlots = safeTotalSlots - safeAssignedSlots
  return {
    totalSlots: safeTotalSlots,
    assignedSlots: safeAssignedSlots,
    openSlots,
    fillPercent: Math.round((safeAssignedSlots / safeTotalSlots) * 100),
    status: openSlots === 0 ? 'full' : 'needsMembers',
  }
}

export type RecruitmentReadinessState =
  | 'hidden'
  | 'paused'
  | 'incomplete'
  | 'ready'

export type RecruitmentReadinessMissing =
  | 'profile'
  | 'invite'
  | 'roles'
  | 'joinSteps'

export interface RecruitmentReadinessInput {
  profileEnabled: boolean
  recruitmentStatus: 'open' | 'selective' | 'closed'
  discordInviteUrl: string
  recruitingRoles: string
  joinSteps: string
}

export interface RecruitmentReadinessSummary {
  state: RecruitmentReadinessState
  missing: RecruitmentReadinessMissing[]
}

export function summarizeRecruitmentReadiness({
  profileEnabled,
  recruitmentStatus,
  discordInviteUrl,
  recruitingRoles,
  joinSteps,
}: RecruitmentReadinessInput): RecruitmentReadinessSummary {
  if (!profileEnabled) return { state: 'hidden', missing: ['profile'] }
  if (recruitmentStatus === 'closed') return { state: 'paused', missing: [] }

  const missing: RecruitmentReadinessMissing[] = []
  if (!discordInviteUrl.trim()) missing.push('invite')
  if (!recruitingRoles.trim()) missing.push('roles')
  if (!joinSteps.trim()) missing.push('joinSteps')

  return {
    state: missing.length > 0 ? 'incomplete' : 'ready',
    missing,
  }
}
