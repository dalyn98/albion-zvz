import 'server-only'
import type { NextRequest } from 'next/server'
import { getLocaleCookieDomain } from '@/lib/locale-cookie'
import { log } from '@/lib/log'
import {
  getSeoDocsCanonicalPathname,
  getSeoFeatureCanonicalPathname,
  normalizeSeoPathname,
  parseSeoDocsPathname,
  parseSeoFeaturePathname,
  parseSeoZvzRecordPathname,
} from '@/lib/seo-locale-paths'
import { getAdminClient } from '@/lib/supabase-admin'
import { getCanonicalRootDomain } from '@/lib/tenant-resolver'
import type { Locale } from '@/i18n/locales'

export const SEO_SESSION_COOKIE = 'agm_seo_session'
const SEO_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 90
const DEDUPE_WINDOW_MS = 30 * 60 * 1000
const MAX_STRING_LENGTH = 256
const MAX_UTM_LENGTH = 128

export const SEO_ATTRIBUTION_EVENT_TYPES = [
  'landing_view',
  'feature_card_click',
  'cta_demo_click',
  'cta_docs_click',
  'cta_bot_install_click',
  'language_switch',
  'discord_oauth_start',
  'bot_install_start',
  'battles_board_view',
  'battles_search',
  'battle_report_open',
  'guild_record_open',
  'alliance_record_open',
  'battle_share',
  'guild_connect',
] as const

export type SeoAttributionEventType = (typeof SEO_ATTRIBUTION_EVENT_TYPES)[number]

export const CLIENT_SEO_ATTRIBUTION_EVENT_TYPES = [
  'landing_view',
  'feature_card_click',
  'cta_demo_click',
  'cta_docs_click',
  'cta_bot_install_click',
  'language_switch',
  'battles_board_view',
  'battles_search',
  'battle_report_open',
  'guild_record_open',
  'alliance_record_open',
  'battle_share',
  'guild_connect',
] as const satisfies readonly SeoAttributionEventType[]

export type ClientSeoAttributionEventType =
  (typeof CLIENT_SEO_ATTRIBUTION_EVENT_TYPES)[number]

export type SeoAttributionSource =
  | 'google'
  | 'bing'
  | 'naver'
  | 'direct'
  | 'internal'
  | 'referral'
  | 'utm'
  | 'unknown'

export interface SeoAttributionContext {
  path: string
  locale: Locale | null
  featureSlug: string | null
  referrerHost: string | null
  source: SeoAttributionSource
  utm: Record<string, string>
}

export interface ClientSeoAttributionPayload {
  eventType: ClientSeoAttributionEventType
  path: string
  referrer?: string | null
  target?: string | null
}

export interface RecordSeoAttributionInput {
  eventType: SeoAttributionEventType
  target?: string | null
}

export interface CaptureTenantAcquisitionInput {
  tenantId: string
  visitorId: string | null | undefined
}

interface SeoSessionRow {
  id: string
  first_landing_path: string
  first_locale: Locale | null
  first_feature_slug: string | null
  first_referrer_host: string | null
  first_source: SeoAttributionSource
  first_utm: Record<string, string>
}

const EVENT_TYPE_SET = new Set<string>(SEO_ATTRIBUTION_EVENT_TYPES)
const CLIENT_EVENT_TYPE_SET = new Set<string>(CLIENT_SEO_ATTRIBUTION_EVENT_TYPES)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const
const MARKETING_ATTRIBUTION_PATHS = new Set([
  '/',
  '/pricing',
  '/faq',
  '/zvz-battles',
])

function hasSeoAttributionDbEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export function isSeoAttributionEventType(value: unknown): value is SeoAttributionEventType {
  return typeof value === 'string' && EVENT_TYPE_SET.has(value)
}

export function isClientSeoAttributionEventType(
  value: unknown,
): value is ClientSeoAttributionEventType {
  return typeof value === 'string' && CLIENT_EVENT_TYPE_SET.has(value)
}

export function sanitizeSeoVisitorId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return UUID_RE.test(normalized) ? normalized : null
}

function sanitizeBoundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/[\u0000-\u001f\u007f]/g, '')
  if (!trimmed) return null
  return trimmed.slice(0, maxLength)
}

