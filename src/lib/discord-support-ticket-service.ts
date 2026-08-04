import 'server-only'

import { getGuildMemberByBot } from '@/lib/discord'
import { isDiscordId } from '@/lib/discord-id'
import {
  buildSupportPanelPayload,
  buildTicketHeaderPayload,
  formatSupportTicketNumber,
  type DiscordSupportMessages,
  type SupportTicketAction,
  type SupportTicketCategory,
  type SupportTicketPriority,
  type SupportTicketRow,
  type SupportTicketSettingsRow,
} from '@/lib/discord-support-ticket-core'
import { loadDiscordSupportMessages } from '@/lib/discord-support-ticket-messages'
import {
  addDiscordThreadMember,
  createDiscordPrivateThread,
  createDiscordSupportMessage,
  deleteDiscordSupportMessage,
  deleteDiscordSupportThread,
  discordSupportMessageExists,
  DiscordSupportRestError,
  setDiscordThreadClosed,
  updateDiscordSupportMessage,
} from '@/lib/discord-support-rest'
import type { Locale } from '@/i18n/locales'
import { log } from '@/lib/log'
import { isSuperAdmin } from '@/lib/super-admin-identity'
import { getAdminClient } from '@/lib/supabase-admin'

interface CreateSupportTicketInput {
  supportGuildId: string
  openerDiscordId: string
  openerName: string
  openerLocale: Locale
  category: SupportTicketCategory
  subject: string
  description: string
  guildHint: string | null
  interactionId: string
}

export type CreateSupportTicketResult =
  | { ok: true; ticket: SupportTicketRow; existing: boolean }
  | { ok: false; reason: 'disabled' | 'provision_failed' | 'rate_limited' }

function asTicket(data: unknown): SupportTicketRow {
  return data as SupportTicketRow
}

const SUPPORT_TICKET_SETTINGS_COLUMNS = [
  'support_guild_id',
  'parent_channel_id',
  'log_channel_id',
  'queue_channel_id',
  'ai_review_channel_id',
  'security_alert_channel_id',
  'status_channel_id',
  'known_issues_channel_id',
  'panel_message_id',
  'panel_version',
  'resource_channel_ids',
  'resource_message_ids',
  'resources_version',
  'staff_role_ids',
  'enabled',
  'waiting_reminder_hours',
  'auto_close_hours',
  'retention_days',
  'support_hours',
  'ai_enabled',
  'ai_shadow_mode',
  'updated_by_discord_id',
].join(', ')

