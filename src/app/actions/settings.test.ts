import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CAP } from '@/lib/permissions'

const mocks = vi.hoisted(() => ({
  requireAnyCapability: vi.fn(),
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  getTenantTimezone: vi.fn(),
  logAdminAction: vi.fn(),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  requireAnyCapability: mocks.requireAnyCapability,
}))

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: mocks.getSessionGuildId,
}))

vi.mock('@/lib/timezone-server', () => ({
  getTenantTimezone: mocks.getTenantTimezone,
}))

vi.mock('@/lib/admin-audit', () => ({
  logAdminAction: mocks.logAdminAction,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
  updateTag: mocks.updateTag,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
  ),
}))

import {
  updateAppSetting,
  updateTenantAdminRoles,
} from './settings'

interface UpsertCall {
  row: unknown
  options: unknown
}

function createDb() {
  const calls: UpsertCall[] = []
  const db = {
    from: vi.fn((table: string) => {
      expect(table).toBe('app_settings')
      return {
        upsert: vi.fn((row: unknown, options: unknown) => {
          calls.push({ row, options })
          return Promise.resolve({ error: null })
        }),
      }
    }),
  }
  return { db, calls }
}

function createTenantUpdateDb() {
  const update = vi.fn(() => query)
  const eq = vi.fn(async () => ({ error: null }))
  const query = { update, eq }
  const db = {
    from: vi.fn((table: string) => {
      expect(table).toBe('tenants')
      return query
    }),
  }
  return { db, update, eq }
}

