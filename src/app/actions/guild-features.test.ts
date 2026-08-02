import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CAP } from '@/lib/permissions'

const mocks = vi.hoisted(() => ({
  requireAnyCapability: vi.fn(),
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  invalidateAppSettingsCache: vi.fn(),
  markPublicGuildProfileCacheStale: vi.fn(),
  logAdminAction: vi.fn(),
  revalidatePath: vi.fn(),
  publicActionError: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ requireAnyCapability: mocks.requireAnyCapability }))
vi.mock('@/lib/session', () => ({ getSession: mocks.getSession }))
vi.mock('@/lib/tenant', () => ({ getSessionGuildId: mocks.getSessionGuildId }))
vi.mock('@/lib/app-settings-invalidation', () => ({
  invalidateAppSettingsCache: mocks.invalidateAppSettingsCache,
}))
vi.mock('@/lib/guild-profile-cache', () => ({
  markPublicGuildProfileCacheStale: mocks.markPublicGuildProfileCacheStale,
}))
vi.mock('@/lib/admin-audit', () => ({ logAdminAction: mocks.logAdminAction }))
vi.mock('@/lib/public-action-error', () => ({ publicActionError: mocks.publicActionError }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

import { changeGuildFeatureState } from './guild-features'

describe('changeGuildFeatureState', () => {
  const rpc = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAnyCapability.mockResolvedValue({ rpc })
    mocks.getSession.mockResolvedValue({ discordId: 'admin-1' })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.publicActionError.mockResolvedValue('serverError')
    rpc.mockResolvedValue({
      data: { state: 'draining', openWork: true },
      error: null,
    })
  })

  it('rejects core, battlelog, and invalid target states before touching the DB', async () => {
    await expect(changeGuildFeatureState({
      featureKey: 'events',
      targetState: 'enabled',
    })).resolves.toEqual({ error: 'invalidInput' })
    await expect(changeGuildFeatureState({
      featureKey: 'battlelog',
      targetState: 'enabled',
    })).resolves.toEqual({ error: 'invalidInput' })
    expect(mocks.requireAnyCapability).not.toHaveBeenCalled()
  })

  it('delegates dependencies, draining, legacy projection, and audit to one RPC', async () => {
    await expect(changeGuildFeatureState({
      featureKey: 'guild_economy',
      targetState: 'disabled',
    })).resolves.toEqual({ state: 'draining', openWork: true })

    expect(mocks.requireAnyCapability).toHaveBeenCalledWith([CAP.SETTINGS_TOGGLES])
    expect(rpc).toHaveBeenCalledWith('change_guild_feature_state', {
      p_guild_id: 'guild-1',
      p_feature_key: 'guild_economy',
      p_target_state: 'disabled',
      p_config: {},
      p_actor_discord_id: 'admin-1',
    })
    expect(mocks.logAdminAction).toHaveBeenCalledWith(expect.objectContaining({
      guildId: 'guild-1',
      adminDiscordId: 'admin-1',
      details: expect.objectContaining({
        featureKey: 'guild_economy',
        targetState: 'disabled',
        resultingState: 'draining',
        openWork: true,
      }),
    }))
  })

  it('invalidates the public profile cache only for that feature', async () => {
    rpc.mockResolvedValue({ data: { state: 'enabled', openWork: false }, error: null })
    await changeGuildFeatureState({
      featureKey: 'public_guild_profile',
      targetState: 'enabled',
    })
    expect(mocks.markPublicGuildProfileCacheStale).toHaveBeenCalledWith('guild-1')
  })
})
