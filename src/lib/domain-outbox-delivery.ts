import 'server-only'

import { getTranslations } from 'next-intl/server'
import { sendAdminNotification } from '@/lib/admin-notifications'
import { discordDeliveryNonce } from '@/lib/discord-delivery-id'
import { isDiscordDmConfigured, sendDiscordDmToUser } from '@/lib/discord-dm'
import {
  getDiscordDmTranslator,
  loadDiscordDmLocale,
} from '@/lib/discord-dm-localized'
import { isDiscordId } from '@/lib/discord-id'
import { buildDomainMemberDm } from '@/lib/domain-outbox-message'
import { log } from '@/lib/log'
import { getAdminClient } from '@/lib/supabase-admin'

interface ClaimedDomainOutboxRow {
  id: string
  guild_id: string
  topic: string
  aggregate_kind: string
  aggregate_id: string
  recipient_kind: 'member' | 'admin' | 'guild' | 'digest'
  recipient_member_id: string | null
  payload: Record<string, unknown> | null
  claim_token: string
  attempts: number
}

const DELIVERY_CONCURRENCY = 5

export interface ProcessDomainOutboxResult {
  claimed: number
  sent: number
  cancelled: number
  failed: number
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.trim().slice(0, 1000) || 'unknown'
}

async function complete(
  row: ClaimedDomainOutboxRow,
  status: 'sent' | 'failed' | 'cancelled',
  error?: string,
): Promise<void> {
  const { data, error: completionError } = await getAdminClient().rpc(
    'complete_domain_outbox',
    {
      p_id: row.id,
      p_claim_token: row.claim_token,
      p_status: status,
      p_error: error ?? null,
    },
  )
  if (completionError) throw new Error(completionError.message)
  if (data !== true) throw new Error('domain outbox claim was lost')
}

async function resolveMemberDiscordId(row: ClaimedDomainOutboxRow): Promise<string | null> {
  if (!row.recipient_member_id) return null
  const db = getAdminClient()
  const { data, error } = await db
    .from('guild_member_access_identities')
    .select('subject_id, last_seen_at')
    .eq('guild_id', row.guild_id)
    .eq('guild_member_id', row.recipient_member_id)
    .eq('identity_type', 'discord')
    .is('revoked_at', null)
    .order('last_seen_at', { ascending: false })
    .limit(10)
  if (error) throw new Error(error.message)
  const candidateIds = (data ?? [])
    .map((identity) => identity.subject_id)
    .filter(isDiscordId)
  if (candidateIds.length === 0) return null

  // A merged stable member can retain more than one historical Discord
  // identity. Only an identity whose current guild avatar is active may
  // receive operational DMs; withdrawn accounts remain history evidence.
  const active = await db
    .from('guild_avatars')
    .select('discord_id')
    .eq('guild_id', row.guild_id)
    .in('discord_id', candidateIds)
    .is('withdrawn_at', null)
  if (active.error) throw new Error(active.error.message)
  const activeIds = new Set((active.data ?? []).map((avatar) => avatar.discord_id))
  return candidateIds.find((candidate) => activeIds.has(candidate)) ?? null
}

async function deliverMember(row: ClaimedDomainOutboxRow): Promise<'sent' | 'failed' | 'cancelled'> {
  const discordId = await resolveMemberDiscordId(row)
  if (!discordId) return 'cancelled'
  if (!isDiscordDmConfigured()) throw new Error('discord_dm_not_configured')
  const deliveryNonce = discordDeliveryNonce({
    guildId: row.guild_id,
    topic: row.topic,
    sourceTable: row.aggregate_kind,
    sourceId: `${row.aggregate_id}:${row.recipient_member_id}`,
    deliveryKind: 'member_dm',
  })
  const locale = await loadDiscordDmLocale(row.guild_id, discordId)
  const t = await getDiscordDmTranslator(locale)
  const message = buildDomainMemberDm({
    topic: row.topic,
    payload: row.payload ?? {},
    deliveryNonce,
    t,
  })
  if (!message) return 'cancelled'
  const result = await sendDiscordDmToUser(discordId, row.guild_id, message)
  if (result.attempted === 0) return 'cancelled'
  return result.succeeded > 0 ? 'sent' : 'failed'
}

async function deliverAdmin(row: ClaimedDomainOutboxRow): Promise<'sent' | 'failed' | 'cancelled'> {
  if (row.topic !== 'craft.pickup_collected') return 'cancelled'
  const t = await getTranslations({ locale: 'ko', namespace: 'adminNotificationMessages' })
  const result = await sendAdminNotification({
    guildId: row.guild_id,
    topic: 'craft',
    sourceTable: row.aggregate_kind,
    sourceId: row.aggregate_id,
    title: t('craftPickupCollectedTitle'),
    body: t('craftPickupCollectedBody'),
    url: '/admin/dashboard/craft',
  })
  if (result.sent || result.skipped === 'duplicate') return 'sent'
  return result.skipped === 'send-failed' ? 'failed' : 'cancelled'
}

export async function processDomainOutbox(options?: {
  limit?: number
}): Promise<ProcessDomainOutboxResult> {
  const limit = Math.min(Math.max(1, options?.limit ?? 50), 100)
  const db = getAdminClient()
  const result: ProcessDomainOutboxResult = {
    claimed: 0,
    sent: 0,
    cancelled: 0,
    failed: 0,
  }

  async function deliver(row: ClaimedDomainOutboxRow): Promise<void> {
    try {
      const status = row.recipient_kind === 'member'
        ? await deliverMember(row)
        : row.recipient_kind === 'admin'
          ? await deliverAdmin(row)
          : 'cancelled'
      await complete(row, status, status === 'failed' ? 'discord_delivery_failed' : undefined)
      result[status] += 1
    } catch (error) {
      result.failed += 1
      const message = safeError(error)
      try {
        await complete(row, 'failed', message)
      } catch (completionError) {
        log.error('[domain-outbox] failed to release claim', completionError, {
          tenant_id: row.guild_id,
          outbox_id: row.id,
        })
      }
    }
  }

  // Claim only the rows that can be worked concurrently. This keeps the
  // oldest claim's five-minute lease from expiring while a large batch waits
  // behind Discord network calls.
  while (result.claimed < limit) {
    const batchLimit = Math.min(DELIVERY_CONCURRENCY, limit - result.claimed)
    const { data, error } = await db.rpc('claim_domain_outbox', {
      p_limit: batchLimit,
      p_lease_seconds: 300,
    })
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as ClaimedDomainOutboxRow[]
    if (rows.length === 0) break
    result.claimed += rows.length
    await Promise.all(rows.map(deliver))
  }

  return result
}
