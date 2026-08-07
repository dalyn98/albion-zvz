import { ArrowUpRight, ChevronDown, Layers3 } from 'lucide-react'
import Link from 'next/link'
import PublicZvzShareButton from '@/components/PublicZvzShareButton'
import type { PublicBattleForce } from '@/lib/public-zvz-battles'
import type { PublicZvzBattleSession } from '@/lib/public-zvz-battle-sessions'
import {
  buildPublicZvzAllianceRecordHref,
  buildPublicZvzBattleReportHref,
  buildPublicZvzBattleSessionHref,
  buildPublicZvzGuildRecordHref,
} from '@/lib/public-zvz-record-links'
import {
  formatPublicZvzCompact,
  formatPublicZvzDateTime,
  formatPublicZvzNumber,
  PublicZvzKdScore,
} from '@/app/(public-shell)/public/(marketing)/zvz-battles/record-ui'

interface BattleSessionCardLabels {
  official: string
  publicBattle: string
  session: string
  logsAndDuration: string
  peakPlayers: string
  totalKills: string
  totalFame: string
  people: string
  kd: string
  versus: string
  additionalForces: string
  topGuilds: string
  otherGuilds: string
  rawLogs: string
  battleId: string
  viewSession: string
  share: string
  copied: string
}

function forceRecordHref(
  force: PublicBattleForce,
  basePath: string,
  server: PublicZvzBattleSession['server'],
  weekStart: string,
): string | null {
  if (force.allianceId) {
    return buildPublicZvzAllianceRecordHref({
      basePath,
      server,
      allianceAlbionId: force.allianceId,
      weekStart,
    })
  }
  const guildId = force.guildIds[0]
  return guildId
    ? buildPublicZvzGuildRecordHref({
        basePath,
        server,
        guildAlbionId: guildId,
        weekStart,
      })
    : null
}

function MatchupSide({
  force,
  right = false,
  labels,
}: {
  force: PublicBattleForce | null
  right?: boolean
  labels: BattleSessionCardLabels
}) {
  if (!force) return <span className="text-gray-600">—</span>
  return (
    <div className={right ? 'text-right' : 'text-left'}>
      <p className={`truncate text-xl font-black sm:text-2xl ${right ? 'text-rose-100' : 'text-sky-100'}`}>
        {force.forceName}
      </p>
      <div className={`mt-2 flex flex-wrap items-center gap-2 ${right ? 'justify-end' : ''}`}>
        <span className="tabular-nums text-sm font-semibold text-gray-400">
          {labels.people.replace('{count}', formatPublicZvzNumber(force.teamSize))}
        </span>
        <PublicZvzKdScore kills={force.kills} deaths={force.deaths} label={labels.kd} size="sm" />
      </div>
    </div>
  )
}

function GuildForceChip({
  force,
  basePath,
  server,
  weekStart,
  labels,
}: {
  force: PublicBattleForce
  basePath: string
  server: PublicZvzBattleSession['server']
  weekStart: string
  labels: BattleSessionCardLabels
}) {
  const href = forceRecordHref(force, basePath, server, weekStart)
  const content = (
    <>
      <span className="max-w-40 truncate">{force.forceName}</span>
      <span className="tabular-nums text-gray-500">{force.teamSize}</span>
      <PublicZvzKdScore kills={force.kills} deaths={force.deaths} label={labels.kd} size="xs" surface={false} />
    </>
  )
  return href ? (
    <Link href={href} className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-white/[0.04] px-2.5 text-xs text-gray-200 hover:bg-white/[0.08] hover:text-white">
      {content}
    </Link>
  ) : (
    <span className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-white/[0.04] px-2.5 text-xs text-gray-300">
      {content}
    </span>
  )
}

