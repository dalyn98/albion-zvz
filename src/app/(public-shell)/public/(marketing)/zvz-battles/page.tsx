import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  ExternalLink,
  Globe2,
  Layers3,
  Search,
  Shield,
  ShieldCheck,
  Swords,
  Trophy,
  Users,
  X,
} from 'lucide-react'
import MarketingAttributionTracker from '@/components/MarketingAttributionTracker'
import MarketingNav from '@/components/MarketingNav'
import BattlelogPausedPanel from '@/components/BattlelogPausedPanel'
import { PublicZvzRecentSection, PublicZvzSeasonSelect } from '@/components/PublicZvzBoardFilters'
import { getMarketingPathsForEnvironment } from '@/lib/marketing-paths'
import { getMarketingLocale, getMarketingTranslator } from '@/lib/marketing-static-intl'
import { getCanonicalOrigin, getCanonicalUrlForPathname } from '@/lib/seo-metadata'
import { arePublicAgmBattlesAvailable } from '@/lib/public-agm-battles-visibility'
import { getUtcWeekStartDateString } from '@/lib/public-battlelog-sync'
import { buildPublicZvzBoardHref } from '@/lib/public-zvz-filter-hrefs'
import {
  PUBLIC_ZVZ_ENTITY_SEARCH_LIMIT,
  searchPublicZvzEntities,
  type PublicZvzEntitySearchResult,
} from '@/lib/public-zvz-entity-search'
import {
  PUBLIC_ZVZ_DIVISIONS,
  normalizePublicZvzDivisionFilter,
  type PublicZvzDivision,
  type PublicZvzDivisionFilter,
} from '@/lib/public-zvz-divisions'
import {
  buildPublicZvzAllianceRecordHref,
  buildPublicZvzGuildRecordHref,
  normalizePublicZvzDate,
  normalizePublicZvzSeasonId,
} from '@/lib/public-zvz-record-links'
import {
  normalizePublicZvzEntitySearchQuery,
  PUBLIC_ZVZ_ENTITY_SEARCH_MAX_LENGTH,
  PUBLIC_ZVZ_ENTITY_SEARCH_MIN_LENGTH,
} from '@/lib/public-zvz-search-query'
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
  type PublicZvzServerFilter,
} from '@/lib/public-zvz-battles'

export const dynamic = 'force-dynamic'

interface PageSearchParams {
  server?: string | string[]
  division?: string | string[]
  min?: string | string[]
  season?: string | string[]
  asOf?: string | string[]
  q?: string | string[]
}

const SERVER_FILTERS: Array<{
  value: PublicZvzServerFilter
  labelKey: string
}> = [
  { value: null, labelKey: 'serverAll' },
  { value: 'west', labelKey: 'serverWest' },
  { value: 'europe', labelKey: 'serverEurope' },
  { value: 'east', labelKey: 'serverEast' },
]

const RECENT_FORCE_PRESETS = [20, 18, 10] as const

const DIVISION_FILTERS: Array<{
  value: PublicZvzDivisionFilter
  rangeKey: string
}> = [
  { value: null, rangeKey: 'divisionRange_all' },
  ...PUBLIC_ZVZ_DIVISIONS.map((value) => ({
    value,
    rangeKey: `divisionRange_${value}`,
  })),
]

const DIVISION_TONES: Record<
  PublicZvzDivision,
  {
    badge: string
    dot: string
    rank: string
    active: string
    idle: string
  }
