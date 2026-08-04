import 'server-only'

import { createDiscordSupportMessage } from '@/lib/discord-support-rest'
import { formatSupportTicketNumber, type SupportTicketRow } from '@/lib/discord-support-ticket-core'
import { loadSupportTicketSettings } from '@/lib/discord-support-ticket-service'
import { getAdminClient } from '@/lib/supabase-admin'
import { log } from '@/lib/log'

interface AnalysisRow {
  id: number | string
  ticket_id: string
  category_suggestion: string
  confidence: number | string
  staff_summary: string
  urgency_signal: string
  risk_flags: string[]
  pii_warning: boolean
  known_issue_candidates: Array<{ slug?: unknown; confidence?: unknown }>
  model_id: string
  created_at: string
}

function escapeDiscordText(value: string): string {
  return value.replace(/([\\`*_{}\[\]()<>#+\-.!|])/g, '\\$1').slice(0, 500)
}

function analysisMessage(ticket: SupportTicketRow, analysis: AnalysisRow): string {
  const issueSlugs = Array.isArray(analysis.known_issue_candidates)
    ? analysis.known_issue_candidates
      .map((candidate) => typeof candidate.slug === 'string' ? candidate.slug : null)
      .filter(Boolean)
      .slice(0, 3)
    : []
  const threadUrl = ticket.thread_id
    ? `https://discord.com/channels/${ticket.support_guild_id}/${ticket.thread_id}`
    : null
  return [
    `**${formatSupportTicketNumber(ticket.ticket_number)} · staff-only AI triage**`,
    `Summary: ${escapeDiscordText(analysis.staff_summary)}`,
    `Suggested category: **${analysis.category_suggestion}** (${Math.round(Number(analysis.confidence) * 100)}%)`,
    `Urgency signal: **${analysis.urgency_signal}** — staff must confirm priority`,
    `Risk flags: ${analysis.risk_flags.join(', ') || 'none'}`,
    `Sensitive-data warning: ${analysis.pii_warning ? 'yes' : 'no'}`,
    `Known-issue candidates: ${issueSlugs.length > 0 ? issueSlugs.join(', ') : 'none'}`,
    threadUrl,
    `Model: ${analysis.model_id} · advisory only · never sent to the requester`,
  ].filter(Boolean).join('\n').slice(0, 1950)
}

export async function deliverSupportAiReviewNotifications(limit = 10): Promise<{
  delivered: number
  failed: number
}> {
  const result = { delivered: 0, failed: 0 }
  const db = getAdminClient()
  const analysesQuery = await db.from('support_ticket_ai_analyses')
    .select('id, ticket_id, category_suggestion, confidence, staff_summary, urgency_signal, risk_flags, pii_warning, known_issue_candidates, model_id, created_at')
    .is('notified_at', null)
    .order('created_at', { ascending: true })
    .limit(Math.max(1, Math.min(limit, 25)))
  if (analysesQuery.error) throw new Error(analysesQuery.error.message)
  const analyses = (analysesQuery.data ?? []) as AnalysisRow[]
  if (analyses.length === 0) return result

  const ticketsQuery = await db.from('support_tickets').select('*')
    .in('id', analyses.map((analysis) => analysis.ticket_id))
  if (ticketsQuery.error) throw new Error(ticketsQuery.error.message)
  const ticketMap = new Map(
    ((ticketsQuery.data ?? []) as SupportTicketRow[]).map((ticket) => [ticket.id, ticket]),
  )

  for (const analysis of analyses) {
    const ticket = ticketMap.get(analysis.ticket_id)
    if (!ticket) continue
    try {
      const settings = await loadSupportTicketSettings(ticket.support_guild_id)
      if (!settings?.ai_review_channel_id) throw new Error('ai_review_channel_not_configured')
      const content = analysisMessage(ticket, analysis)
      const reviewMessageId = await createDiscordSupportMessage(settings.ai_review_channel_id, {
        content,
        allowed_mentions: { parse: [] },
      })
      const securityRelevant = analysis.pii_warning || analysis.urgency_signal === 'urgent' ||
        analysis.risk_flags.some((flag) => [
          'security', 'credential_exposure', 'data_loss', 'widespread_outage',
        ].includes(flag))
      let securityMessageId: string | null = null
      if (securityRelevant && settings.security_alert_channel_id) {
        try {
          securityMessageId = await createDiscordSupportMessage(settings.security_alert_channel_id, {
            content: `⚠️ ${content}`.slice(0, 1950),
            allowed_mentions: { parse: [] },
          })
        } catch (error) {
          log.warn('[support-ai] security notification failed', {
            analysis_id: analysis.id,
            ticket_id: analysis.ticket_id,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
      const update = await db.from('support_ticket_ai_analyses')
        .update({
          notified_at: new Date().toISOString(),
          review_channel_id: settings.ai_review_channel_id,
          review_message_id: reviewMessageId,
          security_channel_id: securityMessageId ? settings.security_alert_channel_id : null,
          security_message_id: securityMessageId,
        })
        .eq('id', analysis.id)
        .is('notified_at', null)
      if (update.error) throw new Error(update.error.message)
      result.delivered += 1
    } catch (error) {
      result.failed += 1
      log.warn('[support-ai] staff notification failed', {
        analysis_id: analysis.id,
        ticket_id: analysis.ticket_id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return result
}
