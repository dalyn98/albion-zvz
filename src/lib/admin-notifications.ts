import 'server-only'

import { getTranslations } from 'next-intl/server'
import { getAdminBadgeCounts } from '@/lib/admin-badges'
import { getAppSetting } from '@/lib/app-settings'
import {
  type AdminNotificationTopic,
  DEFAULT_ADMIN_NOTIFICATION_TOPICS,
  isAdminNotificationTopic,
  parseAdminNotificationTopics,
} from '@/lib/admin-notification-topics'
import { log } from '@/lib/log'
import { getAdminClient } from '@/lib/supabase-admin'
import { getTenantDiscordConfig, type TenantDiscordConfig } from '@/lib/tenant'
import { tenantUrl } from '@/lib/tenant-resolver'
import {
  buildAdminApprovalMessageComponents,
  loadDiscordAdminApprovalMessages,
  resolveAdminApprovalKind,
} from '@/lib/discord-admin-approvals'

const DISCORD_API = 'https://discord.com/api/v10'
const DISCORD_ID_RE = /^\d{5,30}$/
const DEFAULT_DIGEST_MINUTES = 0

type DeliveryKind = 'channel' | 'digest'

interface AdminNotificationSettings {
  enabled: boolean
  channelId: string | null
  roleIds: string[]
  topics: AdminNotificationTopic[]
  digestMinutes: number
  tenantSlug: string | null
}

interface SendAdminNotificationInput {
  guildId: string
  topic: AdminNotificationTopic
  sourceTable: string
  sourceId: string
  title: string
  body: string
  url?: string
  fields?: Array<{ name: string; value: string; inline?: boolean }>
  deliveryKind?: DeliveryKind
}

interface SendResult {
  sent: boolean
  skipped?: string
}

function parseBoolean(raw: string | null | undefined): boolean {
  return raw === 'true'
}

function parseDiscordIds(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const clean: string[] = []
    for (const value of parsed) {
      if (typeof value !== 'string') continue
      if (!DISCORD_ID_RE.test(value)) continue
      if (!clean.includes(value)) clean.push(value)
    }
    return clean
  } catch {
    return []
  }
}

function parseDigestMinutes(raw: string | null | undefined): number {
  const value = Number(raw)
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > 1440) {
    return DEFAULT_DIGEST_MINUTES
  }
  return value
}

export async function loadAdminNotificationSettings(
  guildId: string,
  tenantConfig?: TenantDiscordConfig | null,
): Promise<AdminNotificationSettings> {
  const [enabledRaw, channelRaw, roleIdsRaw, topicsRaw, digestRaw, config] = await Promise.all([
    getAppSetting('admin_notifications_enabled', 'false', guildId),
    getAppSetting('admin_notification_channel_id', '', guildId),
    getAppSetting('admin_notification_role_ids', '[]', guildId),
    getAppSetting('admin_notification_topics', JSON.stringify(DEFAULT_ADMIN_NOTIFICATION_TOPICS), guildId),
    getAppSetting('admin_notification_digest_minutes', String(DEFAULT_DIGEST_MINUTES), guildId),
    tenantConfig === undefined ? getTenantDiscordConfig(guildId) : Promise.resolve(tenantConfig),
  ])

  const channelId = channelRaw.trim()
  return {
    enabled: parseBoolean(enabledRaw),
    channelId: DISCORD_ID_RE.test(channelId) ? channelId : null,
    roleIds: parseDiscordIds(roleIdsRaw),
    topics: parseAdminNotificationTopics(topicsRaw),
    digestMinutes: parseDigestMinutes(digestRaw),
    tenantSlug: config?.slug ?? null,
  }
}

async function alreadyDelivered(input: SendAdminNotificationInput): Promise<boolean> {
  const { data } = await getAdminClient()
    .from('admin_notification_deliveries')
    .select('id')
    .eq('guild_id', input.guildId)
    .eq('topic', input.topic)
    .eq('source_table', input.sourceTable)
    .eq('source_id', input.sourceId)
    .eq('delivery_kind', input.deliveryKind ?? 'channel')
    .maybeSingle()
  return Boolean(data)
}

async function recordDelivery(
  input: SendAdminNotificationInput,
  channelId: string,
  discordMessageId: string,
): Promise<void> {
  const { error } = await getAdminClient().from('admin_notification_deliveries').upsert(
    {
      guild_id: input.guildId,
      topic: input.topic,
      source_table: input.sourceTable,
      source_id: input.sourceId,
      delivery_kind: input.deliveryKind ?? 'channel',
      discord_channel_id: channelId || null,
      discord_message_id: discordMessageId || null,
      delivered_at: new Date().toISOString(),
    },
    { onConflict: 'guild_id,topic,source_table,source_id,delivery_kind' },
  )
  if (error) {
    log.error('[admin-notifications] recordDelivery failed', error, {
      tenant_id: input.guildId,
      topic: input.topic,
      source_table: input.sourceTable,
      source_id: input.sourceId,
    })
  }
}

