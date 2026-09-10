import { z } from 'zod'
import { codexWorkerJson, parseSignedCodexWorkerBody } from '@/lib/codex-worker-http'
import {
  completeSupportCodexJob,
  syncSupportCodexJobMessage,
} from '@/lib/support-codex-control-service'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const shortList = z.array(z.string().trim().min(1).max(160)).max(6)
const schema = z.object({
  jobId: z.string().uuid(),
  leaseToken: z.string().uuid(),
  workerId: z.string().trim().min(1).max(128).regex(/^[a-z0-9._:-]+$/i),
  codexThreadId: z.string().trim().min(1).max(200),
  baseGitSha: z.string().regex(/^[a-f0-9]{40}$/),
  result: z.object({
    outcome: z.enum(['completed', 'needs_input']),
    summary: z.string().trim().min(1).max(1500),
    diagnosis: z.string().trim().max(1500),
    filesChanged: shortList,
    tests: shortList,
    risks: shortList,
    nextActions: shortList,
    worktree: z.string().trim().min(1).max(240).optional(),
    usage: z.object({
      inputTokens: z.number().int().min(0),
      cachedInputTokens: z.number().int().min(0),
      outputTokens: z.number().int().min(0),
    }).strict().optional(),
  }).strict(),
}).strict()

export async function POST(request: Request) {
  const parsed = await parseSignedCodexWorkerBody(request, schema)
  if (!parsed.ok) return parsed.response
  try {
    const job = await completeSupportCodexJob(parsed.data)
    try {
      await syncSupportCodexJobMessage(job)
    } catch (error) {
      log.warn('[support-codex] completion message sync failed', {
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
    log.error('[support-codex] completion failed', error, { job_id: parsed.data.jobId })
    return codexWorkerJson({ error: 'completion_failed' }, 500)
  }
}
