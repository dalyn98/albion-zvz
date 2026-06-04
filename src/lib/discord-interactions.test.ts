import { describe, expect, it } from 'vitest'
import { isDiscordSignatureTimestampFresh } from './discord-interactions'

describe('isDiscordSignatureTimestampFresh', () => {
  const nowMs = Date.UTC(2026, 0, 1, 0, 0, 0)
  const nowSeconds = Math.floor(nowMs / 1000)

  it('accepts timestamps inside the replay window', () => {
    expect(isDiscordSignatureTimestampFresh(String(nowSeconds), { nowMs })).toBe(true)
    expect(isDiscordSignatureTimestampFresh(String(nowSeconds - 300), { nowMs })).toBe(true)
    expect(isDiscordSignatureTimestampFresh(String(nowSeconds + 300), { nowMs })).toBe(true)
  })

  it('rejects stale or far-future timestamps', () => {
    expect(isDiscordSignatureTimestampFresh(String(nowSeconds - 301), { nowMs })).toBe(false)
    expect(isDiscordSignatureTimestampFresh(String(nowSeconds + 301), { nowMs })).toBe(false)
  })

  it('rejects malformed timestamps', () => {
    expect(isDiscordSignatureTimestampFresh('', { nowMs })).toBe(false)
    expect(isDiscordSignatureTimestampFresh('123.5', { nowMs })).toBe(false)
    expect(isDiscordSignatureTimestampFresh('not-a-time', { nowMs })).toBe(false)
  })
})
