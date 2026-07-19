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
  DEFAULT_DISCORD_QUICK_STARTER_PANEL_COLOR,
  DEFAULT_DISCORD_QUICK_STARTER_PANEL_DESCRIPTION,
  DEFAULT_DISCORD_QUICK_STARTER_PANEL_FOOTER,
  DEFAULT_DISCORD_QUICK_STARTER_PANEL_TITLE,
  QUICK_STARTER_PANEL_DESCRIPTION_MAX_LENGTH,
  QUICK_STARTER_PANEL_FOOTER_MAX_LENGTH,
  QUICK_STARTER_PANEL_TITLE_MAX_LENGTH,
  buildDiscordQuickStarterMessagePayload,
} from '@/lib/discord-quick-starter'
import { log } from '@/lib/log'
import { invalidateAppSettingsCache } from '@/lib/app-settings-invalidation'

const QUICK_STARTER_PANEL_KEYS = {
  legacyMessage: 'quick_starter_panel_message',
  title: 'quick_starter_panel_title',
  description: 'quick_starter_panel_description',
  color: 'quick_starter_panel_color',
  footer: 'quick_starter_panel_footer',
  channelId: 'quick_starter_panel_channel_id',
  messageId: 'quick_starter_panel_message_id',
  messageChannelId: 'quick_starter_panel_message_channel_id',
  publishedAt: 'quick_starter_panel_published_at',
} as const satisfies Record<string, AppSettingKey>

type QuickStarterPanelSettingKey =
  (typeof QUICK_STARTER_PANEL_KEYS)[keyof typeof QUICK_STARTER_PANEL_KEYS]

interface QuickStarterPanelState {
  title: string
  description: string
  color: string
  footer: string
  channelId: string
  messageId: string
  messageChannelId: string
  publishedAt: string
}

export interface QuickStarterPanelInput {
  channelId: string
  title: string
  description: string
  color: string
  footer: string
}

export interface QuickStarterPanelPublishResult {
  error?: string
  messageId?: string
  channelId?: string
  messageUrl?: string
}

const QUICK_STARTER_PANEL_KEY_LIST = Object.values(QUICK_STARTER_PANEL_KEYS)

function normalizeRequiredPanelText(value: string | undefined, fallback: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed.length > 0 ? trimmed : fallback
}

function normalizePanelFooter(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizePanelColor(value: string | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  const fallback = trimmed.length > 0 ? trimmed : DEFAULT_DISCORD_QUICK_STARTER_PANEL_COLOR
  const normalized = fallback.startsWith('#') ? fallback : `#${fallback}`
  if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) return null
  return normalized.toLowerCase()
}

function validatePanelInput(
  input: QuickStarterPanelInput,
  tErr: Awaited<ReturnType<typeof getTranslations>>,
): (
  | {
      ok: true
      channelId: string
      title: string
      description: string
      color: string
      footer: string
    }
  | { ok: false; error: string }
) {
  const channelId = typeof input.channelId === 'string' ? input.channelId.trim() : ''
  if (!channelId || !isDiscordId(channelId)) {
    return { ok: false, error: tErr('invalidInput') }
  }
  const title = normalizeRequiredPanelText(input.title, DEFAULT_DISCORD_QUICK_STARTER_PANEL_TITLE)
  const description = normalizeRequiredPanelText(
    input.description,
    DEFAULT_DISCORD_QUICK_STARTER_PANEL_DESCRIPTION,
  )
  const footer = normalizePanelFooter(input.footer)
  const color = normalizePanelColor(input.color)
  if (!color) {
    return { ok: false, error: tErr('invalidInput') }
  }
  if (title.length > QUICK_STARTER_PANEL_TITLE_MAX_LENGTH) {
    return {
      ok: false,
      error: tErr('valueTooLong', { max: QUICK_STARTER_PANEL_TITLE_MAX_LENGTH }),
    }
  }
  if (description.length > QUICK_STARTER_PANEL_DESCRIPTION_MAX_LENGTH) {
    return {
      ok: false,
      error: tErr('valueTooLong', { max: QUICK_STARTER_PANEL_DESCRIPTION_MAX_LENGTH }),
    }
  }
  if (footer.length > QUICK_STARTER_PANEL_FOOTER_MAX_LENGTH) {
    return {
      ok: false,
      error: tErr('valueTooLong', { max: QUICK_STARTER_PANEL_FOOTER_MAX_LENGTH }),
    }
  }
  return { ok: true, channelId, title, description, color, footer }
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

  const legacyMessage = map.get(QUICK_STARTER_PANEL_KEYS.legacyMessage) ?? ''
  return {
    title: map.get(QUICK_STARTER_PANEL_KEYS.title) ?? DEFAULT_DISCORD_QUICK_STARTER_PANEL_TITLE,
    description:
      map.get(QUICK_STARTER_PANEL_KEYS.description) ??
      (legacyMessage || DEFAULT_DISCORD_QUICK_STARTER_PANEL_DESCRIPTION),
    color: map.get(QUICK_STARTER_PANEL_KEYS.color) ?? DEFAULT_DISCORD_QUICK_STARTER_PANEL_COLOR,
    footer: map.get(QUICK_STARTER_PANEL_KEYS.footer) ?? DEFAULT_DISCORD_QUICK_STARTER_PANEL_FOOTER,
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
  invalidateAppSettingsCache(guildId)
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
      [QUICK_STARTER_PANEL_KEYS.title]: validated.title,
      [QUICK_STARTER_PANEL_KEYS.description]: validated.description,
      [QUICK_STARTER_PANEL_KEYS.color]: validated.color,
      [QUICK_STARTER_PANEL_KEYS.footer]: validated.footer,
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
        titleLength: validated.title.length,
        descriptionLength: validated.description.length,
        footerLength: validated.footer.length,
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
      titleTemplate: validated.title,
      descriptionTemplate: validated.description,
      color: validated.color,
      footerTemplate: validated.footer,
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
      [QUICK_STARTER_PANEL_KEYS.title]: validated.title,
      [QUICK_STARTER_PANEL_KEYS.description]: validated.description,
      [QUICK_STARTER_PANEL_KEYS.color]: validated.color,
      [QUICK_STARTER_PANEL_KEYS.footer]: validated.footer,
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
        titleLength: validated.title.length,
        descriptionLength: validated.description.length,
        footerLength: validated.footer.length,
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
