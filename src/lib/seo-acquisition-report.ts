import 'server-only'
import { getAdminClient } from '@/lib/supabase-admin'
import type { SeoAttributionEventType, SeoAttributionSource } from '@/lib/seo-attribution'
import type { Locale } from '@/i18n/locales'

export interface SeoReportSession {
  id: string
  firstLandingPath: string
  firstLocale: Locale | null
  firstFeatureSlug: string | null
  firstSource: SeoAttributionSource
  createdAt: string
}

export interface SeoReportEvent {
  id: string
  seoSessionId: string
  eventType: SeoAttributionEventType
  path: string
  locale: Locale | null
  featureSlug: string | null
  target: string | null
  createdAt: string
}

export interface SeoReportAcquisition {
  tenantId: string
  seoSessionId: string | null
  firstLandingPath: string
  firstLocale: Locale | null
  firstFeatureSlug: string | null
  firstSource: SeoAttributionSource
  capturedAt: string
}

export interface SeoReportTenant {
  id: string
  slug: string
  name: string
  status: string
  createdAt: string
}

export interface SeoReportOnboardingEvent {
  guildId: string
  eventType: string
  createdAt: string
}

export interface SeoAcquisitionReportInput {
  sessions: SeoReportSession[]
  events: SeoReportEvent[]
  acquisitions: SeoReportAcquisition[]
  searchConsolePages?: SeoSearchConsolePageMetric[]
  searchConsoleQueries?: SeoSearchConsoleQueryMetric[]
}

export interface SeoReportGroupRow {
  key: string
  sessions: number
  ctaClickSessions: number
  acquiredTenants: number
}

export interface SeoAcquisitionSummary {
  totals: {
    sessions: number
    ctaClickSessions: number
    discordStartSessions: number
    botInstallStartSessions: number
    acquiredTenants: number
  }
  searchConsoleTotals: SeoSearchConsoleTotals
  byLocale: SeoReportGroupRow[]
  byFeature: SeoReportGroupRow[]
  landingPages: SeoLandingPageRow[]
  topQueries: SeoSearchConsoleQueryRow[]
}

export interface SeoAcquisitionReport extends SeoAcquisitionSummary {
  syncStatus: {
    configured: boolean
    lastStatus: string | null
    lastCompletedAt: string | null
    lastError: string | null
    missing: string[]
  }
  indexInspections: SeoIndexInspectionRow[]
  recentAcquisitions: Array<{
    tenantId: string
    tenantSlug: string | null
    tenantName: string | null
    tenantStatus: string | null
    featureSlug: string | null
    locale: string
    source: string
    capturedAt: string
    setupCompleted: boolean
    firstEventCreated: boolean
  }>
}

export interface SeoSearchConsolePageMetric {
  date: string
  pagePath: string
  locale: Locale | null
  featureSlug: string | null
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface SeoSearchConsoleQueryMetric extends SeoSearchConsolePageMetric {
  query: string
  country: string
  device: string
}

export interface SeoSearchConsoleTotals {
  clicks: number
  impressions: number
  averageCtr: number
  averagePosition: number
}

export interface SeoLandingPageRow extends SeoSearchConsoleTotals {
  pagePath: string
  locale: string
  featureSlug: string | null
  sessions: number
  ctaClickSessions: number
  botInstallStartSessions: number
  acquiredTenants: number
}

export interface SeoSearchConsoleQueryRow extends SeoSearchConsoleTotals {
  query: string
  pagePath: string
  country: string
  device: string
}

export interface SeoSearchConsoleSyncRun {
  id: string
  status: string
  completedAt: string | null
  error: string | null
  metadata: Record<string, unknown>
}

export interface SeoIndexInspectionRow {
  inspectedUrl: string
  pagePath: string
  locale: string
  featureSlug: string | null
  verdict: string | null
  coverageState: string | null
  indexingState: string | null
  robotsTxtState: string | null
  pageFetchState: string | null
  lastCrawlTime: string | null
  inspectedAt: string
}

const CTA_EVENT_TYPES = new Set<SeoAttributionEventType>([
  'feature_card_click',
  'cta_demo_click',
  'cta_docs_click',
  'cta_bot_install_click',
])

function localeKey(locale: Locale | null): string {
  return locale ?? 'x-default'
}

function featureKey(featureSlug: string | null): string {
  return featureSlug ?? 'features-index'
}

function uniqueSessionCount(events: SeoReportEvent[], predicate: (event: SeoReportEvent) => boolean): number {
  return new Set(events.filter(predicate).map((event) => event.seoSessionId)).size
}

function weightedTotals(rows: Array<Pick<SeoSearchConsolePageMetric, 'clicks' | 'impressions' | 'ctr' | 'position'>>): SeoSearchConsoleTotals {
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0)
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0)
  if (impressions <= 0) {
    return { clicks, impressions, averageCtr: 0, averagePosition: 0 }
  }
  return {
    clicks,
    impressions,
    averageCtr: rows.reduce((sum, row) => sum + row.ctr * row.impressions, 0) / impressions,
    averagePosition:
      rows.reduce((sum, row) => sum + row.position * row.impressions, 0) / impressions,
  }
}

