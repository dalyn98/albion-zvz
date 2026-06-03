import { EVENT_CATEGORIES, type EventCategory } from '@/types'

export interface RegearAssignedSlotCandidate {
  eventId: string | null | undefined
  roleName: string | null | undefined
}

export interface RegearEligibleEventCandidate {
  eventId: string
  category: EventCategory | string | null | undefined
}

export function buildRegearEventRoleMap(
  slots: readonly RegearAssignedSlotCandidate[],
): Map<string, string> {
  const eventToRole = new Map<string, string>()
  for (const slot of slots) {
    const eventId = slot.eventId
    if (!eventId) continue
    const role = (slot.roleName ?? '').trim()
    const previous = eventToRole.get(eventId)
    if (previous === undefined || (previous.length === 0 && role.length > 0)) {
      eventToRole.set(eventId, role)
    }
  }
  return eventToRole
}

function normalizeEventCategory(category: EventCategory | string | null | undefined): EventCategory {
  return EVENT_CATEGORIES.includes(category as EventCategory) ? (category as EventCategory) : '전투'
}

export function buildManualRegearEligibilityRoleMap(
  events: readonly RegearEligibleEventCandidate[],
  slotRoleByEvent: ReadonlyMap<string, string>,
  participantRoleByEvent: ReadonlyMap<string, string>,
): Map<string, string> {
  const eventToRole = new Map<string, string>()
  for (const event of events) {
    const role =
      normalizeEventCategory(event.category) === '전투'
        ? slotRoleByEvent.get(event.eventId)
        : participantRoleByEvent.get(event.eventId)
    if (role !== undefined) eventToRole.set(event.eventId, role)
  }
  return eventToRole
}
