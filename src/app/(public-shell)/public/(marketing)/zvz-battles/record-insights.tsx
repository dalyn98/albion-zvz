import { Activity, ArrowUpRight, Crosshair, Scale, Swords } from 'lucide-react'
import Link from 'next/link'
import {
  PublicZvzFavoriteButton,
  type PublicZvzFavoriteEntity,
} from '@/components/PublicZvzEngagementClient'
import PublicZvzShareButton from '@/components/PublicZvzShareButton'
import type { PublicZvzRecordInsights } from '@/lib/public-zvz-insights'
import {
  buildPublicZvzAllianceRecordHref,
  buildPublicZvzComparisonHref,
  buildPublicZvzGuildRecordHref,
} from '@/lib/public-zvz-record-links'
import type { PublicZvzRankingScope } from '@/lib/public-zvz-ranking-v2'
import {
  formatPublicZvzDateTime,
  formatPublicZvzDecimal,
  formatPublicZvzNumber,
  PublicZvzKdScore,
} from './record-ui'

interface RecordInsightLabels {
  overviewTitle: string
  overviewBody: string
  recentFormTitle: string
  recentFormSummary: string
  formAdvantage: string
  formDisadvantage: string
  formEven: string
  activityTitle: string
  activityDayLabel: string
  scaleTitle: string
  scale: Record<'small' | 'mid' | 'large' | 'zerg', string>
  engagements: string
  averageForce: string
  kd: string
  rivalsTitle: string
  rivalsEmpty: string
  encounters: string
  lastFought: string
  compare: string
  favoriteAdd: string
  favoriteRemove: string
  share: string
  copied: string
}

function resultTone(result: 'advantage' | 'disadvantage' | 'even'): string {
  if (result === 'advantage') return 'bg-emerald-300 text-emerald-950'
  if (result === 'disadvantage') return 'bg-rose-300 text-rose-950'
  return 'bg-gray-400 text-gray-950'
}