function landingPageRows(input: SeoAcquisitionReportInput): SeoLandingPageRow[] {
  const searchConsolePages = input.searchConsolePages ?? []
  const pageKeys = new Set<string>([
    ...searchConsolePages.map((row) => row.pagePath),
    ...input.sessions.map((session) => session.firstLandingPath),
    ...input.events.map((event) => event.path),
    ...input.acquisitions.map((acquisition) => acquisition.firstLandingPath),
  ])

  return [...pageKeys]
    .map((pagePath) => {
      const pageMetrics = searchConsolePages.filter((row) => row.pagePath === pagePath)
      const sessions = input.sessions.filter((session) => session.firstLandingPath === pagePath)
      const events = input.events.filter((event) => event.path === pagePath)
      const acquisitions = input.acquisitions.filter(
        (acquisition) => acquisition.firstLandingPath === pagePath,
      )
      const firstPageMetric = pageMetrics[0]
      const firstSession = sessions[0]
      const totals = weightedTotals(pageMetrics)
      return {
        pagePath,
        locale: localeKey(firstPageMetric?.locale ?? firstSession?.firstLocale ?? null),
        featureSlug: firstPageMetric?.featureSlug ?? firstSession?.firstFeatureSlug ?? null,
        ...totals,
        sessions: sessions.length,
        ctaClickSessions: uniqueSessionCount(events, (event) => CTA_EVENT_TYPES.has(event.eventType)),
        botInstallStartSessions: uniqueSessionCount(
          events,
          (event) => event.eventType === 'bot_install_start',
        ),
        acquiredTenants: acquisitions.length,
      }
    })
    .filter(
      (row) =>
        row.impressions > 0 ||
        row.clicks > 0 ||
        row.sessions > 0 ||
        row.ctaClickSessions > 0 ||
        row.acquiredTenants > 0,
    )
    .sort(
      (a, b) =>
        b.impressions - a.impressions ||
        b.clicks - a.clicks ||
        b.sessions - a.sessions ||
        b.acquiredTenants - a.acquiredTenants,
    )
}

function topQueryRows(input: SeoAcquisitionReportInput): SeoSearchConsoleQueryRow[] {
  const grouped = new Map<string, SeoSearchConsoleQueryMetric[]>()
  for (const row of input.searchConsoleQueries ?? []) {
    const key = `${row.query}\u0000${row.pagePath}\u0000${row.country}\u0000${row.device}`
    grouped.set(key, [...(grouped.get(key) ?? []), row])
  }

  return [...grouped.values()]
    .map((rows) => {
      const first = rows[0]
      return {
        query: first.query,
        pagePath: first.pagePath,
        country: first.country,
        device: first.device,
        ...weightedTotals(rows),
      }
    })
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, 20)
}

