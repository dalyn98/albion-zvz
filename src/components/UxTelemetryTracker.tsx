'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import {
  UX_TELEMETRY_EVENT_TYPES,
  type UxTelemetryEventType,
  type UxTelemetrySurface,
} from '@/lib/ux-telemetry'

interface Props {
  enabled: boolean
  surface?: UxTelemetrySurface
}

const EVENT_TYPES = new Set<string>(UX_TELEMETRY_EVENT_TYPES)
const DATASET_METADATA_KEYS = [
  ['uxTab', 'tab'],
  ['uxFilter', 'filter'],
  ['uxAction', 'action'],
  ['uxDetail', 'detail'],
  ['uxTarget', 'target'],
  ['uxLayout', 'layout'],
  ['uxResult', 'result'],
] as const

function surfaceForPath(pathname: string): UxTelemetrySurface | null {
  if (pathname.startsWith('/admin/dashboard/approvals')) return 'admin_approvals'
  if (pathname.startsWith('/admin/dashboard/shop')) return 'admin_shop'
  if (pathname === '/me' || pathname.startsWith('/me/')) return 'member_home'
  if (pathname === '/') return 'home_events'
  return null
}

function viewportCategory(): 'mobile' | 'desktop' {
  return window.matchMedia('(max-width: 1023px)').matches ? 'mobile' : 'desktop'
}

export default function UxTelemetryTracker({ enabled, surface }: Props) {
  const pathname = usePathname()
  const flowIdRef = useRef<string | null>(null)
  const startedAtRef = useRef(0)

  useEffect(() => {
    if (!enabled) return
    if (!flowIdRef.current) flowIdRef.current = crypto.randomUUID()
    if (startedAtRef.current === 0) startedAtRef.current = performance.now()

    const currentSurface = surface ?? surfaceForPath(pathname)
    if (!currentSurface) return

    const record = (
      eventType: UxTelemetryEventType,
      metadata: Record<string, string> = {},
    ) => {
      const flowId = flowIdRef.current
      if (!flowId) return
      const elapsedMs = Math.max(0, Math.round(performance.now() - startedAtRef.current))
      void fetch('/api/ux-events', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        keepalive: true,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventType,
          surface: currentSurface,
          flowId,
          elapsedMs,
          metadata,
        }),
      }).catch(() => undefined)
    }

    record('surface_view', { viewport: viewportCategory() })

    const onClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const tracked = target.closest<HTMLElement>('[data-ux-event]')
      if (!tracked) return
      const eventType = tracked.dataset.uxEvent
      if (!eventType || !EVENT_TYPES.has(eventType)) return

      const metadata: Record<string, string> = { viewport: viewportCategory() }
      for (const [datasetKey, metadataKey] of DATASET_METADATA_KEYS) {
        const value = tracked.dataset[datasetKey]
        if (value) metadata[metadataKey] = value
      }
      record(eventType as UxTelemetryEventType, metadata)
    }

    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [enabled, pathname, surface])

  return null
}
