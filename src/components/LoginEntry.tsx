'use client'

import { useEffect } from 'react'
import DiscordIcon from '@/components/DiscordIcon'
import InAppBrowserNotice from '@/components/InAppBrowserNotice'
import { buildDiscordStartHref } from '@/lib/discord-auth-url'
import { resolveAuthErrorLabel } from '@/lib/auth-error-label'
import { detectInAppBrowser, type InAppBrowserKind } from '@/lib/user-agent'
import { balancedHeadingClass, cx, pressScaleClass } from '@/components/ui-patterns'

interface Props {
  siteName: string
  returnTo: string
  authError: string | null
  forceConsent: boolean
  title: string
  description: string
  continueLabel: string
  retryLabel: string
  authErrorLabels: Record<string, string>
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

function inviteFromReturnTo(returnTo: string): string | null {
  try {
    return new URL(returnTo, 'https://albion-guildmanager.local')
      .searchParams.get('invite')?.trim() || null
  } catch {
    return null
  }
}

export default function LoginEntry({
  siteName,
  returnTo,
  authError,
  forceConsent,
  title,
  description,
  continueLabel,
  retryLabel,
  authErrorLabels,
  inAppBrowserNotice,
}: Props) {
  const loginHref = buildDiscordStartHref({
    returnTo,
    invite: inviteFromReturnTo(returnTo),
    forceConsent: forceConsent || Boolean(authError),
  })
  const errorMessage = resolveAuthErrorLabel(authError, authErrorLabels)

  useEffect(() => {
    if (authError || typeof navigator === 'undefined') return
    if (detectInAppBrowser(navigator.userAgent)) return
    window.location.replace(loginHref)
  }, [authError, loginHref])

  return (
    <main className="flex flex-1 items-center justify-center bg-[#0b0d12] px-4 py-10">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
            {siteName}
          </p>
          <h1 className={cx('text-3xl font-bold text-white', balancedHeadingClass)}>
            {title}
          </h1>
          <p className="text-sm leading-relaxed text-gray-300">{description}</p>
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

        {errorMessage && (
          <p
            role="alert"
            className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          >
            {errorMessage}
          </p>
        )}

        <a
          href={loginHref}
          className={cx(
            'inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#5865F2] px-4 py-3.5 font-semibold text-white transition-[background-color,transform] hover:bg-[#4752c4]',
            pressScaleClass,
          )}
        >
          <DiscordIcon />
          <span>{authError ? retryLabel : continueLabel}</span>
        </a>
      </div>
    </main>
  )
}
