import { NextResponse } from 'next/server'
import { z } from 'zod'
import { codexWorkerJson, parseSignedCodexWorkerBody } from '@/lib/codex-worker-http'
import { claimSupportCodexJob } from '@/lib/support-codex-control-service'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const schema = z.object({
  workerId: z.string().trim().min(1).max(128).regex(/^[a-z0-9._:-]+$/i),
}).strict()

export async function POST(request: Request) {
  const parsed = await parseSignedCodexWorkerBody(request, schema)
  if (!parsed.ok) return parsed.response
  if (process.env.SUPPORT_CODEX_ENABLED?.trim().toLowerCase() === 'false') {
    return codexWorkerJson({ error: 'codex_dispatch_disabled' }, 503)
  }
  try {
    const job = await claimSupportCodexJob(parsed.data.workerId)
    return job
      ? codexWorkerJson({ job })
      : new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    log.error('[support-codex] claim failed', error, { worker_id: parsed.data.workerId })
    return codexWorkerJson({ error: 'claim_failed' }, 500)
  }
}
