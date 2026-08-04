import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  BarChart3,
  ExternalLink,
  Shield,
  Swords,
} from 'lucide-react'
import BattlelogPausedPanel from '@/components/BattlelogPausedPanel'
import { isAlbionServer } from '@/lib/albion-gameinfo'
import { getMarketingPathsForEnvironment } from '@/lib/marketing-paths'
import {
  getMarketingLocale,
  getMarketingTranslator,
} from '@/lib/marketing-static-intl'
import { arePublicAgmBattlesAvailable } from '@/lib/public-agm-battles-visibility'
import {
  buildPublicZvzAllianceRecordHref,
  buildPublicZvzGuildRecordHref,
  normalizePublicZvzDate,
  normalizePublicZvzSeasonId,
  normalizePublicZvzWeekStart,
} from '@/lib/public-zvz-record-links'
import {
  loadPublicGuildZvzRecord,
  loadPublicGuildZvzSeasonRecord,
} from '@/lib/public-zvz-records'
import { getCanonicalOrigin } from '@/lib/seo-metadata'
import type { PublicZvzSeasonSummary } from '@/lib/public-zvz-seasons'
import {
  formatPublicZvzDateTime,
  formatPublicZvzDecimal,
  formatPublicZvzNumber,
  formatPublicZvzScoreComponent,
  PublicZvzBattleMatchupCard,
  PublicZvzMetricGrid,
  PublicZvzRecordChrome,
  PublicZvzRecordHeader,
  PublicZvzSeasonHistorySelector,
  PublicZvzWeekSelector,
} from '../../../record-ui'

export const dynamic = 'force-dynamic'

