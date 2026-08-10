import Link from 'next/link'
import { ArrowUpRight, Crosshair, Swords, Users } from 'lucide-react'
import {
  buildPublicZvzBattleReportHref,
  buildPublicZvzBattleSessionHref,
} from '@/lib/public-zvz-record-links'
import type { PublicZvzTopFrontItem } from '@/lib/public-zvz-top-front'

interface PublicZvzTopFrontLabels {
  eyebrow: string
  title: string
  window: string
  large: string
  zerg: string
  rankedClash: string
  battleSize: string
  kd: string
  versus: string
  additionalOpponents: string
  logs: string
  open: string
}

function formatBattleTime(value: string, locale: string): string {
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

function battleHref(input: {
  item: PublicZvzTopFrontItem
  basePath: string
  seasonId: string | null
  asOfDate: string | null
}): string {
  if (input.item.battleIds.length > 1) {
    return buildPublicZvzBattleSessionHref({
      basePath: input.basePath,
      server: input.item.server,
      battleIds: input.item.battleIds,
    })
  }
  return buildPublicZvzBattleReportHref({
    basePath: input.basePath,
    server: input.item.server,
    battleId: input.item.battleIds[0],
    engagementId: input.item.engagementId,
    focusKind: input.item.entityKind,
    focusAlbionId: input.item.entityAlbionId,
    seasonId: input.seasonId,
    asOfDate: input.asOfDate,
  })
}

export default function PublicZvzTopFront({
  items,
  basePath,
  seasonId,
  asOfDate,
  locale,
  labels,
}: {
  items: PublicZvzTopFrontItem[]
  basePath: string
  seasonId: string | null
  asOfDate: string | null
  locale: string
  labels: PublicZvzTopFrontLabels
}) {
  if (items.length === 0) return null

  return (
    <section aria-labelledby="public-zvz-top-front-title" className="mb-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">
            <Crosshair size={12} aria-hidden="true" />
            {labels.eyebrow}
          </p>
          <h3 id="public-zvz-top-front-title" className="mt-1 text-lg font-black text-white">
            {labels.title}
          </h3>
        </div>
        <p className="text-xs font-semibold text-gray-500">{labels.window}</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {items.map((item) => {
          const isZerg = item.scale === 'zerg'
          const isRankedClash = item.rankedEntities.length > 1
          return (
            <article key={item.id}>
              <Link
                href={battleHref({ item, basePath, seasonId, asOfDate })}
                aria-label={`${item.entityName} ${labels.versus} ${item.mainOpponent.name} · ${labels.open}`}
                className={`group relative block min-h-60 overflow-hidden rounded-xl p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.09)] transition-[background-color,box-shadow,scale] duration-150 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 ${
                  isZerg
                    ? 'bg-[radial-gradient(circle_at_90%_0%,rgba(251,146,60,0.16),transparent_42%),#0d1017] hover:shadow-[0_0_0_1px_rgba(251,191,36,0.38),0_18px_40px_rgba(0,0,0,0.3)]'
                    : 'bg-[radial-gradient(circle_at_90%_0%,rgba(56,189,248,0.11),transparent_42%),#0d1017] hover:shadow-[0_0_0_1px_rgba(125,211,252,0.3),0_18px_40px_rgba(0,0,0,0.3)]'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="inline-flex min-h-7 shrink-0 items-center rounded-md bg-amber-300 px-2 text-xs font-black text-slate-950">
                      #{item.rank}
                    </span>
                    <span
                      className={`inline-flex min-h-7 items-center rounded-md px-2 text-[11px] font-black uppercase tracking-[0.12em] ${
                        isZerg ? 'bg-orange-400/12 text-orange-200' : 'bg-sky-400/10 text-sky-200'
                      }`}
                    >
                      {isZerg ? labels.zerg : labels.large}
                    </span>
                  </div>
                  <time className="shrink-0 text-[11px] font-semibold tabular-nums text-gray-500">
                    {formatBattleTime(item.startedAt, locale)}
                  </time>
                </div>

                {isRankedClash ? (
                  <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-200">
                    <Swords size={13} aria-hidden="true" />
                    {labels.rankedClash}
                    <span className="text-gray-500">
                      {item.rankedEntities.map((entity) => `#${entity.rank}`).join(' · ')}
                    </span>
                  </p>
                ) : (
                  <div className="h-7" aria-hidden="true" />
                )}

                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                  <p
                    className="truncate text-left text-lg font-black text-white"
                    title={item.entityName}
                  >
                    {item.entityName}
                  </p>
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-600">
                    {labels.versus}
                  </span>
                  <div className="min-w-0 text-right">
                    <p
                      className="truncate text-lg font-black text-gray-200"
                      title={item.mainOpponent.name}
                    >
                      {item.mainOpponent.name}
                    </p>
                    {item.additionalOpponentCount > 0 ? (
                      <p className="mt-0.5 text-[11px] font-semibold text-gray-500">
                        {labels.additionalOpponents.replace(
                          '{count}',
                          String(item.additionalOpponentCount),
                        )}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/[0.08] pt-3">
                  <div>
                    <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">
                      <Users size={12} aria-hidden="true" />
                      {labels.battleSize}
                    </p>
                    <p className="mt-1 text-lg font-black tabular-nums text-white">
                      {item.sideTeamSize}
                      <span className="mx-1.5 text-gray-700">:</span>
                      {item.opponentSideTeamSize}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">
                      {labels.kd}
                    </p>
                    <p className="mt-1 text-lg font-black tabular-nums">
                      <span className="text-emerald-300">{item.kills}</span>
                      <span className="mx-1.5 text-gray-700">/</span>
                      <span className="text-rose-300">{item.deaths}</span>
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 text-[11px] font-semibold text-gray-500">
                  <span>
                    {item.battleIds.length > 1
                      ? labels.logs.replace('{count}', String(item.battleIds.length))
                      : labels.open}
                  </span>
                  <ArrowUpRight
                    size={15}
                    aria-hidden="true"
                    className="text-gray-600 transition-transform duration-150 ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white"
                  />
                </div>
              </Link>
            </article>
          )
        })}
      </div>
    </section>
  )
}
