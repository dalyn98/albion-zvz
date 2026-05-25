import type { SessionPayload } from '@/lib/session'

export function getEventInteractionSession(input: {
  session: SessionPayload | null
  sessionGuildId: string | null
  eventGuildId: string
  eventId: string
}): SessionPayload | null {
  const { session, sessionGuildId, eventGuildId, eventId } = input
  if (!session) return null
  if (sessionGuildId !== eventGuildId) return null
  if (!session.isMember && !session.isAdmin && !session.isGuest) return null
  if (session.isGuest && session.eventScope !== eventId) return null
  return session
}
