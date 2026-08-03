import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Activity,
  BarChart3,
  Clock3,
  ExternalLink,
  Filter,
  ShieldCheck,
  Swords,
  Trophy,
  Users,
} from 'lucide-react'
import MarketingAttributionTracker from '@/components/MarketingAttributionTracker'
import MarketingNav from '@/components/MarketingNav'
import BattlelogPausedPanel from '@/components/BattlelogPausedPanel'
import { getMarketingPathsForEnvironment } from '@/lib/marketing-paths'
import { getMarketingLocale, getMarketingTranslator } from '@/lib/marketing-static-intl'
import { getCanonicalOrigin, getCanonicalUrlForPathname } from '@/lib/seo-metadata'
import { arePublicAgmBattlesAvailable } from '@/lib/public-agm-battles-visibility'
import { getUtcWeekStartDateString } from '@/lib/public-battlelog-sync'
import {
  buildPublicZvzAllianceRecordHref,
  buildPublicZvzGuildRecordHref,
  normalizePublicZvzDate,
  normalizePublicZvzSeasonId,
} from '@/lib/public-zvz-record-links'
import {
  loadPublicZvzBoardData,
  PUBLIC_ZVZ_DEFAULT_MIN_FORCE_SIZE,
  PUBLIC_ZVZ_MAX_FORCE_SIZE,
  PUBLIC_ZVZ_MIN_FORCE_SIZE,
  normalizePublicZvzMinPlayers,
  normalizePublicZvzServerFilter,
  type PublicBattleForce,
  type PublicRecentBattle,
  type PublicWeeklyZvzRanking,
  type PublicZvzDivision,
  type PublicZvzServerFilter,
} from '@/lib/public-zvz-battles'

export const dynamic = 'force-dynamic'

interface PageSearchParams {
  server?: string | string[]
  min?: string | string[]
  season?: string | string[]
  asOf?: string | string[]
}

const SERVER_FILTERS: Array<{ value: PublicZvzServerFilter; labelKey: string }> = [
  { value: null, labelKey: 'serverAll' },
  { value: 'west', labelKey: 'serverWest' },
  { value: 'europe', labelKey: 'serverEurope' },
  { value: 'east', labelKey: 'serverEast' },
]

const MIN_FORCE_FILTERS = [21, 18, 10] as const

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMarketingTranslator('publicZvzBattles')
  const canonicalUrl =
    getCanonicalUrlForPathname('/zvz-battles') ?? `${getCanonicalOrigin()}/zvz-battles`
  if (!arePublicAgmBattlesAvailable()) {
    return {
      title: t('metaTitle'),
      description: t('pausedBody'),
      alternates: { canonical: canonicalUrl },
      robots: {
        index: false,
        follow: false,
        nocache: true,
        googleBot: { index: false, follow: false, noimageindex: true },
      },
    }
  }
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: { canonical: canonicalUrl },
    openGraph: {
      type: 'website',
      title: t('metaTitle'),
      description: t('metaDescription'),
      url: canonicalUrl,
    },
    twitter: {
      card: 'summary_large_image',
      title: t('metaTitle'),
      description: t('metaDescription'),
    },
  }
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function previousUtcDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

function boardHref(
  basePath: string,
  server: PublicZvzServerFilter,
  minPlayers: number,
  seasonId?: string | null,
  asOfDate?: string | null,
): string {
  const query = new URLSearchParams()
  if (server) query.set('server', server)
  if (minPlayers !== PUBLIC_ZVZ_DEFAULT_MIN_FORCE_SIZE) {
    query.set('min', String(minPlayers))
  }
  if (server && seasonId) query.set('season', seasonId)
  if (asOfDate) query.set('asOf', asOfDate)
  const serialized = query.toString()
  return serialized ? `${basePath}?${serialized}` : basePath
}

function guildHref(basePath: string, slug: string): string {
  return `${basePath}/${slug}`
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en').format(value)
}

function formatDecimal(value: number): string {
  return new Intl.NumberFormat('en', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  }).format(value)
}

function formatDateTime(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).format(new Date(value))
}

function kdLabel(kills: number, deaths: number): string {
  return `${formatNumber(kills)} / ${formatNumber(deaths)}`
}

function divisionLabel(
  division: PublicZvzDivision,
  t: Awaited<ReturnType<typeof getMarketingTranslator>>,
): string {
  return t(`division_${division}`)
}

