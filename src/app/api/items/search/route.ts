import { NextRequest, NextResponse } from 'next/server'
import items from '@/data/albion-items.json'
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from '@/i18n/locales'

// Keep the default Node.js runtime. Vercel Fluid Compute is the platform default
// and avoids Edge runtime compatibility drift while this route stays pure
// in-memory filtering with no network round-trips per request.

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
const MAX_QUERY_LENGTH = 80
const MAX_CATEGORY_FILTERS = 8
const MAX_CATEGORY_LENGTH = 32
const CATEGORY_RE = /^[a-z0-9_-]+$/
const TIER_RE = /^[1-8]$/

function readLocale(request: NextRequest): Locale {
  const value = request.cookies.get(LOCALE_COOKIE)?.value
  return isLocale(value) ? value : DEFAULT_LOCALE
}

function normalizeQuery(value: string | null): string | null {
  const q = value?.trim().toLowerCase()
  if (!q || q.length < 2 || q.length > MAX_QUERY_LENGTH) return null
  return q
}

function normalizeCategories(value: string | null): string[] {
  if (!value) return []
  const categories: string[] = []
  for (const raw of value.split(',')) {
    const category = raw.trim().toLowerCase()
    if (!category || category.length > MAX_CATEGORY_LENGTH || !CATEGORY_RE.test(category)) continue
    if (!categories.includes(category)) categories.push(category)
    if (categories.length >= MAX_CATEGORY_FILTERS) break
  }
  return categories
}

function jsonWithLocaleVary(body: unknown) {
  const response = NextResponse.json(body)
  response.headers.set('Vary', 'Cookie')
  return response
}

export function GET(request: NextRequest) {
  const q = normalizeQuery(request.nextUrl.searchParams.get('q'))
  // Comma-separated categories — e.g. `weapon,mount` so the weapon picker can
  // also surface battle mounts. An empty list means no category filter.
  const categories = normalizeCategories(request.nextUrl.searchParams.get('category'))
  const tierRaw = request.nextUrl.searchParams.get('tier')?.trim()
  const tierPrefix = tierRaw && TIER_RE.test(tierRaw) ? `t${tierRaw}_` : null

  if (!q) return jsonWithLocaleVary([])

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
  return jsonWithLocaleVary(results)
}
