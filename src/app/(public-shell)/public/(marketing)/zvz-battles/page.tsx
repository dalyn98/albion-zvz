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
import { getMarketingPathsForEnvironment } from '@/lib/marketing-paths'
import { getMarketingLocale, getMarketingTranslator } from '@/lib/marketing-static-intl'
import { getCanonicalOrigin, getCanonicalUrlForPathname } from '@/lib/seo-metadata'
import {
  loadPublicRecentBattles,
  loadWeeklyZvzRankings,
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

function boardHref(
  basePath: string,
  server: PublicZvzServerFilter,
  minPlayers: number,
): string {
  const query = new URLSearchParams()
  if (server) query.set('server', server)
  if (minPlayers !== 21) query.set('min', String(minPlayers))
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

function GuildLink({
  name,
  tenantSlug,
  profileEnabled,
  guildBasePath,
  claimedLabel,
  unclaimedLabel,
}: {
  name: string
  tenantSlug: string | null
  profileEnabled: boolean
  guildBasePath: string
  claimedLabel: string
  unclaimedLabel: string
}) {
  if (tenantSlug && profileEnabled) {
    return (
      <Link
        href={guildHref(guildBasePath, tenantSlug)}
        className="group/guild inline-flex min-h-10 items-center gap-1.5 text-white underline-offset-4 hover:text-amber-200 hover:underline"
      >
        <span>{name}</span>
        <ExternalLink
          size={13}
          className="text-amber-300/80 transition-transform group-hover/guild:translate-x-0.5"
        />
        <span className="rounded-sm bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-200">
          {claimedLabel}
        </span>
      </Link>
    )
  }

  return (
    <span className="inline-flex min-h-10 items-center gap-1.5 text-white">
      <span>{name}</span>
      <span className="rounded-sm bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-gray-400">
        {unclaimedLabel}
      </span>
    </span>
  )
}

function RankingTable({
  rankings,
  guildBasePath,
  t,
}: {
  rankings: PublicWeeklyZvzRanking[]
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
    <div className="overflow-x-auto rounded-lg shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
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
                <span className="tabular-nums text-base font-black text-amber-200">
                  #{row.rank}
                </span>
              </td>
              <td className="px-4 py-3 align-middle">
                <div className="flex flex-col">
                  <GuildLink
                    name={row.guildName}
                    tenantSlug={row.tenantSlug}
                    profileEnabled={row.tenantProfileEnabled}
                    guildBasePath={guildBasePath}
                    claimedLabel={t('agmGuild')}
                    unclaimedLabel={t('publicOnly')}
                  />
                  {row.allianceName && (
                    <span className="text-xs text-gray-500">{row.allianceName}</span>
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
  )
}

function ForcePill({ force }: { force: PublicBattleForce }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-white/[0.05] px-2 py-1 text-xs text-gray-200">
      <span className="max-w-[180px] truncate">{force.forceName}</span>
      <span className="tabular-nums text-gray-400">{force.teamSize}</span>
    </span>
  )
}

function GuildForcePill({
  force,
  guildBasePath,
  claimedLabel,
}: {
  force: PublicBattleForce
  guildBasePath: string
  claimedLabel: string
}) {
  const link = force.guildLink
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

  if (link?.tenantSlug && link.profileEnabled) {
    return (
      <Link
        href={guildHref(guildBasePath, link.tenantSlug)}
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
  guildBasePath,
  locale,
  t,
}: {
  battle: PublicRecentBattle
  guildBasePath: string
  locale: string
  t: Awaited<ReturnType<typeof getMarketingTranslator>>
}) {
  const isZvZ = battle.activityKind === 'zvz'

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
              <ForcePill key={force.forceKey} force={force} />
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
                guildBasePath={guildBasePath}
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
  const paths = getMarketingPathsForEnvironment(locale)

  const [rankingResult, recentBattles] = await Promise.all([
    loadWeeklyZvzRankings({ server, limit: 20 }),
    loadPublicRecentBattles({ server, minPlayers }),
  ])

  const rankings = rankingResult.rankings
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
                        href={boardHref(paths.zvzBattles, item.value, minPlayers)}
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
                        href={boardHref(paths.zvzBattles, server, value)}
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
                  <h2 className="text-xl font-black text-white">{t('rankingTitle')}</h2>
                </div>
                <p className="mt-2 text-sm text-gray-400">
                  {rankingResult.isCurrentWeek
                    ? t('rankingSubtitleCurrent', { week: rankingResult.weekStart })
                    : t('rankingSubtitlePrevious', { week: rankingResult.weekStart })}
                </p>
              </div>
              <p className="text-xs text-gray-500">{t('rankingRule')}</p>
            </div>
            <RankingTable rankings={rankings} guildBasePath={paths.guildPage} t={t} />
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

            {recentBattles.length === 0 ? (
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
                    guildBasePath={paths.guildPage}
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
