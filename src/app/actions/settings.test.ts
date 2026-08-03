import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CAP } from '@/lib/permissions'

const mocks = vi.hoisted(() => ({
  requireAnyCapability: vi.fn(),
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  getTenantDiscordConfig: vi.fn(),
  verifyDiscordInviteForGuild: vi.fn(),
  getTenantTimezone: vi.fn(),
  isRegearSupported: vi.fn(),
  requireGuildFeatureUse: vi.fn(),
  logAdminAction: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
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
  getTenantDiscordConfig: mocks.getTenantDiscordConfig,
}))

vi.mock('@/lib/discord-invite-verification', () => ({
  verifyDiscordInviteForGuild: mocks.verifyDiscordInviteForGuild,
}))

vi.mock('@/lib/timezone-server', () => ({
  getTenantTimezone: mocks.getTenantTimezone,
}))

vi.mock('@/lib/regear-support-server', () => ({
  isRegearSupported: mocks.isRegearSupported,
}))

vi.mock('@/lib/guild-features-server', () => ({
  requireGuildFeatureUse: mocks.requireGuildFeatureUse,
}))

vi.mock('@/lib/admin-audit', () => ({
  logAdminAction: mocks.logAdminAction,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: mocks.revalidateTag,
  updateTag: mocks.updateTag,
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
  ),
}))

import {
  updateAppSetting,
  updateGuildProfileSettings,
  updateRegearSupportConfiguration,
  updateTenantAdminRoles,
} from './settings'

interface UpsertCall {
  row: unknown
  options: unknown
}

interface RpcCall {
  name: string
  args: Record<string, unknown>
}

function createDb() {
  const calls: UpsertCall[] = []
  const rpcCalls: RpcCall[] = []
  const db = {
    rpc: vi.fn((name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args })
      return Promise.resolve({
        data: { state: args.p_target_state, openWork: false },
        error: null,
      })
    }),
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
  return { db, calls, rpcCalls }
}

