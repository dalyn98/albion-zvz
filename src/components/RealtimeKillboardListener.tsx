'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface RealtimeKillboardListenerProps {
  guildId: string
  minRefreshIntervalMs?: number
}

const DEFAULT_MIN_REFRESH_INTERVAL_MS = 60_000

// 길드 killboard 채널 구독 → 새 kill insert broadcast 가 오면 RSC 를 invalidate
// 해 최신 데이터로 자동 refetch. UI 가 직접 새 row 를 합치는 게 아니라 서버
// 컴포넌트의 데이터 fetch 를 한 번 더 돌리는 방식 — 데이터 모델·정렬·필터링이
// 모두 RSC 한 곳에 머무르므로 sync 로직이 한 군데로 통일된다.
export default function RealtimeKillboardListener({
  guildId,
  minRefreshIntervalMs = DEFAULT_MIN_REFRESH_INTERVAL_MS,
}: RealtimeKillboardListenerProps) {
  const router = useRouter()
  const lastRefreshAtRef = useRef(0)
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const missedWhileHiddenRef = useRef(false)

  useEffect(() => {
    if (!guildId) return

    const clearPending = () => {
      if (pendingTimerRef.current === null) return
      clearTimeout(pendingTimerRef.current)
      pendingTimerRef.current = null
    }
    const refreshNow = () => {
      clearPending()
      if (document.visibilityState !== 'visible') {
        missedWhileHiddenRef.current = true
        return
      }
      lastRefreshAtRef.current = Date.now()
      missedWhileHiddenRef.current = false
      router.refresh()
    }
    const scheduleRefresh = () => {
      if (document.visibilityState !== 'visible') {
        missedWhileHiddenRef.current = true
        return
      }
      const elapsedMs = Date.now() - lastRefreshAtRef.current
      if (elapsedMs >= minRefreshIntervalMs) {
        refreshNow()
        return
      }
      if (pendingTimerRef.current !== null) return
      pendingTimerRef.current = setTimeout(refreshNow, minRefreshIntervalMs - elapsedMs)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && missedWhileHiddenRef.current) {
        scheduleRefresh()
      } else if (document.visibilityState !== 'visible') {
        if (pendingTimerRef.current !== null) {
          missedWhileHiddenRef.current = true
        }
        clearPending()
      }
    }

    const channel = supabase
      .channel(`killboard:${guildId}`)
      .on('broadcast', { event: 'insert' }, () => {
        scheduleRefresh()
      })
      .subscribe()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      clearPending()
      document.removeEventListener('visibilitychange', onVisibility)
      supabase.removeChannel(channel)
    }
  }, [guildId, minRefreshIntervalMs, router])

  return null
}
