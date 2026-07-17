'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { didEventSnapshotChange } from '@/lib/event-state-snapshot'

interface Props {
  intervalMs: number
  resourceUrl?: string
  initialFingerprint?: string | null
}

interface SnapshotPayload {
  fingerprint: string
  shouldPoll: boolean
}

export default function AutoRefresh({
  intervalMs,
  resourceUrl,
  initialFingerprint = null,
}: Props) {
  const router = useRouter()
  const fingerprintRef = useRef<string | null>(initialFingerprint)

  useEffect(() => {
    // Pause polling when the tab is hidden so we don't burn bandwidth on an
    // unfocused event page (phones backgrounded in raid prep, etc).
    let timer: ReturnType<typeof setTimeout> | null = null
    let stopped = false
    let inFlight = false
    const controller = new AbortController()

    const check = async () => {
      if (stopped || inFlight || document.visibilityState !== 'visible') return
      if (!resourceUrl) {
        router.refresh()
        return
      }

      inFlight = true
      try {
        const response = await fetch(resourceUrl, {
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
        })
        if (!response.ok) return
        const payload = (await response.json()) as SnapshotPayload
        if (typeof payload.fingerprint !== 'string') return
        const changed = didEventSnapshotChange(
          fingerprintRef.current,
          payload.fingerprint,
        )
        fingerprintRef.current = payload.fingerprint
        if (changed) router.refresh()
        if (payload.shouldPoll === false) stop()
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          console.warn('[AutoRefresh] snapshot check failed:', error)
        }
      } finally {
        inFlight = false
      }
    }

    const start = () => {
      if (timer !== null) return
      timer = setTimeout(async function tick() {
        timer = null
        await check()
        if (!stopped && document.visibilityState === 'visible') start()
      }, intervalMs)
    }
    const stop = () => {
      stopped = true
      if (timer === null) return
      clearTimeout(timer)
      timer = null
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        stopped = false
        void check()
        start()
      } else {
        stop()
      }
    }

    if (document.visibilityState === 'visible') {
      void check()
      start()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stop()
      controller.abort()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [router, intervalMs, resourceUrl])

  return null
}