describe('updateAppSetting', () => {
  beforeEach(() => {
    mocks.requireAnyCapability.mockReset()
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.getTenantTimezone.mockReset()
    mocks.logAdminAction.mockReset()
    mocks.revalidatePath.mockReset()
    mocks.getSession.mockResolvedValue({ discordId: 'admin-1' })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.getTenantTimezone.mockResolvedValue('Asia/Seoul')
  })

  it('saves the event DM lead-time setting with general settings permission', async () => {
    const { db, calls } = createDb()
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(updateAppSetting('event_dm_lead_minutes', '60')).resolves.toEqual({})

    expect(mocks.requireAnyCapability).toHaveBeenCalledWith([CAP.SETTINGS_GENERAL])
    expect(calls).toHaveLength(1)
    expect(calls[0].row).toMatchObject({
      guild_id: 'guild-1',
      key: 'event_dm_lead_minutes',
      value: '60',
    })
    expect(calls[0].options).toEqual({ onConflict: 'guild_id,key' })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/dashboard/settings')
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: 'guild-1',
        adminDiscordId: 'admin-1',
        action: 'settings.update',
        details: expect.objectContaining({
          key: 'event_dm_lead_minutes',
          value: '60',
        }),
      }),
    )
  })

  it('rejects event DM lead-time values outside the supported range', async () => {
    await expect(updateAppSetting('event_dm_lead_minutes', '2')).resolves.toEqual({
      error: 'invalidIntegerRange:{"min":5,"max":1440}',
    })
    expect(mocks.requireAnyCapability).not.toHaveBeenCalled()
  })

  it('rejects non-Discord invite URLs before saving public profile settings', async () => {
    await expect(
      updateAppSetting('guild_profile_discord_invite_url', 'https://discord.gg.evil.test/demo'),
    ).resolves.toEqual({
      error: 'invalidDiscordInviteUrl',
    })

    expect(mocks.requireAnyCapability).not.toHaveBeenCalled()
  })

  it('normalizes Discord invite URLs before storing them on the public profile', async () => {
    const { db, calls } = createDb()
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(
      updateAppSetting(
        'guild_profile_discord_invite_url',
        'https://discord.com/invite/demo-guild?utm=copy',
      ),
    ).resolves.toEqual({})

    expect(mocks.requireAnyCapability).toHaveBeenCalledWith([CAP.SETTINGS_GUILD_PROFILE])
    expect(calls[0].row).toMatchObject({
      guild_id: 'guild-1',
      key: 'guild_profile_discord_invite_url',
      value: 'https://discord.gg/demo-guild',
    })
  })

  it('saves the craft regear toggle with settings toggle permission and refreshes craft surfaces', async () => {
    const { db, calls } = createDb()
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(updateAppSetting('craft_regear_enabled', 'true')).resolves.toEqual({})

    expect(mocks.requireAnyCapability).toHaveBeenCalledWith([CAP.SETTINGS_TOGGLES])
    expect(calls[0].row).toMatchObject({
      guild_id: 'guild-1',
      key: 'craft_regear_enabled',
      value: 'true',
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/dashboard/settings')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/dashboard/craft')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/craft/queue')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/craft/orders')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/craft/my-tasks')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('saves the video proof regear payout rate with general settings permission', async () => {
    const { db, calls } = createDb()
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(updateAppSetting('regear_video_payout_rate_percent', '100')).resolves.toEqual({})

    expect(mocks.requireAnyCapability).toHaveBeenCalledWith([CAP.SETTINGS_GENERAL])
    expect(calls[0].row).toMatchObject({
      guild_id: 'guild-1',
      key: 'regear_video_payout_rate_percent',
      value: '100',
    })
    expect(calls[0].options).toEqual({ onConflict: 'guild_id,key' })
  })

  it('rejects video proof regear payout rates outside the supported range', async () => {
    await expect(updateAppSetting('regear_video_payout_rate_percent', '0')).resolves.toEqual({
      error: 'invalidIntegerRange:{"min":1,"max":100}',
    })
    expect(mocks.requireAnyCapability).not.toHaveBeenCalled()
  })

  it('saves the shop discount rate with shop pricing permission', async () => {
    const { db, calls } = createDb()
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(updateAppSetting('shop_discount_rate', '0.5')).resolves.toEqual({})

    expect(mocks.requireAnyCapability).toHaveBeenCalledWith([CAP.SHOP_PRICING])
    expect(calls[0].row).toMatchObject({
      guild_id: 'guild-1',
      key: 'shop_discount_rate',
      value: '0.5',
    })
    expect(calls[0].options).toEqual({ onConflict: 'guild_id,key' })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/dashboard/shop')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/shop')
  })

  it('rejects shop discount rates outside the supported range', async () => {
    await expect(updateAppSetting('shop_discount_rate', '1.2')).resolves.toEqual({
      error: 'invalidIntegerRange:{"min":0.01,"max":1}',
    })
    expect(mocks.requireAnyCapability).not.toHaveBeenCalled()
  })

  it('saves the video proof regear claim ceiling bonus with general settings permission', async () => {
    const { db, calls } = createDb()
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(
      updateAppSetting('regear_video_claim_ceiling_bonus_silver', '500000'),
    ).resolves.toEqual({})

    expect(mocks.requireAnyCapability).toHaveBeenCalledWith([CAP.SETTINGS_GENERAL])
    expect(calls[0].row).toMatchObject({
      guild_id: 'guild-1',
      key: 'regear_video_claim_ceiling_bonus_silver',
      value: '500000',
    })
    expect(calls[0].options).toEqual({ onConflict: 'guild_id,key' })
  })

  it('rejects video proof regear claim ceiling bonuses outside the supported range', async () => {
    await expect(updateAppSetting('regear_video_claim_ceiling_bonus_silver', '-1')).resolves.toEqual({
      error: 'invalidIntegerRange:{"min":0,"max":2147483647}',
    })
    expect(mocks.requireAnyCapability).not.toHaveBeenCalled()
  })

  it('normalizes log operating start values from guild time to UTC before saving', async () => {
    const { db, calls } = createDb()
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(updateAppSetting('log_start_shop_chest_at', '2026-05-24T17:30')).resolves.toEqual({})

    expect(mocks.requireAnyCapability).toHaveBeenCalledWith([
      CAP.INVENTORY_MANAGE,
      CAP.CHEST_LOG_PASTE,
    ])
    expect(mocks.getTenantTimezone).toHaveBeenCalledWith('guild-1')
    expect(calls[0].row).toMatchObject({
      guild_id: 'guild-1',
      key: 'log_start_shop_chest_at',
      value: '2026-05-24T08:30:00.000Z',
    })
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          key: 'log_start_shop_chest_at',
          value: '2026-05-24T08:30:00.000Z',
        }),
      }),
    )
  })

  it('saves the shop notice image size with shop pricing permission and refreshes shop pages', async () => {
    const { db, calls } = createDb()
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(
      updateAppSetting('shop_delivery_notice_image_size', 'medium'),
    ).resolves.toEqual({})

    expect(mocks.requireAnyCapability).toHaveBeenCalledWith([CAP.SHOP_PRICING])
    expect(calls[0].row).toMatchObject({
      guild_id: 'guild-1',
      key: 'shop_delivery_notice_image_size',
      value: 'medium',
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/dashboard/shop')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/shop')
  })

  it('rejects unsupported shop notice image sizes before saving', async () => {
    await expect(
      updateAppSetting('shop_delivery_notice_image_size', 'giant'),
    ).resolves.toEqual({
      error: 'invalidEnumValue:{"values":"full, large, medium, small"}',
    })

    expect(mocks.requireAnyCapability).not.toHaveBeenCalled()
  })
})

describe('updateTenantAdminRoles', () => {
  beforeEach(() => {
    mocks.requireAnyCapability.mockReset()
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.logAdminAction.mockReset()
    mocks.revalidatePath.mockReset()
    mocks.getSession.mockResolvedValue({ discordId: 'admin-1' })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
  })

  it('rejects malformed role IDs before updating tenant admin roles', async () => {
    await expect(
      updateTenantAdminRoles(['123456789012345678', 'not-a-role-id']),
    ).resolves.toEqual({ error: 'invalidInput' })

    expect(mocks.requireAnyCapability).not.toHaveBeenCalled()
  })

  it('deduplicates role IDs and scopes tenant admin role updates to the current guild', async () => {
    const { db, update, eq } = createTenantUpdateDb()
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(
      updateTenantAdminRoles([
        '123456789012345678',
        '123456789012345678',
        '987654321098765432',
      ]),
    ).resolves.toEqual({})

    expect(mocks.requireAnyCapability).toHaveBeenCalledWith([CAP.SETTINGS_PERMISSIONS])
    expect(update).toHaveBeenCalledWith({
      admin_role_ids: ['123456789012345678', '987654321098765432'],
    })
    expect(eq).toHaveBeenCalledWith('id', 'guild-1')
  })
})
