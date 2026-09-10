import { z } from 'zod'
import { codexWorkerJson, parseSignedCodexWorkerBody } from '@/lib/codex-worker-http'
import { heartbeatSupportCodexJob } from '@/lib/support-codex-control-service'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const schema = z.object({
  jobId: z.string().uuid(),
  leaseToken: z.string().uuid(),
  workerId: z.string().trim().min(1).max(128).regex(/^[a-z0-9._:-]+$/i),
}).strict()

export async function POST(request: Request) {
  const parsed = await parseSignedCodexWorkerBody(request, schema)
  if (!parsed.ok) return parsed.response
  try {
    const cancelRequested = await heartbeatSupportCodexJob(parsed.data)
    return codexWorkerJson({ cancelRequested })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('support_codex_lease_lost')) {
      return codexWorkerJson({ error: 'lease_lost' }, 409)
    }
    log.error('[support-codex] heartbeat failed', error, {
      job_id: parsed.data.jobId,
      worker_id: parsed.data.workerId,
    })
    return codexWorkerJson({ error: 'heartbeat_failed' }, 500)
  }
}
