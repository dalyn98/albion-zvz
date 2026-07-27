'use client'

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import {
  classifyServerActionClientError,
  getServerActionClientErrorMessage,
} from '@/lib/server-action-client-error'
import { emitUxWorkflowEvent } from '@/lib/ux-telemetry'
import { useToast } from './ToastProvider'

const DEDUPE_WINDOW_MS = 1500

export default function ServerActionFailureNotifier() {
  const t = useTranslations('errors')
  const toast = useToast()
  const lastNoticeRef = useRef<{ kind: string; at: number } | null>(null)

  useEffect(() => {
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const kind = classifyServerActionClientError(event.reason)
      if (!kind) return

      const now = Date.now()
      const previous = lastNoticeRef.current
      if (
        previous &&
        previous.kind === kind &&
        now - previous.at < DEDUPE_WINDOW_MS
      ) {
        return
      }
      lastNoticeRef.current = { kind, at: now }

      toast.error(
        getServerActionClientErrorMessage(event.reason, {
          expired: t('actionExpired'),
          fallback: t('actionFailed'),
        }),
        7000,
      )
      emitUxWorkflowEvent({
        eventType: 'partial_failed',
        metadata: {
          workflow: 'server_action',
          stage: 'client',
          reason: kind,
        },
      })
    }

    window.addEventListener('unhandledrejection', onUnhandledRejection)
    return () => window.removeEventListener('unhandledrejection', onUnhandledRejection)
  }, [t, toast])

  return null
}
