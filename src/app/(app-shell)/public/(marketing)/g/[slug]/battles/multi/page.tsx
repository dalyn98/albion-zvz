import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { AlertTriangle, ArrowUpRight, Clock, Eye, MapPin, Shield, Swords } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import BattlelogPausedPanel from '@/components/BattlelogPausedPanel'
import PublicBattleReportExplorer from '@/components/PublicBattleReportExplorer'
import { areBattlelogFeaturesPaused } from '@/lib/battlelog-pause'
import { formatDateTime } from '@/lib/format-datetime'
import { formatKillbotCompactFame } from '@/lib/killbot-battle'
import { loadPublicBattleGroupAnalysis } from '@/lib/public-battle-analysis'
import type { PublicBattleGroupAnalysis } from '@/lib/public-battle-analysis-model'
import {
  loadPublicBattleGroupReport,
  type PublicBattleGroupLoadError,
  type PublicBattleGroupReport,
} from '@/lib/public-battle-report'
import { PUBLIC_BATTLE_GROUP_MAX_IDS } from '@/lib/public-battle-report-model'
import { buildTenantHostUrl } from '@/lib/tenant-resolver'
import { getTenantTimezone } from '@/lib/timezone-server'

export const dynamic = 'force-dynamic'

interface Params {
  slug: string
}

interface SearchParams {
  server?: string | string[]
  ids?: string | string[]
}

function firstSearchParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0]?.trim() || null
  return value?.trim() || null
}

function battleSummaryOgImageUrl(args: { slug: string; searchParams: SearchParams }): string | null {
  const server = firstSearchParam(args.searchParams.server)
  const ids = firstSearchParam(args.searchParams.ids)
  if (!server || !ids) return null
  const query = new URLSearchParams({ slug: args.slug, server, ids })
  return buildTenantHostUrl(args.slug, `/api/public/battle-summary-og?${query.toString()}`)
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<SearchParams>
}): Promise<Metadata> {
  const [{ slug }, resolvedSearchParams, t] = await Promise.all([
    params,
    searchParams,
    getTranslations('publicBattleGroup'),
  ])
  const ogImageUrl = battleSummaryOgImageUrl({ slug, searchParams: resolvedSearchParams })
  const title = t('metaTitle')
  const description = t('metaDescription')
  return {
    title,
    description,
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: { index: false, follow: false, noimageindex: true },
    },
    ...(ogImageUrl
      ? {
          openGraph: {
            type: 'article',
            title,
            description,
            images: [{ url: ogImageUrl, width: 1200, height: 630, alt: title }],
          },
          twitter: { card: 'summary_large_image', title, description, images: [ogImageUrl] },
        }
      : {}),
  }
}

function formatInteger(value: number): string {
  return Math.max(0, Math.floor(value)).toLocaleString('en-US')
}

function summarizeNames(names: ReadonlyArray<string>, fallback: string): string {
  if (names.length === 0) return fallback
  if (names.length <= 3) return names.join(', ')
  return `${names.slice(0, 3).join(', ')} +${names.length - 3}`
}

function errorKey(error: PublicBattleGroupLoadError): string {
  if (error === 'missing_server') return 'errorMissingServer'
  if (error === 'invalid_server') return 'errorInvalidServer'
  if (error === 'missing_ids') return 'errorMissingIds'
  if (error === 'invalid_ids') return 'errorInvalidIds'
  if (error === 'too_many_ids') return 'errorTooManyIds'
  if (error === 'no_tracked_battles') return 'errorNoTrackedBattles'
  return 'errorTenantNotFound'
}

function HeaderMetric({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'home' | 'opponent' | 'fame' }) {
  const toneClass = tone === 'home'
    ? 'text-emerald-300'
    : tone === 'opponent'
      ? 'text-red-300'
      : tone === 'fame'
        ? 'text-amber-200'
        : 'text-white'
  return (
    <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3 sm:px-4">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-600">{label}</dt>
      <dd className={`mt-1 font-mono text-lg font-bold tabular-nums ${toneClass}`}>{value}</dd>
    </div>
  )
}

