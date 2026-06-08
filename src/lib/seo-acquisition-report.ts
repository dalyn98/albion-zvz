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
  byLocale: SeoReportGroupRow[]
  byFeature: SeoReportGroupRow[]
}

export interface SeoAcquisitionReport extends SeoAcquisitionSummary {
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
  }
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
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

export async function loadSeoAcquisitionReport(days: number = 30): Promise<SeoAcquisitionReport> {
  const db = getAdminClient()
  const since = daysAgoIso(days)
  const [sessionsRes, eventsRes, acquisitionsRes, onboardingRes] = await Promise.all([
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
  ])

  if (sessionsRes.error) throw new Error(sessionsRes.error.message)
  if (eventsRes.error) throw new Error(eventsRes.error.message)
  if (acquisitionsRes.error) throw new Error(acquisitionsRes.error.message)
  if (onboardingRes.error) throw new Error(onboardingRes.error.message)

  const sessions = ((sessionsRes.data ?? []) as Record<string, unknown>[]).map(mapSession)
  const events = ((eventsRes.data ?? []) as Record<string, unknown>[]).map(mapEvent)
  const acquisitions = ((acquisitionsRes.data ?? []) as Record<string, unknown>[]).map(mapAcquisition)
  const onboardingEvents = ((onboardingRes.data ?? []) as Record<string, unknown>[]).map(mapOnboardingEvent)
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

  const summary = summarizeSeoAcquisitionReport({ sessions, events, acquisitions })
  return {
    ...summary,
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