function hostFromUrl(value: string | null | undefined): string | null {
  const cleaned = sanitizeBoundedString(value, MAX_STRING_LENGTH)
  if (!cleaned) return null
  try {
    const url = new URL(cleaned)
    return url.hostname.toLowerCase().slice(0, 160)
  } catch {
    return null
  }
}

function isInternalHost(host: string): boolean {
  const root = getCanonicalRootDomain()
  return host === root || host.endsWith(`.${root}`) || host === 'localhost'
}

function utmFromSearch(searchParams: URLSearchParams): Record<string, string> {
  return Object.fromEntries(
    UTM_KEYS.flatMap((key) => {
      const value = sanitizeBoundedString(searchParams.get(key), MAX_UTM_LENGTH)
      return value ? [[key, value]] : []
    }),
  )
}

export function sourceFromReferrer(
  referrer: string | null | undefined,
  utm: Record<string, string>,
): SeoAttributionSource {
  if (utm.utm_source) return 'utm'
  const host = hostFromUrl(referrer)
  if (!host) return 'direct'
  if (isInternalHost(host)) return 'internal'
  if (host.includes('google.')) return 'google'
  if (host === 'bing.com' || host.endsWith('.bing.com')) return 'bing'
  if (host === 'naver.com' || host.endsWith('.naver.com')) return 'naver'
  return 'referral'
}

function featureSlugFromCanonicalPathname(pathname: string): string | null {
  const parsed = parseSeoFeaturePathname(pathname)
  if (!parsed) return null
  const segments = parsed.unprefixedPathname.split('/').filter(Boolean)
  return segments.length >= 2 ? segments[1] : null
}

function canonicalMarketingAttributionPath(pathname: string): {
  path: string
  locale: Locale | null
  featureSlug: string | null
} | null {
  const featurePathname = getSeoFeatureCanonicalPathname(pathname)
  if (featurePathname) {
    const parsed = parseSeoFeaturePathname(featurePathname)
    if (!parsed) return null
    return {
      path: featurePathname,
      locale: parsed.locale,
      featureSlug: featureSlugFromCanonicalPathname(featurePathname),
    }
  }

  const docsPathname = getSeoDocsCanonicalPathname(pathname)
  if (docsPathname) {
    const parsed = parseSeoDocsPathname(docsPathname)
    if (parsed?.unprefixedPathname !== '/docs') return null
    return {
      path: docsPathname,
      locale: parsed.locale,
      featureSlug: null,
    }
  }

  const normalized = normalizeSeoPathname(pathname)
  const zvzRecord = parseSeoZvzRecordPathname(normalized)
  if (zvzRecord) {
    return {
      path: zvzRecord.canonicalPathname,
      locale: zvzRecord.locale,
      featureSlug: null,
    }
  }
  if (!MARKETING_ATTRIBUTION_PATHS.has(normalized)) return null
  return {
    path: normalized,
    locale: null,
    featureSlug: null,
  }
}

export function parseSeoAttributionContext(input: {
  path: string
  referrer?: string | null
}): SeoAttributionContext | null {
  if (!input.path.startsWith('/')) return null
  let url: URL
  try {
    url = new URL(input.path, 'https://albion-guildmanager.local')
  } catch {
    return null
  }
  if (url.origin !== 'https://albion-guildmanager.local') return null

  const canonical = canonicalMarketingAttributionPath(url.pathname)
  if (!canonical) return null

  const utm = utmFromSearch(url.searchParams)
  const referrerHost = hostFromUrl(input.referrer)
  return {
    path: canonical.path,
    locale: canonical.locale,
    featureSlug: canonical.featureSlug,
    referrerHost,
    source: sourceFromReferrer(input.referrer, utm),
    utm,
  }
}

export function sanitizeSeoAttributionTarget(value: unknown): string | null {
  const cleaned = sanitizeBoundedString(value, MAX_STRING_LENGTH)
  if (!cleaned) return null
  try {
    if (cleaned.startsWith('/')) {
      return new URL(cleaned, 'https://albion-guildmanager.local').pathname.slice(0, MAX_STRING_LENGTH)
    }
    const url = new URL(cleaned)
    return `${url.origin}${url.pathname}`.slice(0, MAX_STRING_LENGTH)
  } catch {
    return cleaned.slice(0, MAX_STRING_LENGTH)
  }
}

