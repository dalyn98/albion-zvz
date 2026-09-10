import { z } from 'zod'
import { codexWorkerJson, parseSignedCodexWorkerBody } from '@/lib/codex-worker-http'
import {
  failSupportCodexJob,
  syncSupportCodexJobMessage,
} from '@/lib/support-codex-control-service'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const schema = z.object({
  jobId: z.string().uuid(),
  leaseToken: z.string().uuid(),
  workerId: z.string().trim().min(1).max(128).regex(/^[a-z0-9._:-]+$/i),
  errorCode: z.string().trim().min(1).max(160).regex(/^[a-z0-9:_-]+$/i),
  retryable: z.boolean(),
}).strict()

export async function POST(request: Request) {
  const parsed = await parseSignedCodexWorkerBody(request, schema)
  if (!parsed.ok) return parsed.response
  try {
    const job = await failSupportCodexJob(parsed.data)
    try {
      await syncSupportCodexJobMessage(job)
    } catch (error) {
      log.warn('[support-codex] failure message sync failed', {
        job_id: job.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    return codexWorkerJson({ status: job.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('support_codex_lease_lost')) {
      return codexWorkerJson({ error: 'lease_lost' }, 409)
    }
    log.error('[support-codex] failure report failed', error, { job_id: parsed.data.jobId })
    return codexWorkerJson({ error: 'failure_report_failed' }, 500)
  }
}
