import { NextResponse } from 'next/server'
import { getDependencyHealth } from '@/lib/dependency-health'

export const dynamic = 'force-dynamic'

export async function GET() {
  const health = await getDependencyHealth()
  return NextResponse.json(health, {
    status: health.ok ? 200 : 503,
    headers: { 'cache-control': 'no-store' },
  })
}
