import 'server-only'

import { inspectSupportHealth, type SupportHealthReport } from '@/lib/discord-support-health'
import { getAdminClient } from '@/lib/supabase-admin'

export interface SupportOperationsSnapshot {
  supportGuildId: string
  health: SupportHealthReport
  metrics: {
    total: number
    open: number
    unassigned: number
    urgent: number
    slaBreaches: number
    helpful: number
    unhelpful: number
    aiCompleted: number
    aiFailed: number
    aiInputTokens: number
    aiOutputTokens: number
  }
  recentTickets: Array<{
    id: string
    ticketNumber: number
    subject: string
    category: string
    status: string
    priority: string
    aiStatus: string
    assigneeDiscordId: string | null
    threadId: string | null
    createdAt: string
  }>
  knownIssues: Array<{
    id: string
    slug: string
    title: string
    category: string
    status: string
    forumPostId: string | null
    updatedAt: string
  }>
  recentAnalyses: Array<{
    id: string
    ticketId: string
    summary: string
    category: string
    urgency: string
    confidence: number
    riskFlags: string[]
    modelId: string
    createdAt: string
  }>
}

function failedHealth(error: unknown): SupportHealthReport {
  return {
    ok: false,
    checkedAt: new Date().toISOString(),
    checks: [{
      name: 'health-check',
      ok: false,
      message: error instanceof Error ? error.message.slice(0, 300) : 'Health check failed.',
    }],
  }
}

export async function getSupportOperationsSnapshot(): Promise<SupportOperationsSnapshot | null> {
  const supportGuildId = process.env.DISCORD_SUPPORT_GUILD_ID?.trim()
  if (!supportGuildId) return null
  const db = getAdminClient()
  const [tickets, feedback, sla, knownIssues, analyses, jobs, healthResult] = await Promise.all([
    db.from('support_tickets')
      .select('id, ticket_number, subject, category, status, priority, ai_status, assignee_discord_id, thread_id, created_at')
      .eq('support_guild_id', supportGuildId)
      .order('created_at', { ascending: false })
      .limit(5000),
    db.from('support_ticket_feedback').select('helpful').limit(5000),
    db.from('support_ticket_sla_events').select('breached').eq('breached', true).limit(5000),
    db.from('support_known_issues')
      .select('id, slug, title, category, status, forum_post_id, updated_at')
      .eq('support_guild_id', supportGuildId)
      .order('updated_at', { ascending: false })
      .limit(100),
    db.from('support_ticket_ai_analyses')
      .select('id, ticket_id, staff_summary, category_suggestion, urgency_signal, confidence, risk_flags, model_id, input_tokens, output_tokens, created_at')
      .order('created_at', { ascending: false })
      .limit(5000),
    db.from('support_ticket_jobs').select('status').limit(5000),
    inspectSupportHealth(supportGuildId).catch(failedHealth),
  ])
  for (const query of [tickets, feedback, sla, knownIssues, analyses, jobs]) {
    if (query.error) throw new Error(query.error.message)
  }

  const ticketRows = tickets.data ?? []
  const analysisRows = analyses.data ?? []
  const activeStatuses = new Set(['provisioning', 'open', 'in_progress', 'waiting_requester', 'resolved'])
  return {
    supportGuildId,
    health: healthResult,
    metrics: {
      total: ticketRows.length,
      open: ticketRows.filter((ticket) => activeStatuses.has(ticket.status)).length,
      unassigned: ticketRows.filter((ticket) => activeStatuses.has(ticket.status) && !ticket.assignee_discord_id).length,
      urgent: ticketRows.filter((ticket) => activeStatuses.has(ticket.status) && ticket.priority === 'urgent').length,
      slaBreaches: (sla.data ?? []).length,
      helpful: (feedback.data ?? []).filter((entry) => entry.helpful).length,
      unhelpful: (feedback.data ?? []).filter((entry) => !entry.helpful).length,
      aiCompleted: (jobs.data ?? []).filter((job) => job.status === 'completed').length,
      aiFailed: (jobs.data ?? []).filter((job) => job.status === 'failed').length,
      aiInputTokens: analysisRows.reduce((sum, row) => sum + (row.input_tokens ?? 0), 0),
      aiOutputTokens: analysisRows.reduce((sum, row) => sum + (row.output_tokens ?? 0), 0),
    },
    recentTickets: ticketRows.slice(0, 50).map((ticket) => ({
      id: ticket.id,
      ticketNumber: Number(ticket.ticket_number),
      subject: ticket.subject,
      category: ticket.category,
      status: ticket.status,
      priority: ticket.priority,
      aiStatus: ticket.ai_status,
      assigneeDiscordId: ticket.assignee_discord_id,
      threadId: ticket.thread_id,
      createdAt: ticket.created_at,
    })),
    knownIssues: (knownIssues.data ?? []).map((issue) => ({
      id: issue.id,
      slug: issue.slug,
      title: issue.title,
      category: issue.category,
      status: issue.status,
      forumPostId: issue.forum_post_id,
      updatedAt: issue.updated_at,
    })),
    recentAnalyses: analysisRows.slice(0, 30).map((analysis) => ({
      id: String(analysis.id),
      ticketId: analysis.ticket_id,
      summary: analysis.staff_summary,
      category: analysis.category_suggestion,
      urgency: analysis.urgency_signal,
      confidence: Number(analysis.confidence),
      riskFlags: analysis.risk_flags,
      modelId: analysis.model_id,
      createdAt: analysis.created_at,
    })),
  }
}
