import { NextRequest, NextResponse } from 'next/server'
import {
  DISCORD_BROWSER_AUTH_COOKIE,
  createDiscordBrowserAuthAttempt,
  discordBrowserAuthCookieOptions,
  discordBrowserAuthCookieValue,
} from '@/lib/discord-browser-auth'
import { withNoStore } from '@/lib/no-store-response'
import {
  classifyHost,
  FALLBACK_TENANT_SLUG,
  resolveTenantBySlug,
} from '@/lib/tenant-resolver'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_BODY_BYTES = 4096

function json(body: Record<string, unknown>, status = 200): NextResponse {
  return withNoStore(NextResponse.json(body, { status }))
}

function isSameOriginRequest(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  if (!origin || !host) return false
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase()
  } catch {
    return false
  }
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

async function readJsonBody(request: NextRequest): Promise<unknown | null> {
  if (!request.body) return null
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    byteLength += value.byteLength
    if (byteLength > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
  } catch {
    return null
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginRequest(request)) {
    return json({ ok: false, code: 'forbidden_origin' }, 403)
  }
  const declaredLength = Number.parseInt(request.headers.get('content-length') ?? '0', 10)
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json({ ok: false, code: 'payload_too_large' }, 413)
  }

  const body = await readJsonBody(request)
  if (body === null) return json({ ok: false, code: 'invalid_payload' }, 400)
  const returnTo =
    body &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    typeof (body as { returnTo?: unknown }).returnTo === 'string'
      ? (body as { returnTo: string }).returnTo
      : '/'
  if (returnTo.length > 2048) {
    return json({ ok: false, code: 'invalid_payload' }, 400)
  }

  const tenant = await resolveRequestTenant(request)
  if (!tenant) return json({ ok: false, code: 'tenant_not_found' }, 404)

  const result = await createDiscordBrowserAuthAttempt({
    guildId: tenant.tenantId,
    returnTo,
    headers: request.headers,
  })
  if (!result.ok) {
    const status = result.error === 'rate_limited' ? 429 : 503
    const response = json({ ok: false, code: result.error }, status)
    if (result.retryAfterSeconds > 0) {
      response.headers.set('retry-after', String(result.retryAfterSeconds))
    }
    return response
  }

  const response = json({
    ok: true,
    attemptId: result.attemptId,
    approvalCode: result.approvalCode,
    expiresInSeconds: result.expiresInSeconds,
    discordUrl: `https://discord.com/channels/${encodeURIComponent(tenant.discordGuildId)}`,
  })
  response.cookies.set(
    DISCORD_BROWSER_AUTH_COOKIE,
    discordBrowserAuthCookieValue(result.attemptId, result.browserSecret),
    discordBrowserAuthCookieOptions(result.expiresInSeconds),
  )
  response.headers.set('referrer-policy', 'no-referrer')
  return response
}