function groupRows(
  keys: Iterable<string>,
  sessionsForKey: (key: string) => SeoReportSession[],
  eventsForKey: (key: string) => SeoReportEvent[],
  acquisitionsForKey: (key: string) => SeoReportAcquisition[],
): SeoReportGroupRow[] {
  return [...keys]
    .map((key) => ({
      key,
      sessions: sessionsForKey(key).length,
      ctaClickSessions: uniqueSessionCount(eventsForKey(key), (event) =>
        CTA_EVENT_TYPES.has(event.eventType),
      ),
      acquiredTenants: acquisitionsForKey(key).length,
    }))
    .filter((row) => row.sessions > 0 || row.ctaClickSessions > 0 || row.acquiredTenants > 0)
    .sort((a, b) => b.sessions - a.sessions || b.acquiredTenants - a.acquiredTenants)
}

export function summarizeSeoAcquisitionReport(
  input: SeoAcquisitionReportInput,
): SeoAcquisitionSummary {
  const localeKeys = new Set<string>([
    ...input.sessions.map((session) => localeKey(session.firstLocale)),
    ...input.events.map((event) => localeKey(event.locale)),
    ...input.acquisitions.map((acquisition) => localeKey(acquisition.firstLocale)),
  ])
  const featureKeys = new Set<string>([
    ...input.sessions.map((session) => featureKey(session.firstFeatureSlug)),
    ...input.events.map((event) => featureKey(event.featureSlug)),
    ...input.acquisitions.map((acquisition) => featureKey(acquisition.firstFeatureSlug)),
  ])

  return {
    totals: {
      sessions: input.sessions.length,
      ctaClickSessions: uniqueSessionCount(input.events, (event) => CTA_EVENT_TYPES.has(event.eventType)),
      discordStartSessions: uniqueSessionCount(input.events, (event) => event.eventType === 'discord_oauth_start'),
      botInstallStartSessions: uniqueSessionCount(input.events, (event) => event.eventType === 'bot_install_start'),
      acquiredTenants: input.acquisitions.length,
    },
    searchConsoleTotals: weightedTotals(input.searchConsolePages ?? []),
    byLocale: groupRows(
      localeKeys,
      (key) => input.sessions.filter((session) => localeKey(session.firstLocale) === key),
      (key) => input.events.filter((event) => localeKey(event.locale) === key),
      (key) => input.acquisitions.filter((acquisition) => localeKey(acquisition.firstLocale) === key),
    ),
    byFeature: groupRows(
      featureKeys,
      (key) => input.sessions.filter((session) => featureKey(session.firstFeatureSlug) === key),
      (key) => input.events.filter((event) => featureKey(event.featureSlug) === key),
      (key) => input.acquisitions.filter((acquisition) => featureKey(acquisition.firstFeatureSlug) === key),
    ),
    landingPages: landingPageRows(input),
    topQueries: topQueryRows(input),
  }
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

function daysAgoDate(days: number): string {
  return daysAgoIso(days).slice(0, 10)
}

function mapSession(row: Record<string, unknown>): SeoReportSession {
  return {
    id: row.id as string,
    firstLandingPath: row.first_landing_path as string,
    firstLocale: (row.first_locale as Locale | null) ?? null,
    firstFeatureSlug: (row.first_feature_slug as string | null) ?? null,
    firstSource: ((row.first_source as SeoAttributionSource | null) ?? 'unknown'),
    createdAt: row.created_at as string,
  }
}

function mapEvent(row: Record<string, unknown>): SeoReportEvent {
  return {
    id: row.id as string,
    seoSessionId: row.seo_session_id as string,
    eventType: row.event_type as SeoAttributionEventType,
    path: row.path as string,
    locale: (row.locale as Locale | null) ?? null,
    featureSlug: (row.feature_slug as string | null) ?? null,
    target: (row.target as string | null) ?? null,
    createdAt: row.created_at as string,
  }
}

function mapAcquisition(row: Record<string, unknown>): SeoReportAcquisition {
  return {
    tenantId: row.tenant_id as string,
    seoSessionId: (row.seo_session_id as string | null) ?? null,
    firstLandingPath: row.first_landing_path as string,
    firstLocale: (row.first_locale as Locale | null) ?? null,
    firstFeatureSlug: (row.first_feature_slug as string | null) ?? null,
    firstSource: ((row.first_source as SeoAttributionSource | null) ?? 'unknown'),
    capturedAt: row.captured_at as string,
  }
}

function mapTenant(row: Record<string, unknown>): SeoReportTenant {
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    status: (row.status as string | null) ?? 'unknown',
    createdAt: row.created_at as string,
  }
}

