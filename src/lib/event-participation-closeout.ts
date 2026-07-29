export type EventParticipationEvidenceStatus =
  'activity_confirmed' | 'activity_not_found' | 'activity_only' | 'not_checked'

export const EVENT_PARTICIPATION_REWARD_MAX = 2_000_000_000

export interface EventParticipationAssignmentSeed {
  discordId: string
  username: string
  roleName: string | null
}

export interface EventParticipationActivitySeed {
  discordId: string | null
  username: string
  battleCount: number
  albionPlayerId?: string | null
}

export interface EventParticipationTentativeSeed {
  discordId: string
  username: string
  possibleRoles: string[]
  notes: string | null
}

export interface EventParticipationDirectorySeed {
  discordId: string
  username: string
  albionNickname?: string | null
  avatar?: string | null
}

export interface EventParticipationCloseoutCandidate {
  discordId: string
  username: string
  roleNames: string[]
  activityBattleCount: number
  evidenceStatus: Extract<
    EventParticipationEvidenceStatus,
    'activity_confirmed' | 'activity_not_found' | 'not_checked'
  >
  defaultIncluded: true
}

export type EventParticipationSuggestionContext = 'activity' | 'directory'

export interface EventParticipationCloseoutSuggestion {
  discordId: string
  username: string
  albionNickname: string | null
  avatar: string | null
  activityBattleCount: number
  evidenceStatus: Extract<
    EventParticipationEvidenceStatus,
    'activity_only' | 'not_checked'
  >
  context: EventParticipationSuggestionContext
  possibleRoles: string[]
  tentativeNotes: string | null
}

export interface EventParticipationUnresolvedActivity {
  key: string
  username: string
  battleCount: number
  albionPlayerId: string | null
}

export interface EventParticipationCloseoutModel {
  candidates: EventParticipationCloseoutCandidate[]
  suggestions: EventParticipationCloseoutSuggestion[]
  unresolvedActivity: EventParticipationUnresolvedActivity[]
  tentativeContextCount: number
  mismatchCount: number
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function cleanBattleCount(value: unknown): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : 0
}

function cleanRoles(values: readonly string[]): string[] {
  return Array.from(
    new Set(values.map(cleanText).filter((value) => value.length > 0)),
  ).sort((a, b) => a.localeCompare(b))
}

function preferUsername(
  current: string,
  next: string,
  discordId: string,
): string {
  const cleanCurrent = cleanText(current)
  const cleanNext = cleanText(next)
  if (!cleanCurrent || cleanCurrent === discordId) return cleanNext || discordId
  return cleanCurrent
}

/**
 * Slot assignments are the only default candidates. Battle activity and
 * tentative availability are supporting context: they may highlight an
 * exception, but never promote a member into the final roster automatically.
 */
