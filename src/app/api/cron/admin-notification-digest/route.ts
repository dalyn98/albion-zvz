import { NextResponse } from 'next/server'
import { sendAdminNotificationDigest } from '@/lib/admin-notifications'
import { listActiveTenants } from '@/lib/tenant'
import { withCronRun } from '@/lib/cron-run'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withCronRun(request, { jobName: 'admin-notification-digest', leaseSeconds: 600 }, async () => {
    const tenants = await listActiveTenants()
    const results = []
    for (const tenant of tenants) {
      const result = await sendAdminNotificationDigest(tenant)
      results.push({ tenant_id: tenant.id, ...result })
    }
    return NextResponse.json({
      scanned: tenants.length,
      sent: results.filter((r) => r.sent).length,
      results,
    })
  })
}