interface GuildRecordPageProps {
  params: Promise<{ server: string; guildId: string }>
  searchParams: Promise<{
    week?: string | string[]
    season?: string | string[]
    asOf?: string | string[]
  }>
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function canonicalRecordUrl(href: string): string {
  const pathname = href.startsWith('/public/')
    ? href.slice('/public'.length)
    : href
  return `${getCanonicalOrigin()}${pathname}`
}

export async function generateMetadata({
  params,
  searchParams,
}: GuildRecordPageProps): Promise<Metadata> {
  const [route, query, locale, t] = await Promise.all([
    params,
    searchParams,
    getMarketingLocale(),
    getMarketingTranslator('publicZvzRecords'),
  ])
  if (!isAlbionServer(route.server)) {
    return { title: t('notFoundTitle'), robots: { index: false, follow: false } }
  }

  const seasonId = normalizePublicZvzSeasonId(firstParam(query.season))
  const requestedAsOf = normalizePublicZvzDate(firstParam(query.asOf))
  const requestedWeek = normalizePublicZvzWeekStart(firstParam(query.week))
  const record = await (seasonId
    ? loadPublicGuildZvzSeasonRecord(
        route.server,
        route.guildId,
        seasonId,
        requestedAsOf,
      )
    : loadPublicGuildZvzRecord(route.server, route.guildId, requestedWeek)
  ).catch(() => null)
  if (!record) {
    return { title: t('notFoundTitle'), robots: { index: false, follow: false } }
  }

  const paths = getMarketingPathsForEnvironment(locale)
  const canonicalUrl = canonicalRecordUrl(
    buildPublicZvzGuildRecordHref({
      basePath: paths.zvzBattles,
      server: record.server,
      guildAlbionId: record.guildAlbionId,
      weekStart: record.weekStart,
      seasonId: record.season?.season.id,
      asOfDate: record.season?.snapshot.snapshotDate,
    }),
  )
  const title = t(record.season ? 'guildSeasonMetaTitle' : 'guildMetaTitle', {
    guild: record.guildName,
  })
  const description = record.season
    ? t('guildSeasonMetaDescription', {
        guild: record.guildName,
        season: record.season.season.name,
        date: record.season.snapshot.snapshotDate,
      })
    : t('guildMetaDescription', {
        guild: record.guildName,
        week: record.weekStart,
      })

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: { index: false, follow: false, noimageindex: true },
    },
    openGraph: {
      type: 'website',
      title,
      description,
      url: canonicalUrl,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}

export default async function PublicGuildZvzRecordPage({
  params,
  searchParams,
}: GuildRecordPageProps) {
  const [route, query, locale, t, boardT] = await Promise.all([
    params,
    searchParams,
    getMarketingLocale(),
    getMarketingTranslator('publicZvzRecords'),
    getMarketingTranslator('publicZvzBattles'),
  ])
  const paths = getMarketingPathsForEnvironment(locale)

  if (!arePublicAgmBattlesAvailable()) {
    return (
      <PublicZvzRecordChrome>
        <BattlelogPausedPanel
          eyebrow={boardT('pausedEyebrow')}
          title={boardT('pausedTitle')}
          body={boardT('pausedBody')}
          detail={boardT('pausedDetail')}
        />
      </PublicZvzRecordChrome>
    )
  }

  if (!isAlbionServer(route.server)) notFound()
  const seasonId = normalizePublicZvzSeasonId(firstParam(query.season))
  const requestedAsOf = normalizePublicZvzDate(firstParam(query.asOf))
  const requestedWeek = normalizePublicZvzWeekStart(firstParam(query.week))
  const record = seasonId
    ? await loadPublicGuildZvzSeasonRecord(
        route.server,
        route.guildId,
        seasonId,
        requestedAsOf,
      )
    : await loadPublicGuildZvzRecord(route.server, route.guildId, requestedWeek)
  if (!record) notFound()

  const season = record.season

  const guildRecordHref = (weekStart: string) => (
    buildPublicZvzGuildRecordHref({
      basePath: paths.zvzBattles,
      server: record.server,
      guildAlbionId: record.guildAlbionId,
      weekStart,
    })
  )
  const guildSeasonHref = (targetSeason: PublicZvzSeasonSummary) => {
    const targetDate = targetSeason.endsOn
      ? (() => {
          const date = new Date(`${targetSeason.endsOn}T00:00:00.000Z`)
          date.setUTCDate(date.getUTCDate() - 1)
          return date.toISOString().slice(0, 10)
        })()
      : new Date().toISOString().slice(0, 10)
    return buildPublicZvzGuildRecordHref({
      basePath: paths.zvzBattles,
      server: record.server,
      guildAlbionId: record.guildAlbionId,
      seasonId: targetSeason.id,
      asOfDate: targetDate,
    })
  }
  const profileHref =
    record.tenantSlug && record.tenantProfileEnabled
      ? `${paths.guildPage}/${encodeURIComponent(record.tenantSlug)}`
      : null
  const boardQuery = new URLSearchParams({ server: record.server })
  if (season) {
    boardQuery.set('season', season.season.id)
    boardQuery.set('asOf', season.snapshot.snapshotDate)
  }
  const boardHref = `${paths.zvzBattles}?${boardQuery.toString()}`
  const recordActionHref = buildPublicZvzGuildRecordHref({
    basePath: paths.zvzBattles,
    server: record.server,
    guildAlbionId: record.guildAlbionId,
  })
  const ranked = record.sampleStatus === 'ranked'
  const scoreComponents = record.scoreBreakdown.formulaVersion === 'agm_zvz_v2'
    ? [
        {
          label: t('v2SizePoints'),
          formula: t('v2SizeFormula', {
            size: formatPublicZvzDecimal(record.avgForceSize),
          }),
          points: record.scoreBreakdown.sizePoints ?? 0,
          negative: false,
        },
        {
          label: t('v2CombatPoints'),
          formula: t('v2CombatFormula'),
          points: record.scoreBreakdown.combatPoints ?? 0,
          negative: false,
        },
        {
          label: t('v2ActivityPoints'),
          formula: t('v2ActivityFormula'),
          points: record.scoreBreakdown.activityPoints ?? 0,
          negative: false,
        },
      ]
    : [
    {
      label: t('scoreBattlePoints'),
      formula: t('scoreBattleFormula', { count: record.zvzBattles }),
      points: record.scoreBreakdown.battlePoints,
      negative: false,
    },
    {
      label: t('scoreKillPoints'),
      formula: t('scoreKillFormula', { count: record.kills }),
      points: record.scoreBreakdown.killPoints,
      negative: false,
    },
    {
      label: t('scoreKdBonus'),
      formula: t('scoreKdBonusFormula', {
        count: Math.max(record.kills - record.deaths, 0),
      }),
      points: record.scoreBreakdown.kdBonusPoints,
      negative: false,
    },
    {
      label: t('scoreKillFame'),
      formula: t('scoreKillFameFormula', {
        fame: formatPublicZvzNumber(record.killFame),
      }),
      points: record.scoreBreakdown.killFamePoints,
      negative: false,
    },
    {
      label: t('scoreForceSize'),
      formula: t('scoreForceSizeFormula', {
        size: formatPublicZvzDecimal(record.avgForceSize),
      }),
      points: record.scoreBreakdown.forceSizePoints,
      negative: false,
    },
    {
      label: t('scoreDeathPenalty'),
      formula: t('scoreDeathPenaltyFormula', {
        count: Math.max(record.deaths - record.kills, 0),
      }),
      points: record.scoreBreakdown.deathPenaltyPoints,
      negative: true,
    },
      ]

  return (
    <PublicZvzRecordChrome>
      <PublicZvzRecordHeader
        boardHref={boardHref}
        backLabel={t('backToBoard')}
        eyebrow={t(season ? 'guildSeasonEyebrow' : 'guildEyebrow')}
        title={record.guildName}
        subtitle={season
          ? t('guildSeasonSubtitle', {
              season: season.season.name,
              start: season.season.startsOn,
              date: season.snapshot.snapshotDate,
              server: boardT(`server_${record.server}`),
            })
          : t('guildSubtitle', {
              week: record.weekStart,
              server: boardT(`server_${record.server}`),
            })}
        badges={
          <>
            <span className="inline-flex min-h-8 items-center rounded-sm bg-sky-400/10 px-2.5 text-xs font-semibold text-sky-200">
              {boardT(`division_${record.division}`)}
            </span>
            <span
              className={`inline-flex min-h-8 items-center rounded-sm px-2.5 text-xs font-semibold ${
                ranked
                  ? 'bg-emerald-400/10 text-emerald-200'
                  : 'bg-white/[0.06] text-gray-300'
              }`}
            >
              {ranked ? t('rankedSample') : t('insufficientSample')}
            </span>
            {record.allianceAlbionId && record.allianceName ? (
              <Link
                href={buildPublicZvzAllianceRecordHref({
                  basePath: paths.zvzBattles,
                  server: record.server,
                  allianceAlbionId: record.allianceAlbionId,
                  weekStart: record.weekStart,
                  seasonId: season?.season.id,
                  asOfDate: season?.snapshot.snapshotDate,
                })}
                className="inline-flex min-h-8 items-center rounded-sm bg-violet-400/10 px-2.5 text-xs font-semibold text-violet-200 underline-offset-4 hover:underline"
              >
                {record.allianceName}
              </Link>
            ) : null}
          </>
        }
        actions={
          profileHref ? (
            <Link
              href={profileHref}
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-emerald-300 px-4 text-sm font-bold text-slate-950 hover:bg-emerald-200"
            >
              {t('openAgmGuild')}
              <ExternalLink size={15} />
            </Link>
          ) : null
        }
      />

      <PublicZvzMetricGrid
        metrics={[
          {
            label: t('rankMetric'),
            value: ranked ? `#${record.rank}` : '—',
            hint: ranked
              ? season
                ? t('seasonServerRankHint', {
                    date: season.snapshot.snapshotDate,
                    change: season.rankDelta === null
                      ? t('rankDeltaNew')
                      : season.rankDelta > 0
                        ? `▲${season.rankDelta}`
                        : season.rankDelta < 0
                          ? `▼${Math.abs(season.rankDelta)}`
                          : '—',
                  })
                : t('serverRankHint')
              : t('notRankedHint'),
            tone: ranked ? 'text-amber-200' : 'text-gray-400',
          },
          {
            label: t(season ? 'seasonScoreMetric' : 'scoreMetric'),
            value: formatPublicZvzDecimal(record.score),
            hint: record.scoreBreakdown.formulaVersion,
          },
          {
            label: t('battlesMetric'),
            value: formatPublicZvzNumber(record.zvzBattles),
          },
          {
            label: t('kdMetric'),
            value: `${formatPublicZvzNumber(record.kills)} / ${formatPublicZvzNumber(record.deaths)}`,
          },
          {
            label: t('avgForceMetric'),
            value: formatPublicZvzDecimal(record.avgForceSize),
            hint: t('maxForceHint', { count: record.maxForceSize }),
          },
        ]}
      />

      {season ? (
        <PublicZvzSeasonHistorySelector
          context={season}
          actionHref={recordActionHref}
          hrefForSeason={guildSeasonHref}
          labels={{
            title: t('seasonHistoryTitle'),
            seasonLabel: t('seasonSelectorTitle'),
            dateLabel: t('asOfDateLabel'),
            apply: t('viewPastRanking'),
            final: t('snapshotFinal'),
            provisional: t('snapshotProvisional'),
            dataThrough: t('dataThrough', {
              time: formatPublicZvzDateTime(season.snapshot.dataThroughAt, locale),
            }),
          }}
        />
      ) : (
        <PublicZvzWeekSelector
          title={t('weekSelectorTitle')}
          selectedWeek={record.weekStart}
          weeks={record.availableWeeks}
          hrefForWeek={guildRecordHref}
        />
      )}

      <section className="mt-8">
        <div className="flex items-center gap-2">
          <BarChart3 size={18} className="text-amber-200" />
          <h2 className="text-xl font-black text-white">
            {t(season ? 'seasonScoreEvidenceTitle' : 'scoreEvidenceTitle')}
          </h2>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
          {t(season ? 'seasonScoreEvidenceBody' : 'scoreEvidenceBody')}
        </p>
        <div className="mt-4 overflow-hidden rounded-lg bg-[#0b0f16]/90 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
          <div className="grid gap-px bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-3">
            {scoreComponents.map((component) => (
              <div key={component.label} className="bg-[#0b0f16] p-4">
                <p className="text-xs font-semibold text-gray-300">{component.label}</p>
                <p className="mt-1 text-xs text-gray-500">{component.formula}</p>
                <p
                  className={`mt-3 tabular-nums text-xl font-black ${
                    component.negative ? 'text-rose-200' : 'text-emerald-200'
                  }`}
                >
                  {component.negative ? '−' : '+'}
                  {formatPublicZvzScoreComponent(component.points)}
                </p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-white/[0.08] px-4 py-4">
            <span className="text-sm font-bold text-white">
              {t(season ? 'finalSeasonScore' : 'finalScore')}
            </span>
            <span className="tabular-nums text-2xl font-black text-amber-200">
              {formatPublicZvzDecimal(record.score)}
            </span>
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-gray-500">
          {t(season ? 'noPerBattleSeasonPointsNotice' : 'noPerBattlePointsNotice')}
        </p>
      </section>

      <section className="mt-10">
        <div className="flex items-center gap-2">
          <Swords size={18} className="text-sky-200" />
          <h2 className="text-xl font-black text-white">
            {t(season ? 'seasonBattleEvidenceTitle' : 'battleEvidenceTitle')}
          </h2>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
          {t(season ? 'seasonBattleEvidenceBody' : 'battleEvidenceBody', {
            count: record.battles.length,
          })}
        </p>

        <div className="mt-4 grid gap-3">
          {record.battles.map((battle) => (
            <PublicZvzBattleMatchupCard
              key={battle.engagementId ?? battle.battleRecordId}
              startedAt={battle.startedAt}
              locale={locale}
              subjectName={battle.guildName}
              subjectLabel={t('guildForceLabel')}
              teamSize={battle.teamSize}
              kills={battle.kills}
              deaths={battle.deaths}
              killFame={battle.killFame}
              opponents={battle.opponents}
              basePath={paths.zvzBattles}
              server={record.server}
              weekStart={record.weekStart}
              seasonId={season?.season.id}
              asOfDate={season?.snapshot.snapshotDate}
              subjectContext={
                battle.sideTeamSize !== undefined ? (
                  <div className="space-y-3">
                    <dl className="grid grid-cols-3 gap-2 text-center text-[11px]">
                      <div>
                        <dt className="text-gray-500">{t('engagementSideSize')}</dt>
                        <dd className="mt-1 tabular-nums font-bold text-white">
                          {t('peopleCount', { count: battle.sideTeamSize })}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">{t('guildObservedSize')}</dt>
                        <dd className="mt-1 tabular-nums font-bold text-sky-200">
                          {t('peopleCount', { count: battle.teamSize })}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">{t('participationShareLabel')}</dt>
                        <dd className="mt-1 tabular-nums font-bold text-emerald-200">
                          {formatPublicZvzDecimal((battle.participationShare ?? 0) * 100)}%
                        </dd>
                      </div>
                    </dl>
                    {battle.allianceAlbionId && battle.allianceName ? (
                      <Link
                        href={buildPublicZvzAllianceRecordHref({
                          basePath: paths.zvzBattles,
                          server: record.server,
                          allianceAlbionId: battle.allianceAlbionId,
                          weekStart: record.weekStart,
                          seasonId: season?.season.id,
                          asOfDate: season?.snapshot.snapshotDate,
                        })}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-violet-400/10 px-2.5 py-1 text-xs font-semibold text-violet-200 underline-offset-4 hover:underline"
                      >
                        <Shield size={12} aria-hidden="true" />
                        {t('allianceAtBattle', { alliance: battle.allianceName })}
                      </Link>
                    ) : null}
                  </div>
                ) : battle.allianceAlbionId && battle.allianceName ? (
                  <Link
                    href={buildPublicZvzAllianceRecordHref({
                      basePath: paths.zvzBattles,
                      server: record.server,
                      allianceAlbionId: battle.allianceAlbionId,
                      weekStart: record.weekStart,
                      seasonId: season?.season.id,
                      asOfDate: season?.snapshot.snapshotDate,
                    })}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-violet-400/10 px-2.5 py-1 text-xs font-semibold text-violet-200 underline-offset-4 hover:underline"
                  >
                    <Shield size={12} aria-hidden="true" />
                    {t('allianceAtBattle', { alliance: battle.allianceName })}
                  </Link>
                ) : undefined
              }
              labels={{
                included: t('includedBadge'),
                battleId: t('battleId', { id: battle.albionBattleId }),
                totalPlayers: t('totalPlayers', { count: battle.totalPlayers }),
                versus: t('versusLabel'),
                opponents: t('opponentForcesTitle'),
                opponentCount: t('opponentCount', {
                  count: battle.opponents.length,
                }),
                force: t('forceMetric'),
                kd: t('kdMetric'),
                killFame: t('killFameMetric'),
                noOpponents: t('noOpponentSummary'),
              }}
            />
          ))}
        </div>
      </section>
    </PublicZvzRecordChrome>
  )
}
