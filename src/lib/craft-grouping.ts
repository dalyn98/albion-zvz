import type { CraftQueueItem } from '@/app/actions/craft'

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
    if (!a.gatherAt && !b.gatherAt) return a.eventTitle.localeCompare(b.eventTitle)
    if (!a.gatherAt) return 1
    if (!b.gatherAt) return -1
    return new Date(a.gatherAt).getTime() - new Date(b.gatherAt).getTime()
  })
}

export function formatGatherTime(iso: string): string {
  const d = new Date(iso)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${m}/${day} ${hh}:${mm}`
}
