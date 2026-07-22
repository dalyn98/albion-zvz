'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import {
  UX_TELEMETRY_EVENT_TYPES,
  type UxTelemetryEventType,
  type UxTelemetrySurface,
  type UxWorkflowEventDetail,
} from '@/lib/ux-telemetry'

interface Props {
  enabled: boolean
  surface?: UxTelemetrySurface
}

const EVENT_TYPES = new Set<string>(UX_TELEMETRY_EVENT_TYPES)
const MAX_ELAPSED_MS = 30 * 60 * 1000
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
  if (pathname.startsWith('/admin/dashboard/events')) return 'admin_events'
  if (pathname.startsWith('/admin/dashboard/tactics')) return 'admin_tactics'
  if (
    pathname.startsWith('/admin/dashboard/regear') ||
    pathname.startsWith('/admin/dashboard/role-rewards')
  ) return 'admin_regear'
  if (
    pathname.startsWith('/admin/dashboard/exchanges') ||
    pathname.startsWith('/admin/dashboard/donations') ||
    pathname.startsWith('/admin/dashboard/settlements') ||
    pathname.startsWith('/admin/dashboard/siphon')
  ) return 'admin_finance'
  if (
    pathname.startsWith('/admin/dashboard/inventory') ||
    pathname.startsWith('/admin/dashboard/craft')
  ) return 'admin_inventory'
  if (pathname.startsWith('/admin/dashboard/permissions')) return 'admin_permissions'
  if (
    pathname.startsWith('/admin/dashboard/settings') ||
    pathname.startsWith('/admin/dashboard/guild-profile')
  ) return 'admin_settings'
  if (
    pathname.startsWith('/admin/dashboard/backup') ||
    pathname.startsWith('/admin/dashboard/audit') ||
    pathname.startsWith('/admin/dashboard/killbot') ||
    pathname.startsWith('/admin/dashboard/content-compliance') ||
    pathname.startsWith('/admin/dashboard/loot-audit')
  ) return 'admin_operations'
  if (pathname.startsWith('/craft/')) return 'craft'
  if (pathname.startsWith('/battles/')) return 'battles'
  if (pathname.startsWith('/leaderboard') || pathname.startsWith('/admin/dashboard/stats')) {
    return 'stats'
  }
  if (pathname.startsWith('/members/')) return 'members'
  if (pathname.startsWith('/market')) return 'market'
  if (pathname.startsWith('/shop')) return 'shop'
  if (pathname.startsWith('/regear')) return 'member_regear'
  if (pathname.startsWith('/onboard') || pathname.startsWith('/onboarding')) return 'onboarding'
  if (pathname === '/me' || pathname.startsWith('/me/')) return 'member_home'
  if (pathname.startsWith('/events/')) return 'event_login'
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
    const currentSurface = surface ?? surfaceForPath(pathname)
    if (!currentSurface) return
    flowIdRef.current = crypto.randomUUID()
    startedAtRef.current = performance.now()

    const record = (
      eventType: UxTelemetryEventType,
      metadata: Record<string, string> = {},
    ) => {
      const flowId = flowIdRef.current
      if (!flowId) return
      const elapsedMs = Math.min(
        MAX_ELAPSED_MS,
        Math.max(0, Math.round(performance.now() - startedAtRef.current)),
      )
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

    const onWorkflowEvent = (event: Event) => {
      const detail = (event as CustomEvent<UxWorkflowEventDetail>).detail
      if (!detail || !EVENT_TYPES.has(detail.eventType)) return
      record(detail.eventType, {
        viewport: viewportCategory(),
        ...(detail.metadata ?? {}),
      })
    }

    document.addEventListener('click', onClick)
    document.addEventListener('ux-workflow-event', onWorkflowEvent)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('ux-workflow-event', onWorkflowEvent)
    }
  }, [enabled, pathname, surface])

  return null
}
