import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SESSION_COOKIE_NAME, verifySession } from '@/lib/session'
import {
  classifyHost,
  buildTenantHostUrl,
  FALLBACK_TENANT_SLUG,
} from '@/lib/tenant-resolver'
import {
  getSuperAdminPath,
  SUPER_ADMIN_INTERNAL_PATH,
} from '@/lib/super-admin-path'

// Multi-tenant subdomain migration (Phase A1):
// legacy vercel.app hosts 308-redirect to `menhera.albion-guildmanager.com/<path>`
// so existing bookmarks keep working. `/api/auth/*` is exempt so in-flight
// OAuth callbacks bound to the old redirect_uri still complete while the
// Discord Developer Portal is being updated.
function redirectLegacyHost(request: NextRequest): NextResponse | null {
  const host = request.headers.get('host')
  const classification = classifyHost(host)
  if (classification.kind !== 'legacy') return null
  if (request.nextUrl.pathname.startsWith('/api/auth/')) return null
  const target = buildTenantHostUrl(
    FALLBACK_TENANT_SLUG,
    request.nextUrl.pathname + request.nextUrl.search,
  )
  return NextResponse.redirect(target, 308)
}

// Root domain root path (`albion-guildmanager.com/`) goes to the public landing
// page so first-time visitors see marketing instead of the AppGate. Tenant
// subdomains keep the existing flow — their root is the events list.
function redirectRootDomainHome(request: NextRequest): NextResponse | null {
  if (request.nextUrl.pathname !== '/') return null
  const host = request.headers.get('host')
  const classification = classifyHost(host)
  if (classification.kind !== 'root') return null
  return NextResponse.redirect(new URL('/public/landing', request.url), 307)
}

function withPathname(response: NextResponse, pathname: string): NextResponse {
  // Forwards the current pathname so the root layout can decide whether to
  // render the AppGate — layouts can't read nextUrl directly. Any response
  // we return carries this header so the downstream render knows where it is.
  response.headers.set('x-pathname', pathname)
  return response
}

// 슈퍼어드민 path randomization. SUPER_ADMIN_PATH env 가 기본값과 다를 때:
//   - 외부 path (env 값) 는 내부 /super-admin/* 로 rewrite 후 렌더
//   - 직접 /super-admin/* 접근은 404 (존재 자체를 숨김)
// env 가 미설정이면 기본 path 를 그대로 노출 — 기존 동작.
function handleSuperAdminPath(request: NextRequest): NextResponse | null {
  const ext = getSuperAdminPath()
  const internal = SUPER_ADMIN_INTERNAL_PATH
  if (ext === internal) return null

  const pathname = request.nextUrl.pathname

  if (pathname === internal || pathname.startsWith(`${internal}/`)) {
    return new NextResponse('Not Found', { status: 404 })
  }

  if (pathname === ext || pathname.startsWith(`${ext}/`)) {
    const rest = pathname.slice(ext.length)
    const rewritten = new URL(`${internal}${rest}`, request.url)
    rewritten.search = request.nextUrl.search
    const response = NextResponse.rewrite(rewritten)
    // layout 의 path 분기는 canonical 기준이므로 x-pathname 도 canonical 로.
    response.headers.set('x-pathname', `${internal}${rest}`)
    return response
  }

  return null
}

export async function proxy(request: NextRequest) {
  const legacyRedirect = redirectLegacyHost(request)
  if (legacyRedirect) return legacyRedirect

  const rootHomeRedirect = redirectRootDomainHome(request)
  if (rootHomeRedirect) return rootHomeRedirect

  const superAdminResponse = handleSuperAdminPath(request)
  if (superAdminResponse) return superAdminResponse

  const pathname = request.nextUrl.pathname

  // /api/auth/* 는 legacy-host 308 리다이렉트 후 곧장 원 라우트로 흘려보낸다.
  // (x-pathname 이나 admin 게이트 대상이 아님)
  if (pathname.startsWith('/api/auth/')) {
    return NextResponse.next()
  }

  if (!pathname.startsWith('/admin/dashboard')) {
    return withPathname(NextResponse.next(), pathname)
  }

  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const session = await verifySession(cookie)

  if (!session) {
    return withPathname(NextResponse.redirect(new URL('/admin', request.url)), pathname)
  }
  if (!session.isAdmin) {
    return withPathname(
      NextResponse.redirect(new URL('/admin?error=not_admin', request.url)),
      pathname,
    )
  }

  return withPathname(NextResponse.next(), pathname)
}

export const config = {
  // 일반 페이지 라우트(+ OAuth 콜백/start 경로) 에서 실행. 페이지는 x-pathname
  // 헤더가 필요하고 /api/auth 는 legacy-host 리다이렉트가 필요. 그 외 api/정적
  // 자원은 제외해 불필요한 proxy 호출을 줄인다.
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|icon|apple-icon|manifest).*)',
    '/api/auth/:path*',
  ],
}
