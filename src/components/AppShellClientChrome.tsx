'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { AdminBadgeCounts } from '@/lib/admin-badges'
import type { SessionPayload } from '@/lib/session'
import AppSidebar from './AppSidebar'
import MemberGuidedTour from './MemberGuidedTour'
import UserStatusChip, { type UserStatusSummary } from './UserStatusChip'

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
  memberTourScope: string | null
  reserveStatusSlot: boolean
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
  memberTourScope,
  reserveStatusSlot,
}: Props) {
  const tSidebar = useTranslations('sidebar')
  const [status, setStatus] = useState<AppShellStatusPayload>({
    adminBadges: null,
    userStatus: null,
  })

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

  return (
    <div className="flex flex-col lg:flex-row min-h-screen w-full">
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
      />
      <div className="flex-1 min-w-0 flex flex-col">
        {(reserveStatusSlot || status.userStatus) && (
          <div className="hidden lg:flex sticky top-0 z-20 h-12 items-center justify-end border-b border-border bg-background/90 px-4 backdrop-blur-md">
            {status.userStatus && (
              <UserStatusChip summary={status.userStatus} tourId="member-tour-status-chip" />
            )}
          </div>
        )}
        <div id="app-main-content" tabIndex={-1} className="flex min-w-0 flex-1 flex-col">
          {children}
        </div>
      </div>
      {memberTourScope && (
        <MemberGuidedTour
          storageScope={memberTourScope}
          eventDetailHref={null}
        />
      )}
    </div>
  )
}
