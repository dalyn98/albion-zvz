import type { CraftQueueItem } from '@/app/actions/craft'
import { compareStrings } from '@/lib/sort-strings'
import { DEFAULT_TENANT_TIMEZONE, toZonedParts } from '@/lib/timezone'

export const NO_EVENT_KEY = '__none__'

export interface EventGroup {
  // group key: eventId, 또는 NO_EVENT_KEY (이벤트 미연결)
  key: string
  eventId: string | null
  eventTitle: string
  gatherAt: string | null
  items: CraftQueueItem[]
  totalClaimedSilver: number
}

// 같은 event_id 끼리 묶고, 모임 시각 오름차순(미정/미연결은 뒤)으로 정렬한다.
export function groupByEvent(items: CraftQueueItem[]): EventGroup[] {
  const map = new Map<string, EventGroup>()
  for (const item of items) {
    const key = item.eventId ?? NO_EVENT_KEY
    let g = map.get(key)
    if (!g) {
      g = {
        key,
        eventId: item.eventId,
        eventTitle: item.eventTitle,
        gatherAt: item.gatherAt,
        items: [],
        totalClaimedSilver: 0,
      }
      map.set(key, g)
    }
    g.items.push(item)
    if (item.claimedSilver != null) g.totalClaimedSilver += item.claimedSilver
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.key === NO_EVENT_KEY) return 1
    if (b.key === NO_EVENT_KEY) return -1
    if (!a.gatherAt && !b.gatherAt) return compareStrings(a.eventTitle, b.eventTitle)
    if (!a.gatherAt) return 1
    if (!b.gatherAt) return -1
    return new Date(a.gatherAt).getTime() - new Date(b.gatherAt).getTime()
  })
}

// Pin to a fixed timezone (DEFAULT_TENANT_TIMEZONE) instead of `new Date().getX()`,
// which reads the host TZ. SSR runs on Vercel (UTC) while clients are usually
// KST/JST, so the same iso renders different MM/DD HH:MM on each side and
// trips React #418 hydration mismatch.
export function formatGatherTime(
  iso: string,
  timezone: string = DEFAULT_TENANT_TIMEZONE,
): string {
  const p = toZonedParts(iso, timezone)
  const m = String(p.month).padStart(2, '0')
  const day = String(p.day).padStart(2, '0')
  const hh = String(p.hour).padStart(2, '0')
  const mm = String(p.minute).padStart(2, '0')
  return `${m}/${day} ${hh}:${mm}`
}
