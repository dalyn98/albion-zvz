import { describe, expect, it } from 'vitest'
import { shouldUseDiscordConsentPrompt } from './discord-reauth'

describe('shouldUseDiscordConsentPrompt', () => {
  it('keeps the normal fast path on regular login', () => {
    expect(
      shouldUseDiscordConsentPrompt({
        retry: false,
        invite: '',
        reauthCookieValue: undefined,
      }),
    ).toBe(false)
  })

  it('uses consent after site logout so Discord account can be switched', () => {
    expect(
      shouldUseDiscordConsentPrompt({
        retry: false,
        invite: '',
        reauthCookieValue: '1',
      }),
    ).toBe(true)
  })

  it('keeps consent for retry and invite flows', () => {
    expect(
      shouldUseDiscordConsentPrompt({
        retry: true,
        invite: '',
        reauthCookieValue: undefined,
      }),
    ).toBe(true)
    expect(
      shouldUseDiscordConsentPrompt({
        retry: false,
        invite: 'guest-token',
        reauthCookieValue: undefined,
      }),
    ).toBe(true)
  })
})
