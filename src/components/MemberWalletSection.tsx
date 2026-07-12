import { ArrowRightLeft, History, ListChecks } from 'lucide-react'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getMyDashboard } from '@/app/actions/me-dashboard'
import { getMyMemberTradePointSummary } from '@/app/actions/member-trade'
import { listMyExchangeRequests } from '@/app/actions/exchange'
import { listTransferCandidates } from '@/app/actions/transfer'
import { getAdminClient } from '@/lib/supabase-admin'
import {
  listMemberPointLedgerEntries,
  type MemberPointLedgerEntryRow,
} from '@/lib/point-ledger'
import { formatSilver } from '@/lib/silver'
import { formatDateTime } from '@/lib/format-datetime'
import { getTenantTimezone } from '@/lib/timezone-server'
import RequestExchangeForm from '@/components/RequestExchangeForm'
import TransferPointsForm from '@/components/TransferPointsForm'
import DonationRequestButton from '@/components/DonationRequestButton'

const POINT_LEDGER_PREVIEW_LIMIT = 12

const POINT_LEDGER_REASONS = [
  'regear_approved',
  'exchange_paid',
  'admin_adjust',
  'transfer_in',
  'transfer_out',
  'donation_approved',
  'event_payout_approved',
  'craft_reimbursement',
  'shop_purchase',
  'member_trade_purchase',
  'member_trade_sale',
] as const

type PointLedgerReason = (typeof POINT_LEDGER_REASONS)[number]

const POINT_LEDGER_REASON_SET = new Set<string>(POINT_LEDGER_REASONS)

interface Props {
  guildId: string
  discordId: string
}

export default async function MemberWalletSection({ guildId, discordId }: Props) {
  const db = getAdminClient()
  const [
    dashboard,
    memberTradePoints,
    pointLedger,
    { requests: exchanges },
    { candidates: transferCandidates },
    t,
    tReason,
    timezone,
  ] = await Promise.all([
    getMyDashboard(),
    getMyMemberTradePointSummary(),
    listMemberPointLedgerEntries(db, guildId, discordId, { limit: POINT_LEDGER_PREVIEW_LIMIT }),
    listMyExchangeRequests(),
    listTransferCandidates(),
    getTranslations('me'),
    getTranslations('publicGuildProfile'),
    getTenantTimezone(guildId),
  ])

  const pendingExchange = exchanges.find((exchange) => exchange.status === 'pending') ?? null
  const spendablePoints = memberTradePoints.spendable
  const escrowedPoints = memberTradePoints.escrowed
  const balance = memberTradePoints.balance || dashboard?.balance || 0

  return (
    <>
      <section
        data-tour-id="member-tour-exchange"
        className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-white">{t('walletTitle')}</h2>
            <p className="text-gray-400 text-xs leading-relaxed mt-1">{t('walletDescription')}</p>
          </div>
          <Link
            href="/me/requests"
            className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300 hover:text-amber-200"
          >
            <ListChecks size={14} />
            {t('walletHistoryLink')}
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <Metric label={t('walletBalanceLabel')} value={formatSilver(balance)} accent />
          <Metric
            label={t('walletSpendableLabel')}
            value={formatSilver(spendablePoints)}
            sub={t('walletSpendableSub')}
            valueClass="text-emerald-300"
          />
          <Metric
            label={t('walletEscrowedLabel')}
            value={formatSilver(escrowedPoints)}
            sub={t('walletEscrowedSub')}
            valueClass={escrowedPoints > 0 ? 'text-amber-300' : 'text-gray-400'}
          />
          <Metric
            label={t('walletExchangeLabel')}
            value={pendingExchange ? formatSilver(pendingExchange.silver) : t('walletNoPending')}
            sub={pendingExchange ? t('walletPendingExchange') : t('walletExchangeReady')}
          />
          <Metric
            label={t('walletLifetimeLabel')}
            value={
              dashboard
                ? t('walletLifetimeValue', {
                    earned: formatSilver(dashboard.lifetimeEarned),
                    spent: formatSilver(dashboard.lifetimeSpent),
                  })
                : '-'
            }
            sub={t('walletLifetimeSub')}
          />
        </div>

        <div className="border-t border-gray-800 pt-4 space-y-3">
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <ArrowRightLeft size={16} className="text-amber-300" />
                  {t('walletExchangeCtaTitle')}
                </h3>
                <p className="text-gray-300 text-xs leading-relaxed mt-1">
                  {pendingExchange ? t('walletExchangeCtaPendingBody') : t('walletExchangeCtaReadyBody')}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-200/80">
                  {pendingExchange ? t('walletExchangeCtaPendingAmount') : t('walletExchangeCtaSpendable')}
                </p>
                <p className="text-lg font-black text-amber-100 font-mono">
                  {formatSilver(pendingExchange?.silver ?? spendablePoints)}
                </p>
              </div>
            </div>
            <RequestExchangeForm balance={spendablePoints} disabled={pendingExchange !== null} />
          </div>
        </div>

        <div className="border-t border-gray-800 pt-4 flex items-center justify-between gap-3">
          <p className="text-gray-500 text-[11px] leading-relaxed min-w-0 flex-1">
            {t('transferDescription')}
          </p>
          <TransferPointsForm balance={spendablePoints} candidates={transferCandidates} />
        </div>

        <PointLedgerPreview
          entries={pointLedger.rows}
          hasError={!!pointLedger.error}
          t={t}
          tReason={tReason}
          timezone={timezone}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold text-white">{t('donationTitle')}</h2>
          <DonationRequestButton />
        </div>
        <p className="text-gray-400 text-xs leading-relaxed">{t('donationDescription')}</p>
      </section>
    </>
  )
}

