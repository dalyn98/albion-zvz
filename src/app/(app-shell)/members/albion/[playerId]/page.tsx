import { redirect } from 'next/navigation'
import { sessionHas } from '@/lib/session'
import { CAP } from '@/lib/permissions'
import { requireLiveSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function LegacyAlbionMemberDetailPage({
  params,
}: {
  params: Promise<{ playerId: string }>
}) {
  const [{ playerId }, session] = await Promise.all([
    params,
    requireLiveSession().catch(() => null),
  ])
  if (!session) {
    redirect(`/login?returnTo=${encodeURIComponent(`/members/albion/${playerId}`)}`)
  }
  if (!sessionHas(session, CAP.MEMBERS_MANAGE)) redirect('/members')
  redirect(`/admin/dashboard/members/albion/${encodeURIComponent(playerId)}`)
}