async function postChannelMessage(
  channelId: string,
  settings: AdminNotificationSettings,
  input: SendAdminNotificationInput,
): Promise<string> {
  const botToken = process.env.DISCORD_BOT_TOKEN
  if (!botToken) throw new Error('DISCORD_BOT_TOKEN is not configured')

  const absoluteUrl = input.url ? tenantUrl(settings.tenantSlug, input.url) : undefined
  const mentionLine =
    settings.roleIds.length > 0
      ? `${settings.roleIds.map((id) => `<@&${id}>`).join(' ')}\n`
      : ''
  const approvalKind =
    input.deliveryKind === 'digest'
      ? null
      : resolveAdminApprovalKind({
          topic: input.topic,
          sourceTable: input.sourceTable,
          sourceId: input.sourceId,
        })
  const approvalMessages = approvalKind ? await loadDiscordAdminApprovalMessages() : null
  const components =
    approvalKind && approvalMessages
      ? buildAdminApprovalMessageComponents({
          kind: approvalKind,
          sourceId: input.sourceId,
          url: input.url,
          tenantSlug: settings.tenantSlug,
          messages: approvalMessages,
        })
      : undefined

  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: mentionLine || undefined,
      allowed_mentions: settings.roleIds.length > 0
        ? { parse: [], roles: settings.roleIds }
        : { parse: [] },
      embeds: [
        {
          title: input.title,
          description: input.body,
          url: absoluteUrl,
          color: input.deliveryKind === 'digest' ? 0x3b82f6 : 0xf59e0b,
          fields: input.fields ?? [],
          timestamp: new Date().toISOString(),
        },
      ],
      ...(components ? { components } : {}),
    }),
  })

  const text = await res.text().catch(() => '')
  if (!res.ok) {
    throw new Error(`Discord admin notification failed (${res.status}): ${text.slice(0, 500)}`)
  }
  if (!text) return ''
  try {
    const json = JSON.parse(text) as { id?: string }
    return String(json.id ?? '')
  } catch {
    return ''
  }
}

export async function sendAdminNotification(
  input: SendAdminNotificationInput,
): Promise<SendResult> {
  if (!isAdminNotificationTopic(input.topic)) return { sent: false, skipped: 'unknown-topic' }
  const settings = await loadAdminNotificationSettings(input.guildId)
  if (!settings.enabled) return { sent: false, skipped: 'disabled' }
  if (!settings.channelId) return { sent: false, skipped: 'channel-not-configured' }
  if (!settings.topics.includes(input.topic)) return { sent: false, skipped: 'topic-disabled' }
  if (await alreadyDelivered(input)) return { sent: false, skipped: 'duplicate' }

  try {
    const messageId = await postChannelMessage(settings.channelId, settings, input)
    await recordDelivery(input, settings.channelId, messageId)
    return { sent: true }
  } catch (e) {
    log.error('[admin-notifications] send failed', e, {
      tenant_id: input.guildId,
      topic: input.topic,
      source_table: input.sourceTable,
      source_id: input.sourceId,
    })
    return { sent: false, skipped: 'send-failed' }
  }
}

function minutesSince(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  return Math.max(0, Math.floor((nowMs - ms) / 60_000))
}

function isFresh(iso: string | null | undefined, nowMs: number, maxAgeMinutes: number): boolean {
  const age = minutesSince(iso, nowMs)
  return age !== null && age <= maxAgeMinutes
}

function compactCount(value: number): string {
  return value.toLocaleString('en-US')
}

async function loadDigestSettingMap(guildId: string): Promise<Map<string, string>> {
  const { data } = await getAdminClient()
    .from('app_settings')
    .select('key, value')
    .eq('guild_id', guildId)
    .in('key', [
      'albion_home_guild_id',
      'auto_regear_enabled',
      'last_killboard_sync_at',
      'last_battle_tracker_sync_at',
      'last_member_sync_at',
      'last_auto_regear_at',
      'last_admin_notification_digest_at',
    ])
  return new Map((data ?? []).map((row) => [row.key as string, (row.value as string | null) ?? '']))
}

async function countUnverifiedMembers(guildId: string): Promise<number> {
  const { count } = await getAdminClient()
    .from('guild_avatars')
    .select('id', { count: 'exact', head: true })
    .eq('guild_id', guildId)
    .is('withdrawn_at', null)
    .is('albion_verified_at', null)
  return count ?? 0
}

async function updateLastDigestAt(guildId: string, iso: string): Promise<void> {
  const { error } = await getAdminClient().from('app_settings').upsert(
    {
      guild_id: guildId,
      key: 'last_admin_notification_digest_at',
      value: iso,
      updated_at: iso,
    },
    { onConflict: 'guild_id,key' },
  )
  if (error) {
    log.error('[admin-notifications] updateLastDigestAt failed', error, {
      tenant_id: guildId,
    })
  }
}

