import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SESSION_COOKIE_NAME, verifySession } from '@/lib/session-verify'
import {
  classifyHost,
  buildTenantHostUrl,
  FALLBACK_TENANT_SLUG,
} from '@/lib/tenant-resolver'
import {
  getSuperAdminPath,
  SUPER_ADMIN_INTERNAL_PATH,
} from '@/lib/super-admin-path'
import { canAccessAdminPath } from '@/lib/admin-route-access'

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

// Canonical 도메인 (albion-guildmanager.com) 의 마케팅 라우트는 깔끔한 URL 로
// 노출하기 위해 내부 /public/(marketing)/* 로 rewrite. URL 바는 그대로 유지되며
// (`/`, `/features`, `/pricing`, `/faq`) 서버는 마케팅 페이지를 렌더한다.
// 서브도메인 ({slug}.albion-guildmanager.com) 은 같은 path 라도 영향 없음 —
// canonical kind 일 때만 분기한다. 마케팅 페이지가 추가될 때 매핑만 늘리면 된다.
const CANONICAL_MARKETING_REWRITES: Record<string, string> = {
  '/': '/public/landing',
  '/features': '/public/features',
  '/pricing': '/public/pricing',
  '/faq': '/public/faq',
}

// canonical `/docs` `/docs/<slug>` → `/public/docs[/<slug>]`. exact 매핑이 아니라
// prefix 매핑이므로 별도 함수로 분리. docs 페이지가 늘어도 매핑 손댈 일 없음.
function resolveDocsRewriteTarget(pathname: string): string | null {
  if (pathname === '/docs') return '/public/docs'
  if (pathname.startsWith('/docs/')) return `/public${pathname}`
  return null
}

// `/g/<slug>` → `/public/g/<slug>`. 공개 길드 프로필 — 비로그인 방문자가 모집/
// 자랑용으로 공유하는 URL. 동적 segment 라 별도 함수로 분리.
function resolveGuildProfileRewriteTarget(pathname: string): string | null {
  if (pathname === '/g' || pathname.startsWith('/g/')) return `/public${pathname}`
  return null
}

function rewriteCanonicalMarketing(request: NextRequest): NextResponse | null {
  const pathname = request.nextUrl.pathname
  const target =
    CANONICAL_MARKETING_REWRITES[pathname] ??
    resolveDocsRewriteTarget(pathname)
  if (!target) return null
  const host = request.headers.get('host')
  const classification = classifyHost(host)
  if (classification.kind !== 'root') return null
  const rewritten = new URL(target, request.url)
  rewritten.search = request.nextUrl.search
  const response = NextResponse.rewrite(rewritten)
  // layout 의 isPublicPathname 분기는 x-pathname 헤더를 본다. rewrite target 인
  // /public/* 으로 보내야 PublicShell + AppGate 우회가 정확히 동작한다.
  response.headers.set('x-pathname', target)
  return response
}

// 공개 길드 프로필 rewrite — canonical / tenant 서브도메인 양쪽에서 동작.
// 마케팅 라우트와 달리 길드원 사이드바에서 `/g/<slug>` 로 같은 서브도메인 안에서
// 진입하는 경로가 있어, root 한정으로 두면 멤버 페이지가 404 가 된다.
function rewriteGuildProfile(request: NextRequest): NextResponse | null {
  const target = resolveGuildProfileRewriteTarget(request.nextUrl.pathname)
  if (!target) return null
  const host = request.headers.get('host')
  const classification = classifyHost(host)
  // legacy 는 위 redirect 단계에서 이미 처리됨. unknown host 만 컷.
  if (classification.kind !== 'root' && classification.kind !== 'tenant') return null
  const rewritten = new URL(target, request.url)
  rewritten.search = request.nextUrl.search
  const response = NextResponse.rewrite(rewritten)
  response.headers.set('x-pathname', target)
  return response
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

  const marketingRewrite = rewriteCanonicalMarketing(request)
  if (marketingRewrite) return marketingRewrite

  const guildProfileRewrite = rewriteGuildProfile(request)
  if (guildProfileRewrite) return guildProfileRewrite

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
  if (!canAccessAdminPath(pathname, session.isAdmin, session.capabilities)) {
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
