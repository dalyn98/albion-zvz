'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { AlertTriangle, RotateCcw, Home } from 'lucide-react'
import Link from 'next/link'

interface Props {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ErrorBoundary({ error, reset }: Props) {
  const t = useTranslations('errors')

  useEffect(() => {
    console.error('App error boundary:', error)
  }, [error])

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full bg-gray-900 border border-rose-500/30 rounded-2xl p-6 space-y-4 text-center">
        <div className="flex justify-center">
          <div className="w-12 h-12 rounded-full bg-rose-500/15 flex items-center justify-center">
            <AlertTriangle size={24} className="text-rose-300" />
          </div>
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-bold text-white">{t('title')}</h1>
          <p className="text-sm text-gray-400">{t('description')}</p>
        </div>
        {error.digest && (
          <p className="text-[11px] font-mono text-gray-600">#{error.digest}</p>
        )}
        <div className="flex gap-2 justify-center pt-1">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-sm font-semibold px-3 py-2 rounded-lg transition-colors"
          >
            <RotateCcw size={14} />
            {t('retry')}
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 text-sm font-semibold px-3 py-2 rounded-lg transition-colors"
          >
            <Home size={14} />
            {t('home')}
          </Link>
        </div>
      </div>
    </main>
  )
}
