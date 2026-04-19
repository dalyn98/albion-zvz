import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SESSION_COOKIE_NAME, verifySession } from '@/lib/session'

export async function proxy(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith('/admin/dashboard')) {
    return NextResponse.next()
  }

  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const session = await verifySession(cookie)

  if (!session) {
    return NextResponse.redirect(new URL('/admin', request.url))
  }
  if (!session.isAdmin) {
    return NextResponse.redirect(new URL('/admin?error=not_admin', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/admin/dashboard/:path*',
}
