import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { listDonationRequests } from '@/app/actions/donation-admin'
import DonationReviewList from '@/components/DonationReviewList'
import { getAvatarsByDiscordIds } from '@/lib/discord-avatar'

export const dynamic = 'force-dynamic'

interface SearchParams {
  scope?: 'pending' | 'all'
}

export default async function DonationAdminPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const { scope = 'pending' } = await searchParams
  const [{ requests, error }, t] = await Promise.all([
    listDonationRequests(scope),
    getTranslations('adminDonationReview'),
  ])
  const avatarMap = await getAvatarsByDiscordIds(requests.map((r) => r.discord_id))
  const avatars = Object.fromEntries(avatarMap)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white">{t('pageTitle')}</h1>
        <p className="text-gray-400 text-xs sm:text-sm mt-1">
          {t('pageDescription')}
        </p>
      </div>

      <nav className="flex items-center gap-2">
        <Link
          href="/admin/dashboard/donations?scope=pending"
          className={`text-xs font-medium px-3 py-1.5 rounded-full border ${
            scope === 'pending'
              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
              : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'
          }`}
        >
          {t('scopePending')}
        </Link>
        <Link
          href="/admin/dashboard/donations?scope=all"
          className={`text-xs font-medium px-3 py-1.5 rounded-full border ${
            scope === 'all'
              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
              : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'
          }`}
        >
          {t('scopeAll')}
        </Link>
      </nav>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {requests.length === 0 && !error ? (
        <p className="text-gray-500 text-sm text-center py-8">
          {scope === 'pending' ? t('noPending') : t('noRequests')}
        </p>
      ) : (
        <DonationReviewList requests={requests} avatars={avatars} />
      )}
    </div>
  )
}
