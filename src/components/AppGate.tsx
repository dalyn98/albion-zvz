'use client'

import { useSearchParams } from 'next/navigation'

const AUTH_ERROR_KEY_MAP: Record<string, string> = {
  denied: 'denied',
  invalid: 'invalid',
  state_mismatch: 'stateMismatch',
  not_in_guild: 'notInGuild',
  no_identity: 'noIdentity',
  no_role: 'noRole',
  server_error: 'serverError',
}

export type GateReason = 'not_logged_in' | 'no_role'

interface Props {
  reason: GateReason
  bannerUrl: string
  ctaText: string
  loginLabel: string
  memberRequiredLabel: string
  logoutLabel: string
  publicRecordsLabel: string
  authErrorLabels: Record<string, string>
}

export default function AppGate({
  reason,
  bannerUrl,
  ctaText,
  loginLabel,
  memberRequiredLabel,
  logoutLabel,
  publicRecordsLabel,
  authErrorLabels,
}: Props) {
  const searchParams = useSearchParams()
  const authError = searchParams.get('auth_error')
  const errorMessage = authError
    ? authErrorLabels[AUTH_ERROR_KEY_MAP[authError] ?? 'default'] ?? authErrorLabels.default
    : null

  // Forward any ?invite=... token into the OAuth round-trip so the callback
  // can validate it against the current guest token and grant guest access.
  const invite = searchParams.get('invite')?.trim() ?? ''
  const loginHref = invite
    ? `/api/auth/discord/start?returnTo=/&invite=${encodeURIComponent(invite)}`
    : '/api/auth/discord/start?returnTo=/'
  const backgroundStyle = bannerUrl
    ? {
        backgroundImage: `url(${bannerUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : undefined

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4 bg-[#0b0d12]"
      style={backgroundStyle}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/60 to-black/85" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.4)_70%)]" />

      <div className="relative z-10 w-full max-w-sm text-center space-y-8">
        <div className="space-y-3">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
            Menhera
          </h1>
          <p className="text-gray-200/90 text-sm leading-relaxed drop-shadow whitespace-pre-wrap">
            {reason === 'no_role' ? memberRequiredLabel : ctaText}
          </p>
        </div>

        {reason === 'no_role' ? (
          <a
            href="/api/auth/logout"
            className="group relative inline-flex items-center justify-center gap-2 w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3.5 rounded-xl shadow-lg hover:-translate-y-0.5 transition-all duration-200"
          >
            <span>{logoutLabel}</span>
          </a>
        ) : (
          <a
            href={loginHref}
            className="group relative inline-flex items-center justify-center gap-2 w-full bg-[#5865F2] hover:bg-[#4752c4] text-white font-semibold py-3.5 rounded-xl shadow-[0_10px_30px_-10px_rgba(88,101,242,0.6)] hover:shadow-[0_14px_36px_-10px_rgba(88,101,242,0.75)] hover:-translate-y-0.5 transition-all duration-200"
          >
            <DiscordIcon />
            <span>{loginLabel}</span>
          </a>
        )}

        {errorMessage && <p className="text-red-300 text-xs drop-shadow">{errorMessage}</p>}

        <a
          href="/public/records"
          className="inline-block text-gray-300/90 hover:text-white text-xs drop-shadow underline underline-offset-4 decoration-gray-500/60"
        >
          {publicRecordsLabel}
        </a>
      </div>

      <p className="absolute bottom-4 left-0 right-0 text-center text-[11px] text-gray-400/80 drop-shadow z-10 tracking-wide">
        Made By Monkku
      </p>
    </div>
  )
}

function DiscordIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.04.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  )
}
