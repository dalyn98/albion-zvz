import type { ReactNode } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Swords,
} from 'lucide-react'
import MarketingAttributionTracker from '@/components/MarketingAttributionTracker'
import MarketingNav from '@/components/MarketingNav'
import type { AlbionServer } from '@/lib/albion-gameinfo'
import {
  buildPublicZvzAllianceRecordHref,
  buildPublicZvzGuildRecordHref,
} from '@/lib/public-zvz-record-links'
import type { PublicZvzOpponentForce } from '@/lib/public-zvz-records'
import type { PublicZvzEngagementScale } from '@/lib/public-zvz-ranking-v2'
import type {
  PublicZvzSeasonRecordContext,
  PublicZvzSeasonSummary,
} from '@/lib/public-zvz-seasons'

export function formatPublicZvzNumber(value: number): string {
  return new Intl.NumberFormat('en').format(value)
}

export function formatPublicZvzDecimal(value: number): string {
  return new Intl.NumberFormat('en', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value)
}

export function formatPublicZvzScoreComponent(value: number): string {
  return new Intl.NumberFormat('en', {
    maximumFractionDigits: 4,
    minimumFractionDigits: 0,
  }).format(value)
}

export function formatPublicZvzCompact(value: number): string {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

const KD_SIZE_CLASSES = {
  xs: 'gap-1 text-[11px]',
  sm: 'gap-1.5 text-xs',
  md: 'gap-2 text-sm',
  lg: 'gap-2.5 text-xl sm:text-2xl',
} as const

export function PublicZvzKdScore({
  kills,
  deaths,
  label,
  size = 'md',
  surface = true,
}: {
  kills: number
  deaths: number
  label: string
  size?: keyof typeof KD_SIZE_CLASSES
  surface?: boolean
}) {
  const formattedKills = formatPublicZvzNumber(kills)
  const formattedDeaths = formatPublicZvzNumber(deaths)

  return (
    <span
      className={`inline-flex max-w-full items-baseline whitespace-nowrap tabular-nums font-black ${KD_SIZE_CLASSES[size]} ${
        surface
          ? 'rounded-md bg-white/[0.05] px-2 py-1 shadow-[0_0_0_1px_rgba(255,255,255,0.09)]'
          : ''
      }`}
    >
      <span className="sr-only">
        {label}: {formattedKills} – {formattedDeaths}
      </span>
      <span aria-hidden="true" className="inline-flex items-baseline gap-0.5 text-emerald-200">
        <span>{formattedKills}</span>
        <span className="text-[0.62em] font-extrabold uppercase tracking-[0.08em] text-emerald-300/70">
          K
        </span>
      </span>
      <span aria-hidden="true" className="font-semibold text-gray-600">
        –
      </span>
      <span aria-hidden="true" className="inline-flex items-baseline gap-0.5 text-rose-200">
        <span>{formattedDeaths}</span>
        <span className="text-[0.62em] font-extrabold uppercase tracking-[0.08em] text-rose-300/70">
          D
        </span>
      </span>
    </span>
  )
}

export function formatPublicZvzDateTime(value: string, locale: string): string {
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

export function PublicZvzRecordChrome({
  children,
}: {
  children: ReactNode
}) {
  return (
    <>
      <MarketingAttributionTracker />
      <MarketingNav active="battles" />
      <div className="min-h-screen bg-[#080b10] text-white">
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
          {children}
        </main>
      </div>
    </>
  )
}

export function PublicZvzRecordHeader({
  boardHref,
  backLabel,
  eyebrow,
  title,
  subtitle,
  badges,
  actions,
}: {
  boardHref: string
  backLabel: string
  eyebrow: string
  title: string
  subtitle: string
  badges?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header>
      <Link
        href={boardHref}
        className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-gray-400 underline-offset-4 hover:text-white hover:underline"
      >
        <ArrowLeft size={15} />
        {backLabel}
      </Link>
      <div className="mt-5 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 rounded-sm bg-amber-400/10 px-2.5 py-1 text-xs font-bold uppercase tracking-[0.18em] text-amber-200">
            <Swords size={14} />
            {eyebrow}
          </p>
          <h1 className="mt-3 break-words text-3xl font-black text-white sm:text-5xl">
            {title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-300 sm:text-base">
            {subtitle}
          </p>
          {badges ? <div className="mt-3 flex flex-wrap gap-2">{badges}</div> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </header>
  )
}

export function PublicZvzWeekSelector({
  title,
  selectedWeek,
  weeks,
  hrefForWeek,
}: {
  title: string
  selectedWeek: string
  weeks: string[]
  hrefForWeek: (week: string) => string
}) {
  return (
    <section className="mt-8 rounded-lg bg-white/[0.03] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
      <div className="flex items-center gap-2 text-sm font-bold text-white">
        <CalendarDays size={16} className="text-sky-200" />
        {title}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {weeks.map((week) => (
          <Link
            key={week}
            href={hrefForWeek(week)}
            aria-current={week === selectedWeek ? 'page' : undefined}
            className={`inline-flex min-h-10 items-center rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              week === selectedWeek
                ? 'bg-sky-300 text-slate-950'
                : 'bg-white/[0.05] text-gray-300 hover:bg-white/[0.1] hover:text-white'
            }`}
          >
            {week}
          </Link>
        ))}
      </div>
    </section>
  )
}

export function PublicZvzSeasonHistorySelector({
  context,
  actionHref,
  hrefForSeason,
  labels,
}: {
  context: PublicZvzSeasonRecordContext
  actionHref: string
  hrefForSeason: (season: PublicZvzSeasonSummary) => string
  labels: {
    title: string
    seasonLabel: string
    dateLabel: string
    apply: string
    final: string
    provisional: string
    dataThrough: string
  }
}) {
  const today = new Date().toISOString().slice(0, 10)
  const maxDate = context.season.endsOn
    ? (() => {
        const date = new Date(`${context.season.endsOn}T00:00:00.000Z`)
        date.setUTCDate(date.getUTCDate() - 1)
        return date.toISOString().slice(0, 10)
      })()
    : today

  return (
    <section className="mt-8 rounded-lg bg-white/[0.03] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
      <div className="flex items-center gap-2 text-sm font-bold text-white">
        <CalendarDays size={16} className="text-sky-200" />
        {labels.title}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-xs font-semibold text-gray-400">{labels.seasonLabel}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[...context.availableSeasons].reverse().map((season) => (
              <Link
                key={season.id}
                href={hrefForSeason(season)}
                aria-current={season.id === context.season.id ? 'page' : undefined}
                className={`inline-flex min-h-10 items-center rounded-md px-3 py-1.5 text-xs font-semibold ${
                  season.id === context.season.id
                    ? 'bg-sky-300 text-slate-950'
                    : 'bg-white/[0.05] text-gray-300 hover:bg-white/[0.1] hover:text-white'
                }`}
              >
                {season.name}
              </Link>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            {context.snapshot.isFinal ? labels.final : labels.provisional}
            <span className="mx-1.5 text-gray-700">·</span>
            {labels.dataThrough}
          </p>
        </div>
        <form action={actionHref} method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="season" value={context.season.id} />
          <label className="grid gap-1 text-xs font-semibold text-gray-300">
            <span>{labels.dateLabel}</span>
            <input
              type="date"
              name="asOf"
              required
              min={context.season.startsOn}
              max={maxDate < today ? maxDate : today}
              defaultValue={context.snapshot.snapshotDate}
              className="h-10 rounded-md border border-white/[0.12] bg-black/25 px-3 text-sm text-white outline-none focus:border-sky-200"
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-10 items-center rounded-md bg-sky-300 px-4 text-xs font-bold text-slate-950 hover:bg-sky-200"
          >
            {labels.apply}
          </button>
        </form>
      </div>
    </section>
  )
}

export function PublicZvzMetricGrid({
  metrics,
}: {
  metrics: Array<{
    label: string
    value: ReactNode
    hint?: string
    tone?: string
  }>
}) {
  return (
    <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="rounded-lg bg-[#0b0f16]/90 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
        >
          <dt className="text-xs text-gray-500">{metric.label}</dt>
          <dd className={`mt-2 tabular-nums text-2xl font-black ${metric.tone ?? 'text-white'}`}>
            {metric.value}
          </dd>
          {metric.hint ? (
            <p className="mt-1 text-xs text-gray-500">{metric.hint}</p>
          ) : null}
        </div>
      ))}
    </dl>
  )
}

interface PublicZvzBattleMatchupLabels {
  included: string
  engagementScale: string
  scaleRankingIncluded: string
  scaleRankingExcluded: string
  scaleRankingHint: string
  battleId: string
  totalPlayers: string
  versus: string
  opponents: string
  opponentCount: string
  force: string
  kd: string
  killFame: string
  noOpponents: string
}

const ENGAGEMENT_SCALE_TONES: Record<PublicZvzEngagementScale, string> = {
  small: 'bg-emerald-400/10 text-emerald-200 shadow-[0_0_0_1px_rgba(52,211,153,0.22)]',
  mid: 'bg-sky-400/10 text-sky-200 shadow-[0_0_0_1px_rgba(56,189,248,0.22)]',
  large: 'bg-violet-400/10 text-violet-200 shadow-[0_0_0_1px_rgba(167,139,250,0.22)]',
  zerg: 'bg-rose-400/10 text-rose-200 shadow-[0_0_0_1px_rgba(251,113,133,0.22)]',
}

const ENGAGEMENT_SCALE_DOTS: Record<PublicZvzEngagementScale, string> = {
  small: 'bg-emerald-300',
  mid: 'bg-sky-300',
  large: 'bg-violet-300',
  zerg: 'bg-rose-300',
}

export function PublicZvzPrimaryScaleBadge({
  scale,
  scaleLabel,
  prefix,
  pendingLabel,
  hint,
}: {
  scale: PublicZvzEngagementScale | null
  scaleLabel?: string
  prefix: string
  pendingLabel: string
  hint?: string
}) {
  const tone = scale ? ENGAGEMENT_SCALE_TONES[scale] : null
  return (
    <span
      title={hint}
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold ${
        tone ?? 'bg-white/[0.06] text-gray-300 shadow-[0_0_0_1px_rgba(255,255,255,0.1)]'
      }`}
    >
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${scale ? ENGAGEMENT_SCALE_DOTS[scale] : 'bg-gray-500'}`}
      />
      {scale ? `${prefix} · ${scaleLabel ?? scale}` : pendingLabel}
    </span>
  )
}

