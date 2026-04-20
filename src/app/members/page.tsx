import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import {
  listGuildMembers,
  listGuildGuests,
  getGuildAggregateStats,
} from '@/app/actions/members-admin'
import MembersPageTabs from '@/components/MembersPageTabs'
import GuildAggregateHeader from '@/components/GuildAggregateHeader'

export const dynamic = 'force-dynamic'

export default async function MembersPage() {
  const session = await getSession()
  if (!session) {
    redirect('/api/auth/discord/start?returnTo=/members')
  }

  const [{ members, error: membersError }, { guests, error: guestsError }, { stats }, t] =
    await Promise.all([
      listGuildMembers(),
      listGuildGuests(),
      getGuildAggregateStats(),
      getTranslations('members'),
    ])

  return (
    <main className="flex-1 w-full max-w-3xl xl:max-w-6xl 2xl:max-w-7xl mx-auto px-4 py-6 sm:py-8 space-y-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">{t('title')}</h1>
        <p className="text-gray-400 text-xs sm:text-sm mt-1">{t('description')}</p>
      </div>

      {stats && <GuildAggregateHeader stats={stats} />}

      <MembersPageTabs
        members={members}
        guests={guests}
        membersError={membersError}
        guestsError={guestsError}
        isAdmin={session.isAdmin}
      />
    </main>
  )
}
