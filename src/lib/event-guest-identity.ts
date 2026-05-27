export const ANONYMOUS_EVENT_GUEST_ID_PREFIX = 'guest_'

export function createAnonymousEventGuestId(): string {
  return `${ANONYMOUS_EVENT_GUEST_ID_PREFIX}${crypto.randomUUID()}`
}

export function isAnonymousEventGuestId(discordId: string | null | undefined): boolean {
  return typeof discordId === 'string' && discordId.startsWith(ANONYMOUS_EVENT_GUEST_ID_PREFIX)
}
