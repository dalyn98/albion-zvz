// 길드 공개 페이지(/g/[slug])에서 길드원 본인이 보는 대시보드 섹션. 4개 카드:
// 포인트 잔액 / 최근 거래 / 리기어 청구 / 최근 킬·데스. RSC 로 데이터 페치 후
// 모든 라벨을 미리 풀어서 자식 카드에 prop 으로 넘긴다 (t() 함수 prop 금지 룰).

import Link from 'next/link'
import { Coins, ScrollText, Swords, Skull, ArrowRight, ShieldCheck } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { ACCENT_CLASS_MAP } from '@/lib/guild-profile'
import { formatRelativeFine } from '@/lib/relative-time'
import type {
  MemberDashboardSummary,
  MemberLedgerEntry,
  MemberRegearEntry,
  MemberKillEntry,
  RegearStatusSummary,
} from '@/lib/guild-profile-member-dashboard'

type Accent = (typeof ACCENT_CLASS_MAP)[keyof typeof ACCENT_CLASS_MAP]

interface Props {
  summary: MemberDashboardSummary
  username: string
  discordId: string
  accent: Accent
}

// reason 코드 → i18n 키 매핑. constraint(point_ledger_reason_check) 외의 값은
// 그대로 노출(other 라벨)해서 새 reason 추가 시 코드만 화면에 보이게 둔다.
const KNOWN_REASONS: ReadonlySet<string> = new Set([
  'regear_approved',
  'exchange_paid',
  'admin_adjust',
  'transfer_in',
  'transfer_out',
  'donation_approved',
  'event_payout_approved',
  'craft_reimbursement',
  'shop_purchase',
])

const REGEAR_STATUS_BADGE: Record<RegearStatusSummary, string> = {
  pending: 'bg-amber-500/15 text-amber-200 ring-amber-500/40',
  approved: 'bg-emerald-500/15 text-emerald-200 ring-emerald-500/40',
  rejected: 'bg-rose-500/15 text-rose-200 ring-rose-500/40',
}

export default async function MemberDashboardSection({
  summary,
  username,
  discordId,
  accent,
}: Props) {
  const t = await getTranslations('publicGuildProfile')
  const tTime = await getTranslations('time')

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <div
          className={`flex items-center gap-2 ${accent.heading} text-xs font-bold uppercase tracking-[0.25em]`}
        >
          <ShieldCheck size={14} />
          <span>{t('memberHeading')}</span>
        </div>
        <div className={`flex-1 h-px ${accent.divider}`} />
        <Link
          href={`/members/${discordId}`}
          className={`text-xs font-semibold ${accent.heading} hover:underline inline-flex items-center gap-1`}
        >
          {t('memberSeeMoreLink')}
          <ArrowRight size={12} />
        </Link>
      </div>
      <p className="text-gray-400 text-sm -mt-1">
        {t('memberSubheading', { username })}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <BalanceCard
          balance={summary.balance}
          pendingRegears={summary.pendingRegearCount}
          accent={accent}
          balanceLabel={t('memberBalanceLabel')}
          balanceUnit={t('memberBalanceUnit')}
          pendingLabel={t('memberPendingRegearsLabel')}
          pendingUnit={t('memberPendingRegearsUnit')}
        />
        <KillsCard
          entries={summary.recentKills}
          accent={accent}
          titleLabel={t('memberKillsLabel')}
          emptyLabel={t('memberKillsEmpty')}
          unitFame={t('killsUnit')}
          formatTime={(iso) => formatRelativeFine(iso, tTime)}
          formatOpponent={(entry) =>
            entry.opponent_guild
              ? t('memberKillsVsGuild', {
                  opponent: entry.opponent_name ?? '—',
                  guild: entry.opponent_guild,
                })
              : entry.opponent_name
                ? t('memberKillsVs', { opponent: entry.opponent_name })
                : t('memberKillsUnknown')
          }
        />
        <RegearsCard
          entries={summary.recentRegears}
          accent={accent}
          titleLabel={t('memberRegearsLabel')}
          emptyLabel={t('memberRegearsEmpty')}
          formatTime={(iso) => formatRelativeFine(iso, tTime)}
          statusLabel={(s) => t(`memberRegearStatus_${s}`)}
        />
        <LedgerCard
          entries={summary.recentLedger}
          accent={accent}
          titleLabel={t('memberLedgerLabel')}
          emptyLabel={t('memberLedgerEmpty')}
          formatTime={(iso) => formatRelativeFine(iso, tTime)}
          reasonLabel={(reason) =>
            KNOWN_REASONS.has(reason) ? t(`memberLedgerReason_${reason}`) : reason
          }
        />
      </div>
    </section>
  )
}

interface BalanceCardProps {
  balance: number
  pendingRegears: number
  accent: Accent
  balanceLabel: string
  balanceUnit: string
  pendingLabel: string
  pendingUnit: string
}

function BalanceCard({
  balance,
  pendingRegears,
  accent,
  balanceLabel,
  balanceUnit,
  pendingLabel,
  pendingUnit,
}: BalanceCardProps) {
  return (
    <div
      className={`relative rounded-xl border ${accent.border} bg-gray-900/40 p-5 backdrop-blur-sm overflow-hidden`}
    >
      <div
        className={`absolute -top-12 -right-12 w-32 h-32 rounded-full ${accent.heroGlow} blur-2xl pointer-events-none`}
      />
      <div className="relative space-y-4">
        <div className="flex items-center gap-2">
          <span
            className={`flex items-center justify-center w-8 h-8 rounded-lg ${accent.badgeBg} ${accent.heading}`}
          >
            <Coins size={14} />
          </span>
          <span
            className={`text-[10px] uppercase tracking-[0.18em] font-bold ${accent.heading}`}
          >
            {balanceLabel}
          </span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className={`text-3xl font-black ${accent.heading} tabular-nums`}>
            {balance.toLocaleString()}
          </span>
          <span className="text-gray-500 text-xs">{balanceUnit}</span>
        </div>
        <div className="pt-3 border-t border-gray-800 flex items-center justify-between">
          <span className="text-gray-400 text-xs">{pendingLabel}</span>
          <span className="text-white text-sm font-semibold tabular-nums">
            {pendingRegears.toLocaleString()}
            <span className="text-gray-500 text-xs ml-0.5">{pendingUnit}</span>
          </span>
        </div>
      </div>
    </div>
  )
}

