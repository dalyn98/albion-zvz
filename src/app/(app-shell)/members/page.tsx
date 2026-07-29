import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { sessionHas } from '@/lib/session'
import { listGuildMembers } from '@/app/actions/members-admin'
import GuildMemberList from '@/components/GuildMemberList'
import { CAP } from '@/lib/permissions'
import { PageHeader, WorkbenchSurface } from '@/components/ui-patterns'
import { buildLoginEntryHref } from '@/lib/login-entry'
import { requireLiveSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function MembersPage() {
  const session = await requireLiveSession().catch(() => null)
  if (!session) {
    redirect(buildLoginEntryHref({
      returnTo: '/members',
    }))
  }
  if (!session.isMember) redirect('/')

  const [{ members, error }, t] = await Promise.all([
    listGuildMembers(),
    getTranslations('members'),
  ])

  return (
    <main className="flex-1 w-full max-w-3xl xl:max-w-6xl 2xl:max-w-7xl mx-auto px-4 py-6 sm:py-8 space-y-4">
      <PageHeader title={t('title')} description={t('description')} />

      <WorkbenchSurface>
        <div className="space-y-4">
          {sessionHas(session, CAP.MEMBERS_MANAGE) && (
            <div className="flex justify-end">
              <Link
                href="/admin/dashboard/members"
                className="text-xs font-semibold text-amber-300 hover:text-amber-200"
              >
                {t('openOperationsDirectory')}
              </Link>
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
          {members.length === 0 && !error ? (
            <p className="py-8 text-center text-sm text-gray-500">{t('none')}</p>
          ) : (
            <GuildMemberList members={members} />
          )}
        </div>
      </WorkbenchSurface>
    </main>
  )
}
