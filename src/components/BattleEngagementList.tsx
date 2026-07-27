import Link from 'next/link'
import {
  AlertTriangle,
  Clock3,
  FileText,
  Hourglass,
  ShieldAlert,
  Swords,
  UserRoundPlus,
} from 'lucide-react'
import type { BattleEngagementListItem } from '@/lib/battle-engagement-view'
import type { GuildBattleDisplayResult } from '@/lib/guild-battle-view'
import { formatDateTimeShort } from '@/lib/format-datetime'
import { BattleResultBadge } from '@/components/BattleResultBadge'
import { SectionCard } from '@/components/ui-patterns'

export interface BattleEngagementListLabels {
  title: string
  engagementNumber: (sequence: number) => string
  rawBattle: (battleId: number) => string
  result: Record<GuildBattleDisplayResult, string>
  status: {
    collecting: string
    ready: string
    segmentationRequired: string
    blocked: string
    insufficientEvidence: string
  }
  reason: {
    sourceNotStable: string
    eventCountIncomplete: string
    unidentifiedEvent: string
    ambiguousBoundary: string
    complete: string
  }
  factualTotal: string
  resultEvidence: string
  battleCondition: string
  directGuild: string
  allianceSide: string
  opponentForces: string
  matchupMain: string
  matchupIntervention: string
  eventCount: (count: number) => string
  otherEvents: (count: number) => string
  interventionEvents: (count: number) => string
  lastVerified: (when: string) => string
  completeness: (kills: number, rawKills: number, deaths: number, rawDeaths: number) => string
  note: string
  details: string
  emptyOpponent: string
  players: (count: number) => string
  killFame: string
}

interface Props {
  items: BattleEngagementListItem[]
  timezone: string
  labels: BattleEngagementListLabels
}

function formatFame(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return value.toLocaleString('en-US')
}

function resultForBadge(item: BattleEngagementListItem): GuildBattleDisplayResult {
  if (item.status !== 'final' || !item.result) return 'pending'
  return item.result
}

function statusLabel(
  item: BattleEngagementListItem,
  labels: BattleEngagementListLabels,
): string {
  if (item.runState === 'segmentation_required') {
    return labels.status.segmentationRequired
  }
  if (item.runState === 'blocked') return labels.status.blocked
  if (item.status === 'insufficient_evidence') {
    return labels.status.insufficientEvidence
  }
  if (item.runState === 'collecting' || item.status === 'pending') {
    return labels.status.collecting
  }
  return labels.status.ready
}

function reasonLabel(
  item: BattleEngagementListItem,
  labels: BattleEngagementListLabels,
): string {
  if (item.runReason === 'source_not_stable') return labels.reason.sourceNotStable
  if (item.runReason === 'event_count_incomplete') {
    return labels.reason.eventCountIncomplete
  }
  if (item.runReason === 'unidentified_event') {
    return labels.reason.unidentifiedEvent
  }
  if (item.runReason === 'ambiguous_boundary') {
    return labels.reason.ambiguousBoundary
  }
  return labels.reason.complete
}

function statusTone(item: BattleEngagementListItem): string {
  if (item.runState === 'blocked') {
    return 'border-red-500/35 bg-red-500/10 text-red-200'
  }
  if (item.runState === 'segmentation_required') {
    return 'border-violet-500/35 bg-violet-500/10 text-violet-200'
  }
  if (item.status === 'final') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
  }
  return 'border-amber-500/30 bg-amber-500/10 text-amber-200'
}

function StatusIcon({ item }: { item: BattleEngagementListItem }) {
  if (item.runState === 'blocked') return <ShieldAlert size={12} />
  if (item.runState === 'segmentation_required') return <AlertTriangle size={12} />
  if (item.status === 'final') return <Swords size={12} />
  return <Hourglass size={12} />
}

