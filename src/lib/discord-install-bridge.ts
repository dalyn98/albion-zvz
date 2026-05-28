import { detectInAppBrowser, detectMobilePlatform } from '@/lib/user-agent'

export function shouldUseDiscordInstallBridge(userAgent: string | null | undefined): boolean {
  return detectInAppBrowser(userAgent) !== null || detectMobilePlatform(userAgent) !== null
}
