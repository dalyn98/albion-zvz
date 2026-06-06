import { describe, expect, it } from 'vitest'
import {
  applySiteNicknameOverride,
  normalizeDiscordId,
  normalizeSiteNickname,
  SITE_NICKNAME_MAX_LENGTH,
} from './site-nickname'

describe('site nickname helpers', () => {
  it('accepts numeric Discord snowflake ids only', () => {
    expect(normalizeDiscordId(' 123456789012345678 ')).toBe('123456789012345678')
    expect(normalizeDiscordId('abc')).toBeNull()
    expect(normalizeDiscordId('123')).toBeNull()
  })

  it('normalizes site nicknames for display storage', () => {
    expect(normalizeSiteNickname('  Alpha   Bravo  ')).toBe('Alpha Bravo')
    expect(normalizeSiteNickname('')).toBeNull()
    expect(normalizeSiteNickname('a'.repeat(SITE_NICKNAME_MAX_LENGTH + 1))).toBeNull()
    expect(normalizeSiteNickname('bad\u0000name')).toBeNull()
  })

  it('uses the override only when it is valid', () => {
    expect(applySiteNicknameOverride('DiscordName', ' Site Name ')).toBe('Site Name')
    expect(applySiteNicknameOverride(' DiscordName ', null)).toBe('DiscordName')
    expect(applySiteNicknameOverride('', null)).toBe('Unknown')
  })
})
