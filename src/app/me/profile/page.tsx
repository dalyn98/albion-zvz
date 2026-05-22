import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getMyMemberDetail } from '@/app/actions/members-admin-detail'
import MemberDetailView from '@/components/MemberDetailView'

export const dynamic = 'force-dynamic'

export default async function MyProfilePage() {
  const session = await getSession()
  if (!session) {
    redirect('/api/auth/discord/start?returnTo=/me/profile')
  }

  const [{ detail, error }, t] = await Promise.all([
    getMyMemberDetail(),
    getTranslations('myProfile'),
  ])

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {!detail && !error && (
        <p className="text-gray-500 text-sm text-center py-12">{t('notRegistered')}</p>
      )}

      {detail && (
        <MemberDetailView
          detail={detail}
          showDiscordId={false}
          allowIdentityRefresh
        />
      )}
    </main>
  )
}
