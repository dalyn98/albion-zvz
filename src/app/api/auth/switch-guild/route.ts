import { NextRequest, NextResponse } from 'next/server'
import {
  AUTH_FLOW_BINDING_COOKIE_VALUE,
  canShareAuthBindingCookie,
  hopTokenBindingCookieName,
  hopTokenBindingCookieOptions,
} from '@/lib/auth-flow-cookie'
import { requireLiveSession } from '@/lib/auth'
import { buildDiscordMemberSession } from '@/lib/discord-member-session'
import { getGuildMemberByBot } from '@/lib/discord'
import { listAccessibleGuildMemberships } from '@/lib/guild-member-directory'
import { LAST_GUILD_COOKIE, lastGuildCookieOptions } from '@/lib/last-guild-cookie'
import { withNoStore } from '@/lib/no-store-response'
import { signHopToken } from '@/lib/oauth-state'
import { sanitizeInternalReturnTo } from '@/lib/safe-return-to'
import {
  SESSION_COOKIE_NAME,
  cookieOptions,
  signSession,
} from '@/lib/session'
import { getTenantDiscordConfig } from '@/lib/tenant'
import { buildTenantHostUrl, classifyHost } from '@/lib/tenant-resolver'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isSameOriginPost(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  if (!origin || !host) return false
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase()
  } catch {
    return false
  }
}

function redirectBack(
  request: NextRequest,
  reason: string,
  status = 303,
): NextResponse {
  const target = new URL('/me/guilds', request.url)
  target.searchParams.set('error', reason)
  return withNoStore(NextResponse.redirect(target, { status }))
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginPost(request)) {
    return redirectBack(request, 'invalid_request', 303)
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return redirectBack(request, 'invalid_request')
  }
  const targetGuildId = String(formData.get('guildId') ?? '').trim()
  const returnTo = sanitizeInternalReturnTo(formData.get('returnTo'), '/')
  if (!UUID_PATTERN.test(targetGuildId)) {
    return redirectBack(request, 'invalid_target')
  }

  const session = await requireLiveSession().catch(() => null)
  if (
    !session ||
    !session.guildId ||
    session.isGuest ||
    session.isLocalGuildAccount
  ) {
    return redirectBack(request, 'unauthorized')
  }
  if (targetGuildId === session.guildId) {
    return withNoStore(
      NextResponse.redirect(new URL(returnTo, request.url), { status: 303 }),
    )
  }

  const memberships = await listAccessibleGuildMemberships(
    session.discordId,
    session.guildId,
  ).catch(() => [])
  const targetMembership = memberships.find(
    (membership) => membership.guildId === targetGuildId,
  )
  if (!targetMembership) {
    return redirectBack(request, 'membership_required')
  }

  const tenant = await getTenantDiscordConfig(targetGuildId)
  if (!tenant?.botInstalled || tenant.slug !== targetMembership.slug) {
    return redirectBack(request, 'target_unavailable')
  }
  const discordMember = await getGuildMemberByBot(
    tenant.discordGuildId,
    session.discordId,
  ).catch(() => null)
  const discordUser = discordMember?.user
  if (!discordMember || !discordUser || discordUser.id !== session.discordId) {
    return redirectBack(request, 'membership_required')
  }

  const targetSession = await buildDiscordMemberSession({
    tenant,
    discordId: session.discordId,
    user: discordUser,
    member: discordMember,
    preferredLocale: null,
    authenticatedAt: session.authenticatedAt ?? 0,
    previousSession: session,
  }).catch(() => null)
  if (!targetSession || targetSession.mode !== 'member') {
    return redirectBack(request, 'membership_required')
  }

  const hostClassification = classifyHost(request.headers.get('host'))
  if (hostClassification.kind !== 'tenant') {
    const response = withNoStore(
      NextResponse.redirect(new URL(returnTo, request.url), { status: 303 }),
    )
    response.cookies.set(
      SESSION_COOKIE_NAME,
      await signSession({ ...targetSession.session, issuedAt: Date.now() }),
      cookieOptions(),
    )
    response.cookies.set(
      LAST_GUILD_COOKIE,
      tenant.slug,
      lastGuildCookieOptions(request.headers.get('host')),
    )
    return response
  }

  const targetOrigin = buildTenantHostUrl(tenant.slug, '/')
  const flowId = crypto.randomUUID()
  const requiresBrowserBinding = canShareAuthBindingCookie(
    request.headers.get('host'),
    targetOrigin,
  )
  const hopToken = await signHopToken({
    session: targetSession.session,
    returnTo,
    preferredLocale: targetSession.preferredLocale,
    flowId,
    requiresBrowserBinding,
  })
  const finishUrl = buildTenantHostUrl(
    tenant.slug,
    `/api/auth/finish?token=${encodeURIComponent(hopToken)}`,
  )
  const response = withNoStore(NextResponse.redirect(finishUrl, { status: 303 }))
  response.headers.set('referrer-policy', 'no-referrer')
  if (requiresBrowserBinding) {
    response.cookies.set(
      hopTokenBindingCookieName(flowId),
      AUTH_FLOW_BINDING_COOKIE_VALUE,
      hopTokenBindingCookieOptions(request.headers.get('host')),
    )
  }
  return response
}