> = {
  small: {
    badge: 'bg-emerald-400/10 text-emerald-200 shadow-[0_0_0_1px_rgba(52,211,153,0.22)]',
    dot: 'bg-emerald-300',
    rank: 'text-emerald-200',
    active: 'bg-emerald-300 text-emerald-950 shadow-[0_0_0_1px_rgba(110,231,183,0.45)]',
    idle: 'text-emerald-200 hover:bg-emerald-400/10',
  },
  mid: {
    badge: 'bg-sky-400/10 text-sky-200 shadow-[0_0_0_1px_rgba(56,189,248,0.22)]',
    dot: 'bg-sky-300',
    rank: 'text-sky-200',
    active: 'bg-sky-300 text-sky-950 shadow-[0_0_0_1px_rgba(125,211,252,0.45)]',
    idle: 'text-sky-200 hover:bg-sky-400/10',
  },
  large: {
    badge: 'bg-violet-400/10 text-violet-200 shadow-[0_0_0_1px_rgba(167,139,250,0.22)]',
    dot: 'bg-violet-300',
    rank: 'text-violet-200',
    active: 'bg-violet-300 text-violet-950 shadow-[0_0_0_1px_rgba(196,181,253,0.45)]',
    idle: 'text-violet-200 hover:bg-violet-400/10',
  },
  zerg: {
    badge: 'bg-rose-400/10 text-rose-200 shadow-[0_0_0_1px_rgba(251,113,133,0.22)]',
    dot: 'bg-rose-300',
    rank: 'text-rose-200',
    active: 'bg-rose-300 text-rose-950 shadow-[0_0_0_1px_rgba(253,164,175,0.45)]',
    idle: 'text-rose-200 hover:bg-rose-400/10',
  },
}

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

function guildHref(basePath: string, slug: string): string {
  return `${basePath}/${slug}`
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
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

function DivisionBadge({
  division,
  t,
}: {
  division: PublicZvzDivision
  t: Awaited<ReturnType<typeof getMarketingTranslator>>
}) {
  const tone = DIVISION_TONES[division]
  return (
    <span
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold ${tone.badge}`}
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${tone.dot}`} />
      {divisionLabel(division, t)}
    </span>
  )
}

function EntitySearchResultCard({
  result,
  recordBasePath,
  locale,
  t,
}: {
  result: PublicZvzEntitySearchResult
  recordBasePath: string
  locale: string
  t: Awaited<ReturnType<typeof getMarketingTranslator>>
}) {
  const isGuild = result.entityKind === 'guild'
  const Icon = isGuild ? Users : Shield
  const href = isGuild
    ? buildPublicZvzGuildRecordHref({
        basePath: recordBasePath,
        server: result.server,
        guildAlbionId: result.albionId,
        weekStart: result.weekStart,
        seasonId: result.seasonId,
        asOfDate: result.snapshotDate,
      })
    : buildPublicZvzAllianceRecordHref({
        basePath: recordBasePath,
        server: result.server,
        allianceAlbionId: result.albionId,
        weekStart: result.weekStart,
        seasonId: result.seasonId,
        asOfDate: result.snapshotDate,
      })
  const periodLabel =
    result.periodKind === 'season'
      ? t('searchSeasonPeriod', { date: result.snapshotDate ?? '' })
      : t('searchWeekPeriod', { week: result.weekStart ?? '' })

  return (
    <Link
      href={href}
      aria-label={t('searchOpenRecord', { name: result.entityName })}
      className="group flex min-h-32 flex-col justify-between rounded-xl bg-[#0b0f16]/90 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.08)] transition-[background-color,box-shadow,scale] duration-150 ease-out hover:bg-white/[0.055] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.14)] active:scale-[0.96]"
    >
      <div className="flex items-start gap-3">
        <span
          className={`inline-flex size-10 shrink-0 items-center justify-center rounded-lg ${
            isGuild ? 'bg-amber-400/10 text-amber-200' : 'bg-violet-400/10 text-violet-200'
          }`}
        >
          <Icon size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500">
              {t(isGuild ? 'searchGuildKind' : 'searchAllianceKind')}
            </span>
            <span className="rounded-sm bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-semibold text-gray-400">
              {t(`server_${result.server}`)}
            </span>
            {isGuild && result.tenantSlug && result.tenantProfileEnabled ? (
              <span className="rounded-sm bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-200">
                {t('agmGuild')}
              </span>
            ) : null}
          </div>
          <h3 className="mt-1 truncate text-base font-black text-white group-hover:text-amber-100">
            {result.entityName}
          </h3>
          {isGuild && result.allianceName ? (
            <p className="mt-1 truncate text-xs text-gray-500">[{result.allianceName}]</p>
          ) : null}
        </div>
        <ArrowUpRight
          size={17}
          aria-hidden="true"
          className="mt-1 shrink-0 text-gray-600 transition-[color,translate] duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-gray-400">
        {isGuild && result.rank !== null ? (
          <span className="font-bold tabular-nums text-amber-200">
            {t('searchRank', { rank: result.rank })}
          </span>
        ) : null}
        {isGuild && result.division ? <DivisionBadge division={result.division} t={t} /> : null}
        <span className="tabular-nums">
          {t('searchBattleCount', { count: result.battleCount })}
        </span>
        {!isGuild ? (
          <span className="tabular-nums">
            {t('searchGuildCount', { count: result.relatedGuildCount })}
          </span>
        ) : null}
        <span className="text-gray-600">{periodLabel}</span>
        {result.latestBattleAt ? (
          <span className="ml-auto text-gray-600">
            {t('searchLatestBattle', {
              time: formatDateTime(result.latestBattleAt, locale),
            })}
          </span>
        ) : null}
      </div>
    </Link>
  )
}

