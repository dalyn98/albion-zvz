export const ADMIN_WORK_QUEUE_KEYS = [
  'regear',
  'exchange',
  'donation',
  'shop',
  'memberTrade',
  'eventPayout',
  'craft',
] as const

export type AdminWorkQueueKey = (typeof ADMIN_WORK_QUEUE_KEYS)[number]

export interface AdminWorkQueueItem {
  key: AdminWorkQueueKey
  count: number
  oldestCreatedAt: string | null
  href: string
}

export interface AdminWorkQueueSnapshot {
  items: AdminWorkQueueItem[]
  total: number
  counts: Record<AdminWorkQueueKey, number>
}

const ADMIN_WORK_QUEUE_HREFS: Record<AdminWorkQueueKey, string> = {
  regear: '/admin/dashboard/approvals?origin=all',
  exchange: '/admin/dashboard/approvals?tab=exchange',
  donation: '/admin/dashboard/approvals?tab=donation',
  shop: '/admin/dashboard/approvals?tab=shop',
  memberTrade: '/admin/dashboard/approvals?tab=member_trade',
  eventPayout: '/admin/dashboard/approvals?tab=event_payout',
  craft: '/admin/dashboard/approvals?tab=craft',
}

function isAdminWorkQueueKey(value: unknown): value is AdminWorkQueueKey {
  return typeof value === 'string' && (
    ADMIN_WORK_QUEUE_KEYS as readonly string[]
  ).includes(value)
}

function normalizeCount(value: unknown): number {
  const count = Number(value ?? 0)
  if (!Number.isSafeInteger(count) || count <= 0) return 0
  return count
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return Number.isFinite(Date.parse(value)) ? value : null
}

export function getAdminWorkQueueHref(key: AdminWorkQueueKey): string {
  return ADMIN_WORK_QUEUE_HREFS[key]
}

export function buildAdminWorkQueueSnapshot(
  rows: readonly Record<string, unknown>[],
): AdminWorkQueueSnapshot {
  const byKey = new Map<AdminWorkQueueKey, AdminWorkQueueItem>()

  for (const row of rows) {
    if (!isAdminWorkQueueKey(row.queue_key)) continue
    if (byKey.has(row.queue_key)) continue
    byKey.set(row.queue_key, {
      key: row.queue_key,
      count: normalizeCount(row.pending_count),
      oldestCreatedAt: normalizeTimestamp(row.oldest_created_at),
      href: getAdminWorkQueueHref(row.queue_key),
    })
  }

  const items = ADMIN_WORK_QUEUE_KEYS.map((key) => byKey.get(key) ?? {
    key,
    count: 0,
    oldestCreatedAt: null,
    href: getAdminWorkQueueHref(key),
  })
  const counts = Object.fromEntries(
    items.map((item) => [item.key, item.count]),
  ) as Record<AdminWorkQueueKey, number>

  return {
    items,
    total: items.reduce((sum, item) => sum + item.count, 0),
    counts,
  }
}
