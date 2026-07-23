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
  hasMetTarget: boolean
  missingVideoCount: number
  submittedVideoCount: number
}

export interface AllianceContentStatsWindow {
  windowDays: 7 | 30
  totalSessions: number
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
  policy: {
    weeklyMinSessions: number
    weeklyMinParticipationRate: number
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
  const sessionIds = new Set(
    input.sessions
      .filter((session) => {
        const endedAtMs = Date.parse(session.endedAt)
        return Number.isFinite(endedAtMs) && endedAtMs >= cutoffMs && endedAtMs <= input.now.getTime()
      })
      .map((session) => session.id),
  )
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
  const members = input.members.map((member) => {
    const participationCount = participationIdsByMember.get(member.discordId)?.size ?? 0
    const participationRate =
      totalSessions === 0 ? 0 : Math.round((participationCount / totalSessions) * 100)
    const requirements = requirementsByMember.get(member.discordId) ?? []
    return {
      ...member,
      participationCount,
      participationRate,
      targetSessionCount,
      hasMetTarget:
        participationCount >= targetSessionCount &&
        participationRate >= input.policy.weeklyMinParticipationRate,
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
    return left.username.localeCompare(right.username)
  })
  const achievedMemberCount = members.filter((member) => member.hasMetTarget).length
  const rateTotal = members.reduce((total, member) => total + member.participationRate, 0)

  return {
    windowDays,
    totalSessions,
    activeMemberCount: members.length,
    achievedMemberCount,
    belowMemberCount: members.length - achievedMemberCount,
    averageParticipationRate: members.length === 0 ? 0 : Math.round(rateTotal / members.length),
    members,
  }
}
