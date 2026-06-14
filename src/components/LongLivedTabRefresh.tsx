'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  ASSET_RELOAD_THROTTLE_MS,
  DEFAULT_LONG_LIVED_TAB_REFRESH_MS,
  shouldRefreshLongLivedTab,
  shouldReloadForAssetError,
} from '@/lib/long-lived-tab-refresh'

const ASSET_RELOAD_STORAGE_KEY = 'agm:last-asset-reload-at'

interface LongLivedTabRefreshProps {
  staleMs?: number
}

export default function LongLivedTabRefresh({
  staleMs = DEFAULT_LONG_LIVED_TAB_REFRESH_MS,
}: LongLivedTabRefreshProps) {
  const router = useRouter()
  const lastRefreshAtRef = useRef<number | null>(null)

  useEffect(() => {
    const refreshIfStale = () => {
      if (document.visibilityState !== 'visible') return

      const now = Date.now()
      if (lastRefreshAtRef.current === null) {
        lastRefreshAtRef.current = now
        return
      }
      if (!shouldRefreshLongLivedTab(lastRefreshAtRef.current, now, staleMs)) return

      lastRefreshAtRef.current = now
      router.refresh()
    }

    const reloadForAssetError = (error: unknown) => {
      const now = Date.now()
      const lastReloadAt = readLastAssetReloadAt()
      if (!shouldReloadForAssetError({
        error,
        lastReloadAt,
        now,
        throttleMs: ASSET_RELOAD_THROTTLE_MS,
      })) {
        return
      }

      writeLastAssetReloadAt(now)
      window.location.reload()
    }

    const onVisibility = () => refreshIfStale()
    const onFocus = () => refreshIfStale()
    const onOnline = () => refreshIfStale()
    const onError = (event: ErrorEvent) => {
      reloadForAssetError(event.error ?? event.message)
    }
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      reloadForAssetError(event.reason)
    }

    lastRefreshAtRef.current = Date.now()

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onOnline)
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
  }, [router, staleMs])

  return null
}

function readLastAssetReloadAt(): number {
  try {
    const value = window.sessionStorage.getItem(ASSET_RELOAD_STORAGE_KEY)
    return value ? Number(value) || 0 : 0
  } catch {
    return 0
  }
}

function writeLastAssetReloadAt(value: number): void {
  try {
    window.sessionStorage.setItem(ASSET_RELOAD_STORAGE_KEY, String(value))
  } catch {
    // Reload is still useful if sessionStorage is blocked.
  }
}
