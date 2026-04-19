import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getGuildMemberDetail } from '@/app/actions/members-admin'
import MemberDetailView from '@/components/MemberDetailView'
import AdminPointAdjuster from '@/components/AdminPointAdjuster'

export const dynamic = 'force-dynamic'

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ discordId: string }>
}) {
  const { discordId } = await params

  const session = await getSession()
  if (!session) {
    redirect(`/api/auth/discord/start?returnTo=/members/${discordId}`)
  }

  const [{ detail, error }, t] = await Promise.all([
    getGuildMemberDetail(discordId),
    getTranslations('members'),
  ])
  if (!detail && !error) notFound()

  // 포인트 수동 조정 UI는 관리자에게만 노출. 일반 길드원은 자기 자신의 페이지라도
  // 조정 버튼을 볼 수 없다.
  const canAdjust = session.isAdmin

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/members"
          className="inline-flex items-center gap-1 text-gray-400 hover:text-white text-xs"
        >
          <ArrowLeft size={13} />
          {t('backToList')}
        </Link>
        {detail && canAdjust && (
          <AdminPointAdjuster
            discordId={detail.discord_id}
            username={detail.username}
            balance={detail.balance}
          />
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {detail && <MemberDetailView detail={detail} />}
    </main>
  )
}
