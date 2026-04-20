import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SESSION_COOKIE_NAME, verifySession } from '@/lib/session'

function withPathname(response: NextResponse, pathname: string): NextResponse {
  // Forwards the current pathname so the root layout can decide whether to
  // render the AppGate — layouts can't read nextUrl directly. Any response
  // we return carries this header so the downstream render knows where it is.
  response.headers.set('x-pathname', pathname)
  return response
}

export async function proxy(request: NextRequest) {
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
