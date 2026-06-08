import 'server-only'

import { getAdminClient } from '@/lib/supabase-admin'
import { log } from '@/lib/log'
import {
  buildSearchAnalyticsRequest,
  getSearchConsoleConfigStatus,
  getSearchConsoleSyncWindow,
  mapSearchConsolePageRows,
  mapSearchConsoleQueryRows,
  normalizeSearchConsolePageUrl,
  selectIndexInspectionTargets,
  type SearchConsoleApiRow,
  type SearchConsoleDimension,
} from '@/lib/seo-search-console'

type SupabaseAdminClient = ReturnType<typeof getAdminClient>

export interface SearchConsoleSyncSummary {
  status: 'succeeded' | 'failed' | 'skipped'
  startDate: string
  endDate: string
  pageRows: number
  queryRows: number
  inspectedUrls: number
  error?: string
}

interface SearchAnalyticsResponse {
  rows?: SearchConsoleApiRow[]
}

interface GoogleTokenResponse {
  access_token?: string
  error?: string
  error_description?: string
}

interface UrlInspectionResponse {
  inspectionResult?: {
    indexStatusResult?: {
      verdict?: string
      coverageState?: string
      indexingState?: string
      robotsTxtState?: string
      pageFetchState?: string
      lastCrawlTime?: string
    }
  }
}

const SEARCH_ANALYTICS_ENDPOINT = 'https://www.googleapis.com/webmasters/v3/sites'
const URL_INSPECTION_ENDPOINT = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

function truncateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, 1000)
}

async function insertSyncRun(
  db: SupabaseAdminClient,
  input: {
    runId: string
    startDate: string
    endDate: string
  },
): Promise<void> {
  const { error } = await db.from('seo_search_console_sync_runs').insert({
    id: input.runId,
    status: 'running',
    start_date: input.startDate,
    end_date: input.endDate,
  })
  if (error) {
    log.error('[seo-search-console] sync run insert failed', error, { run_id: input.runId })
  }
}

async function finishSyncRun(
  db: SupabaseAdminClient,
  runId: string,
  summary: SearchConsoleSyncSummary,
): Promise<void> {
  const { error } = await db
    .from('seo_search_console_sync_runs')
    .update({
      completed_at: new Date().toISOString(),
      status: summary.status,
      start_date: summary.startDate,
      end_date: summary.endDate,
      page_rows: summary.pageRows,
      query_rows: summary.queryRows,
      inspected_urls: summary.inspectedUrls,
      error: summary.error ?? null,
    })
    .eq('id', runId)
  if (error) {
    log.error('[seo-search-console] sync run update failed', error, { run_id: runId })
  }
}

async function fetchGoogleAccessToken(): Promise<string> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
      refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN ?? '',
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
  })
  const body = (await response.json().catch(() => ({}))) as GoogleTokenResponse
  if (!response.ok || !body.access_token) {
    throw new Error(body.error_description || body.error || `Google OAuth failed (${response.status})`)
  }
  return body.access_token
}

