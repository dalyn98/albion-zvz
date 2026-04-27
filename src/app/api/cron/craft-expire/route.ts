import { NextResponse } from 'next/server'
import { expireOverdueCraftTasks } from '@/lib/craft-tasks'

// Daily sweep that flips delivered craft tasks past their `expires_at` to
// 'expired'. The partial unique index on box_number is conditional on
// status='delivered', so expiring frees the box number for reuse without
// any extra cleanup. We run this once a day — the box pool is small (~30)
// so even a 24h delay between expiry and reuse is fine.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const expired = await expireOverdueCraftTasks()
    return NextResponse.json({ expired })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    )
  }
}
