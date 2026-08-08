import type { Metadata } from 'next'
import { cache, Suspense } from 'react'
import { AlertTriangle, Layers3 } from 'lucide-react'
import { notFound } from 'next/navigation'
import PublicBattleReportExplorer from '@/components/PublicBattleReportExplorer'
import PublicZvzBattleSessionCard from '@/components/PublicZvzBattleSessionCard'
import { isAlbionServer } from '@/lib/albion-gameinfo'
import { getMarketingPathsForEnvironment } from '@/lib/marketing-paths'
import {
  getMarketingLocale,
  getMarketingTranslator,
} from '@/lib/marketing-static-intl'
import { loadPublicBattleGroupAnalysis } from '@/lib/public-battle-analysis'
import type { PublicBattleGroupReport } from '@/lib/public-battle-report-model'
import { buildPublicZvzBattleSession } from '@/lib/public-zvz-battle-sessions'
import { loadPublicZvzBattleSessionReport } from '@/lib/public-zvz-battle-session-report'
import { loadPublicBattlesByAlbionIds } from '@/lib/public-zvz-battles'
import { normalizePublicZvzBattleIds } from '@/lib/public-zvz-record-links'
import { getUtcWeekStartDateString } from '@/lib/public-battlelog-sync'
import {
  PublicZvzRecordChrome,
  PublicZvzRecordHeader,
} from '../../../record-ui'

export const dynamic = 'force-dynamic'

interface SessionPageProps {
  params: Promise<{ server: string; battleIds: string }>
}

async function SessionDetailAnalysis({
  reportPromise,
  unavailableLabel,
}: {
  reportPromise: Promise<PublicBattleGroupReport | null>
  unavailableLabel: string
}) {
  let detail: {
    report: PublicBattleGroupReport
    analysis: Awaited<ReturnType<typeof loadPublicBattleGroupAnalysis>>
  } | null = null
  try {
    const report = await reportPromise
    if (!report) throw new Error('session report unavailable')
    const analysis = await loadPublicBattleGroupAnalysis(report)
    detail = { report, analysis }
  } catch (error) {
    console.error('[public-zvz-session] detailed analysis failed', error)
  }

  if (detail) {
    return <PublicBattleReportExplorer report={detail.report} analysis={detail.analysis} timezone="UTC" />
  }
  return (
    <div className="flex min-h-36 items-center justify-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-5 text-center text-sm text-amber-100">
      <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
      {unavailableLabel}
    </div>
  )
}

const loadSession = cache(async (server: string, battleIdsParam: string) => {
  if (!isAlbionServer(server)) return null
  const battleIds = normalizePublicZvzBattleIds(battleIdsParam)
  if (battleIds.length === 0) return null
  const battles = await loadPublicBattlesByAlbionIds({ server, battleIds })
  if (
    battles.length !== battleIds.length ||
    battleIds.some((battleId) => !battles.some((battle) => battle.albionBattleId === battleId))
  ) {
    return null
  }
  return buildPublicZvzBattleSession(battles)
})

export async function generateMetadata({ params }: SessionPageProps): Promise<Metadata> {
  const [route, t] = await Promise.all([
    params,
    getMarketingTranslator('publicZvzSession'),
  ])
  const session = await loadSession(route.server, route.battleIds).catch(() => null)
  if (!session) return { title: t('metaFallbackTitle'), robots: { index: false, follow: false } }
  const primary = session.topForces[0]
  const secondary = session.topForces[1]
  const title = primary && secondary
    ? `${primary.forceName} vs ${secondary.forceName} · AGM Battles`
    : t('metaFallbackTitle')
  const description = t('metaDescription', {
    count: session.battleCount,
    minutes: session.durationMinutes,
    kills: session.totalKills,
  })
  return {
    title,
    description,
    robots: { index: false, follow: true },
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function PublicZvzBattleSessionPage({ params }: SessionPageProps) {
  const [route, locale, t, boardT, detailT] = await Promise.all([
    params,
    getMarketingLocale(),
    getMarketingTranslator('publicZvzSession'),
    getMarketingTranslator('publicZvzBattles'),
    getMarketingTranslator('publicBattleGroup'),
  ])
  const session = await loadSession(route.server, route.battleIds)
  if (!session) notFound()
  const paths = getMarketingPathsForEnvironment(locale)
  const weekStart = getUtcWeekStartDateString(new Date(session.startedAt))
  const primary = session.topForces[0]
  const secondary = session.topForces[1]
  const title = primary && secondary
    ? `${primary.forceName} vs ${secondary.forceName}`
    : t('fallbackTitle')
  const detailReportPromise = loadPublicZvzBattleSessionReport({
    server: session.server,
    battleIds: session.battleIds,
    preferredForceKey: primary?.forceKey,
  })

  return (
    <PublicZvzRecordChrome>
      <PublicZvzRecordHeader
        boardHref={`${paths.zvzBattles}?server=${session.server}&view=battles`}
        backLabel={t('backToBattles')}
        eyebrow={t('eyebrow')}
        title={title}
        subtitle={t('subtitle', {
          server: boardT(`server_${session.server}`),
          count: session.battleCount,
          minutes: session.durationMinutes,
        })}
        badges={
          <span className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-amber-300/10 px-2.5 text-xs font-bold text-amber-200">
            <Layers3 size={13} aria-hidden="true" />
            {t('sessionBadge')}
          </span>
        }
      />

      <section className="mt-7">
        <PublicZvzBattleSessionCard
          session={session}
          basePath={paths.zvzBattles}
          weekStart={weekStart}
          locale={locale}
          labels={{
            official: boardT('agmZvzBadge'),
            publicBattle: t('publicBattle'),
            session: t('sessionBadge'),
            logsAndDuration: t('logsAndDuration', { count: '{count}', minutes: '{minutes}' }),
            peakPlayers: t('peakPlayers'),
            totalKills: boardT('killsMetric'),
            totalFame: boardT('fameMetric'),
            people: boardT('peopleCount', { count: '{count}' }),
            kd: boardT('kdColumn'),
            versus: boardT('versusLabel'),
            additionalForces: boardT('additionalForces', { count: '{count}' }),
            topGuilds: boardT('topGuildsTitle'),
            otherGuilds: t('otherGuilds'),
            rawLogs: t('rawLogs', { count: '{count}' }),
            battleId: boardT('battleId', { id: '{id}' }),
            viewSession: t('viewSession'),
            share: t('share'),
            copied: t('copied'),
          }}
        />
      </section>

      <section className="mt-10 border-t border-white/[0.1] pt-8">
        <h2 className="text-xl font-black text-white sm:text-2xl">{t('detailTitle')}</h2>
        <Suspense
          fallback={
            <div className="mt-5 min-h-64 animate-pulse rounded-xl border border-white/[0.08] bg-white/[0.025] px-5 py-10 text-center text-sm text-gray-500 motion-reduce:animate-none">
              {detailT('loadingAnalysis')}
            </div>
          }
        >
          <div className="mt-5">
            <SessionDetailAnalysis
              reportPromise={detailReportPromise}
              unavailableLabel={t('detailUnavailable')}
            />
          </div>
        </Suspense>
      </section>
    </PublicZvzRecordChrome>
  )
}
