export function buildDiscordStartHref(options: {
  returnTo: string
  invite?: string | null
  forceConsent?: boolean
}): string {
  const params = new URLSearchParams({ returnTo: options.returnTo })
  const invite = options.invite?.trim()
  if (invite) params.set('invite', invite)
  if (options.forceConsent) params.set('retry', '1')
  return `/api/auth/discord/start?${params.toString()}`
}
