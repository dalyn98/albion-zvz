import { notFound } from 'next/navigation'
import { Eye, LockKeyhole } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getPublicMemberActivityByToken } from '@/app/actions/members-admin-detail'
import PublicMemberActivityView from '@/components/PublicMemberActivityView'

export const dynamic = 'force-dynamic'

export default async function PublicUserActivityPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const [{ detail, guildName, timezone }, t] = await Promise.all([
    getPublicMemberActivityByToken(token),
    getTranslations('publicActivity'),
  ])

  if (!detail) notFound()
  const displayName = detail.albion_identity?.nickname ?? detail.username

  return (
    <main className="w-full max-w-4xl mx-auto px-4 py-8 sm:py-10 space-y-6">
      <header className="rounded-2xl border border-gray-800 bg-gray-900 px-5 py-5 sm:px-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300/80 flex items-center gap-1.5">
              <Eye size={12} />
              {t('eyebrow')}
            </p>
            <h1 className="mt-2 text-2xl sm:text-3xl font-bold text-white truncate">
              {displayName}
            </h1>
            <p className="mt-1 text-sm text-gray-400">
              {t('subtitle', { guild: guildName ?? t('unknownGuild') })}
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-gray-700 bg-gray-950/50 px-2.5 py-1 text-[11px] font-semibold text-gray-300">
            <LockKeyhole size={11} />
            {t('safeScopeBadge')}
          </span>
        </div>
        <p className="mt-4 rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-xs leading-relaxed text-gray-400">
          {t('privacyNote')}
        </p>
      </header>

      <PublicMemberActivityView detail={detail} timezone={timezone ?? undefined} />
    </main>
  )
}