function EntitySearchPanel({
  basePath,
  server,
  division,
  minPlayers,
  seasonId,
  asOfDate,
  searchQuery,
  searchInputValue,
  searchAttempted,
  searchResults,
  searchError,
  locale,
  t,
}: {
  basePath: string
  server: PublicZvzServerFilter
  division: PublicZvzDivisionFilter
  minPlayers: number
  seasonId: string | null
  asOfDate: string | null
  searchQuery: string | null
  searchInputValue: string
  searchAttempted: boolean
  searchResults: PublicZvzEntitySearchResult[]
  searchError: boolean
  locale: string
  t: Awaited<ReturnType<typeof getMarketingTranslator>>
}) {
  const clearHref = buildPublicZvzBoardHref({
    basePath,
    server,
    division,
    minPlayers,
    defaultMinPlayers: PUBLIC_ZVZ_DEFAULT_MIN_FORCE_SIZE,
    seasonId,
    asOfDate,
  })

  return (
    <section
      aria-labelledby="public-zvz-record-search-title"
      className="mt-8 rounded-2xl bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.09),transparent_42%),rgba(255,255,255,0.025)] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.09),0_18px_40px_-28px_rgba(0,0,0,0.9)] sm:p-6"
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.9fr)] lg:items-end">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-amber-200">
            <Search size={14} aria-hidden="true" />
            {t('searchEyebrow')}
          </p>
          <h2
            id="public-zvz-record-search-title"
            className="mt-2 text-balance text-xl font-black text-white sm:text-2xl"
          >
            {t('searchTitle')}
          </h2>
          <p
            id="public-zvz-record-search-hint"
            className="mt-2 max-w-2xl text-pretty text-sm leading-6 text-gray-400"
          >
            {t('searchHint')}
          </p>
        </div>

        <form
          action={basePath}
          method="get"
          role="search"
          className="flex flex-col gap-2 sm:flex-row"
        >
          {server ? <input type="hidden" name="server" value={server} /> : null}
          {division ? <input type="hidden" name="division" value={division} /> : null}
          {minPlayers !== PUBLIC_ZVZ_DEFAULT_MIN_FORCE_SIZE ? (
            <input type="hidden" name="min" value={minPlayers} />
          ) : null}
          {server && seasonId ? <input type="hidden" name="season" value={seasonId} /> : null}
          {asOfDate ? <input type="hidden" name="asOf" value={asOfDate} /> : null}
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{t('searchInputLabel')}</span>
            <Search
              size={17}
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-3.5 text-gray-500"
            />
            <input
              type="search"
              name="q"
              required
              minLength={PUBLIC_ZVZ_ENTITY_SEARCH_MIN_LENGTH}
              maxLength={PUBLIC_ZVZ_ENTITY_SEARCH_MAX_LENGTH}
              defaultValue={searchInputValue}
              placeholder={t('searchPlaceholder')}
              aria-describedby="public-zvz-record-search-hint"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
              className="h-12 w-full rounded-xl border border-white/[0.13] bg-black/30 pl-10 pr-4 text-sm text-white outline-none transition-[border-color,box-shadow] placeholder:text-gray-600 focus:border-amber-200 focus:shadow-[0_0_0_3px_rgba(252,211,77,0.16)]"
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-12 min-w-24 items-center justify-center rounded-xl bg-amber-300 pl-4 pr-3.5 text-sm font-black text-slate-950 transition-[background-color,scale] duration-150 ease-out hover:bg-amber-200 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100"
          >
            {t('searchSubmit')}
          </button>
        </form>
      </div>

      {searchAttempted ? (
        <div className="mt-5 border-t border-white/[0.08] pt-5" aria-live="polite">
          {!searchQuery ? (
            <p className="rounded-xl bg-amber-400/[0.08] px-4 py-3 text-sm text-amber-100 shadow-[0_0_0_1px_rgba(251,191,36,0.16)]">
              {t('searchInvalid', {
                min: PUBLIC_ZVZ_ENTITY_SEARCH_MIN_LENGTH,
                max: PUBLIC_ZVZ_ENTITY_SEARCH_MAX_LENGTH,
              })}
            </p>
          ) : searchError ? (
            <p className="rounded-xl bg-rose-400/[0.08] px-4 py-3 text-sm text-rose-100 shadow-[0_0_0_1px_rgba(251,113,133,0.16)]">
              {t('searchUnavailable')}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-gray-200">
                  {t('searchResultSummary', {
                    query: searchQuery,
                    count: searchResults.length,
                  })}
                </p>
                <Link
                  href={clearHref}
                  scroll={false}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-gray-400 transition-[background-color,color,scale] duration-150 hover:bg-white/[0.06] hover:text-white active:scale-[0.96]"
                >
                  <X size={14} aria-hidden="true" />
                  {t('searchClear')}
                </Link>
              </div>
              {searchResults.length > 0 ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {searchResults.map((result) => (
                    <EntitySearchResultCard
                      key={`${result.periodKind}:${result.server}:${result.entityKind}:${result.albionId}`}
                      result={result}
                      recordBasePath={basePath}
                      locale={locale}
                      t={t}
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-xl bg-black/20 px-4 py-8 text-center shadow-[0_0_0_1px_rgba(255,255,255,0.07)]">
                  <p className="text-sm font-semibold text-white">{t('searchEmptyTitle')}</p>
                  <p className="mt-2 text-pretty text-sm text-gray-500">{t('searchEmptyBody')}</p>
                </div>
              )}
            </>
          )}
        </div>
      ) : null}
    </section>
  )
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
      title={
        improved
          ? t('rankDeltaUp', { count: value })
          : t('rankDeltaDown', { count: Math.abs(value) })
      }
      className={`text-[11px] font-bold tabular-nums ${
        improved ? 'text-emerald-300' : 'text-rose-300'
      }`}
    >
      {improved ? '▲' : '▼'}
      {Math.abs(value)}
    </span>
  )
}

