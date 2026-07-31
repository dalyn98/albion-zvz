'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { AdminBadgeCounts } from '@/lib/admin-badges'
import type { SessionPayload } from '@/lib/session'
import { shouldRefreshSessionOnActivity } from '@/lib/session-refresh-policy'
import AppSidebar from './AppSidebar'
import MemberGuidedTour from './MemberGuidedTour'
import UserStatusChip, { type UserStatusSummary } from './UserStatusChip'
import UxTelemetryTracker from './UxTelemetryTracker'
import { getAppAreaDescriptor, resolveAppArea } from '@/lib/app-route-registry'

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
  regearSupported: boolean
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
  multiGuildAvailable: boolean
  tacticsExperimentalEnabled: boolean
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
  regearSupported,
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
  multiGuildAvailable,
  tacticsExperimentalEnabled,
}: Props) {
  const tSidebar = useTranslations('sidebar')
  const tNav = useTranslations('nav')
  const pathname = usePathname()
  const activeArea = resolveAppArea(pathname || '/') ?? 'today'
  const activeSurface = getAppAreaDescriptor(activeArea).surface
  const activeAudience = pathname?.startsWith('/admin/dashboard')
    ? 'operator'
    : 'member'
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
      className={`visual-refresh-v3 visual-refresh-v4 flex min-h-screen w-full flex-col lg:flex-row${uxRefreshEnabled ? ' ux-refresh-v2' : ''}`}
      data-visual-refresh="v4"
      data-legacy-visual-rollout={visualRefreshEnabled ? 'enabled' : 'retired'}
    >
      <UxTelemetryTracker enabled={Boolean(session)} />
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
        regearSupported={regearSupported}
        publicProfileHref={publicProfileHref}
        landingHref={landingHref}
        docsHref={docsHref}
        publicBattlesHref={publicBattlesHref}
        userStatus={status.userStatus}
        allianceEventAllowed={allianceEventAllowed}
        allianceContentComplianceVisible={allianceContentComplianceVisible}
        visualRefreshEnabled
        memberTourAvailable={Boolean(memberTourScope)}
        multiGuildAvailable={multiGuildAvailable}
        tacticsExperimentalEnabled={tacticsExperimentalEnabled}
      />
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="v4-command-bar hidden lg:flex sticky top-0 z-20 h-12 items-center justify-between gap-4 border-b border-border bg-background/90 px-5 backdrop-blur-md">
          <div className="flex min-w-0 items-center gap-2 text-xs">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent shadow-[0_0_10px_var(--color-accent)]" />
            <span className="truncate font-semibold text-foreground">{brandName}</span>
            <span className="text-faint" aria-hidden="true">/</span>
            <span className="font-medium text-accent-soft-foreground">{tNav(activeArea)}</span>
            <span className="text-faint" aria-hidden="true">/</span>
            <span className="truncate text-subtle">
              {activeAudience === 'operator'
                ? tSidebar('guildOperations')
                : tSidebar('myWork')}
            </span>
          </div>
          <div className="flex min-w-0 items-center justify-end gap-3">
            {status.userStatus && (
              <UserStatusChip summary={status.userStatus} tourId="member-tour-status-chip" />
            )}
            {!status.userStatus && reserveStatusSlot && (
              <span className="text-[11px] text-subtle">{tNav(activeArea)}</span>
            )}
          </div>
        </div>
        <div
          id="app-main-content"
          tabIndex={-1}
          data-app-area={activeArea}
          data-app-surface={activeSurface}
          className="v4-page-frame flex min-w-0 flex-1 flex-col pb-20 lg:pb-0"
        >
          {children}
        </div>
      </div>
      {memberTourScope && (
        <MemberGuidedTour
          storageScope={memberTourScope}
          eventDetailHref={null}
          visualRefreshEnabled
        />
      )}
    </div>
  )
}
