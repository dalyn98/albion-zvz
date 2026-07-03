import { NextResponse } from 'next/server'
import { getMarketingMyGuildHref } from '@/lib/last-guild'
import { withNoStore } from '@/lib/no-store-response'
import { getSession } from '@/lib/session'

export async function GET(): Promise<NextResponse> {
  const session = await getSession()
  const href = await getMarketingMyGuildHref(session)
  return withNoStore(NextResponse.json({ href }))
}
