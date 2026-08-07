import type { Metadata } from 'next'
import Link from 'next/link'
import { Fragment } from 'react'
import {
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Medal,
  Search,
  Shield,
  Trophy,
  TriangleAlert,
  Users,
  X,
} from 'lucide-react'
import MarketingAttributionTracker from '@/components/MarketingAttributionTracker'
import MarketingNav from '@/components/MarketingNav'
import BattlelogPausedPanel from '@/components/BattlelogPausedPanel'
import {
  PublicZvzNavigationSelect,
  PublicZvzRecentSection,
} from '@/components/PublicZvzBoardFilters'
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
  normalizePublicZvzBoardView,
  normalizePublicZvzRankingPage,
  type PublicZvzBoardView,
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
import { loadPublicZvzV2Rankings, type PublicZvzV2Ranking } from '@/lib/public-zvz-ranking-v2-data'
import {
  normalizePublicZvzRankingEntityKind,
  PUBLIC_ZVZ_RANKING_ENTITY_KINDS,
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
  view?: string | string[]
}

const SERVER_OPTIONS: Array<{
  value: PublicZvzV2Ranking['server']
  labelKey: string
}> = [
  { value: 'west', labelKey: 'serverWest' },
  { value: 'europe', labelKey: 'serverEurope' },
  { value: 'east', labelKey: 'serverEast' },
]