async function fetchSearchAnalyticsRows(input: {
  accessToken: string
  siteUrl: string
  startDate: string
  endDate: string
  dimensions: SearchConsoleDimension[]
}): Promise<SearchConsoleApiRow[]> {
  const rows: SearchConsoleApiRow[] = []
  for (let startRow = 0; ; startRow += 25_000) {
    const response = await fetch(
      `${SEARCH_ANALYTICS_ENDPOINT}/${encodeURIComponent(input.siteUrl)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${input.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(
          buildSearchAnalyticsRequest({
            startDate: input.startDate,
            endDate: input.endDate,
            dimensions: input.dimensions,
            startRow,
          }),
        ),
        cache: 'no-store',
      },
    )
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`Search Analytics failed (${response.status}): ${text.slice(0, 300)}`)
    }
    const body = (await response.json().catch(() => ({}))) as SearchAnalyticsResponse
    const page = body.rows ?? []
    rows.push(...page)
    if (page.length < 25_000) return rows
  }
}

async function inspectUrl(input: {
  accessToken: string
  siteUrl: string
  inspectedUrl: string
}): Promise<UrlInspectionResponse | null> {
  const response = await fetch(URL_INSPECTION_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      inspectionUrl: input.inspectedUrl,
      siteUrl: input.siteUrl,
    }),
    cache: 'no-store',
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    log.warn('[seo-search-console] url inspection failed', {
      inspected_url: input.inspectedUrl,
      status: response.status,
      response: text.slice(0, 300),
    })
    return null
  }
  return (await response.json().catch(() => null)) as UrlInspectionResponse | null
}

async function upsertPageRows(
  db: SupabaseAdminClient,
  rows: ReturnType<typeof mapSearchConsolePageRows>,
): Promise<number> {
  if (rows.length === 0) return 0
  const now = new Date().toISOString()
  const { error } = await db.from('seo_search_console_daily_pages').upsert(
    rows.map((row) => ({
      date: row.date,
      page_path: row.pagePath,
      locale: row.locale,
      feature_slug: row.featureSlug,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
      updated_at: now,
    })),
    { onConflict: 'date,page_path' },
  )
  if (error) throw new Error(error.message)
  return rows.length
}

async function upsertQueryRows(
  db: SupabaseAdminClient,
  rows: ReturnType<typeof mapSearchConsoleQueryRows>,
): Promise<number> {
  if (rows.length === 0) return 0
  const now = new Date().toISOString()
  const { error } = await db.from('seo_search_console_daily_queries').upsert(
    rows.map((row) => ({
      date: row.date,
      page_path: row.pagePath,
      query: row.query,
      country: row.country,
      device: row.device,
      locale: row.locale,
      feature_slug: row.featureSlug,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
      updated_at: now,
    })),
    { onConflict: 'date,page_path,query,country,device' },
  )
  if (error) throw new Error(error.message)
  return rows.length
}

async function upsertIndexInspections(input: {
  db: SupabaseAdminClient
  accessToken: string
  siteUrl: string
}): Promise<number> {
  const now = new Date().toISOString()
  let inspected = 0
  for (const inspectedUrl of selectIndexInspectionTargets()) {
    const page = normalizeSearchConsolePageUrl(inspectedUrl)
    if (!page) continue
    const result = await inspectUrl({
      accessToken: input.accessToken,
      siteUrl: input.siteUrl,
      inspectedUrl,
    })
    if (!result) continue
    const index = result.inspectionResult?.indexStatusResult
    const { error } = await input.db.from('seo_index_inspections').upsert(
      {
        inspected_url: inspectedUrl,
        page_path: page.pagePath,
        locale: page.locale,
        feature_slug: page.featureSlug,
        verdict: index?.verdict ?? null,
        coverage_state: index?.coverageState ?? null,
        indexing_state: index?.indexingState ?? null,
        robots_txt_state: index?.robotsTxtState ?? null,
        page_fetch_state: index?.pageFetchState ?? null,
        last_crawl_time: index?.lastCrawlTime ?? null,
        inspected_at: now,
        updated_at: now,
      },
      { onConflict: 'inspected_url' },
    )
    if (error) throw new Error(error.message)
    inspected += 1
  }
  return inspected
}

export async function syncSearchConsolePerformance(
  db: SupabaseAdminClient,
  options: { runId: string; now?: Date },
): Promise<SearchConsoleSyncSummary> {
  const { startDate, endDate } = getSearchConsoleSyncWindow(options.now)
  await insertSyncRun(db, { runId: options.runId, startDate, endDate })

  const config = getSearchConsoleConfigStatus()
  if (!config.configured || !config.siteUrl) {
    const summary: SearchConsoleSyncSummary = {
      status: 'skipped',
      startDate,
      endDate,
      pageRows: 0,
      queryRows: 0,
      inspectedUrls: 0,
      error: `Missing config: ${config.missing.join(', ')}`,
    }
    await finishSyncRun(db, options.runId, summary)
    return summary
  }

  try {
    const accessToken = await fetchGoogleAccessToken()
    const [pageApiRows, queryApiRows] = await Promise.all([
      fetchSearchAnalyticsRows({
        accessToken,
        siteUrl: config.siteUrl,
        startDate,
        endDate,
        dimensions: ['date', 'page'],
      }),
      fetchSearchAnalyticsRows({
        accessToken,
        siteUrl: config.siteUrl,
        startDate,
        endDate,
        dimensions: ['date', 'page', 'query', 'country', 'device'],
      }),
    ])

    const pageRows = await upsertPageRows(db, mapSearchConsolePageRows(pageApiRows))
    const queryRows = await upsertQueryRows(db, mapSearchConsoleQueryRows(queryApiRows))
    const inspectedUrls = await upsertIndexInspections({ db, accessToken, siteUrl: config.siteUrl })
    const summary: SearchConsoleSyncSummary = {
      status: 'succeeded',
      startDate,
      endDate,
      pageRows,
      queryRows,
      inspectedUrls,
    }
    await finishSyncRun(db, options.runId, summary)
    return summary
  } catch (error) {
    const summary: SearchConsoleSyncSummary = {
      status: 'failed',
      startDate,
      endDate,
      pageRows: 0,
      queryRows: 0,
      inspectedUrls: 0,
      error: truncateError(error),
    }
    await finishSyncRun(db, options.runId, summary)
    return summary
  }
}
