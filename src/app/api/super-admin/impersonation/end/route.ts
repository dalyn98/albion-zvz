import { NextRequest, NextResponse } from 'next/server'
import { getSuperAdminSession } from '@/lib/super-admin'
import { logSuperAdminAction } from '@/lib/super-admin-audit'
import { getSuperAdminPath } from '@/lib/super-admin-path'
import {
  IMPERSONATION_COOKIE_NAME,
  verifyImpersonation,
} from '@/lib/super-admin-impersonation-token'
import { withNoStore } from '@/lib/no-store-response'

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  if (!origin || !host) return false
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase()
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return withNoStore(
      NextResponse.json({ ok: false, code: 'forbidden_origin' }, { status: 403 }),
    )
  }

  const session = await getSuperAdminSession()
  if (!session) {
    return withNoStore(
      NextResponse.json({ ok: false, code: 'unauthorized' }, { status: 401 }),
    )
  }

  const rawCookie = request.cookies.get(IMPERSONATION_COOKIE_NAME)?.value
  const impersonation = await verifyImpersonation(rawCookie)
  const response = NextResponse.redirect(
    new URL(`${getSuperAdminPath()}/tenants`, request.url),
    { status: 303 },
  )
  response.cookies.delete(IMPERSONATION_COOKIE_NAME)

  if (impersonation) {
    await logSuperAdminAction({
      superAdminDiscordId: session.discordId,
      action: 'impersonate.end',
      targetTenantId: impersonation.tenantId,
      details: { mode: 'read_only_support_view' },
    })
  }

  return withNoStore(response)
}
