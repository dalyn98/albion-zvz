'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import DiscordIcon from '@/components/DiscordIcon'

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
  siteName: string
  bannerUrl: string
  ctaText: string
  loginLabel: string
  memberRequiredLabel: string
  logoutLabel: string
  learnMoreLabel: string
  authErrorLabels: Record<string, string>
}

export default function AppGate({
  reason,
  siteName,
  bannerUrl,
  ctaText,
  loginLabel,
  memberRequiredLabel,
  logoutLabel,
  learnMoreLabel,
  authErrorLabels,
}: Props) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const authError = searchParams.get('auth_error')
  const errorMessage = authError
    ? authErrorLabels[AUTH_ERROR_KEY_MAP[authError] ?? 'default'] ?? authErrorLabels.default
    : null

  // Forward any ?invite=... token into the OAuth round-trip so the callback
  // can validate it against the current guest token and grant guest access.
  // returnTo 는 현재 경로 — 이벤트 상세 URL 로 들어온 게스트는 로그인 직후
  // 같은 이벤트 페이지에 착륙하게 된다.
  const invite = searchParams.get('invite')?.trim() ?? ''
  const returnTo = pathname && pathname.startsWith('/') && !pathname.startsWith('//') ? pathname : '/'
  const params = new URLSearchParams({ returnTo })
  if (invite) params.set('invite', invite)
  const loginHref = `/api/auth/discord/start?${params.toString()}`
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
            {siteName}
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

        <div className="flex flex-col items-center gap-2">
          <a
            href="/public/landing"
            className="inline-block text-gray-300/90 hover:text-white text-xs drop-shadow underline underline-offset-4 decoration-gray-500/60"
          >
            {learnMoreLabel}
          </a>
        </div>
      </div>

      <p className="absolute bottom-4 left-0 right-0 text-center text-[11px] text-gray-400/80 drop-shadow z-10 tracking-wide">
        Made By Monkku
      </p>
    </div>
  )
}
