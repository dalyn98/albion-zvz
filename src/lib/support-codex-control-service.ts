import 'server-only'

import { isDiscordId } from '@/lib/discord-id'
import { createDiscordSupportMessage, DiscordSupportRestError, updateDiscordSupportMessage } from '@/lib/discord-support-rest'
import { formatSupportTicketNumber, type SupportTicketRow } from '@/lib/discord-support-ticket-core'
import { redactSupportTicketText } from '@/lib/support-ticket-ai-core'
import {
  buildSupportCodexJobPayload,
  type SupportCodexJobRow,
  type SupportCodexMode,
  type SupportCodexResult,
  type SupportCodexTicketOption,
  SUPPORT_CODEX_OPERATOR_DISCORD_ID,
} from '@/lib/support-codex-control-core'
import { getAdminClient } from '@/lib/supabase-admin'

interface SupportCodexSettings {
  supportGuildId: string
  channelId: string
  panelMessageId: string | null
}

export interface SupportCodexClaim {
  jobId: string
  leaseToken: string
  mode: SupportCodexMode
  instruction: string
  baseGitSha: string | null
  workspaceKey: string
  codexThreadId: string | null
  ticket: {
    number: number
    category: string
    subject: string
    description: string
    guildHint: string | null
  }
}

function asJob(value: unknown): SupportCodexJobRow {
  return value as SupportCodexJobRow
}

function configuredBaseGitSha(): string | null {
  const value = process.env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase() ?? ''
  return /^[a-f0-9]{40}$/.test(value) ? value : null
}

export async function loadSupportCodexSettings(
  supportGuildId: string,
): Promise<SupportCodexSettings | null> {
  if (!isDiscordId(supportGuildId)) return null
  const query = await getAdminClient().from('support_ticket_settings')
    .select('support_guild_id, codex_channel_id, codex_panel_message_id')
    .eq('support_guild_id', supportGuildId)
    .eq('enabled', true)
    .maybeSingle()
  if (query.error) throw new Error(query.error.message)
  if (!query.data || !isDiscordId(query.data.codex_channel_id)) return null
  return {
    supportGuildId: query.data.support_guild_id,
    channelId: query.data.codex_channel_id,
    panelMessageId: isDiscordId(query.data.codex_panel_message_id)
      ? query.data.codex_panel_message_id
      : null,
  }
}

export async function listSupportCodexTickets(
  supportGuildId: string,
): Promise<SupportCodexTicketOption[]> {
  const query = await getAdminClient().from('support_tickets')
    .select('id, ticket_number, subject, category, status')
    .eq('support_guild_id', supportGuildId)
    .is('thread_deleted_at', null)
    .neq('status', 'provision_failed')
    .neq('subject', '[redacted]')
    .order('updated_at', { ascending: false })
    .limit(25)
  if (query.error) throw new Error(query.error.message)
  return (query.data ?? []).map((ticket) => ({
    id: ticket.id,
    ticketNumber: ticket.ticket_number,
    subject: ticket.subject,
    category: ticket.category,
    status: ticket.status,
  }))
}

export async function createSupportCodexJob(input: {
  supportGuildId: string
  ticketId: string
  mode: SupportCodexMode
  instruction: string
  actorDiscordId: string
  interactionId: string
  controlChannelId: string
  parentJobId?: string | null
}): Promise<SupportCodexJobRow> {
  const query = await getAdminClient().rpc('create_support_codex_job', {
    p_support_guild_id: input.supportGuildId,
    p_ticket_id: input.ticketId,
    p_mode: input.mode,
    p_instruction: input.instruction,
    p_actor_discord_id: input.actorDiscordId,
    p_interaction_id: input.interactionId,
    p_control_channel_id: input.controlChannelId,
    p_base_git_sha: configuredBaseGitSha(),
    p_parent_job_id: input.parentJobId ?? null,
  }).single()
  if (query.error) throw new Error(query.error.message)
  return asJob(query.data)
}

