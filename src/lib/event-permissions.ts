import { CAP, hasAnyCapability, hasCapability, parseCapabilities } from '@/lib/permissions'
import type { SessionPayload } from '@/lib/session-verify'
import { EVENT_CATEGORIES, type EventCategory } from '@/types'

export const EVENT_CREATE_CAP_BY_CATEGORY = {
  전투: CAP.EVENT_CREATE_COMBAT,
  FF: CAP.EVENT_CREATE_FF,
  갱킹: CAP.EVENT_CREATE_GANKING,
} as const satisfies Record<EventCategory, bigint>

export const EVENT_CREATE_OR_MANAGE_CAPS = [
  CAP.EVENT_CREATE_COMBAT,
  CAP.EVENT_CREATE_FF,
  CAP.EVENT_CREATE_GANKING,
  CAP.EVENT_MANAGE,
] as const

export function sessionCanCreateOrManageEvents(
  session: SessionPayload | null,
): session is SessionPayload {
  if (!session) return false
  if (session.isAdmin) return true
  const bits = parseCapabilities(session.capabilities)
  return session.canCreateEvents || hasAnyCapability(bits, EVENT_CREATE_OR_MANAGE_CAPS)
}

export function sessionCanCreateEventCategory(
  session: SessionPayload | null,
  category: EventCategory,
): session is SessionPayload {
  if (!session) return false
  if (session.isAdmin) return true
  const bits = parseCapabilities(session.capabilities)
  if (hasCapability(bits, CAP.EVENT_MANAGE)) return true
  return (
    session.eventCreatorCategories.includes(category) ||
    hasCapability(bits, EVENT_CREATE_CAP_BY_CATEGORY[category])
  )
}

export function getCreatableEventCategories(session: SessionPayload | null): EventCategory[] {
  if (!session) return []
  return EVENT_CATEGORIES.filter((category) => sessionCanCreateEventCategory(session, category))
}
