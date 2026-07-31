import { type NextRequest, NextResponse } from 'next/server'
import { buildLoginEntryHref } from '@/lib/login-entry'
import { withNoStore } from '@/lib/no-store-response'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { classifyHost, resolveTenantBySlug } from '@/lib/tenant-resolver'

function redirectNoStore(request: NextRequest, pathname: string): NextResponse {
  return withNoStore(NextResponse.redirect(new URL(pathname, request.nextUrl.origin)))
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const loginHref = buildLoginEntryHref({ returnTo: '/' })
  const classification = classifyHost(request.headers.get('host'))
  if (classification.kind !== 'tenant') {
    return redirectNoStore(request, loginHref)
  }

  const [session, tenant] = await Promise.all([
    getSession(),
    resolveTenantBySlug(classification.slug),
  ])
  if (!session || !tenant) {
    return redirectNoStore(request, loginHref)
  }

  try {
    const sessionGuildId = await getSessionGuildId(session)
    if (sessionGuildId !== tenant.tenantId) {
      return redirectNoStore(request, loginHref)
    }
  } catch {
    return redirectNoStore(request, loginHref)
  }

  return redirectNoStore(request, '/')
}
