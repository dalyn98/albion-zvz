import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSessionGuildId } from '@/lib/tenant'
import { getGuildMemberDetail } from '@/app/actions/members-admin-detail'
import MemberDetailView from '@/components/MemberDetailView'
import AdminPointAdjuster from '@/components/AdminPointAdjuster'
import RealtimeKillboardListenerLazy from '@/components/RealtimeKillboardListenerLazy'
import { getTenantTimezone } from '@/lib/timezone-server'
import { resolveMemberDetailScopes } from '@/lib/member-profile-access'
import { requireLiveSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ discordId: string }>
}) {
  const [{ discordId }, session] = await Promise.all([
    params,
    requireLiveSession().catch(() => null),
  ])
  if (!session) {
    redirect(`/login?returnTo=${encodeURIComponent(`/members/${discordId}`)}`)
  }
  const scopes = resolveMemberDetailScopes({
    viewerDiscordId: session.discordId,
    targetDiscordId: discordId,
    isMember: session.isMember,
    isAdmin: session.isAdmin,
    capabilities: session.capabilities,
  })
  if (!scopes.activity) {
    redirect('/members')
  }

  const guildId = await getSessionGuildId(session)
  const timezone = await getTenantTimezone(guildId)
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
        {detail?.finance && canAdjust && (
          <AdminPointAdjuster
            discordId={detail.discord_id}
            username={detail.username}
            balance={detail.finance.balance}
          />
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {detail && (
        <MemberDetailView
          detail={detail}
          timezone={timezone}
          showDiscordId={false}
        />
      )}
      <RealtimeKillboardListenerLazy guildId={guildId} />
    </main>
  )
}
