import { compareStrings } from './sort-strings'

export interface AssignableMember {
  discordId: string
  username: string
  avatar: string | null
  alreadyInEvent: boolean
}

export type AssignableMemberFilter = 'all' | 'available' | 'assigned'

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

function matchScore(member: AssignableMember, query: string): number {
  if (!query) return 10
  const username = normalize(member.username)
  const discordId = normalize(member.discordId)
  if (username === query) return 0
  if (username.startsWith(query)) return 1
  if (username.split(/\s+/).some((part) => part.startsWith(query))) return 2
  if (username.includes(query)) return 3
  if (discordId.includes(query)) return 4
  return Number.POSITIVE_INFINITY
}

export function filterAssignableMembers(
  members: readonly AssignableMember[],
  rawQuery: string,
  filter: AssignableMemberFilter,
): AssignableMember[] {
  const query = normalize(rawQuery)
  return members
    .filter((member) => {
      if (filter === 'available' && member.alreadyInEvent) return false
      if (filter === 'assigned' && !member.alreadyInEvent) return false
      return matchScore(member, query) < Number.POSITIVE_INFINITY
    })
    .sort((a, b) => {
      const statusDelta = Number(a.alreadyInEvent) - Number(b.alreadyInEvent)
      if (statusDelta !== 0) return statusDelta
      const scoreDelta = matchScore(a, query) - matchScore(b, query)
      if (scoreDelta !== 0) return scoreDelta
      return compareStrings(a.username, b.username)
    })
}
