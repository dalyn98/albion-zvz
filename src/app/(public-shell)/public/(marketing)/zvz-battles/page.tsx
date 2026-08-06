import type { Metadata } from 'next'
import Link from 'next/link'
import { Fragment } from 'react'
import {
  Activity,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Medal,
  Search,
  Shield,
  Swords,
  Trophy,
  TriangleAlert,
  Users,
  X,
} from 'lucide-react'
import MarketingAttributionTracker from '@/components/MarketingAttributionTracker'
import MarketingNav from '@/components/MarketingNav'
import BattlelogPausedPanel from '@/components/BattlelogPausedPanel'
import { PublicZvzRecentSection, PublicZvzSeasonSelect } from '@/components/PublicZvzBoardFilters'
import { OFFICIAL_ZVZ_MIN_SIDE_SIZE } from '@/lib/battle-activity-classification'
import { getMarketingPathsForEnvironment } from '@/lib/marketing-paths'
import { getMarketingLocale, getMarketingTranslator } from '@/lib/marketing-static-intl'
import {
  buildSeoMarketingLanguageAlternates,
  getCanonicalOrigin,
  getCanonicalUrlForPathname,
} from '@/lib/seo-metadata'
import { arePublicAgmBattlesAvailable } from '@/lib/public-agm-battles-visibility'
import { getUtcWeekStartDateString } from '@/lib/public-battlelog-sync'
import {
  buildPublicZvzBoardHref,
  normalizePublicZvzRankingPage,
  PUBLIC_ZVZ_RANKING_MAX_RESULTS,
  PUBLIC_ZVZ_RANKING_PAGE_SIZE,
} from '@/lib/public-zvz-filter-hrefs'
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
  buildPublicZvzBattleReportHref,
  buildPublicZvzGuildRecordHref,
  normalizePublicZvzDate,
  normalizePublicZvzBattleId,
  normalizePublicZvzSeasonId,
} from '@/lib/public-zvz-record-links'
import {
  normalizePublicZvzEntitySearchQuery,
  PUBLIC_ZVZ_ENTITY_SEARCH_MAX_LENGTH,
  PUBLIC_ZVZ_ENTITY_SEARCH_MIN_LENGTH,
} from '@/lib/public-zvz-search-query'
import { extractPublicZvzSeasonNumber } from '@/lib/public-zvz-season-label'
import {
  loadPublicZvzV2Rankings,
  type PublicZvzV2Ranking,
} from '@/lib/public-zvz-ranking-v2-data'
import {
  normalizePublicZvzRankingEntityKind,
  PUBLIC_ZVZ_RANKING_ENTITY_KINDS,
  PUBLIC_ZVZ_RANKING_SERVERS,
  type PublicZvzRankingEntityKind,
} from '@/lib/public-zvz-ranking-v2'
import {
  loadPublicZvzBoardData,
  PUBLIC_ZVZ_DEFAULT_MIN_FORCE_SIZE,
  PUBLIC_ZVZ_MAX_FORCE_SIZE,
  PUBLIC_ZVZ_MIN_FORCE_SIZE,
  normalizePublicZvzMinPlayers,
  normalizePublicZvzServerFilter,
  type PublicBattleForce,
  type PublicRecentBattle,
  type PublicZvzServerFilter,
} from '@/lib/public-zvz-battles'
import {
  PublicZvzCollapsibleGuildList,
  PublicZvzDeferredGuildList,
  PublicZvzKdScore,
  PublicZvzPrimaryScaleBadge,
  shouldCollapsePublicZvzGuildSection,
} from './record-ui'

export const dynamic = 'force-dynamic'