async function ReportHeader({ report, timezone, slug }: { report: PublicBattleGroupReport; timezone: string; slug: string }) {
  const t = await getTranslations('publicBattleGroup')
  const opponents = report.forces.filter((force) => force.forceKey !== report.primaryForce.forceKey)
  const opponentKills = opponents.reduce((sum, force) => sum + force.kills, 0)
  const opponentDeaths = opponents.reduce((sum, force) => sum + force.deaths, 0)
  const opponentName = opponents[0]?.forceName ?? t('unknownOpponent')
  const extraOpponents = Math.max(0, opponents.length - 1)
  const title = extraOpponents > 0
    ? t('reportTitleMore', { home: report.primaryForceName, opponent: opponentName, count: extraOpponents })
    : t('reportTitle', { home: report.primaryForceName, opponent: opponentName })

  return (
    <header className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#11141c] p-5 shadow-2xl sm:p-7">
      <div className="pointer-events-none absolute -right-24 -top-32 size-80 rounded-full bg-amber-400/10 blur-3xl" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[.16em] text-amber-300">
            <Eye size={13} /> {t('eyebrow')}
          </p>
          <h1 className="mt-3 max-w-4xl text-2xl font-black leading-tight tracking-tight text-white text-balance sm:text-4xl">
            {title}
          </h1>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-400 sm:text-sm">
            <span className="inline-flex items-center gap-1.5"><Clock size={13} />{formatDateTime(report.startedAt, timezone)} — {formatDateTime(report.endedAt, timezone)}</span>
            <span className="inline-flex items-center gap-1.5"><MapPin size={13} />{summarizeNames(report.clusterNames, t('unknownCluster'))}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <span className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 text-xs font-bold text-emerald-200"><Shield size={13} />{t('publicBadge')}</span>
          <Link href={`/g/${encodeURIComponent(slug)}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 text-xs font-bold text-gray-200 transition-colors hover:bg-white/10 active:scale-95">{t('guildProfile')}<ArrowUpRight size={13} /></Link>
        </div>
      </div>

      <dl className="relative mt-6 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <HeaderMetric label={t('battleCount')} value={formatInteger(report.battleCount)} />
        <HeaderMetric label={t('homeKd')} value={`${formatInteger(report.primaryForce.kills)} / ${formatInteger(report.primaryForce.deaths)}`} tone="home" />
        <HeaderMetric label={t('opponentKd')} value={`${formatInteger(opponentKills)} / ${formatInteger(opponentDeaths)}`} tone="opponent" />
        <HeaderMetric label={t('uniquePlayers')} value={formatInteger(report.totalPlayersUnique)} />
        <HeaderMetric label={t('fame')} value={formatKillbotCompactFame(report.totalFame)} tone="fame" />
      </dl>

      <div className="relative mt-5 grid gap-3 border-t border-white/8 pt-4 text-xs text-gray-500 sm:grid-cols-3">
        <p><span className="font-semibold text-gray-300">{t('judgedForces')}: </span>{formatInteger(report.forces.length)}</p>
        <p><span className="font-semibold text-gray-300">{t('alliances')}: </span>{formatInteger(report.alliances.length)}</p>
        <p><span className="font-semibold text-gray-300">{t('guilds')}: </span>{formatInteger(report.guilds.length)}</p>
      </div>
    </header>
  )
}

async function ReportAnalysis({
  report,
  timezone,
  analysisPromise,
}: {
  report: PublicBattleGroupReport
  timezone: string
  analysisPromise: Promise<PublicBattleGroupAnalysis>
}) {
  const analysis = await analysisPromise
  return <PublicBattleReportExplorer report={report} analysis={analysis} timezone={timezone} />
}

export default async function PublicBattleGroupPage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<SearchParams>
}) {
  const [{ slug }, resolvedSearchParams, t] = await Promise.all([
    params,
    searchParams,
    getTranslations('publicBattleGroup'),
  ])
  if (areBattlelogFeaturesPaused()) {
    return (
      <main className="min-h-screen bg-[#0b0d12] text-gray-100">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <BattlelogPausedPanel eyebrow={t('pausedEyebrow')} title={t('pausedTitle')} body={t('pausedBody')} detail={t('pausedDetail')} />
        </div>
      </main>
    )
  }

  const result = await loadPublicBattleGroupReport({
    tenantSlug: slug,
    server: resolvedSearchParams.server,
    ids: resolvedSearchParams.ids,
  })
  if (!result.ok && result.error === 'tenant_not_found') notFound()
  if (!result.ok) {
    return (
      <main className="min-h-screen bg-[#0b0d12] text-gray-100">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <section className="rounded-xl border border-red-400/30 bg-red-400/10 p-5">
            <div className="flex items-start gap-3"><AlertTriangle size={18} className="mt-0.5 text-red-300" /><div><h1 className="text-lg font-bold text-white">{t('errorTitle')}</h1><p className="mt-2 text-sm leading-relaxed text-red-100">{t(errorKey(result.error), { max: PUBLIC_BATTLE_GROUP_MAX_IDS })}</p></div></div>
          </section>
        </div>
      </main>
    )
  }

  // Start the comparatively heavy event-page fetch before awaiting the small
  // timezone lookup. Suspense streams the battle-record header immediately.
  const analysisPromise = loadPublicBattleGroupAnalysis(result.report)
  const timezone = await getTenantTimezone(result.tenant.tenantId)

  return (
    <main className="min-h-screen bg-[#090b10] text-gray-100">
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-7 sm:px-6 sm:py-10">
        <ReportHeader report={result.report} timezone={timezone} slug={result.tenant.slug} />
        {result.report.unavailableBattleIds.length > 0 && (
          <div className="rounded-xl border border-amber-400/25 bg-amber-400/8 px-4 py-3 text-sm text-amber-100"><AlertTriangle size={15} className="mr-2 inline-block align-[-2px]" />{t('unavailable')}: {result.report.unavailableBattleIds.join(', ')}</div>
        )}
        <Suspense
          fallback={
            <div className="rounded-xl border border-white/10 bg-[#11141c]/80 px-5 py-10 text-center text-sm text-gray-500">
              {t('loadingAnalysis')}
            </div>
          }
        >
          <ReportAnalysis report={result.report} timezone={timezone} analysisPromise={analysisPromise} />
        </Suspense>
        <footer className="flex items-center justify-center gap-2 py-4 text-xs text-gray-700"><Swords size={13} />{t('footer')}</footer>
      </div>
    </main>
  )
}
