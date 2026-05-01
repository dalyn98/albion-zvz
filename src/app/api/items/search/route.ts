import { NextRequest, NextResponse } from 'next/server'
import items from '@/data/albion-items.json'
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from '@/i18n/locales'

// Edge runtime has sub-50ms cold starts and runs in the nearest region. The
// bundled items list is 45KB — well under any Edge size limit — and all
// filtering is pure CPU on in-memory data. No network round-trips per request.
export const runtime = 'edge'

interface BundledItem {
  u: string // UniqueName
  c: string // category
  e: string // lowercased EN-US
  k: string // lowercased KO-KR
  j: string // lowercased JA-JP
  z: string // lowercased ZH-CN
  d: string // displayName (KO > EN > id)
  dj: string // displayName (JA > EN > id)
  de: string // displayName (EN > id)
  dz: string // displayName (ZH-CN > EN > id)
}

const ITEMS = items as BundledItem[]

const MAX_RESULTS = 30

function readLocale(request: NextRequest): Locale {
  const value = request.cookies.get(LOCALE_COOKIE)?.value
  return isLocale(value) ? value : DEFAULT_LOCALE
}

export function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim().toLowerCase()
  // Comma-separated categories — e.g. `weapon,mount` so the weapon picker can
  // also surface battle mounts. An empty list means no category filter.
  const categoryRaw = request.nextUrl.searchParams.get('category')?.trim().toLowerCase()
  const categories = categoryRaw ? categoryRaw.split(',').map((c) => c.trim()).filter(Boolean) : []
  const tierRaw = request.nextUrl.searchParams.get('tier')?.trim()
  const tierPrefix = tierRaw && /^\d+$/.test(tierRaw) ? `t${tierRaw}_` : null

  if (!q || q.length < 2) return NextResponse.json([])

  const locale = readLocale(request)
  const results: { uniqueName: string; displayName: string }[] = []
  for (const item of ITEMS) {
    if (categories.length && !categories.includes(item.c)) continue
    if (tierPrefix && !item.u.toLowerCase().startsWith(tierPrefix)) continue
    // Match across EN + KO + JA + ZH so any-locale user searching any-locale
    // name still hits. Display name follows the active locale.
    if (!item.e.includes(q) && !item.k.includes(q) && !item.j.includes(q) && !item.z.includes(q)) continue
    const displayName = locale === 'ja'
      ? item.dj
      : locale === 'en'
        ? item.de
        : locale === 'zh'
          ? item.dz
          : item.d
    results.push({ uniqueName: item.u, displayName })
    if (results.length >= MAX_RESULTS) break
  }
  return NextResponse.json(results)
}
