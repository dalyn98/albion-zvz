import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_LOCALE } from '@/i18n/locales'

vi.mock('server-only', () => ({}))

import { resolveDiscordDmLocaleMap } from './discord-dm-localized'

describe('resolveDiscordDmLocaleMap', () => {
  it('defaults every requested Discord ID to the default locale', () => {
    const result = resolveDiscordDmLocaleMap(['user-1', 'user-2', 'user-1'], [], [])

    expect(Array.from(result.entries())).toEqual([
      ['user-1', DEFAULT_LOCALE],
      ['user-2', DEFAULT_LOCALE],
    ])
  })

  it('uses guild avatar language before guest language for the same Discord ID', () => {
    const result = resolveDiscordDmLocaleMap(
      ['user-1'],
      [{ discord_id: 'user-1', preferred_language: 'ja' }],
      [{ discord_id: 'user-1', preferred_language: 'en' }],
    )

    expect(result.get('user-1')).toBe('ja')
  })

  it('falls back to guest language when the avatar language is missing or invalid', () => {
    const result = resolveDiscordDmLocaleMap(
      ['missing-avatar', 'invalid-avatar'],
      [
        { discord_id: 'missing-avatar', preferred_language: null },
        { discord_id: 'invalid-avatar', preferred_language: 'de' },
      ],
      [
        { discord_id: 'missing-avatar', preferred_language: 'zh' },
        { discord_id: 'invalid-avatar', preferred_language: 'en' },
      ],
    )

    expect(result.get('missing-avatar')).toBe('zh')
    expect(result.get('invalid-avatar')).toBe('en')
  })

  it('ignores locale rows outside the requested Discord IDs', () => {
    const result = resolveDiscordDmLocaleMap(
      ['user-1'],
      [{ discord_id: 'other-user', preferred_language: 'en' }],
      [],
    )

    expect(result.get('user-1')).toBe(DEFAULT_LOCALE)
    expect(result.has('other-user')).toBe(false)
  })
})
