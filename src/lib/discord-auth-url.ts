import { sanitizeInternalReturnTo } from '@/lib/safe-return-to'

export function buildDiscordStartHref(options: {
  returnTo: string
  invite?: string | null
  forceConsent?: boolean
}): string {
  const params = new URLSearchParams({
    returnTo: sanitizeInternalReturnTo(options.returnTo),
  })
  const invite = options.invite?.trim()
  if (invite && invite.length <= 512) params.set('invite', invite)
  if (options.forceConsent) params.set('retry', '1')
  return `/api/auth/discord/start?${params.toString()}`
}
