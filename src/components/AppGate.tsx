'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import DiscordIcon from '@/components/DiscordIcon'
import DiscordBrowserSessionConnect from '@/components/DiscordBrowserSessionConnect'
import InAppBrowserNotice from '@/components/InAppBrowserNotice'
import { balancedHeadingClass, cx, pressScaleClass, prettyTextClass } from '@/components/ui-patterns'
import type { InAppBrowserKind } from '@/lib/user-agent'
import {
  buildLoginEntryHref,
  buildReturnToWithSearchParams,
} from '@/lib/login-entry'
import { resolveAuthErrorLabel } from '@/lib/auth-error-label'
import { useBodyScrollLock } from '@/components/useBodyScrollLock'

export type GateReason = 'not_logged_in' | 'no_role'

interface Props {
  reason: GateReason
  siteName: string
  bannerUrl: string
  ctaText: string
  loginLabel: string
  memberRequiredLabel: string
  invitePromptLabel: string
  logoutLabel: string
  learnMoreLabel: string
  learnMoreHref: string
  localLoginLabel?: string
  localLoginHref?: string | null
  authErrorLabels: Record<string, string>
  retryLabel: string
  deviceAuth: {
    start: string
    description: string
    codeLabel: string
    copyCode: string
    copied: string
    openDiscord: string
    waiting: string
    expired: string
    failed: string
    cancel: string
  }
  inAppBrowserNotice: {
    title: string
    description: string
    copyButtonLabel: string
    copiedLabel: string
    copyFailedLabel: string
    openBrowserLabel: string
    perAppHint: Partial<Record<NonNullable<InAppBrowserKind>, string>>
  }
}