interface PageSearchParams {
  server?: string | string[]
  division?: string | string[]
  min?: string | string[]
  season?: string | string[]
  asOf?: string | string[]
  q?: string | string[]
  entity?: string | string[]
  activity?: string | string[]
  rankPage?: string | string[]
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

const PODIUM_TONES: Record<
  1 | 2 | 3,
  {
    card: string
    row: string
    badge: string
    icon: string
  }
> = {
  1: {
    card:
      'bg-[linear-gradient(110deg,rgba(251,191,36,0.14),rgba(11,15,22,0.96)_52%)] shadow-[inset_3px_0_0_rgba(251,191,36,0.78),0_0_0_1px_rgba(251,191,36,0.24),0_16px_36px_-28px_rgba(251,191,36,0.9)]',
    row:
      'bg-amber-300/[0.07] [&>td:first-child]:shadow-[inset_3px_0_0_rgba(251,191,36,0.78)] hover:bg-amber-300/[0.1]',
    badge:
      'bg-[linear-gradient(145deg,rgba(253,224,71,0.24),rgba(245,158,11,0.12))] text-amber-100 shadow-[0_0_0_1px_rgba(253,224,71,0.32),0_8px_20px_-14px_rgba(251,191,36,0.95)]',
    icon: 'text-amber-300',
  },
  2: {
    card:
      'bg-[linear-gradient(110deg,rgba(226,232,240,0.1),rgba(11,15,22,0.96)_52%)] shadow-[inset_3px_0_0_rgba(203,213,225,0.68),0_0_0_1px_rgba(226,232,240,0.18),0_16px_34px_-30px_rgba(226,232,240,0.72)]',
    row:
      'bg-slate-200/[0.045] [&>td:first-child]:shadow-[inset_3px_0_0_rgba(203,213,225,0.68)] hover:bg-slate-200/[0.075]',
    badge:
      'bg-[linear-gradient(145deg,rgba(241,245,249,0.15),rgba(148,163,184,0.08))] text-slate-100 shadow-[0_0_0_1px_rgba(226,232,240,0.24)]',
    icon: 'text-slate-300',
  },
  3: {
    card:
      'bg-[linear-gradient(110deg,rgba(251,146,60,0.1),rgba(11,15,22,0.96)_52%)] shadow-[inset_3px_0_0_rgba(251,146,60,0.66),0_0_0_1px_rgba(251,146,60,0.18),0_16px_34px_-30px_rgba(251,146,60,0.72)]',
    row:
      'bg-orange-400/[0.045] [&>td:first-child]:shadow-[inset_3px_0_0_rgba(251,146,60,0.66)] hover:bg-orange-400/[0.075]',
    badge:
      'bg-[linear-gradient(145deg,rgba(251,146,60,0.16),rgba(154,52,18,0.08))] text-orange-100 shadow-[0_0_0_1px_rgba(251,146,60,0.24)]',
    icon: 'text-orange-300',
  },
}

function podiumTone(rank: number) {
  return rank === 1 || rank === 2 || rank === 3 ? PODIUM_TONES[rank] : null
}

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([
    getMarketingTranslator('publicZvzBattles'),
    getMarketingLocale(),
  ])
  const canonicalPathname = locale ? `/${locale}/zvz-battles` : '/zvz-battles'
  const canonicalUrl =
    getCanonicalUrlForPathname(canonicalPathname) ?? `${getCanonicalOrigin()}${canonicalPathname}`
  if (!arePublicAgmBattlesAvailable()) {
    return {
      title: t('metaTitle'),
      description: t('pausedBody'),
      alternates: {
        canonical: canonicalUrl,
        languages: buildSeoMarketingLanguageAlternates(canonicalPathname) ?? undefined,
      },
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
    alternates: {
      canonical: canonicalUrl,
      languages: buildSeoMarketingLanguageAlternates(canonicalPathname) ?? undefined,
    },
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

function formatUtcDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${value}T00:00:00.000Z`))
}

function formatUtcDateTime(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).format(new Date(value))
}

function seasonDisplayName(
  name: string,
  t: Awaited<ReturnType<typeof getMarketingTranslator>>,
): string {
  const seasonNumber = extractPublicZvzSeasonNumber(name)
  return seasonNumber
    ? t('seasonNumberLabel', { season: seasonNumber })
    : name
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
  entityKind,
  battleSearchHref,
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
  entityKind: PublicZvzRankingEntityKind
  battleSearchHref: string | null
}) {
  const clearHref = buildPublicZvzBoardHref({
    basePath,
    server,
    division,
    minPlayers,
    defaultMinPlayers: PUBLIC_ZVZ_DEFAULT_MIN_FORCE_SIZE,
    seasonId,
    asOfDate,
    entityKind,
  })

  return (
    <section
      aria-labelledby="public-zvz-record-search-title"
      className="mt-8 rounded-xl bg-white/[0.025] p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.09)]"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.9fr)] lg:items-center">
        <div className="min-w-0">
          <h2
            id="public-zvz-record-search-title"
            className="text-balance text-base font-black text-white"
          >
            {t('searchTitle')}
          </h2>
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
          {entityKind === 'guild' ? (
            <input type="hidden" name="entity" value="guild" />
          ) : null}
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
              {battleSearchHref ? (
                <Link
                  href={battleSearchHref}
                  className="mt-4 flex min-h-16 items-center justify-between rounded-xl bg-amber-400/[0.08] px-4 text-sm font-bold text-amber-100 shadow-[0_0_0_1px_rgba(251,191,36,0.2)] hover:bg-amber-400/[0.13]"
                >
                  {t('battleId', { id: searchQuery })}
                  <ArrowUpRight size={17} />
                </Link>
              ) : searchResults.length > 0 ? (
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
  server: PublicZvzV2Ranking['server']
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
  server: PublicZvzV2Ranking['server']
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

function V2EntityLink({
  row,
  recordBasePath,
  guildBasePath,
  t,
}: {
  row: PublicZvzV2Ranking
  recordBasePath: string
  guildBasePath: string
  t: Awaited<ReturnType<typeof getMarketingTranslator>>
}) {
  if (row.entityKind === 'guild') {
    return (
      <div className="flex flex-col">
        <GuildLink
          name={row.entityName}
          server={row.server}
          guildAlbionId={row.entityAlbionId}
          weekStart={row.seasonStartsOn}
          seasonId={row.seasonId}
          snapshotDate={row.snapshotDate}
          tenantSlug={row.tenantSlug}
          profileEnabled={row.tenantProfileEnabled}
          recordBasePath={recordBasePath}
          guildBasePath={guildBasePath}
          claimedLabel={t('agmGuild')}
          unclaimedLabel={t('publicOnly')}
        />
        {row.allianceName ? (
          <AllianceLink
            name={row.allianceName}
            allianceAlbionId={row.allianceAlbionId}
            server={row.server}
            weekStart={row.seasonStartsOn}
            seasonId={row.seasonId}
            snapshotDate={row.snapshotDate}
            recordBasePath={recordBasePath}
          />
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Link
        href={buildPublicZvzAllianceRecordHref({
          basePath: recordBasePath,
          server: row.server,
          allianceAlbionId: row.entityAlbionId,
          seasonId: row.seasonId,
          asOfDate: row.snapshotDate,
        })}
        className="inline-flex min-h-10 items-center gap-2 font-bold text-white underline-offset-4 hover:text-violet-200 hover:underline"
      >
        <Shield size={15} aria-hidden="true" className="text-violet-300" />
        {row.entityName}
      </Link>
      {row.representativeGuild ? (
        <Link
          href={buildPublicZvzGuildRecordHref({
            basePath: recordBasePath,
            server: row.server,
            guildAlbionId: row.representativeGuild.guildAlbionId,
            seasonId: row.seasonId,
            asOfDate: row.snapshotDate,
          })}
          className="inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-md bg-emerald-400/[0.08] px-2 text-xs text-gray-300 shadow-[0_0_0_1px_rgba(52,211,153,0.12)] underline-offset-4 transition-[background-color,color,scale] duration-150 ease-out hover:bg-emerald-400/[0.14] hover:text-emerald-100 hover:underline active:scale-[0.96]"
        >
          <Users size={12} aria-hidden="true" className="shrink-0 text-emerald-300" />
          <span className="shrink-0 text-[10px] font-semibold text-emerald-300">
            {t('representativeGuildLabel')}
          </span>
          <span className="max-w-32 truncate font-semibold text-white">
            {row.representativeGuild.guildName}
          </span>
          <span className="shrink-0 tabular-nums text-[10px] text-gray-500">
            {t('representativeGuildContribution', {
              participation: formatDecimal(row.representativeGuild.equivalentBattles),
              kills: formatNumber(row.representativeGuild.kills),
            })}
          </span>
        </Link>
      ) : null}
    </div>
  )
}

function V2Rank({
  row,
  t,
}: {
  row: PublicZvzV2Ranking
  t: Awaited<ReturnType<typeof getMarketingTranslator>>
}) {
  const podium = podiumTone(row.rank)
  const RankIcon = row.rank === 1 ? Trophy : Medal

  return (
    <div className="flex flex-wrap items-center gap-2">
      {podium ? (
        <span
          className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 tabular-nums text-lg font-black ${podium.badge}`}
        >
          <RankIcon size={14} aria-hidden="true" className={podium.icon} />
          #{row.rank}
        </span>
      ) : (
        <span className="tabular-nums text-lg font-black text-amber-200">#{row.rank}</span>
      )}
      <RankDelta value={row.rankDelta} t={t} />
      {row.sampleStatus === 'insufficient_sample' ? (
        <span
          title={t('rankingLowConfidenceHint')}
          className="inline-flex min-h-6 items-center rounded-md bg-amber-300/10 px-1.5 text-[10px] font-bold text-amber-200 shadow-[0_0_0_1px_rgba(252,211,77,0.2)]"
        >
          {t('rankingLowConfidenceBadge')}
        </span>
      ) : null}
    </div>
  )
}

