import { describe, expect, it } from 'vitest'
import {
  DISCORD_APP_LOGIN_ATTEMPT_TTL_SECONDS,
  buildDiscordAppLoginCustomId,
  createDiscordAppLoginToken,
  hashDiscordAppLoginToken,
  isValidDiscordAppLoginToken,
  parseDiscordAppLoginCustomId,
} from './discord-app-login'

describe('Discord app login token', () => {
  it('creates a high-entropy URL-safe token and hashes the stored representation', () => {
    const token = createDiscordAppLoginToken()

    expect(token).not.toBe(hashDiscordAppLoginToken(token))
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(isValidDiscordAppLoginToken(token)).toBe(true)
    expect(isValidDiscordAppLoginToken('too-short')).toBe(false)
    expect(hashDiscordAppLoginToken(token)).toMatch(/^[a-f0-9]{64}$/)
    expect(DISCORD_APP_LOGIN_ATTEMPT_TTL_SECONDS).toBe(5 * 60)
  })
})

describe('Discord app login interaction IDs', () => {
  it('keeps a fixed, validated destination in a Discord-safe custom ID', () => {
    const customId = buildDiscordAppLoginCustomId('wallet')

    expect(customId).toBe('agm_login:v1:wallet')
    expect(customId.length).toBeLessThanOrEqual(100)
    expect(parseDiscordAppLoginCustomId(customId)).toEqual({ destination: 'wallet' })
    expect(parseDiscordAppLoginCustomId('agm_login:v1:../../admin')).toBeNull()
    expect(parseDiscordAppLoginCustomId('agm_login:v2:wallet')).toBeNull()
  })
})
