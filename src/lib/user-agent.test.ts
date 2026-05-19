import { describe, it, expect } from 'vitest'
import {
  buildExternalBrowserHref,
  detectInAppBrowser,
  detectMobilePlatform,
} from './user-agent'

describe('detectInAppBrowser', () => {
  it('detects KakaoTalk on iOS and Android', () => {
    const iosKakao =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.4.5'
    const androidKakao =
      'Mozilla/5.0 (Linux; Android 13; SM-S918N Build/TP1A.220624.014; wv) AppleWebKit/537.36 KAKAOTALK 10.4.0'
    expect(detectInAppBrowser(iosKakao)).toBe('kakaotalk')
    expect(detectInAppBrowser(androidKakao)).toBe('kakaotalk')
  })

  it('detects Facebook on both platforms (FBAN/FBAV)', () => {
    expect(detectInAppBrowser('... FBAN/FBIOS;FBAV/443.0.0 ...')).toBe('facebook')
    expect(detectInAppBrowser('... FB4A/443.0.0 FBAV/443.0.0 ...')).toBe('facebook')
  })

  it('does not flag plain Discord bot UA', () => {
    expect(detectInAppBrowser('Discordbot/2.0')).toBeNull()
  })

  it('flags iOS WKWebView (no Safari token) as unknown_webview', () => {
    const wkwv =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
    expect(detectInAppBrowser(wkwv)).toBe('unknown_webview')
  })

  it('returns null for desktop Safari / Chrome', () => {
    expect(
      detectInAppBrowser(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      ),
    ).toBeNull()
    expect(
      detectInAppBrowser(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toBeNull()
  })

  it('returns null for empty/missing UA', () => {
    expect(detectInAppBrowser(null)).toBeNull()
    expect(detectInAppBrowser(undefined)).toBeNull()
    expect(detectInAppBrowser('')).toBeNull()
  })
})

describe('detectMobilePlatform', () => {
  it('classifies iOS, Android, and desktop', () => {
    expect(detectMobilePlatform('Mozilla/5.0 (iPhone; ...)')).toBe('ios')
    expect(detectMobilePlatform('Mozilla/5.0 (iPad; ...)')).toBe('ios')
    expect(detectMobilePlatform('Mozilla/5.0 (Linux; Android 13; ...)')).toBe('android')
    expect(detectMobilePlatform('Mozilla/5.0 (Windows NT 10.0; ...)')).toBeNull()
    expect(detectMobilePlatform(null)).toBeNull()
  })
})

describe('buildExternalBrowserHref', () => {
  const url = 'https://albion-guildmanager.com/landing?foo=1'

  it('builds x-safari-https:// scheme on iOS', () => {
    const href = buildExternalBrowserHref('Mozilla/5.0 (iPhone; ...)', url)
    expect(href).toBe('x-safari-https://albion-guildmanager.com/landing?foo=1')
  })

  it('builds Chrome intent URL on Android with fallback', () => {
    const href = buildExternalBrowserHref('Mozilla/5.0 (Linux; Android 13; ...)', url)
    expect(href).toBe(
      'intent://albion-guildmanager.com/landing?foo=1#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Falbion-guildmanager.com%2Flanding%3Ffoo%3D1;end',
    )
  })

  it('returns null on desktop / unknown platform', () => {
    expect(buildExternalBrowserHref('Mozilla/5.0 (Macintosh; ...)', url)).toBeNull()
    expect(buildExternalBrowserHref(null, url)).toBeNull()
  })

  it('returns null for empty URL', () => {
    expect(buildExternalBrowserHref('Mozilla/5.0 (iPhone; ...)', '')).toBeNull()
  })
})
