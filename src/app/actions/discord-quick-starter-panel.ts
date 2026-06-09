'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAnyCapability } from '@/lib/auth'
import { logAdminAction } from '@/lib/admin-audit'
import type { AppSettingKey } from '@/lib/app-settings'
import { CAP } from '@/lib/permissions'
import { getSession } from '@/lib/session'
import { getSessionGuildId, getTenantDiscordConfig } from '@/lib/tenant'
import { isDiscordId } from '@/lib/discord-id'
import {
  DiscordChannelMessageError,
  sendDiscordChannelMessage,
  updateDiscordChannelMessage,
} from '@/lib/discord'
import {
  DEFAULT_DISCORD_QUICK_STARTER_PANEL_MESSAGE,
  QUICK_STARTER_PANEL_MESSAGE_MAX_LENGTH,
  buildDiscordQuickStarterMessagePayload,
} from '@/lib/discord-quick-starter'
import { log } from '@/lib/log'

const QUICK_STARTER_PANEL_KEYS = {
  message: 'quick_starter_panel_message',
  channelId: 'quick_starter_panel_channel_id',
  messageId: 'quick_starter_panel_message_id',
  messageChannelId: 'quick_starter_panel_message_channel_id',
  publishedAt: 'quick_starter_panel_published_at',
} as const satisfies Record<string, AppSettingKey>

type QuickStarterPanelSettingKey =
  (typeof QUICK_STARTER_PANEL_KEYS)[keyof typeof QUICK_STARTER_PANEL_KEYS]

interface QuickStarterPanelState {
  message: string
  channelId: string
  messageId: string
  messageChannelId: string
  publishedAt: string
}

export interface QuickStarterPanelInput {
  channelId: string
  message: string
}

export interface QuickStarterPanelPublishResult {
  error?: string
  messageId?: string
  channelId?: string
  messageUrl?: string
}

const QUICK_STARTER_PANEL_KEY_LIST = Object.values(QUICK_STARTER_PANEL_KEYS)

function normalizePanelMessage(value: string): string {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : DEFAULT_DISCORD_QUICK_STARTER_PANEL_MESSAGE
}

function validatePanelInput(
  input: QuickStarterPanelInput,
  tErr: Awaited<ReturnType<typeof getTranslations>>,
): { ok: true; channelId: string; message: string } | { ok: false; error: string } {
  const channelId = input.channelId.trim()
  if (!channelId || !isDiscordId(channelId)) {
    return { ok: false, error: tErr('invalidInput') }
  }
  const message = normalizePanelMessage(input.message)
  if (message.length > QUICK_STARTER_PANEL_MESSAGE_MAX_LENGTH) {
    return {
      ok: false,
      error: tErr('valueTooLong', { max: QUICK_STARTER_PANEL_MESSAGE_MAX_LENGTH }),
    }
  }
  return { ok: true, channelId, message }
}

async function loadQuickStarterPanelState(
  db: Awaited<ReturnType<typeof requireAnyCapability>>,
  guildId: string,
): Promise<QuickStarterPanelState> {
  const { data, error } = await db
    .from('app_settings')
    .select('key, value')
    .eq('guild_id', guildId)
    .in('key', QUICK_STARTER_PANEL_KEY_LIST)
  if (error) throw new Error(error.message)

  const map = new Map<string, string>()
  for (const row of data ?? []) {
    if (typeof row.key === 'string' && typeof row.value === 'string') {
      map.set(row.key, row.value)
    }
  }

  return {
    message: map.get(QUICK_STARTER_PANEL_KEYS.message) ?? DEFAULT_DISCORD_QUICK_STARTER_PANEL_MESSAGE,
    channelId: map.get(QUICK_STARTER_PANEL_KEYS.channelId) ?? '',
    messageId: map.get(QUICK_STARTER_PANEL_KEYS.messageId) ?? '',
    messageChannelId: map.get(QUICK_STARTER_PANEL_KEYS.messageChannelId) ?? '',
    publishedAt: map.get(QUICK_STARTER_PANEL_KEYS.publishedAt) ?? '',
  }
}

