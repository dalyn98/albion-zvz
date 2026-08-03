import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft, CalendarDays, Swords } from 'lucide-react'
import MarketingAttributionTracker from '@/components/MarketingAttributionTracker'
import MarketingNav from '@/components/MarketingNav'
import type { AlbionServer } from '@/lib/albion-gameinfo'
import {
  buildPublicZvzAllianceRecordHref,
  buildPublicZvzGuildRecordHref,
} from '@/lib/public-zvz-record-links'
import type { PublicZvzOpponentForce } from '@/lib/public-zvz-records'
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
    value: string
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

export function PublicZvzOpponentPills({
  opponents,
  basePath,
  server,
  weekStart,
  seasonId,
  asOfDate,
}: {
  opponents: PublicZvzOpponentForce[]
  basePath: string
  server: AlbionServer
  weekStart: string
  seasonId?: string | null
  asOfDate?: string | null
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opponents.map((opponent) => {
        const href = opponent.hasScoreEvidence && opponent.allianceAlbionId
          ? buildPublicZvzAllianceRecordHref({
              basePath,
              server,
              allianceAlbionId: opponent.allianceAlbionId,
              weekStart,
              seasonId,
              asOfDate,
            })
          : opponent.hasScoreEvidence && opponent.guildAlbionId
            ? buildPublicZvzGuildRecordHref({
                basePath,
                server,
                guildAlbionId: opponent.guildAlbionId,
                weekStart,
                seasonId,
                asOfDate,
              })
            : null
        const content = (
          <>
            <span className="max-w-[220px] truncate">{opponent.forceName}</span>
            <span className="tabular-nums text-gray-500">
              {formatPublicZvzNumber(opponent.teamSize)}
            </span>
            <span className="tabular-nums text-gray-500">
              {formatPublicZvzNumber(opponent.kills)}/{formatPublicZvzNumber(opponent.deaths)}
            </span>
          </>
        )

        return href ? (
          <Link
            key={opponent.forceKey}
            href={href}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-sm bg-white/[0.05] px-2.5 py-1 text-xs text-gray-200 underline-offset-4 hover:bg-amber-400/10 hover:text-amber-100 hover:underline"
          >
            {content}
          </Link>
        ) : (
          <span
            key={opponent.forceKey}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-sm bg-white/[0.05] px-2.5 py-1 text-xs text-gray-300"
          >
            {content}
          </span>
        )
      })}
    </div>
  )
}
