import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ExternalLink,
  Info,
  Shield,
  Swords,
  Users,
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
  loadPublicAllianceZvzRecord,
  loadPublicAllianceZvzSeasonRecord,
} from '@/lib/public-zvz-records'
import { getCanonicalOrigin } from '@/lib/seo-metadata'
import type { PublicZvzSeasonSummary } from '@/lib/public-zvz-seasons'
import {
  formatPublicZvzCompact,
  formatPublicZvzDateTime,
  formatPublicZvzDecimal,
  formatPublicZvzNumber,
  PublicZvzBattleMatchupCard,
  PublicZvzMetricGrid,
  PublicZvzRecordChrome,
  PublicZvzRecordHeader,
  PublicZvzSeasonHistorySelector,
  PublicZvzWeekSelector,
} from '../../../record-ui'

export const dynamic = 'force-dynamic'

interface AllianceRecordPageProps {
  params: Promise<{ server: string; allianceId: string }>
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
}: AllianceRecordPageProps): Promise<Metadata> {
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
    ? loadPublicAllianceZvzSeasonRecord(
        route.server,
        route.allianceId,
        seasonId,
        requestedAsOf,
      )
    : loadPublicAllianceZvzRecord(route.server, route.allianceId, requestedWeek)
  ).catch(() => null)
  if (!record) {
    return { title: t('notFoundTitle'), robots: { index: false, follow: false } }
  }

  const paths = getMarketingPathsForEnvironment(locale)
  const canonicalUrl = canonicalRecordUrl(
    buildPublicZvzAllianceRecordHref({
      basePath: paths.zvzBattles,
      server: record.server,
      allianceAlbionId: record.allianceAlbionId,
      weekStart: record.weekStart,
      seasonId: record.season?.season.id,
      asOfDate: record.season?.snapshot.snapshotDate,
    }),
  )
  const title = t(
    record.season ? 'allianceSeasonMetaTitle' : 'allianceMetaTitle',
    { alliance: record.allianceName },
  )
  const description = record.season
    ? t('allianceSeasonMetaDescription', {
        alliance: record.allianceName,
        season: record.season.season.name,
        date: record.season.snapshot.snapshotDate,
      })
    : t('allianceMetaDescription', {
        alliance: record.allianceName,
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

export default async function PublicAllianceZvzRecordPage({
  params,
  searchParams,
}: AllianceRecordPageProps) {
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
    ? await loadPublicAllianceZvzSeasonRecord(
        route.server,
        route.allianceId,
        seasonId,
        requestedAsOf,
      )
    : await loadPublicAllianceZvzRecord(route.server, route.allianceId, requestedWeek)
  if (!record) notFound()

  const season = record.season

  const allianceRecordHref = (weekStart: string) => (
    buildPublicZvzAllianceRecordHref({
      basePath: paths.zvzBattles,
      server: record.server,
      allianceAlbionId: record.allianceAlbionId,
      weekStart,
    })
  )
  const allianceSeasonHref = (targetSeason: PublicZvzSeasonSummary) => {
    const targetDate = targetSeason.endsOn
      ? (() => {
          const date = new Date(`${targetSeason.endsOn}T00:00:00.000Z`)
          date.setUTCDate(date.getUTCDate() - 1)
          return date.toISOString().slice(0, 10)
        })()
      : new Date().toISOString().slice(0, 10)
    return buildPublicZvzAllianceRecordHref({
      basePath: paths.zvzBattles,
      server: record.server,
      allianceAlbionId: record.allianceAlbionId,
      seasonId: targetSeason.id,
      asOfDate: targetDate,
    })
  }
  const recordActionHref = buildPublicZvzAllianceRecordHref({
    basePath: paths.zvzBattles,
    server: record.server,
    allianceAlbionId: record.allianceAlbionId,
  })
  const boardQuery = new URLSearchParams({ server: record.server })
  if (season) {
    boardQuery.set('season', season.season.id)
    boardQuery.set('asOf', season.snapshot.snapshotDate)
  }
  const guildsById = new Map(
    record.participatingGuilds.map((guild) => [guild.guildAlbionId, guild]),
  )

  return (
    <PublicZvzRecordChrome>
      <PublicZvzRecordHeader
        boardHref={`${paths.zvzBattles}?${boardQuery.toString()}`}
        backLabel={t('backToBoard')}
        eyebrow={t(season ? 'allianceSeasonEyebrow' : 'allianceEyebrow')}
        title={record.allianceName}
        subtitle={season
          ? t('allianceSeasonSubtitle', {
              season: season.season.name,
              start: season.season.startsOn,
              date: season.snapshot.snapshotDate,
              server: boardT(`server_${record.server}`),
            })
          : t('allianceSubtitle', {
              week: record.weekStart,
              server: boardT(`server_${record.server}`),
            })}
        badges={
          <>
            <span className="inline-flex min-h-8 items-center gap-1.5 rounded-sm bg-violet-400/10 px-2.5 text-xs font-semibold text-violet-200">
              <Shield size={13} />
              {t('battleTimeAlliance')}
            </span>
            <span className="inline-flex min-h-8 items-center rounded-sm bg-white/[0.06] px-2.5 text-xs font-semibold text-gray-300">
              {t('publicDataBadge')}
            </span>
          </>
        }
      />

      <PublicZvzMetricGrid
        metrics={[
          {
            label: t('battlesMetric'),
            value: formatPublicZvzNumber(record.battles),
          },
          {
            label: t('kdMetric'),
            value: `${formatPublicZvzNumber(record.kills)} / ${formatPublicZvzNumber(record.deaths)}`,
          },
          {
            label: t('killFameMetric'),
            value: formatPublicZvzCompact(record.killFame),
          },
          {
            label: t('avgForceMetric'),
            value: formatPublicZvzDecimal(record.avgForceSize),
          },
          {
            label: t('participatingGuildsMetric'),
            value: formatPublicZvzNumber(record.participatingGuilds.length),
          },
        ]}
      />

      <div className="mt-4 flex items-start gap-2 rounded-lg bg-sky-400/[0.07] p-4 text-sm leading-6 text-sky-100 shadow-[0_0_0_1px_rgba(125,211,252,0.16)]">
        <Info size={17} className="mt-0.5 shrink-0" />
        <p>{t(season ? 'allianceSeasonNoRankNotice' : 'allianceNoRankNotice')}</p>
      </div>

      {season ? (
        <PublicZvzSeasonHistorySelector
          context={season}
          actionHref={recordActionHref}
          hrefForSeason={allianceSeasonHref}
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
          hrefForWeek={allianceRecordHref}
        />
      )}

      <section className="mt-9">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-emerald-200" />
          <h2 className="text-xl font-black text-white">{t('participatingGuildsTitle')}</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-gray-400">
          {t('participatingGuildsBody')}
        </p>
        <div className="mt-4 overflow-x-auto rounded-lg shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
          <table className="min-w-[720px] w-full border-collapse bg-[#0b0f16]/90 text-sm">
            <thead className="bg-white/[0.04] text-left text-[11px] uppercase tracking-[0.14em] text-gray-500">
              <tr>
                <th className="px-4 py-3 font-semibold">{t('guildColumn')}</th>
                <th className="px-4 py-3 text-right font-semibold">{t('battlesMetric')}</th>
                <th className="px-4 py-3 text-right font-semibold">{t('kdMetric')}</th>
                <th className="px-4 py-3 text-right font-semibold">{t('killFameMetric')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {record.participatingGuilds.map((guild) => {
                const guildHref = buildPublicZvzGuildRecordHref({
                  basePath: paths.zvzBattles,
                  server: record.server,
                  guildAlbionId: guild.guildAlbionId,
                  weekStart: record.weekStart,
                  seasonId: season?.season.id,
                  asOfDate: season?.snapshot.snapshotDate,
                })
                const profileHref =
                  guild.tenantSlug && guild.tenantProfileEnabled
                    ? `${paths.guildPage}/${encodeURIComponent(guild.tenantSlug)}`
                    : null
                return (
                  <tr key={guild.guildAlbionId} className="hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={guildHref}
                          className="font-semibold text-white underline-offset-4 hover:text-amber-100 hover:underline"
                        >
                          {guild.guildName}
                        </Link>
                        {profileHref ? (
                          <Link
                            href={profileHref}
                            aria-label={t('openAgmGuildNamed', { guild: guild.guildName })}
                            className="inline-flex min-h-8 items-center gap-1 rounded-sm bg-emerald-400/10 px-2 text-[10px] font-bold text-emerald-200 hover:bg-emerald-400/20"
                          >
                            AGM
                            <ExternalLink size={11} />
                          </Link>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-200">
                      {formatPublicZvzNumber(guild.battles)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-200">
                      {formatPublicZvzNumber(guild.kills)} / {formatPublicZvzNumber(guild.deaths)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-200">
                      {formatPublicZvzCompact(guild.killFame)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-center gap-2">
          <Swords size={18} className="text-sky-200" />
          <h2 className="text-xl font-black text-white">{t('allianceBattleEvidenceTitle')}</h2>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
          {t(
            season
              ? 'allianceSeasonBattleEvidenceBody'
              : 'allianceBattleEvidenceBody',
            { count: record.battleEvidence.length },
          )}
        </p>

        <div className="mt-4 grid gap-3">
          {record.battleEvidence.map((battle) => (
            <PublicZvzBattleMatchupCard
              key={battle.battleRecordId}
              startedAt={battle.startedAt}
              locale={locale}
              subjectName={record.allianceName}
              subjectLabel={t('allianceForceLabel')}
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
                <div>
                  <p className="mb-2 text-xs font-semibold text-gray-400">
                    {t('scoreIncludedGuildsTitle')}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {battle.guilds.map((guild) => {
                      const knownGuild = guildsById.get(guild.guildAlbionId)
                      return (
                        <Link
                          key={guild.guildAlbionId}
                          href={buildPublicZvzGuildRecordHref({
                            basePath: paths.zvzBattles,
                            server: record.server,
                            guildAlbionId: guild.guildAlbionId,
                            weekStart: record.weekStart,
                            seasonId: season?.season.id,
                            asOfDate: season?.snapshot.snapshotDate,
                          })}
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-white/[0.05] px-2.5 py-1 text-xs text-gray-200 underline-offset-4 transition-[background-color,color,scale] duration-150 ease-out hover:bg-emerald-400/10 hover:text-emerald-100 hover:underline active:scale-[0.96]"
                        >
                          <span className="max-w-[180px] truncate">
                            {knownGuild?.guildName ?? guild.guildName}
                          </span>
                          <span className="tabular-nums text-gray-500">{guild.teamSize}</span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
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
