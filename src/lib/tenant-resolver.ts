// Host → tenant resolution for multi-tenant subdomain routing.
//
// Every request arrives on one of:
//   - {slug}.albion-guildmanager.com  — a tenant subdomain
//   - albion-guildmanager.com          — the canonical root (OAuth callback, landing)
//   - albion-guildmanager.vercel.app   — legacy host, 308 redirect to menhera.*
//   - albion-zvz.vercel.app            — older legacy host, same redirect
//   - *.vercel.app (preview)           — preview deploy; fallback to menhera
//   - localhost:*                       — dev; fallback to menhera
//
// classifyHost() is safe for the Edge runtime (string-only, no DB). DB
// lookups are done in Node runtime routes via resolveTenantBySlug().

import { getAdminClient } from '@/lib/supabase-admin'
import { RESERVED_SLUGS, isValidTenantSlug } from '@/lib/tenant-slug'
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { log } from '@/lib/log'
import { getSupabaseErrorCode, SupabaseQueryError } from '@/lib/supabase-query-error'
import { retrySupabaseRead, type SupabaseReadResult } from '@/lib/supabase-read-retry'
import {
  TENANT_DIRECTORY_CACHE_SECONDS,
  TENANT_DIRECTORY_CACHE_TAG,
} from '@/lib/tenant-cache'

// 하위 호환: 기존에 tenant-resolver 에서 import 하는 코드가 있어 re-export.
// 순수 검증 로직은 tenant-slug.ts 에 있다 (client-safe).
export { RESERVED_SLUGS, isValidTenantSlug }

// Legacy Vercel hosts — old deployments that existing users may have bookmarked.
// These are redirected to menhera.albion-guildmanager.com/<path>.
export const LEGACY_HOSTS: ReadonlySet<string> = new Set([
  'albion-zvz.vercel.app',
  'albion-guildmanager.vercel.app',
])

// The tenant we fall back to when a request arrives on a host we can't parse
// into a subdomain — localhost, vercel preview URLs, legacy hosts.
// Covers the "menhera must always work" requirement during the migration.
export const FALLBACK_TENANT_SLUG = 'menhera'

export type HostClassification =
  | { kind: 'tenant'; slug: string }
  | { kind: 'root' }
  | { kind: 'legacy' }
  | { kind: 'reserved'; slug: string }
  | { kind: 'preview' }
  | { kind: 'localhost' }

export interface ResolvedTenant {
  tenantId: string
  slug: string
  name: string
  discordGuildId: string
}

// The wildcard-enabled root domain for tenant subdomains. Decoupled from
// APP_URL so the OAuth redirect_uri (APP_URL-derived) can point at a
// different host during domain transitions.
export function getCanonicalRootDomain(): string {
  const explicit = process.env.TENANT_ROOT_DOMAIN
  if (explicit) return explicit.toLowerCase()
  const appUrl = process.env.APP_URL
  if (appUrl) {
    try {
      const hostname = new URL(appUrl).hostname.toLowerCase()
      // APP_URL pointing at a *.vercel.app host never has wildcard subdomains —
      // fall through to the hardcoded default rather than return a root that
      // can't host tenants.
      if (!hostname.endsWith('.vercel.app')) return hostname
    } catch {
      /* fallthrough */
    }
  }
  return 'albion-guildmanager.com'
}

// 테넌트 서브도메인이 적용된 절대 URL 을 만든다. Discord 알림/임베드처럼
// 길드 컨텍스트가 필요한 외부 링크에서 사용. APP_URL 의 hostname 앞에 slug 을
// prepend 한다 ("albion-guildmanager.com" → "menhera.albion-guildmanager.com").
//
// 폴백 규칙:
//   - slug 이 비어 있으면 APP_URL + path 그대로 (root 도메인)
//   - APP_URL 이 비었거나 파싱 실패 → path 만 (절대 URL 보장 X 지만 로그용은 OK)
//   - host 가 *.vercel.app / localhost → 와일드카드 서브도메인이 없으니 bare URL
//
// path 는 '/events/<id>' 처럼 leading slash 를 포함해 넘기는 걸 권장하지만
// 누락돼도 자동 보정한다.
export function tenantUrl(slug: string | null | undefined, path: string): string {
  const appUrl = process.env.APP_URL ?? ''
  const trimmedPath = path.startsWith('/') ? path : `/${path}`
  const bare = `${appUrl.replace(/\/$/, '')}${trimmedPath}`
  if (!slug) return bare
  if (!appUrl) return trimmedPath
  try {
    const u = new URL(appUrl)
    const host = u.hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.vercel.app')) {
      return bare
    }
    u.hostname = `${slug}.${host}`
    u.pathname = trimmedPath
    u.search = ''
    u.hash = ''
    return u.toString().replace(/\/$/, '')
  } catch {
    return bare
  }
}

