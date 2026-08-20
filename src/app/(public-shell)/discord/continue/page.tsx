import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import InAppBrowserNotice from '@/components/InAppBrowserNotice'
import { balancedHeadingClass, cx, pressScaleClass } from '@/components/ui-patterns'
import {
  inspectDiscordAppLoginLink,
  isValidDiscordAppLoginAttemptId,
  isValidDiscordAppLoginToken,
} from '@/lib/discord-app-login'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
  referrer: 'no-referrer',
}

interface PageProps {
  searchParams: Promise<{
    id?: string | string[]
    token?: string | string[]
  }>
}

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

export default async function DiscordContinuePage({ searchParams }: PageProps) {
  const [params, t, tInApp] = await Promise.all([
    searchParams,
    getTranslations('discordWebHandoff'),
    getTranslations('inAppBrowserNotice'),
  ])
  const attemptId = first(params.id)
  const token = first(params.token)
  const state = await inspectDiscordAppLoginLink({ attemptId, token })
  const canContinue =
    state.status === 'active' &&
    isValidDiscordAppLoginAttemptId(attemptId) &&
    isValidDiscordAppLoginToken(token)

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#0b0d12] px-4 py-10 antialiased">
      <section className="w-full max-w-md space-y-5 rounded-3xl bg-[#11141b] p-5 shadow-[0_24px_80px_-32px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-7">
        <header className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#5865F2]/15 text-[#aeb7ff] shadow-[inset_0_0_0_1px_rgba(174,183,255,0.18)]">
            <ShieldCheck aria-hidden="true" size={24} />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#aeb7ff]">
              {t('eyebrow')}
            </p>
            <h1 className={cx('text-2xl font-bold text-white sm:text-3xl', balancedHeadingClass)}>
              {canContinue ? t('title') : t('expiredTitle')}
            </h1>
            <p className="text-pretty text-sm leading-relaxed text-gray-300">
              {canContinue ? t('description') : t('expiredDescription')}
            </p>
          </div>
        </header>

        {canContinue && (
          <InAppBrowserNotice
            title={t('mobileTitle')}
            description={t('mobileDescription')}
            copyButtonLabel={tInApp('copyButton')}
            copiedLabel={tInApp('copied')}
            copyFailedLabel={tInApp('copyFailed')}
            openBrowserLabel={tInApp('openBrowser')}
            perAppHint={{
              discord: t('discordHint'),
              unknown_webview: t('genericHint'),
            }}
          />
        )}

        {canContinue ? (
          <form action="/api/auth/discord/app/consume" method="post" className="space-y-3">
            <input type="hidden" name="id" value={attemptId} />
            <input type="hidden" name="token" value={token} />
            <button
              type="submit"
              className={cx(
                'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#5865F2] px-4 py-3.5 text-sm font-semibold text-white shadow-[0_12px_30px_-12px_rgba(88,101,242,0.75)] transition-[background-color,box-shadow,transform] duration-200 hover:bg-[#4752c4]',
                pressScaleClass,
              )}
            >
              <span>{t('continueButton')}</span>
              <ArrowRight aria-hidden="true" size={16} />
            </button>
            <p className="text-center text-xs leading-relaxed text-gray-400">
              {t('securityHint')}
            </p>
          </form>
        ) : (
          <p className="rounded-xl bg-amber-500/10 px-4 py-3 text-center text-sm leading-relaxed text-amber-100 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.22)]">
            {t('retryHint')}
          </p>
        )}
      </section>
    </main>
  )
}