export function PublicZvzRecordInsightsPanel({
  insights,
  entity,
  basePath,
  weekStart,
  seasonId,
  asOfDate,
  scope = 'overall',
  locale,
  labels,
}: {
  insights: PublicZvzRecordInsights
  entity: PublicZvzFavoriteEntity
  basePath: string
  weekStart: string
  seasonId?: string | null
  asOfDate?: string | null
  scope?: PublicZvzRankingScope
  locale: string
  labels: RecordInsightLabels
}) {
  const activityMax = Math.max(
    1,
    ...insights.activity.map((point) => point.kills + point.deaths),
  )

  return (
    <section className="mt-8 border-y border-white/[0.1] py-6" aria-labelledby="record-insights-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-amber-200">
            <Activity size={18} aria-hidden="true" />
            <h2 id="record-insights-title" className="text-xl font-black text-white">
              {labels.overviewTitle}
            </h2>
          </div>
          <p className="mt-2 text-pretty text-sm leading-6 text-gray-400">
            {labels.overviewBody}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <PublicZvzFavoriteButton
            entity={entity}
            addLabel={labels.favoriteAdd}
            removeLabel={labels.favoriteRemove}
          />
          <PublicZvzShareButton label={labels.share} copiedLabel={labels.copied} url={entity.href} />
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section className="bg-white/[0.025] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.07)]">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-black text-white">{labels.recentFormTitle}</h3>
            <span className="text-xs tabular-nums text-gray-500">{labels.recentFormSummary}</span>
          </div>
          <div className="mt-4 flex items-center gap-2">
            {insights.recentForm.map((point) => (
              <span
                key={point.key}
                title={`${formatPublicZvzDateTime(point.startedAt, locale)} · ${point.kills}-${point.deaths}`}
                aria-label={`${formatPublicZvzDateTime(point.startedAt, locale)} · ${point.result === 'advantage' ? labels.formAdvantage : point.result === 'disadvantage' ? labels.formDisadvantage : labels.formEven} · ${point.kills}-${point.deaths}`}
                className={`inline-flex size-10 items-center justify-center rounded-full tabular-nums text-xs font-black shadow-[0_0_0_3px_rgba(255,255,255,0.035)] ${resultTone(point.result)}`}
              >
                <span aria-hidden="true">{point.result === 'advantage' ? '▲' : point.result === 'disadvantage' ? '▼' : '—'}</span>
              </span>
            ))}
          </div>
          <dl className="mt-4 grid grid-cols-3 divide-x divide-white/[0.08] text-center">
            <div>
              <dt className="text-[11px] text-gray-500">{labels.formAdvantage}</dt>
              <dd className="mt-1 tabular-nums text-lg font-black text-emerald-200">{insights.formWins}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-gray-500">{labels.formEven}</dt>
              <dd className="mt-1 tabular-nums text-lg font-black text-gray-300">{insights.formEven}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-gray-500">{labels.formDisadvantage}</dt>
              <dd className="mt-1 tabular-nums text-lg font-black text-rose-200">{insights.formLosses}</dd>
            </div>
          </dl>
        </section>

        <section className="bg-white/[0.025] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.07)]">
          <h3 className="text-sm font-black text-white">{labels.activityTitle}</h3>
          <div className="mt-4 flex h-24 items-end gap-2">
            {insights.activity.map((point) => {
              const height = Math.max(10, ((point.kills + point.deaths) / activityMax) * 100)
              return (
                <div key={point.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <div className="flex h-16 w-full items-end">
                    <div
                      title={labels.activityDayLabel
                        .replace('{date}', point.date)
                        .replace('{count}', String(point.engagements))
                        .replace('{kills}', String(point.kills))
                        .replace('{deaths}', String(point.deaths))}
                      className="w-full bg-[linear-gradient(180deg,rgba(252,211,77,0.8),rgba(251,146,60,0.28))] shadow-[0_0_0_1px_rgba(252,211,77,0.18)]"
                      style={{ height: `${height}%` }}
                    />
                  </div>
                  <span className="truncate text-[10px] tabular-nums text-gray-600">
                    {point.date.slice(5)}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <section>
          <div className="flex items-center gap-2">
            <Scale size={16} className="text-sky-200" aria-hidden="true" />
            <h3 className="text-sm font-black text-white">{labels.scaleTitle}</h3>
          </div>
          <div className="mt-3 grid gap-px bg-white/[0.08] sm:grid-cols-2">
            {insights.scaleStats.map((row) => (
              <div key={row.scale} className="bg-[#0a0e14] p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-black text-white">{labels.scale[row.scale]}</p>
                  <PublicZvzKdScore kills={row.kills} deaths={row.deaths} label={labels.kd} size="xs" />
                </div>
                <dl className="mt-3 grid grid-cols-2 text-xs">
                  <div>
                    <dt className="text-gray-600">{labels.engagements}</dt>
                    <dd className="mt-1 tabular-nums font-bold text-gray-200">{formatPublicZvzNumber(row.engagements)}</dd>
                  </div>
                  <div className="text-right">
                    <dt className="text-gray-600">{labels.averageForce}</dt>
                    <dd className="mt-1 tabular-nums font-bold text-gray-200">{formatPublicZvzDecimal(row.averageSize)}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center gap-2">
            <Crosshair size={16} className="text-rose-200" aria-hidden="true" />
            <h3 className="text-sm font-black text-white">{labels.rivalsTitle}</h3>
          </div>
          {insights.rivals.length > 0 ? (
            <div className="mt-3 divide-y divide-white/[0.07] border-y border-white/[0.08]">
              {insights.rivals.slice(0, 5).map((rival) => {
                const recordHref = rival.albionId
                  ? rival.forceKind === 'alliance'
                    ? buildPublicZvzAllianceRecordHref({
                        basePath,
                        server: entity.server,
                        allianceAlbionId: rival.albionId,
                        weekStart,
                        seasonId,
                        asOfDate,
                      })
                    : buildPublicZvzGuildRecordHref({
                        basePath,
                        server: entity.server,
                        guildAlbionId: rival.albionId,
                        weekStart,
                        seasonId,
                        asOfDate,
                      })
                  : null
                const compareHref = rival.albionId && rival.forceKind === entity.entityKind
                  ? buildPublicZvzComparisonHref({
                      basePath,
                      server: entity.server,
                      entityKind: entity.entityKind,
                      leftEntityId: entity.entityId,
                      rightEntityId: rival.albionId,
                      scope,
                      seasonId,
                      asOfDate,
                    })
                  : null
                return (
                  <div key={rival.key} className="flex min-h-16 items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      {recordHref ? (
                        <Link href={recordHref} className="inline-flex min-h-10 items-center gap-1 font-bold text-white underline-offset-4 hover:text-amber-100 hover:underline">
                          <span className="truncate">{rival.name}</span>
                          <ArrowUpRight size={13} aria-hidden="true" />
                        </Link>
                      ) : (
                        <p className="font-bold text-white">{rival.name}</p>
                      )}
                      <p className="text-[11px] text-gray-600">
                        {labels.lastFought.replace('{date}', formatPublicZvzDateTime(rival.lastFoughtAt, locale))}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs tabular-nums text-gray-400">
                        {labels.encounters.replace('{count}', String(rival.encounters))}
                      </p>
                      <PublicZvzKdScore kills={rival.kills} deaths={rival.deaths} label={labels.kd} size="xs" surface={false} />
                    </div>
                    {compareHref ? (
                      <Link
                        href={compareHref}
                        aria-label={`${labels.compare}: ${rival.name}`}
                        title={`${labels.compare}: ${rival.name}`}
                        className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-white/[0.05] text-gray-400 transition-[background-color,color,scale] duration-150 ease-out hover:bg-amber-300/10 hover:text-amber-200 active:scale-[0.96]"
                      >
                        <Swords size={15} aria-hidden="true" />
                      </Link>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="mt-3 text-sm text-gray-600">{labels.rivalsEmpty}</p>
          )}
        </section>
      </div>
    </section>
  )
}
