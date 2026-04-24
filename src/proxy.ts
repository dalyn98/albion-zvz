import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SESSION_COOKIE_NAME, verifySession } from '@/lib/session'

// APP_URL 변경(albion-zvz → albion-guildmanager) 이후에도 기존 유저가 북마크로
// 옛 호스트를 방문하면 OAuth state 쿠키가 legacy host 에 심기는 반면 callback
// redirect_uri 는 canonical host 라 세션 만료로 끊겼다. 첫 진입부터 canonical
// 도메인으로 308 리다이렉트해 전 플로우가 같은 호스트 위에서 돌게 한다.
const LEGACY_HOSTS = new Set(['albion-zvz.vercel.app'])

function redirectLegacyHost(request: NextRequest): NextResponse | null {
  const host = request.headers.get('host')
  if (!host || !LEGACY_HOSTS.has(host)) return null
  const appUrl = process.env.APP_URL
  if (!appUrl) return null
  const canonical = new URL(appUrl)
  if (host === canonical.host) return null
  const target = new URL(
    request.nextUrl.pathname + request.nextUrl.search,
    canonical.origin,
  )
  return NextResponse.redirect(target, 308)
}

function withPathname(response: NextResponse, pathname: string): NextResponse {
  // Forwards the current pathname so the root layout can decide whether to
  // render the AppGate — layouts can't read nextUrl directly. Any response
  // we return carries this header so the downstream render knows where it is.
  response.headers.set('x-pathname', pathname)
  return response
}

export async function proxy(request: NextRequest) {
  const legacyRedirect = redirectLegacyHost(request)
  if (legacyRedirect) return legacyRedirect

  const pathname = request.nextUrl.pathname

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
  // Run on every page route so layouts can read the pathname. Static/API paths
  // are excluded because neither needs the header.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|icon|apple-icon|manifest).*)'],
}
