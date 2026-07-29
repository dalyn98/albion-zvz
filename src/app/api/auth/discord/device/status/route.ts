import { NextRequest, NextResponse } from 'next/server'
import {
  DISCORD_BROWSER_AUTH_COOKIE,
  discordBrowserAuthCookieOptions,
  hashDiscordBrowserAuthValue,
  isValidDiscordBrowserAuthAttemptId,
  parseDiscordBrowserAuthCookie,
} from '@/lib/discord-browser-auth'
import { getGuildMemberByBot } from '@/lib/discord'
import {
  buildDiscordMemberSession,
  resolveDiscordMemberPostLoginPath,
} from '@/lib/discord-member-session'
import { LOCALE_COOKIE, isLocale } from '@/i18n/locales'
import { localeCookieOptions } from '@/lib/locale-cookie'
import { LAST_GUILD_COOKIE, lastGuildCookieOptions } from '@/lib/last-guild-cookie'
import { withNoStore } from '@/lib/no-store-response'
import {
  SESSION_COOKIE_NAME,
  cookieOptions,
  signSession,
} from '@/lib/session'
import { getAdminClient } from '@/lib/supabase-admin'
import { getTenantDiscordConfig } from '@/lib/tenant'
import {
  classifyHost,
  FALLBACK_TENANT_SLUG,
  resolveTenantBySlug,
} from '@/lib/tenant-resolver'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function json(body: Record<string, unknown>, status = 200): NextResponse {
  return withNoStore(NextResponse.json(body, { status }))
}

async function resolveRequestTenant(request: NextRequest) {
  const classified = classifyHost(request.headers.get('host'))
  const slug =
    classified.kind === 'tenant'
      ? classified.slug
      : classified.kind === 'localhost' || classified.kind === 'preview'
        ? FALLBACK_TENANT_SLUG
        : null
  return slug ? resolveTenantBySlug(slug) : null
}

function expireBinding(response: NextResponse): NextResponse {
  response.cookies.set(
    DISCORD_BROWSER_AUTH_COOKIE,
    '',
    discordBrowserAuthCookieOptions(0),
  )
  return response
}

interface BrowserAuthAttempt {
  guild_id: string
  browser_secret_hash: string
  return_to: string
  approved_discord_id: string | null
  approved_at: string | null
  consumed_at: string | null
  expires_at: string
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const attemptId = new URL(request.url).searchParams.get('id')
  const binding = parseDiscordBrowserAuthCookie(
    request.cookies.get(DISCORD_BROWSER_AUTH_COOKIE)?.value,
  )
  if (
    !isValidDiscordBrowserAuthAttemptId(attemptId) ||
    !binding ||
    binding.attemptId !== attemptId
  ) {
    return json({ ok: false, status: 'invalid' }, 401)
  }

  const resolvedTenant = await resolveRequestTenant(request)
  if (!resolvedTenant) return json({ ok: false, status: 'invalid' }, 404)

  const browserSecretHash = hashDiscordBrowserAuthValue(binding.browserSecret)
  const db = getAdminClient()
  const { data, error } = await db
    .from('discord_browser_auth_attempts')
    .select(
      'guild_id, browser_secret_hash, return_to, approved_discord_id, approved_at, consumed_at, expires_at',
    )
    .eq('id', attemptId)
    .eq('guild_id', resolvedTenant.tenantId)
    .eq('browser_secret_hash', browserSecretHash)
    .maybeSingle()
  if (error || !data) {
    return expireBinding(json({ ok: false, status: 'invalid' }, 401))
  }
  const attempt = data as BrowserAuthAttempt
  const expiresAt = Date.parse(attempt.expires_at)
  if (
    attempt.consumed_at !== null ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now()
  ) {
    return expireBinding(json({ ok: false, status: 'expired' }, 410))
  }
  if (!attempt.approved_at || !attempt.approved_discord_id) {
    return json({ ok: true, status: 'pending' })
  }

  const tenant = await getTenantDiscordConfig(attempt.guild_id)
  if (!tenant || tenant.slug !== resolvedTenant.slug) {
    return expireBinding(json({ ok: false, status: 'invalid' }, 401))
  }
  const member = await getGuildMemberByBot(
    tenant.discordGuildId,
    attempt.approved_discord_id,
  )
  if (!member?.user || member.user.id !== attempt.approved_discord_id) {
    return json({ ok: false, status: 'verification_failed' }, 503)
  }

  const memberSession = await buildDiscordMemberSession({
    tenant,
    discordId: attempt.approved_discord_id,
    user: member.user,
    member,
    preferredLocale: null,
  })
  const consumedAt = new Date().toISOString()
  const { data: consumed, error: consumeError } = await db
    .from('discord_browser_auth_attempts')
    .update({ consumed_at: consumedAt })
    .eq('id', attemptId)
    .eq('guild_id', tenant.id)
    .eq('browser_secret_hash', browserSecretHash)
    .eq('approved_discord_id', attempt.approved_discord_id)
    .is('consumed_at', null)
    .gt('expires_at', consumedAt)
    .select('id')
    .maybeSingle()
  if (consumeError || !consumed) {
    return expireBinding(json({ ok: false, status: 'expired' }, 410))
  }

  const redirectTo = resolveDiscordMemberPostLoginPath(
    attempt.return_to,
    memberSession.preferredLocale,
  )
  const response = expireBinding(json({ ok: true, status: 'complete', redirectTo }))
  response.cookies.set(
    SESSION_COOKIE_NAME,
    await signSession({ ...memberSession.session, issuedAt: Date.now() }),
    cookieOptions(),
  )
  response.cookies.set(
    LAST_GUILD_COOKIE,
    tenant.slug,
    lastGuildCookieOptions(request.headers.get('host')),
  )
  if (memberSession.preferredLocale && isLocale(memberSession.preferredLocale)) {
    response.cookies.set(
      LOCALE_COOKIE,
      memberSession.preferredLocale,
      localeCookieOptions(request.headers.get('host')),
    )
  }
  response.headers.set('referrer-policy', 'no-referrer')
  return response
}
