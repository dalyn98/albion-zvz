'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-[#0f1117] text-white flex items-center justify-center px-4 py-16">
        <div className="max-w-md w-full bg-gray-900 border border-rose-500/30 rounded-2xl p-6 space-y-3 text-center">
          <h1 className="text-lg font-bold">Something went wrong</h1>
          <p className="text-sm text-gray-400">
            The app hit an unrecoverable error. Please try again.
          </p>
          {error.digest && (
            <p className="text-[11px] font-mono text-gray-600">#{error.digest}</p>
          )}
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-sm font-semibold px-3 py-2 rounded-lg transition-colors"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
