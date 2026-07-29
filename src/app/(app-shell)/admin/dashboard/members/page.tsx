import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import {
  listMembersDirectoryCounts,
  listMembersDirectoryTab,
  type MembersDirectoryTab,
} from '@/app/actions/members-admin'
import MembersPageTabs from '@/components/MembersPageTabs'
import { PageHeader, WorkbenchSurface } from '@/components/ui-patterns'
import { requireLiveSession } from '@/lib/auth'
import { CAP } from '@/lib/permissions'
import { sessionHas } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getTenantTimezone } from '@/lib/timezone-server'
import AlbionVerificationSection from '@/app/(app-shell)/admin/dashboard/stats/_components/AlbionVerificationSection'

export const dynamic = 'force-dynamic'

const OPERATIONS_TABS = [
  'roster',
  'guests',
  'withdrawn',
] as const satisfies readonly MembersDirectoryTab[]

interface MemberOperationsPageProps {
  searchParams: Promise<{ tab?: string | string[] }>
}

function resolveInitialTab(
  raw: string | string[] | undefined,
): (typeof OPERATIONS_TABS)[number] {
  const value = Array.isArray(raw) ? raw[0] : raw
  return value === 'guests' || value === 'withdrawn' ? value : 'roster'
}

export default async function MemberOperationsPage({
  searchParams,
}: MemberOperationsPageProps) {
  const [session, params] = await Promise.all([
    requireLiveSession().catch(() => null),
    searchParams,
  ])
  if (!session) redirect('/login?returnTo=%2Fadmin%2Fdashboard%2Fmembers')
  if (!sessionHas(session, CAP.MEMBERS_MANAGE)) redirect('/admin/dashboard')

  const guildId = await getSessionGuildId(session)
  const initialTab = resolveInitialTab(params.tab)
  const [directory, counts, timezone, t, tStats, tCommon] = await Promise.all([
    listMembersDirectoryTab(initialTab),
    listMembersDirectoryCounts(),
    getTenantTimezone(guildId),
    getTranslations('members'),
    getTranslations('stats'),
    getTranslations('common'),
  ])

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-4 px-4 py-6 sm:py-8">
      <PageHeader
        title={t('operationsTitle')}
        description={t('operationsDescription')}
      />
      <AlbionVerificationSection tStats={tStats} tCommon={tCommon} />
      <WorkbenchSurface>
        <MembersPageTabs
          members={[]}
          guests={directory.guests}
          withdrawnMembers={directory.withdrawnMembers}
          roster={directory.roster}
          guestsError={directory.guestsError}
          withdrawnError={directory.withdrawnError}
          rosterError={directory.rosterError}
          counts={counts}
          initialLoadedTab={initialTab}
          visibleTabs={OPERATIONS_TABS}
          canManageGuests
          timezone={timezone}
          memberHrefPrefix="/admin/dashboard/members"
          albionMemberHrefPrefix="/admin/dashboard/members/albion"
        />
      </WorkbenchSurface>
    </main>
  )
}