const RECENT_FORCE_PRESETS = [20, 18, 10] as const
const RECENT_BATTLE_PREVIEW_COUNT = 3
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
    active: 'border-emerald-300 bg-emerald-400/10 text-emerald-100',
    idle: 'border-transparent text-emerald-200 hover:bg-emerald-400/[0.06]',
  },
  mid: {
    badge: 'bg-sky-400/10 text-sky-200 shadow-[0_0_0_1px_rgba(56,189,248,0.22)]',
    dot: 'bg-sky-300',
    rank: 'text-sky-200',
    active: 'border-sky-300 bg-sky-400/10 text-sky-100',
    idle: 'border-transparent text-sky-200 hover:bg-sky-400/[0.06]',
  },
  large: {
    badge: 'bg-violet-400/10 text-violet-200 shadow-[0_0_0_1px_rgba(167,139,250,0.22)]',
    dot: 'bg-violet-300',
    rank: 'text-violet-200',
    active: 'border-violet-300 bg-violet-400/10 text-violet-100',
    idle: 'border-transparent text-violet-200 hover:bg-violet-400/[0.06]',
  },
  zerg: {
    badge: 'bg-rose-400/10 text-rose-200 shadow-[0_0_0_1px_rgba(251,113,133,0.22)]',
    dot: 'bg-rose-300',
    rank: 'text-rose-200',
    active: 'border-rose-300 bg-rose-400/10 text-rose-100',
    idle: 'border-transparent text-rose-200 hover:bg-rose-400/[0.06]',
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
    card: 'bg-[linear-gradient(110deg,rgba(251,191,36,0.14),rgba(11,15,22,0.96)_52%)] shadow-[inset_3px_0_0_rgba(251,191,36,0.78),0_0_0_1px_rgba(251,191,36,0.24),0_16px_36px_-28px_rgba(251,191,36,0.9)]',
    row: 'bg-amber-300/[0.07] [&>td:first-child]:shadow-[inset_3px_0_0_rgba(251,191,36,0.78)] hover:bg-amber-300/[0.1]',
    badge:
      'bg-[linear-gradient(145deg,rgba(253,224,71,0.24),rgba(245,158,11,0.12))] text-amber-100 shadow-[0_0_0_1px_rgba(253,224,71,0.32),0_8px_20px_-14px_rgba(251,191,36,0.95)]',
    icon: 'text-amber-300',
  },
  2: {
    card: 'bg-[linear-gradient(110deg,rgba(226,232,240,0.1),rgba(11,15,22,0.96)_52%)] shadow-[inset_3px_0_0_rgba(203,213,225,0.68),0_0_0_1px_rgba(226,232,240,0.18),0_16px_34px_-30px_rgba(226,232,240,0.72)]',
    row: 'bg-slate-200/[0.045] [&>td:first-child]:shadow-[inset_3px_0_0_rgba(203,213,225,0.68)] hover:bg-slate-200/[0.075]',
    badge:
      'bg-[linear-gradient(145deg,rgba(241,245,249,0.15),rgba(148,163,184,0.08))] text-slate-100 shadow-[0_0_0_1px_rgba(226,232,240,0.24)]',
    icon: 'text-slate-300',
  },
  3: {
    card: 'bg-[linear-gradient(110deg,rgba(251,146,60,0.1),rgba(11,15,22,0.96)_52%)] shadow-[inset_3px_0_0_rgba(251,146,60,0.66),0_0_0_1px_rgba(251,146,60,0.18),0_16px_34px_-30px_rgba(251,146,60,0.72)]',
    row: 'bg-orange-400/[0.045] [&>td:first-child]:shadow-[inset_3px_0_0_rgba(251,146,60,0.66)] hover:bg-orange-400/[0.075]',
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
  return seasonNumber ? t('seasonNumberLabel', { season: seasonNumber }) : name
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
  view,
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
  view: PublicZvzBoardView
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
    view,
  })

  return (
    <section
      aria-labelledby="public-zvz-record-search-title"
      className="mt-6 border-y border-white/[0.1] py-4"
    >
      <h2 id="public-zvz-record-search-title" className="sr-only">
        {t('searchTitle')}
      </h2>

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
        {entityKind === 'guild' ? <input type="hidden" name="entity" value="guild" /> : null}
        {view === 'battles' ? <input type="hidden" name="view" value="battles" /> : null}
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
            className="h-12 w-full rounded-md border border-white/[0.14] bg-[#0b0f16] pl-10 pr-4 text-sm text-white outline-none transition-[border-color,box-shadow] placeholder:text-gray-500 focus:border-amber-200 focus:shadow-[0_0_0_3px_rgba(252,211,77,0.16)]"
          />
        </label>
        <button
          type="submit"
          className="inline-flex h-12 min-w-24 items-center justify-center rounded-md bg-amber-300 pl-4 pr-3.5 text-sm font-black text-slate-950 transition-[background-color,scale] duration-150 ease-out hover:bg-amber-200 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100"
        >
          {t('searchSubmit')}
        </button>
      </form>

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
  scale,
}: {
  name: string
  allianceAlbionId: string | null
  server: PublicZvzV2Ranking['server']
  weekStart: string
  seasonId: string | null
  snapshotDate: string | null
  recordBasePath: string
  scale: PublicZvzDivision | null
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
        scale,
      })}
      className="inline-flex min-h-8 items-center text-xs text-gray-500 underline-offset-4 hover:text-violet-200 hover:underline"
    >
      {name}
    </Link>
  )
}

