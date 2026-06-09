import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAlbionMemberDetail } from '@/app/actions/members-admin-detail'
import AlbionMemberDetailView from '@/components/AlbionMemberDetailView'
import { getTenantTimezone } from '@/lib/timezone-server'

export const dynamic = 'force-dynamic'

export default async function AlbionMemberDetailPage({
  params,
}: {
  params: Promise<{ playerId: string }>
}) {
  const { playerId } = await params

  const session = await getSession()
  if (!session) {
    redirect(`/api/auth/discord/start?returnTo=/members/albion/${playerId}`)
  }

  const guildId = await getSessionGuildId(session)
  const [{ detail, error }, t, timezone] = await Promise.all([
    getAlbionMemberDetail(playerId),
    getTranslations('albionMemberDetail'),
    getTenantTimezone(guildId),
  ])
  if (!detail && !error) notFound()

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/members?tab=roster"
          className="inline-flex items-center gap-1 text-gray-400 hover:text-white text-xs"
        >
          <ArrowLeft size={13} />
          {t('backToRoster')}
        </Link>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {detail && <AlbionMemberDetailView detail={detail} timezone={timezone} />}
    </main>
  )
}