export function PublicZvzScaleRankingBadge({
  eligible,
  includedLabel,
  excludedLabel,
  hint,
}: {
  eligible: boolean
  includedLabel: string
  excludedLabel: string
  hint: string
}) {
  return (
    <span
      title={hint}
      className={`inline-flex min-h-7 items-center rounded-md px-2 py-1 text-[11px] font-bold shadow-[0_0_0_1px_currentColor] ${
        eligible
          ? 'bg-cyan-400/10 text-cyan-200'
          : 'bg-amber-400/10 text-amber-200'
      }`}
    >
      {eligible ? includedLabel : excludedLabel}
    </span>
  )
}

export function PublicZvzDeferredGuildList({
  summary,
  children,
}: {
  summary: string
  children: ReactNode
}) {
  return (
    <details className="group mt-2">
      <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1.5 rounded-md bg-white/[0.035] px-2.5 py-1.5 text-xs font-semibold text-gray-400 transition-[background-color,color,scale] duration-150 ease-out hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/70 active:scale-[0.96] [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden="true"
          className="shrink-0 transition-transform duration-150 ease-out group-open:rotate-180"
        >
          <ChevronDown size={14} />
        </span>
        {summary}
      </summary>
      <div className="mt-2 flex flex-wrap gap-1.5">{children}</div>
    </details>
  )
}

export const PUBLIC_ZVZ_INLINE_GUILD_LIMIT = 4

export function shouldCollapsePublicZvzGuildSection(guildCount: number): boolean {
  return guildCount > PUBLIC_ZVZ_INLINE_GUILD_LIMIT
}

export function PublicZvzCollapsibleGuildList({
  title,
  countLabel,
  children,
}: {
  title: string
  countLabel: string
  children: ReactNode
}) {
  return (
    <details className="group rounded-lg bg-white/[0.025] shadow-[0_0_0_1px_rgba(255,255,255,0.07)]">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-3 py-2.5 transition-[background-color,box-shadow,scale] duration-150 ease-out hover:bg-white/[0.05] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/70 active:scale-[0.96] [&::-webkit-details-marker]:hidden">
        <span className="text-xs font-semibold text-gray-300">{title}</span>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold tabular-nums text-gray-500">
          {countLabel}
          <span
            aria-hidden="true"
            className="transition-transform duration-150 ease-out group-open:rotate-180"
          >
            <ChevronDown size={14} />
          </span>
        </span>
      </summary>
      <div className="px-3 pb-3">
        <div className="flex flex-wrap gap-1.5 border-t border-white/[0.06] pt-3">
          {children}
        </div>
      </div>
    </details>
  )
}

function PublicZvzBattleMetric({
  label,
  value,
}: {
  label: string
  value: ReactNode
}) {
  return (
    <div className="min-w-0 px-2 first:pl-0 last:pr-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500">
        {label}
      </dt>
      <dd className="mt-1 truncate tabular-nums text-sm font-black text-white">
        {value}
      </dd>
    </div>
  )
}

function publicZvzOpponentHref({
  opponent,
  basePath,
  server,
  weekStart,
  seasonId,
  asOfDate,
}: {
  opponent: PublicZvzOpponentForce
  basePath: string
  server: AlbionServer
  weekStart: string
  seasonId?: string | null
  asOfDate?: string | null
}): string | null {
  if (!opponent.hasScoreEvidence) return null
  if (opponent.allianceAlbionId) {
    return buildPublicZvzAllianceRecordHref({
      basePath,
      server,
      allianceAlbionId: opponent.allianceAlbionId,
      weekStart,
      seasonId,
      asOfDate,
    })
  }
  if (opponent.guildAlbionId) {
    return buildPublicZvzGuildRecordHref({
      basePath,
      server,
      guildAlbionId: opponent.guildAlbionId,
      weekStart,
      seasonId,
      asOfDate,
    })
  }
  return null
}

function PublicZvzOpponentRow({
  opponent,
  href,
  labels,
}: {
  opponent: PublicZvzOpponentForce
  href: string | null
  labels: Pick<PublicZvzBattleMatchupLabels, 'force' | 'kd' | 'killFame'>
}) {
  const content = (
    <>
      <p className="min-w-0 truncate text-sm font-black text-rose-50">
        {opponent.forceName}
      </p>
      <dl className="grid grid-cols-[0.75fr_1.5fr_0.75fr] divide-x divide-white/[0.08] text-right">
        <PublicZvzBattleMetric
          label={labels.force}
          value={formatPublicZvzNumber(opponent.teamSize)}
        />
        <PublicZvzBattleMetric
          label={labels.kd}
          value={(
            <PublicZvzKdScore
              kills={opponent.kills}
              deaths={opponent.deaths}
              label={labels.kd}
              size="sm"
            />
          )}
        />
        <PublicZvzBattleMetric
          label={labels.killFame}
          value={formatPublicZvzCompact(opponent.killFame)}
        />
      </dl>
    </>
  )
  const className =
    'grid min-h-16 gap-3 rounded-md bg-black/20 px-3 py-2.5 shadow-[0_0_0_1px_rgba(255,255,255,0.07)] sm:grid-cols-[minmax(0,1fr)_minmax(240px,auto)] sm:items-center'

  return href ? (
    <Link
      href={href}
      className={`${className} transition-[background-color,box-shadow,scale] duration-150 ease-out hover:bg-rose-300/[0.07] hover:shadow-[0_0_0_1px_rgba(253,164,175,0.24)] active:scale-[0.96]`}
    >
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  )
}

export function PublicZvzBattleMatchupCard({
  startedAt,
  locale,
  subjectName,
  subjectLabel,
  teamSize,
  kills,
  deaths,
  killFame,
  opponents,
  basePath,
  server,
  weekStart,
  seasonId,
  asOfDate,
  engagementScale,
  engagementScaleText,
  scaleRankingEligible,
  subjectContext,
  labels,
  battleHref,
}: {
  startedAt: string
  locale: string
  subjectName: string
  subjectLabel: string
  teamSize: number
  kills: number
  deaths: number
  killFame: number
  opponents: PublicZvzOpponentForce[]
  basePath: string
  server: AlbionServer
  weekStart: string
  seasonId?: string | null
  asOfDate?: string | null
  engagementScale?: PublicZvzEngagementScale | null
  engagementScaleText?: string | null
  scaleRankingEligible?: boolean
  subjectContext?: ReactNode
  labels: PublicZvzBattleMatchupLabels
  battleHref?: string | null
}) {
  const opponentNames = opponents.map((opponent) => opponent.forceName).join(', ')

  return (
    <article className="rounded-xl bg-[#0b0f16]/90 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_8px_24px_rgba(0,0,0,0.12)] sm:p-5">
      <h3 className="sr-only">
        {opponentNames
          ? `${subjectName} ${labels.versus} ${opponentNames}`
          : subjectName}
      </h3>

      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex min-h-7 items-center gap-1 rounded-md bg-emerald-400/10 px-2 py-1 text-[11px] font-bold text-emerald-200">
            <CheckCircle2 size={12} aria-hidden="true" />
            {labels.included}
          </span>
          {engagementScale && engagementScaleText ? (
            <span
              aria-label={`${labels.engagementScale}: ${engagementScaleText}`}
              className={`inline-flex min-h-7 items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold ${ENGAGEMENT_SCALE_TONES[engagementScale]}`}
            >
              <span className="text-[9px] uppercase tracking-[0.12em] opacity-65">
                {labels.engagementScale}
              </span>
              <span>{engagementScaleText}</span>
            </span>
          ) : null}
          {scaleRankingEligible !== undefined ? (
            <PublicZvzScaleRankingBadge
              eligible={scaleRankingEligible}
              includedLabel={labels.scaleRankingIncluded}
              excludedLabel={labels.scaleRankingExcluded}
              hint={labels.scaleRankingHint}
            />
          ) : null}
          <time dateTime={startedAt} className="text-xs text-gray-400">
            {formatPublicZvzDateTime(startedAt, locale)}
          </time>
        </div>
        <p className="text-xs text-gray-500">
          {battleHref ? (
            <Link href={battleHref} className="tabular-nums text-amber-200 underline-offset-4 hover:underline">
              {labels.battleId}
            </Link>
          ) : <span className="tabular-nums">{labels.battleId}</span>}
          <span className="mx-1.5 text-gray-700" aria-hidden="true">·</span>
          <span className="tabular-nums">{labels.totalPlayers}</span>
        </p>
      </header>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_auto_minmax(0,1.3fr)] lg:items-stretch">
        <section className="rounded-lg bg-sky-300/[0.045] p-4 shadow-[0_0_0_1px_rgba(125,211,252,0.16)] lg:flex lg:flex-col lg:justify-center">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-300">
            {subjectLabel}
          </p>
          <p className="mt-2 break-words text-balance text-xl font-black text-white">
            {subjectName}
          </p>
          <dl className="mt-4 grid grid-cols-[0.75fr_1.5fr_0.75fr] divide-x divide-white/[0.08]">
            <PublicZvzBattleMetric
              label={labels.force}
              value={formatPublicZvzNumber(teamSize)}
            />
            <PublicZvzBattleMetric
              label={labels.kd}
              value={(
                <PublicZvzKdScore
                  kills={kills}
                  deaths={deaths}
                  label={labels.kd}
                  size="sm"
                />
              )}
            />
            <PublicZvzBattleMetric
              label={labels.killFame}
              value={formatPublicZvzCompact(killFame)}
            />
          </dl>
          {subjectContext ? (
            <div className="mt-4 border-t border-sky-100/10 pt-3">
              {subjectContext}
            </div>
          ) : null}
        </section>

        <div className="flex items-center justify-center" aria-hidden="true">
          <span className="inline-flex size-10 items-center justify-center rounded-full bg-white/[0.06] text-[11px] font-black tracking-[0.12em] text-gray-300 shadow-[0_0_0_1px_rgba(255,255,255,0.1)]">
            {labels.versus}
          </span>
        </div>

        <section className="rounded-lg bg-rose-300/[0.035] p-4 shadow-[0_0_0_1px_rgba(253,164,175,0.14)]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-rose-300">
              {labels.opponents}
            </p>
            <span className="shrink-0 rounded-md bg-rose-300/10 px-2 py-1 text-[11px] font-bold text-rose-200">
              {labels.opponentCount}
            </span>
          </div>
          {opponents.length > 0 ? (
            <div className="mt-3 grid gap-2">
              {opponents.map((opponent) => (
                <PublicZvzOpponentRow
                  key={opponent.forceKey}
                  opponent={opponent}
                  href={publicZvzOpponentHref({
                    opponent,
                    basePath,
                    server,
                    weekStart,
                    seasonId,
                    asOfDate,
                  })}
                  labels={labels}
                />
              ))}
            </div>
          ) : (
            <p className="mt-3 text-pretty text-xs leading-5 text-gray-500">
              {labels.noOpponents}
            </p>
          )}
        </section>
      </div>
    </article>
  )
}
