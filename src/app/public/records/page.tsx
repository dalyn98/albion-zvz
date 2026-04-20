import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getAppSetting } from '@/lib/app-settings'
import { listPublicGuildRecords } from '@/app/actions/battle-records'
import GuildRecordsList from '@/components/GuildRecordsList'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('publicRecords')
  return {
    title: t('title'),
    description: t('description'),
    openGraph: {
      title: t('title'),
      description: t('description'),
    },
  }
}

export default async function PublicRecordsPage() {
  const [{ records, error }, t, bannerUrl] = await Promise.all([
    listPublicGuildRecords(),
    getTranslations('publicRecords'),
    getAppSetting('landing_banner_url', ''),
  ])

  const totals = records.reduce(
    (acc, r) => ({ wins: acc.wins + r.wins, losses: acc.losses + r.losses }),
    { wins: 0, losses: 0 },
  )
  const totalFights = totals.wins + totals.losses
  const winRate = totalFights > 0 ? Math.round((totals.wins / totalFights) * 100) : 0

  return (
    <main className="flex-1 w-full max-w-3xl xl:max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-5">
      <section className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
          {t('title')}
        </h1>
        <p className="text-gray-400 text-xs sm:text-sm">{t('description')}</p>
      </section>

      {bannerUrl && (
        <div className="rounded-lg overflow-hidden border border-gray-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bannerUrl} alt="" className="w-full h-auto block" />
        </div>
      )}

      {records.length > 0 && (
        <section className="grid grid-cols-3 gap-2">
          <StatCard label={t('statOpponents')} value={records.length.toString()} tone="amber" />
          <StatCard label={t('statFights')} value={totalFights.toString()} tone="gray" />
          <StatCard
            label={t('statWinRate')}
            value={t('percent', { value: winRate })}
            tone={winRate >= 50 ? 'emerald' : 'rose'}
          />
        </section>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {records.length === 0 && !error ? (
        <p className="text-gray-500 text-sm text-center py-8">{t('empty')}</p>
      ) : (
        <GuildRecordsList records={records} linkable={false} />
      )}

      <section className="bg-gray-900/60 border border-gray-800 rounded-lg px-4 py-4 text-center space-y-2">
        <p className="text-gray-300 text-sm">{t('ctaHeadline')}</p>
        <p className="text-gray-500 text-xs">{t('ctaBody')}</p>
        <Link
          href="/api/auth/discord/start?returnTo=/"
          className="inline-flex items-center gap-1 bg-[#5865F2] hover:bg-[#4752c4] text-white text-xs font-semibold px-3 py-2 rounded-lg mt-1"
        >
          {t('ctaLogin')}
        </Link>
      </section>
    </main>
  )
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'amber' | 'gray' | 'emerald' | 'rose'
}) {
  const toneCls =
    tone === 'amber'
      ? 'text-amber-300'
      : tone === 'emerald'
        ? 'text-emerald-300'
        : tone === 'rose'
          ? 'text-rose-300'
          : 'text-gray-200'
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-3 text-center">
      <p className={`font-mono font-semibold text-lg ${toneCls}`}>{value}</p>
      <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider">{label}</p>
    </div>
  )
}
