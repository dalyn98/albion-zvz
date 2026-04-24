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

// Subdomains we never hand out as tenant slugs. Onboarding validates against
// this list, and the proxy refuses to treat a reserved subdomain as a tenant.
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'www',
  'app',
  'api',
  'auth',
  'admin',
  'onboard',
  'onboarding',
  'status',
  'help',
  'docs',
  'blog',
  'mail',
  'cdn',
  'static',
  'assets',
  'discord',
  'bot',
  'webhook',
  'support',
  'billing',
  'login',
  'signup',
  'pricing',
  'marketing',
])

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

export async function resolveTenantBySlug(slug: string): Promise<ResolvedTenant | null> {
  const db = getAdminClient()
  const { data } = await db
    .from('tenants')
    .select('id, slug, name, discord_guild_id, status')
    .eq('slug', slug)
    .eq('status', 'active')
    .maybeSingle()
  if (!data) return null
  return {
    tenantId: data.id as string,
    slug: data.slug as string,
    name: data.name as string,
    discordGuildId: data.discord_guild_id as string,
  }
}

// Validates a user-submitted slug during onboarding.
//   - 2–32 chars, lowercase a–z / 0–9 / hyphen
//   - no leading/trailing hyphen, no consecutive hyphens
//   - not reserved
export function isValidTenantSlug(candidate: string): boolean {
  if (typeof candidate !== 'string') return false
  const s = candidate.toLowerCase()
  if (s.length < 2 || s.length > 32) return false
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(s)) return false
  if (s.includes('--')) return false
  if (RESERVED_SLUGS.has(s)) return false
  return true
}
