// 마케팅 페이지(`/landing`, `/features`)의 스크린샷 슬롯.
// DB 백킹 — 슈퍼어드민이 `/super-admin/marketing-screenshots` 에서 업로드/관리.
// 슬롯당 여러 장 허용, position 으로 정렬, 캐러셀로 표시.

import { unstable_cache } from 'next/cache'
import { getAdminClient } from '@/lib/supabase-admin'

// landing 은 force-dynamic 이라 매 요청마다 동일한 DB SELECT 가 반복된다.
// 슈퍼어드민 업로드 빈도는 극히 낮으므로(주~월 단위) tag-invalidated cache 로 묶어
// 마케팅 트래픽 전체에 대해 사실상 메모리 응답으로 만든다. write 경로
// (`actions/marketing-screenshots.ts`) 의 revalidate() 가 같은 tag 로 무효화.
export const MARKETING_SCREENSHOTS_TAG = 'marketing-screenshots'

export type MarketingScreenshotKey = 'events' | 'regear' | 'craft' | 'shop' | 'stats' | 'builds'

export const MARKETING_SCREENSHOT_KEYS: MarketingScreenshotKey[] = [
  'events',
  'regear',
  'builds',
  'craft',
  'shop',
  'stats',
]

export interface MarketingScreenshotImage {
  id: string
  url: string
  alt: string | null
  position: number
  source: 'database' | 'fallback'
}

export type MarketingScreenshotsBySlot = Record<MarketingScreenshotKey, MarketingScreenshotImage[]>

function emptyMap(): MarketingScreenshotsBySlot {
  return {
    events: [],
    regear: [],
    builds: [],
    craft: [],
    shop: [],
    stats: [],
  }
}

function fallbackMap(): MarketingScreenshotsBySlot {
  const map = emptyMap()
  map.events.push({
    id: 'fallback-events-demo',
    url: '/screenshots/events-demo.png',
    alt: 'Event detail and slot signup demo screen',
    position: 0,
    source: 'fallback',
  })
  map.regear.push({
    id: 'fallback-regear-approval-demo',
    url: '/screenshots/regear-approval-demo.png',
    alt: 'Regear approval workflow demo screen',
    position: 0,
    source: 'fallback',
  })
  map.builds.push({
    id: 'fallback-builds-demo',
    url: '/screenshots/builds-demo.png',
    alt: 'Build template palette demo screen',
    position: 0,
    source: 'fallback',
  })
  map.craft.push({
    id: 'fallback-craft-demo',
    url: '/screenshots/craft-demo.png',
    alt: 'Crafting queue and task management demo screen',
    position: 0,
    source: 'fallback',
  })
  map.shop.push({
    id: 'fallback-shop-demo',
    url: '/screenshots/shop-demo.png',
    alt: 'Guild shop catalog demo screen',
    position: 0,
    source: 'fallback',
  })
  map.stats.push({
    id: 'fallback-stats-demo',
    url: '/screenshots/stats-demo.png',
    alt: 'Guild statistics dashboard demo screen',
    position: 0,
    source: 'fallback',
  })
  return map
}

function withFallbacks(map: MarketingScreenshotsBySlot): MarketingScreenshotsBySlot {
  const fallbacks = fallbackMap()
  return {
    events: map.events.length > 0 ? map.events : fallbacks.events,
    regear: map.regear.length > 0 ? map.regear : fallbacks.regear,
    builds: map.builds.length > 0 ? map.builds : fallbacks.builds,
    craft: map.craft.length > 0 ? map.craft : fallbacks.craft,
    shop: map.shop.length > 0 ? map.shop : fallbacks.shop,
    stats: map.stats.length > 0 ? map.stats : fallbacks.stats,
  }
}

function isValidSlot(value: unknown): value is MarketingScreenshotKey {
  return (
    typeof value === 'string' &&
    (MARKETING_SCREENSHOT_KEYS as readonly string[]).includes(value)
  )
}

function hasMarketingScreenshotDbEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

async function loadMarketingScreenshotsUncached(): Promise<MarketingScreenshotsBySlot> {
  if (!hasMarketingScreenshotDbEnv()) return fallbackMap()

  const db = getAdminClient()
  const { data, error } = await db
    .from('marketing_screenshots')
    .select('id, slot, position, image_url, alt_text')
    .order('slot', { ascending: true })
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  if (error || !data) return fallbackMap()

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
      source: 'database',
    })
  }
  return withFallbacks(map)
}

// revalidate 1 h — write 시 tag 무효화로 즉시 갱신되므로 안전망용 상한.
export const loadMarketingScreenshots = unstable_cache(
  loadMarketingScreenshotsUncached,
  ['marketing-screenshots:all:v2'],
  { tags: [MARKETING_SCREENSHOTS_TAG], revalidate: 3600 },
)
