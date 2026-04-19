'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  intervalMs: number
}

export default function AutoRefresh({ intervalMs }: Props) {
  const router = useRouter()

  useEffect(() => {
    // Pause polling when the tab is hidden so we don't burn bandwidth on an
    // unfocused event page (phones backgrounded in raid prep, etc).
    let timer: ReturnType<typeof setInterval> | null = null

    const start = () => {
      if (timer !== null) return
      timer = setInterval(() => router.refresh(), intervalMs)
    }
    const stop = () => {
      if (timer === null) return
      clearInterval(timer)
      timer = null
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        router.refresh()
        start()
      } else {
        stop()
      }
    }

    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [router, intervalMs])

  return null
}
