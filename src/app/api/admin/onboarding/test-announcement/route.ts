import { NextResponse, type NextRequest } from 'next/server'
import { getTranslations } from 'next-intl/server'
import {
  buildFirstRunTestAnnouncementPayload,
  consumeFirstRunAnnouncementRateLimit,
} from '@/lib/admin-first-run'
import {
  DiscordChannelMessageError,
  sendDiscordChannelMessage,
} from '@/lib/discord'
import { log } from '@/lib/log'
import { withNoStore } from '@/lib/no-store-response'
import { getSession } from '@/lib/session'
import { getSessionGuildId, getTenantDiscordConfig } from '@/lib/tenant'
import { buildTenantHostUrl } from '@/lib/tenant-resolver'

type TestAnnouncementErrorCode =
  | 'unauthorized'
  | 'forbidden_origin'
  | 'tenant_missing'
  | 'bot_missing'
  | 'channel_missing'
  | 'rate_limited'
  | 'missing_access'
  | 'missing_permissions'
  | 'unknown_channel'
  | 'forbidden'
  | 'server_error'

const RATE_LIMIT_WINDOW_MS = 30_000
const rateLimitStore = new Map<string, number>()

function json(
  body: { ok: true } | { ok: false; code: TestAnnouncementErrorCode; retryAfterSeconds?: number },
  status: number,
): NextResponse {
  return withNoStore(NextResponse.json(body, { status }))
}

function isSameOriginRequest(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true
  const host = request.headers.get('host')
  if (!host) return false
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase()
  } catch {
    return false
  }
}

function discordErrorResponse(error: DiscordChannelMessageError): NextResponse {
  if (error.discordCode === 50001) return json({ ok: false, code: 'missing_access' }, 403)
  if (error.discordCode === 50013) return json({ ok: false, code: 'missing_permissions' }, 403)
  if (error.discordCode === 10003) return json({ ok: false, code: 'unknown_channel' }, 404)
  if (error.status === 401 || error.status === 403) return json({ ok: false, code: 'forbidden' }, 403)
  return json({ ok: false, code: 'server_error' }, 500)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.isAdmin) return json({ ok: false, code: 'unauthorized' }, 401)
    if (!isSameOriginRequest(request)) return json({ ok: false, code: 'forbidden_origin' }, 403)

    const guildId = await getSessionGuildId(session)
    const tenantConfig = await getTenantDiscordConfig(guildId)
    if (!tenantConfig) return json({ ok: false, code: 'tenant_missing' }, 404)
    if (!tenantConfig.botInstalled) return json({ ok: false, code: 'bot_missing' }, 409)
    if (!tenantConfig.eventChannelId) return json({ ok: false, code: 'channel_missing' }, 409)

    const rateLimit = consumeFirstRunAnnouncementRateLimit(rateLimitStore, {
      key: `${guildId}:${session.discordId}`,
      nowMs: Date.now(),
      windowMs: RATE_LIMIT_WINDOW_MS,
    })
    if (!rateLimit.allowed) {
      return json(
        {
          ok: false,
          code: 'rate_limited',
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        429,
      )
    }

    const t = await getTranslations('adminFirstRun')
    const inviteUrl = buildTenantHostUrl(tenantConfig.slug, '/onboarding/albion')
    const payload = buildFirstRunTestAnnouncementPayload({
      guildName: tenantConfig.name,
      inviteUrl,
      eventsUrl: buildTenantHostUrl(tenantConfig.slug, '/events'),
      guideUrl: buildTenantHostUrl(tenantConfig.slug, '/admin/dashboard/guide'),
      labels: {
        content: t('discordTestContent', { guildName: tenantConfig.name }),
        title: t('discordTestTitle', { guildName: tenantConfig.name }),
        description: t('discordTestDescription'),
        inviteField: t('discordTestInviteField'),
        eventsField: t('discordTestEventsField'),
        guideField: t('discordTestGuideField'),
        footer: t('discordTestFooter'),
      },
    })

    await sendDiscordChannelMessage(tenantConfig.eventChannelId, payload)
    return json({ ok: true }, 200)
  } catch (error) {
    if (error instanceof DiscordChannelMessageError) return discordErrorResponse(error)
    log.error('[admin-first-run] test announcement failed', error)
    return json({ ok: false, code: 'server_error' }, 500)
  }
}