async function upsertQuickStarterPanelSettings(
  db: Awaited<ReturnType<typeof requireAnyCapability>>,
  guildId: string,
  entries: Partial<Record<QuickStarterPanelSettingKey, string>>,
): Promise<void> {
  const now = new Date().toISOString()
  const rows = Object.entries(entries).map(([key, value]) => ({
    guild_id: guildId,
    key,
    value: value ?? '',
    updated_at: now,
  }))
  if (rows.length === 0) return

  const { error } = await db
    .from('app_settings')
    .upsert(rows, { onConflict: 'guild_id,key' })
  if (error) throw new Error(error.message)
}

function discordMessageUrl(input: {
  discordGuildId: string
  channelId: string
  messageId: string
}): string {
  return `https://discord.com/channels/${input.discordGuildId}/${input.channelId}/${input.messageId}`
}

export async function saveQuickStarterPanelDraft(
  input: QuickStarterPanelInput,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  const validated = validatePanelInput(input, tErr)
  if (!validated.ok) return { error: validated.error }

  try {
    const db = await requireAnyCapability([CAP.SETTINGS_GENERAL])
    const session = await getSession()
    if (!session) return { error: tErr('serverError') }
    const guildId = await getSessionGuildId(session)

    await upsertQuickStarterPanelSettings(db, guildId, {
      [QUICK_STARTER_PANEL_KEYS.channelId]: validated.channelId,
      [QUICK_STARTER_PANEL_KEYS.message]: validated.message,
    })

    revalidatePath('/admin/dashboard/settings')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'settings.update',
      targetKind: 'setting',
      details: {
        kind: 'quick_starter_panel',
        channelId: validated.channelId,
        messageLength: validated.message.length,
      },
    })
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : tErr('serverError') }
  }
}

export async function publishQuickStarterPanel(
  input: QuickStarterPanelInput,
): Promise<QuickStarterPanelPublishResult> {
  const tErr = await getTranslations('adminActionError')
  const validated = validatePanelInput(input, tErr)
  if (!validated.ok) return { error: validated.error }

  let guildId: string | null = null
  const targetChannelId = validated.channelId

  try {
    const db = await requireAnyCapability([CAP.SETTINGS_GENERAL])
    const session = await getSession()
    if (!session) return { error: tErr('serverError') }
    guildId = await getSessionGuildId(session)
    const tenant = await getTenantDiscordConfig(guildId)
    if (!tenant) return { error: tErr('serverError') }

    const state = await loadQuickStarterPanelState(db, guildId)
    const payload = buildDiscordQuickStarterMessagePayload({
      discordGuildId: tenant.discordGuildId,
      tenantName: tenant.name,
      messageTemplate: validated.message,
    })

    let messageId = state.messageId
    const canUpdate = !!messageId && state.messageChannelId === targetChannelId
    if (canUpdate) {
      try {
        await updateDiscordChannelMessage(targetChannelId, messageId, payload)
      } catch (error) {
        if (!(error instanceof DiscordChannelMessageError) || error.status !== 404) {
          throw error
        }
        messageId = await sendDiscordChannelMessage(targetChannelId, payload)
      }
    } else {
      messageId = await sendDiscordChannelMessage(targetChannelId, payload)
    }

    const publishedAt = new Date().toISOString()
    await upsertQuickStarterPanelSettings(db, guildId, {
      [QUICK_STARTER_PANEL_KEYS.channelId]: targetChannelId,
      [QUICK_STARTER_PANEL_KEYS.message]: validated.message,
      [QUICK_STARTER_PANEL_KEYS.messageId]: messageId,
      [QUICK_STARTER_PANEL_KEYS.messageChannelId]: targetChannelId,
      [QUICK_STARTER_PANEL_KEYS.publishedAt]: publishedAt,
    })

    revalidatePath('/admin/dashboard/settings')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'settings.update',
      targetKind: 'setting',
      details: {
        kind: 'quick_starter_panel_publish',
        channelId: targetChannelId,
        messageId,
        messageLength: validated.message.length,
      },
    })

    return {
      messageId,
      channelId: targetChannelId,
      messageUrl: discordMessageUrl({
        discordGuildId: tenant.discordGuildId,
        channelId: targetChannelId,
        messageId,
      }),
    }
  } catch (error) {
    log.error('[quick-starter-panel] publish failed', error, {
      tenant_id: guildId,
      channel_id: targetChannelId,
    })
    return { error: error instanceof Error ? error.message : tErr('serverError') }
  }
}
