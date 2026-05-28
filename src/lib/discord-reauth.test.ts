import { describe, expect, it } from 'vitest'
import { shouldUseDiscordConsentPrompt } from './discord-reauth'

const ANDROID_CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36'
const DISCORD_IOS_WEBVIEW_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Discord/280'
const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

describe('shouldUseDiscordConsentPrompt', () => {
  it('keeps explicit retry, invite, and reauth cookie behavior', () => {
    expect(shouldUseDiscordConsentPrompt({
      retry: true,
      invite: '',
      reauthCookieValue: undefined,
      returnTo: '/',
      userAgent: DESKTOP_CHROME_UA,
    })).toBe(true)
    expect(shouldUseDiscordConsentPrompt({
      retry: false,
      invite: 'guest-token',
      reauthCookieValue: undefined,
      returnTo: '/events/event-1',
      userAgent: DESKTOP_CHROME_UA,
    })).toBe(true)
    expect(shouldUseDiscordConsentPrompt({
      retry: false,
      invite: '',
      reauthCookieValue: '1',
      returnTo: '/',
      userAgent: DESKTOP_CHROME_UA,
    })).toBe(true)
  })

  it('uses consent immediately for mobile public event logins', () => {
    expect(shouldUseDiscordConsentPrompt({
      retry: false,
      invite: '',
      reauthCookieValue: undefined,
      returnTo: '/events/event-1',
      userAgent: ANDROID_CHROME_UA,
    })).toBe(true)
  })

  it('uses consent immediately for Discord in-app event logins', () => {
    expect(shouldUseDiscordConsentPrompt({
      retry: false,
      invite: '',
      reauthCookieValue: undefined,
      returnTo: '/events/event-1?foo=bar',
      userAgent: DISCORD_IOS_WEBVIEW_UA,
    })).toBe(true)
  })

  it('keeps desktop non-invite event login on prompt none', () => {
    expect(shouldUseDiscordConsentPrompt({
      retry: false,
      invite: '',
      reauthCookieValue: undefined,
      returnTo: '/events/event-1',
      userAgent: DESKTOP_CHROME_UA,
    })).toBe(false)
  })

  it('uses consent immediately for mobile non-event paths', () => {
    expect(shouldUseDiscordConsentPrompt({
      retry: false,
      invite: '',
      reauthCookieValue: undefined,
      returnTo: '/me',
      userAgent: ANDROID_CHROME_UA,
    })).toBe(true)
  })

  it('uses consent immediately for mobile admin onboarding', () => {
    expect(shouldUseDiscordConsentPrompt({
      retry: false,
      invite: '',
      reauthCookieValue: undefined,
      returnTo: '/onboard',
      userAgent: DISCORD_IOS_WEBVIEW_UA,
    })).toBe(true)
  })
})
