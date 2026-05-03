// 마케팅 페이지(`/landing`, `/features`)의 스크린샷 슬롯.
// DB 백킹 — 슈퍼어드민이 `/super-admin/marketing-screenshots` 에서 업로드/관리.
// 슬롯당 여러 장 허용, position 으로 정렬, 캐러셀로 표시.

import { getAdminClient } from '@/lib/supabase-admin'

export type MarketingScreenshotKey = 'events' | 'regear' | 'craft' | 'shop' | 'stats'

export const MARKETING_SCREENSHOT_KEYS: MarketingScreenshotKey[] = [
  'events',
  'regear',
  'craft',
  'shop',
  'stats',
]

export interface MarketingScreenshotImage {
  id: string
  url: string
  alt: string | null
  position: number
}

export type MarketingScreenshotsBySlot = Record<MarketingScreenshotKey, MarketingScreenshotImage[]>

function emptyMap(): MarketingScreenshotsBySlot {
  return {
    events: [],
    regear: [],
    craft: [],
    shop: [],
    stats: [],
  }
}

function isValidSlot(value: unknown): value is MarketingScreenshotKey {
  return (
    typeof value === 'string' &&
    (MARKETING_SCREENSHOT_KEYS as readonly string[]).includes(value)
  )
}

export async function loadMarketingScreenshots(): Promise<MarketingScreenshotsBySlot> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('marketing_screenshots')
    .select('id, slot, position, image_url, alt_text')
    .order('slot', { ascending: true })
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  if (error || !data) return emptyMap()

  const map = emptyMap()
  for (const row of data as Array<{
    id: string
    slot: string
    position: number
    image_url: string
    alt_text: string | null
  }>) {
    if (!isValidSlot(row.slot)) continue
    map[row.slot].push({
      id: row.id,
      url: row.image_url,
      alt: row.alt_text,
      position: row.position,
    })
  }
  return map
}