function RankDelta({
  value,
  t,
}: {
  value: number | null
  t: Awaited<ReturnType<typeof getMarketingTranslator>>
}) {
  if (value === null) {
    return (
      <span className="rounded-sm bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
        {t('rankDeltaNew')}
      </span>
    )
  }
  if (value === 0) {
    return <span className="text-[11px] text-gray-600">—</span>
  }
  const improved = value > 0
  return (
    <span
      title={improved
        ? t('rankDeltaUp', { count: value })
        : t('rankDeltaDown', { count: Math.abs(value) })}
      className={`text-[11px] font-bold tabular-nums ${
        improved ? 'text-emerald-300' : 'text-rose-300'
      }`}
    >
      {improved ? '▲' : '▼'}{Math.abs(value)}
    </span>
  )
}

function GuildLink({
  name,
  server,
  guildAlbionId,
  weekStart,
  seasonId,
  snapshotDate,
  tenantSlug,
  profileEnabled,
  recordBasePath,
  guildBasePath,
  claimedLabel,
  unclaimedLabel,
}: {
  name: string
  server: PublicWeeklyZvzRanking['server']
  guildAlbionId: string
  weekStart: string
  seasonId: string | null
  snapshotDate: string | null
  tenantSlug: string | null
  profileEnabled: boolean
  recordBasePath: string
  guildBasePath: string
  claimedLabel: string
  unclaimedLabel: string
}) {
  const recordHref = buildPublicZvzGuildRecordHref({
    basePath: recordBasePath,
    server,
    guildAlbionId,
    weekStart,
    seasonId,
    asOfDate: snapshotDate,
  })
  const profileHref =
    tenantSlug && profileEnabled ? guildHref(guildBasePath, tenantSlug) : null

  return (
    <span className="inline-flex min-h-10 flex-wrap items-center gap-1.5">
      <Link
        href={recordHref}
        className="group/guild inline-flex min-h-10 items-center gap-1.5 text-white underline-offset-4 hover:text-amber-200 hover:underline"
      >
        <span>{name}</span>
      </Link>
      {profileHref ? (
        <Link
          href={profileHref}
          aria-label={`${name} ${claimedLabel}`}
          className="inline-flex min-h-8 items-center gap-1 rounded-sm bg-emerald-400/10 px-1.5 text-[10px] font-semibold text-emerald-200 hover:bg-emerald-400/20"
        >
          <ExternalLink size={11} />
          {claimedLabel}
        </Link>
      ) : (
        <span className="rounded-sm bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-semibold text-gray-400">
          {unclaimedLabel}
        </span>
      )}
    </span>
  )
}

function AllianceLink({
  name,
  allianceAlbionId,
  server,
  weekStart,
  seasonId,
  snapshotDate,
  recordBasePath,
}: {
  name: string
  allianceAlbionId: string | null
  server: PublicWeeklyZvzRanking['server']
  weekStart: string
  seasonId: string | null
  snapshotDate: string | null
  recordBasePath: string
}) {
  if (!allianceAlbionId) {
    return <span className="text-xs text-gray-500">{name}</span>
  }
  return (
    <Link
      href={buildPublicZvzAllianceRecordHref({
        basePath: recordBasePath,
        server,
        allianceAlbionId,
        weekStart,
        seasonId,
        asOfDate: snapshotDate,
      })}
      className="inline-flex min-h-8 items-center text-xs text-gray-500 underline-offset-4 hover:text-violet-200 hover:underline"
    >
      {name}
    </Link>
  )
}

