export const ADMIN_NOTIFICATION_TOPICS = [
  'regear',
  'exchange',
  'donation',
  'shop',
  'event_payout',
  'craft',
  'sync',
  'members',
] as const

export type AdminNotificationTopic = (typeof ADMIN_NOTIFICATION_TOPICS)[number]

export const DEFAULT_ADMIN_NOTIFICATION_TOPICS: readonly AdminNotificationTopic[] =
  ADMIN_NOTIFICATION_TOPICS

const TOPIC_SET: ReadonlySet<string> = new Set(ADMIN_NOTIFICATION_TOPICS)

export function isAdminNotificationTopic(value: unknown): value is AdminNotificationTopic {
  return typeof value === 'string' && TOPIC_SET.has(value)
}

export function parseAdminNotificationTopics(
  raw: string | null | undefined,
  fallback: readonly AdminNotificationTopic[] = DEFAULT_ADMIN_NOTIFICATION_TOPICS,
): AdminNotificationTopic[] {
  if (!raw) return [...fallback]
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [...fallback]
    const clean: AdminNotificationTopic[] = []
    for (const value of parsed) {
      if (isAdminNotificationTopic(value) && !clean.includes(value)) {
        clean.push(value)
      }
    }
    return clean
  } catch {
    return [...fallback]
  }
}
