import { tenantDateKey } from '@/lib/timezone'

const DAY_MS = 24 * 60 * 60 * 1000
export interface AllianceContentStatsMemberInput {
  discordId: string
  username: string
}

export interface AllianceContentStatsSessionInput {
  id: string
  endedAt: string
}

export interface AllianceContentStatsParticipationInput {
  sessionId: string
  discordId: string
}

export interface AllianceContentStatsRequirementInput {
  discordId: string
  status: 'open' | 'submitted' | 'approved' | 'overdue' | 'waived'
}

export interface AllianceContentMemberStats {
  discordId: string
  username: string
  participationCount: number
  participationRate: number
  targetSessionCount: number
  participationDayCount: number
  targetParticipationDayCount: number
  sessionTargetMet: boolean
  participationDaysTargetMet: boolean
  hasMetTarget: boolean
  missingVideoCount: number
  submittedVideoCount: number
}

export interface AllianceContentStatsWindow {
  windowDays: 7 | 30
  totalSessions: number
  totalActiveDays: number
  activeMemberCount: number
  achievedMemberCount: number
  belowMemberCount: number
  averageParticipationRate: number
  members: AllianceContentMemberStats[]
}

export interface AllianceContentStats {
  sevenDays: AllianceContentStatsWindow
  thirtyDays: AllianceContentStatsWindow
}

interface BuildAllianceContentStatsInput {
  now: Date
  timeZone: string
  policy: {
    sessionTargetEnabled: boolean
    participationDaysTargetEnabled: boolean
    weeklyMinSessions: number
    weeklyMinParticipationRate: number
    weeklyMinParticipationDays: number
  }
  members: readonly AllianceContentStatsMemberInput[]
  sessions: readonly AllianceContentStatsSessionInput[]
  participations: readonly AllianceContentStatsParticipationInput[]
  requirements: readonly AllianceContentStatsRequirementInput[]
}

export function buildAllianceContentStats(
  input: BuildAllianceContentStatsInput,
): AllianceContentStats {
  return {
    sevenDays: buildStatsWindow(input, 7),
    thirtyDays: buildStatsWindow(input, 30),
  }
}

function buildStatsWindow(
  input: BuildAllianceContentStatsInput,
  windowDays: 7 | 30,
): AllianceContentStatsWindow {
  const cutoffMs = input.now.getTime() - windowDays * DAY_MS
  const sessions = input.sessions
    .filter((session) => {
      const endedAtMs = Date.parse(session.endedAt)
      return Number.isFinite(endedAtMs) && endedAtMs >= cutoffMs && endedAtMs <= input.now.getTime()
    })
  const sessionIds = new Set(sessions.map((session) => session.id))
  const dateKeyBySessionId = new Map(
    sessions.map((session) => [session.id, tenantDateKey(session.endedAt, input.timeZone)]),
  )
  const activeDayKeys = new Set(dateKeyBySessionId.values())
  const participationIdsByMember = new Map<string, Set<string>>()
  for (const participation of input.participations) {
    if (!sessionIds.has(participation.sessionId)) continue
    const ids = participationIdsByMember.get(participation.discordId) ?? new Set<string>()
    ids.add(participation.sessionId)
    participationIdsByMember.set(participation.discordId, ids)
  }
  const requirementsByMember = new Map<string, AllianceContentStatsRequirementInput[]>()
  for (const requirement of input.requirements) {
    const requirements = requirementsByMember.get(requirement.discordId) ?? []
    requirementsByMember.set(requirement.discordId, [...requirements, requirement])
  }

  const totalSessions = sessionIds.size
  const targetSessionCount = Math.ceil(
    input.policy.weeklyMinSessions * (windowDays / 7),
  )
  const targetParticipationDayCount = Math.ceil(
    input.policy.weeklyMinParticipationDays * (windowDays / 7),
  )
  const members = input.members.map((member) => {
    const participationIds = participationIdsByMember.get(member.discordId) ?? new Set<string>()
    const participationCount = participationIds.size
    const participationDayCount = new Set(
      Array.from(participationIds)
        .map((sessionId) => dateKeyBySessionId.get(sessionId))
        .filter((dateKey): dateKey is string => dateKey !== undefined),
    ).size
    const participationRate =
      totalSessions === 0 ? 0 : Math.round((participationCount / totalSessions) * 100)
    const requirements = requirementsByMember.get(member.discordId) ?? []
    const sessionTargetMet =
      participationCount >= targetSessionCount &&
      participationRate >= input.policy.weeklyMinParticipationRate
    const participationDaysTargetMet =
      participationDayCount >= targetParticipationDayCount
    return {
      ...member,
      participationCount,
      participationRate,
      targetSessionCount,
      participationDayCount,
      targetParticipationDayCount,
      sessionTargetMet,
      participationDaysTargetMet,
      hasMetTarget:
        (input.policy.sessionTargetEnabled && sessionTargetMet) ||
        (input.policy.participationDaysTargetEnabled && participationDaysTargetMet),
      missingVideoCount: requirements.filter(
        (requirement) => requirement.status === 'open' || requirement.status === 'overdue',
      ).length,
      submittedVideoCount: requirements.filter(
        (requirement) => requirement.status === 'submitted',
      ).length,
    }
  }).sort((left, right) => {
    if (left.hasMetTarget !== right.hasMetTarget) return left.hasMetTarget ? 1 : -1
    if (left.participationRate !== right.participationRate) {
      return left.participationRate - right.participationRate
    }
    if (left.participationDayCount !== right.participationDayCount) {
      return left.participationDayCount - right.participationDayCount
    }
    return left.username.localeCompare(right.username)
  })
  const achievedMemberCount = members.filter((member) => member.hasMetTarget).length
  const rateTotal = members.reduce((total, member) => total + member.participationRate, 0)

  return {
    windowDays,
    totalSessions,
    totalActiveDays: activeDayKeys.size,
    activeMemberCount: members.length,
    achievedMemberCount,
    belowMemberCount: members.length - achievedMemberCount,
    averageParticipationRate: members.length === 0 ? 0 : Math.round(rateTotal / members.length),
    members,
  }
}
