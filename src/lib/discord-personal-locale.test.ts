import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loadGlobalAccessPreferences: vi.fn(),
  logWarn: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/global-access-preferences-server', () => ({
  loadGlobalAccessPreferences: mocks.loadGlobalAccessPreferences,
}))
vi.mock('@/lib/log', () => ({
  log: { warn: mocks.logWarn },
}))

import {
  resolveDiscordInteractionFallbackLocale,
  resolveDiscordPersonalLocale,
} from './discord-personal-locale'

describe('resolveDiscordPersonalLocale', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.loadGlobalAccessPreferences.mockResolvedValue(null)
  })

  it('prefers the language explicitly selected in AGM over Discord locales', async () => {
    mocks.loadGlobalAccessPreferences.mockResolvedValue({
      preferredLanguage: 'ja',
      timezone: null,
    })

    await expect(resolveDiscordPersonalLocale({
      locale: 'ko',
      guild_locale: 'en-US',
      member: { user: { id: 'member-1', username: 'Member' } },
    })).resolves.toBe('ja')
  })

  it('falls back through Discord client locale, guild locale, then English', async () => {
    await expect(resolveDiscordPersonalLocale({
      locale: 'zh-CN',
      guild_locale: 'ko',
      user: { id: 'member-1', username: 'Member' },
    })).resolves.toBe('zh')

    expect(resolveDiscordInteractionFallbackLocale({ guild_locale: 'ko' })).toBe('ko')
    expect(resolveDiscordInteractionFallbackLocale({ locale: 'vi', guild_locale: 'vi' })).toBe('en')
  })

  it('keeps private replies available when preference storage is unavailable', async () => {
    mocks.loadGlobalAccessPreferences.mockRejectedValue(new Error('database unavailable'))

    await expect(resolveDiscordPersonalLocale({
      locale: 'de',
      member: { user: { id: 'member-1', username: 'Member' } },
    })).resolves.toBe('de')
    expect(mocks.logWarn).toHaveBeenCalledOnce()
  })

  it('does not query preferences when an interaction has no user identity', async () => {
    await expect(resolveDiscordPersonalLocale({ guild_locale: 'ja' })).resolves.toBe('ja')
    expect(mocks.loadGlobalAccessPreferences).not.toHaveBeenCalled()
  })
})
