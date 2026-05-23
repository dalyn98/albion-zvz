import { NextRequest, NextResponse } from 'next/server'
import { LOCALE_COOKIE, isLocale } from '@/i18n/locales'
import { localeCookieOptions } from '@/lib/locale-cookie'
import { LAST_GUILD_COOKIE, lastGuildCookieOptions } from '@/lib/last-guild-cookie'
import { SESSION_COOKIE_NAME, cookieOptions, signSession } from '@/lib/session'
import { getPrimaryTenantId, getTenantDiscordConfig } from '@/lib/tenant'
import {
  FALLBACK_TENANT_SLUG,
  classifyHost,
  resolveTenantBySlug,
  type ResolvedTenant,
} from '@/lib/tenant-resolver'
import {
  TEST_AUTH_SECRET_HEADER,
  buildTestSession,
  isTestAuthRouteEnabled,
  isValidTestAuthSecret,
  parseTestAuthRole,
  sanitizeTestAuthReturnTo,
} from '@/lib/test-auth-session'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface TestAuthBody {
  role?: unknown
  tenantSlug?: unknown
  guildId?: unknown
  discordId?: unknown
  username?: unknown
  avatar?: unknown
  eventScope?: unknown
  returnTo?: unknown
  locale?: unknown
  redirect?: unknown
}

async function readBody(request: NextRequest): Promise<TestAuthBody> {
  try {
    const value = await request.json()
    return value && typeof value === 'object' ? (value as TestAuthBody) : {}
  } catch {
    return {}
  }
}

async function resolveTenant(request: NextRequest, body: TestAuthBody): Promise<ResolvedTenant | null> {
  if (typeof body.guildId === 'string' && body.guildId.trim()) {
    const tenant = await getTenantDiscordConfig(body.guildId.trim())
    if (tenant) {
      return {
        tenantId: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        discordGuildId: tenant.discordGuildId,
      }
    }
  }

  if (typeof body.tenantSlug === 'string' && body.tenantSlug.trim()) {
    const tenant = await resolveTenantBySlug(body.tenantSlug.trim())
    if (tenant) return tenant
  }

  const classified = classifyHost(request.headers.get('host'))
  if (classified.kind === 'tenant') {
    const tenant = await resolveTenantBySlug(classified.slug)
    if (tenant) return tenant
  }

  const fallback = await resolveTenantBySlug(FALLBACK_TENANT_SLUG)
  if (fallback) return fallback

  const primaryTenantId = await getPrimaryTenantId()
  const primary = await getTenantDiscordConfig(primaryTenantId)
  if (!primary) return null
  return {
    tenantId: primary.id,
    slug: primary.slug,
    name: primary.name,
    discordGuildId: primary.discordGuildId,
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

export async function POST(request: NextRequest) {
  if (!isTestAuthRouteEnabled()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  if (!isValidTestAuthSecret(request.headers.get(TEST_AUTH_SECRET_HEADER))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await readBody(request)
  const role = parseTestAuthRole(body.role)
  if (!role) {
    return NextResponse.json(
      { error: 'invalid_role', roles: ['admin', 'member', 'eventCreator', 'localGuildAccount', 'guest'] },
      { status: 400 },
    )
  }

  const eventScope = optionalString(body.eventScope) ?? null
  if (role === 'guest' && !eventScope) {
    return NextResponse.json({ error: 'guest_event_scope_required' }, { status: 400 })
  }

  const tenant = await resolveTenant(request, body)
  if (!tenant) {
    return NextResponse.json({ error: 'tenant_not_found' }, { status: 400 })
  }

  const session = buildTestSession({
    role,
    guildId: tenant.tenantId,
    discordId: optionalString(body.discordId),
    username: optionalString(body.username),
    avatar: typeof body.avatar === 'string' ? body.avatar : null,
    eventScope,
  })
  const returnTo = sanitizeTestAuthReturnTo(body.returnTo)
  const shouldRedirect = body.redirect === true
  const response = shouldRedirect
    ? NextResponse.redirect(new URL(returnTo, request.url), { status: 303 })
    : NextResponse.json({
        ok: true,
        role,
        guildId: tenant.tenantId,
        tenantSlug: tenant.slug,
        redirectTo: returnTo,
      })

  response.cookies.set(SESSION_COOKIE_NAME, await signSession(session), cookieOptions())
  response.cookies.set(
    LAST_GUILD_COOKIE,
    tenant.slug,
    lastGuildCookieOptions(request.headers.get('host')),
  )

  const locale = optionalString(body.locale)
  if (isLocale(locale)) {
    response.cookies.set(
      LOCALE_COOKIE,
      locale,
      localeCookieOptions(request.headers.get('host')),
    )
  }

  return response
}
