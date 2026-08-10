import { NextRequest, NextResponse } from 'next/server'
import items from '@/data/albion-items.json'
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/locales'

interface BundledItem {
  u: string
  d: string
  dj: string
  de: string
  dz: string
  l?: Partial<Record<Locale, string>>
}

const ITEMS_BY_ID = new Map<string, BundledItem>()
for (const item of items as BundledItem[]) ITEMS_BY_ID.set(item.u, item)

const MAX_IDS = 50
const MAX_ID_LENGTH = 160
const ITEM_ID_RE = /^[A-Za-z0-9_@.-]+$/
const NAMES_CACHE_CONTROL =
  'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800'

function localizedName(item: BundledItem, locale: Locale): string {
  const officialName = item.l?.[locale]
  if (officialName) return officialName
  if (locale === 'ja') return item.dj
  if (locale === 'en') return item.de
  if (locale === 'zh') return item.dz
  return item.d
}

export function GET(request: NextRequest) {
  const localeParam = request.nextUrl.searchParams.get('locale')
  const locale = isLocale(localeParam) ? localeParam : DEFAULT_LOCALE
  const requestedIds = request.nextUrl.searchParams.getAll('id')
  const ids: string[] = []

  for (const rawId of requestedIds) {
    const id = rawId.trim()
    if (!id || id.length > MAX_ID_LENGTH || !ITEM_ID_RE.test(id) || ids.includes(id)) continue
    ids.push(id)
    if (ids.length >= MAX_IDS) break
  }

  const names: Record<string, string> = {}
  for (const id of ids) {
    const item = ITEMS_BY_ID.get(id)
    if (item) names[id] = localizedName(item, locale)
  }

  const response = NextResponse.json({ names })
  response.headers.set('Cache-Control', NAMES_CACHE_CONTROL)
  return response
}
