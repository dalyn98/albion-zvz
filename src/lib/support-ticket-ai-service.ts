import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import { generateText, gateway, Output } from 'ai'
import { getAdminClient } from '@/lib/supabase-admin'
import { log } from '@/lib/log'
import type { SupportTicketRow } from '@/lib/discord-support-ticket-core'
import {
  buildSupportAiPrompt,
  normalizeSupportAiOutput,
  SUPPORT_AI_PROMPT_VERSION,
  supportAiOutputSchema,
} from '@/lib/support-ticket-ai-core'

interface SupportTicketAiJobRow {
  id: number | string
  ticket_id: string
  revision: number
  attempts: number
}

interface KnownIssueRow {
  slug: string
  title: string
  public_summary: string
  status: string
}

const DEFAULT_MODEL = 'openai/gpt-5.4-nano'
const FALLBACK_MODEL = 'openai/gpt-5.4-mini'

function configuredModel(): string {
  const value = process.env.SUPPORT_AI_MODEL?.trim() || DEFAULT_MODEL
  return /^[a-z0-9-]+\/[a-z0-9.-]+$/i.test(value) ? value : DEFAULT_MODEL
}

function safeError(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown_ai_error'
  const status = 'statusCode' in error && typeof error.statusCode === 'number'
    ? `:${error.statusCode}`
    : ''
  return `${error.name || 'ai_error'}${status}`.replace(/[^a-z0-9:_-]/gi, '_').slice(0, 120)
}

async function loadJobContext(ticketId: string): Promise<{
  ticket: SupportTicketRow
  knownIssues: KnownIssueRow[]
} | null> {
  const db = getAdminClient()
  const ticketQuery = await db.from('support_tickets').select('*').eq('id', ticketId).maybeSingle()
  if (ticketQuery.error) throw new Error(ticketQuery.error.message)
  if (!ticketQuery.data) return null
  const ticket = ticketQuery.data as SupportTicketRow
  const issuesQuery = await db.from('support_known_issues')
    .select('slug, title, public_summary, status')
    .eq('support_guild_id', ticket.support_guild_id)
    .neq('status', 'resolved')
    .order('updated_at', { ascending: false })
    .limit(25)
  if (issuesQuery.error) throw new Error(issuesQuery.error.message)
  return { ticket, knownIssues: (issuesQuery.data ?? []) as KnownIssueRow[] }
}

async function completeJob(input: {
  job: SupportTicketAiJobRow
  modelId: string
  output: ReturnType<typeof normalizeSupportAiOutput>
  inputHash: string
  inputTokens: number
  outputTokens: number
}): Promise<void> {
  const { error } = await getAdminClient().rpc('complete_support_ticket_ai_job', {
    p_job_id: input.job.id,
    p_model_id: input.modelId,
    p_prompt_version: SUPPORT_AI_PROMPT_VERSION,
    p_category_suggestion: input.output.categorySuggestion,
    p_confidence: input.output.confidence,
    p_staff_summary: input.output.staffSummary,
    p_urgency_signal: input.output.urgencySignal,
    p_risk_flags: input.output.riskFlags,
    p_pii_warning: input.output.piiWarning,
    p_known_issue_candidates: input.output.knownIssueCandidates,
    p_input_hash: input.inputHash,
    p_input_tokens: input.inputTokens,
    p_output_tokens: input.outputTokens,
  })
  if (error) throw new Error(error.message)
}

async function failJob(jobId: number | string, error: unknown): Promise<void> {
  const message = safeError(error)
  const result = await getAdminClient().rpc('fail_support_ticket_ai_job', {
    p_job_id: jobId,
    p_error: message,
  })
  if (result.error) {
    log.error('[support-ai] failed to persist job failure', result.error, { job_id: jobId })
  }
}

export async function processSupportTicketAiJobs(limit = 10): Promise<{
  claimed: number
  completed: number
  failed: number
  skipped: number
}> {
  const result = { claimed: 0, completed: 0, failed: 0, skipped: 0 }
  const workerId = `vercel:${process.env.VERCEL_DEPLOYMENT_ID ?? randomUUID()}`.slice(0, 128)
  const claim = await getAdminClient().rpc('claim_support_ticket_ai_jobs', {
    p_worker_id: workerId,
    p_limit: Math.max(1, Math.min(limit, 25)),
  })
  if (claim.error) throw new Error(claim.error.message)
  const jobs = (claim.data ?? []) as SupportTicketAiJobRow[]
  result.claimed = jobs.length

  for (const job of jobs) {
    try {
      const context = await loadJobContext(job.ticket_id)
      if (!context || context.ticket.status === 'closed' || context.ticket.thread_deleted_at) {
        await failJob(job.id, new Error('ticket_unavailable'))
        result.skipped += 1
        continue
      }
      const prompt = buildSupportAiPrompt({
        selectedCategory: context.ticket.category,
        subject: context.ticket.subject,
        description: context.ticket.description,
        guildHint: context.ticket.related_guild_hint,
        knownIssues: context.knownIssues.map((issue) => ({
          slug: issue.slug,
          title: issue.title,
          publicSummary: issue.public_summary,
          status: issue.status,
        })),
      })
      const modelId = configuredModel()
      const inputHash = createHash('sha256')
        .update(`${SUPPORT_AI_PROMPT_VERSION}\n${prompt.prompt}`)
        .digest('hex')
      const aiResult = await generateText({
        model: gateway(modelId as Parameters<typeof gateway>[0]),
        system: prompt.system,
        prompt: prompt.prompt,
        maxOutputTokens: 700,
        output: Output.object({ schema: supportAiOutputSchema }),
        providerOptions: {
          gateway: {
            models: [FALLBACK_MODEL],
            user: createHash('sha256').update(context.ticket.opener_discord_id).digest('hex'),
            tags: ['feature:support-triage', `env:${process.env.VERCEL_ENV ?? 'development'}`],
          },
        },
      })
      const allowedSlugs = new Set(context.knownIssues.map((issue) => issue.slug))
      const normalized = normalizeSupportAiOutput(aiResult.output, allowedSlugs)
      await completeJob({
        job,
        modelId,
        output: normalized,
        inputHash,
        inputTokens: aiResult.usage.inputTokens ?? 0,
        outputTokens: aiResult.usage.outputTokens ?? 0,
      })
      result.completed += 1
    } catch (error) {
      await failJob(job.id, error)
      result.failed += 1
      log.warn('[support-ai] advisory analysis failed', {
        job_id: job.id,
        ticket_id: job.ticket_id,
        error: safeError(error),
      })
    }
  }
  return result
}