export function seoSessionCookieOptions(host: string | null | undefined) {
  const domain = getLocaleCookieDomain(host)
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SEO_SESSION_MAX_AGE_SECONDS,
    ...(domain ? { domain } : {}),
  }
}

function visitorIdFromRequest(request: NextRequest): string | null {
  return sanitizeSeoVisitorId(request.cookies.get(SEO_SESSION_COOKIE)?.value)
}

async function loadSeoSessionByVisitorId(visitorId: string): Promise<SeoSessionRow | null> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('seo_sessions')
    .select(
      'id, first_landing_path, first_locale, first_feature_slug, first_referrer_host, first_source, first_utm',
    )
    .eq('visitor_id', visitorId)
    .maybeSingle()
  if (error) {
    log.error('[seo-attribution] session lookup failed', error, { visitor_id: visitorId })
    return null
  }
  return data ? normalizeSessionRow(data) : null
}

function normalizeSessionRow(row: Record<string, unknown>): SeoSessionRow {
  return {
    id: row.id as string,
    first_landing_path: row.first_landing_path as string,
    first_locale: (row.first_locale as Locale | null) ?? null,
    first_feature_slug: (row.first_feature_slug as string | null) ?? null,
    first_referrer_host: (row.first_referrer_host as string | null) ?? null,
    first_source: ((row.first_source as SeoAttributionSource | null) ?? 'unknown'),
    first_utm: (row.first_utm as Record<string, string> | null) ?? {},
  }
}

async function ensureSeoSession(
  visitorId: string,
  context: SeoAttributionContext,
): Promise<SeoSessionRow | null> {
  const db = getAdminClient()
  const existing = await loadSeoSessionByVisitorId(visitorId)
  if (existing) {
    const { error } = await db
      .from('seo_sessions')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) {
      log.error('[seo-attribution] session touch failed', error, { seo_session_id: existing.id })
    }
    return existing
  }

  const insertRow = {
    visitor_id: visitorId,
    first_landing_path: context.path,
    first_locale: context.locale,
    first_feature_slug: context.featureSlug,
    first_referrer_host: context.referrerHost,
    first_source: context.source,
    first_utm: context.utm,
  }
  const { data, error } = await db
    .from('seo_sessions')
    .insert(insertRow)
    .select(
      'id, first_landing_path, first_locale, first_feature_slug, first_referrer_host, first_source, first_utm',
    )
    .single()
  if (!error && data) return normalizeSessionRow(data)
  if ((error as { code?: string } | null)?.code === '23505') {
    return loadSeoSessionByVisitorId(visitorId)
  }
  log.error('[seo-attribution] session insert failed', error, {
    visitor_id: visitorId,
    path: context.path,
  })
  return null
}

async function hasRecentDuplicateEvent(input: {
  seoSessionId: string
  eventType: SeoAttributionEventType
  path: string
  target: string | null
}): Promise<boolean> {
  const db = getAdminClient()
  let query = db
    .from('seo_events')
    .select('id')
    .eq('seo_session_id', input.seoSessionId)
    .eq('event_type', input.eventType)
    .eq('path', input.path)
    .gte('created_at', new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString())
    .limit(1)

  query = input.target ? query.eq('target', input.target) : query.is('target', null)
  const { data, error } = await query
  if (error) {
    log.error('[seo-attribution] event dedupe failed', error, {
      seo_session_id: input.seoSessionId,
      event_type: input.eventType,
    })
    return false
  }
  return (data ?? []).length > 0
}

async function insertSeoEvent(input: {
  session: SeoSessionRow
  eventType: SeoAttributionEventType
  context: SeoAttributionContext
  target: string | null
}): Promise<{ ok: boolean; skipped?: boolean }> {
  const isDuplicate = await hasRecentDuplicateEvent({
    seoSessionId: input.session.id,
    eventType: input.eventType,
    path: input.context.path,
    target: input.target,
  })
  if (isDuplicate) return { ok: true, skipped: true }

  const db = getAdminClient()
  const { error } = await db.from('seo_events').insert({
    seo_session_id: input.session.id,
    event_type: input.eventType,
    path: input.context.path,
    locale: input.context.locale,
    feature_slug: input.context.featureSlug,
    target: input.target,
    referrer_host: input.context.referrerHost,
    details: {},
  })
  if (error) {
    log.error('[seo-attribution] event insert failed', error, {
      seo_session_id: input.session.id,
      event_type: input.eventType,
    })
    return { ok: false }
  }
  return { ok: true }
}

