import { NextResponse } from 'next/server'
import { withCronRun } from '@/lib/cron-run'
import { getAdminClient } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withCronRun(request, { jobName: 'member-trade-expire', leaseSeconds: 300 }, async () => {
    const db = getAdminClient()
    const { data, error } = await db.rpc('expire_member_trade_orders')
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ expired: data ?? null })
  })
}
