import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession, sessionHas } from '@/lib/session'
import { listMembersDirectory } from '@/app/actions/members-admin'
import MembersPageTabs from '@/components/MembersPageTabs'
import { getSessionGuildId } from '@/lib/tenant'
import { getTenantTimezone } from '@/lib/timezone-server'
import { CAP } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export default async function MembersPage() {
  const session = await getSession()
  if (!session) {
    redirect('/api/auth/discord/start?returnTo=/members')
  }

  const guildId = await getSessionGuildId(session)
  const [
    {
      members,
      guests,
      withdrawnMembers,
      roster,
      membersError,
      guestsError,
      withdrawnError,
      rosterError,
    },
    t,
    timezone,
  ] = await Promise.all([
    listMembersDirectory(),
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
        members={members}
        guests={guests}
        withdrawnMembers={withdrawnMembers}
        roster={roster}
        membersError={membersError}
        guestsError={guestsError}
        withdrawnError={withdrawnError}
        rosterError={rosterError}
        canManageGuests={sessionHas(session, CAP.MEMBERS_MANAGE)}
        timezone={timezone}
      />
    </main>
  )
}
