import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Trophy } from 'lucide-react'
import { isAlbionServer } from '@/lib/albion-gameinfo'
import { getMarketingPathsForEnvironment } from '@/lib/marketing-paths'
import { getMarketingLocale, getMarketingTranslator } from '@/lib/marketing-static-intl'
import { loadPublicZvzWeekSnapshot } from '@/lib/public-zvz-battles'
import {
  buildPublicZvzGuildRecordHref,
  normalizePublicZvzWeekStart,
} from '@/lib/public-zvz-record-links'
import { getCanonicalOrigin } from '@/lib/seo-metadata'
import { buildSeoZvzRecordLanguageAlternates } from '@/lib/seo-locale-paths'
import {
  formatPublicZvzDecimal,
  formatPublicZvzNumber,
  PublicZvzKdScore,
  PublicZvzRecordChrome,
  PublicZvzRecordHeader,
} from '../../../record-ui'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ server: string; week: string }>
}

async function load(route: Awaited<Props['params']>) {
  if (!isAlbionServer(route.server)) return null
  const week = normalizePublicZvzWeekStart(route.week)
  if (!week) return null
  return loadPublicZvzWeekSnapshot({ server: route.server, weekStart: week, limit: 50 })
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [route, locale, t] = await Promise.all([
    params,
    getMarketingLocale(),
    getMarketingTranslator('publicZvzRecords'),
  ])
  const data = await load(route).catch(() => null)
  if (!data || !isAlbionServer(route.server)) {
    return { title: t('notFoundTitle'), robots: { index: false, follow: false } }
  }
  const pathname = `${locale ? `/${locale}` : ''}/zvz-battles/weekly/${route.server}/${data.weekStart}`
  const canonicalUrl = `${getCanonicalOrigin()}${pathname}`
  const server = route.server.toUpperCase()
  const title = t('weeklyMetaTitle', { server, week: data.weekStart })
  const description = t('weeklyMetaDescription', { server, week: data.weekStart })
  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: buildSeoZvzRecordLanguageAlternates(pathname) ?? undefined,
    },
    robots: data.rankings.length > 0
      ? { index: true, follow: true }
      : { index: false, follow: true },
    openGraph: { type: 'website', title, description, url: canonicalUrl },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function PublicZvzWeeklyPage({ params }: Props) {
  const [route, locale, t, boardT] = await Promise.all([
    params,
    getMarketingLocale(),
    getMarketingTranslator('publicZvzRecords'),
    getMarketingTranslator('publicZvzBattles'),
  ])
  const data = await load(route)
  if (!data || !isAlbionServer(route.server)) notFound()
  const paths = getMarketingPathsForEnvironment(locale)
  return (
    <PublicZvzRecordChrome>
      <PublicZvzRecordHeader
        boardHref={`${paths.zvzBattles}?entity=guild`}
        backLabel={t('backToBoard')}
        eyebrow={t('weeklyEyebrow')}
        title={t('weeklyTitle', { server: boardT(`server_${route.server}`) })}
        subtitle={t('weeklySubtitle', { week: data.weekStart })}
        badges={
          <span className="inline-flex min-h-8 items-center gap-1.5 rounded-sm bg-amber-400/10 px-2.5 text-xs font-semibold text-amber-200">
            <Trophy size={13} /> {data.rankings.length}
          </span>
        }
      />
      <section className="overflow-hidden rounded-2xl bg-white/[0.025] shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
        {data.rankings.length === 0 ? (
          <div className="p-10 text-center"><h2 className="font-black text-white">{boardT('emptyRankingsTitle')}</h2><p className="mt-2 text-sm text-gray-500">{boardT('emptyRankingsBody')}</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[58rem] text-left text-sm">
              <thead className="bg-black/20 text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3">{boardT('rankColumn')}</th><th className="px-4 py-3">{boardT('guildColumn')}</th><th className="px-4 py-3 text-right">{boardT('battlesColumn')}</th><th className="px-4 py-3 text-right">{boardT('kdColumn')}</th><th className="px-4 py-3 text-right">{boardT('avgForceColumn')}</th><th className="px-4 py-3 text-right">{boardT('scoreColumn')}</th></tr></thead>
              <tbody className="divide-y divide-white/[0.06]">{data.rankings.map((row) => (
                <tr key={row.guildAlbionId} className="hover:bg-white/[0.025]">
                  <td className="px-4 py-3 font-black tabular-nums text-amber-200">#{row.rank}</td>
                  <td className="px-4 py-3"><Link href={buildPublicZvzGuildRecordHref({ basePath: paths.zvzBattles, server: row.server, guildAlbionId: row.guildAlbionId, weekStart: data.weekStart })} className="font-bold text-white hover:text-amber-100 hover:underline">{row.guildName}</Link>{row.allianceName ? <p className="mt-1 text-xs text-gray-500">[{row.allianceName}]</p> : null}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-200">{row.zvzBattles}</td>
                  <td className="px-4 py-3 text-right">
                    <PublicZvzKdScore
                      kills={row.kills}
                      deaths={row.deaths}
                      label={boardT('kdColumn')}
                      size="sm"
                    />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-200">{formatPublicZvzDecimal(row.avgForceSize)}</td>
                  <td className="px-4 py-3 text-right font-black tabular-nums text-white">{formatPublicZvzNumber(row.score)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </PublicZvzRecordChrome>
  )
}
