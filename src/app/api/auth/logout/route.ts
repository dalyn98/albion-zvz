import { NextResponse } from 'next/server'
import { SESSION_COOKIE_NAME } from '@/lib/session'

export async function POST(request: Request) {
  const url = new URL(request.url)
  const response = NextResponse.redirect(new URL('/', url.origin), { status: 303 })
  response.cookies.delete(SESSION_COOKIE_NAME)
  return response
}
