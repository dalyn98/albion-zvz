import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  CheckCircle2,
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
  normalizePublicZvzWeekStart,
} from '@/lib/public-zvz-record-links'
import { loadPublicAllianceZvzRecord } from '@/lib/public-zvz-records'
import { getCanonicalOrigin } from '@/lib/seo-metadata'
import {
  formatPublicZvzCompact,
  formatPublicZvzDateTime,
  formatPublicZvzDecimal,
  formatPublicZvzNumber,
  PublicZvzMetricGrid,
  PublicZvzOpponentPills,
  PublicZvzRecordChrome,
  PublicZvzRecordHeader,
  PublicZvzWeekSelector,
} from '../../../record-ui'

export const dynamic = 'force-dynamic'

interface AllianceRecordPageProps {
  params: Promise<{ server: string; allianceId: string }>
  searchParams: Promise<{ week?: string | string[] }>
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

  const requestedWeek = normalizePublicZvzWeekStart(firstParam(query.week))
  const record = await loadPublicAllianceZvzRecord(
    route.server,
    route.allianceId,
    requestedWeek,
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
    }),
  )
  const title = t('allianceMetaTitle', { alliance: record.allianceName })
  const description = t('allianceMetaDescription', {
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
  const requestedWeek = normalizePublicZvzWeekStart(firstParam(query.week))
  const record = await loadPublicAllianceZvzRecord(
    route.server,
    route.allianceId,
    requestedWeek,
  )
  if (!record) notFound()

  const allianceRecordHref = (weekStart: string) => (
    buildPublicZvzAllianceRecordHref({
      basePath: paths.zvzBattles,
      server: record.server,
      allianceAlbionId: record.allianceAlbionId,
      weekStart,
    })
  )
  const guildsById = new Map(
    record.participatingGuilds.map((guild) => [guild.guildAlbionId, guild]),
  )

  return (
    <PublicZvzRecordChrome>
      <PublicZvzRecordHeader
        boardHref={`${paths.zvzBattles}?server=${record.server}`}
        backLabel={t('backToBoard')}
        eyebrow={t('allianceEyebrow')}
        title={record.allianceName}
        subtitle={t('allianceSubtitle', {
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
        <p>{t('allianceNoRankNotice')}</p>
      </div>

      <PublicZvzWeekSelector
        title={t('weekSelectorTitle')}
        selectedWeek={record.weekStart}
        weeks={record.availableWeeks}
        hrefForWeek={allianceRecordHref}
      />

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
          {t('allianceBattleEvidenceBody', { count: record.battleEvidence.length })}
        </p>

        <div className="mt-4 grid gap-3">
          {record.battleEvidence.map((battle) => (
            <article
              key={battle.battleRecordId}
              className="rounded-lg bg-[#0b0f16]/90 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-sm bg-emerald-400/10 px-2 py-1 text-[11px] font-bold text-emerald-200">
                      <CheckCircle2 size={12} />
                      {t('includedBadge')}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatPublicZvzDateTime(battle.startedAt, locale)}
                    </span>
                  </div>
                  <h3 className="mt-2 text-lg font-bold text-white">
                    {battle.clusterName ?? t('unknownCluster')}
                  </h3>
                  <p className="mt-1 text-xs text-gray-500">
                    {t('battleId', { id: battle.albionBattleId })}
                    <span className="mx-1.5">·</span>
                    {t('totalPlayers', { count: battle.totalPlayers })}
                  </p>
                </div>

                <dl className="grid grid-cols-3 gap-4 text-right">
                  <div>
                    <dt className="text-[10px] uppercase tracking-[0.12em] text-gray-500">
                      {t('forceMetric')}
                    </dt>
                    <dd className="mt-1 tabular-nums text-sm font-bold text-white">
                      {formatPublicZvzNumber(battle.teamSize)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-[0.12em] text-gray-500">
                      {t('kdMetric')}
                    </dt>
                    <dd className="mt-1 tabular-nums text-sm font-bold text-white">
                      {formatPublicZvzNumber(battle.kills)}/{formatPublicZvzNumber(battle.deaths)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-[0.12em] text-gray-500">
                      {t('killFameMetric')}
                    </dt>
                    <dd className="mt-1 tabular-nums text-sm font-bold text-white">
                      {formatPublicZvzCompact(battle.killFame)}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="mt-4 grid gap-4 border-t border-white/[0.07] pt-4 md:grid-cols-2">
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
                          })}
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-sm bg-white/[0.05] px-2.5 py-1 text-xs text-gray-200 underline-offset-4 hover:bg-emerald-400/10 hover:text-emerald-100 hover:underline"
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
                <div>
                  <p className="mb-2 text-xs font-semibold text-gray-400">
                    {t('opponentForcesTitle')}
                  </p>
                  {battle.opponents.length > 0 ? (
                    <PublicZvzOpponentPills
                      opponents={battle.opponents}
                      basePath={paths.zvzBattles}
                      server={record.server}
                      weekStart={record.weekStart}
                    />
                  ) : (
                    <p className="text-xs text-gray-500">{t('noOpponentSummary')}</p>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </PublicZvzRecordChrome>
  )
}
