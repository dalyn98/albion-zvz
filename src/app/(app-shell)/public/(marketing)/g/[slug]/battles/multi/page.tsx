import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  AlertTriangle,
  ArrowUpRight,
  Clock,
  Eye,
  MapPin,
  Shield,
  Skull,
  Swords,
  Trophy,
  Users,
} from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { formatDateTime, formatTime } from '@/lib/format-datetime'
import { formatKillbotCompactFame } from '@/lib/killbot-battle'
import { loadPublicBattleGroupReport } from '@/lib/public-battle-report'
import { PUBLIC_BATTLE_GROUP_MAX_IDS } from '@/lib/public-battle-report-model'
import { buildTenantHostUrl } from '@/lib/tenant-resolver'
import BattlelogPausedPanel from '@/components/BattlelogPausedPanel'
import type {
  PublicBattleGroupBattle,
  PublicBattleGroupEventLine,
  PublicBattleGroupForceLine,
  PublicBattleGroupLoadError,
  PublicBattleGroupPlayerLine,
  PublicBattleGroupReport,
} from '@/lib/public-battle-report'
import { getTenantTimezone } from '@/lib/timezone-server'
import { areBattlelogFeaturesPaused } from '@/lib/battlelog-pause'

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

function battleSummaryOgImageUrl(args: {
  slug: string
  searchParams: SearchParams
}): string | null {
  const server = firstSearchParam(args.searchParams.server)
  const ids = firstSearchParam(args.searchParams.ids)
  if (!server || !ids) return null
  const query = new URLSearchParams({
    slug: args.slug,
    server,
    ids,
  })
  return buildTenantHostUrl(args.slug, `/api/public/battle-summary-og?${query.toString()}`)
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<SearchParams>
}): Promise<Metadata> {
  const [{ slug }, sp, t] = await Promise.all([
    params,
    searchParams,
    getTranslations('publicBattleGroup'),
  ])
  const ogImageUrl = battleSummaryOgImageUrl({ slug, searchParams: sp })
  const metaTitle = t('metaTitle')
  const metaDescription = t('metaDescription')
  return {
    title: metaTitle,
    description: metaDescription,
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: {
        index: false,
        follow: false,
        noimageindex: true,
      },
    },
    ...(ogImageUrl
      ? {
          openGraph: {
            type: 'article',
            title: metaTitle,
            description: metaDescription,
            images: [
              {
                url: ogImageUrl,
                width: 1200,
                height: 630,
                alt: metaTitle,
              },
            ],
          },
          twitter: {
            card: 'summary_large_image',
            title: metaTitle,
            description: metaDescription,
            images: [ogImageUrl],
          },
        }
      : {}),
  }
}

function formatInteger(value: number): string {
  return Math.max(0, Math.floor(value)).toLocaleString('en-US')
}

