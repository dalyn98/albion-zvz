import { describe, expect, it } from 'vitest'
import { shouldUseDiscordInstallBridge } from './discord-install-bridge'

const ANDROID_CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36'
const DISCORD_IOS_WEBVIEW_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Discord/280'
const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

describe('shouldUseDiscordInstallBridge', () => {
  it('routes mobile browser bot installs through the bridge page', () => {
    expect(shouldUseDiscordInstallBridge(ANDROID_CHROME_UA)).toBe(true)
  })

  it('routes Discord in-app bot installs through the bridge page', () => {
    expect(shouldUseDiscordInstallBridge(DISCORD_IOS_WEBVIEW_UA)).toBe(true)
  })

  it('keeps desktop installs on the direct Discord redirect', () => {
    expect(shouldUseDiscordInstallBridge(DESKTOP_CHROME_UA)).toBe(false)
  })
})