export default function AppGate({
  reason,
  siteName,
  bannerUrl,
  ctaText,
  loginLabel,
  memberRequiredLabel,
  invitePromptLabel,
  logoutLabel,
  learnMoreLabel,
  learnMoreHref,
  localLoginLabel,
  localLoginHref,
  authErrorLabels,
  retryLabel,
  deviceAuth,
  inAppBrowserNotice,
}: Props) {
  useBodyScrollLock(true)

  // 이벤트/멤버/공유 페이지의 generateMetadata 가 OG/SEO 를 위해 풍부한 title
  // (예: "Foo Battle · 길드명") 을 박아두는데, 미로그인 사용자에게는 AppGate
  // 가 본문을 덮으면서도 브라우저 탭 title 만 남아 정보가 새 보인다. App Router
  // 의 head-manager 는 hydration 후에도 metadata 를 한 번 더 동기화하므로
  // 단순 setter 는 다시 덮인다. <title> 변경을 감시해 siteName 으로 유지한다.
  useEffect(() => {
    if (typeof document === 'undefined' || !siteName) return
    const titleEl = document.querySelector('title')
    if (!titleEl) {
      document.title = siteName
      return
    }
    document.title = siteName
    const observer = new MutationObserver(() => {
      if (document.title !== siteName) {
        document.title = siteName
      }
    })
    observer.observe(titleEl, { childList: true, characterData: true, subtree: true })
    return () => observer.disconnect()
  }, [siteName])

  const searchParams = useSearchParams()
  const pathname = usePathname()
  const authError = searchParams.get('auth_error')
  const errorMessage = resolveAuthErrorLabel(authError, authErrorLabels)

  // Forward any ?invite=... token into the OAuth round-trip so the callback
  // can validate it against the current guest token and grant guest access.
  // returnTo 는 현재 경로 — 이벤트 상세 URL 로 들어온 게스트는 로그인 직후
  // 같은 이벤트 페이지에 착륙하게 된다.
  const invite = searchParams.get('invite')?.trim() ?? ''
  const hasInvite = invite.length > 0
  const returnTo = buildReturnToWithSearchParams(pathname || '/', searchParams.entries())
  const loginHref = buildLoginEntryHref({ returnTo, authError })

  // 초대 링크가 있으면 어떤 reason 이든 Discord 로그인 버튼이 우선이다 — 다른
  // 계정으로 들어와 있는 사용자도 OAuth 한번 돌면 콜백이 게스트 세션을 발급해
  // 이벤트 페이지로 hop 한다. no_role + invite 은 거기에 더해 logout 도 같이
  // 노출해 "다른 계정으로 다시 들어가는" 옵션을 남긴다.
  const showLogin = reason === 'not_logged_in' || hasInvite
  const showLogout = reason === 'no_role'
  // auth_error 로 한 번 깨진 사용자가 그 자리에서 다시 시도할 수 있도록 retry
  // 버튼을 노출. login 버튼이 이미 같은 동작을 하므로 logout-only 경로(no_role)
  // 에선 의미 없음.
  const showRetry = !!authError && showLogin
  const promptText = hasInvite
    ? invitePromptLabel
    : reason === 'no_role'
      ? memberRequiredLabel
      : ctaText
  const backgroundStyle = bannerUrl
    ? {
        backgroundImage: `url(${bannerUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : undefined

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-gate-title"
      className="fixed inset-0 z-[60] flex touch-pan-y items-center justify-center overflow-y-auto overscroll-contain bg-[#0b0d12] px-4 py-[max(2rem,env(safe-area-inset-bottom))] [-webkit-overflow-scrolling:touch]"
      style={backgroundStyle}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/60 to-black/85" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.4)_70%)]" />

      <div className="relative z-10 w-full max-w-sm text-center space-y-6 my-auto">
        <div className="space-y-3">
          <h1
            id="app-gate-title"
            className={cx(
              'text-4xl font-bold tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)] sm:text-5xl',
              balancedHeadingClass,
            )}
          >
            {siteName}
          </h1>
          <p
            className={cx(
              'whitespace-pre-wrap text-sm leading-relaxed text-gray-200/90 drop-shadow',
              prettyTextClass,
            )}
          >
            {promptText}
          </p>
        </div>

        <InAppBrowserNotice
          title={inAppBrowserNotice.title}
          description={inAppBrowserNotice.description}
          copyButtonLabel={inAppBrowserNotice.copyButtonLabel}
          copiedLabel={inAppBrowserNotice.copiedLabel}
          copyFailedLabel={inAppBrowserNotice.copyFailedLabel}
          openBrowserLabel={inAppBrowserNotice.openBrowserLabel}
          perAppHint={inAppBrowserNotice.perAppHint}
        />

        <div className="space-y-3">
          {!hasInvite && (
            <DiscordBrowserSessionConnect
              returnTo={returnTo}
              labels={deviceAuth}
            />
          )}
          {showLogin && (
            <a
              href={loginHref}
              className={cx(
                'group relative inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 py-3 text-sm font-semibold text-white transition-[background-color,border-color,transform] duration-200 ease-out hover:bg-white/15',
                pressScaleClass,
              )}
            >
              <DiscordIcon />
              <span>{showRetry ? retryLabel : loginLabel}</span>
            </a>
          )}
          {localLoginHref && localLoginLabel && (
            <a
              href={localLoginHref}
              className={cx(
                'inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 py-3 text-sm font-semibold text-amber-200 transition-[background-color,border-color,transform] duration-200 ease-out hover:bg-amber-500/20',
                pressScaleClass,
              )}
            >
              <span>{localLoginLabel}</span>
            </a>
          )}
          {showLogout && (
            // /api/auth/logout 는 POST 전용 (CSRF 보호). 기존에 <a> 로 GET
            // 호출이 가서 405 가 떴었다. 풀폼 submit 으로 일관성 있게.
            <form action="/api/auth/logout" method="POST" className="w-full">
              <button
                type="submit"
                className={cx(
                  'group relative inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-700 py-3.5 font-semibold text-white shadow-lg transition-[background-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:bg-gray-600',
                  pressScaleClass,
                )}
              >
                <span>{logoutLabel}</span>
              </button>
            </form>
          )}
        </div>

        {errorMessage && <p className="text-red-300 text-xs drop-shadow">{errorMessage}</p>}

        <div className="flex flex-col items-center gap-2">
          <a
            href={learnMoreHref}
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
