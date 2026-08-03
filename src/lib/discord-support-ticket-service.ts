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
  type SupportTicketRow,
  type SupportTicketSettingsRow,
} from '@/lib/discord-support-ticket-core'
import { loadDiscordSupportMessages } from '@/lib/discord-support-ticket-messages'
import {
  addDiscordThreadMember,
  createDiscordPrivateThread,
  createDiscordSupportMessage,
  deleteDiscordSupportThread,
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
  | { ok: false; reason: 'disabled' | 'provision_failed' }

function asTicket(data: unknown): SupportTicketRow {
  return data as SupportTicketRow
}

export async function loadSupportTicketSettings(
  supportGuildId: string,
): Promise<SupportTicketSettingsRow | null> {
  const { data, error } = await getAdminClient()
    .from('support_ticket_settings')
    .select('support_guild_id, parent_channel_id, log_channel_id, panel_message_id, staff_role_ids, enabled, waiting_reminder_hours, auto_close_hours, retention_days, updated_by_discord_id')
    .eq('support_guild_id', supportGuildId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? data as SupportTicketSettingsRow : null
}

export async function configureSupportTickets(input: {
  supportGuildId: string
  parentChannelId: string
  logChannelId: string
  staffRoleId: string
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
  if (!isSuperAdmin(input.actorDiscordId)) throw new Error('support_setup_admin_only')
  const settings = await loadSupportTicketSettings(input.supportGuildId)
  if (!settings?.enabled) throw new Error('support_setup_missing')
  const messageId = await createDiscordSupportMessage(
    settings.parent_channel_id,
    buildSupportPanelPayload(input.messages),
  )
  const { error } = await getAdminClient().from('support_ticket_settings').update({
    panel_message_id: messageId,
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
  if (!settings.log_channel_id) return
  try {
    await createDiscordSupportMessage(settings.log_channel_id, {
      content: `**${formatSupportTicketNumber(ticket.ticket_number)}** · ${event} · <@${ticket.opener_discord_id}>`,
      allowed_mentions: { parse: [] },
    })
  } catch (error) {
    log.warn('[discord-support] log delivery failed', {
      ticket_id: ticket.id,
      error: error instanceof Error ? error.message : String(error),
    })
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
  if (error) throw new Error(error.message)
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
    .select('support_guild_id, parent_channel_id, log_channel_id, panel_message_id, staff_role_ids, enabled, waiting_reminder_hours, auto_close_hours, retention_days, updated_by_discord_id')
    .eq('enabled', true)
  if (settingsError) throw new Error(settingsError.message)

  for (const settings of (settingsRows ?? []) as SupportTicketSettingsRow[]) {
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
        try {
          await deleteDiscordSupportThread(ticket.thread_id, `${formatSupportTicketNumber(ticket.ticket_number)} retention`)
        } catch (error) {
          if (!(error instanceof DiscordSupportRestError && error.status === 404)) throw error
        }
        await db.from('support_tickets').update({
          subject: '[redacted]',
          description: '[redacted]',
          related_guild_hint: null,
          thread_deleted_at: new Date().toISOString(),
          discord_sync_status: 'synced',
        }).eq('id', ticket.id)
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
