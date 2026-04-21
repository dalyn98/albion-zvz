import Link from 'next/link'
import { Coins, Wallet, ShieldCheck, ChevronRight, Trophy, ShieldAlert, Hourglass, UserCheck, UserX, Crown } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import MemberAvatar from './MemberAvatar'
import LanguageBadge from './LanguageBadge'
import { formatSilver } from '@/lib/silver'
import { formatDate, formatDateTime } from '@/lib/format-datetime'
import { getRoleStyle, regearPayoutSilver } from '@/types'
import type { GuildMemberDetail, MemberExchangeEntry } from '@/app/actions/members-admin'

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-300',
  approved: 'bg-green-500/20 text-green-300',
  rejected: 'bg-gray-700 text-gray-300',
}

type StatusKey = 'pending' | 'approved' | 'rejected'

interface StatusLabels {
  pending: string
  approved: string
  rejected: string
}

interface Props {
  detail: GuildMemberDetail
  // Admin view shows the raw Discord ID under the username; member self-view hides it.
  showDiscordId?: boolean
}

export default async function MemberDetailView({ detail, showDiscordId = true }: Props) {
  const t = await getTranslations('memberDetail')
  const tStatus = await getTranslations('status')
  const statusLabels: StatusLabels = {
    pending: tStatus('pending'),
    approved: tStatus('approved'),
    rejected: tStatus('rejected'),
  }
  return (
    <>
      <header className="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
        <MemberAvatar discordId={detail.discord_id} avatar={detail.avatar} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-white text-lg sm:text-xl font-bold truncate">{detail.username}</h1>
            <LanguageBadge locale={detail.preferred_language} />
          </div>
          {showDiscordId && (
            <p className="text-gray-500 text-xs mt-0.5 font-mono truncate">{detail.discord_id}</p>
          )}
          <p className="text-gray-500 text-xs">{t('recentLogin', { date: formatDate(detail.updated_at) })}</p>
        </div>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={<ShieldCheck size={14} className="text-amber-400" />}
          label={t('statTotalParticipation')}
          value={t('participationTimes', { count: detail.participation_count })}
        />
        <StatCard
          icon={<Coins size={14} className="text-amber-400" />}
          label={t('statBalance')}
          value={formatSilver(detail.balance)}
          mono
        />
        <StatCard
          icon={<Coins size={14} className="text-green-400" />}
          label={t('statEarned')}
          value={formatSilver(detail.lifetime_earned)}
          mono
        />
        <StatCard
          icon={<Wallet size={14} className="text-red-400" />}
          label={t('statSpent')}
          value={formatSilver(detail.lifetime_spent)}
          mono
        />
      </section>

      <section className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard
          icon={<UserCheck size={14} className="text-emerald-400" />}
          label={t('statAttendanceRate')}
          value={
            detail.attendance_stats.rate === null
              ? t('attendanceNotAvailable')
              : t('attendancePercent', { rate: detail.attendance_stats.rate })
          }
          mono
        />
        <StatCard
          icon={<UserX size={14} className="text-rose-400" />}
          label={t('statAttendedCount')}
          value={t('attendedCount', {
            attended: detail.attendance_stats.attended,
            no_show: detail.attendance_stats.no_show,
          })}
        />
        <StatCard
          icon={<Crown size={14} className="text-amber-300" />}
          label={t('statMvpCount')}
          value={t('mvpTimes', { count: detail.total_mvps })}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-white font-bold text-sm">{t('roleBreakdown')}</h2>
        {detail.role_breakdown.length === 0 ? (
          <p className="text-gray-500 text-xs">{t('noSlotHistory')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {detail.role_breakdown.map((r) => {
              const style = getRoleStyle(r.role)
              return (
                <span
                  key={r.role}
                  className={`text-xs font-semibold px-2 py-1 rounded ${
                    style?.badge ?? 'bg-gray-700 text-gray-300'
                  }`}
                >
                  {r.role} · {r.count}
                </span>
              )
            })}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-white font-bold text-sm">{t('participatedEvents', { count: detail.events.length })}</h2>
          {(() => {
            // Sum per-battle wins/losses across every participated event, so
            // an event with 2 battles both won contributes 2 wins — not 1.
            let wins = 0
            let losses = 0
            for (const e of detail.events) {
              wins += e.battle_wins
              losses += e.battle_losses
            }
            if (wins === 0 && losses === 0) return null
            return (
              <p className="text-xs text-gray-400">
                <span className="text-emerald-300 font-semibold">{t('winsCount', { count: wins })}</span>
                <span className="mx-1.5 text-gray-600">·</span>
                <span className="text-rose-300 font-semibold">{t('lossesCount', { count: losses })}</span>
              </p>
            )
          })()}
        </div>
        {detail.events.length === 0 ? (
          <p className="text-gray-500 text-xs">{t('noEvents')}</p>
        ) : (
          <ul className="space-y-2">
            {detail.events.map((e) => {
              const style = getRoleStyle(e.role)
              const whenIso = e.battle_started_at ?? e.gather_at ?? e.created_at
              return (
                <li key={e.event_id}>
                  <Link
                    href={`/events/${e.event_id}`}
                    className="flex items-center gap-3 bg-gray-900 border border-gray-800 hover:border-gray-700 hover:bg-gray-800/60 rounded-lg px-3 py-2 transition-colors group"
                  >
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${
                        style?.badge ?? 'bg-gray-700 text-gray-300'
                      }`}
                    >
                      {e.role}
                    </span>
                    <span className="text-white text-sm truncate flex-1">{e.event_title}</span>
                    {e.battle_wins + e.battle_losses > 1 && (
                      <span className="text-[10px] font-mono text-gray-400 flex-shrink-0">
                        <span className="text-emerald-300">{e.battle_wins}</span>
                        <span className="text-gray-600">/</span>
                        <span className="text-rose-300">{e.battle_losses}</span>
                      </span>
                    )}
                    {e.mvp_count > 0 && (
                      <span
                        className="inline-flex items-center gap-1 bg-amber-500/20 border border-amber-500/40 text-amber-200 text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                        title={t('mvpBadgeTitle', { count: e.mvp_count })}
                      >
                        <Crown size={10} />
                        {e.mvp_count > 1 ? `×${e.mvp_count}` : 'MVP'}
                      </span>
                    )}
                    <AttendanceBadge
                      attendance={e.attendance}
                      labels={{
                        attended: t('attendanceBadgeAttended'),
                        noShow: t('attendanceBadgeNoShow'),
                      }}
                    />
                    <OutcomeBadge
                      outcome={e.outcome}
                      labels={{
                        win: t('outcomeWin'),
                        loss: t('outcomeLoss'),
                        pending: t('outcomePending'),
                      }}
                    />
                    <span className="text-gray-500 text-xs font-mono flex-shrink-0">
                      {formatDate(whenIso)}
                    </span>
                    <ChevronRight size={14} className="text-gray-600 group-hover:text-gray-300 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-white font-bold text-sm">{t('regearHistory', { count: detail.regears.length })}</h2>
        {detail.regears.length === 0 ? (
          <p className="text-gray-500 text-xs">{t('noRegears')}</p>
        ) : (
          <ul className="space-y-2">
            {detail.regears.map((r) => {
              const statusKey = r.status as StatusKey
              return (
                <li
                  key={r.id}
                  className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-white text-sm font-medium truncate">{r.event_title}</p>
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${STATUS_CLASS[statusKey]}`}
                    >
                      {statusLabels[statusKey]}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-xs text-gray-400">
                    <span>{r.role_name}</span>
                    <span className="font-mono text-amber-400">
                      {t('claimedAmount', { amount: formatSilver(regearPayoutSilver(r)) })}
                      <span className="text-gray-500"> / {t('ceilingAmount', { amount: formatSilver(r.silver) })}</span>
                    </span>
                  </div>
                  <p className="text-gray-600 text-[11px] font-mono">
                    {t('requestedAt', { when: formatDateTime(r.created_at) })}
                    {r.resolved_at && statusKey !== 'pending' && (
                      <span className="ml-2">
                        · {t('resolvedAt', { status: statusLabels[statusKey], when: formatDateTime(r.resolved_at) })}
                      </span>
                    )}
                  </p>
                  {r.admin_notes && (
                    <p className="text-gray-400 text-[11px] italic truncate">{r.admin_notes}</p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-white font-bold text-sm">{t('exchangeHistory', { count: detail.exchanges.length })}</h2>
        {detail.exchanges.length === 0 ? (
          <p className="text-gray-500 text-xs">{t('noExchanges')}</p>
        ) : (
          <ul className="space-y-2">
            {detail.exchanges.map((e) => (
              <ExchangeRow
                key={e.id}
                entry={e}
                statusLabels={statusLabels}
                manualAdjustLabel={t('manualAdjust')}
                adjustedAtLabel={(when) => t('adjustedAt', { when })}
                requestedAtLabel={(when) => t('requestedAt', { when })}
                resolvedAtLabel={(status, when) => t('resolvedAt', { status, when })}
              />
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

interface ExchangeRowProps {
  entry: MemberExchangeEntry
  statusLabels: StatusLabels
  manualAdjustLabel: string
  adjustedAtLabel: (when: string) => string
  requestedAtLabel: (when: string) => string
  resolvedAtLabel: (status: string, when: string) => string
}

function ExchangeRow({
  entry,
  statusLabels,
  manualAdjustLabel,
  adjustedAtLabel,
  requestedAtLabel,
  resolvedAtLabel,
}: ExchangeRowProps) {
  if (entry.kind === 'admin_adjust') {
    const isGrant = entry.delta > 0
    return (
      <li className="flex items-center justify-between gap-3 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-mono ${isGrant ? 'text-green-300' : 'text-red-300'}`}>
            {isGrant ? '+' : '-'}
            {formatSilver(Math.abs(entry.delta))}
          </p>
          <p className="text-gray-600 text-[11px] font-mono">
            {adjustedAtLabel(formatDateTime(entry.created_at))}
          </p>
          {entry.memo && (
            <p className="text-gray-400 text-[11px] italic truncate">{entry.memo}</p>
          )}
        </div>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 bg-amber-500/20 text-amber-300">
          {manualAdjustLabel}
        </span>
      </li>
    )
  }

  const statusKey = entry.status as StatusKey
  return (
    <li className="flex items-center justify-between gap-3 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-white text-sm font-mono">{formatSilver(entry.silver)}</p>
        <p className="text-gray-600 text-[11px] font-mono">
          {requestedAtLabel(formatDateTime(entry.created_at))}
          {entry.resolved_at && statusKey !== 'pending' && (
            <span className="ml-2">
              · {resolvedAtLabel(statusLabels[statusKey], formatDateTime(entry.resolved_at))}
            </span>
          )}
        </p>
        {entry.admin_notes && (
          <p className="text-gray-400 text-[11px] italic truncate">{entry.admin_notes}</p>
        )}
      </div>
      <span
        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${STATUS_CLASS[statusKey]}`}
      >
        {statusLabels[statusKey]}
      </span>
    </li>
  )
}

function AttendanceBadge({
  attendance,
  labels,
}: {
  attendance: 'attended' | 'no_show' | 'unknown'
  labels: { attended: string; noShow: string }
}) {
  if (attendance === 'attended') {
    return (
      <span className="inline-flex items-center gap-1 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0">
        <UserCheck size={10} />
        {labels.attended}
      </span>
    )
  }
  if (attendance === 'no_show') {
    return (
      <span className="inline-flex items-center gap-1 bg-gray-700/60 border border-gray-600 text-gray-300 text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0">
        <UserX size={10} />
        {labels.noShow}
      </span>
    )
  }
  return null
}

function OutcomeBadge({
  outcome,
  labels,
}: {
  outcome: 'win' | 'loss' | null
  labels: { win: string; loss: string; pending: string }
}) {
  if (outcome === 'win') {
    return (
      <span className="inline-flex items-center gap-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0">
        <Trophy size={10} />
        {labels.win}
      </span>
    )
  }
  if (outcome === 'loss') {
    return (
      <span className="inline-flex items-center gap-1 bg-rose-500/20 border border-rose-500/40 text-rose-200 text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0">
        <ShieldAlert size={10} />
        {labels.loss}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 bg-gray-700 text-gray-300 text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0">
      <Hourglass size={10} />
      {labels.pending}
    </span>
  )
}

function StatCard({
  icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ReactNode
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-3">
      <div className="flex items-center gap-1.5 text-gray-400 text-[11px] font-semibold uppercase tracking-widest">
        {icon}
        {label}
      </div>
      <p className={`text-white text-base sm:text-lg font-bold mt-1 ${mono ? 'font-mono' : ''}`}>
        {value}
      </p>
    </div>
  )
}