function V2EntityLink({
  row,
  scope,
  recordBasePath,
  guildBasePath,
  t,
}: {
  row: PublicZvzV2Ranking
  scope: PublicZvzV2Ranking['scope']
  recordBasePath: string
  guildBasePath: string
  t: Awaited<ReturnType<typeof getMarketingTranslator>>
}) {
  const scale = scope === 'overall' ? null : scope

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
            scale={scale}
          />
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col items-start">
      <Link
        href={buildPublicZvzAllianceRecordHref({
          basePath: recordBasePath,
          server: row.server,
          allianceAlbionId: row.entityAlbionId,
          seasonId: row.seasonId,
          asOfDate: row.snapshotDate,
          scale,
        })}
        className="inline-flex min-h-9 items-center gap-2 font-black text-white underline-offset-4 hover:text-amber-200 hover:underline"
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
          className="inline-flex min-h-8 max-w-full items-center gap-1.5 text-xs text-gray-500 underline-offset-4 transition-[color] duration-150 ease-out hover:text-gray-200 hover:underline"
        >
          <Users size={12} aria-hidden="true" className="shrink-0 text-gray-500" />
          <span className="shrink-0 text-[11px] font-semibold text-gray-500">
            {t('representativeGuildLabel')}
          </span>
          <span className="max-w-32 truncate font-semibold text-gray-300">
            {row.representativeGuild.guildName}
          </span>
          <span className="shrink-0 tabular-nums text-[11px] text-gray-600">
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
          <RankIcon size={14} aria-hidden="true" className={podium.icon} />#{row.rank}
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
        <p className="text-xs font-black">{t('rankingLowConfidenceBoundary', { rank })}</p>
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
  const lowConfidenceIndex = rankings.findIndex((row) => row.sampleStatus === 'insufficient_sample')
  return (
    <>
      <div className="sm:hidden">
        {rankings.map((row, index) => {
          const podium = podiumTone(row.rank)
          return (
            <Fragment key={`${row.server}:${row.entityKind}:${row.entityAlbionId}`}>
              {index === lowConfidenceIndex && lowConfidenceFromRank !== null ? (
                <RankingConfidenceBoundary rank={lowConfidenceFromRank} t={t} />
              ) : null}
              <article
                className={
                  podium
                    ? `mb-2 rounded-lg p-4 ${podium.card}`
                    : 'border-b border-white/[0.08] px-1 py-4'
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <V2Rank row={row} t={t} />
                    <V2EntityLink
                      row={row}
                      scope={scope}
                      recordBasePath={recordBasePath}
                      guildBasePath={guildBasePath}
                      t={t}
                    />
                  </div>
                  <div className="shrink-0 pt-0.5">
                    {scope === 'overall' ? (
                      <PublicZvzPrimaryScaleBadge
                        scale={row.primaryEngagementScale}
                        scaleLabel={
                          row.primaryEngagementScale
                            ? divisionLabel(row.primaryEngagementScale, t)
                            : undefined
                        }
                        prefix={t('primaryEngagementScaleShort')}
                        pendingLabel={t('primaryEngagementScalePending')}
                        hint={t('primaryEngagementScaleHint')}
                      />
                    ) : (
                      <DivisionBadge division={scope} t={t} />
                    )}
                  </div>
                </div>

                <div className="mt-3 flex items-end justify-between gap-4 border-t border-white/[0.07] pt-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-500">{t('scoreColumn')}</p>
                    <p className="mt-0.5 tabular-nums text-xl font-black text-white">
                      {formatDecimal(row.score)}
                    </p>
                  </div>
                  <PublicZvzKdScore
                    kills={row.kills}
                    deaths={row.deaths}
                    label={t('kdColumn')}
                    size="sm"
                  />
                </div>

                <dl className="mt-3 grid grid-cols-4 gap-2 text-xs">
                  <div>
                    <dt className="text-gray-500">{t('representativeSizeColumn')}</dt>
                    <dd className="mt-1 tabular-nums font-semibold text-gray-200">
                      {t('peopleCount', {
                        count: formatDecimal(row.representativeSize),
                      })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">{t('engagementsColumn')}</dt>
                    <dd className="mt-1 tabular-nums font-semibold text-gray-200">
                      {formatNumber(row.engagementCount)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">{t('averageIpColumn')}</dt>
                    <dd className="mt-1 tabular-nums font-semibold text-gray-200">
                      {row.averageItemPower === null
                        ? '—'
                        : formatNumber(Math.round(row.averageItemPower))}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">{t('killFameColumn')}</dt>
                    <dd className="mt-1 tabular-nums font-semibold text-gray-200">
                      {formatCompact(row.killFame)}
                    </dd>
                  </div>
                </dl>
              </article>
            </Fragment>
          )
        })}
      </div>

      <div className="hidden overflow-x-auto border-y border-white/[0.1] sm:block">
        <table className="min-w-[960px] w-full border-collapse text-sm">
          <thead className="bg-white/[0.025] text-left text-xs text-gray-500">
            <tr>
              <th className="px-3 py-3 font-semibold">{t('rankColumn')}</th>
              <th className="px-3 py-3 font-semibold">{entityLabel}</th>
              <th className="px-3 py-3 font-semibold">
                {t(scope === 'overall' ? 'primaryEngagementScaleColumn' : 'divisionColumn')}
              </th>
              <th className="px-3 py-3 text-right font-semibold">
                {t('representativeSizeColumn')}
              </th>
              <th className="px-3 py-3 text-right font-semibold">{t('scoreColumn')}</th>
              <th className="px-3 py-3 text-right font-semibold">{t('kdColumn')}</th>
              <th className="px-3 py-3 text-right font-semibold">{t('engagementsColumn')}</th>
              <th className="px-3 py-3 text-right font-semibold">{t('averageIpColumn')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {rankings.map((row, index) => {
              const podium = podiumTone(row.rank)
              return (
                <Fragment key={`${row.server}:${row.entityKind}:${row.entityAlbionId}`}>
                  {index === lowConfidenceIndex && lowConfidenceFromRank !== null ? (
                    <tr>
                      <td colSpan={8} className="p-0">
                        <RankingConfidenceBoundary rank={lowConfidenceFromRank} t={t} />
                      </td>
                    </tr>
                  ) : null}
                  <tr
                    className={`transition-[background-color] duration-150 ease-out ${podium?.row ?? 'hover:bg-white/[0.03]'}`}
                  >
                    <td className="px-3 py-3.5">
                      <V2Rank row={row} t={t} />
                    </td>
                    <td className="px-3 py-3.5">
                      <V2EntityLink
                        row={row}
                        scope={scope}
                        recordBasePath={recordBasePath}
                        guildBasePath={guildBasePath}
                        t={t}
                      />
                    </td>
                    <td className="px-3 py-3.5">
                      {scope === 'overall' ? (
                        <PublicZvzPrimaryScaleBadge
                          scale={row.primaryEngagementScale}
                          scaleLabel={
                            row.primaryEngagementScale
                              ? divisionLabel(row.primaryEngagementScale, t)
                              : undefined
                          }
                          prefix={t('primaryEngagementScaleShort')}
                          pendingLabel={t('primaryEngagementScalePending')}
                          hint={t('primaryEngagementScaleHint')}
                        />
                      ) : (
                        <DivisionBadge division={scope} t={t} />
                      )}
                    </td>
                    <td className="px-3 py-3.5 text-right tabular-nums text-gray-200">
                      {t('peopleCount', {
                        count: formatDecimal(row.representativeSize),
                      })}
                    </td>
                    <td className="px-3 py-3.5 text-right">
                      <p className="tabular-nums text-base font-black text-white">
                        {formatDecimal(row.score)}
                      </p>
                      <p className="mt-0.5 tabular-nums text-xs text-gray-600">
                        {t('killFameColumn')} {formatCompact(row.killFame)}
                      </p>
                    </td>
                    <td className="px-3 py-3.5 text-right">
                      <PublicZvzKdScore
                        kills={row.kills}
                        deaths={row.deaths}
                        label={t('kdColumn')}
                        size="sm"
                      />
                    </td>
                    <td className="px-3 py-3.5 text-right tabular-nums text-gray-200">
                      {formatNumber(row.engagementCount)}
                    </td>
                    <td className="px-3 py-3.5 text-right tabular-nums text-gray-200">
                      {row.averageItemPower === null
                        ? '—'
                        : formatNumber(Math.round(row.averageItemPower))}
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

function BattleMatchupSide({
  force,
  side,
  t,
}: {
  force: PublicBattleForce | null
  side: 'left' | 'right'
  t: Awaited<ReturnType<typeof getMarketingTranslator>>
}) {
  if (!force) return <span className="text-gray-600">—</span>

  return (
    <div className={side === 'right' ? 'text-right' : 'text-left'}>
      <p
        className={`truncate text-xl font-black sm:text-2xl ${
          side === 'right' ? 'text-rose-100' : 'text-sky-100'
        }`}
      >
        {force.forceName}
      </p>
      <div
        className={`mt-2 flex flex-wrap items-center gap-2 ${
          side === 'right' ? 'justify-end' : 'justify-start'
        }`}
      >
        <span className="tabular-nums text-sm font-semibold text-gray-400">
          {t('peopleCount', { count: force.teamSize })}
        </span>
        <PublicZvzKdScore
          kills={force.kills}
          deaths={force.deaths}
          label={t('kdColumn')}
          size="sm"
        />
      </div>
    </div>
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
  const collapseGuildSection = shouldCollapsePublicZvzGuildSection(battle.topGuilds.length)
  const reportHref = buildPublicZvzBattleReportHref({
    basePath: recordBasePath,
    server: battle.server,
    battleId: battle.albionBattleId,
  })

  return (
    <article className="border-b border-white/[0.1] py-6 first:border-t">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`px-2 py-1 text-xs font-bold ${
              isZvZ ? 'bg-amber-400/15 text-amber-200' : 'bg-white/[0.06] text-gray-300'
            }`}
          >
            {isZvZ ? t('agmZvzBadge') : t(`activity_${battle.activityKind}`)}
          </span>
          <span className="bg-sky-400/10 px-2 py-1 text-xs font-semibold text-sky-200">
            {t(`server_${battle.server}`)}
          </span>
          <span className="text-xs tabular-nums text-gray-500">
            {formatDateTime(battle.startedAt, locale)}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-5 sm:text-right">
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

      <Link
        href={reportHref}
        className="group/report mt-5 block bg-[linear-gradient(90deg,rgba(56,189,248,0.055),transparent_46%,rgba(251,113,133,0.055))] px-3 py-5 transition-[background-color] duration-150 ease-out hover:bg-white/[0.035] sm:px-5"
      >
        <h3 className="sr-only">
          {primaryForce?.forceName ?? t('battleId', { id: battle.albionBattleId })}
          {secondaryForce ? ` ${t('versusLabel')} ${secondaryForce.forceName}` : ''}
        </h3>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
          <BattleMatchupSide force={primaryForce} side="left" t={t} />
          <span className="text-sm font-black tracking-[0.14em] text-gray-500 transition-[color] duration-150 group-hover/report:text-amber-200">
            {t('versusLabel')}
          </span>
          <BattleMatchupSide force={secondaryForce} side="right" t={t} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-gray-500">
          {additionalForceCount > 0 ? (
            <span className="font-bold text-rose-200">
              {t('additionalForces', { count: additionalForceCount })}
            </span>
          ) : null}
          <span>{t('battleId', { id: battle.albionBattleId })}</span>
          <ArrowUpRight
            size={14}
            aria-hidden="true"
            className="transition-transform duration-150 ease-out group-hover/report:-translate-y-0.5 group-hover/report:translate-x-0.5"
          />
        </div>
      </Link>

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
              countLabel={t('searchGuildCount', {
                count: battle.topGuilds.length,
              })}
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
              <p className="mb-2 text-xs font-semibold text-gray-400">{t('topGuildsTitle')}</p>
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
  const server = normalizePublicZvzServerFilter(firstParam(params.server)) ?? 'west'
  const division = normalizePublicZvzDivisionFilter(firstParam(params.division))
  const entityKind = normalizePublicZvzRankingEntityKind(firstParam(params.entity))
  const view = normalizePublicZvzBoardView(firstParam(params.view))
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
  const previewRecentBattles = visibleRecentBattles.slice(0, RECENT_BATTLE_PREVIEW_COUNT)
  const deferredRecentBattles = visibleRecentBattles.slice(RECENT_BATTLE_PREVIEW_COUNT)
  const battleSearchHref =
    searchedBattleId && server
      ? buildPublicZvzBattleReportHref({
          basePath: paths.zvzBattles,
          server,
          battleId: searchedBattleId,
        })
      : null

  const rankings = v2RankingState.result?.rankings ?? []
  const rankingServers = [server]
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
  const primarySeasonSelection = seasonResult?.selections[0] ?? null
  const selectedSnapshotDate =
    primarySeasonSelection?.snapshot?.snapshotDate ?? seasonResult?.requestedDate ?? null
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const seasonDateMax = primarySeasonSelection?.season.endsOn
    ? previousUtcDate(primarySeasonSelection.season.endsOn)
    : today
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
    view: 'battles',
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
      view: 'ranking',
    })
    return href
  }

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
              view: 'ranking',
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
    view: 'ranking',
  })
  const serverNavigationOptions = SERVER_OPTIONS.map((option) => ({
    value: option.value,
    label: t(option.labelKey),
    href: buildPublicZvzBoardHref({
      basePath: paths.zvzBattles,
      server: option.value,
      division,
      minPlayers,
      defaultMinPlayers: PUBLIC_ZVZ_DEFAULT_MIN_FORCE_SIZE,
      query: searchQuery,
      entityKind,
      view,
    }),
  }))
  const rankingViewHref = buildPublicZvzBoardHref({
    basePath: paths.zvzBattles,
    server,
    division,
    minPlayers,
    defaultMinPlayers: PUBLIC_ZVZ_DEFAULT_MIN_FORCE_SIZE,
    seasonId,
    asOfDate,
    query: searchQuery,
    entityKind,
    view: 'ranking',
  })
  const battleViewHref = buildPublicZvzBoardHref({
    basePath: paths.zvzBattles,
    server,
    division,
    minPlayers,
    defaultMinPlayers: PUBLIC_ZVZ_DEFAULT_MIN_FORCE_SIZE,
    seasonId,
    asOfDate,
    query: searchQuery,
    entityKind,
    view: 'battles',
  })
  const currentServerLabel = t(`server_${server}`)
  const currentSeasonLabel = primarySeasonSelection
    ? seasonDisplayName(primarySeasonSelection.season.name, t)
    : t('seasonCurrentBadge')

  return (
    <>
      <MarketingAttributionTracker />
      <MarketingNav active="battles" />
      <div className="min-h-screen bg-[#080b10] text-white">
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
          <header className="border-b border-white/[0.1] pb-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-300">
                  {t('eyebrow')}
                </p>
                <h1 className="mt-3 max-w-4xl break-keep text-3xl font-black leading-[1.12] text-white sm:text-5xl">
                  {t('boardHeading', {
                    server: currentServerLabel,
                    season: currentSeasonLabel,
                  })}
                </h1>
                {primarySeasonSelection ? (
                  <p className="mt-3 text-pretty text-sm tabular-nums text-gray-400">
                    {formatUtcDateTime(primarySeasonSelection.season.startsAt, locale)}
                    {' → '}
                    {primarySeasonSelection.snapshot
                      ? formatUtcDateTime(primarySeasonSelection.snapshot.dataThroughAt, locale)
                      : t('snapshotPending')}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <PublicZvzNavigationSelect
                  label={t('serverFilterTitle')}
                  value={server}
                  options={serverNavigationOptions}
                  updatingLabel={t('filterUpdating')}
                />
                <Link
                  href={`${paths.zvzBattles}/methodology`}
                  className="inline-flex min-h-11 items-center justify-center gap-2 px-2 text-sm font-bold text-gray-400 underline-offset-4 transition-[color,scale] duration-150 ease-out hover:text-amber-200 hover:underline active:scale-[0.96]"
                >
                  {t('methodologyLink')}
                  <ArrowUpRight size={15} aria-hidden="true" />
                </Link>
              </div>
            </div>
          </header>

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
            view={view}
            battleSearchHref={battleSearchHref}
          />

          <nav
            aria-label={t('boardViewTitle')}
            className="mt-6 grid grid-cols-2 border-b border-white/[0.12]"
          >
            <Link
              href={rankingViewHref}
              scroll={false}
              aria-current={view === 'ranking' ? 'page' : undefined}
              className={`inline-flex min-h-12 items-center justify-center border-b-2 px-4 text-sm font-black transition-[border-color,color,scale] duration-150 ease-out active:scale-[0.96] ${
                view === 'ranking'
                  ? 'border-amber-300 text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-200'
              }`}
            >
              {t('seasonRankingTitle')}
            </Link>
            <Link
              href={battleViewHref}
              scroll={false}
              aria-current={view === 'battles' ? 'page' : undefined}
              className={`inline-flex min-h-12 items-center justify-center border-b-2 px-4 text-sm font-black transition-[border-color,color,scale] duration-150 ease-out active:scale-[0.96] ${
                view === 'battles'
                  ? 'border-amber-300 text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-200'
              }`}
            >
              {t('recentTitle')}
            </Link>
          </nav>

          {view === 'ranking' ? (
            <section className="mt-8">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-xl font-black text-white">{t('seasonRankingTitle')}</h2>
                <span className="shrink-0 text-xs font-semibold text-gray-500">
                  {t('relativeRankingBadge')}
                </span>
              </div>
              <nav
                aria-label={t('entityFilterTitle')}
                className="mb-3 grid grid-cols-2 border-y border-white/[0.1]"
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
                        view: 'ranking',
                      })}
                      scroll={false}
                      aria-current={active ? 'page' : undefined}
                      className={`inline-flex min-h-12 items-center justify-center gap-2 border-b-2 px-3 text-sm font-bold transition-[border-color,color,scale] active:scale-[0.96] ${
                        active
                          ? 'border-amber-300 text-white'
                          : 'border-transparent text-gray-500 hover:text-white'
                      }`}
                    >
                      {kind === 'guild' ? <Users size={16} /> : <Shield size={16} />}
                      {t(kind === 'guild' ? 'entityGuildTab' : 'entityAllianceTab')}
                    </Link>
                  )
                })}
              </nav>
              <div className="mb-5 border-b border-white/[0.1] pb-4">
                <nav
                  aria-label={t('divisionFilterTitle')}
                  className="grid grid-cols-2 gap-1 sm:grid-cols-5"
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
                          view: 'ranking',
                        })}
                        scroll={false}
                        aria-current={active ? 'page' : undefined}
                        className={`flex min-h-14 flex-col items-start justify-center border-l-2 px-3 text-left transition-[background-color,border-color,color,scale] duration-150 ease-out active:scale-[0.96] ${
                          active
                            ? (tone?.active ?? 'border-white bg-white/[0.07] text-white')
                            : (tone?.idle ??
                              'border-transparent text-gray-400 hover:bg-white/[0.04] hover:text-white')
                        }`}
                      >
                        <span className="text-sm font-bold">{label}</span>
                        <span className="mt-0.5 text-xs font-medium opacity-70">
                          {t(item.rangeKey)}
                        </span>
                      </Link>
                    )
                  })}
                </nav>
              </div>
              {seasonResult && server && primarySeasonSelection ? (
                <details className="group mb-5 border-b border-white/[0.1] pb-4">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-bold text-gray-400 transition-[color] duration-150 ease-out hover:text-white [&::-webkit-details-marker]:hidden">
                    {t('historyControlsTitle')}
                    <ChevronDown
                      size={16}
                      aria-hidden="true"
                      className="transition-transform duration-150 ease-out group-open:rotate-180"
                    />
                  </summary>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                    {seasonNavigationOptions.length > 0 ? (
                      <PublicZvzNavigationSelect
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
                      <input type="hidden" name="server" value={server} />
                      {division ? <input type="hidden" name="division" value={division} /> : null}
                      {minPlayers !== PUBLIC_ZVZ_DEFAULT_MIN_FORCE_SIZE ? (
                        <input type="hidden" name="min" value={minPlayers} />
                      ) : null}
                      <input type="hidden" name="season" value={primarySeasonSelection.season.id} />
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
                          min={primarySeasonSelection.season.startsOn}
                          max={latestSeasonDate}
                          defaultValue={selectedSnapshotDate ?? seasonResult.requestedDate}
                          className="h-11 rounded-md border border-white/[0.14] bg-[#0b0f16] px-3 text-sm text-white outline-none transition-[border-color,box-shadow] focus:border-amber-200 focus:shadow-[0_0_0_2px_rgba(252,211,77,0.18)]"
                        />
                      </label>
                      <button
                        type="submit"
                        className="inline-flex h-11 items-center justify-center rounded-md bg-amber-300 px-4 text-xs font-bold text-slate-950 transition-[background-color,scale] duration-150 ease-out hover:bg-amber-200 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100"
                      >
                        {t('viewPastRanking')}
                      </button>
                      {selectedSnapshotDate && selectedSnapshotDate !== latestSeasonDate ? (
                        <Link
                          href={latestRankingHref}
                          scroll={false}
                          className="inline-flex h-11 items-center justify-center rounded-md bg-white/[0.06] px-3 text-xs font-semibold text-gray-200 transition-[background-color,color,scale] duration-150 ease-out hover:bg-white/[0.1] hover:text-white active:scale-[0.96]"
                        >
                          {t('viewLatestRanking')}
                        </Link>
                      ) : null}
                    </form>
                  </div>
                </details>
              ) : null}
              {rankingError ? (
                <div className="rounded-lg bg-white/[0.03] px-4 py-8 text-center shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
                  <p className="text-sm font-semibold text-white">
                    {t('rankingsUnavailableTitle')}
                  </p>
                  <p className="mt-2 text-sm text-gray-400">{t('rankingsUnavailableBody')}</p>
                </div>
              ) : (
                <div className="space-y-7">
                  {rankingGroups.map((group) => {
                    const titleId = `public-zvz-ranking-${group.server}`
                    return (
                      <section key={group.server} aria-labelledby={titleId}>
                        <h3
                          id={titleId}
                          className="mb-3 text-balance text-base font-black text-white"
                        >
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
                      {Array.from({ length: rankingPageCount }, (_, index) => index + 1).map(
                        (page) => (
                          <Link
                            key={page}
                            href={rankingPageHref(page)}
                            aria-current={page === rankingPage ? 'page' : undefined}
                            aria-label={t('rankingPageLabel', { page })}
                            className={`inline-flex size-11 items-center justify-center rounded-lg tabular-nums text-sm font-black transition-[background-color,color,scale] active:scale-[0.96] ${page === rankingPage ? 'bg-amber-300 text-slate-950' : 'bg-white/[0.05] text-gray-300 hover:bg-white/[0.09] hover:text-white'}`}
                          >
                            {page}
                          </Link>
                        ),
                      )}
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
          ) : (
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
              view="battles"
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
                className="mb-3 grid grid-cols-2 border-b border-white/[0.1]"
              >
                <Link
                  href={activityToggleBaseHref}
                  scroll={false}
                  aria-current={!showAllActivity ? 'page' : undefined}
                  className={`inline-flex min-h-11 items-center justify-center border-b-2 px-3 text-xs font-bold ${
                    !showAllActivity
                      ? 'border-amber-300 text-white'
                      : 'border-transparent text-gray-500 hover:text-white'
                  }`}
                >
                  {t('activityViewOfficial')}
                </Link>
                <Link
                  href={allActivityHref}
                  scroll={false}
                  aria-current={showAllActivity ? 'page' : undefined}
                  className={`inline-flex min-h-11 items-center justify-center border-b-2 px-3 text-xs font-bold ${
                    showAllActivity
                      ? 'border-amber-300 text-white'
                      : 'border-transparent text-gray-500 hover:text-white'
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
                <div>
                  {previewRecentBattles.map((battle) => (
                    <BattleCard
                      key={battle.id}
                      battle={battle}
                      recordBasePath={paths.zvzBattles}
                      locale={locale}
                      t={t}
                    />
                  ))}
                  {deferredRecentBattles.length > 0 ? (
                    <details className="group">
                      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 border-y border-white/[0.1] px-4 text-sm font-bold text-gray-300 transition-[background-color,color] duration-150 ease-out hover:bg-white/[0.04] hover:text-white [&::-webkit-details-marker]:hidden">
                        {t('moreRecentBattles', {
                          count: deferredRecentBattles.length,
                        })}
                        <ChevronDown
                          size={16}
                          aria-hidden="true"
                          className="transition-transform duration-150 ease-out group-open:rotate-180"
                        />
                      </summary>
                      <div className="mt-3">
                        {deferredRecentBattles.map((battle) => (
                          <BattleCard
                            key={battle.id}
                            battle={battle}
                            recordBasePath={paths.zvzBattles}
                            locale={locale}
                            t={t}
                          />
                        ))}
                      </div>
                    </details>
                  ) : null}
                </div>
              )}
            </PublicZvzRecentSection>
          )}
        </main>
      </div>
    </>
  )
}