export async function sendAdminNotificationDigest(
  tenant: TenantDiscordConfig,
  now = new Date(),
): Promise<SendResult> {
  const settings = await loadAdminNotificationSettings(tenant.id, tenant)
  if (!settings.enabled) return { sent: false, skipped: 'disabled' }
  if (!settings.channelId) return { sent: false, skipped: 'channel-not-configured' }
  if (settings.digestMinutes <= 0) return { sent: false, skipped: 'digest-disabled' }

  const settingMap = await loadDigestSettingMap(tenant.id)
  const nowMs = now.getTime()
  const lastDigestAt = settingMap.get('last_admin_notification_digest_at')
  const lastAge = minutesSince(lastDigestAt, nowMs)
  if (lastAge !== null && lastAge < settings.digestMinutes) {
    return { sent: false, skipped: 'interval-not-due' }
  }

  const [badges, unverifiedMembers, t] = await Promise.all([
    getAdminBadgeCounts(tenant.id),
    settings.topics.includes('members') ? countUnverifiedMembers(tenant.id) : Promise.resolve(0),
    getTranslations({ locale: 'ko', namespace: 'adminNotificationMessages' }),
  ])

  const pendingByTopic: Record<
    Extract<AdminNotificationTopic, 'regear' | 'exchange' | 'donation' | 'shop' | 'event_payout' | 'craft'>,
    number
  > = {
    regear: settings.topics.includes('regear') ? badges.regear : 0,
    exchange: settings.topics.includes('exchange') ? badges.exchange : 0,
    donation: settings.topics.includes('donation') ? badges.donation : 0,
    shop: settings.topics.includes('shop') ? badges.shop : 0,
    event_payout: settings.topics.includes('event_payout') ? badges.eventPayout : 0,
    craft: settings.topics.includes('craft') ? badges.craft : 0,
  }
  const pendingTotal = Object.values(pendingByTopic).reduce((sum, count) => sum + count, 0)
  const homeGuildId = settingMap.get('albion_home_guild_id')?.trim() ?? ''
  const autoRegearEnabled = settingMap.get('auto_regear_enabled') === 'true'
  const syncIssues = [
    !homeGuildId || isFresh(settingMap.get('last_killboard_sync_at'), nowMs, 90),
    !homeGuildId || isFresh(settingMap.get('last_battle_tracker_sync_at'), nowMs, 30),
    isFresh(settingMap.get('last_member_sync_at'), nowMs, 30 * 60),
    !autoRegearEnabled || isFresh(settingMap.get('last_auto_regear_at'), nowMs, 90),
  ].filter((ok) => !ok).length
  const setupIssues = [!tenant.botInstalled, !tenant.eventChannelId, !homeGuildId].filter(Boolean).length
  const hasSyncTopic = settings.topics.includes('sync')
  const hasMemberTopic = settings.topics.includes('members')

  if (
    pendingTotal === 0 &&
    (!hasSyncTopic || (syncIssues === 0 && setupIssues === 0)) &&
    (!hasMemberTopic || unverifiedMembers === 0)
  ) {
    await updateLastDigestAt(tenant.id, now.toISOString())
    return { sent: false, skipped: 'empty' }
  }

  const fields: Array<{ name: string; value: string; inline?: boolean }> = []
  if (pendingTotal > 0) {
    fields.push({
      name: t('digestPendingField'),
      value: t('digestPendingValue', {
        total: compactCount(pendingTotal),
        regear: compactCount(pendingByTopic.regear),
        exchange: compactCount(pendingByTopic.exchange),
        donation: compactCount(pendingByTopic.donation),
        shop: compactCount(pendingByTopic.shop),
        eventPayout: compactCount(pendingByTopic.event_payout),
        craft: compactCount(pendingByTopic.craft),
      }),
      inline: false,
    })
  }
  if (hasSyncTopic && (syncIssues > 0 || setupIssues > 0)) {
    fields.push({
      name: t('digestOpsField'),
      value: t('digestOpsValue', {
        sync: compactCount(syncIssues),
        setup: compactCount(setupIssues),
      }),
      inline: false,
    })
  }
  if (hasMemberTopic && unverifiedMembers > 0) {
    fields.push({
      name: t('digestMembersField'),
      value: t('digestMembersValue', { count: compactCount(unverifiedMembers) }),
      inline: false,
    })
  }

  const digestTopic =
    (Object.entries(pendingByTopic).find(([, count]) => count > 0)?.[0] as AdminNotificationTopic | undefined) ??
    (hasSyncTopic && (syncIssues > 0 || setupIssues > 0) ? 'sync' : undefined) ??
    (hasMemberTopic && unverifiedMembers > 0 ? 'members' : undefined) ??
    'sync'

  const result = await sendAdminNotification({
    guildId: tenant.id,
    topic: digestTopic,
    sourceTable: 'admin_notification_digest',
    sourceId: now.toISOString().slice(0, 16),
    deliveryKind: 'digest',
    title: t('digestTitle', { guild: tenant.name }),
    body: t('digestBody'),
    url: '/admin/dashboard/approvals',
    fields,
  })
  if (result.sent || result.skipped === 'duplicate') {
    await updateLastDigestAt(tenant.id, now.toISOString())
  }
  return result
}