export async function loadSupportCodexJob(jobId: string): Promise<SupportCodexJobRow | null> {
  const query = await getAdminClient().from('support_codex_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle()
  if (query.error) throw new Error(query.error.message)
  return query.data ? asJob(query.data) : null
}

async function mutateOperatorJob(
  rpc: 'approve_support_codex_job' | 'cancel_support_codex_job' | 'retry_support_codex_job',
  input: { jobId: string; actorDiscordId: string; interactionId: string },
): Promise<SupportCodexJobRow> {
  const query = await getAdminClient().rpc(rpc, {
    p_job_id: input.jobId,
    p_actor_discord_id: input.actorDiscordId,
    p_interaction_id: input.interactionId,
  }).single()
  if (query.error) throw new Error(query.error.message)
  return asJob(query.data)
}

export async function approveSupportCodexJob(input: {
  jobId: string
  actorDiscordId: string
  interactionId: string
}): Promise<SupportCodexJobRow> {
  return mutateOperatorJob('approve_support_codex_job', input)
}

export async function cancelSupportCodexJob(input: {
  jobId: string
  actorDiscordId: string
  interactionId: string
}): Promise<SupportCodexJobRow> {
  return mutateOperatorJob('cancel_support_codex_job', input)
}

export async function retrySupportCodexJob(input: {
  jobId: string
  actorDiscordId: string
  interactionId: string
}): Promise<SupportCodexJobRow> {
  return mutateOperatorJob('retry_support_codex_job', input)
}

async function loadTicket(ticketId: string): Promise<SupportTicketRow | null> {
  const query = await getAdminClient().from('support_tickets').select('*').eq('id', ticketId).maybeSingle()
  if (query.error) throw new Error(query.error.message)
  return query.data as SupportTicketRow | null
}

export async function syncSupportCodexJobMessage(job: SupportCodexJobRow): Promise<void> {
  const latest = await loadSupportCodexJob(job.id)
  if (latest) job = latest
  const ticket = await loadTicket(job.ticket_id)
  if (!ticket) throw new Error('support_codex_ticket_not_found')
  const payload = buildSupportCodexJobPayload({
    job,
    ticketNumber: ticket.ticket_number,
    ticketSubject: ticket.subject,
  })
  if (job.status_message_id) {
    try {
      await updateDiscordSupportMessage(job.control_channel_id, job.status_message_id, payload)
      return
    } catch (error) {
      if (!(error instanceof DiscordSupportRestError && error.status === 404)) throw error
    }
  }
  const messageId = await createDiscordSupportMessage(job.control_channel_id, payload)
  const saved = await getAdminClient().rpc('set_support_codex_job_message', {
    p_job_id: job.id,
    p_channel_id: job.control_channel_id,
    p_message_id: messageId,
  })
  if (saved.error) throw new Error(saved.error.message)
}

export async function listSupportCodexJobStatus(supportGuildId: string): Promise<string> {
  const query = await getAdminClient().from('support_codex_jobs')
    .select('id, ticket_id, mode, status, attempts, created_at')
    .eq('support_guild_id', supportGuildId)
    .order('created_at', { ascending: false })
    .limit(10)
  if (query.error) throw new Error(query.error.message)
  if (!query.data?.length) return '아직 Codex 작업이 없습니다.'
  const ticketIds = [...new Set(query.data.map((job) => job.ticket_id))]
  const tickets = await getAdminClient().from('support_tickets')
    .select('id, ticket_number')
    .in('id', ticketIds)
  if (tickets.error) throw new Error(tickets.error.message)
  const ticketNumbers = new Map((tickets.data ?? []).map((ticket) => [ticket.id, ticket.ticket_number]))
  return query.data.map((job) => [
    `• ${formatSupportTicketNumber(ticketNumbers.get(job.ticket_id) ?? 0)}`,
    job.mode === 'analyze' ? '조사' : '구현',
    job.status,
    `${job.attempts}/3`,
    `\`${job.id.slice(0, 8)}\``,
  ].join(' · ')).join('\n').slice(0, 1900)
}

export async function claimSupportCodexJob(workerId: string): Promise<SupportCodexClaim | null> {
  const claimed = await getAdminClient().rpc('claim_support_codex_job', {
    p_worker_id: workerId,
  })
  if (claimed.error) throw new Error(claimed.error.message)
  const row = (claimed.data as unknown[] | null)?.[0]
  if (!row) return null
  const job = asJob(row)
  if (!job.lease_token) throw new Error('support_codex_claim_missing_lease')
  const ticket = await loadTicket(job.ticket_id)
  if (!ticket || ticket.thread_deleted_at || ticket.subject === '[redacted]') {
    await failSupportCodexJob({
      jobId: job.id,
      leaseToken: job.lease_token,
      workerId,
      errorCode: 'ticket_not_available',
      retryable: false,
    })
    return null
  }
  const subject = redactSupportTicketText(ticket.subject).text
  const description = redactSupportTicketText(ticket.description).text
  const guildHint = ticket.related_guild_hint
    ? redactSupportTicketText(ticket.related_guild_hint).text
    : null
  return {
    jobId: job.id,
    leaseToken: job.lease_token,
    mode: job.mode,
    instruction: job.instruction,
    baseGitSha: job.base_git_sha,
    workspaceKey: job.workspace_key,
    codexThreadId: job.codex_thread_id,
    ticket: {
      number: Number(ticket.ticket_number),
      category: ticket.category,
      subject,
      description,
      guildHint,
    },
  }
}

export async function heartbeatSupportCodexJob(input: {
  jobId: string
  leaseToken: string
  workerId: string
}): Promise<boolean> {
  const query = await getAdminClient().rpc('heartbeat_support_codex_job', {
    p_job_id: input.jobId,
    p_lease_token: input.leaseToken,
    p_worker_id: input.workerId,
  })
  if (query.error) throw new Error(query.error.message)
  return query.data === true
}

export async function completeSupportCodexJob(input: {
  jobId: string
  leaseToken: string
  workerId: string
  codexThreadId: string
  baseGitSha: string
  result: SupportCodexResult
}): Promise<SupportCodexJobRow> {
  const query = await getAdminClient().rpc('complete_support_codex_job', {
    p_job_id: input.jobId,
    p_lease_token: input.leaseToken,
    p_worker_id: input.workerId,
    p_codex_thread_id: input.codexThreadId,
    p_base_git_sha: input.baseGitSha,
    p_result: input.result,
  }).single()
  if (query.error) throw new Error(query.error.message)
  return asJob(query.data)
}

export async function failSupportCodexJob(input: {
  jobId: string
  leaseToken: string
  workerId: string
  errorCode: string
  retryable: boolean
}): Promise<SupportCodexJobRow> {
  const query = await getAdminClient().rpc('fail_support_codex_job', {
    p_job_id: input.jobId,
    p_lease_token: input.leaseToken,
    p_worker_id: input.workerId,
    p_error_code: input.errorCode,
    p_retryable: input.retryable,
  }).single()
  if (query.error) throw new Error(query.error.message)
  return asJob(query.data)
}

export function assertSupportCodexOperator(discordId: string | null | undefined): void {
  if (discordId !== SUPPORT_CODEX_OPERATOR_DISCORD_ID) {
    throw new Error('support_codex_operator_only')
  }
}