export async function loadSupportTicketSettings(
  supportGuildId: string,
): Promise<SupportTicketSettingsRow | null> {
  const { data, error } = await getAdminClient()
    .from('support_ticket_settings')
    .select(SUPPORT_TICKET_SETTINGS_COLUMNS)
    .eq('support_guild_id', supportGuildId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? data as unknown as SupportTicketSettingsRow : null
}

export async function configureSupportTickets(input: {
  supportGuildId: string
  parentChannelId: string
  logChannelId: string
  staffRoleId: string
  queueChannelId?: string | null
  aiReviewChannelId?: string | null
  securityAlertChannelId?: string | null
  statusChannelId?: string | null
  knownIssuesChannelId?: string | null
  actorDiscordId: string
}): Promise<void> {
  for (const [label, value] of Object.entries({
    supportGuildId: input.supportGuildId,
    parentChannelId: input.parentChannelId,
    logChannelId: input.logChannelId,
    staffRoleId: input.staffRoleId,
    actorDiscordId: input.actorDiscordId,
  })) {
    if (!isDiscordId(value)) throw new Error(`Invalid ${label}`)
  }
  for (const [label, value] of Object.entries({
    queueChannelId: input.queueChannelId,
    aiReviewChannelId: input.aiReviewChannelId,
    securityAlertChannelId: input.securityAlertChannelId,
    statusChannelId: input.statusChannelId,
    knownIssuesChannelId: input.knownIssuesChannelId,
  })) {
    if (value != null && !isDiscordId(value)) throw new Error(`Invalid ${label}`)
  }
  if (!isSuperAdmin(input.actorDiscordId)) throw new Error('support_setup_admin_only')

  const existing = await loadSupportTicketSettings(input.supportGuildId)
  const staffRoleIds = Array.from(new Set([
    ...(existing?.staff_role_ids ?? []),
    input.staffRoleId,
  ])).slice(0, 20)
  const { error } = await getAdminClient().from('support_ticket_settings').upsert({
    support_guild_id: input.supportGuildId,
    parent_channel_id: input.parentChannelId,
    log_channel_id: input.logChannelId,
    ...(input.queueChannelId !== undefined ? { queue_channel_id: input.queueChannelId } : {}),
    ...(input.aiReviewChannelId !== undefined ? { ai_review_channel_id: input.aiReviewChannelId } : {}),
    ...(input.securityAlertChannelId !== undefined ? { security_alert_channel_id: input.securityAlertChannelId } : {}),
    ...(input.statusChannelId !== undefined ? { status_channel_id: input.statusChannelId } : {}),
    ...(input.knownIssuesChannelId !== undefined ? { known_issues_channel_id: input.knownIssuesChannelId } : {}),
    staff_role_ids: staffRoleIds,
    enabled: true,
    updated_by_discord_id: input.actorDiscordId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'support_guild_id' })
  if (error) throw new Error(error.message)
}

export async function publishSupportTicketPanel(input: {
  supportGuildId: string
  actorDiscordId: string
  messages: DiscordSupportMessages
}): Promise<string> {
  const panelVersion = 'support-panel-v2'
  if (!isSuperAdmin(input.actorDiscordId)) throw new Error('support_setup_admin_only')
  const settings = await loadSupportTicketSettings(input.supportGuildId)
  if (!settings?.enabled) throw new Error('support_setup_missing')
  let messageId = settings.panel_message_id
  if (messageId && settings.panel_version === panelVersion) {
    const exists = await discordSupportMessageExists(settings.parent_channel_id, messageId)
    if (exists) return messageId
    messageId = null
  }
  if (messageId) {
    try {
      await updateDiscordSupportMessage(
        settings.parent_channel_id,
        messageId,
        buildSupportPanelPayload(input.messages),
      )
    } catch (error) {
      if (!(error instanceof DiscordSupportRestError && error.status === 404)) throw error
      messageId = null
    }
  }
  if (!messageId) {
    messageId = await createDiscordSupportMessage(
      settings.parent_channel_id,
      buildSupportPanelPayload(input.messages),
    )
  }
  const { error } = await getAdminClient().from('support_ticket_settings').update({
    panel_message_id: messageId,
    panel_version: panelVersion,
    updated_by_discord_id: input.actorDiscordId,
    updated_at: new Date().toISOString(),
  }).eq('support_guild_id', input.supportGuildId)
  if (error) throw new Error(error.message)
  return messageId
}

async function resolveRelatedTenantId(discordId: string, hint: string | null): Promise<string | null> {
  const db = getAdminClient()
  const [ownedResult, identityResult] = await Promise.all([
    db.from('tenants')
      .select('id, slug, name')
      .eq('created_by_discord_id', discordId)
      .neq('status', 'deleted')
      .limit(25),
    db.from('guild_member_access_identities')
      .select('guild_id')
      .eq('identity_type', 'discord')
      .eq('subject_id', discordId)
      .is('revoked_at', null)
      .limit(25),
  ])
  if (ownedResult.error) throw new Error(ownedResult.error.message)
  if (identityResult.error) throw new Error(identityResult.error.message)
  const memberGuildIds = Array.from(new Set((identityResult.data ?? []).map((row) => row.guild_id)))
  const memberResult = memberGuildIds.length > 0
    ? await db.from('tenants').select('id, slug, name').in('id', memberGuildIds).neq('status', 'deleted')
    : { data: [], error: null }
  if (memberResult.error) throw new Error(memberResult.error.message)

  const candidates = new Map<string, { id: string; slug: string; name: string }>()
  for (const row of [...(ownedResult.data ?? []), ...(memberResult.data ?? [])]) {
    candidates.set(row.id, row)
  }
  const rows = [...candidates.values()]
  if (rows.length === 1) return rows[0].id
  if (!hint) return null
  const normalizedHint = hint.toLocaleLowerCase('en-US')
  return rows.find((row) =>
    normalizedHint === row.slug.toLocaleLowerCase('en-US') ||
    normalizedHint === row.name.toLocaleLowerCase('en-US') ||
    normalizedHint.includes(`://${row.slug.toLocaleLowerCase('en-US')}.`)
  )?.id ?? null
}

export async function loadSupportTicket(ticketId: string): Promise<SupportTicketRow | null> {
  const { data, error } = await getAdminClient()
    .from('support_tickets')
    .select('*')
    .eq('id', ticketId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? asTicket(data) : null
}

export async function loadSupportTicketByNumber(
  supportGuildId: string,
  ticketNumber: number,
): Promise<SupportTicketRow | null> {
  const { data, error } = await getAdminClient()
    .from('support_tickets')
    .select('*')
    .eq('support_guild_id', supportGuildId)
    .eq('ticket_number', ticketNumber)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? asTicket(data) : null
}

async function markProjectionSynced(ticketId: string): Promise<void> {
  const { error } = await getAdminClient().from('support_tickets').update({
    discord_sync_status: 'synced',
    discord_sync_error: null,
  }).eq('id', ticketId)
  if (error) throw new Error(error.message)
}

async function markProjectionFailed(ticketId: string, error: unknown): Promise<void> {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000)
  const db = getAdminClient()
  const ticket = await loadSupportTicket(ticketId)
  await db.from('support_tickets').update({
    discord_sync_status: 'failed',
    discord_sync_attempts: Math.min((ticket?.discord_sync_attempts ?? 0) + 1, 1000),
    discord_sync_error: message,
  }).eq('id', ticketId)
}

export async function syncSupportTicketProjection(ticket: SupportTicketRow): Promise<void> {
  if (!ticket.thread_id || !ticket.header_message_id) return
  const messages = await loadDiscordSupportMessages(ticket.opener_locale as Locale)
  try {
    if (ticket.status !== 'closed') {
      await setDiscordThreadClosed({
        threadId: ticket.thread_id,
        closed: false,
        auditReason: `${formatSupportTicketNumber(ticket.ticket_number)} sync`,
      })
    }
    await updateDiscordSupportMessage(
      ticket.thread_id,
      ticket.header_message_id,
      buildTicketHeaderPayload(ticket, messages),
    )
    if (ticket.status === 'closed') {
      await setDiscordThreadClosed({
        threadId: ticket.thread_id,
        closed: true,
        auditReason: `${formatSupportTicketNumber(ticket.ticket_number)} closed`,
      })
    }
    await markProjectionSynced(ticket.id)
  } catch (error) {
    await markProjectionFailed(ticket.id, error)
    throw error
  }
}

async function sendSupportLog(
  settings: SupportTicketSettingsRow,
  ticket: SupportTicketRow,
  event: string,
): Promise<void> {
  const targets = new Set<string>()
  if (settings.log_channel_id) targets.add(settings.log_channel_id)
  if (settings.queue_channel_id && ['created', 'assign', 'unassign', 'priority'].includes(event)) {
    targets.add(settings.queue_channel_id)
  }
  const threadUrl = ticket.thread_id
    ? `https://discord.com/channels/${ticket.support_guild_id}/${ticket.thread_id}`
    : null
  for (const channelId of targets) {
    try {
      await createDiscordSupportMessage(channelId, {
        content: [
          `**${formatSupportTicketNumber(ticket.ticket_number)}** · ${event} · <@${ticket.opener_discord_id}>`,
          threadUrl,
        ].filter(Boolean).join('\n'),
        allowed_mentions: { parse: [] },
      })
    } catch (error) {
      log.warn('[discord-support] log delivery failed', {
        ticket_id: ticket.id,
        channel_id: channelId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

export async function createSupportTicket(
  input: CreateSupportTicketInput,
  messages: DiscordSupportMessages,
): Promise<CreateSupportTicketResult> {
  const settings = await loadSupportTicketSettings(input.supportGuildId)
  if (!settings?.enabled) return { ok: false, reason: 'disabled' }
  const relatedTenantId = await resolveRelatedTenantId(input.openerDiscordId, input.guildHint)
  const { data, error } = await getAdminClient().rpc('reserve_support_ticket', {
    p_support_guild_id: input.supportGuildId,
    p_opener_discord_id: input.openerDiscordId,
    p_opener_name: input.openerName,
    p_opener_locale: input.openerLocale,
    p_related_tenant_id: relatedTenantId,
    p_related_guild_hint: input.guildHint,
    p_category: input.category,
    p_subject: input.subject,
    p_description: input.description,
    p_interaction_id: input.interactionId,
  }).single()
  if (error) {
    if (error.message.includes('support_ticket_rate_limited')) {
      return { ok: false, reason: 'rate_limited' }
    }
    throw new Error(error.message)
  }
  const ticket = asTicket(data)
  const existing = ticket.create_interaction_id !== input.interactionId || !!ticket.thread_id
  if (existing) return { ok: true, ticket, existing: true }

  let threadId: string | null = null
  try {
    threadId = await createDiscordPrivateThread({
      parentChannelId: settings.parent_channel_id,
      name: formatSupportTicketNumber(ticket.ticket_number).toLocaleLowerCase('en-US'),
      auditReason: `${formatSupportTicketNumber(ticket.ticket_number)} opened`,
    })
    await addDiscordThreadMember(threadId, input.openerDiscordId)
    const projectedTicket: SupportTicketRow = { ...ticket, thread_id: threadId, status: 'open' }
    const headerMessageId = await createDiscordSupportMessage(
      threadId,
      buildTicketHeaderPayload(projectedTicket, messages),
    )
    const finalized = await getAdminClient().rpc('finalize_support_ticket', {
      p_ticket_id: ticket.id,
      p_thread_id: threadId,
      p_header_message_id: headerMessageId,
    }).single()
    if (finalized.error) throw new Error(finalized.error.message)
    const finalTicket = asTicket(finalized.data)
    await sendSupportLog(settings, finalTicket, 'created')
    return { ok: true, ticket: finalTicket, existing: false }
  } catch (provisionError) {
    const message = provisionError instanceof Error ? provisionError.message : String(provisionError)
    if (threadId) {
      try {
        await deleteDiscordSupportThread(
          threadId,
          `${formatSupportTicketNumber(ticket.ticket_number)} provisioning rollback`,
        )
      } catch (rollbackError) {
        log.warn('[discord-support] provisioning rollback failed', {
          ticket_id: ticket.id,
          error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        })
      }
    }
    await getAdminClient().rpc('mark_support_ticket_provision_failed', {
      p_ticket_id: ticket.id,
      p_error: message,
    })
    log.error('[discord-support] ticket provisioning failed', provisionError, {
      ticket_id: ticket.id,
      support_guild_id: input.supportGuildId,
    })
    return { ok: false, reason: 'provision_failed' }
  }
}

export async function isSupportStaff(
  supportGuildId: string,
  discordId: string,
): Promise<boolean> {
  if (isSuperAdmin(discordId)) return true
  const settings = await loadSupportTicketSettings(supportGuildId)
  if (!settings?.enabled) return false
  const member = await getGuildMemberByBot(supportGuildId, discordId)
  if (!member) return false
  return settings.staff_role_ids.some((roleId) => member.roles.includes(roleId))
}

export async function transitionSupportTicket(input: {
  ticketId: string
  action: SupportTicketAction | 'close_system'
  actorDiscordId: string
  actorKind: 'requester' | 'staff' | 'system'
  interactionId: string
}): Promise<SupportTicketRow> {
  const { data, error } = await getAdminClient().rpc('transition_support_ticket', {
    p_ticket_id: input.ticketId,
    p_action: input.action,
    p_actor_discord_id: input.actorDiscordId,
    p_actor_kind: input.actorKind,
    p_interaction_id: input.interactionId,
  }).single()
  if (error) throw new Error(error.message)
  const ticket = asTicket(data)
  await syncSupportTicketProjection(ticket)
  const settings = await loadSupportTicketSettings(ticket.support_guild_id)
  if (settings) await sendSupportLog(settings, ticket, input.action)
  return ticket
}

export async function setSupportTicketPriority(input: {
  ticketId: string
  priority: SupportTicketPriority
  actorDiscordId: string
  interactionId: string
}): Promise<SupportTicketRow> {
  const { data, error } = await getAdminClient().rpc('set_support_ticket_priority', {
    p_ticket_id: input.ticketId,
    p_priority: input.priority,
    p_actor_discord_id: input.actorDiscordId,
    p_interaction_id: input.interactionId,
  }).single()
  if (error) throw new Error(error.message)
  const ticket = asTicket(data)
  await syncSupportTicketProjection(ticket)
  const settings = await loadSupportTicketSettings(ticket.support_guild_id)
  if (settings) await sendSupportLog(settings, ticket, 'priority')
  return ticket
}

export async function linkSupportTicketKnownIssue(input: {
  ticket: SupportTicketRow
  slug: string
  actorDiscordId: string
  interactionId: string
}): Promise<{ title: string; forumPostId: string | null } | null> {
  const slug = input.slug.trim().toLocaleLowerCase('en-US')
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null
  const db = getAdminClient()
  const issueQuery = await db.from('support_known_issues')
    .select('id, title, forum_post_id')
    .eq('support_guild_id', input.ticket.support_guild_id)
    .eq('slug', slug)
    .maybeSingle()
  if (issueQuery.error) throw new Error(issueQuery.error.message)
  if (!issueQuery.data) return null
  const linked = await db.rpc('link_support_ticket_known_issue', {
    p_ticket_id: input.ticket.id,
    p_known_issue_id: issueQuery.data.id,
    p_actor_discord_id: input.actorDiscordId,
    p_interaction_id: input.interactionId,
  })
  if (linked.error) throw new Error(linked.error.message)

  if (input.ticket.thread_id) {
    const url = issueQuery.data.forum_post_id
      ? `https://discord.com/channels/${input.ticket.support_guild_id}/${issueQuery.data.forum_post_id}`
      : null
    await createDiscordSupportMessage(input.ticket.thread_id, {
      content: [
        `A support team member linked this ticket to the known issue **${issueQuery.data.title}**.`,
        url,
        'Updates will be posted in the known-issues channel. This is a staff-confirmed link, not an automated support response.',
      ].filter(Boolean).join('\n'),
      allowed_mentions: { parse: [] },
    })
  }
  const settings = await loadSupportTicketSettings(input.ticket.support_guild_id)
  if (settings) await sendSupportLog(settings, input.ticket, 'known_issue_linked')
  return { title: issueQuery.data.title, forumPostId: issueQuery.data.forum_post_id }
}

export async function processSupportTicketMaintenance(): Promise<{
  reminded: number
  closed: number
  deleted: number
  synced: number
  failed: number
}> {
  const result = { reminded: 0, closed: 0, deleted: 0, synced: 0, failed: 0 }
  const db = getAdminClient()
  const { data: settingsRows, error: settingsError } = await db
    .from('support_ticket_settings')
    .select(SUPPORT_TICKET_SETTINGS_COLUMNS)
    .eq('enabled', true)
  if (settingsError) throw new Error(settingsError.message)

  for (const settings of (settingsRows ?? []) as unknown as SupportTicketSettingsRow[]) {
    const now = Date.now()
    const reminderBefore = new Date(now - settings.waiting_reminder_hours * 3600_000).toISOString()
    const closeBefore = new Date(now - settings.auto_close_hours * 3600_000).toISOString()
    const retentionBefore = new Date(now - settings.retention_days * 86_400_000).toISOString()

    const [waiting, dueClose, dueDelete, pending] = await Promise.all([
      db.from('support_tickets').select('*')
        .eq('support_guild_id', settings.support_guild_id)
        .eq('status', 'waiting_requester')
        .is('last_reminded_at', null)
        .lt('updated_at', reminderBefore)
        .gt('updated_at', closeBefore)
        .limit(25),
      db.from('support_tickets').select('*')
        .eq('support_guild_id', settings.support_guild_id)
        .in('status', ['waiting_requester', 'resolved'])
        .lt('updated_at', closeBefore)
        .limit(25),
      db.from('support_tickets').select('*')
        .eq('support_guild_id', settings.support_guild_id)
        .eq('status', 'closed')
        .is('thread_deleted_at', null)
        .lt('closed_at', retentionBefore)
        .limit(25),
      db.from('support_tickets').select('*')
        .eq('support_guild_id', settings.support_guild_id)
        .in('discord_sync_status', ['pending', 'failed'])
        .not('thread_id', 'is', null)
        .lt('discord_sync_attempts', 10)
        .limit(25),
    ])
    for (const query of [waiting, dueClose, dueDelete, pending]) {
      if (query.error) throw new Error(query.error.message)
    }

    for (const raw of waiting.data ?? []) {
      const ticket = asTicket(raw)
      if (!ticket.thread_id) continue
      try {
        const messages = await loadDiscordSupportMessages(ticket.opener_locale as Locale)
        await createDiscordSupportMessage(ticket.thread_id, {
          content: `<@${ticket.opener_discord_id}> ${messages.reminder}`,
          allowed_mentions: { parse: [], users: [ticket.opener_discord_id] },
        })
        await db.from('support_tickets').update({ last_reminded_at: new Date().toISOString() }).eq('id', ticket.id)
        result.reminded += 1
      } catch (error) {
        result.failed += 1
        log.warn('[discord-support] reminder failed', { ticket_id: ticket.id, error: String(error) })
      }
    }

    for (const raw of dueClose.data ?? []) {
      const ticket = asTicket(raw)
      try {
        await transitionSupportTicket({
          ticketId: ticket.id,
          action: 'close_system',
          actorDiscordId: 'system:support-ticket',
          actorKind: 'system',
          interactionId: `cron:auto-close:${ticket.id}`,
        })
        result.closed += 1
      } catch (error) {
        result.failed += 1
        log.warn('[discord-support] auto close failed', { ticket_id: ticket.id, error: String(error) })
      }
    }

    for (const raw of dueDelete.data ?? []) {
      const ticket = asTicket(raw)
      if (!ticket.thread_id) continue
      try {
        const analyses = await db.from('support_ticket_ai_analyses')
          .select('review_channel_id, review_message_id, security_channel_id, security_message_id')
          .eq('ticket_id', ticket.id)
        if (analyses.error) throw new Error(analyses.error.message)
        for (const analysis of analyses.data ?? []) {
          for (const [channelId, messageId] of [
            [analysis.review_channel_id, analysis.review_message_id],
            [analysis.security_channel_id, analysis.security_message_id],
          ] as const) {
            if (!channelId || !messageId) continue
            try {
              await deleteDiscordSupportMessage(channelId, messageId)
            } catch (error) {
              if (!(error instanceof DiscordSupportRestError && error.status === 404)) throw error
            }
          }
        }
        try {
          await deleteDiscordSupportThread(ticket.thread_id, `${formatSupportTicketNumber(ticket.ticket_number)} retention`)
        } catch (error) {
          if (!(error instanceof DiscordSupportRestError && error.status === 404)) throw error
        }
        const jobsDelete = await db.from('support_ticket_jobs').delete().eq('ticket_id', ticket.id)
        if (jobsDelete.error) throw new Error(jobsDelete.error.message)
        const redaction = await db.from('support_tickets').update({
          subject: '[redacted]',
          description: '[redacted]',
          related_guild_hint: null,
          thread_deleted_at: new Date().toISOString(),
          discord_sync_status: 'synced',
          ai_status: 'skipped',
        }).eq('id', ticket.id)
        if (redaction.error) throw new Error(redaction.error.message)
        result.deleted += 1
      } catch (error) {
        result.failed += 1
        log.warn('[discord-support] retention delete failed', { ticket_id: ticket.id, error: String(error) })
      }
    }

    for (const raw of pending.data ?? []) {
      const staleTicket = asTicket(raw)
      try {
        const ticket = await loadSupportTicket(staleTicket.id)
        if (!ticket || ticket.thread_deleted_at) continue
        await syncSupportTicketProjection(ticket)
        result.synced += 1
      } catch {
        result.failed += 1
      }
    }
  }
  return result
}