export default function PublicZvzBattleSessionCard({
  session,
  basePath,
  weekStart,
  locale,
  labels,
}: {
  session: PublicZvzBattleSession
  basePath: string
  weekStart: string
  locale: string
  labels: BattleSessionCardLabels
}) {
  const primary = session.topForces[0] ?? null
  const secondary = session.topForces[1] ?? null
  const additionalForces = Math.max(0, session.topForces.length - 2)
  const sessionHref = buildPublicZvzBattleSessionHref({
    basePath,
    server: session.server,
    battleIds: session.battleIds,
  })
  const featuredGuildMinimum = session.isOfficialZvz ? 20 : 10
  const majorGuilds = session.topGuilds.filter((force) => force.teamSize >= featuredGuildMinimum)
  const otherGuilds = session.topGuilds.filter((force) => force.teamSize < featuredGuildMinimum)

  return (
    <article id={`session-${session.battleIds.join('-')}`} className="border-b border-white/[0.1] py-6 first:border-t">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex min-h-7 items-center gap-1.5 px-2 text-xs font-bold ${session.isOfficialZvz ? 'bg-amber-400/15 text-amber-200' : 'bg-white/[0.06] text-gray-300'}`}>
            <Layers3 size={13} aria-hidden="true" />
            {session.battleCount > 1 ? labels.session : session.isOfficialZvz ? labels.official : labels.publicBattle}
          </span>
          <time dateTime={session.startedAt} className="text-xs tabular-nums text-gray-500">
            {formatPublicZvzDateTime(session.startedAt, locale)}
          </time>
          {session.battleCount > 1 ? (
            <span className="text-xs tabular-nums text-sky-200">
              {labels.logsAndDuration
                .replace('{count}', String(session.battleCount))
                .replace('{minutes}', String(session.durationMinutes))}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <PublicZvzShareButton
            label={labels.share}
            copiedLabel={labels.copied}
            url={sessionHref}
            title={primary && secondary ? `${primary.forceName} vs ${secondary.forceName}` : undefined}
            compact
          />
          <Link
            href={sessionHref}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-white/[0.06] px-3 text-xs font-bold text-white transition-[background-color,scale] duration-150 ease-out hover:bg-white/[0.1] active:scale-[0.96]"
          >
            {labels.viewSession}
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </header>

      <Link
        href={sessionHref}
        className="group mt-4 block bg-[linear-gradient(90deg,rgba(56,189,248,0.06),transparent_46%,rgba(251,113,133,0.06))] px-3 py-5 transition-[background-color,scale] duration-150 ease-out hover:bg-white/[0.035] active:scale-[0.99] sm:px-5"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
          <MatchupSide force={primary} labels={labels} />
          <span className="text-xs font-black tracking-[0.14em] text-gray-500 group-hover:text-amber-200">
            {labels.versus}
          </span>
          <MatchupSide force={secondary} right labels={labels} />
        </div>
        {additionalForces > 0 ? (
          <p className="mt-3 text-center text-xs font-bold text-rose-200">
            {labels.additionalForces.replace('{count}', String(additionalForces))}
          </p>
        ) : null}
      </Link>

      <dl className="mt-4 grid grid-cols-3 divide-x divide-white/[0.08] border-y border-white/[0.07] py-3 text-center">
        {[
          [labels.peakPlayers, formatPublicZvzNumber(session.peakPlayers)],
          [labels.totalKills, formatPublicZvzNumber(session.totalKills)],
          [labels.totalFame, formatPublicZvzCompact(session.totalFame)],
        ].map(([label, value]) => (
          <div key={label} className="px-2">
            <dt className="text-[10px] font-semibold text-gray-600">{label}</dt>
            <dd className="mt-1 tabular-nums text-sm font-black text-white">{value}</dd>
          </div>
        ))}
      </dl>

      {majorGuilds.length + otherGuilds.length > 0 ? (
        <details className="group mt-4 bg-white/[0.02] shadow-[0_0_0_1px_rgba(255,255,255,0.07)]">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-xs font-bold text-gray-300 transition-[background-color,scale] duration-150 ease-out hover:bg-white/[0.04] active:scale-[0.99] [&::-webkit-details-marker]:hidden">
            <span>{labels.topGuilds}</span>
            <span className="inline-flex items-center gap-1.5 tabular-nums text-gray-500">
              {majorGuilds.length + otherGuilds.length}
              <ChevronDown size={14} className="transition-transform duration-150 group-open:rotate-180" aria-hidden="true" />
            </span>
          </summary>
          <div className="border-t border-white/[0.06] p-3">
            {majorGuilds.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {majorGuilds.map((force) => (
                  <GuildForceChip key={force.forceKey} force={force} basePath={basePath} server={session.server} weekStart={weekStart} labels={labels} />
                ))}
              </div>
            ) : null}
            {otherGuilds.length > 0 ? (
              <div className={majorGuilds.length > 0 ? 'mt-3 border-t border-white/[0.06] pt-3' : ''}>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-600">{labels.otherGuilds}</p>
                <div className="flex flex-wrap gap-1.5">
                  {otherGuilds.map((force) => (
                    <GuildForceChip key={force.forceKey} force={force} basePath={basePath} server={session.server} weekStart={weekStart} labels={labels} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}

      {session.battleCount > 1 ? (
        <details className="group mt-2">
          <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1.5 px-2 text-xs font-semibold text-gray-500 transition-[color,scale] duration-150 ease-out hover:text-white active:scale-[0.96] [&::-webkit-details-marker]:hidden">
            <ChevronDown size={14} className="transition-transform duration-150 group-open:rotate-180" aria-hidden="true" />
            {labels.rawLogs.replace('{count}', String(session.battleCount))}
          </summary>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {session.battles.map((battle) => (
              <Link
                key={battle.id}
                href={buildPublicZvzBattleReportHref({ basePath, server: battle.server, battleId: battle.albionBattleId })}
                className="inline-flex min-h-10 items-center gap-1 rounded-md bg-white/[0.035] px-2.5 text-xs tabular-nums text-gray-400 hover:bg-white/[0.07] hover:text-amber-100"
              >
                {labels.battleId.replace('{id}', String(battle.albionBattleId))}
                <ArrowUpRight size={12} aria-hidden="true" />
              </Link>
            ))}
          </div>
        </details>
      ) : null}
    </article>
  )
}