function mapOnboardingEvent(row: Record<string, unknown>): SeoReportOnboardingEvent {
  return {
    guildId: row.guild_id as string,
    eventType: row.event_type as string,
    createdAt: row.created_at as string,
  }
}

function mapSearchConsolePageMetric(row: Record<string, unknown>): SeoSearchConsolePageMetric {
  return {
    date: row.date as string,
    pagePath: row.page_path as string,
    locale: (row.locale as Locale | null) ?? null,
    featureSlug: (row.feature_slug as string | null) ?? null,
    clicks: Number(row.clicks ?? 0),
    impressions: Number(row.impressions ?? 0),
    ctr: Number(row.ctr ?? 0),
    position: Number(row.position ?? 0),
  }
}

function mapSearchConsoleQueryMetric(row: Record<string, unknown>): SeoSearchConsoleQueryMetric {
  return {
    ...mapSearchConsolePageMetric(row),
    query: row.query as string,
    country: row.country as string,
    device: row.device as string,
  }
}

function mapSyncRun(row: Record<string, unknown>): SeoSearchConsoleSyncRun {
  return {
    id: row.id as string,
    status: row.status as string,
    completedAt: (row.completed_at as string | null) ?? null,
    error: (row.error as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown> | null) ?? {},
  }
}

function mapIndexInspection(row: Record<string, unknown>): SeoIndexInspectionRow {
  return {
    inspectedUrl: row.inspected_url as string,
    pagePath: row.page_path as string,
    locale: localeKey((row.locale as Locale | null) ?? null),
    featureSlug: (row.feature_slug as string | null) ?? null,
    verdict: (row.verdict as string | null) ?? null,
    coverageState: (row.coverage_state as string | null) ?? null,
    indexingState: (row.indexing_state as string | null) ?? null,
    robotsTxtState: (row.robots_txt_state as string | null) ?? null,
    pageFetchState: (row.page_fetch_state as string | null) ?? null,
    lastCrawlTime: (row.last_crawl_time as string | null) ?? null,
    inspectedAt: row.inspected_at as string,
  }
}

