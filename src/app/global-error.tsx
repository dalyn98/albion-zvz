'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect, useSyncExternalStore } from 'react'

type GlobalErrorLocale = 'ko' | 'ja' | 'en' | 'zh'

const GLOBAL_ERROR_COPY: Record<
  GlobalErrorLocale,
  {
    title: string
    description: string
    retry: string
  }
> = {
  ko: {
    title: '문제가 발생했습니다',
    description: '앱에서 복구할 수 없는 오류가 발생했습니다. 다시 시도해 주세요.',
    retry: '다시 시도',
  },
  ja: {
    title: '問題が発生しました',
    description: 'アプリで復旧できないエラーが発生しました。もう一度お試しください。',
    retry: '再試行',
  },
  en: {
    title: 'Something went wrong',
    description: 'The app hit an unrecoverable error. Please try again.',
    retry: 'Try again',
  },
  zh: {
    title: '出现问题',
    description: '应用发生无法恢复的错误。请重试。',
    retry: '重试',
  },
}

function toGlobalErrorLocale(language: string | undefined): GlobalErrorLocale | null {
  const base = String(language ?? '').trim().toLowerCase().split('-')[0]
  if (base === 'ko' || base === 'ja' || base === 'en' || base === 'zh') return base
  return null
}

function resolveClientLocale(): GlobalErrorLocale {
  if (typeof navigator === 'undefined') return 'en'
  const documentLocale =
    typeof document === 'undefined' ? null : toGlobalErrorLocale(document.documentElement.lang)
  if (documentLocale) return documentLocale

  for (const language of navigator.languages ?? [navigator.language]) {
    const locale = toGlobalErrorLocale(language)
    if (locale) return locale
  }
  return 'en'
}

function subscribeClientLocale(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('languagechange', onStoreChange)
  return () => window.removeEventListener('languagechange', onStoreChange)
}

function getClientLocaleSnapshot(): GlobalErrorLocale {
  return resolveClientLocale()
}

function getServerLocaleSnapshot(): GlobalErrorLocale {
  return 'en'
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const locale = useSyncExternalStore(
    subscribeClientLocale,
    getClientLocaleSnapshot,
    getServerLocaleSnapshot,
  )

  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  const copy = GLOBAL_ERROR_COPY[locale]

  return (
    <html lang={locale} className="h-full antialiased">
      <body className="min-h-full bg-[#0f1117] text-white flex items-center justify-center px-4 py-16">
        <div className="max-w-md w-full bg-gray-900 border border-rose-500/30 rounded-lg p-6 space-y-3 text-center">
          <h1 className="text-lg font-bold">{copy.title}</h1>
          <p className="text-sm text-gray-400">{copy.description}</p>
          {error.digest && (
            <p className="text-[11px] font-mono text-gray-600">#{error.digest}</p>
          )}
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-sm font-semibold px-3 py-2 rounded-lg transition-colors"
          >
            {copy.retry}
          </button>
        </div>
      </body>
    </html>
  )
}