function RankingConfidenceBoundary({
  rank,
  t,
}: {
  rank: number
  t: Awaited<ReturnType<typeof getMarketingTranslator>>
}) {
  return (
    <div
      role="note"
      className="flex items-start gap-2.5 border-y border-dashed border-amber-300/25 bg-amber-300/[0.055] px-4 py-3 text-amber-100"
    >
      <TriangleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-amber-300" />
      <div>
        <p className="text-xs font-black">
          {t('rankingLowConfidenceBoundary', { rank })}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-amber-100/65">
          {t('rankingLowConfidenceHint')}
        </p>
      </div>
    </div>
  )
}

function V2RankingTable({
  rankings,
  entityKind,
  scope,
  recordBasePath,
  guildBasePath,
  lowConfidenceFromRank,
  t,
}: {
  rankings: PublicZvzV2Ranking[]
  entityKind: PublicZvzRankingEntityKind
  scope: PublicZvzV2Ranking['scope']
  recordBasePath: string
  guildBasePath: string
  lowConfidenceFromRank: number | null
  t: Awaited<ReturnType<typeof getMarketingTranslator>>
}) {
  if (rankings.length === 0) {
    return (
      <div className="rounded-xl bg-white/[0.03] px-4 py-10 text-center shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
        <p className="text-sm font-semibold text-white">{t('emptyRankingsTitle')}</p>
        <p className="mt-2 text-sm text-gray-400">{t('emptyRankingsBody')}</p>
      </div>
    )
  }

  const entityLabel = t(entityKind === 'guild' ? 'guildColumn' : 'allianceColumn')
  const lowConfidenceIndex = rankings.findIndex(
    (row) => row.sampleStatus === 'insufficient_sample',
  )
  return (
    <>
      <div className="space-y-2 sm:hidden">
        {rankings.map((row, index) => {
          const podium = podiumTone(row.rank)
          return (
            <Fragment key={`${row.server}:${row.entityKind}:${row.entityAlbionId}`}>
              {index === lowConfidenceIndex && lowConfidenceFromRank !== null ? (
                <RankingConfidenceBoundary rank={lowConfidenceFromRank} t={t} />
              ) : null}
              <article
                className={`rounded-xl p-4 ${podium?.card ?? 'bg-[#0b0f16]/90 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]'}`}
              >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <V2Rank row={row} t={t} />
                  <V2EntityLink
                    row={row}
                    recordBasePath={recordBasePath}
                    guildBasePath={guildBasePath}
                    t={t}
                  />
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {scope === 'overall' ? (
                    <PublicZvzPrimaryScaleBadge
                      scale={row.primaryEngagementScale}
                      scaleLabel={row.primaryEngagementScale
                        ? divisionLabel(row.primaryEngagementScale, t)
                        : undefined}
                      prefix={t('primaryEngagementScaleShort')}
                      pendingLabel={t('primaryEngagementScalePending')}
                      hint={t('primaryEngagementScaleHint')}
                    />
                  ) : (
                    <DivisionBadge division={scope} t={t} />
                  )}
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <dt className="text-gray-500">{t('scoreColumn')}</dt>
                  <dd className="mt-1 tabular-nums text-base font-bold text-white">
                    {formatDecimal(row.score)}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">{t('representativeSizeColumn')}</dt>
                  <dd className="mt-1 tabular-nums text-gray-200">
                    {t('peopleCount', { count: formatDecimal(row.representativeSize) })}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">{t('engagementsColumn')}</dt>
                  <dd className="mt-1 tabular-nums text-gray-200">
                    {formatNumber(row.engagementCount)}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">{t('kdColumn')}</dt>
                  <dd className="mt-1">
                    <PublicZvzKdScore
                      kills={row.kills}
                      deaths={row.deaths}
                      label={t('kdColumn')}
                      size="sm"
                    />
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">{t('averageIpColumn')}</dt>
                  <dd className="mt-1 tabular-nums text-gray-200">
                    {row.averageItemPower === null
                      ? '—'
                      : formatNumber(Math.round(row.averageItemPower))}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">{t('killFameColumn')}</dt>
                  <dd className="mt-1 tabular-nums text-gray-200">
                    {formatCompact(row.killFame)}
                  </dd>
                </div>
              </dl>
              <div className={`mt-4 grid gap-1 rounded-lg bg-black/25 p-2 text-center text-[10px] ${scope === 'overall' ? 'grid-cols-4' : 'grid-cols-2'}`}>
                {scope === 'overall' ? (
                  <div>
                    <p className="text-gray-600">{t('sizePointsShort')}</p>
                    <p className="mt-1 tabular-nums font-semibold text-sky-200">
                      {formatDecimal(row.sizePoints)}
                    </p>
                  </div>
                ) : null}
                <div>
                  <p className="text-gray-600">{t('combatPointsShort')}</p>
                  <p className="mt-1 tabular-nums font-semibold text-rose-200">
                    {formatDecimal(row.combatPoints)}
                  </p>
                </div>
                {scope === 'overall' ? (
                  <div>
                    <p className="text-gray-600">{t('efficiencyPointsShort')}</p>
                    <p className="mt-1 tabular-nums font-semibold text-violet-200">
                      {formatDecimal(row.efficiencyPoints)}
                    </p>
                  </div>
                ) : null}
                <div>
                  <p className="text-gray-600">{t('activityPointsShort')}</p>
                  <p className="mt-1 tabular-nums font-semibold text-emerald-200">
                    {formatDecimal(row.activityPoints)}
                  </p>
                </div>
              </div>
              </article>
            </Fragment>
          )
        })}
      </div>

      <div className="hidden overflow-x-auto rounded-xl shadow-[0_0_0_1px_rgba(255,255,255,0.08)] sm:block">
        <table className="min-w-[1120px] w-full border-collapse bg-[#0b0f16]/90 text-sm">
          <thead className="bg-white/[0.04] text-left text-[11px] uppercase tracking-[0.14em] text-gray-400">
            <tr>
              <th className="px-4 py-3 font-semibold">{t('rankColumn')}</th>
              <th className="px-4 py-3 font-semibold">{entityLabel}</th>
              <th className="px-4 py-3 font-semibold">
                {t(scope === 'overall' ? 'primaryEngagementScaleColumn' : 'divisionColumn')}
              </th>
              <th className="px-4 py-3 text-right font-semibold">{t('representativeSizeColumn')}</th>
              <th className="px-4 py-3 text-right font-semibold">{t('averageIpColumn')}</th>
              <th className="px-4 py-3 text-right font-semibold">{t('scoreColumn')}</th>
              <th className="px-4 py-3 text-right font-semibold">{t('scoreBreakdownColumn')}</th>
              <th className="px-4 py-3 text-right font-semibold">{t('engagementsColumn')}</th>
              <th className="px-4 py-3 text-right font-semibold">{t('kdColumn')}</th>
              <th className="px-4 py-3 text-right font-semibold">{t('killFameColumn')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {rankings.map((row, index) => {
              const podium = podiumTone(row.rank)
              return (
                <Fragment key={`${row.server}:${row.entityKind}:${row.entityAlbionId}`}>
                  {index === lowConfidenceIndex && lowConfidenceFromRank !== null ? (
                    <tr>
                      <td colSpan={10} className="p-0">
                        <RankingConfidenceBoundary rank={lowConfidenceFromRank} t={t} />
                      </td>
                    </tr>
                  ) : null}
                  <tr
                    className={`transition-[background-color] duration-150 ease-out ${podium?.row ?? 'hover:bg-white/[0.03]'}`}
                  >
                <td className="px-4 py-3"><V2Rank row={row} t={t} /></td>
                <td className="px-4 py-3">
                  <V2EntityLink
                    row={row}
                    recordBasePath={recordBasePath}
                    guildBasePath={guildBasePath}
                    t={t}
                  />
                </td>
                <td className="px-4 py-3">
                  {scope === 'overall' ? (
                    <PublicZvzPrimaryScaleBadge
                      scale={row.primaryEngagementScale}
                      scaleLabel={row.primaryEngagementScale
                        ? divisionLabel(row.primaryEngagementScale, t)
                        : undefined}
                      prefix={t('primaryEngagementScaleShort')}
                      pendingLabel={t('primaryEngagementScalePending')}
                      hint={t('primaryEngagementScaleHint')}
                    />
                  ) : (
                    <DivisionBadge division={scope} t={t} />
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-200">
                  {t('peopleCount', { count: formatDecimal(row.representativeSize) })}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-200">
                  {row.averageItemPower === null
                    ? '—'
                    : formatNumber(Math.round(row.averageItemPower))}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-base font-black text-white">
                  {formatDecimal(row.score)}
                </td>
                <td className="px-4 py-3 text-right text-[11px] tabular-nums text-gray-400">
                  {scope === 'overall' ? `${formatDecimal(row.sizePoints)} · ` : ''}
                  {formatDecimal(row.combatPoints)} · {scope === 'overall'
                    ? `${formatDecimal(row.efficiencyPoints)} · `
                    : ''}{formatDecimal(row.activityPoints)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-200">
                  {formatNumber(row.engagementCount)}
                </td>
                <td className="px-4 py-3 text-right">
                  <PublicZvzKdScore
                    kills={row.kills}
                    deaths={row.deaths}
                    label={t('kdColumn')}
                    size="sm"
                  />
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-200">
                  {formatCompact(row.killFame)}
                </td>
                  </tr>
                </Fragment>
              )
            })}
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
  kdLabel,
}: {
  force: PublicBattleForce
  recordBasePath: string
  server: PublicRecentBattle['server']
  weekStart: string
  linkEnabled: boolean
  kdLabel: string
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
      <PublicZvzKdScore
        kills={force.kills}
        deaths={force.deaths}
        label={kdLabel}
        size="xs"
        surface={false}
      />
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
  kdLabel,
}: {
  force: PublicBattleForce
  recordBasePath: string
  server: PublicRecentBattle['server']
  weekStart: string
  linkEnabled: boolean
  claimedLabel: string
  kdLabel: string
}) {
  const link = force.guildLink
  const guildAlbionId = force.guildIds[0] ?? null
  const content = (
    <>
      <span className="max-w-[160px] truncate">{force.forceName}</span>
      <span className="tabular-nums text-gray-400">{force.teamSize}</span>
      <PublicZvzKdScore
        kills={force.kills}
        deaths={force.deaths}
        label={kdLabel}
        size="xs"
        surface={false}
      />
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
  const isZvZ = battle.isOfficialZvz
  const weekStart = getUtcWeekStartDateString(new Date(battle.startedAt))
  const evidenceGuildIds = new Set(
    battle.topGuilds.filter((force) => force.teamSize >= 10).flatMap((force) => force.guildIds),
  )
  const primaryForce = battle.topForces[0] ?? null
  const secondaryForce = battle.topForces[1] ?? null
  const additionalForceCount = Math.max(0, battle.topForces.length - 2)
  const primaryGuildForces = battle.topGuilds.filter(
    (force) => force.teamSize >= OFFICIAL_ZVZ_MIN_SIDE_SIZE,
  )
  const deferredGuildForces = battle.topGuilds.filter(
    (force) => force.teamSize < OFFICIAL_ZVZ_MIN_SIDE_SIZE,
  )
  const collapseGuildSection = shouldCollapsePublicZvzGuildSection(
    battle.topGuilds.length,
  )
  const reportHref = buildPublicZvzBattleReportHref({
    basePath: recordBasePath,
    server: battle.server,
    battleId: battle.albionBattleId,
  })

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
          <Link href={reportHref} className="group/report mt-3 block">
          <h3 className="flex flex-wrap items-center gap-2 text-balance text-lg font-black text-white group-hover/report:text-amber-100">
            {primaryForce ? (
              <>
                <span className="min-w-0 truncate text-sky-100">
                  {primaryForce.forceName}
                </span>
                {secondaryForce ? (
                  <>
                    <span className="rounded-full bg-white/[0.06] px-2 py-1 text-[10px] font-black tracking-[0.12em] text-gray-400">
                      {t('versusLabel')}
                    </span>
                    <span className="min-w-0 truncate text-rose-100">
                      {secondaryForce.forceName}
                    </span>
                  </>
                ) : null}
                {additionalForceCount > 0 ? (
                  <span className="rounded-md bg-rose-300/10 px-2 py-1 text-[11px] font-bold text-rose-200">
                    {t('additionalForces', { count: additionalForceCount })}
                  </span>
                ) : null}
              </>
            ) : (
              <span>{t('battleId', { id: battle.albionBattleId })}</span>
            )}
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            {t('battleId', { id: battle.albionBattleId })}
          </p>
          </Link>
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
                kdLabel={t('kdColumn')}
              />
            ))}
          </div>
        </div>
        <div>
          {collapseGuildSection ? (
            <PublicZvzCollapsibleGuildList
              title={t('topGuildsTitle')}
              countLabel={t('searchGuildCount', { count: battle.topGuilds.length })}
            >
              {battle.topGuilds.map((force) => (
                <GuildForcePill
                  key={force.forceKey}
                  force={force}
                  recordBasePath={recordBasePath}
                  server={battle.server}
                  weekStart={weekStart}
                  linkEnabled={isZvZ && force.teamSize >= 10}
                  claimedLabel={t('agmGuild')}
                  kdLabel={t('kdColumn')}
                />
              ))}
            </PublicZvzCollapsibleGuildList>
          ) : (
            <>
              <p className="mb-2 text-xs font-semibold text-gray-400">
                {t('topGuildsTitle')}
              </p>
              {primaryGuildForces.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {primaryGuildForces.map((force) => (
                    <GuildForcePill
                      key={force.forceKey}
                      force={force}
                      recordBasePath={recordBasePath}
                      server={battle.server}
                      weekStart={weekStart}
                      linkEnabled={isZvZ && force.teamSize >= 10}
                      claimedLabel={t('agmGuild')}
                      kdLabel={t('kdColumn')}
                    />
                  ))}
                </div>
              ) : null}
              {deferredGuildForces.length > 0 ? (
                <PublicZvzDeferredGuildList
                  summary={t('smallerGuildsMore', {
                    count: deferredGuildForces.length,
                  })}
                >
                  {deferredGuildForces.map((force) => (
                    <GuildForcePill
                      key={force.forceKey}
                      force={force}
                      recordBasePath={recordBasePath}
                      server={battle.server}
                      weekStart={weekStart}
                      linkEnabled={isZvZ && force.teamSize >= 10}
                      claimedLabel={t('agmGuild')}
                      kdLabel={t('kdColumn')}
                    />
                  ))}
                </PublicZvzDeferredGuildList>
              ) : null}
            </>
          )}
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
  const entityKind = normalizePublicZvzRankingEntityKind(firstParam(params.entity))
  const showAllActivity = firstParam(params.activity) === 'all'
  const requestedRankingPage = normalizePublicZvzRankingPage(firstParam(params.rankPage))
  const rankingScope = division ?? 'overall'
  const minPlayers = normalizePublicZvzMinPlayers(firstParam(params.min))
  const seasonId = normalizePublicZvzSeasonId(firstParam(params.season))
  const asOfDate = normalizePublicZvzDate(firstParam(params.asOf))
  const rawSearchQuery = firstParam(params.q) ?? ''
  const searchAttempted = rawSearchQuery.trim().length > 0
  const searchQuery = normalizePublicZvzEntitySearchQuery(rawSearchQuery)
  const searchedBattleId = normalizePublicZvzBattleId(rawSearchQuery)
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

  const [boardData, entitySearch, v2RankingState] = await Promise.all([
    loadPublicZvzBoardData({
      server,
      division,
      minPlayers,
      rankingLimit: 20,
      seasonId,
      asOfDate,
    }),
    searchQuery && !searchedBattleId
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
    loadPublicZvzV2Rankings({
      server,
      entityKind,
      scope: rankingScope,
      seasonId,
      asOfDate,
      limit: PUBLIC_ZVZ_RANKING_MAX_RESULTS,
    })
      .then((result) => ({ result, error: false }))
      .catch(() => ({ result: null, error: true })),
  ])
  const { recentBattles, recentError } = boardData
  const visibleRecentBattles = showAllActivity
    ? recentBattles
    : recentBattles.filter((battle) => battle.isOfficialZvz)
  const battleSearchHref = searchedBattleId && server
    ? buildPublicZvzBattleReportHref({
        basePath: paths.zvzBattles,
        server,
        battleId: searchedBattleId,
      })
    : null

  const rankings = v2RankingState.result?.rankings ?? []
  const rankingServers = server ? [server] : PUBLIC_ZVZ_RANKING_SERVERS
  const completeRankingGroups = rankingServers.map((rankingServer) => ({
    server: rankingServer,
    rankings: rankings.filter((row) => row.server === rankingServer),
  }))
  const largestRankingGroupSize = Math.max(
    0,
    ...completeRankingGroups.map((group) => group.rankings.length),
  )
  const rankingPageCount = Math.max(
    1,
    Math.ceil(largestRankingGroupSize / PUBLIC_ZVZ_RANKING_PAGE_SIZE),
  )
  const rankingPage = Math.min(requestedRankingPage, rankingPageCount)
  const rankingPageStart = (rankingPage - 1) * PUBLIC_ZVZ_RANKING_PAGE_SIZE
  const rankingPageEnd = rankingPageStart + PUBLIC_ZVZ_RANKING_PAGE_SIZE
  const rankingGroups = completeRankingGroups
    .map((group) => ({
      ...group,
      lowConfidenceFromRank:
        group.rankings.find((row) => row.sampleStatus === 'insufficient_sample')?.rank ?? null,
      rankings: group.rankings.slice(rankingPageStart, rankingPageEnd),
    }))
    .filter((group) => rankingPage === 1 || group.rankings.length > 0)
  const seasonResult = v2RankingState.result
  const rankingError = v2RankingState.error
  const rankingResult = {
    periodKind: 'season' as const,
  }
  const primarySeasonSelection = seasonResult?.selections[0] ?? null
  const selectedSnapshotDate =
    primarySeasonSelection?.snapshot?.snapshotDate ?? seasonResult?.requestedDate ?? null
  const today = new Date().toISOString().slice(0, 10)
  const seasonDateMax = primarySeasonSelection?.season.endsOn
    ? previousUtcDate(primarySeasonSelection.season.endsOn)
    : today
  const trackedEntityCount = seasonResult?.selections.reduce((sum, selection) => (
    sum + (entityKind === 'guild'
      ? selection.snapshot?.guildCount ?? 0
      : selection.snapshot?.allianceCount ?? 0)
  ), 0) ?? 0
  const recentZvzCount = recentBattles.filter((battle) => battle.isOfficialZvz).length
  const activityToggleBaseHref = buildPublicZvzBoardHref({
    basePath: paths.zvzBattles,
    server,
    division,
    minPlayers,
    defaultMinPlayers: PUBLIC_ZVZ_DEFAULT_MIN_FORCE_SIZE,
    seasonId,
    asOfDate,
    query: searchQuery,
    entityKind,
  })
  const allActivityHref = `${activityToggleBaseHref}${activityToggleBaseHref.includes('?') ? '&' : '?'}activity=all`
  const rankingPageHref = (page: number) => {
    const href = buildPublicZvzBoardHref({
      basePath: paths.zvzBattles,
      server,
      division,
      minPlayers,
      defaultMinPlayers: PUBLIC_ZVZ_DEFAULT_MIN_FORCE_SIZE,
      seasonId,
      asOfDate,
      query: searchQuery,
      entityKind,
      rankingPage: page,
    })
    return showAllActivity
      ? `${href}${href.includes('?') ? '&' : '?'}activity=all`
      : href
  }

  const statCards = [
    {
      icon: Trophy,
      label: t(entityKind === 'guild' ? 'statRankedGuilds' : 'statRankedAlliances'),
      value: formatNumber(trackedEntityCount),
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
            label: seasonDisplayName(season.name, t),
            href: buildPublicZvzBoardHref({
              basePath: paths.zvzBattles,
              server,
              division,
              minPlayers,
              defaultMinPlayers: PUBLIC_ZVZ_DEFAULT_MIN_FORCE_SIZE,
              seasonId: season.id,
              asOfDate: targetDate,
              query: searchQuery,
              entityKind,
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
    entityKind,
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
            <Link
              href={`${paths.zvzBattles}/methodology`}
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md bg-white/[0.055] px-4 text-sm font-bold text-amber-100 shadow-[0_0_0_1px_rgba(251,191,36,0.22)] transition-[background-color,scale] hover:bg-amber-400/10 active:scale-[0.96]"
            >
              <Shield size={16} />
              {t('methodologyLink')}
              <ArrowUpRight size={15} />
            </Link>
          </section>

          <nav
            aria-label={t('serverFilterTitle')}
            className="mt-8 grid grid-cols-4 gap-1 rounded-xl bg-white/[0.03] p-1 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
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
                      entityKind,
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

          <section className="mt-4 grid gap-3 sm:grid-cols-3">
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
            entityKind={entityKind}
            battleSearchHref={battleSearchHref}
          />

          <section className="mt-10 border-y border-white/[0.08] py-8">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-amber-200">
                <Trophy size={18} />
                <h2 className="text-xl font-black text-white">
                  {rankingResult.periodKind === 'season'
                    ? t('seasonRankingTitle')
                    : t('rankingTitle')}
                </h2>
              </div>
              <span className="shrink-0 rounded-md bg-white/[0.05] px-2 py-1 text-[11px] font-semibold text-gray-400">
                {t('engagementsColumn')} ≥ 2
              </span>
            </div>
            {rankingResult.periodKind === 'season' && seasonResult ? (
              <section
                aria-label={t('seasonStatusTitle')}
                className="mb-5 flex flex-wrap gap-2"
              >
                {seasonResult.selections.length > 0 ? (
                  <>
                    {seasonResult.selections.map((selection) => {
                      const displayName = seasonDisplayName(selection.season.name, t)
                      const isCurrentSeason =
                        selection.season.startsOn <= today &&
                        (!selection.season.endsOn || today < selection.season.endsOn)
                      const seasonStart = t('seasonStartValue', {
                        date: formatUtcDate(selection.season.startsOn, locale),
                      })
                      const dataThrough = selection.snapshot
                        ? formatUtcDateTime(selection.snapshot.dataThroughAt, locale)
                        : null

                      return (
                        <article
                          key={`${selection.season.server}:${selection.season.id}`}
                          className="flex min-h-12 flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-white/[0.035] px-3 py-2 text-xs shadow-[0_0_0_1px_rgba(255,255,255,0.09)]"
                        >
                          <span className="font-bold text-sky-200">
                            {t(`server_${selection.season.server}`)}
                          </span>
                          <strong className="text-sm text-white">{displayName}</strong>
                          <span className="tabular-nums text-gray-400">
                            {seasonStart} → {dataThrough ?? t('snapshotPending')}
                          </span>
                          <span
                            className={`rounded-md px-2 py-1 text-[10px] font-black ${
                              isCurrentSeason
                                ? 'bg-emerald-300/15 text-emerald-200'
                                : 'bg-white/[0.06] text-gray-300'
                            }`}
                          >
                            {t(isCurrentSeason ? 'seasonCurrentBadge' : 'seasonSelectedBadge')}
                          </span>
                          {selection.snapshot ? (
                            <span className="rounded-md bg-black/25 px-2 py-1 text-[10px] font-semibold text-gray-300">
                              {t(selection.snapshot.isFinal
                                ? 'snapshotFinal'
                                : 'snapshotProvisionalShort')}
                            </span>
                          ) : null}
                        </article>
                      )
                    })}
                  </>
                ) : (
                  <p className="rounded-xl bg-white/[0.035] px-4 py-3 text-sm text-gray-400 shadow-[0_0_0_1px_rgba(255,255,255,0.09)]">
                    {t('seasonStatusUnavailable')}
                  </p>
                )}
              </section>
            ) : null}
            <nav
              aria-label={t('entityFilterTitle')}
              className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-black/25 p-1 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
            >
              {PUBLIC_ZVZ_RANKING_ENTITY_KINDS.map((kind) => {
                const active = entityKind === kind
                return (
                  <Link
                    key={kind}
                    href={buildPublicZvzBoardHref({
                      basePath: paths.zvzBattles,
                      server,
                      division,
                      minPlayers,
                      defaultMinPlayers: PUBLIC_ZVZ_DEFAULT_MIN_FORCE_SIZE,
                      seasonId,
                      asOfDate,
                      query: searchQuery,
                      entityKind: kind,
                    })}
                    scroll={false}
                    aria-current={active ? 'page' : undefined}
                    className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold transition-[background-color,color,scale] active:scale-[0.98] ${
                      active
                        ? kind === 'guild'
                          ? 'bg-amber-300 text-slate-950'
                          : 'bg-violet-300 text-violet-950'
                        : 'text-gray-400 hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    {kind === 'guild' ? <Users size={16} /> : <Shield size={16} />}
                    {t(kind === 'guild' ? 'entityGuildTab' : 'entityAllianceTab')}
                  </Link>
                )
              })}
            </nav>
            <div className="mb-5 rounded-xl bg-white/[0.03] p-1 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
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
                          entityKind,
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
              <div className="mb-5 flex flex-wrap items-end justify-end gap-2 rounded-xl bg-white/[0.03] p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
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
                    {entityKind === 'guild' ? (
                      <input type="hidden" name="entity" value="guild" />
                    ) : null}
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
              <div className="space-y-7">
                {rankingGroups.map((group) => {
                  const titleId = `public-zvz-ranking-${group.server}`
                  return (
                    <section key={group.server} aria-labelledby={titleId}>
                      <h3 id={titleId} className="mb-3 text-balance text-base font-black text-white">
                        {t('serverRankingSectionTitle', {
                          server: t(`server_${group.server}`),
                        })}
                      </h3>
                      <V2RankingTable
                        rankings={group.rankings}
                        entityKind={entityKind}
                        scope={rankingScope}
                        recordBasePath={paths.zvzBattles}
                        guildBasePath={paths.guildPage}
                        lowConfidenceFromRank={group.lowConfidenceFromRank}
                        t={t}
                      />
                    </section>
                  )
                })}
                {rankingPageCount > 1 ? (
                  <nav
                    aria-label={t('rankingPaginationLabel')}
                    className="flex flex-wrap items-center justify-center gap-2 border-t border-white/[0.08] pt-5"
                  >
                    <Link
                      href={rankingPageHref(Math.max(1, rankingPage - 1))}
                      aria-disabled={rankingPage === 1}
                      className={`inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-xs font-bold transition-[background-color,color,scale] active:scale-[0.96] ${rankingPage === 1 ? 'pointer-events-none text-gray-700' : 'bg-white/[0.05] text-gray-300 hover:bg-white/[0.09] hover:text-white'}`}
                    >
                      <ChevronLeft size={15} aria-hidden="true" />
                      {t('rankingPreviousPage')}
                    </Link>
                    {Array.from({ length: rankingPageCount }, (_, index) => index + 1).map((page) => (
                      <Link
                        key={page}
                        href={rankingPageHref(page)}
                        aria-current={page === rankingPage ? 'page' : undefined}
                        aria-label={t('rankingPageLabel', { page })}
                        className={`inline-flex size-11 items-center justify-center rounded-lg tabular-nums text-sm font-black transition-[background-color,color,scale] active:scale-[0.96] ${page === rankingPage ? 'bg-amber-300 text-slate-950' : 'bg-white/[0.05] text-gray-300 hover:bg-white/[0.09] hover:text-white'}`}
                      >
                        {page}
                      </Link>
                    ))}
                    <Link
                      href={rankingPageHref(Math.min(rankingPageCount, rankingPage + 1))}
                      aria-disabled={rankingPage === rankingPageCount}
                      className={`inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-xs font-bold transition-[background-color,color,scale] active:scale-[0.96] ${rankingPage === rankingPageCount ? 'pointer-events-none text-gray-700' : 'bg-white/[0.05] text-gray-300 hover:bg-white/[0.09] hover:text-white'}`}
                    >
                      {t('rankingNextPage')}
                      <ChevronRight size={15} aria-hidden="true" />
                    </Link>
                    <p className="w-full text-center text-xs tabular-nums text-gray-500">
                      {t('rankingPageSummary', {
                        from: rankingPageStart + 1,
                        to: Math.min(rankingPageEnd, largestRankingGroupSize),
                      })}
                    </p>
                  </nav>
                ) : null}
              </div>
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
            entityKind={entityKind}
            title={t('recentTitle')}
            filterLabel={t('recentForceFilterLabel')}
            customOptionLabel={t('recentForceCustomOption')}
            customInputLabel={t('recentForceCustomLabel')}
            customInputPlaceholder={t('minForceInputPlaceholder')}
            forceUnitLabel={t('recentForceUnit')}
            applyLabel={t('applyFilters')}
            updatingLabel={t('filterUpdating')}
            presets={recentForcePresets}
          >
            <nav
              aria-label={t('activityViewTitle')}
              className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-black/25 p-1"
            >
              <Link
                href={activityToggleBaseHref}
                scroll={false}
                aria-current={!showAllActivity ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center justify-center rounded-md px-3 text-xs font-bold ${
                  !showAllActivity
                    ? 'bg-amber-300 text-slate-950'
                    : 'text-gray-300 hover:bg-white/[0.08] hover:text-white'
                }`}
              >
                {t('activityViewOfficial')}
              </Link>
              <Link
                href={allActivityHref}
                scroll={false}
                aria-current={showAllActivity ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center justify-center rounded-md px-3 text-xs font-bold ${
                  showAllActivity
                    ? 'bg-sky-300 text-slate-950'
                    : 'text-gray-300 hover:bg-white/[0.08] hover:text-white'
                }`}
              >
                {t('activityViewAll')}
              </Link>
            </nav>
            {recentError ? (
              <div className="rounded-lg bg-white/[0.03] px-4 py-8 text-center shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
                <p className="text-sm font-semibold text-white">{t('recentUnavailableTitle')}</p>
                <p className="mt-2 text-sm text-gray-400">{t('recentUnavailableBody')}</p>
              </div>
            ) : visibleRecentBattles.length === 0 ? (
              <div className="rounded-lg bg-white/[0.03] px-4 py-8 text-center shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
                <p className="text-sm font-semibold text-white">{t('emptyRecentTitle')}</p>
                <p className="mt-2 text-sm text-gray-400">{t('emptyRecentBody')}</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {visibleRecentBattles.map((battle) => (
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

        </main>
      </div>
    </>
  )
}