function RankingPosition({
  row,
  division,
  t,
}: {
  row: PublicWeeklyZvzRanking
  division: PublicZvzDivisionFilter
  t: Awaited<ReturnType<typeof getMarketingTranslator>>
}) {
  const scopedRank = division ? row.divisionRank : row.rank
  const scopedDelta = division ? row.divisionRankDelta : row.rankDelta
  const rankTone = division ? DIVISION_TONES[division].rank : 'text-amber-200'

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className={`tabular-nums text-base font-black ${rankTone}`}>#{scopedRank}</span>
      {row.periodKind === 'season' ? <RankDelta value={scopedDelta} t={t} /> : null}
      {division ? (
        <span className="rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-gray-500">
          {t('overallRankCompact', { rank: row.rank })}
        </span>
      ) : null}
    </div>
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
  const profileHref = tenantSlug && profileEnabled ? guildHref(guildBasePath, tenantSlug) : null

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
  division,
  recordBasePath,
  guildBasePath,
  t,
}: {
  rankings: PublicWeeklyZvzRanking[]
  division: PublicZvzDivisionFilter
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
                <RankingPosition row={row} division={division} t={t} />
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
                <DivisionBadge division={row.division} t={t} />
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-xs">
              <div>
                <dt className="uppercase tracking-wide text-gray-500">{t('scoreColumn')}</dt>
                <dd className="mt-1 tabular-nums font-semibold text-white">
                  {formatDecimal(row.score)}
                </dd>
              </div>
              <div>
                <dt className="uppercase tracking-wide text-gray-500">{t('battlesColumn')}</dt>
                <dd className="mt-1 tabular-nums text-gray-200">{formatNumber(row.zvzBattles)}</dd>
              </div>
              <div>
                <dt className="uppercase tracking-wide text-gray-500">{t('kdColumn')}</dt>
                <dd className="mt-1 tabular-nums text-gray-200">
                  {kdLabel(row.kills, row.deaths)}
                </dd>
              </div>
              <div>
                <dt className="uppercase tracking-wide text-gray-500">{t('avgForceColumn')}</dt>
                <dd className="mt-1 tabular-nums text-gray-200">
                  {formatDecimal(row.avgForceSize)}
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-lg shadow-[0_0_0_1px_rgba(255,255,255,0.08)] sm:block">
        <table className="min-w-[880px] w-full border-collapse bg-[#0b0f16]/90 text-sm">
          <thead className="bg-white/[0.04] text-left text-[11px] uppercase tracking-[0.16em] text-gray-400">
            <tr>
              <th className="px-4 py-3 font-semibold">
                {division ? t('divisionRankColumn') : t('rankColumn')}
              </th>
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
                  <RankingPosition row={row} division={division} t={t} />
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
                <td className="px-4 py-3 align-middle text-gray-300">
                  {t(`server_${row.server}`)}
                </td>
                <td className="px-4 py-3 align-middle">
                  <DivisionBadge division={row.division} t={t} />
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
    battle.topGuilds.filter((force) => force.teamSize >= 10).flatMap((force) => force.guildIds),
  )

  return (
    <article className="rounded-lg bg-[#0b0f16]/90 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-sm px-2 py-1 text-[11px] font-bold ${
                isZvZ ? 'bg-amber-400/15 text-amber-200' : 'bg-white/[0.06] text-gray-300'
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
                  isZvZ && force.guildIds.some((guildId) => evidenceGuildIds.has(guildId))
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
  const division = normalizePublicZvzDivisionFilter(firstParam(params.division))
  const minPlayers = normalizePublicZvzMinPlayers(firstParam(params.min))
  const seasonId = normalizePublicZvzSeasonId(firstParam(params.season))
  const asOfDate = normalizePublicZvzDate(firstParam(params.asOf))
  const rawSearchQuery = firstParam(params.q) ?? ''
  const searchAttempted = rawSearchQuery.trim().length > 0
  const searchQuery = normalizePublicZvzEntitySearchQuery(rawSearchQuery)
  const searchInputValue = rawSearchQuery
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, PUBLIC_ZVZ_ENTITY_SEARCH_MAX_LENGTH)
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

  const [boardData, entitySearch] = await Promise.all([
    loadPublicZvzBoardData({
      server,
      division,
      minPlayers,
      rankingLimit: 20,
      seasonId,
      asOfDate,
    }),
    searchQuery
      ? searchPublicZvzEntities({
          query: searchQuery,
          server,
          seasonId,
          asOfDate,
          limit: PUBLIC_ZVZ_ENTITY_SEARCH_LIMIT,
        })
          .then((results) => ({ results, error: false }))
          .catch(() => ({ results: [], error: true }))
      : Promise.resolve({
          results: [] as PublicZvzEntitySearchResult[],
          error: false,
        }),
  ])
  const { rankingResult, recentBattles, rankingError, recentError } = boardData

  const rankings = rankingResult.rankings
  const seasonResult = rankingResult.seasonResult
  const primarySeasonSelection = seasonResult?.selections[0] ?? null
  const selectedSnapshotDate =
    primarySeasonSelection?.snapshot?.snapshotDate ?? seasonResult?.requestedDate ?? null
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
  const recentForcePresets = RECENT_FORCE_PRESETS.map((value) => ({
    value,
    label:
      value === 20
        ? t('recentForcePresetZvz')
        : value === 18
          ? t('recentForcePresetLarge')
          : t('recentForcePresetMeaningful'),
  }))
  const seasonNavigationOptions =
    server && seasonResult
      ? [...seasonResult.availableSeasons].reverse().map((season) => {
          const targetDate = season.endsOn ? previousUtcDate(season.endsOn) : today
          return {
            value: season.id,
            label: season.name,
            href: buildPublicZvzBoardHref({
              basePath: paths.zvzBattles,
              server,
              division,
              minPlayers,
              defaultMinPlayers: PUBLIC_ZVZ_DEFAULT_MIN_FORCE_SIZE,
              seasonId: season.id,
              asOfDate: targetDate,
              query: searchQuery,
            }),
          }
        })
      : []
  const latestSeasonDate = seasonDateMax < today ? seasonDateMax : today
  const latestRankingHref = buildPublicZvzBoardHref({
    basePath: paths.zvzBattles,
    server,
    division,
    minPlayers,
    defaultMinPlayers: PUBLIC_ZVZ_DEFAULT_MIN_FORCE_SIZE,
    seasonId: primarySeasonSelection?.season.id,
    asOfDate: latestSeasonDate,
    query: searchQuery,
  })

  return (
    <>
      <MarketingAttributionTracker />
      <MarketingNav active="battles" />
      <div className="min-h-screen bg-[#080b10] text-white">
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
          <section className="max-w-3xl">
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
          </section>

          <section
            aria-labelledby="public-zvz-server-filter-title"
            className="mt-8 flex flex-col gap-3 rounded-xl bg-white/[0.03] p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.08)] sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 items-start gap-2 px-1">
              <Globe2 size={16} className="mt-0.5 shrink-0 text-amber-200" />
              <div className="min-w-0">
                <h2
                  id="public-zvz-server-filter-title"
                  className="text-sm font-semibold text-white"
                >
                  {t('serverFilterTitle')}
                </h2>
                <p className="text-pretty text-xs text-gray-500">{t('serverFilterHint')}</p>
              </div>
            </div>
            <nav
              aria-label={t('serverFilterTitle')}
              className="grid grid-cols-4 gap-1 rounded-[10px] bg-black/25 p-1"
            >
              {SERVER_FILTERS.map((item) => {
                const active = item.value === server
                return (
                  <Link
                    key={item.value ?? 'all'}
                    href={buildPublicZvzBoardHref({
                      basePath: paths.zvzBattles,
                      server: item.value,
                      division,
                      minPlayers,
                      defaultMinPlayers: PUBLIC_ZVZ_DEFAULT_MIN_FORCE_SIZE,
                      seasonId: item.value === server ? seasonId : null,
                      asOfDate,
                      query: searchQuery,
                    })}
                    scroll={false}
                    aria-current={active ? 'page' : undefined}
                    className={`inline-flex min-h-11 items-center justify-center rounded-md px-3 py-1.5 text-xs font-semibold transition-[background-color,color,box-shadow,scale] duration-150 ease-out active:scale-[0.96] ${
                      active
                        ? 'bg-amber-300 text-slate-950 shadow-[0_0_0_1px_rgba(252,211,77,0.35)]'
                        : 'text-gray-300 hover:bg-white/[0.08] hover:text-white'
                    }`}
                  >
                    {t(item.labelKey)}
                  </Link>
                )
              })}
            </nav>
          </section>

          <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
                  <p className="mt-3 tabular-nums text-2xl font-black text-white">{card.value}</p>
                </div>
              )
            })}
          </section>

          <EntitySearchPanel
            basePath={paths.zvzBattles}
            server={server}
            division={division}
            minPlayers={minPlayers}
            seasonId={seasonId}
            asOfDate={asOfDate}
            searchQuery={searchQuery}
            searchInputValue={searchInputValue}
            searchAttempted={searchAttempted}
            searchResults={entitySearch.results}
            searchError={entitySearch.error}
            locale={locale}
            t={t}
          />

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
                      ? t('rankingSubtitleCurrent', {
                          week: rankingResult.weekStart,
                        })
                      : t('rankingSubtitlePrevious', {
                          week: rankingResult.weekStart,
                        })}
                </p>
              </div>
              <p className="text-xs text-gray-500">
                {rankingResult.periodKind === 'season' ? t('seasonRankingRule') : t('rankingRule')}
              </p>
            </div>
            <div className="mb-5 rounded-2xl bg-white/[0.03] p-2 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
              <div className="flex items-start gap-2 px-2 pb-2 pt-1">
                <Layers3 size={16} className="mt-0.5 shrink-0 text-amber-200" />
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-white">{t('divisionFilterTitle')}</h3>
                  <p className="text-pretty text-xs text-gray-500">{t('divisionFilterHint')}</p>
                </div>
              </div>
              <div className="overflow-x-auto pb-1">
                <nav
                  aria-label={t('divisionFilterTitle')}
                  className="grid min-w-[44rem] grid-cols-5 gap-1"
                >
                  {DIVISION_FILTERS.map((item) => {
                    const active = item.value === division
                    const label = item.value ? divisionLabel(item.value, t) : t('division_all')
                    const tone = item.value ? DIVISION_TONES[item.value] : null
                    return (
                      <Link
                        key={item.value ?? 'all'}
                        href={buildPublicZvzBoardHref({
                          basePath: paths.zvzBattles,
                          server,
                          division: item.value,
                          minPlayers,
                          defaultMinPlayers: PUBLIC_ZVZ_DEFAULT_MIN_FORCE_SIZE,
                          seasonId,
                          asOfDate,
                          query: searchQuery,
                        })}
                        scroll={false}
                        aria-current={active ? 'page' : undefined}
                        className={`flex min-h-16 flex-col items-start justify-center rounded-lg px-3 text-left transition-[background-color,color,box-shadow,scale] duration-150 ease-out active:scale-[0.96] ${
                          active
                            ? (tone?.active ??
                              'bg-white text-slate-950 shadow-[0_0_0_1px_rgba(255,255,255,0.35)]')
                            : (tone?.idle ?? 'text-gray-300 hover:bg-white/[0.08] hover:text-white')
                        }`}
                      >
                        <span className="text-sm font-bold">{label}</span>
                        <span className="mt-0.5 text-[11px] font-medium opacity-70">
                          {t(item.rangeKey)}
                        </span>
                      </Link>
                    )
                  })}
                </nav>
              </div>
            </div>
            {rankingResult.periodKind === 'season' && seasonResult ? (
              <div className="mb-5 grid gap-4 rounded-xl bg-white/[0.03] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.08)] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <div className="min-w-0 space-y-3">
                  {!server ? (
                    <p className="text-xs text-gray-400">{t('seasonSelectorAllServers')}</p>
                  ) : null}
                  {primarySeasonSelection?.snapshot ? (
                    <p className="text-xs leading-5 text-gray-500">
                      {primarySeasonSelection.snapshot.isFinal
                        ? t('snapshotFinal')
                        : t('snapshotProvisional')}
                      <span className="mx-1.5 text-gray-700">·</span>
                      {t('dataThrough', {
                        time: formatDateTime(primarySeasonSelection.snapshot.dataThroughAt, locale),
                      })}
                    </p>
                  ) : (
                    <p className="text-xs text-amber-200">{t('snapshotPending')}</p>
                  )}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                  {server && primarySeasonSelection && seasonNavigationOptions.length > 0 ? (
                    <PublicZvzSeasonSelect
                      key={primarySeasonSelection.season.id}
                      label={t('seasonSelectorTitle')}
                      value={primarySeasonSelection.season.id}
                      options={seasonNavigationOptions}
                      updatingLabel={t('filterUpdating')}
                    />
                  ) : null}
                  <form
                    action={paths.zvzBattles}
                    method="get"
                    className="flex flex-wrap items-end gap-2"
                  >
                    {server ? <input type="hidden" name="server" value={server} /> : null}
                    {division ? <input type="hidden" name="division" value={division} /> : null}
                    {minPlayers !== PUBLIC_ZVZ_DEFAULT_MIN_FORCE_SIZE ? (
                      <input type="hidden" name="min" value={minPlayers} />
                    ) : null}
                    {server && primarySeasonSelection ? (
                      <input type="hidden" name="season" value={primarySeasonSelection.season.id} />
                    ) : null}
                    {searchQuery ? <input type="hidden" name="q" value={searchQuery} /> : null}
                    <label className="grid min-w-40 flex-1 gap-1 text-xs font-semibold text-gray-300">
                      <span>{t('asOfDateLabel')}</span>
                      <input
                        type="date"
                        name="asOf"
                        required
                        min={primarySeasonSelection?.season.startsOn}
                        max={latestSeasonDate}
                        defaultValue={selectedSnapshotDate ?? seasonResult.requestedDate}
                        className="h-11 rounded-lg border border-white/[0.12] bg-black/25 px-3 text-sm text-white outline-none transition-[border-color,box-shadow] focus:border-amber-200 focus:shadow-[0_0_0_2px_rgba(252,211,77,0.18)]"
                      />
                    </label>
                    <button
                      type="submit"
                      className="inline-flex h-11 items-center justify-center rounded-lg bg-amber-300 px-4 text-xs font-bold text-slate-950 transition-[background-color,scale] duration-150 ease-out hover:bg-amber-200 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100"
                    >
                      {t('viewPastRanking')}
                    </button>
                    {selectedSnapshotDate && selectedSnapshotDate !== latestSeasonDate ? (
                      <Link
                        href={latestRankingHref}
                        scroll={false}
                        className="inline-flex h-11 items-center justify-center rounded-lg bg-white/[0.06] px-3 text-xs font-semibold text-gray-200 transition-[background-color,color,scale] duration-150 ease-out hover:bg-white/[0.1] hover:text-white active:scale-[0.96]"
                      >
                        {t('viewLatestRanking')}
                      </Link>
                    ) : null}
                  </form>
                </div>
              </div>
            ) : null}
            {rankingError ? (
              <div className="rounded-lg bg-white/[0.03] px-4 py-8 text-center shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
                <p className="text-sm font-semibold text-white">{t('rankingsUnavailableTitle')}</p>
                <p className="mt-2 text-sm text-gray-400">{t('rankingsUnavailableBody')}</p>
              </div>
            ) : (
              <RankingTable
                rankings={rankings}
                division={division}
                recordBasePath={paths.zvzBattles}
                guildBasePath={paths.guildPage}
                t={t}
              />
            )}
          </section>

          <PublicZvzRecentSection
            key={`${server ?? 'all'}:${division ?? 'all'}:${minPlayers}:${seasonId ?? ''}:${asOfDate ?? ''}`}
            basePath={paths.zvzBattles}
            server={server}
            division={division}
            minPlayers={minPlayers}
            defaultMinPlayers={PUBLIC_ZVZ_DEFAULT_MIN_FORCE_SIZE}
            minimumMinPlayers={PUBLIC_ZVZ_MIN_FORCE_SIZE}
            maximumMinPlayers={PUBLIC_ZVZ_MAX_FORCE_SIZE}
            seasonId={seasonId}
            asOfDate={asOfDate}
            query={searchQuery}
            title={t('recentTitle')}
            subtitle={t('recentSubtitle', { count: minPlayers })}
            publicDataNotice={t('publicDataNotice')}
            filterTitle={t('recentForceFilterTitle')}
            filterHint={t('recentForceFilterHint')}
            filterLabel={t('recentForceFilterLabel')}
            customOptionLabel={t('recentForceCustomOption')}
            customInputLabel={t('recentForceCustomLabel')}
            customInputPlaceholder={t('minForceInputPlaceholder')}
            forceUnitLabel={t('recentForceUnit')}
            applyLabel={t('applyFilters')}
            updatingLabel={t('filterUpdating')}
            presets={recentForcePresets}
          >
            {recentError ? (
              <div className="rounded-lg bg-white/[0.03] px-4 py-8 text-center shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
                <p className="text-sm font-semibold text-white">{t('recentUnavailableTitle')}</p>
                <p className="mt-2 text-sm text-gray-400">{t('recentUnavailableBody')}</p>
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
          </PublicZvzRecentSection>

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
