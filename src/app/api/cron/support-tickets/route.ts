import { NextResponse } from 'next/server'
import { withCronRun } from '@/lib/cron-run'
import { processSupportTicketMaintenance } from '@/lib/discord-support-ticket-service'
import { ensureOfficialSupportServer } from '@/lib/official-support-server'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  return withCronRun(
    request,
    { jobName: 'support-tickets', leaseSeconds: 600 },
    async () => {
      let bootstrap: Awaited<ReturnType<typeof ensureOfficialSupportServer>> | { error: string }
      try {
        bootstrap = await ensureOfficialSupportServer()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log.warn('[discord-support] server bootstrap failed; maintenance will continue', {
          error: message,
        })
        bootstrap = { error: message.slice(0, 300) }
      }
      const maintenance = await processSupportTicketMaintenance()
      return NextResponse.json({ bootstrap, maintenance })
    },
  )
}