function contextFromSessionRow(session: SeoSessionRow): SeoAttributionContext {
  return {
    path: session.first_landing_path,
    locale: session.first_locale,
    featureSlug: session.first_feature_slug,
    referrerHost: session.first_referrer_host,
    source: session.first_source,
    utm: session.first_utm,
  }
}

export async function recordClientSeoAttributionEvent(
  request: NextRequest,
  payload: ClientSeoAttributionPayload,
): Promise<{ ok: true; visitorId: string } | { ok: false; code: 'invalid_payload'; status: 400 }> {
  const context = parseSeoAttributionContext({
    path: payload.path,
    referrer: payload.referrer ?? request.headers.get('referer'),
  })
  if (!context) return { ok: false, code: 'invalid_payload', status: 400 }

  const visitorId = visitorIdFromRequest(request) ?? crypto.randomUUID()
  if (!hasSeoAttributionDbEnv()) return { ok: true, visitorId }

  try {
    const session = await ensureSeoSession(visitorId, context)
    if (session) {
      await insertSeoEvent({
        session,
        eventType: payload.eventType,
        context,
        target: sanitizeSeoAttributionTarget(payload.target),
      })
    }
  } catch (error) {
    log.error('[seo-attribution] client record threw', error, {
      visitor_id: visitorId,
      event_type: payload.eventType,
    })
  }
  return { ok: true, visitorId }
}

export async function recordSeoAttributionEventFromRequest(
  request: NextRequest,
  input: RecordSeoAttributionInput,
): Promise<{ ok: boolean; skipped?: boolean }> {
  const visitorId = visitorIdFromRequest(request)
  if (!visitorId) return { ok: true, skipped: true }
  if (!hasSeoAttributionDbEnv()) return { ok: true, skipped: true }

  try {
    const session = await loadSeoSessionByVisitorId(visitorId)
    if (!session) return { ok: true, skipped: true }
    return insertSeoEvent({
      session,
      eventType: input.eventType,
      context: contextFromSessionRow(session),
      target: sanitizeSeoAttributionTarget(input.target),
    })
  } catch (error) {
    log.error('[seo-attribution] server record threw', error, {
      visitor_id: visitorId,
      event_type: input.eventType,
    })
    return { ok: false }
  }
}

export async function captureTenantAcquisitionSource(
  input: CaptureTenantAcquisitionInput,
): Promise<{ ok: boolean; skipped?: boolean }> {
  const visitorId = sanitizeSeoVisitorId(input.visitorId)
  if (!visitorId) return { ok: true, skipped: true }
  if (!hasSeoAttributionDbEnv()) return { ok: true, skipped: true }

  try {
    const session = await loadSeoSessionByVisitorId(visitorId)
    if (!session) return { ok: true, skipped: true }
    const db = getAdminClient()
    const { error } = await db.from('tenant_acquisition_sources').insert({
      tenant_id: input.tenantId,
      seo_session_id: session.id,
      first_landing_path: session.first_landing_path,
      first_locale: session.first_locale,
      first_feature_slug: session.first_feature_slug,
      first_referrer_host: session.first_referrer_host,
      first_source: session.first_source,
      first_utm: session.first_utm,
    })
    if ((error as { code?: string } | null)?.code === '23505') {
      return { ok: true, skipped: true }
    }
    if (error) {
      log.error('[seo-attribution] tenant acquisition insert failed', error, {
        tenant_id: input.tenantId,
        visitor_id: visitorId,
      })
      return { ok: false }
    }
    return { ok: true }
  } catch (error) {
    log.error('[seo-attribution] tenant acquisition capture threw', error, {
      tenant_id: input.tenantId,
      visitor_id: visitorId,
    })
    return { ok: false }
  }
}

export async function captureTenantAcquisitionSourceFromRequest(
  request: NextRequest,
  input: { tenantId: string },
): Promise<{ ok: boolean; skipped?: boolean }> {
  return captureTenantAcquisitionSource({
    tenantId: input.tenantId,
    visitorId: request.cookies.get(SEO_SESSION_COOKIE)?.value,
  })
}
