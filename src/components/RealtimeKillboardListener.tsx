'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface RealtimeKillboardListenerProps {
  guildId: string
}

// 길드 killboard 채널 구독 → 새 kill insert broadcast 가 오면 RSC 를 invalidate
// 해 최신 데이터로 자동 refetch. UI 가 직접 새 row 를 합치는 게 아니라 서버
// 컴포넌트의 데이터 fetch 를 한 번 더 돌리는 방식 — 데이터 모델·정렬·필터링이
// 모두 RSC 한 곳에 머무르므로 sync 로직이 한 군데로 통일된다.
export default function RealtimeKillboardListener({
  guildId,
}: RealtimeKillboardListenerProps) {
  const router = useRouter()

  useEffect(() => {
    if (!guildId) return
    const channel = supabase
      .channel(`killboard:${guildId}`)
      .on('broadcast', { event: 'insert' }, () => {
        router.refresh()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [guildId, router])

  return null
}
