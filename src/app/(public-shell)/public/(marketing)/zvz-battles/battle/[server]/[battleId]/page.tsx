import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Activity, AlertTriangle, Swords, Users } from 'lucide-react'
import PublicBattleReportExplorer, {
  type PublicBattleReportInitialGroup,
} from '@/components/PublicBattleReportExplorer'
import PublicZvzShareButton from '@/components/PublicZvzShareButton'
import { isAlbionServer } from '@/lib/albion-gameinfo'
import { getMarketingPathsForEnvironment } from '@/lib/marketing-paths'
import { getMarketingLocale, getMarketingTranslator } from '@/lib/marketing-static-intl'
import { loadPublicBattleGroupAnalysis } from '@/lib/public-battle-analysis'
import { buildPublicBattleEngagementReport } from '@/lib/public-battle-engagement-report'
import type { PublicBattleGroupReport } from '@/lib/public-battle-report-model'
import { loadPublicZvzBattleReport } from '@/lib/public-zvz-battle-report'
import type { PublicZvzBattleEngagement } from '@/lib/public-zvz-battle-report'
import { loadPublicZvzBattleSessionReport } from '@/lib/public-zvz-battle-session-report'
import {
  buildPublicZvzAllianceRecordHref,
  buildPublicZvzGuildRecordHref,
  normalizePublicZvzAlbionId,
  normalizePublicZvzBattleId,
  normalizePublicZvzDate,
  normalizePublicZvzEngagementId,
  normalizePublicZvzSeasonId,
  normalizePublicZvzWeekStart,
} from '@/lib/public-zvz-record-links'
import { getCanonicalOrigin } from '@/lib/seo-metadata'
import {
  buildSeoZvzRecordLanguageAlternates,
  getSeoZvzRecordLocale,
} from '@/lib/seo-locale-paths'
import {
  formatPublicZvzDateTime,
  formatPublicZvzNumber,
  PublicZvzKdScore,
  PublicZvzRecordChrome,
  PublicZvzRecordHeader,
  PublicZvzScaleRankingBadge,
} from '../../../record-ui'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ server: string; battleId: string }>
  searchParams: Promise<{
    engagement?: string | string[]
    focus?: string | string[]
    focusId?: string | string[]
    week?: string | string[]
    season?: string | string[]
    asOf?: string | string[]
  }>
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function forceKey(kind: 'guild' | 'alliance', albionId: string): string {
  return kind === 'alliance' ? `a:${albionId}` : `g:${albionId}`
}

async function EngagementDetailAnalysis({
  reportPromise,
  engagement,
  initialGroup,
  unavailableLabel,
}: {
  reportPromise: Promise<PublicBattleGroupReport | null>
  engagement: PublicZvzBattleEngagement
  initialGroup: PublicBattleReportInitialGroup | null
  unavailableLabel: string
}) {
  let detail: {
    report: PublicBattleGroupReport
    analysis: Awaited<ReturnType<typeof loadPublicBattleGroupAnalysis>>
  } | null = null
  try {
    const sourceReport = await reportPromise
    if (!sourceReport || engagement.eventIds.length === 0) {
      throw new Error('scored engagement event ids unavailable')
    }
    const analysis = await loadPublicBattleGroupAnalysis(sourceReport, {
      engagement: {
        battleId: sourceReport.requestedBattleIds[0],
        eventIds: engagement.eventIds,
      },
    })
    const report = buildPublicBattleEngagementReport({
      sourceReport,
      analysis,
      battleId: sourceReport.requestedBattleIds[0],
      startedAt: engagement.startedAt,
      endedAt: engagement.endedAt,
      preferredForceKey: forceKey(engagement.homeForceKind, engagement.homeForceAlbionId),
    })
    if (!report) throw new Error('scored engagement report unavailable')
    detail = { report, analysis }
  } catch (error) {
    console.error('[public-zvz-engagement] detailed analysis failed', error)
  }
  if (detail) {
    return (
      <PublicBattleReportExplorer
        report={detail.report}
        analysis={detail.analysis}
        timezone="UTC"
        initialGroup={initialGroup}
      />
    )
  }
  return (
    <div className="flex min-h-36 items-center justify-center gap-2 rounded-xl bg-amber-400/[0.06] px-5 text-center text-sm text-amber-100 shadow-[0_0_0_1px_rgba(251,191,36,0.2)]">
      <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
      {unavailableLabel}
    </div>
  )
}