describe('updateAppSetting', () => {
  beforeEach(() => {
    mocks.requireAnyCapability.mockReset()
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.getTenantDiscordConfig.mockReset()
    mocks.verifyDiscordInviteForGuild.mockReset()
    mocks.getTenantTimezone.mockReset()
    mocks.isRegearSupported.mockReset()
    mocks.requireGuildFeatureUse.mockReset()
    mocks.logAdminAction.mockReset()
    mocks.revalidatePath.mockReset()
    mocks.getSession.mockResolvedValue({ discordId: 'admin-1' })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.getTenantDiscordConfig.mockResolvedValue({
      discordGuildId: 'discord-guild-1',
      botInstalled: true,
    })
    mocks.verifyDiscordInviteForGuild.mockResolvedValue({
      status: 'verified',
      canonicalUrl: 'https://discord.gg/demo-guild',
      discordGuildId: 'discord-guild-1',
    })
    mocks.getTenantTimezone.mockResolvedValue('Asia/Seoul')
    mocks.isRegearSupported.mockResolvedValue(true)
    mocks.requireGuildFeatureUse.mockResolvedValue({
      key: 'supply',
      state: 'enabled',
      config: {},
    })
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

  it('saves the exchange gameplay-video requirement with compliance permission', async () => {
    const { db, calls } = createDb()
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(
      updateAppSetting('exchange_recent_gameplay_video_required', 'false'),
    ).resolves.toEqual({})

    expect(mocks.requireAnyCapability).toHaveBeenCalledWith([
      CAP.CONTENT_COMPLIANCE_MANAGE,
    ])
    expect(calls[0].row).toMatchObject({
      guild_id: 'guild-1',
      key: 'exchange_recent_gameplay_video_required',
      value: 'false',
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      '/admin/dashboard/content-compliance',
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/me/wallet')
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
    expect(mocks.verifyDiscordInviteForGuild).toHaveBeenCalledWith(
      'https://discord.com/invite/demo-guild?utm=copy',
      'discord-guild-1',
    )
    expect(calls[0].row).toEqual([
      expect.objectContaining({
        guild_id: 'guild-1',
        key: 'guild_profile_discord_invite_url',
        value: 'https://discord.gg/demo-guild',
      }),
      expect.objectContaining({
        guild_id: 'guild-1',
        key: 'guild_profile_discord_invite_guild_id',
        value: 'discord-guild-1',
      }),
    ])
  })

  it('rejects an invite for a different Discord guild without overwriting settings', async () => {
    const { db, calls } = createDb()
    mocks.requireAnyCapability.mockResolvedValue(db)
    mocks.verifyDiscordInviteForGuild.mockResolvedValue({
      status: 'wrong_guild',
      discordGuildId: 'discord-guild-2',
    })

    await expect(
      updateAppSetting(
        'guild_profile_discord_invite_url',
        'https://discord.gg/demo-guild',
      ),
    ).resolves.toEqual({ error: 'discordInviteWrongGuild' })

    expect(calls).toHaveLength(0)
  })

  it('clears the invite and its verification marker together', async () => {
    const { db, calls } = createDb()
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(
      updateAppSetting('guild_profile_discord_invite_url', ''),
    ).resolves.toEqual({})

    expect(mocks.verifyDiscordInviteForGuild).not.toHaveBeenCalled()
    expect(calls[0].row).toEqual([
      expect.objectContaining({
        key: 'guild_profile_discord_invite_url',
        value: '',
      }),
      expect.objectContaining({
        key: 'guild_profile_discord_invite_guild_id',
        value: '',
      }),
    ])
  })

  it('verifies and stores the Discord guild marker in batch profile saves', async () => {
    const { db, calls } = createDb()
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(
      updateGuildProfileSettings({
        description: 'Guild profile',
        accentColor: 'amber',
        recruitmentStatus: 'open',
        discordInviteUrl: 'https://discord.gg/demo-guild',
        youtubeUrl: '',
      }),
    ).resolves.toEqual({})

    expect(calls[0].row).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'guild_profile_discord_invite_url',
          value: 'https://discord.gg/demo-guild',
        }),
        expect.objectContaining({
          key: 'guild_profile_discord_invite_guild_id',
          value: 'discord-guild-1',
        }),
      ]),
    )
  })

  it('saves support and crafted fulfillment together with settings toggle permission', async () => {
    const { db, rpcCalls } = createDb()
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(updateRegearSupportConfiguration({
      supported: true,
      fulfillmentMode: 'crafted',
    })).resolves.toEqual({})

    expect(mocks.requireAnyCapability).toHaveBeenCalledWith([CAP.SETTINGS_TOGGLES])
    expect(rpcCalls).toEqual([{
      name: 'change_guild_feature_state',
      args: {
        p_guild_id: 'guild-1',
        p_feature_key: 'supply',
        p_target_state: 'enabled',
        p_config: { mode: 'craft' },
        p_actor_discord_id: 'admin-1',
      },
    }])
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/dashboard/settings')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/dashboard/craft')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/craft/queue')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/craft/my-tasks')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('disables support without overwriting the remembered fulfillment method', async () => {
    const { db, rpcCalls } = createDb()
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(updateRegearSupportConfiguration({
      supported: false,
      fulfillmentMode: null,
    })).resolves.toEqual({})

    expect(rpcCalls[0]).toEqual({
      name: 'change_guild_feature_state',
      args: {
        p_guild_id: 'guild-1',
        p_feature_key: 'supply',
        p_target_state: 'disabled',
        p_config: {},
        p_actor_discord_id: 'admin-1',
      },
    })
  })

  it('rejects standalone fulfillment changes and operational settings while unsupported', async () => {
    const { db } = createDb()
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(updateAppSetting('craft_regear_enabled', 'true')).resolves.toEqual({
      error: 'regearSupportConfigurationRequired',
    })

    mocks.isRegearSupported.mockResolvedValue(false)
    await expect(updateAppSetting('auto_regear_enabled', 'true')).resolves.toEqual({
      error: 'regearSupportDisabled',
    })
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

  it('saves a dedicated overcharge payout rate with general settings permission', async () => {
    const { db, calls } = createDb()
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(
      updateAppSetting('regear_overcharge_payout_rate_percent', '35'),
    ).resolves.toEqual({})

    expect(mocks.requireAnyCapability).toHaveBeenCalledWith([CAP.SETTINGS_GENERAL])
    expect(calls[0].row).toMatchObject({
      guild_id: 'guild-1',
      key: 'regear_overcharge_payout_rate_percent',
      value: '35',
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/dashboard/regear')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/regear')
  })

  it('rejects overcharge payout rates outside the supported range', async () => {
    await expect(
      updateAppSetting('regear_overcharge_payout_rate_percent', '101'),
    ).resolves.toEqual({
      error: 'invalidIntegerRange:{"min":1,"max":100}',
    })
    expect(mocks.requireAnyCapability).not.toHaveBeenCalled()
  })

  it('saves the overcharge video requirement with toggle permission', async () => {
    const { db, calls } = createDb()
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(
      updateAppSetting('regear_overcharge_video_required', 'true'),
    ).resolves.toEqual({})

    expect(mocks.requireAnyCapability).toHaveBeenCalledWith([CAP.SETTINGS_TOGGLES])
    expect(calls[0].row).toMatchObject({
      guild_id: 'guild-1',
      key: 'regear_overcharge_video_required',
      value: 'true',
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/regear')
  })

  it('saves the shop discount rate with shop pricing permission', async () => {
    const { db, calls } = createDb()
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(updateAppSetting('shop_discount_rate', '0.5')).resolves.toEqual({})

    expect(mocks.requireAnyCapability).toHaveBeenCalledWith([CAP.SHOP_PRICING])
    expect(mocks.requireGuildFeatureUse).toHaveBeenCalledWith(
      'guild-1',
      'guild_shop',
      'setup',
    )
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

  it('saves the siphon accounting mode with siphon management permission', async () => {
    const { db, calls } = createDb()
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(updateAppSetting('siphon_accounting_mode', 'record')).resolves.toEqual({})

    expect(mocks.requireGuildFeatureUse).toHaveBeenCalledWith(
      'guild-1',
      'asset_accounting',
      'setup',
    )

    expect(mocks.requireAnyCapability).toHaveBeenCalledWith([CAP.SIPHON_MANAGE])
    expect(calls[0].row).toMatchObject({
      guild_id: 'guild-1',
      key: 'siphon_accounting_mode',
      value: 'record',
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/dashboard/siphon')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/me/siphon')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('rejects unsupported siphon accounting modes before saving', async () => {
    await expect(updateAppSetting('siphon_accounting_mode', 'debt')).resolves.toEqual({
      error: 'invalidEnumValue:{"values":"record, personal_custody"}',
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

  it('fails closed for a stale client using the legacy admin-role endpoint', async () => {
    mocks.requireAnyCapability.mockResolvedValue({})

    await expect(
      updateTenantAdminRoles(['123456789012345678', 'not-a-role-id']),
    ).resolves.toEqual({ error: 'invalidInput' })

    await expect(
      updateTenantAdminRoles([
        '123456789012345678',
        '123456789012345678',
        '987654321098765432',
      ]),
    ).resolves.toEqual({ error: 'invalidInput' })

    expect(mocks.requireAnyCapability).toHaveBeenCalledWith([CAP.SETTINGS_PERMISSIONS])
  })
})
