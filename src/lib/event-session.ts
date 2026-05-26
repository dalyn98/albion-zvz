import type { SessionPayload } from '@/lib/session'

export function getEventInteractionSession(input: {
  session: SessionPayload | null
  sessionGuildId: string | null
  eventGuildId: string
  eventId: string
  allowAllianceParticipant?: boolean
}): SessionPayload | null {
  const { session, sessionGuildId, eventGuildId, eventId, allowAllianceParticipant = false } = input
  if (!session) return null
  if (sessionGuildId !== eventGuildId) return null
  if (
    !session.isMember &&
    !session.isAdmin &&
    !session.isGuest &&
    !session.isBombSquadCaller &&
    !allowAllianceParticipant
  ) {
    return null
  }
  if (session.isGuest && session.eventScope !== eventId) return null
  return session
}
