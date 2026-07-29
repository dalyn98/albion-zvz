import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getAlbionMemberDetail } from '@/app/actions/members-admin-detail'
import AlbionMemberDetailView from '@/components/AlbionMemberDetailView'
import { requireLiveSession } from '@/lib/auth'
import { CAP } from '@/lib/permissions'
import { sessionHas } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getTenantTimezone } from '@/lib/timezone-server'

export const dynamic = 'force-dynamic'

export default async function ManagedAlbionMemberDetailPage({
  params,
}: {
  params: Promise<{ playerId: string }>
}) {
  const [{ playerId }, session] = await Promise.all([
    params,
    requireLiveSession().catch(() => null),
  ])
  if (!session) {
    redirect(
      `/login?returnTo=${encodeURIComponent(
        `/admin/dashboard/members/albion/${playerId}`,
      )}`,
    )
  }
  if (!sessionHas(session, CAP.MEMBERS_MANAGE)) {
    redirect('/admin/dashboard')
  }

  const guildId = await getSessionGuildId(session)
  const [{ detail, error }, t, timezone] = await Promise.all([
    getAlbionMemberDetail(playerId),
    getTranslations('albionMemberDetail'),
    getTenantTimezone(guildId),
  ])
  if (!detail && !error) notFound()

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6 sm:py-8">
      <Link
        href="/admin/dashboard/members"
        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-white"
      >
        <ArrowLeft size={13} />
        {t('backToRoster')}
      </Link>
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}
      {detail && <AlbionMemberDetailView detail={detail} timezone={timezone} />}
    </main>
  )
}