export default function BattleEngagementList({ items, timezone, labels }: Props) {
  if (items.length === 0) return null

  return (
    <section className="space-y-3" aria-label={labels.title}>
      <div className="flex items-center gap-2 px-1">
        <Swords size={15} className="text-amber-300" />
        <h2 className="text-sm font-bold text-white">{labels.title}</h2>
      </div>

      {items.map((item) => {
        const badgeResult = resultForBadge(item)
        const opponentNames = item.matchups.map((matchup) => matchup.forceName)
        const opponentLabel =
          opponentNames.length > 0 ? opponentNames.join(', ') : labels.emptyOpponent
        if (item.isRunOnly) {
          return (
            <SectionCard key={item.id} className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                    <span className="font-mono text-amber-200">
                      {formatDateTimeShort(item.rawStartedAt, timezone)}
                    </span>
                    <span>|</span>
                    <span className="uppercase">{item.albionServer}</span>
                    <span>|</span>
                    <span>{labels.rawBattle(item.albionBattleId)}</span>
                  </div>
                  <p className="truncate text-lg font-bold text-white">
                    {item.homeGuildName} vs {labels.emptyOpponent}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-semibold ${statusTone(item)}`}
                    >
                      <StatusIcon item={item} />
                      {statusLabel(item, labels)}
                    </span>
                    <span className="text-[11px] text-gray-500">
                      {reasonLabel(item, labels)}
                    </span>
                  </div>
                </div>
                <BattleResultBadge
                  result="pending"
                  label={labels.result.pending}
                  className="max-w-full"
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-gray-800 pt-3 text-[11px] text-gray-500">
                <span>
                  {labels.completeness(
                    item.collectedHomeKills,
                    item.rawHomeKills,
                    item.collectedHomeDeaths,
                    item.rawHomeDeaths,
                  )}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock3 size={11} />
                  {labels.lastVerified(
                    formatDateTimeShort(item.evaluatedAt, timezone),
                  )}
                </span>
              </div>
            </SectionCard>
          )
        }
        return (
          <SectionCard key={item.id} className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                  <span className="font-mono text-amber-200">
                    {formatDateTimeShort(item.startedAt, timezone)}
                  </span>
                  <span>-</span>
                  <span className="font-mono">
                    {formatDateTimeShort(item.endedAt, timezone)}
                  </span>
                  <span>|</span>
                  <span className="uppercase">{item.albionServer}</span>
                  <span>|</span>
                  <span>{labels.rawBattle(item.albionBattleId)}</span>
                  <span>|</span>
                  <span>{labels.engagementNumber(item.sequence)}</span>
                </div>
                <Link
                  href={`/battles/${item.id}`}
                  className="block truncate text-lg font-bold text-white hover:text-amber-200"
                >
                  {item.homeGuildName} vs {opponentLabel}
                </Link>
                <div className="flex flex-wrap gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-semibold ${statusTone(item)}`}
                  >
                    <StatusIcon item={item} />
                    {statusLabel(item, labels)}
                  </span>
                  <span className="text-[11px] text-gray-500">
                    {reasonLabel(item, labels)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:min-w-[320px]">
                <div className="rounded border border-gray-800 bg-gray-950/60 p-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    {labels.resultEvidence}
                  </p>
                  <div className="mt-2">
                    <BattleResultBadge
                      result={badgeResult}
                      label={labels.result[badgeResult]}
                      className="max-w-full"
                    />
                  </div>
                </div>
                <MiniStat
                  label={labels.factualTotal}
                  value={`${item.homeKills}/${item.homeDeaths}`}
                  sub={`${formatFame(item.homeKillFame)} / ${formatFame(item.opponentKillFame)}`}
                />
                <MiniStat
                  label={labels.resultEvidence}
                  value={`${item.resultHomeKills}/${item.resultHomeDeaths}`}
                  sub={`${formatFame(item.resultHomeKillFame)} / ${formatFame(item.resultOpponentKillFame)}`}
                />
              </div>
            </div>

            <div className="grid gap-2 text-xs sm:grid-cols-3">
              <InfoLine
                label={labels.battleCondition}
                value={`${item.homeSideTeamSize}v${item.opponentTeamSize}`}
              />
              <InfoLine
                label={labels.directGuild}
                value={labels.players(item.homeTeamSize)}
              />
              <InfoLine
                label={labels.allianceSide}
                value={labels.players(item.homeSideTeamSize)}
              />
            </div>

            <div className="overflow-hidden rounded border border-gray-800">
              <div className="flex items-center justify-between bg-gray-950/70 px-3 py-2">
                <span className="text-xs font-semibold text-gray-300">
                  {labels.opponentForces}
                </span>
                <span className="text-[11px] text-gray-500">
                  {labels.eventCount(item.resultEligibleEventCount)}
                </span>
              </div>
              <div className="divide-y divide-gray-800">
                {item.matchups.map((matchup) => (
                  <div
                    key={matchup.forceKey}
                    className="grid gap-2 px-3 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-100">
                        {matchup.forceName}
                      </p>
                      <p className="mt-0.5 text-[11px] text-gray-500">
                        {labels.players(matchup.opponentTeamSize)}
                      </p>
                    </div>
                    <span
                      className={
                        matchup.role === 'intervention'
                          ? 'inline-flex items-center gap-1 self-center rounded border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-sky-200'
                          : 'inline-flex items-center gap-1 self-center rounded border border-gray-700 bg-gray-900 px-2 py-0.5 text-gray-300'
                      }
                    >
                      {matchup.role === 'intervention' ? (
                        <UserRoundPlus size={11} />
                      ) : (
                        <Swords size={11} />
                      )}
                      {matchup.role === 'intervention'
                        ? labels.matchupIntervention
                        : labels.matchupMain}
                    </span>
                    <span className="self-center font-mono text-gray-300">
                      {matchup.homeKills}/{matchup.homeDeaths}
                    </span>
                    <span className="self-center font-mono text-amber-200">
                      {formatFame(matchup.homeKillFame)} /{' '}
                      {formatFame(matchup.opponentKillFame)}
                    </span>
                  </div>
                ))}
                {item.matchups.length === 0 && (
                  <p className="px-3 py-3 text-xs text-gray-500">
                    {labels.emptyOpponent}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
              <span>
                {labels.completeness(
                  item.collectedHomeKills,
                  item.rawHomeKills,
                  item.collectedHomeDeaths,
                  item.rawHomeDeaths,
                )}
              </span>
              {item.interventionEventCount > 0 && (
                <span>{labels.interventionEvents(item.interventionEventCount)}</span>
              )}
              {item.otherEventCount > 0 && (
                <span>{labels.otherEvents(item.otherEventCount)}</span>
              )}
              <span className="inline-flex items-center gap-1">
                <Clock3 size={11} />
                {labels.lastVerified(formatDateTimeShort(item.evaluatedAt, timezone))}
              </span>
            </div>

            {item.note && (
              <div className="flex items-start gap-2 rounded border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-xs text-sky-100">
                <FileText size={13} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">{labels.note}</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sky-100/75">{item.note}</p>
                </div>
              </div>
            )}

            <div className="flex justify-end border-t border-gray-800 pt-3">
              <Link
                href={`/battles/${item.id}`}
                className="inline-flex min-h-10 items-center gap-1 rounded border border-gray-700 bg-gray-950 px-3 text-xs font-semibold text-gray-200 hover:border-amber-400/50 hover:text-amber-100"
              >
                <Swords size={13} />
                {labels.details}
              </Link>
            </div>
          </SectionCard>
        )
      })}
    </section>
  )
}

function MiniStat({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub: string
}) {
  return (
    <div className="rounded border border-gray-800 bg-gray-950/60 p-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </p>
      <p className="mt-1 font-mono text-sm font-bold text-gray-100">{value}</p>
      <p className="mt-0.5 font-mono text-[10px] text-amber-200/80">{sub}</p>
    </div>
  )
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-0.5 font-mono font-semibold text-gray-200">{value}</p>
    </div>
  )
}
