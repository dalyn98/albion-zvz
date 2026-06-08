import type { Locale } from '@/i18n/locales'
import {
  getSeoFeatureCanonicalPathname,
  parseSeoFeaturePathname,
} from '@/lib/seo-locale-paths'

export type SearchConsoleDimension = 'date' | 'page' | 'query' | 'country' | 'device'

export interface SearchConsoleConfigStatus {
  configured: boolean
  siteUrl: string | null
  missing: string[]
}

export interface SearchAnalyticsRequest {
  startDate: string
  endDate: string
  dimensions: SearchConsoleDimension[]
  type: 'web'
  aggregationType: 'byPage'
  rowLimit: number
  startRow: number
  dataState: 'final'
}

export interface SearchConsoleApiRow {
  keys?: string[]
  clicks?: number
  impressions?: number
  ctr?: number
  position?: number
}

export interface SearchConsolePageIdentity {
  pagePath: string
  locale: Locale | null
  featureSlug: string | null
}

export interface SearchConsolePageMetric extends SearchConsolePageIdentity {
  date: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface SearchConsoleQueryMetric extends SearchConsolePageMetric {
  query: string
  country: string
  device: 'desktop' | 'mobile' | 'tablet' | 'unknown'
}

const REQUIRED_ENV_KEYS = [
  'GOOGLE_SEARCH_CONSOLE_SITE_URL',
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'GOOGLE_OAUTH_REFRESH_TOKEN',
] as const

const DEFAULT_ROOT_DOMAIN = 'albion-guildmanager.com'
const MAX_ROW_LIMIT = 25_000

function yyyyMmDd(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function metricNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function sanitizedText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function featureSlugFromPathname(pathname: string): string | null {
  const parsed = parseSeoFeaturePathname(pathname)
  if (!parsed) return null
  const segments = parsed.unprefixedPathname.split('/').filter(Boolean)
  return segments.length >= 2 ? segments[1] : null
}

function allowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return host === DEFAULT_ROOT_DOMAIN || host === `www.${DEFAULT_ROOT_DOMAIN}`
}

export function getSearchConsoleConfigStatus(
  env: Record<string, string | undefined> = process.env,
): SearchConsoleConfigStatus {
  const missing = REQUIRED_ENV_KEYS.filter((key) => !env[key])
  return {
    configured: missing.length === 0,
    siteUrl: env.GOOGLE_SEARCH_CONSOLE_SITE_URL ?? null,
    missing,
  }
}

export function buildSearchAnalyticsRequest(input: {
  startDate: string
  endDate: string
  dimensions: SearchConsoleDimension[]
  startRow?: number
  rowLimit?: number
}): SearchAnalyticsRequest {
  return {
    startDate: input.startDate,
    endDate: input.endDate,
    dimensions: [...input.dimensions],
    type: 'web',
    aggregationType: 'byPage',
    rowLimit: Math.min(Math.max(input.rowLimit ?? MAX_ROW_LIMIT, 1), MAX_ROW_LIMIT),
    startRow: Math.max(input.startRow ?? 0, 0),
    dataState: 'final',
  }
}

export function getSearchConsoleSyncWindow(now: Date = new Date()): {
  startDate: string
  endDate: string
} {
  return {
    startDate: yyyyMmDd(addUtcDays(now, -30)),
    endDate: yyyyMmDd(addUtcDays(now, -3)),
  }
}

export function normalizeSearchConsolePageUrl(value: string): SearchConsolePageIdentity | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || !allowedHost(url.hostname)) return null

  const canonicalPathname = getSeoFeatureCanonicalPathname(url.pathname)
  if (!canonicalPathname) return null
  const parsed = parseSeoFeaturePathname(canonicalPathname)
  if (!parsed) return null
  return {
    pagePath: canonicalPathname,
    locale: parsed.locale,
    featureSlug: featureSlugFromPathname(canonicalPathname),
  }
}

export function mapSearchConsolePageRows(
  rows: readonly SearchConsoleApiRow[],
): SearchConsolePageMetric[] {
  return rows.flatMap((row) => {
    const [date, pageUrl] = row.keys ?? []
    if (!date || !pageUrl) return []
    const page = normalizeSearchConsolePageUrl(pageUrl)
    if (!page) return []
    return [
      {
        date,
        ...page,
        clicks: metricNumber(row.clicks),
        impressions: metricNumber(row.impressions),
        ctr: metricNumber(row.ctr),
        position: metricNumber(row.position),
      },
    ]
  })
}

export function mapSearchConsoleQueryRows(
  rows: readonly SearchConsoleApiRow[],
): SearchConsoleQueryMetric[] {
  return rows.flatMap((row) => {
    const [date, pageUrl, rawQuery, rawCountry, rawDevice] = row.keys ?? []
    if (!date || !pageUrl || !rawQuery) return []
    const page = normalizeSearchConsolePageUrl(pageUrl)
    if (!page) return []
    const query = sanitizedText(rawQuery, 300)
    if (!query) return []
    const country = sanitizedText(rawCountry, 3).toLowerCase()
    const device = sanitizedText(rawDevice, 20).toLowerCase()
    return [
      {
        date,
        ...page,
        query,
        country: /^[a-z]{3}$/.test(country) ? country : 'unk',
        device:
          device === 'desktop' || device === 'mobile' || device === 'tablet'
            ? device
            : 'unknown',
        clicks: metricNumber(row.clicks),
        impressions: metricNumber(row.impressions),
        ctr: metricNumber(row.ctr),
        position: metricNumber(row.position),
      },
    ]
  })
}

export function selectIndexInspectionTargets(): string[] {
  return [
    'https://albion-guildmanager.com/',
    'https://albion-guildmanager.com/features',
    'https://albion-guildmanager.com/en/features',
    'https://albion-guildmanager.com/en/features/discord-bot',
    'https://albion-guildmanager.com/en/features/auto-regear',
    'https://albion-guildmanager.com/en/features/zvz-killboard',
    'https://albion-guildmanager.com/ko/features/auto-regear',
    'https://albion-guildmanager.com/ja/features/auto-regear',
    'https://albion-guildmanager.com/zh/features/auto-regear',
  ]
}