function RankingTable({
  rankings,
  recordBasePath,
  guildBasePath,
  t,
}: {
  rankings: PublicWeeklyZvzRanking[]
  recordBasePath: string
  guildBasePath: string
  t: Awaited<ReturnType<typeof getMarketingTranslator>>
}) {
  if (rankings.length === 0) {
    return (
      <div className="rounded-lg bg-white/[0.03] px-4 py-8 text-center shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
        <p className="text-sm font-semibold text-white">{t('emptyRankingsTitle')}</p>
        <p className="mt-2 text-sm text-gray-400">{t('emptyRankingsBody')}</p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-2 sm:hidden">
        {rankings.map((row) => (
          <article
            key={`${row.server}:${row.guildAlbionId}`}
            className="rounded-lg bg-[#0b0f16]/90 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="tabular-nums text-base font-black text-amber-200">#{row.rank}</span>
                  {row.periodKind === 'season' ? <RankDelta value={row.rankDelta} t={t} /> : null}
                </div>
                <div className="mt-1 flex flex-col">
                  <GuildLink
                    name={row.guildName}
                    server={row.server}
                    guildAlbionId={row.guildAlbionId}
                    weekStart={row.weekStart}
                    seasonId={row.seasonId}
                    snapshotDate={row.snapshotDate}
                    tenantSlug={row.tenantSlug}
                    profileEnabled={row.tenantProfileEnabled}
                    recordBasePath={recordBasePath}
                    guildBasePath={guildBasePath}
                    claimedLabel={t('agmGuild')}
                    unclaimedLabel={t('publicOnly')}
                  />
                  {row.allianceName && (
                    <AllianceLink
                      name={row.allianceName}
                      allianceAlbionId={row.allianceAlbionId}
                      server={row.server}
                      weekStart={row.weekStart}
                      seasonId={row.seasonId}
                      snapshotDate={row.snapshotDate}
                      recordBasePath={recordBasePath}
                    />
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5 text-xs">
                <span className="text-gray-300">{t(`server_${row.server}`)}</span>
                <span className="rounded-sm bg-sky-400/10 px-2 py-1 font-semibold text-sky-200">
                  {divisionLabel(row.division, t)}
                </span>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-xs">
              <div>
                <dt className="uppercase tracking-wide text-gray-500">{t('scoreColumn')}</dt>
                <dd className="mt-1 tabular-nums font-semibold text-white">{formatDecimal(row.score)}</dd>
              </div>
              <div>
                <dt className="uppercase tracking-wide text-gray-500">{t('battlesColumn')}</dt>
                <dd className="mt-1 tabular-nums text-gray-200">{formatNumber(row.zvzBattles)}</dd>
              </div>
              <div>
                <dt className="uppercase tracking-wide text-gray-500">{t('kdColumn')}</dt>
                <dd className="mt-1 tabular-nums text-gray-200">{kdLabel(row.kills, row.deaths)}</dd>
              </div>
              <div>
                <dt className="uppercase tracking-wide text-gray-500">{t('avgForceColumn')}</dt>
                <dd className="mt-1 tabular-nums text-gray-200">{formatDecimal(row.avgForceSize)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-lg shadow-[0_0_0_1px_rgba(255,255,255,0.08)] sm:block">
        <table className="min-w-[880px] w-full border-collapse bg-[#0b0f16]/90 text-sm">
          <thead className="bg-white/[0.04] text-left text-[11px] uppercase tracking-[0.16em] text-gray-400">
            <tr>
              <th className="px-4 py-3 font-semibold">{t('rankColumn')}</th>
              <th className="px-4 py-3 font-semibold">{t('guildColumn')}</th>
              <th className="px-4 py-3 font-semibold">{t('serverColumn')}</th>
              <th className="px-4 py-3 font-semibold">{t('divisionColumn')}</th>
              <th className="px-4 py-3 text-right font-semibold">{t('scoreColumn')}</th>
              <th className="px-4 py-3 text-right font-semibold">{t('battlesColumn')}</th>
              <th className="px-4 py-3 text-right font-semibold">{t('kdColumn')}</th>
              <th className="px-4 py-3 text-right font-semibold">{t('avgForceColumn')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {rankings.map((row) => (
              <tr key={`${row.server}:${row.guildAlbionId}`} className="hover:bg-white/[0.03]">
                <td className="px-4 py-3 align-middle">
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums text-base font-black text-amber-200">
                      #{row.rank}
                    </span>
                    {row.periodKind === 'season' ? <RankDelta value={row.rankDelta} t={t} /> : null}
                  </div>
                </td>
                <td className="px-4 py-3 align-middle">
                  <div className="flex flex-col">
                    <GuildLink
                      name={row.guildName}
                      server={row.server}
                      guildAlbionId={row.guildAlbionId}
                      weekStart={row.weekStart}
                      seasonId={row.seasonId}
                      snapshotDate={row.snapshotDate}
                      tenantSlug={row.tenantSlug}
                      profileEnabled={row.tenantProfileEnabled}
                      recordBasePath={recordBasePath}
                      guildBasePath={guildBasePath}
                      claimedLabel={t('agmGuild')}
                      unclaimedLabel={t('publicOnly')}
                    />
                    {row.allianceName && (
                      <AllianceLink
                        name={row.allianceName}
                        allianceAlbionId={row.allianceAlbionId}
                        server={row.server}
                        weekStart={row.weekStart}
                        seasonId={row.seasonId}
                        snapshotDate={row.snapshotDate}
                        recordBasePath={recordBasePath}
                      />
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 align-middle text-gray-300">{t(`server_${row.server}`)}</td>
                <td className="px-4 py-3 align-middle">
                  <span className="rounded-sm bg-sky-400/10 px-2 py-1 text-xs font-semibold text-sky-200">
                    {divisionLabel(row.division, t)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right align-middle tabular-nums text-white">
                  {formatDecimal(row.score)}
                </td>
                <td className="px-4 py-3 text-right align-middle tabular-nums text-gray-200">
                  {formatNumber(row.zvzBattles)}
                </td>
                <td className="px-4 py-3 text-right align-middle tabular-nums text-gray-200">
                  {kdLabel(row.kills, row.deaths)}
                </td>
                <td className="px-4 py-3 text-right align-middle tabular-nums text-gray-200">
                  {formatDecimal(row.avgForceSize)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function ForcePill({
  force,
  recordBasePath,
  server,
  weekStart,
  linkEnabled,
}: {
  force: PublicBattleForce
  recordBasePath: string
  server: PublicRecentBattle['server']
  weekStart: string
  linkEnabled: boolean
}) {
  const href = linkEnabled
    ? force.allianceId
      ? buildPublicZvzAllianceRecordHref({
          basePath: recordBasePath,
          server,
          allianceAlbionId: force.allianceId,
          weekStart,
        })
      : force.guildIds[0]
        ? buildPublicZvzGuildRecordHref({
            basePath: recordBasePath,
            server,
            guildAlbionId: force.guildIds[0],
            weekStart,
          })
        : null
    : null
  const content = (
    <>
      <span className="max-w-[180px] truncate">{force.forceName}</span>
      <span className="tabular-nums text-gray-400">{force.teamSize}</span>
    </>
  )
  return href ? (
    <Link
      href={href}
      className="inline-flex min-h-10 items-center gap-1 rounded-sm bg-white/[0.05] px-2 py-1 text-xs text-gray-200 underline-offset-4 hover:bg-violet-400/10 hover:text-violet-100 hover:underline"
    >
      {content}
    </Link>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-sm bg-white/[0.05] px-2 py-1 text-xs text-gray-200">
      {content}
    </span>
  )
}

function GuildForcePill({
  force,
  recordBasePath,
  server,
  weekStart,
  linkEnabled,
  claimedLabel,
}: {
  force: PublicBattleForce
  recordBasePath: string
  server: PublicRecentBattle['server']
  weekStart: string
  linkEnabled: boolean
  claimedLabel: string
}) {
  const link = force.guildLink
  const guildAlbionId = force.guildIds[0] ?? null
  const content = (
    <>
      <span className="max-w-[160px] truncate">{force.forceName}</span>
      <span className="tabular-nums text-gray-400">{force.teamSize}</span>
      {link?.tenantSlug && link.profileEnabled && (
        <span className="rounded-sm bg-emerald-400/10 px-1 py-0.5 text-[10px] text-emerald-200">
          {claimedLabel}
        </span>
      )}
    </>
  )

  if (linkEnabled && guildAlbionId) {
    return (
      <Link
        href={buildPublicZvzGuildRecordHref({
          basePath: recordBasePath,
          server,
          guildAlbionId,
          weekStart,
        })}
        className="inline-flex min-h-10 items-center gap-1 rounded-sm bg-white/[0.05] px-2 py-1 text-xs text-gray-100 underline-offset-4 hover:bg-emerald-400/10 hover:text-emerald-100 hover:underline"
      >
        {content}
      </Link>
    )
  }

  return (
    <span className="inline-flex min-h-10 items-center gap-1 rounded-sm bg-white/[0.05] px-2 py-1 text-xs text-gray-200">
      {content}
    </span>
  )
}

function BattleCard({
  battle,
  recordBasePath,
  locale,
  t,
}: {
  battle: PublicRecentBattle
  recordBasePath: string
  locale: string
  t: Awaited<ReturnType<typeof getMarketingTranslator>>
}) {
  const isZvZ = battle.activityKind === 'zvz'
  const weekStart = getUtcWeekStartDateString(new Date(battle.startedAt))
  const evidenceGuildIds = new Set(
    battle.topGuilds
      .filter((force) => force.teamSize >= 10)
      .flatMap((force) => force.guildIds),
  )

  return (
    <article className="rounded-lg bg-[#0b0f16]/90 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-sm px-2 py-1 text-[11px] font-bold ${
                isZvZ
                  ? 'bg-amber-400/15 text-amber-200'
                  : 'bg-white/[0.06] text-gray-300'
              }`}
            >
              {isZvZ ? t('agmZvzBadge') : t(`activity_${battle.activityKind}`)}
            </span>
            <span className="rounded-sm bg-sky-400/10 px-2 py-1 text-[11px] font-semibold text-sky-200">
              {t(`server_${battle.server}`)}
            </span>
            <span className="text-xs text-gray-500">
              {formatDateTime(battle.startedAt, locale)}
            </span>
          </div>
          <h3 className="mt-2 truncate text-lg font-bold text-white">
            {battle.clusterName ?? t('unknownCluster')}
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            {t('battleId', { id: battle.albionBattleId })}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 text-right">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">
              {t('playersMetric')}
            </p>
            <p className="tabular-nums text-sm font-bold text-white">
              {formatNumber(battle.totalPlayers)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">
              {t('killsMetric')}
            </p>
            <p className="tabular-nums text-sm font-bold text-white">
              {formatNumber(battle.totalKills)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">
              {t('fameMetric')}
            </p>
            <p className="tabular-nums text-sm font-bold text-white">
              {formatCompact(battle.totalFame)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold text-gray-400">{t('topForcesTitle')}</p>
          <div className="flex flex-wrap gap-1.5">
            {battle.topForces.map((force) => (
              <ForcePill
                key={force.forceKey}
                force={force}
                recordBasePath={recordBasePath}
                server={battle.server}
                weekStart={weekStart}
                linkEnabled={
                  isZvZ &&
                  force.guildIds.some((guildId) => evidenceGuildIds.has(guildId))
                }
              />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-gray-400">{t('topGuildsTitle')}</p>
          <div className="flex flex-wrap gap-1.5">
            {battle.topGuilds.map((force) => (
              <GuildForcePill
                key={force.forceKey}
                force={force}
                recordBasePath={recordBasePath}
                server={battle.server}
                weekStart={weekStart}
                linkEnabled={isZvZ && force.teamSize >= 10}
                claimedLabel={t('agmGuild')}
              />
            ))}
          </div>
        </div>
      </div>
    </article>
  )
}

export default async function PublicZvzBattlesPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>
}) {
  const [params, locale, t] = await Promise.all([
    searchParams,
    getMarketingLocale(),
    getMarketingTranslator('publicZvzBattles'),
  ])
  const server = normalizePublicZvzServerFilter(firstParam(params.server))
  const minPlayers = normalizePublicZvzMinPlayers(firstParam(params.min))
  const seasonId = normalizePublicZvzSeasonId(firstParam(params.season))
  const asOfDate = normalizePublicZvzDate(firstParam(params.asOf))
  const paths = getMarketingPathsForEnvironment(locale)
  if (!arePublicAgmBattlesAvailable()) {
    return (
      <>
        <MarketingAttributionTracker />
        <MarketingNav />
        <div className="min-h-screen bg-[#080b10] text-white">
          <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
            <BattlelogPausedPanel
              eyebrow={t('pausedEyebrow')}
              title={t('pausedTitle')}
              body={t('pausedBody')}
              detail={t('pausedDetail')}
            />
          </main>
        </div>
      </>
    )
  }

  const {
    rankingResult,
    recentBattles,
    rankingError,
    recentError,
  } = await loadPublicZvzBoardData({
    server,
    minPlayers,
    rankingLimit: 20,
    seasonId,
    asOfDate,
  })

  const rankings = rankingResult.rankings
  const seasonResult = rankingResult.seasonResult
  const primarySeasonSelection = seasonResult?.selections[0] ?? null
  const selectedSnapshotDate = primarySeasonSelection?.snapshot?.snapshotDate
    ?? seasonResult?.requestedDate
    ?? null
  const today = new Date().toISOString().slice(0, 10)
  const seasonDateMax = primarySeasonSelection?.season.endsOn
    ? previousUtcDate(primarySeasonSelection.season.endsOn)
    : today
  const rankedGuildCount = rankings.filter((row) => row.sampleStatus === 'ranked').length
  const tenantGuildCount = new Set(
    rankings
      .filter((row) => row.tenantSlug && row.tenantProfileEnabled)
      .map((row) => row.tenantSlug),
  ).size
  const recentZvzCount = recentBattles.filter((battle) => battle.activityKind === 'zvz').length

  const statCards = [
    {
      icon: Trophy,
      label: t('statRankedGuilds'),
      value: formatNumber(rankedGuildCount),
      tone: 'text-amber-200',
    },
    {
      icon: Swords,
      label: t('statRecentZvz'),
      value: formatNumber(recentZvzCount),
      tone: 'text-rose-200',
    },
    {
      icon: Activity,
      label: t('statRecentBattles'),
      value: formatNumber(recentBattles.length),
      tone: 'text-sky-200',
    },
    {
      icon: ShieldCheck,
      label: t('statAgmGuilds'),
      value: formatNumber(tenantGuildCount),
      tone: 'text-emerald-200',
    },
  ]

  return (
    <>
      <MarketingAttributionTracker />
      <MarketingNav active="battles" />
      <div className="min-h-screen bg-[#080b10] text-white">
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
          <section className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-end">
            <div className="max-w-3xl">
              <p className="inline-flex items-center gap-2 rounded-sm bg-amber-400/10 px-2.5 py-1 text-xs font-bold uppercase tracking-[0.2em] text-amber-200">
                <Swords size={14} />
                {t('eyebrow')}
              </p>
              <h1 className="mt-4 max-w-3xl text-balance text-3xl font-black leading-tight text-white sm:text-5xl">
                {t('title')}
              </h1>
              <p className="mt-4 max-w-2xl text-pretty text-sm leading-6 text-gray-300 sm:text-base">
                {t('lead')}
              </p>
            </div>

            <div className="rounded-lg bg-white/[0.03] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Filter size={16} className="text-sky-200" />
                {t('filtersTitle')}
              </div>
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {SERVER_FILTERS.map((item) => {
                    const active = item.value === server
                    return (
                      <Link
                        key={item.value ?? 'all'}
                        href={boardHref(
                          paths.zvzBattles,
                          item.value,
                          minPlayers,
                          item.value === server ? seasonId : null,
                          asOfDate,
                        )}
                        className={`inline-flex min-h-10 items-center rounded-md px-3 py-1.5 text-xs font-semibold transition-[background-color,color,box-shadow] ${
                          active
                            ? 'bg-sky-300 text-slate-950 shadow-[0_0_0_1px_rgba(125,211,252,0.35)]'
                            : 'bg-white/[0.05] text-gray-300 hover:bg-white/[0.09] hover:text-white'
                        }`}
                      >
                        {t(item.labelKey)}
                      </Link>
                    )
                  })}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {MIN_FORCE_FILTERS.map((value) => {
                    const active = value === minPlayers
                    return (
                      <Link
                        key={value}
                        href={boardHref(
                          paths.zvzBattles,
                          server,
                          value,
                          seasonId,
                          asOfDate,
                        )}
                        className={`inline-flex min-h-10 items-center rounded-md px-3 py-1.5 text-xs font-semibold transition-[background-color,color,box-shadow] ${
                          active
                            ? 'bg-amber-300 text-slate-950 shadow-[0_0_0_1px_rgba(252,211,77,0.35)]'
                            : 'bg-white/[0.05] text-gray-300 hover:bg-white/[0.09] hover:text-white'
                        }`}
                      >
                        {t('minForceFilter', { count: value })}
                      </Link>
                    )
                  })}
                </div>
                <form
                  action={paths.zvzBattles}
                  method="get"
                  className="flex flex-col gap-2 sm:flex-row"
                >
                  {server ? <input type="hidden" name="server" value={server} /> : null}
                  {server && seasonId ? (
                    <input type="hidden" name="season" value={seasonId} />
                  ) : null}
                  {asOfDate ? <input type="hidden" name="asOf" value={asOfDate} /> : null}
                  <label htmlFor="public-zvz-min-force" className="sr-only">
                    {t('minForceInputLabel')}
                  </label>
                  <input
                    id="public-zvz-min-force"
                    name="min"
                    type="number"
                    inputMode="numeric"
                    min={PUBLIC_ZVZ_MIN_FORCE_SIZE}
                    max={PUBLIC_ZVZ_MAX_FORCE_SIZE}
                    step={1}
                    defaultValue={minPlayers}
                    placeholder={t('minForceInputPlaceholder')}
                    aria-label={t('minForceInputLabel')}
                    autoComplete="off"
                    className="h-10 min-w-0 flex-1 rounded-md border border-white/[0.12] bg-black/25 px-3 text-sm tabular-nums text-white outline-none transition-[border-color,box-shadow] placeholder:text-gray-500 focus:border-amber-200 focus:shadow-[0_0_0_2px_rgba(252,211,77,0.18)]"
                  />
                  <button
                    type="submit"
                    className="inline-flex h-10 items-center justify-center rounded-md bg-amber-300 px-4 text-xs font-bold text-slate-950 transition-[background-color,box-shadow] hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100"
                  >
                    {t('applyFilters')}
                  </button>
                </form>
                <div className="rounded-md bg-black/20 px-3 py-2 text-xs leading-5 text-gray-400">
                  <span className="font-semibold text-gray-200">{t('currentFiltersTitle')}</span>
                  <span className="mx-1 text-gray-600">·</span>
                  <span>{server ? t(`server_${server}`) : t('serverAll')}</span>
                  <span className="mx-1 text-gray-600">·</span>
                  <span>{t('recentMinForceSummary', { count: minPlayers })}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {statCards.map((card) => {
              const Icon = card.icon
              return (
                <div
                  key={card.label}
                  className="rounded-lg bg-[#0b0f16]/90 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-gray-400">{card.label}</p>
                    <Icon size={17} className={card.tone} />
                  </div>
                  <p className="mt-3 tabular-nums text-2xl font-black text-white">
                    {card.value}
                  </p>
                </div>
              )
            })}
          </section>

          <section className="mt-10 border-y border-white/[0.08] py-8">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-amber-200">
                  <Trophy size={18} />
                  <h2 className="text-xl font-black text-white">
                    {rankingResult.periodKind === 'season'
                      ? t('seasonRankingTitle')
                      : t('rankingTitle')}
                  </h2>
                </div>
                <p className="mt-2 text-sm text-gray-400">
                  {rankingResult.periodKind === 'season'
                    ? server && primarySeasonSelection
                      ? t('seasonRankingSubtitle', {
                          season: primarySeasonSelection.season.name,
                          start: primarySeasonSelection.season.startsOn,
                          date: selectedSnapshotDate ?? seasonResult?.requestedDate ?? today,
                        })
                      : t('seasonRankingSubtitleMulti', {
                          date: seasonResult?.requestedDate ?? today,
                        })
                    : rankingResult.isCurrentWeek
                      ? t('rankingSubtitleCurrent', { week: rankingResult.weekStart })
                      : t('rankingSubtitlePrevious', { week: rankingResult.weekStart })}
                </p>
              </div>
              <p className="text-xs text-gray-500">
                {rankingResult.periodKind === 'season'
                  ? t('seasonRankingRule')
                  : t('rankingRule')}
              </p>
            </div>
            {rankingResult.periodKind === 'season' && seasonResult ? (
              <div className="mb-5 grid gap-4 rounded-lg bg-white/[0.03] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.08)] lg:grid-cols-[1fr_auto] lg:items-end">
                <div className="min-w-0 space-y-3">
                  {server && seasonResult.availableSeasons.length > 0 ? (
                    <div>
                      <p className="text-xs font-semibold text-gray-300">
                        {t('seasonSelectorTitle')}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {[...seasonResult.availableSeasons].reverse().map((season) => {
                          const active = primarySeasonSelection?.season.id === season.id
                          const targetDate = season.endsOn
                            ? previousUtcDate(season.endsOn)
                            : today
                          return (
                            <Link
                              key={season.id}
                              href={boardHref(
                                paths.zvzBattles,
                                server,
                                minPlayers,
                                season.id,
                                targetDate,
                              )}
                              className={`inline-flex min-h-10 items-center rounded-md px-3 py-1.5 text-xs font-semibold ${
                                active
                                  ? 'bg-amber-300 text-slate-950'
                                  : 'bg-white/[0.05] text-gray-300 hover:bg-white/[0.1] hover:text-white'
                              }`}
                            >
                              {season.name}
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">
                      {t('seasonSelectorAllServers')}
                    </p>
                  )}
                  {primarySeasonSelection?.snapshot ? (
                    <p className="text-xs leading-5 text-gray-500">
                      {primarySeasonSelection.snapshot.isFinal
                        ? t('snapshotFinal')
                        : t('snapshotProvisional')}
                      <span className="mx-1.5 text-gray-700">·</span>
                      {t('dataThrough', {
                        time: formatDateTime(
                          primarySeasonSelection.snapshot.dataThroughAt,
                          locale,
                        ),
                      })}
                    </p>
                  ) : (
                    <p className="text-xs text-amber-200">{t('snapshotPending')}</p>
                  )}
                </div>
                <form action={paths.zvzBattles} method="get" className="flex flex-wrap items-end gap-2">
                  {server ? <input type="hidden" name="server" value={server} /> : null}
                  {minPlayers !== PUBLIC_ZVZ_DEFAULT_MIN_FORCE_SIZE ? (
                    <input type="hidden" name="min" value={minPlayers} />
                  ) : null}
                  {server && primarySeasonSelection ? (
                    <input
                      type="hidden"
                      name="season"
                      value={primarySeasonSelection.season.id}
                    />
                  ) : null}
                  <label className="grid gap-1 text-xs font-semibold text-gray-300">
                    <span>{t('asOfDateLabel')}</span>
                    <input
                      type="date"
                      name="asOf"
                      required
                      min={primarySeasonSelection?.season.startsOn}
                      max={seasonDateMax < today ? seasonDateMax : today}
                      defaultValue={selectedSnapshotDate ?? seasonResult.requestedDate}
                      className="h-10 rounded-md border border-white/[0.12] bg-black/25 px-3 text-sm text-white outline-none focus:border-amber-200"
                    />
                  </label>
                  <button
                    type="submit"
                    className="inline-flex h-10 items-center justify-center rounded-md bg-amber-300 px-4 text-xs font-bold text-slate-950 hover:bg-amber-200"
                  >
                    {t('viewPastRanking')}
                  </button>
                </form>
              </div>
            ) : null}
            {rankingError ? (
              <div className="rounded-lg bg-white/[0.03] px-4 py-8 text-center shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
                <p className="text-sm font-semibold text-white">
                  {t('rankingsUnavailableTitle')}
                </p>
                <p className="mt-2 text-sm text-gray-400">
                  {t('rankingsUnavailableBody')}
                </p>
              </div>
            ) : (
              <RankingTable
                rankings={rankings}
                recordBasePath={paths.zvzBattles}
                guildBasePath={paths.guildPage}
                t={t}
              />
            )}
          </section>

          <section className="mt-8">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sky-200">
                  <Clock3 size={18} />
                  <h2 className="text-xl font-black text-white">{t('recentTitle')}</h2>
                </div>
                <p className="mt-2 text-sm text-gray-400">
                  {t('recentSubtitle', { count: minPlayers })}
                </p>
              </div>
              <div className="inline-flex items-center gap-2 text-xs text-gray-500">
                <Users size={14} />
                {t('publicDataNotice')}
              </div>
            </div>

            {recentError ? (
              <div className="rounded-lg bg-white/[0.03] px-4 py-8 text-center shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
                <p className="text-sm font-semibold text-white">
                  {t('recentUnavailableTitle')}
                </p>
                <p className="mt-2 text-sm text-gray-400">
                  {t('recentUnavailableBody')}
                </p>
              </div>
            ) : recentBattles.length === 0 ? (
              <div className="rounded-lg bg-white/[0.03] px-4 py-8 text-center shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
                <p className="text-sm font-semibold text-white">{t('emptyRecentTitle')}</p>
                <p className="mt-2 text-sm text-gray-400">{t('emptyRecentBody')}</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {recentBattles.map((battle) => (
                  <BattleCard
                    key={battle.id}
                    battle={battle}
                    recordBasePath={paths.zvzBattles}
                    locale={locale}
                    t={t}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="mt-10 rounded-lg bg-white/[0.03] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
            <div className="flex items-start gap-3">
              <BarChart3 size={18} className="mt-0.5 text-emerald-200" />
              <div>
                <h2 className="text-sm font-bold text-white">{t('differentiatorTitle')}</h2>
                <p className="mt-1 text-pretty text-sm leading-6 text-gray-400">
                  {t('differentiatorBody')}
                </p>
              </div>
            </div>
          </section>
        </main>
      </div>
    </>
  )
}
