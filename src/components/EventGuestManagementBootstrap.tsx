'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2, RotateCcw, ShieldAlert } from 'lucide-react'

interface Labels {
  openingTitle: string
  openingDescription: string
  unavailableTitle: string
  unavailableDescription: string
  retry: string
  backHome: string
}

const MANAGEMENT_SECRET_RE = /^[A-Za-z0-9_-]{40,64}$/

export default function EventGuestManagementBootstrap({
  labels,
}: {
  labels: Labels
}) {
  const secretRef = useRef<string | null>(null)
  const [status, setStatus] = useState<'opening' | 'unavailable'>('opening')
  const [hasSecret, setHasSecret] = useState(false)

  const exchange = useCallback(async (signal?: AbortSignal) => {
    const token = secretRef.current
    if (!token) {
      setStatus('unavailable')
      return
    }
    setStatus('opening')
    try {
      const response = await fetch('/guest/manage/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        credentials: 'same-origin',
        cache: 'no-store',
        signal,
      })
      const payload = (await response.json().catch(() => null)) as {
        redirectTo?: unknown
      } | null
      if (
        !response.ok ||
        typeof payload?.redirectTo !== 'string' ||
        !payload.redirectTo.startsWith('/events/')
      ) {
        setStatus('unavailable')
        return
      }
      window.location.replace(payload.redirectTo)
    } catch (error) {
      if ((error as { name?: string }).name !== 'AbortError') {
        setStatus('unavailable')
      }
    }
  }, [])

  useEffect(() => {
    const fragmentToken = window.location.hash.slice(1)
    const token = fragmentToken || secretRef.current || ''
    if (!MANAGEMENT_SECRET_RE.test(token)) {
      setHasSecret(false)
      setStatus('unavailable')
      return
    }
    secretRef.current = token
    setHasSecret(true)
    if (fragmentToken) {
      window.history.replaceState(null, '', '/guest/manage')
    }
    const controller = new AbortController()
    void exchange(controller.signal)
    return () => controller.abort()
  }, [exchange])

  const unavailable = status === 'unavailable'
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b0d12] px-4 py-12 text-white">
      <section
        aria-live="polite"
        aria-busy={!unavailable}
        className="w-full max-w-xl rounded-2xl border border-gray-800 bg-gray-950/80 p-6 text-center shadow-xl sm:p-8"
      >
        <div
          className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${
            unavailable
              ? 'bg-amber-500/10 text-amber-300'
              : 'bg-emerald-500/10 text-emerald-300'
          }`}
        >
          {unavailable ? (
            <ShieldAlert size={24} aria-hidden="true" />
          ) : (
            <Loader2 size={24} className="animate-spin" aria-hidden="true" />
          )}
        </div>
        <h1 className="text-xl font-bold">
          {unavailable ? labels.unavailableTitle : labels.openingTitle}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-400">
          {unavailable
            ? labels.unavailableDescription
            : labels.openingDescription}
        </p>
        {unavailable && (
          <div className="mt-6 flex flex-col-reverse justify-center gap-2 sm:flex-row">
            <Link
              href="/"
              className="inline-flex justify-center rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-300 transition-colors hover:border-gray-500"
            >
              {labels.backHome}
            </Link>
            <button
              type="button"
              onClick={() => {
                if (!secretRef.current) return
                void exchange()
              }}
              disabled={!hasSecret}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500"
            >
              <RotateCcw size={14} aria-hidden="true" />
              {labels.retry}
            </button>
          </div>
        )}
      </section>
    </main>
  )
}
