'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { AdminBadgeCounts } from '@/lib/admin-badges'
import type { SessionPayload } from '@/lib/session'
import { shouldRefreshSessionOnActivity } from '@/lib/session-refresh-policy'
import AppSidebar from './AppSidebar'
import MemberGuidedTour from './MemberGuidedTour'
import UserStatusChip, { type UserStatusSummary } from './UserStatusChip'
import UxTelemetryTracker from './UxTelemetryTracker'

interface AppShellStatusPayload {
  adminBadges: AdminBadgeCounts | null
  userStatus: UserStatusSummary | null
}

interface Props {
  children: React.ReactNode
  session: SessionPayload | null
  brandName: string
  isSuperAdmin: boolean
  canSeeAdminNav: boolean
  superAdminPath: string | null
  craftQueueVisible: boolean
  craftAdminVisible: boolean
  craftOrdersVisible: boolean
  publicProfileHref: string | null
  landingHref: string
  docsHref: string
  publicBattlesHref: string
  allianceEventAllowed: boolean
  allianceContentComplianceVisible: boolean
  memberTourScope: string | null
  reserveStatusSlot: boolean
  uxRefreshEnabled: boolean
  visualRefreshEnabled: boolean
}

export default function AppShellClientChrome({
  children,
  session,
  brandName,
  isSuperAdmin,
  canSeeAdminNav,
  superAdminPath,
  craftQueueVisible,
  craftAdminVisible,
  craftOrdersVisible,
  publicProfileHref,
  landingHref,
  docsHref,
  publicBattlesHref,
  allianceEventAllowed,
  allianceContentComplianceVisible,
  memberTourScope,
  reserveStatusSlot,
  uxRefreshEnabled,
  visualRefreshEnabled,
}: Props) {
  const tSidebar = useTranslations('sidebar')
  const [status, setStatus] = useState<AppShellStatusPayload>({
    adminBadges: null,
    userStatus: null,
  })
  const effectiveSessionIssuedAtRef = useRef(session?.issuedAt ?? 0)
  const lastSessionRefreshAttemptAtRef = useRef(0)
  const sessionRefreshInFlightRef = useRef(false)

  useEffect(() => {
    effectiveSessionIssuedAtRef.current = session?.issuedAt ?? 0
    lastSessionRefreshAttemptAtRef.current = 0
  }, [session?.issuedAt])

  useEffect(() => {
    if (!session) return
    const controller = new AbortController()
    fetch('/api/app-shell/status', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`status ${response.status}`)
        return response.json() as Promise<AppShellStatusPayload>
      })
      .then((payload) => setStatus(payload))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.warn('[AppShell] failed to load status payload:', error)
      })
    return () => controller.abort()
  }, [session])

  useEffect(() => {
    if (!session || session.isGuest || session.isLocalGuildAccount || !session.guildId) return

    const controller = new AbortController()
    const refreshOnActivity = () => {
      if (document.visibilityState !== 'visible' || sessionRefreshInFlightRef.current) return

      const now = Date.now()
      if (!shouldRefreshSessionOnActivity({
        issuedAt: effectiveSessionIssuedAtRef.current,
        lastAttemptAt: lastSessionRefreshAttemptAtRef.current,
        now,
      })) {
        return
      }

      lastSessionRefreshAttemptAtRef.current = now
      sessionRefreshInFlightRef.current = true
      void fetch('/api/auth/refresh-session', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'x-agm-session-refresh': '1' },
        signal: controller.signal,
      })
        .then((response) => {
          if (!response.ok) throw new Error(`session refresh ${response.status}`)
          effectiveSessionIssuedAtRef.current = now
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return
          console.warn('[AppShell] activity session refresh failed:', error)
        })
        .finally(() => {
          sessionRefreshInFlightRef.current = false
        })
    }

    refreshOnActivity()
    const onVisibility = () => refreshOnActivity()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', refreshOnActivity)
    window.addEventListener('pointerdown', refreshOnActivity, { passive: true })
    window.addEventListener('keydown', refreshOnActivity)

    return () => {
      controller.abort()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', refreshOnActivity)
      window.removeEventListener('pointerdown', refreshOnActivity)
      window.removeEventListener('keydown', refreshOnActivity)
    }
  }, [session])

  return (
    <div
      className={`flex min-h-screen w-full flex-col lg:flex-row${uxRefreshEnabled ? ' ux-refresh-v2' : ''}${visualRefreshEnabled ? ' visual-refresh-v3' : ''}`}
      data-visual-refresh={visualRefreshEnabled ? 'v3' : undefined}
    >
      <UxTelemetryTracker enabled={uxRefreshEnabled} />
      <a
        href="#app-main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[300] focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-accent-foreground"
      >
        {tSidebar('skipToContent')}
      </a>
      <AppSidebar
        session={session}
        adminBadges={status.adminBadges}
        brandName={brandName}
        isSuperAdmin={isSuperAdmin}
        canSeeAdminNav={canSeeAdminNav}
        superAdminPath={superAdminPath}
        craftQueueVisible={craftQueueVisible}
        craftAdminVisible={craftAdminVisible}
        craftOrdersVisible={craftOrdersVisible}
        publicProfileHref={publicProfileHref}
        landingHref={landingHref}
        docsHref={docsHref}
        publicBattlesHref={publicBattlesHref}
        userStatus={status.userStatus}
        allianceEventAllowed={allianceEventAllowed}
        allianceContentComplianceVisible={allianceContentComplianceVisible}
        visualRefreshEnabled={visualRefreshEnabled}
      />
      <div className="flex-1 min-w-0 flex flex-col">
        {(reserveStatusSlot || status.userStatus) && (
          <div className="hidden lg:flex sticky top-0 z-20 h-12 items-center justify-end border-b border-border bg-background/90 px-4 backdrop-blur-md">
            {status.userStatus && (
              <UserStatusChip summary={status.userStatus} tourId="member-tour-status-chip" />
            )}
          </div>
        )}
        <div id="app-main-content" tabIndex={-1} className="flex min-w-0 flex-1 flex-col pb-20 lg:pb-0">
          {children}
        </div>
      </div>
      {memberTourScope && (
        <MemberGuidedTour
          storageScope={memberTourScope}
          eventDetailHref={null}
          visualRefreshEnabled={visualRefreshEnabled}
        />
      )}
    </div>
  )
}
