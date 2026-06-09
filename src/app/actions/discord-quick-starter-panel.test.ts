import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CAP } from '@/lib/permissions'

const mocks = vi.hoisted(() => ({
  requireAnyCapability: vi.fn(),
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  getTenantDiscordConfig: vi.fn(),
  sendDiscordChannelMessage: vi.fn(),
  updateDiscordChannelMessage: vi.fn(),
  logAdminAction: vi.fn(),
  revalidatePath: vi.fn(),
  selectRows: [] as Array<{ key: string; value: string }>,
}))

vi.mock('@/lib/auth', () => ({
  requireAnyCapability: mocks.requireAnyCapability,
}))

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: mocks.getSessionGuildId,
  getTenantDiscordConfig: mocks.getTenantDiscordConfig,
}))

vi.mock('@/lib/discord', () => ({
  sendDiscordChannelMessage: mocks.sendDiscordChannelMessage,
  updateDiscordChannelMessage: mocks.updateDiscordChannelMessage,
}))

vi.mock('@/lib/admin-audit', () => ({
  logAdminAction: mocks.logAdminAction,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
  ),
}))

import {
  publishQuickStarterPanel,
  saveQuickStarterPanelDraft,
} from './discord-quick-starter-panel'

interface UpsertCall {
  rows: unknown
  options: unknown
}

function createDb() {
  const upsertCalls: UpsertCall[] = []
  const inFilter = vi.fn(async () => ({ data: mocks.selectRows, error: null }))
  const eq = vi.fn(() => ({ in: inFilter }))
  const select = vi.fn(() => ({ eq }))
  const upsert = vi.fn(async (rows: unknown, options: unknown) => {
    upsertCalls.push({ rows, options })
    return { error: null }
  })
  const from = vi.fn((table: string) => {
    expect(table).toBe('app_settings')
    return { select, upsert }
  })
  return { db: { from }, upsertCalls, select, eq, inFilter }
}

describe('discord quick starter dashboard actions', () => {
  beforeEach(() => {
    mocks.requireAnyCapability.mockReset()
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.getTenantDiscordConfig.mockReset()
    mocks.sendDiscordChannelMessage.mockReset()
    mocks.updateDiscordChannelMessage.mockReset()
    mocks.logAdminAction.mockReset()
    mocks.revalidatePath.mockReset()
    mocks.selectRows = []
    mocks.getSession.mockResolvedValue({ discordId: 'admin-1' })
    mocks.getSessionGuildId.mockResolvedValue('tenant-1')
    mocks.getTenantDiscordConfig.mockResolvedValue({
      id: 'tenant-1',
      slug: 'menhera',
      name: 'Menhera',
      discordGuildId: '123456789012345678',
      eventChannelId: null,
    })
    mocks.sendDiscordChannelMessage.mockResolvedValue('message-1')
  })

  it('saves the quick starter draft with tenant scoped app settings', async () => {
    const { db, upsertCalls } = createDb()
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(
      saveQuickStarterPanelDraft({
        channelId: '234567890123456789',
        message: 'Welcome to {name}.',
      }),
    ).resolves.toEqual({})

    expect(mocks.requireAnyCapability).toHaveBeenCalledWith([CAP.SETTINGS_GENERAL])
    expect(upsertCalls).toHaveLength(1)
    expect(upsertCalls[0].options).toEqual({ onConflict: 'guild_id,key' })
    expect(upsertCalls[0].rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          guild_id: 'tenant-1',
          key: 'quick_starter_panel_channel_id',
          value: '234567890123456789',
        }),
        expect.objectContaining({
          guild_id: 'tenant-1',
          key: 'quick_starter_panel_message',
          value: 'Welcome to {name}.',
        }),
      ]),
    )
    expect(mocks.sendDiscordChannelMessage).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/dashboard/settings')
  })

  it('posts a new panel when no saved Discord message exists', async () => {
    const { db, upsertCalls } = createDb()
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(
      publishQuickStarterPanel({
        channelId: '234567890123456789',
        message: 'Welcome to {name}.\nPick a button below.',
      }),
    ).resolves.toEqual({
      messageId: 'message-1',
      channelId: '234567890123456789',
      messageUrl: 'https://discord.com/channels/123456789012345678/234567890123456789/message-1',
    })

    expect(mocks.sendDiscordChannelMessage).toHaveBeenCalledWith(
      '234567890123456789',
      expect.objectContaining({
        content: 'Welcome to Menhera.\nPick a button below.',
        allowed_mentions: { parse: [] },
        components: expect.any(Array),
      }),
    )
    expect(mocks.updateDiscordChannelMessage).not.toHaveBeenCalled()
    expect(upsertCalls[0].rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'quick_starter_panel_message_id', value: 'message-1' }),
        expect.objectContaining({
          key: 'quick_starter_panel_message_channel_id',
          value: '234567890123456789',
        }),
      ]),
    )
  })

  it('updates the existing panel when message id and channel still match', async () => {
    mocks.selectRows = [
      { key: 'quick_starter_panel_message_id', value: 'message-9' },
      { key: 'quick_starter_panel_message_channel_id', value: '234567890123456789' },
    ]
    const { db } = createDb()
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(
      publishQuickStarterPanel({
        channelId: '234567890123456789',
        message: 'Updated {name}.',
      }),
    ).resolves.toMatchObject({
      messageId: 'message-9',
      channelId: '234567890123456789',
    })

    expect(mocks.updateDiscordChannelMessage).toHaveBeenCalledWith(
      '234567890123456789',
      'message-9',
      expect.objectContaining({
        content: 'Updated Menhera.',
        allowed_mentions: { parse: [] },
      }),
    )
    expect(mocks.sendDiscordChannelMessage).not.toHaveBeenCalled()
  })

  it('rejects invalid Discord channel ids before touching Discord', async () => {
    const { db } = createDb()
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(
      publishQuickStarterPanel({
        channelId: 'not-a-channel',
        message: 'Hello',
      }),
    ).resolves.toEqual({ error: 'invalidInput' })

    expect(mocks.sendDiscordChannelMessage).not.toHaveBeenCalled()
    expect(mocks.updateDiscordChannelMessage).not.toHaveBeenCalled()
  })
})
