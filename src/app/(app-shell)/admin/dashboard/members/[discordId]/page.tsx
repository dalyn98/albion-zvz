import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getManagedGuildMemberDetail } from '@/app/actions/members-admin-detail'
import AdminPointAdjuster from '@/components/AdminPointAdjuster'
import MemberDetailView from '@/components/MemberDetailView'
import GuildMemberDisplayNameEditor from '@/components/GuildMemberDisplayNameEditor'
import RealtimeKillboardListenerLazy from '@/components/RealtimeKillboardListenerLazy'
import { requireLiveSession } from '@/lib/auth'
import { CAP } from '@/lib/permissions'
import { sessionHas } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getTenantTimezone } from '@/lib/timezone-server'

export const dynamic = 'force-dynamic'

export default async function ManagedMemberDetailPage({
  params,
}: {
  params: Promise<{ discordId: string }>
}) {
  const [{ discordId }, session] = await Promise.all([
    params,
    requireLiveSession().catch(() => null),
  ])
  if (!session) {
    redirect(
      `/login?returnTo=${encodeURIComponent(
        `/admin/dashboard/members/${discordId}`,
      )}`,
    )
  }
  if (!sessionHas(session, CAP.MEMBERS_MANAGE)) {
    redirect('/admin/dashboard')
  }

  const guildId = await getSessionGuildId(session)
  const timezone = await getTenantTimezone(guildId)
  const [{ detail, error }, t] = await Promise.all([
    getManagedGuildMemberDetail(discordId),
    getTranslations('members'),
  ])
  if (!detail && !error) notFound()

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6 sm:py-8">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/admin/dashboard/members"
          className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-white"
        >
          <ArrowLeft size={13} />
          {t('backToOperationsDirectory')}
        </Link>
        {detail?.finance && session.isAdmin && (
          <AdminPointAdjuster
            discordId={detail.discord_id}
            username={detail.username}
            balance={detail.finance.balance}
          />
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {detail?.guild_member_id && (
        <GuildMemberDisplayNameEditor
          guildMemberId={detail.guild_member_id}
          discordId={detail.discord_id}
          effectiveDisplayName={detail.username}
          displayNameOverride={detail.display_name_override}
          discordDisplayName={detail.discord_username}
        />
      )}
      {detail && <MemberDetailView detail={detail} timezone={timezone} />}
      <RealtimeKillboardListenerLazy guildId={guildId} />
    </main>
  )
}
