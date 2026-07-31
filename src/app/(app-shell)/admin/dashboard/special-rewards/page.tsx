import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Gift } from 'lucide-react'
import { requireLiveSession } from '@/lib/auth'
import { sessionHas } from '@/lib/session'
import { CAP } from '@/lib/permissions'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import SpecialRewardGrantForm from '@/components/SpecialRewardGrantForm'

export const dynamic = 'force-dynamic'

export default async function SpecialRewardsPage() {
  const session = await requireLiveSession().catch(() => null)
  if (!session) redirect('/login?returnTo=%2Fadmin%2Fdashboard%2Fspecial-rewards')
  if (!session.isAdmin && !sessionHas(session, CAP.SPECIAL_REWARD_GRANT)) {
    redirect('/admin/dashboard')
  }
  const guildId = await getSessionGuildId(session)
  const db = getAdminClient()
  const [{ data }, t] = await Promise.all([
    db
      .from('guild_avatars')
      .select('discord_id, username')
      .eq('guild_id', guildId)
      .is('withdrawn_at', null)
      .order('username', { ascending: true })
      .limit(1_000),
    getTranslations('specialRewards'),
  ])

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="rounded-xl border border-border bg-surface p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-violet-500/15 p-2 text-violet-300"><Gift size={21} /></span>
          <div>
            <h1 className="text-xl font-bold text-foreground sm:text-2xl">{t('title')}</h1>
            <p className="mt-1 text-sm text-muted">{t('description')}</p>
          </div>
        </div>
      </header>
      <SpecialRewardGrantForm
        members={(data ?? []).map((member) => ({
          discordId: member.discord_id as string,
          username: member.username as string,
        }))}
      />
    </main>
  )
}
