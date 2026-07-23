import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession, sessionHas } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getGuildMemberDetail } from '@/app/actions/members-admin-detail'
import MemberDetailView from '@/components/MemberDetailView'
import AdminPointAdjuster from '@/components/AdminPointAdjuster'
import RealtimeKillboardListenerLazy from '@/components/RealtimeKillboardListenerLazy'
import { getTenantTimezone } from '@/lib/timezone-server'
import { CAP } from '@/lib/permissions'
import {
  loadMemberAbsences,
  loadMemberTrialProfile,
} from '@/lib/member-operations-server'
import { tenantDateKey } from '@/lib/timezone'
import MemberTrialCard from '@/components/MemberTrialCard'

export const dynamic = 'force-dynamic'

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ discordId: string }>
}) {
  const [{ discordId }, session] = await Promise.all([params, getSession()])
  if (!session) {
    redirect(`/login?returnTo=${encodeURIComponent(`/members/${discordId}`)}`)
  }
  if (!sessionHas(session, CAP.MEMBERS_VIEW)) {
    redirect('/members')
  }

  const guildId = await getSessionGuildId(session)
  const timezone = await getTenantTimezone(guildId)
  const todayIso = tenantDateKey(new Date(), timezone)
  const canManageMemberOperations =
    session.isAdmin || sessionHas(session, CAP.MEMBERS_MANAGE)
  const canViewMemberOperations =
    canManageMemberOperations || session.discordId === discordId
  const [{ detail, error }, t, trialProfile, absences] = await Promise.all([
    getGuildMemberDetail(discordId),
    getTranslations('members'),
    canViewMemberOperations
      ? loadMemberTrialProfile(guildId, discordId)
      : Promise.resolve(null),
    canViewMemberOperations
      ? loadMemberAbsences(guildId, discordId, todayIso)
      : Promise.resolve([]),
  ])
  if (!detail && !error) notFound()

  // Client Component props are serialized into the RSC payload. Members may see
  // their own trial status, but internal staff notes and editor identity must
  // never leave the server boundary unless the viewer can manage members.
  const visibleTrialProfile =
    trialProfile && !canManageMemberOperations
      ? { ...trialProfile, notes: '', updatedBy: '' }
      : trialProfile

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

      {detail && (
        <MemberTrialCard
          discordId={detail.discord_id}
          profile={visibleTrialProfile}
          absences={absences}
          canManage={canManageMemberOperations}
          todayIso={todayIso}
        />
      )}
      {detail && <MemberDetailView detail={detail} timezone={timezone} />}
      <RealtimeKillboardListenerLazy guildId={guildId} />
    </main>
  )
}
