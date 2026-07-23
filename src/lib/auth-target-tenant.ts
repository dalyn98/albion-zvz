import type { TenantDiscordConfig } from '@/lib/tenant'

interface AuthTargetDbQuery {
  select: (columns: string) => {
    eq: (column: string, value: string) => {
      maybeSingle: () => Promise<{
        data: { guild_id?: unknown } | null
        error: unknown
      }>
    }
  }
}

interface AuthTargetDb {
  from: (table: string) => unknown
}

interface ResolvedTenantReference {
  tenantId: string
}

interface Dependencies {
  db: AuthTargetDb
  resolveTenantBySlug: (slug: string) => Promise<ResolvedTenantReference | null>
  getTenantDiscordConfig: (tenantId: string) => Promise<TenantDiscordConfig | null>
}

function parseTarget(returnTo: string):
  | { kind: 'guild'; slug: string }
  | { kind: 'event'; eventId: string }
  | null {
  try {
    const pathname = new URL(returnTo, 'https://albion-guildmanager.local').pathname
    const segments = pathname.split('/').filter(Boolean).map(decodeURIComponent)
    if (segments.length >= 2 && segments[0] === 'g' && segments[1]) {
      return { kind: 'guild', slug: segments[1] }
    }
    if (segments.length >= 2 && segments[0] === 'events' && segments[1]) {
      return { kind: 'event', eventId: segments[1] }
    }
    return null
  } catch {
    return null
  }
}

export async function resolveAuthTargetTenant(
  returnTo: string,
  dependencies: Dependencies,
): Promise<TenantDiscordConfig | null> {
  const target = parseTarget(returnTo)
  if (!target) return null

  let tenantId: string | null = null
  if (target.kind === 'guild') {
    const resolved = await dependencies.resolveTenantBySlug(target.slug)
    tenantId = resolved?.tenantId ?? null
  } else {
    const query = dependencies.db.from('events') as AuthTargetDbQuery
    const { data, error } = await query
      .select('guild_id')
      .eq('id', target.eventId)
      .maybeSingle()
    if (error) {
      throw new Error('Auth target event lookup failed', { cause: error })
    }
    tenantId = typeof data?.guild_id === 'string' ? data.guild_id : null
  }

  if (!tenantId) return null
  const tenant = await dependencies.getTenantDiscordConfig(tenantId)
  return tenant?.botInstalled ? tenant : null
}
