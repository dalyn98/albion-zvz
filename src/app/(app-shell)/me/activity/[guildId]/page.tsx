import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, LockKeyhole } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getAdminClient } from '@/lib/supabase-admin'
import { displayNameFromSlug } from '@/lib/tenant-slug'
import { getMyMemberDetailForGuild } from '@/app/actions/members-admin-detail'
import MemberDetailView from '@/components/MemberDetailView'
import { getTenantTimezone } from '@/lib/timezone-server'

export const dynamic = 'force-dynamic'

interface TenantSummary {
  name: string
}

export default async function MyActivityDetailPage({
  params,
}: {
  params: Promise<{ guildId: string }>
}) {
  const { guildId } = await params
  const session = await getSession()
  if (!session) {
    redirect(`/login?returnTo=${encodeURIComponent(`/me/activity/${guildId}`)}`)
  }
  if (!session.isMember) redirect('/')

  const [{ detail, error }, tenant, t, timezone] = await Promise.all([
    getMyMemberDetailForGuild(guildId),
    loadTenantSummary(guildId),
    getTranslations('me'),
    getTenantTimezone(guildId),
  ])

  if (!detail && !error) notFound()

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <div className="space-y-4">
        <Link
          href="/me"
          className="inline-flex items-center gap-1 text-gray-400 hover:text-white text-xs"
        >
          <ArrowLeft size={13} />
          {t('activityDetailBack')}
        </Link>

        <header className="rounded-2xl border border-gray-800 bg-gray-900 px-4 py-4 sm:px-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300/80">
                {t('activityDetailEyebrow')}
              </p>
              <h1 className="mt-1 text-xl sm:text-2xl font-bold text-white truncate">
                {tenant?.name ?? t('activityDetailUnknownGuild')}
              </h1>
              <p className="mt-1 text-sm text-gray-400 leading-relaxed">
                {t('activityDetailDescription')}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-gray-700 bg-gray-950/50 px-2.5 py-1 text-[11px] font-semibold text-gray-300">
              <LockKeyhole size={11} />
              {t('activityRecordPrivateHint')}
            </span>
          </div>
        </header>
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
          allowIdentityRefresh={false}
        />
      )}
    </main>
  )
}

async function loadTenantSummary(guildId: string): Promise<TenantSummary | null> {
  const db = getAdminClient()
  const { data } = await db
    .from('tenants')
    .select('slug, name')
    .eq('id', guildId)
    .maybeSingle()

  if (!data) return null
  const slug = (data.slug as string | null) ?? ''
  const name = (data.name as string | null) ?? ''
  return { name: displayNameFromSlug(slug) || name || guildId }
}
