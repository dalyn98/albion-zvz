import { NextResponse } from 'next/server'
import { SESSION_COOKIE_NAME } from '@/lib/session'
import { withNoStore } from '@/lib/no-store-response'

export async function POST(request: Request) {
  const url = new URL(request.url)
  const response = NextResponse.redirect(new URL('/', url.origin), { status: 303 })
  response.cookies.delete(SESSION_COOKIE_NAME)
  return withNoStore(response)
}
