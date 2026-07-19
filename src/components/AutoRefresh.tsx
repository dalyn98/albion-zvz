'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  resolveEventSnapshotPollAction,
  resolveEventSnapshotPollDelayMs,
} from '@/lib/event-state-snapshot'

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
    // Only a completed server render confirms that the visible RSC payload has
    // caught up with this fingerprint. A failed router.refresh() therefore
    // leaves the previous baseline intact and the next poll retries it.
    fingerprintRef.current = initialFingerprint
  }, [initialFingerprint])

  useEffect(() => {
    // Pause polling when the tab is hidden so we don't burn bandwidth on an
    // unfocused event page (phones backgrounded in raid prep, etc).
    let timer: ReturnType<typeof setTimeout> | null = null
    let stopped = false
    let inFlight = false
    let nextDelayMs = intervalMs
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
        if (!response.ok) {
          nextDelayMs = resolveEventSnapshotPollDelayMs({
            responseStatus: response.status,
            retryAfter: response.headers.get('Retry-After'),
            intervalMs,
          })
          const action = resolveEventSnapshotPollAction({
            responseStatus: response.status,
            confirmedFingerprint: fingerprintRef.current,
          })
          if (action === 'refresh') router.refresh()
          return
        }
        nextDelayMs = intervalMs
        const payload = (await response.json()) as SnapshotPayload
        const action = resolveEventSnapshotPollAction({
          responseStatus: response.status,
          confirmedFingerprint: fingerprintRef.current,
          nextFingerprint: payload.fingerprint,
          shouldPoll: payload.shouldPoll,
        })
        if (action === 'refresh') router.refresh()
        if (action === 'stop') stop()
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
      }, nextDelayMs)
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
        void check().finally(() => {
          if (!stopped && document.visibilityState === 'visible') start()
        })
      } else {
        stop()
      }
    }

    if (document.visibilityState === 'visible') {
      void check().finally(() => {
        if (!stopped && document.visibilityState === 'visible') start()
      })
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