export async function loadSeoAcquisitionReport(days: number = 30): Promise<SeoAcquisitionReport> {
  const db = getAdminClient()
  const since = daysAgoIso(days)
  const sinceDate = daysAgoDate(days)
  const [
    sessionsRes,
    eventsRes,
    acquisitionsRes,
    onboardingRes,
    searchConsolePagesRes,
    searchConsoleQueriesRes,
    searchConsoleSyncRunsRes,
    indexInspectionsRes,
  ] = await Promise.all([
    db
      .from('seo_sessions')
      .select('id, first_landing_path, first_locale, first_feature_slug, first_source, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5000),
    db
      .from('seo_events')
      .select('id, seo_session_id, event_type, path, locale, feature_slug, target, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(10000),
    db
      .from('tenant_acquisition_sources')
      .select('tenant_id, seo_session_id, first_landing_path, first_locale, first_feature_slug, first_source, captured_at')
      .gte('captured_at', since)
      .order('captured_at', { ascending: false })
      .limit(1000),
    db
      .from('tenant_onboarding_events')
      .select('guild_id, event_type, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(10000),
    db
      .from('seo_search_console_daily_pages')
      .select('date, page_path, locale, feature_slug, clicks, impressions, ctr, position')
      .gte('date', sinceDate)
      .order('date', { ascending: false })
      .limit(5000),
    db
      .from('seo_search_console_daily_queries')
      .select('date, page_path, query, country, device, locale, feature_slug, clicks, impressions, ctr, position')
      .gte('date', sinceDate)
      .order('date', { ascending: false })
      .limit(5000),
    db
      .from('seo_search_console_sync_runs')
      .select('id, status, completed_at, error, metadata')
      .order('started_at', { ascending: false })
      .limit(5),
    db
      .from('seo_index_inspections')
      .select('inspected_url, page_path, locale, feature_slug, verdict, coverage_state, indexing_state, robots_txt_state, page_fetch_state, last_crawl_time, inspected_at')
      .order('inspected_at', { ascending: false })
      .limit(20),
  ])

  if (sessionsRes.error) throw new Error(sessionsRes.error.message)
  if (eventsRes.error) throw new Error(eventsRes.error.message)
  if (acquisitionsRes.error) throw new Error(acquisitionsRes.error.message)
  if (onboardingRes.error) throw new Error(onboardingRes.error.message)
  if (searchConsolePagesRes.error) throw new Error(searchConsolePagesRes.error.message)
  if (searchConsoleQueriesRes.error) throw new Error(searchConsoleQueriesRes.error.message)
  if (searchConsoleSyncRunsRes.error) throw new Error(searchConsoleSyncRunsRes.error.message)
  if (indexInspectionsRes.error) throw new Error(indexInspectionsRes.error.message)

  const sessions = ((sessionsRes.data ?? []) as Record<string, unknown>[]).map(mapSession)
  const events = ((eventsRes.data ?? []) as Record<string, unknown>[]).map(mapEvent)
  const acquisitions = ((acquisitionsRes.data ?? []) as Record<string, unknown>[]).map(mapAcquisition)
  const onboardingEvents = ((onboardingRes.data ?? []) as Record<string, unknown>[]).map(mapOnboardingEvent)
  const searchConsolePages =
    ((searchConsolePagesRes.data ?? []) as Record<string, unknown>[]).map(mapSearchConsolePageMetric)
  const searchConsoleQueries =
    ((searchConsoleQueriesRes.data ?? []) as Record<string, unknown>[]).map(mapSearchConsoleQueryMetric)
  const syncRuns =
    ((searchConsoleSyncRunsRes.data ?? []) as Record<string, unknown>[]).map(mapSyncRun)
  const indexInspections =
    ((indexInspectionsRes.data ?? []) as Record<string, unknown>[]).map(mapIndexInspection)
  const tenantIds = [...new Set(acquisitions.map((acquisition) => acquisition.tenantId))]
  const tenantsRes = tenantIds.length > 0
    ? await db
        .from('tenants')
        .select('id, slug, name, status, created_at')
        .in('id', tenantIds)
    : { data: [], error: null }
  if (tenantsRes.error) throw new Error(tenantsRes.error.message)
  const tenantsById = new Map(
    ((tenantsRes.data ?? []) as Record<string, unknown>[]).map((row) => {
      const tenant = mapTenant(row)
      return [tenant.id, tenant] as const
    }),
  )
  const onboardingByTenant = new Map<string, Set<string>>()
  for (const event of onboardingEvents) {
    const existing = onboardingByTenant.get(event.guildId) ?? new Set<string>()
    existing.add(event.eventType)
    onboardingByTenant.set(event.guildId, existing)
  }

  const latestSyncRun = syncRuns[0] ?? null
  const missing = Array.isArray(latestSyncRun?.metadata.missing)
    ? (latestSyncRun.metadata.missing.filter((value) => typeof value === 'string') as string[])
    : []
  const summary = summarizeSeoAcquisitionReport({
    sessions,
    events,
    acquisitions,
    searchConsolePages,
    searchConsoleQueries,
  })
  return {
    ...summary,
    syncStatus: {
      configured: latestSyncRun?.metadata.configured === true,
      lastStatus: latestSyncRun?.status ?? null,
      lastCompletedAt: latestSyncRun?.completedAt ?? null,
      lastError: latestSyncRun?.error ?? null,
      missing,
    },
    indexInspections,
    recentAcquisitions: acquisitions.slice(0, 20).map((acquisition) => {
      const tenant = tenantsById.get(acquisition.tenantId)
      const onboarding = onboardingByTenant.get(acquisition.tenantId) ?? new Set<string>()
      return {
        tenantId: acquisition.tenantId,
        tenantSlug: tenant?.slug ?? null,
        tenantName: tenant?.name ?? null,
        tenantStatus: tenant?.status ?? null,
        featureSlug: acquisition.firstFeatureSlug,
        locale: localeKey(acquisition.firstLocale),
        source: acquisition.firstSource,
        capturedAt: acquisition.capturedAt,
        setupCompleted: onboarding.has('setup_completed'),
        firstEventCreated: onboarding.has('first_event_created'),
      }
    }),
  }
}