function formatSignedKd(kills: number, deaths: number): string {
  return `${formatInteger(kills)}K / ${formatInteger(deaths)}D`
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

function killboardEventUrl(eventId: string): string {
  return `https://albiononline.com/killboard/kill/${encodeURIComponent(eventId)}`
}

function outcomeClass(kills: number, deaths: number): string {
  if (kills > deaths) return 'text-emerald-300'
  if (deaths > kills) return 'text-red-300'
  return 'text-amber-300'
}

function rowHighlightClass(highlighted: boolean): string {
  return highlighted ? 'bg-amber-400/10' : ''
}

function SummaryMetric({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'green' | 'red' | 'amber'
}) {
  const toneClass =
    tone === 'green'
      ? 'text-emerald-300'
      : tone === 'red'
        ? 'text-red-300'
        : tone === 'amber'
          ? 'text-amber-300'
          : 'text-white'
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-3">
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-bold ${toneClass}`}>{value}</p>
    </div>
  )
}

function PlayerTable({
  title,
  icon,
  rows,
  emptyLabel,
}: {
  title: string
  icon: React.ReactNode
  rows: PublicBattleGroupPlayerLine[]
  emptyLabel: string
}) {
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900/70">
      <div className="flex items-center gap-2 border-b border-gray-800 px-4 py-3">
        {icon}
        <h2 className="text-sm font-bold text-white">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-5 text-sm text-gray-500">{emptyLabel}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-800">
              {rows.map((row, index) => (
                <tr key={row.playerName}>
                  <td className="w-10 px-4 py-2 text-xs text-gray-500">#{index + 1}</td>
                  <td className="px-4 py-2">
                    <div className="font-semibold text-gray-100">{row.playerName}</div>
                    <div className="text-xs text-gray-500">
                      {row.forceName} · {row.guildName}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right text-gray-300">
                    {formatSignedKd(row.kills, row.deaths)}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-400">
                    {formatKillbotCompactFame(row.killFame)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function ForceRows({
  forces,
  labels,
}: {
  forces: PublicBattleGroupForceLine[]
  labels: {
    title: string
    name: string
    players: string
    kd: string
    fame: string
    guilds: string
    highlighted: string
  }
}) {
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900/70">
      <div className="flex items-center gap-2 border-b border-gray-800 px-4 py-3">
        <Users size={15} className="text-amber-300" />
        <h2 className="text-sm font-bold text-white">{labels.title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-950/60 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left">{labels.name}</th>
              <th className="px-4 py-2 text-right">{labels.players}</th>
              <th className="px-4 py-2 text-right">{labels.kd}</th>
              <th className="px-4 py-2 text-right">{labels.fame}</th>
              <th className="px-4 py-2 text-left">{labels.guilds}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {forces.map((force) => (
              <tr key={force.forceKey} className={rowHighlightClass(force.highlighted)}>
                <td className="px-4 py-2 font-semibold text-gray-100">
                  {force.forceName}
                  {force.highlighted && (
                    <span className="ml-2 rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200">
                      {labels.highlighted}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-right text-gray-300">
                  {formatInteger(force.players)}
                </td>
                <td className={`px-4 py-2 text-right font-semibold ${outcomeClass(force.kills, force.deaths)}`}>
                  {formatSignedKd(force.kills, force.deaths)}
                </td>
                <td className="px-4 py-2 text-right text-amber-200">
                  {formatKillbotCompactFame(force.killFame)}
                </td>
                <td className="px-4 py-2 text-gray-400">
                  {summarizeNames(force.guildNames, '-')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function BattleRows({
  battles,
  timezone,
  labels,
}: {
  battles: PublicBattleGroupBattle[]
  timezone: string
  labels: {
    title: string
    battle: string
    time: string
    cluster: string
    players: string
    kd: string
    fame: string
    topForce: string
    unknownCluster: string
  }
}) {
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900/70">
      <div className="flex items-center gap-2 border-b border-gray-800 px-4 py-3">
        <Swords size={15} className="text-amber-300" />
        <h2 className="text-sm font-bold text-white">{labels.title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-950/60 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left">{labels.battle}</th>
              <th className="px-4 py-2 text-left">{labels.time}</th>
              <th className="px-4 py-2 text-left">{labels.cluster}</th>
              <th className="px-4 py-2 text-right">{labels.players}</th>
              <th className="px-4 py-2 text-right">{labels.kd}</th>
              <th className="px-4 py-2 text-right">{labels.fame}</th>
              <th className="px-4 py-2 text-left">{labels.topForce}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {battles.map((battle) => (
              <tr key={battle.albionBattleId}>
                <td className="px-4 py-2 font-mono text-xs text-amber-200">
                  {battle.albionBattleId}
                </td>
                <td className="px-4 py-2 whitespace-nowrap text-gray-300">
                  {formatDateTime(battle.startedAt, timezone)}
                </td>
                <td className="px-4 py-2 text-gray-300">
                  {battle.clusterName ?? labels.unknownCluster}
                </td>
                <td className="px-4 py-2 text-right text-gray-300">
                  {formatInteger(battle.totalPlayers)}
                </td>
                <td className="px-4 py-2 text-right font-semibold text-gray-300">
                  {formatInteger(battle.totalKills)}
                </td>
                <td className="px-4 py-2 text-right text-gray-300">
                  {formatKillbotCompactFame(battle.totalFame)}
                </td>
                <td className="px-4 py-2 text-gray-300">
                  {battle.topForceName ?? '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function EventLog({
  events,
  timezone,
  labels,
}: {
  events: PublicBattleGroupEventLine[]
  timezone: string
  labels: {
    title: string
    empty: string
    kill: string
    death: string
    battle: string
    fame: string
  }
}) {
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900/70">
      <div className="flex items-center gap-2 border-b border-gray-800 px-4 py-3">
        <Clock size={15} className="text-sky-300" />
        <h2 className="text-sm font-bold text-white">{labels.title}</h2>
      </div>
      {events.length === 0 ? (
        <p className="px-4 py-5 text-sm text-gray-500">{labels.empty}</p>
      ) : (
        <div className="divide-y divide-gray-800">
          {events.map((event) => (
            <a
              key={`${event.eventId}-${event.role}`}
              href={killboardEventUrl(event.eventId)}
              target="_blank"
              rel="noopener noreferrer"
              className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2 text-sm hover:bg-gray-800/60"
            >
              <span
                className={`rounded border px-2 py-0.5 text-[11px] font-bold ${
                  event.role === 'killer'
                    ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                    : 'border-red-400/30 bg-red-400/10 text-red-300'
                }`}
              >
                {event.role === 'killer' ? labels.kill : labels.death}
              </span>
              <span className="min-w-0">
                <span className="font-semibold text-gray-100">{event.playerName}</span>
                <span className="ml-2 text-xs text-gray-500">
                  {labels.battle} {event.battleId}
                  {event.occurredAt ? ` · ${formatTime(event.occurredAt, timezone)}` : ''}
                </span>
              </span>
              <span className="flex items-center gap-1 text-xs text-gray-400">
                {formatKillbotCompactFame(event.fame)} {labels.fame}
                <ArrowUpRight size={12} />
              </span>
            </a>
          ))}
        </div>
      )}
    </section>
  )
}

function ReportView({
  report,
  timezone,
  slug,
  labels,
}: {
  report: PublicBattleGroupReport
  timezone: string
  slug: string
  labels: {
    eyebrow: string
    titleSuffix: string
    publicBadge: string
    battleCount: string
    totalKd: string
    maxHomePlayers: string
    opponentPlayers: string
    fame: string
    period: string
    opponents: string
    unavailable: string
    unknownCluster: string
    forceRowsTitle: string
    forceNameColumn: string
    guildsColumn: string
    highlightedForce: string
    topKillsTitle: string
    topDeathsTitle: string
    topKillsEmpty: string
    topDeathsEmpty: string
    battleRowsTitle: string
    battleColumn: string
    timeColumn: string
    clusterColumn: string
    playersColumn: string
    kdColumn: string
    fameColumn: string
    topForceColumn: string
    eventLogTitle: string
    eventLogEmpty: string
    eventKill: string
    eventDeath: string
    eventBattle: string
    eventFame: string
    guildProfile: string
  }
}) {
  return (
    <main className="min-h-screen bg-[#0b0d12] text-gray-100">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 space-y-5">
        <header className="rounded-lg border border-gray-800 bg-gray-900/80 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-300">
                <Eye size={12} />
                {labels.eyebrow}
              </p>
              <h1 className="text-2xl font-bold text-white sm:text-3xl">
                {report.primaryForceName} {labels.titleSuffix}
              </h1>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-400">
                <span className="inline-flex items-center gap-1">
                  <Clock size={13} />
                  {formatDateTime(report.startedAt, timezone)} - {formatDateTime(report.endedAt, timezone)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin size={13} />
                  {summarizeNames(report.clusterNames, labels.unknownCluster)}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-xs font-semibold text-emerald-200">
                <Shield size={12} />
                {labels.publicBadge}
              </span>
              <Link
                href={`/g/${encodeURIComponent(slug)}`}
                className="inline-flex items-center gap-1 rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs font-semibold text-gray-200 hover:bg-gray-800"
              >
                {labels.guildProfile}
                <ArrowUpRight size={12} />
              </Link>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
            <SummaryMetric label={labels.battleCount} value={formatInteger(report.battleCount)} />
            <SummaryMetric
              label={labels.totalKd}
              value={formatSignedKd(report.totalKills, report.totalDeaths)}
              tone={report.totalKills > report.totalDeaths ? 'green' : report.totalDeaths > report.totalKills ? 'red' : 'amber'}
            />
            <SummaryMetric label={labels.maxHomePlayers} value={formatInteger(report.totalPlayersUnique)} />
            <SummaryMetric label={labels.opponentPlayers} value={formatInteger(report.forces.length)} />
            <SummaryMetric label={labels.fame} value={formatKillbotCompactFame(report.totalFame)} tone="amber" />
          </div>

          <div className="mt-4 grid gap-2 text-sm text-gray-400 sm:grid-cols-2">
            <p>
              <span className="text-gray-500">{labels.opponents}: </span>
              {summarizeNames(report.forces.slice(0, 4).map((force) => force.forceName), '-')}
            </p>
            <p>
              <span className="text-gray-500">{labels.period}: </span>
              {report.requestedBattleIds.join(', ')}
            </p>
          </div>
        </header>

        {report.unavailableBattleIds.length > 0 && (
          <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            <AlertTriangle size={14} className="mr-2 inline-block align-[-2px]" />
            {labels.unavailable}: {report.unavailableBattleIds.join(', ')}
          </div>
        )}

        <ForceRows
          forces={report.forces}
          labels={{
            title: labels.forceRowsTitle,
            name: labels.forceNameColumn,
            players: labels.playersColumn,
            kd: labels.kdColumn,
            fame: labels.fameColumn,
            guilds: labels.guildsColumn,
            highlighted: labels.highlightedForce,
          }}
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <PlayerTable
            title={labels.topKillsTitle}
            icon={<Trophy size={15} className="text-emerald-300" />}
            rows={report.topKills}
            emptyLabel={labels.topKillsEmpty}
          />
          <PlayerTable
            title={labels.topDeathsTitle}
            icon={<Skull size={15} className="text-red-300" />}
            rows={report.topDeaths}
            emptyLabel={labels.topDeathsEmpty}
          />
        </div>

        <BattleRows
          battles={report.battles}
          timezone={timezone}
          labels={{
            title: labels.battleRowsTitle,
            battle: labels.battleColumn,
            time: labels.timeColumn,
            cluster: labels.clusterColumn,
            players: labels.playersColumn,
            kd: labels.kdColumn,
            fame: labels.fameColumn,
            topForce: labels.topForceColumn,
            unknownCluster: labels.unknownCluster,
          }}
        />

        <EventLog
          events={report.recentEvents}
          timezone={timezone}
          labels={{
            title: labels.eventLogTitle,
            empty: labels.eventLogEmpty,
            kill: labels.eventKill,
            death: labels.eventDeath,
            battle: labels.eventBattle,
            fame: labels.eventFame,
          }}
        />
      </div>
    </main>
  )
}

export default async function PublicBattleGroupPage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<SearchParams>
}) {
  const [{ slug }, sp, t] = await Promise.all([
    params,
    searchParams,
    getTranslations('publicBattleGroup'),
  ])
  if (areBattlelogFeaturesPaused()) {
    return (
      <main className="min-h-screen bg-[#0b0d12] text-gray-100">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <BattlelogPausedPanel
            eyebrow={t('pausedEyebrow')}
            title={t('pausedTitle')}
            body={t('pausedBody')}
            detail={t('pausedDetail')}
          />
        </div>
      </main>
    )
  }

  const result = await loadPublicBattleGroupReport({
    tenantSlug: slug,
    server: sp.server,
    ids: sp.ids,
  })

  if (!result.ok && result.error === 'tenant_not_found') notFound()

  if (!result.ok) {
    return (
      <main className="min-h-screen bg-[#0b0d12] text-gray-100">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <section className="rounded-lg border border-red-400/30 bg-red-400/10 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="mt-0.5 text-red-300" />
              <div className="space-y-2">
                <h1 className="text-lg font-bold text-white">{t('errorTitle')}</h1>
                <p className="text-sm leading-relaxed text-red-100">
                  {t(errorKey(result.error), { max: PUBLIC_BATTLE_GROUP_MAX_IDS })}
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
    )
  }

  const timezone = await getTenantTimezone(result.tenant.tenantId)

  return (
    <ReportView
      report={result.report}
      timezone={timezone}
      slug={result.tenant.slug}
      labels={{
        eyebrow: t('eyebrow'),
        titleSuffix: t('titleSuffix'),
        publicBadge: t('publicBadge'),
        battleCount: t('battleCount'),
        totalKd: t('totalKd'),
        maxHomePlayers: t('maxHomePlayers'),
        opponentPlayers: t('opponentPlayers'),
        fame: t('fame'),
        period: t('battleIds'),
        opponents: t('opponents'),
        unavailable: t('unavailable'),
        unknownCluster: t('unknownCluster'),
        forceRowsTitle: t('forceRowsTitle'),
        forceNameColumn: t('forceNameColumn'),
        guildsColumn: t('guildsColumn'),
        highlightedForce: t('highlightedForce'),
        topKillsTitle: t('topKillsTitle'),
        topDeathsTitle: t('topDeathsTitle'),
        topKillsEmpty: t('topKillsEmpty'),
        topDeathsEmpty: t('topDeathsEmpty'),
        battleRowsTitle: t('battleRowsTitle'),
        battleColumn: t('battleColumn'),
        timeColumn: t('timeColumn'),
        clusterColumn: t('clusterColumn'),
        playersColumn: t('playersColumn'),
        kdColumn: t('kdColumn'),
        fameColumn: t('fameColumn'),
        topForceColumn: t('topForceColumn'),
        eventLogTitle: t('eventLogTitle'),
        eventLogEmpty: t('eventLogEmpty'),
        eventKill: t('eventKill'),
        eventDeath: t('eventDeath'),
        eventBattle: t('eventBattle'),
        eventFame: t('eventFame'),
        guildProfile: t('guildProfile'),
      }}
    />
  )
}