function canonicalPath(server: string, battleId: number, locale: string): string {
  const localized = locale ? `/${locale}` : ''
  return `${localized}/zvz-battles/battle/${server}/${battleId}`
}

function resultKey(result: 'advantage' | 'disadvantage' | 'even' | null) {
  if (result === 'advantage') return 'resultAdvantage'
  if (result === 'disadvantage') return 'resultDisadvantage'
  if (result === 'even') return 'resultEven'
  return 'resultUnresolved'
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [route, headerStore, t] = await Promise.all([
    params,
    headers(),
    getMarketingTranslator('publicZvzRecords'),
  ])
  const battleId = normalizePublicZvzBattleId(route.battleId)
  if (!battleId || !isAlbionServer(route.server)) {
    return { title: t('notFoundTitle'), robots: { index: false, follow: false } }
  }
  const report = await loadPublicZvzBattleReport(route.server, battleId).catch(() => null)
  if (!report) return { title: t('notFoundTitle'), robots: { index: false, follow: false } }
  const requestLocale = getSeoZvzRecordLocale(headerStore.get('x-pathname') ?? '')
  const pathname = canonicalPath(route.server, battleId, requestLocale ?? '')
  const canonicalUrl = `${getCanonicalOrigin()}${pathname}`
  const title = t('battleReportMetaTitle', { id: battleId })
  const description = t('battleReportMetaDescription', {
    server: route.server.toUpperCase(),
    id: battleId,
  })
  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: buildSeoZvzRecordLanguageAlternates(pathname) ?? undefined,
    },
    robots: report.isOfficial
      ? { index: true, follow: true }
      : { index: false, follow: true, nocache: true },
    openGraph: { type: 'article', title, description, url: canonicalUrl },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function PublicZvzBattleReportPage({ params, searchParams }: Props) {
  const [route, query, locale, t, boardT, detailT] = await Promise.all([
    params,
    searchParams,
    getMarketingLocale(),
    getMarketingTranslator('publicZvzRecords'),
    getMarketingTranslator('publicZvzBattles'),
    getMarketingTranslator('publicBattleGroup'),
  ])
  const battleId = normalizePublicZvzBattleId(route.battleId)
  if (!battleId || !isAlbionServer(route.server)) notFound()
  const data = await loadPublicZvzBattleReport(route.server, battleId)
  if (!data) notFound()
  const paths = getMarketingPathsForEnvironment(locale)
  const officialEngagements = data.engagements.filter((engagement) => engagement.status === 'final')
  const requestedEngagementValue = firstParam(query.engagement)
  const requestedEngagementId = normalizePublicZvzEngagementId(requestedEngagementValue)
  if (requestedEngagementValue && !requestedEngagementId) notFound()
  const selectedEngagement = requestedEngagementId
    ? data.engagements.find((engagement) => engagement.id === requestedEngagementId) ?? null
    : null
  if (requestedEngagementId && !selectedEngagement) notFound()
  const displayedEngagements = selectedEngagement
    ? [selectedEngagement]
    : officialEngagements.length > 0
      ? officialEngagements
      : data.engagements
  const focusValue = firstParam(query.focus)
  const focusKind = focusValue === 'guild' || focusValue === 'alliance' ? focusValue : null
  const focusAlbionId = normalizePublicZvzAlbionId(firstParam(query.focusId))
  const focusEvidence = selectedEngagement && focusKind && focusAlbionId
    ? selectedEngagement.evidence.find(
        (evidence) => evidence.entityKind === focusKind && evidence.entityAlbionId === focusAlbionId,
      ) ?? null
    : null
  const initialGroup: PublicBattleReportInitialGroup | null = focusKind && focusAlbionId
    ? {
        level: focusKind === 'guild' ? 'guilds' : 'alliances',
        key: forceKey(focusKind, focusAlbionId),
      }
    : null
  const subjectName = focusEvidence?.entityName ?? selectedEngagement?.homeForceName ?? null
  const opponentNames = selectedEngagement?.matchups
    .filter((matchup) => matchup.role === 'result_eligible')
    .map((matchup) => matchup.opponentName) ?? []
  const opponentSummary = opponentNames.length > 3
    ? `${opponentNames.slice(0, 3).join(', ')} +${opponentNames.length - 3}`
    : opponentNames.join(', ')
  const pageTitle = subjectName && opponentNames.length > 0
    ? `${subjectName} vs ${opponentSummary}`
    : `Battle #${battleId}`
  const seasonId = normalizePublicZvzSeasonId(firstParam(query.season))
  const asOfDate = normalizePublicZvzDate(firstParam(query.asOf))
  const weekStart = normalizePublicZvzWeekStart(firstParam(query.week))
  const backHref = focusKind === 'guild' && focusAlbionId
    ? buildPublicZvzGuildRecordHref({
        basePath: paths.zvzBattles,
        server: data.server,
        guildAlbionId: focusAlbionId,
        seasonId,
        asOfDate,
        weekStart,
      })
    : focusKind === 'alliance' && focusAlbionId
      ? buildPublicZvzAllianceRecordHref({
          basePath: paths.zvzBattles,
          server: data.server,
          allianceAlbionId: focusAlbionId,
          seasonId,
          asOfDate,
          weekStart,
        })
      : paths.zvzBattles
  const detailReportPromise = selectedEngagement
    ? loadPublicZvzBattleSessionReport({
        server: data.server,
        battleIds: [battleId],
        preferredForceKey: forceKey(
          selectedEngagement.homeForceKind,
          selectedEngagement.homeForceAlbionId,
        ),
      })
    : null
  const focusedPlayers = focusEvidence?.ownTeamSize ?? selectedEngagement?.homeSideTeamSize ?? 0
  const focusedKills = focusEvidence?.kills ?? selectedEngagement?.homeKills ?? 0
  const focusedDeaths = focusEvidence?.deaths ?? selectedEngagement?.homeDeaths ?? 0
  const focusedKillFame = focusEvidence?.killFame ?? selectedEngagement?.homeKillFame ?? 0
  const players = data.report.players.slice(0, 60)

  return (
    <PublicZvzRecordChrome>
      <PublicZvzRecordHeader
        boardHref={backHref}
        backLabel={t(selectedEngagement ? 'backToScoreEvidence' : 'backToBoard')}
        eyebrow={t(selectedEngagement ? 'engagementReportEyebrow' : 'battleReportEyebrow')}
        title={pageTitle}
        subtitle={selectedEngagement
          ? t('engagementReportSubtitle', {
              server: boardT(`server_${route.server}`),
              id: battleId,
              count: selectedEngagement.sequence,
              time: formatPublicZvzDateTime(selectedEngagement.startedAt, locale),
            })
          : t('battleReportSubtitle', {
              server: boardT(`server_${route.server}`),
              id: battleId,
              time: formatPublicZvzDateTime(data.report.startedAt, locale),
            })}
        badges={
          <span className={`inline-flex min-h-8 items-center rounded-sm px-2.5 text-xs font-semibold ${data.isOfficial ? 'bg-emerald-400/10 text-emerald-200' : 'bg-white/[0.06] text-gray-300'}`}>
            {t(data.isOfficial ? 'officialBattleBadge' : 'unrankedBattleBadge')}
          </span>
        }
        actions={<PublicZvzShareButton label={t('shareReport')} copiedLabel={t('copyLink')} />}
      />

      {selectedEngagement ? (
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-sky-300/[0.045] p-4 shadow-[0_0_0_1px_rgba(125,211,252,0.16)]">
            <p className="flex items-center gap-2 text-xs font-semibold text-sky-200/70"><Users size={14} />{t('engagementParticipantsMetric')}</p>
            <p className="mt-2 text-2xl font-black tabular-nums text-white">{formatPublicZvzNumber(focusedPlayers)}</p>
          </div>
          <div className="rounded-xl bg-white/[0.035] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.09)]">
            <p className="flex items-center gap-2 text-xs font-semibold text-gray-500"><Swords size={14} />{t('kdMetric')}</p>
            <div className="mt-2"><PublicZvzKdScore kills={focusedKills} deaths={focusedDeaths} label={t('kdMetric')} size="lg" /></div>
          </div>
          <div className="rounded-xl bg-amber-300/[0.04] p-4 shadow-[0_0_0_1px_rgba(252,211,77,0.14)]">
            <p className="flex items-center gap-2 text-xs font-semibold text-amber-200/70"><Activity size={14} />{t('killFameMetric')}</p>
            <p className="mt-2 text-2xl font-black tabular-nums text-white">{formatPublicZvzNumber(focusedKillFame)}</p>
          </div>
        </section>
      ) : (
        <section className="grid gap-3 sm:grid-cols-3">
          {[
            [Users, boardT('playersMetric'), data.report.totalPlayersUnique],
            [Swords, boardT('killsMetric'), data.report.totalKills],
            [Activity, boardT('fameMetric'), data.report.totalFame],
          ].map(([Icon, label, value]) => {
            const MetricIcon = Icon as typeof Users
            return (
              <div key={String(label)} className="rounded-xl bg-white/[0.035] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.09)]">
                <p className="flex items-center gap-2 text-xs font-semibold text-gray-500"><MetricIcon size={14} />{String(label)}</p>
                <p className="mt-2 text-2xl font-black tabular-nums text-white">{formatPublicZvzNumber(Number(value))}</p>
              </div>
            )
          })}
        </section>
      )}

      {!selectedEngagement ? <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-xl font-black text-white">{t('engagementsTitle')}</h2>
          <Link href={`${paths.zvzBattles}/methodology`} className="text-sm font-semibold text-amber-200 hover:text-amber-100">{t('methodologyLink')}</Link>
        </div>
        <div className="mt-4 grid gap-4">
          {displayedEngagements.map((engagement, index) => (
            <article key={engagement.id} className="rounded-2xl bg-white/[0.035] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.09)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-200">{t('engagementNumber', { count: engagement.sequence ?? index + 1 })}</p>
                  <h3 className="mt-1 text-lg font-black text-white">{engagement.homeForceName}</h3>
                  <p className="mt-1 text-xs text-gray-500">{t('sideSizeLabel', { home: engagement.homeSideTeamSize, opponent: engagement.opponentSideTeamSize })}</p>
                  {engagement.status === 'final' ? (
                    <div className="mt-2">
                      <PublicZvzScaleRankingBadge
                        eligible={engagement.scaleRankingEligible}
                        includedLabel={t('scaleRankingIncludedBadge')}
                        excludedLabel={t('scaleRankingExcludedBadge')}
                        hint={t('scaleRankingEligibilityHint')}
                      />
                    </div>
                  ) : null}
                </div>
                <p className="text-right font-black text-white">
                  {t(resultKey(engagement.result))}
                </p>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-black/20 p-3">
                  <p className="text-xs text-gray-500">{t('kdMetric')}</p>
                  <div className="mt-1">
                    <PublicZvzKdScore
                      kills={engagement.homeKills}
                      deaths={engagement.homeDeaths}
                      label={t('kdMetric')}
                    />
                  </div>
                </div>
                <div className="rounded-lg bg-black/20 p-3"><p className="text-xs text-gray-500">{t('killFameMetric')}</p><p className="mt-1 font-black tabular-nums text-white">{formatPublicZvzNumber(engagement.homeKillFame)}</p></div>
                <div className="rounded-lg bg-black/20 p-3"><p className="text-xs text-gray-500">{boardT(`division_${engagement.scale}`)}</p><p className="mt-1 text-sm font-bold text-white">{t('eventsLabel', { result: engagement.resultEventCount, intervention: engagement.interventionEventCount })}</p></div>
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {engagement.matchups.map((matchup) => {
                  const href = matchup.opponentForceKind === 'alliance'
                    ? buildPublicZvzAllianceRecordHref({ basePath: paths.zvzBattles, server: data.server, allianceAlbionId: matchup.opponentAlbionId })
                    : buildPublicZvzGuildRecordHref({ basePath: paths.zvzBattles, server: data.server, guildAlbionId: matchup.opponentAlbionId })
                  return <Link key={`${engagement.id}:${matchup.opponentAlbionId}`} href={href} className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-3 hover:bg-white/[0.06]"><span className="min-w-0 truncate text-sm font-bold text-white">{matchup.opponentName}</span><span className={`ml-3 shrink-0 rounded-sm px-2 py-1 text-[10px] font-semibold ${matchup.role === 'intervention' ? 'bg-rose-400/10 text-rose-200' : 'bg-emerald-400/10 text-emerald-200'}`}>{t(matchup.role === 'intervention' ? 'interventionBadge' : 'resultEligibleBadge')} · {matchup.opponentTeamSize}</span></Link>
                })}
              </div>
            </article>
          ))}
        </div>
      </section> : null}

      {selectedEngagement && detailReportPromise ? (
        <section className="mt-8 border-t border-white/[0.1] pt-7">
          <h2 className="text-xl font-black text-white text-balance sm:text-2xl">
            {t('engagementAnalysisTitle')}
          </h2>
          <Suspense
            fallback={
              <div className="mt-5 min-h-64 animate-pulse rounded-xl bg-white/[0.025] px-5 py-10 text-center text-sm text-gray-500 shadow-[0_0_0_1px_rgba(255,255,255,0.08)] motion-reduce:animate-none">
                {detailT('loadingAnalysis')}
              </div>
            }
          >
            <div className="mt-5">
              <EngagementDetailAnalysis
                reportPromise={detailReportPromise}
                engagement={selectedEngagement}
                initialGroup={initialGroup}
                unavailableLabel={t('engagementAnalysisUnavailable')}
              />
            </div>
          </Suspense>
        </section>
      ) : null}

      {!selectedEngagement ? <section className="mt-8 rounded-2xl bg-white/[0.025] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
        <h2 className="text-xl font-black text-white">{t('participantsTitle')}</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[42rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-gray-500"><tr><th className="pb-3">{t('playerColumn')}</th><th className="pb-3">{t('forceColumn')}</th><th className="pb-3 text-right">{t('kdMetric')}</th><th className="pb-3 text-right">{t('killFameMetric')}</th></tr></thead>
            <tbody className="divide-y divide-white/[0.06]">
              {players.map((player) => (
                <tr key={player.playerId}>
                  <td className="py-3 font-bold text-white">{player.playerName}</td>
                  <td className="py-3 text-gray-400">{player.guildName}</td>
                  <td className="py-3 text-right">
                    <PublicZvzKdScore
                      kills={player.kills}
                      deaths={player.deaths}
                      label={t('kdMetric')}
                      size="sm"
                    />
                  </td>
                  <td className="py-3 text-right tabular-nums text-gray-200">
                    {formatPublicZvzNumber(player.killFame)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section> : null}
    </PublicZvzRecordChrome>
  )
}