export function buildEventParticipationCloseoutModel(input: {
  assignments: readonly EventParticipationAssignmentSeed[]
  activities: readonly EventParticipationActivitySeed[]
  tentative: readonly EventParticipationTentativeSeed[]
  directory: readonly EventParticipationDirectorySeed[]
  activityChecked: boolean
}): EventParticipationCloseoutModel {
  const activityByDiscord = new Map<
    string,
    { username: string; battleCount: number }
  >()
  const unresolvedActivity: EventParticipationUnresolvedActivity[] = []
  input.activities.forEach((activity, index) => {
    const battleCount = cleanBattleCount(activity.battleCount)
    const discordId = cleanText(activity.discordId)
    if (!discordId) {
      unresolvedActivity.push({
        key:
          cleanText(activity.albionPlayerId) ||
          `${cleanText(activity.username) || 'unknown'}:${index}`,
        username: cleanText(activity.username) || 'Unknown',
        battleCount,
        albionPlayerId: cleanText(activity.albionPlayerId) || null,
      })
      return
    }
    const existing = activityByDiscord.get(discordId)
    activityByDiscord.set(discordId, {
      username: preferUsername(
        existing?.username ?? '',
        activity.username,
        discordId,
      ),
      battleCount: Math.max(existing?.battleCount ?? 0, battleCount),
    })
  })

  const assignmentsByDiscord = new Map<
    string,
    { username: string; roleNames: string[] }
  >()
  for (const assignment of input.assignments) {
    const discordId = cleanText(assignment.discordId)
    if (!discordId) continue
    const existing = assignmentsByDiscord.get(discordId)
    assignmentsByDiscord.set(discordId, {
      username: preferUsername(
        existing?.username ?? '',
        assignment.username,
        discordId,
      ),
      roleNames: cleanRoles([
        ...(existing?.roleNames ?? []),
        cleanText(assignment.roleName),
      ]),
    })
  }

  const candidates = Array.from(
    assignmentsByDiscord,
    ([discordId, assignment]) => {
      const activity = activityByDiscord.get(discordId)
      const activityBattleCount = activity?.battleCount ?? 0
      return {
        discordId,
        username: preferUsername(
          assignment.username,
          activity?.username ?? '',
          discordId,
        ),
        roleNames: assignment.roleNames,
        activityBattleCount,
        evidenceStatus: input.activityChecked
          ? activityBattleCount > 0
            ? ('activity_confirmed' as const)
            : ('activity_not_found' as const)
          : ('not_checked' as const),
        defaultIncluded: true as const,
      }
    },
  ).sort(
    (a, b) =>
      Number(a.evidenceStatus !== 'activity_not_found') -
        Number(b.evidenceStatus !== 'activity_not_found') ||
      a.username.localeCompare(b.username),
  )

  const tentativeByDiscord = new Map(
    input.tentative
      .map(
        (row) =>
          [
            cleanText(row.discordId),
            {
              username: cleanText(row.username),
              possibleRoles: cleanRoles(row.possibleRoles),
              notes: cleanText(row.notes) || null,
            },
          ] as const,
      )
      .filter(([discordId]) => discordId.length > 0),
  )
  const directoryByDiscord = new Map(
    input.directory
      .map(
        (row) =>
          [
            cleanText(row.discordId),
            {
              username: cleanText(row.username),
              albionNickname: cleanText(row.albionNickname) || null,
              avatar: cleanText(row.avatar) || null,
            },
          ] as const,
      )
      .filter(([discordId]) => discordId.length > 0),
  )

  // Tentative availability is deliberately absent from suggestionIds. A
  // selectable manual participant must also belong to the current guild
  // directory; activity without that identity is surfaced as unlinked context.
  const suggestionIds = new Set<string>(directoryByDiscord.keys())
  for (const discordId of assignmentsByDiscord.keys())
    suggestionIds.delete(discordId)

  for (const [discordId, activity] of activityByDiscord) {
    if (
      assignmentsByDiscord.has(discordId) ||
      directoryByDiscord.has(discordId)
    ) {
      continue
    }
    unresolvedActivity.push({
      key: discordId,
      username: activity.username,
      battleCount: activity.battleCount,
      albionPlayerId: null,
    })
  }

  const suggestions = Array.from(suggestionIds, (discordId) => {
    const activity = activityByDiscord.get(discordId)
    const tentative = tentativeByDiscord.get(discordId)
    const directory = directoryByDiscord.get(discordId)
    const context: EventParticipationSuggestionContext = activity
      ? 'activity'
      : 'directory'
    return {
      discordId,
      username: preferUsername(
        directory?.username ?? tentative?.username ?? '',
        activity?.username ?? '',
        discordId,
      ),
      albionNickname: directory?.albionNickname ?? null,
      avatar: directory?.avatar ?? null,
      activityBattleCount: activity?.battleCount ?? 0,
      evidenceStatus: activity
        ? ('activity_only' as const)
        : ('not_checked' as const),
      context,
      possibleRoles: tentative?.possibleRoles ?? [],
      tentativeNotes: tentative?.notes ?? null,
    }
  }).sort(
    (a, b) =>
      Number(a.context !== 'activity') - Number(b.context !== 'activity') ||
      a.username.localeCompare(b.username),
  )

  unresolvedActivity.sort(
    (a, b) =>
      b.battleCount - a.battleCount || a.username.localeCompare(b.username),
  )

  return {
    candidates,
    suggestions,
    unresolvedActivity,
    tentativeContextCount: tentativeByDiscord.size,
    mismatchCount:
      candidates.filter(
        (candidate) => candidate.evidenceStatus === 'activity_not_found',
      ).length +
      suggestions.filter((suggestion) => suggestion.context === 'activity')
        .length +
      unresolvedActivity.length,
  }
}
