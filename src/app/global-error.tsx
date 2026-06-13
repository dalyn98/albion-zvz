'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect, useSyncExternalStore } from 'react'
import { GLOBAL_ERROR_COPY, type GlobalErrorLocale } from '@/lib/global-error-copy'

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