interface KillsCardProps {
  entries: MemberKillEntry[]
  accent: Accent
  titleLabel: string
  emptyLabel: string
  unitFame: string
  formatTime: (iso: string) => string
  formatOpponent: (entry: MemberKillEntry) => string
}

function KillsCard({
  entries,
  accent,
  titleLabel,
  emptyLabel,
  unitFame,
  formatTime,
  formatOpponent,
}: KillsCardProps) {
  return (
    <div className={`rounded-xl border ${accent.border} bg-gray-900/40 p-5 backdrop-blur-sm`}>
      <div className="flex items-center gap-2 mb-4">
        <span
          className={`flex items-center justify-center w-8 h-8 rounded-lg ${accent.badgeBg} ${accent.heading}`}
        >
          <Swords size={14} />
        </span>
        <span
          className={`text-[10px] uppercase tracking-[0.18em] font-bold ${accent.heading}`}
        >
          {titleLabel}
        </span>
      </div>
      {entries.length === 0 ? (
        <p className="text-gray-500 text-xs">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry, idx) => (
            <li
              key={`${entry.event_id}-${idx}`}
              className="flex items-center gap-3 text-xs"
            >
              <span
                className={`shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md text-[10px] font-bold ${
                  entry.role === 'kill'
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-rose-500/15 text-rose-300'
                }`}
                aria-hidden
              >
                {entry.role === 'kill' ? <Swords size={11} /> : <Skull size={11} />}
              </span>
              <span className="flex-1 truncate text-gray-300">{formatOpponent(entry)}</span>
              <span className="text-gray-500 tabular-nums shrink-0">
                {entry.fame.toLocaleString()} {unitFame}
              </span>
              <span className="text-gray-600 font-mono text-[10px] shrink-0">
                {formatTime(entry.occurred_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface RegearsCardProps {
  entries: MemberRegearEntry[]
  accent: Accent
  titleLabel: string
  emptyLabel: string
  formatTime: (iso: string) => string
  statusLabel: (status: RegearStatusSummary) => string
}

function RegearsCard({
  entries,
  accent,
  titleLabel,
  emptyLabel,
  formatTime,
  statusLabel,
}: RegearsCardProps) {
  return (
    <div className={`rounded-xl border ${accent.border} bg-gray-900/40 p-5 backdrop-blur-sm`}>
      <div className="flex items-center gap-2 mb-4">
        <span
          className={`flex items-center justify-center w-8 h-8 rounded-lg ${accent.badgeBg} ${accent.heading}`}
        >
          <ScrollText size={14} />
        </span>
        <span
          className={`text-[10px] uppercase tracking-[0.18em] font-bold ${accent.heading}`}
        >
          {titleLabel}
        </span>
      </div>
      {entries.length === 0 ? (
        <p className="text-gray-500 text-xs">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2.5">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center gap-2 text-xs">
              <span
                className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ring-1 ${REGEAR_STATUS_BADGE[entry.status]}`}
              >
                {statusLabel(entry.status)}
              </span>
              <span className="flex-1 truncate text-gray-300">
                {entry.event_title ?? '—'}
                <span className="text-gray-600 ml-1.5">· {entry.role_name}</span>
              </span>
              <span className="text-gray-500 font-mono text-[10px] shrink-0">
                {formatTime(entry.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface LedgerCardProps {
  entries: MemberLedgerEntry[]
  accent: Accent
  titleLabel: string
  emptyLabel: string
  formatTime: (iso: string) => string
  reasonLabel: (reason: string) => string
}

function LedgerCard({
  entries,
  accent,
  titleLabel,
  emptyLabel,
  formatTime,
  reasonLabel,
}: LedgerCardProps) {
  return (
    <div className={`rounded-xl border ${accent.border} bg-gray-900/40 p-5 backdrop-blur-sm`}>
      <div className="flex items-center gap-2 mb-4">
        <span
          className={`flex items-center justify-center w-8 h-8 rounded-lg ${accent.badgeBg} ${accent.heading}`}
        >
          <Coins size={14} />
        </span>
        <span
          className={`text-[10px] uppercase tracking-[0.18em] font-bold ${accent.heading}`}
        >
          {titleLabel}
        </span>
      </div>
      {entries.length === 0 ? (
        <p className="text-gray-500 text-xs">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2.5">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center gap-2 text-xs">
              <span
                className={`shrink-0 tabular-nums font-bold w-16 text-right ${
                  entry.delta > 0 ? 'text-emerald-300' : 'text-rose-300'
                }`}
              >
                {entry.delta > 0 ? `+${entry.delta.toLocaleString()}` : entry.delta.toLocaleString()}
              </span>
              <span className="flex-1 text-gray-300 truncate">
                {reasonLabel(entry.reason)}
                {entry.memo && (
                  <span className="text-gray-600 ml-1.5">· {entry.memo}</span>
                )}
              </span>
              <span className="text-gray-500 font-mono text-[10px] shrink-0">
                {formatTime(entry.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