function isPointLedgerReason(reason: string): reason is PointLedgerReason {
  return POINT_LEDGER_REASON_SET.has(reason)
}

function pointLedgerReasonLabel(
  reason: string,
  tReason: Awaited<ReturnType<typeof getTranslations<'publicGuildProfile'>>>,
): string {
  if (isPointLedgerReason(reason)) return tReason(`memberLedgerReason_${reason}`)
  return tReason('memberLedgerReason_unknown')
}

function formatPointDelta(
  delta: number,
  t: Awaited<ReturnType<typeof getTranslations<'me'>>>,
): string {
  const sign = delta > 0 ? '+' : delta < 0 ? '-' : ''
  return t('walletLedgerDelta', { sign, amount: formatSilver(Math.abs(delta)) })
}

function PointLedgerPreview({
  entries,
  hasError,
  t,
  tReason,
  timezone,
}: {
  entries: MemberPointLedgerEntryRow[]
  hasError: boolean
  t: Awaited<ReturnType<typeof getTranslations<'me'>>>
  tReason: Awaited<ReturnType<typeof getTranslations<'publicGuildProfile'>>>
  timezone: string
}) {
  return (
    <div className="border-t border-gray-800 pt-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2 text-balance">
            <History size={16} className="text-amber-300" />
            {t('walletLedgerTitle')}
          </h3>
          <p className="text-gray-500 text-xs leading-relaxed text-pretty mt-1">
            {t('walletLedgerDescription')}
          </p>
        </div>
        <span className="rounded-full bg-gray-950/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          {t('walletLedgerLimit', { count: POINT_LEDGER_PREVIEW_LIMIT })}
        </span>
      </div>

      {hasError ? (
        <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{t('walletLedgerError')}</p>
      ) : entries.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-500">{t('walletLedgerEmpty')}</p>
      ) : (
        <ul className="divide-y divide-gray-800">
          {entries.map((entry) => {
            const isPositive = entry.delta > 0
            const isNegative = entry.delta < 0
            return (
              <li key={entry.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate">
                    {pointLedgerReasonLabel(entry.reason, tReason)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-gray-500 tabular-nums">
                    {formatDateTime(entry.createdAt, timezone)}
                    {entry.handledByUsername && (
                      <span className="ml-2 text-gray-600">· {t('handledBy', { handler: entry.handledByUsername })}</span>
                    )}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black tabular-nums ${
                    isPositive
                      ? 'bg-emerald-500/10 text-emerald-300'
                      : isNegative
                        ? 'bg-rose-500/10 text-rose-300'
                        : 'bg-gray-800 text-gray-300'
                  }`}
                >
                  {formatPointDelta(entry.delta, t)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Metric({
  label,
  value,
  sub,
  accent = false,
  valueClass,
}: {
  label: string
  value: string
  sub?: string
  accent?: boolean
  valueClass?: string
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950/40 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-bold font-mono ${valueClass ?? (accent ? 'text-amber-300' : 'text-white')}`}>
        {value}
      </p>
      {sub && <p className="mt-1 text-[11px] text-gray-500">{sub}</p>}
    </div>
  )
}
