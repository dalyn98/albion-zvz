export const DEFAULT_ROLE_EXPERIENCE_HIGHLIGHT_THRESHOLD = 5

export interface RoleExperienceTarget {
  discordId: string
  roleName: string
}

export type RoleExperienceCounts = Record<string, Record<string, number>>

export interface RoleExperienceSlotLike {
  assigned_discord_id?: string | null
  requested_discord_id?: string | null
  role_name?: string | null
}

export interface RoleExperiencePartyLike {
  slots?: readonly RoleExperienceSlotLike[] | null
}

export interface RoleExperienceRow {
  assigned_discord_id: string | null
  role_name: string | null
  parties: { event_id: string | null } | Array<{ event_id: string | null }> | null
}

export function collectRoleExperienceTargets(
  parties: readonly RoleExperiencePartyLike[],
): RoleExperienceTarget[] {
  const seen = new Set<string>()
  const targets: RoleExperienceTarget[] = []

  for (const party of parties) {
    for (const slot of party.slots ?? []) {
      const roleName = normalizeRoleName(slot.role_name)
      if (!roleName) continue

      for (const discordId of [slot.assigned_discord_id, slot.requested_discord_id]) {
        if (!discordId) continue
        const key = targetKey(discordId, roleName)
        if (seen.has(key)) continue
        seen.add(key)
        targets.push({ discordId, roleName })
      }
    }
  }

  return targets
}

export function buildRoleExperienceCounts(
  rows: readonly RoleExperienceRow[],
  currentEventId: string,
): RoleExperienceCounts {
  const eventIdsByMemberRole = new Map<string, Map<string, Set<string>>>()

  for (const row of rows) {
    const discordId = row.assigned_discord_id
    const roleName = normalizeRoleName(row.role_name)
    const eventId = extractEventId(row.parties)
    if (!discordId || !roleName || !eventId || eventId === currentEventId) continue

    let roles = eventIdsByMemberRole.get(discordId)
    if (!roles) {
      roles = new Map<string, Set<string>>()
      eventIdsByMemberRole.set(discordId, roles)
    }

    let eventIds = roles.get(roleName)
    if (!eventIds) {
      eventIds = new Set<string>()
      roles.set(roleName, eventIds)
    }
    eventIds.add(eventId)
  }

  const counts: RoleExperienceCounts = {}
  for (const [discordId, roles] of eventIdsByMemberRole.entries()) {
    counts[discordId] = {}
    for (const [roleName, eventIds] of roles.entries()) {
      counts[discordId][roleName] = eventIds.size
    }
  }

  return counts
}

export function getRoleExperienceCount(
  counts: RoleExperienceCounts,
  discordId: string | null | undefined,
  roleName: string | null | undefined,
): number | null {
  const normalizedRole = normalizeRoleName(roleName)
  if (!discordId || !normalizedRole) return null
  return counts[discordId]?.[normalizedRole] ?? 0
}

export function isRoleExperienceHighlighted(
  count: number,
  threshold: number = DEFAULT_ROLE_EXPERIENCE_HIGHLIGHT_THRESHOLD,
): boolean {
  return count >= threshold
}

function normalizeRoleName(roleName: string | null | undefined): string | null {
  const normalized = roleName?.trim()
  if (!normalized) return null
  if (normalized === 'Dps' || normalized === 'BrawlerDps') return 'EngageDps'
  return normalized
}

function targetKey(discordId: string, roleName: string): string {
  return `${discordId}\u0000${roleName}`
}

function extractEventId(
  party: RoleExperienceRow['parties'],
): string | null {
  const normalized = Array.isArray(party) ? party[0] : party
  return normalized?.event_id ?? null
}
