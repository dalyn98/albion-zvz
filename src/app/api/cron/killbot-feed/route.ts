import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { runKillbotFeed } from '@/lib/killbot'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runKillbotFeed(getAdminClient())
  return NextResponse.json(result)
}
