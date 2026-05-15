import { describe, it, expect } from 'vitest'
import {
  isValidTenantSlug,
  classifySlugIssue,
  displayNameFromSlug,
  slugBaseFromAlbionGuildName,
  RESERVED_SLUGS,
} from './tenant-slug'

describe('isValidTenantSlug', () => {
  it('accepts normal lowercase slugs', () => {
    expect(isValidTenantSlug('guildname')).toBe(true)
    expect(isValidTenantSlug('jelda-pl9c')).toBe(true)
    expect(isValidTenantSlug('a1')).toBe(true)
  })

  it('rejects too short / too long', () => {
    expect(isValidTenantSlug('a')).toBe(false)
    expect(isValidTenantSlug('a'.repeat(33))).toBe(false)
  })

  it('rejects unicode and disallowed characters', () => {
    expect(isValidTenantSlug('길드')).toBe(false)
    expect(isValidTenantSlug('guild_name')).toBe(false)
    expect(isValidTenantSlug('guild.name')).toBe(false)
    expect(isValidTenantSlug('guild name')).toBe(false)
  })

  it('normalizes uppercase input to lowercase (mixed case allowed)', () => {
    // isValidTenantSlug lowercases internally, so 'Guild' is treated as 'guild'.
    expect(isValidTenantSlug('Guild')).toBe(true)
  })

  it('rejects leading/trailing hyphen', () => {
    expect(isValidTenantSlug('-guild')).toBe(false)
    expect(isValidTenantSlug('guild-')).toBe(false)
  })

  it('rejects consecutive hyphens', () => {
    expect(isValidTenantSlug('guild--name')).toBe(false)
  })

  it('rejects reserved slugs', () => {
    for (const reserved of RESERVED_SLUGS) {
      expect(isValidTenantSlug(reserved)).toBe(false)
    }
  })

  it('rejects non-string inputs', () => {
    expect(isValidTenantSlug(null as unknown as string)).toBe(false)
    expect(isValidTenantSlug(undefined as unknown as string)).toBe(false)
    expect(isValidTenantSlug(123 as unknown as string)).toBe(false)
  })
})

describe('classifySlugIssue', () => {
  it('returns null for valid slugs', () => {
    expect(classifySlugIssue('guildname')).toBe(null)
    expect(classifySlugIssue('a1-b2')).toBe(null)
  })

  it('classifies specific failure modes', () => {
    expect(classifySlugIssue('')).toBe('empty')
    expect(classifySlugIssue('a')).toBe('too_short')
    expect(classifySlugIssue('a'.repeat(33))).toBe('too_long')
    expect(classifySlugIssue('-x')).toBe('leading_trailing_hyphen')
    expect(classifySlugIssue('x-')).toBe('leading_trailing_hyphen')
    expect(classifySlugIssue('a--b')).toBe('double_hyphen')
    expect(classifySlugIssue('guild_name')).toBe('invalid_chars')
    expect(classifySlugIssue('admin')).toBe('reserved')
  })

  it('treats null as empty', () => {
    expect(classifySlugIssue(null as unknown as string)).toBe('empty')
  })
})

describe('displayNameFromSlug', () => {
  it('extracts first segment and capitalizes', () => {
    expect(displayNameFromSlug('jelda-pl9c')).toBe('Jelda')
    expect(displayNameFromSlug('menhera')).toBe('Menhera')
  })

  it('returns empty string for empty input', () => {
    expect(displayNameFromSlug('')).toBe('')
    expect(displayNameFromSlug(null as unknown as string)).toBe('')
  })
})

describe('slugBaseFromAlbionGuildName', () => {
  it('lowercases and dashes ASCII', () => {
    expect(slugBaseFromAlbionGuildName('Cool Guild')).toBe('cool-guild')
    expect(slugBaseFromAlbionGuildName('Knights Of Albion')).toBe('knights-of-albion')
  })

  it('strips non-ASCII (Korean/Chinese guild names)', () => {
    expect(slugBaseFromAlbionGuildName('한글길드')).toBe('')
    expect(slugBaseFromAlbionGuildName('English한글Mix')).toBe('english-mix')
  })

  it('collapses repeated separators and trims', () => {
    expect(slugBaseFromAlbionGuildName('  Cool  Guild  ')).toBe('cool-guild')
    expect(slugBaseFromAlbionGuildName('!@#$Cool---Guild!@#')).toBe('cool-guild')
  })

  it('caps at 24 chars', () => {
    expect(slugBaseFromAlbionGuildName('a'.repeat(50))).toHaveLength(24)
  })

  it('handles empty / null input', () => {
    expect(slugBaseFromAlbionGuildName('')).toBe('')
    expect(slugBaseFromAlbionGuildName(null as unknown as string)).toBe('')
  })
})