export function classifyHost(hostHeader: string | null | undefined): HostClassification {
  if (!hostHeader) return { kind: 'root' }
  const host = hostHeader.toLowerCase().split(':')[0]

  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') {
    return { kind: 'localhost' }
  }

  if (LEGACY_HOSTS.has(host)) {
    return { kind: 'legacy' }
  }

  const root = getCanonicalRootDomain()
  if (host === root) return { kind: 'root' }

  if (host.endsWith('.' + root)) {
    const sub = host.slice(0, host.length - root.length - 1)
    // Multi-label subdomain (e.g. `foo.bar.albion-guildmanager.com`) isn't
    // supported for tenants — treat as preview/unknown.
    if (sub.includes('.')) return { kind: 'preview' }
    if (RESERVED_SLUGS.has(sub)) return { kind: 'reserved', slug: sub }
    return { kind: 'tenant', slug: sub }
  }

  if (host.endsWith('.vercel.app')) return { kind: 'preview' }

  return { kind: 'root' }
}

// Build the canonical URL for a tenant slug. Used when building OAuth hop
// redirects and legacy-host 308 targets.
export function buildTenantHostUrl(slug: string, pathWithQuery: string): string {
  const root = getCanonicalRootDomain()
  const path = pathWithQuery.startsWith('/') ? pathWithQuery : '/' + pathWithQuery
  return `https://${slug}.${root}${path}`
}

async function retryTenantResolverRead<T>(
  label: string,
  read: () => PromiseLike<SupabaseReadResult<T>>,
): Promise<SupabaseReadResult<T>> {
  return retrySupabaseRead(read, {
    label,
    onRetry: ({ attempt, maxAttempts, delayMs, error }) => {
      log.warn('[tenant-resolver] transient lookup retry', {
        operation: label,
        attempt,
        max_attempts: maxAttempts,
        delay_ms: delayMs,
        error_code: getSupabaseErrorCode(error),
      })
    },
  })
}

async function loadTenantBySlug(slug: string): Promise<ResolvedTenant | null> {
  const db = getAdminClient()
  const { data, error } = await retryTenantResolverRead('tenant_resolver.active_by_slug', () =>
    db
      .from('tenants')
      .select('id, slug, name, discord_guild_id, status')
      .eq('slug', slug)
      .eq('status', 'active')
      .maybeSingle(),
  )
  if (error) {
    log.error('[tenant-resolver] active tenant lookup failed', error)
    throw new SupabaseQueryError('Active tenant lookup failed', error)
  }
  if (!data) return null
  return {
    tenantId: data.id as string,
    slug: data.slug as string,
    name: data.name as string,
    discordGuildId: data.discord_guild_id as string,
  }
}

export const resolveTenantBySlug = cache(
  async (slug: string): Promise<ResolvedTenant | null> => unstable_cache(
    () => loadTenantBySlug(slug),
    ['tenant-by-slug', slug],
    {
      tags: [TENANT_DIRECTORY_CACHE_TAG],
      revalidate: TENANT_DIRECTORY_CACHE_SECONDS,
    },
  )(),
)

// status 필터 없이 slug 만으로 lookup. 공개 길드 페이지 (`/g/<slug>`) 에서 봇 설치는
// 끝났지만 onboarding 위저드를 완료하지 못한 pending tenant 도 "아직 설정 중" 안내
// 페이지로 살리기 위해 사용한다. subdomain routing / cron / API 같은 다른 surface 는
// 여전히 active 만 보는 resolveTenantBySlug() 를 써야 한다.
export interface ResolvedTenantWithStatus extends ResolvedTenant {
  status: string
}

async function loadTenantBySlugAnyStatus(
  slug: string,
): Promise<ResolvedTenantWithStatus | null> {
  const db = getAdminClient()
  const { data, error } = await retryTenantResolverRead('tenant_resolver.any_status_by_slug', () =>
    db
      .from('tenants')
      .select('id, slug, name, discord_guild_id, status')
      .eq('slug', slug)
      .maybeSingle(),
  )
  if (error) {
    log.error('[tenant-resolver] tenant lookup failed', error)
    throw new SupabaseQueryError('Tenant lookup failed', error)
  }
  if (!data) return null
  return {
    tenantId: data.id as string,
    slug: data.slug as string,
    name: data.name as string,
    discordGuildId: data.discord_guild_id as string,
    status: data.status as string,
  }
}

export const resolveTenantBySlugAnyStatus = cache(
  async (slug: string): Promise<ResolvedTenantWithStatus | null> => unstable_cache(
    () => loadTenantBySlugAnyStatus(slug),
    ['tenant-by-slug-any-status', slug],
    {
      tags: [TENANT_DIRECTORY_CACHE_TAG],
      revalidate: TENANT_DIRECTORY_CACHE_SECONDS,
    },
  )(),
)
