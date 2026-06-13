import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession, sessionHas } from '@/lib/session'
import {
  listMembersDirectoryCounts,
  listMembersDirectoryTab,
  type MembersDirectoryTab,
} from '@/app/actions/members-admin'
import MembersPageTabs from '@/components/MembersPageTabs'
import { getSessionGuildId } from '@/lib/tenant'
import { getTenantTimezone } from '@/lib/timezone-server'
import { CAP } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

interface MembersPageProps {
  searchParams: Promise<{ tab?: string | string[] }>
}

function resolveInitialTab(raw: string | string[] | undefined): MembersDirectoryTab {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value === 'guests' || value === 'roster' || value === 'withdrawn') return value
  return 'members'
}

export default async function MembersPage({ searchParams }: MembersPageProps) {
  const session = await getSession()
  if (!session) {
    redirect('/api/auth/discord/start?returnTo=/members')
  }

  const sp = await searchParams
  const guildId = await getSessionGuildId(session)
  const initialTab = resolveInitialTab(sp.tab)
  const [
    directory,
    counts,
    t,
    timezone,
  ] = await Promise.all([
    listMembersDirectoryTab(initialTab),
    listMembersDirectoryCounts(),
    getTranslations('members'),
    getTenantTimezone(guildId),
  ])

  return (
    <main className="flex-1 w-full max-w-3xl xl:max-w-6xl 2xl:max-w-7xl mx-auto px-4 py-6 sm:py-8 space-y-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">{t('title')}</h1>
        <p className="text-gray-400 text-xs sm:text-sm mt-1">{t('description')}</p>
      </div>

      <MembersPageTabs
        members={directory.members}
        guests={directory.guests}
        withdrawnMembers={directory.withdrawnMembers}
        roster={directory.roster}
        membersError={directory.membersError}
        guestsError={directory.guestsError}
        withdrawnError={directory.withdrawnError}
        rosterError={directory.rosterError}
        counts={counts}
        initialLoadedTab={initialTab}
        canManageGuests={sessionHas(session, CAP.MEMBERS_MANAGE)}
        timezone={timezone}
      />
    </main>
  )
}
