'use client'

import { useEffect } from 'react'
import { acquireBodyScrollLock } from '@/lib/body-scroll-lock'

export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return

    return acquireBodyScrollLock()
  }, [locked])
}
