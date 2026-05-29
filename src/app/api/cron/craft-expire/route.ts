import { NextResponse } from 'next/server'
import { expireOverdueCraftTasks } from '@/lib/craft-tasks'
import { withCronRun } from '@/lib/cron-run'

// Daily sweep that flips delivered craft tasks past their `expires_at` to
// 'expired'. The partial unique index on box_number is conditional on
// status='delivered', so expiring frees the box number for reuse without
// any extra cleanup. We run this once a day — the box pool is small (~30)
// so even a 24h delay between expiry and reuse is fine.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withCronRun(request, { jobName: 'craft-expire', leaseSeconds: 300 }, async () => {
    try {
      const expired = await expireOverdueCraftTasks()
      return NextResponse.json({ expired })
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'unknown' },
        { status: 500 },
      )
    }
  })
}
