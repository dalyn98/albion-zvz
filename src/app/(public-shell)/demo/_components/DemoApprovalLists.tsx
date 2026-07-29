'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Check, X, ShieldAlert, ShieldCheck, ChevronDown, ChevronUp, Users,
} from 'lucide-react'
import SearchBox from '@/components/SearchBox'
import { matchesName, normalizeQuery } from '@/lib/search-match'
import { formatTimeLabel, formatSilver, formatSilverFull } from '../_lib/format'
import { isRegearRejectReasonCode, REGEAR_REJECT_REASON_CODES, type RegearRejectReasonCode } from '@/lib/regear-reject-reasons'
import type {
  DemoRegearListItem,
  DemoExchangeRequest,
  DemoDonationRequest,
  DemoShopOrder,
  DemoMemberTradeDispute,
  DemoEventPayout,
  DemoCraftOrder,
} from '@/data/demo-seed'

// `/admin/dashboard/approvals` 의 6 개 ReviewList 컴포넌트 (Regear/Exchange/Donation/
// Shop/EventPayout/Craft) 를 한 곳에 데모용으로 클론. 카드 외관 / 상태 pill /
// 라벨 키는 실제 컴포넌트와 동일. 액션 버튼은 백엔드 호출 대신 클라이언트 상태
// override 로 처리 — 클릭하면 pending → approved/rejected pill 이 그 자리에서
// 바뀌어 "관리자가 어떻게 처리하는지" 가 실제 앱처럼 전달된다. 페이지 reload
// 시 초기화되며, 그것은 데모 페이지의 특성으로 받아들여진다.

type StatusOverride = 'approved' | 'rejected'

function useDemoStatusOverrides() {
  const [overrides, setOverrides] = useState<Partial<Record<string, StatusOverride>>>({})
  const setStatus = (id: string, status: StatusOverride) =>
    setOverrides((prev) => ({ ...prev, [id]: status }))
  return { overrides, setStatus }
}

const DEMO_HANDLER_NAME = 'You'

const STATUS_CLASS_DEFAULT: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-300',
  approved: 'bg-green-500/20 text-green-300',
  rejected: 'bg-gray-700 text-gray-300',
}

const STATUS_CLASS_EMERALD: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-300',
  approved: 'bg-emerald-500/20 text-emerald-300',
  rejected: 'bg-red-500/20 text-red-300',
  cancelled: 'bg-gray-700 text-gray-300',
}

// ─────────────────────────────────────────────────────────────────
// Regear — reject 시 사유 코드 드롭다운 (마이그 151 enum 8개 그대로)
// ─────────────────────────────────────────────────────────────────

export function DemoRegearReviewList({ requests }: { requests: DemoRegearListItem[] }) {
  const t = useTranslations('adminRegearReview')
  const tCommon = useTranslations('common')
  const tDemo = useTranslations('demo')
  const tReason = useTranslations('regearRejectReason')
  const { overrides, setStatus } = useDemoStatusOverrides()
  const [openReasonFor, setOpenReasonFor] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = normalizeQuery(search)
    if (!q) return requests
    return requests.filter((r) => matchesName(r.victim, q) || matchesName(r.battleLabel, q))
  }, [requests, search])

  const handleReject = (id: string, reasonCode: RegearRejectReasonCode) => {
    if (!isRegearRejectReasonCode(reasonCode)) return
    setStatus(id, 'rejected')
    setOpenReasonFor(null)
  }

  return (
    <div className="space-y-3">
      <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-6">{tCommon('searchNoResults')}</p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((r) => {
            const effectiveStatus = overrides[r.id] ?? r.status
            const handler = overrides[r.id] ? DEMO_HANDLER_NAME : r.handledBy
            return (
              <li key={r.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-white text-sm font-semibold truncate">{r.victim}</span>
                      <span className="inline-flex items-center gap-1 bg-violet-400 text-black text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded">
                        {r.origin === 'event'
                          ? t('originEvent')
                          : r.origin === 'free_window'
                            ? t('originFreeWindow')
                            : t('originAuto')}
                      </span>
                      {r.requestType === 'overcharge' && (
                        <span className="inline-flex items-center gap-1 bg-orange-500 text-black text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded">
                          {t('requestTypeOverchargeBadge')}
                        </span>
                      )}
                      <span className="text-gray-400 text-xs truncate">· {r.battleLabel}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-xs text-gray-400">
                      <span className="font-mono text-amber-400">
                        {t('claimed', { amount: formatSilver(r.totalSilver) })}
                        {r.capSilver != null && (
                          <span className="text-gray-500"> / {t('cap', { amount: formatSilver(r.capSilver) })}</span>
                        )}
                      </span>
                      <span className="font-mono text-gray-500">{formatTimeLabel(tDemo, r.diedAt)}</span>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0 ${STATUS_CLASS_DEFAULT[effectiveStatus]}`}
                  >
                    {statusText(t, effectiveStatus)}
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {r.requestType === 'overcharge' ? (
                    <span className="flex items-center gap-1 text-orange-300 text-xs">
                      <ShieldAlert size={13} /> {t('overchargeNoKillboard')}
                    </span>
                  ) : (
                    <>
                      <span className="flex items-center gap-1 text-green-400 text-xs">
                        <ShieldCheck size={13} /> {t('killboardVerified')}
                      </span>
                      <span className="text-[11px] text-gray-500">
                        · {r.killerName} <span className="text-gray-600">({r.killerWeapon})</span>
                      </span>
                    </>
                  )}
                </div>

                {effectiveStatus === 'pending' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setStatus(r.id, 'approved')}
                        className="flex items-center gap-1 text-xs bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 text-green-300 px-3 py-1.5 rounded transition-colors"
                      >
                        <Check size={13} />
                        {t('approveWithPayout', { amount: formatSilver(r.totalSilver) })}
                      </button>
                      <button
                        type="button"
                        onClick={() => setOpenReasonFor(openReasonFor === r.id ? null : r.id)}
                        aria-expanded={openReasonFor === r.id}
                        className="flex items-center gap-1 text-xs bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 px-3 py-1.5 rounded transition-colors"
                      >
                        <X size={13} /> {t('reject')}
                      </button>
                    </div>
                    {openReasonFor === r.id && (
                      <div className="bg-gray-950 border border-gray-700 rounded-lg p-3 space-y-1.5">
                        <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">
                          {t('rejectReasonLabel')}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {REGEAR_REJECT_REASON_CODES.map((code) => (
                            <button
                              key={code}
                              type="button"
                              onClick={() => handleReject(r.id, code)}
                              className="text-[11px] bg-gray-800 hover:bg-red-500/20 hover:text-red-200 border border-gray-700 hover:border-red-500/40 text-gray-300 px-2.5 py-1 rounded transition-colors"
                            >
                              {tReason(code)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {effectiveStatus !== 'pending' && handler && (
                  <div className="text-gray-500 text-[11px] font-mono border-t border-gray-800 pt-2 space-y-0.5">
                    <p>{t('handledBy', { status: statusText(t, effectiveStatus), handler })}</p>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Exchange
// ─────────────────────────────────────────────────────────────────

export function DemoExchangeReviewList({ requests }: { requests: DemoExchangeRequest[] }) {
  const t = useTranslations('adminExchangeReview')
  const tCommon = useTranslations('common')
  const tDemo = useTranslations('demo')
  const { overrides, setStatus } = useDemoStatusOverrides()
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const q = normalizeQuery(search)
    if (!q) return requests
    return requests.filter((r) => matchesName(r.member, q))
  }, [requests, search])

  return (
    <div className="space-y-3">
      <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-6">{tCommon('searchNoResults')}</p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((r) => {
            const effectiveStatus = overrides[r.id] ?? r.status
            const handler = overrides[r.id] ? DEMO_HANDLER_NAME : r.handledBy
            return (
              <li key={r.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm font-semibold truncate">{r.member}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400 mt-1 flex-wrap">
                      <span className="font-mono text-amber-400">{formatSilver(r.silver)}</span>
                      <span className="text-gray-500">
                        {t('balanceLabel', { amount: formatSilver(r.points * 1000) })}
                      </span>
                      <span className="font-mono text-gray-600">{formatTimeLabel(tDemo, r.requestedAt)}</span>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0 ${STATUS_CLASS_DEFAULT[effectiveStatus]}`}
                  >
                    {statusText(t, effectiveStatus)}
                  </span>
                </div>

                {effectiveStatus === 'pending' && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setStatus(r.id, 'approved')}
                      className="flex items-center gap-1 text-xs bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 text-green-300 px-3 py-1.5 rounded transition-colors"
                    >
                      <Check size={13} />
                      {t('approveButton')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatus(r.id, 'rejected')}
                      className="flex items-center gap-1 text-xs bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 px-3 py-1.5 rounded transition-colors"
                    >
                      <X size={13} /> {t('reject')}
                    </button>
                  </div>
                )}

                {effectiveStatus !== 'pending' && handler && (
                  <div className="text-gray-500 text-[11px] font-mono border-t border-gray-800 pt-2 space-y-0.5">
                    <p>{t('handledBy', { status: statusText(t, effectiveStatus), handler })}</p>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Donation
// ─────────────────────────────────────────────────────────────────

export function DemoDonationReviewList({ requests }: { requests: DemoDonationRequest[] }) {
  const t = useTranslations('adminDonationReview')
  const tCommon = useTranslations('common')
  const tDemo = useTranslations('demo')
  const { overrides, setStatus } = useDemoStatusOverrides()
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const q = normalizeQuery(search)
    if (!q) return requests
    return requests.filter((r) => matchesName(r.member, q))
  }, [requests, search])

  return (
    <div className="space-y-3">
      <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-6">{tCommon('searchNoResults')}</p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((r) => {
            const effectiveStatus = overrides[r.id] ?? r.status
            const handler = overrides[r.id] ? DEMO_HANDLER_NAME : r.handledBy
            return (
              <li key={r.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white text-sm font-semibold truncate">{r.member}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-xs text-gray-400">
                      <span className="font-mono text-emerald-400">
                        {t('claimed', { amount: formatSilver(r.silver) })}
                      </span>
                      <span className="font-mono text-gray-500">{formatTimeLabel(tDemo, r.requestedAt)}</span>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0 ${STATUS_CLASS_DEFAULT[effectiveStatus]}`}
                  >
                    {statusText(t, effectiveStatus)}
                  </span>
                </div>

                {r.note && (
                  <div className="bg-gray-800/50 rounded px-3 py-2">
                    <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-1">
                      {t('memoLabel')}
                    </p>
                    <p className="text-gray-300 text-xs whitespace-pre-wrap">{r.note}</p>
                  </div>
                )}

                {effectiveStatus === 'pending' && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setStatus(r.id, 'approved')}
                      className="flex items-center gap-1 text-xs bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 text-green-300 px-3 py-1.5 rounded transition-colors"
                    >
                      <Check size={13} />
                      {t('approveWithPayout', { amount: formatSilver(r.silver) })}
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatus(r.id, 'rejected')}
                      className="flex items-center gap-1 text-xs bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 px-3 py-1.5 rounded transition-colors"
                    >
                      <X size={13} /> {t('reject')}
                    </button>
                  </div>
                )}

                {effectiveStatus !== 'pending' && handler && (
                  <div className="text-gray-500 text-[11px] font-mono border-t border-gray-800 pt-2 space-y-0.5">
                    <p>{t('handledBy', { status: statusText(t, effectiveStatus), handler })}</p>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Shop order
// ─────────────────────────────────────────────────────────────────

export function DemoShopOrderReviewList({ orders }: { orders: DemoShopOrder[] }) {
  const t = useTranslations('adminShopOrderReview')
  const { overrides, setStatus } = useDemoStatusOverrides()
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const q = normalizeQuery(search)
    if (!q) return orders
    return orders.filter((o) => matchesName(o.member, q) || matchesName(o.itemLabel, q))
  }, [orders, search])
  const tDemo = useTranslations('demo')

  return (
    <div className="space-y-3">
      <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-6">{t('searchNoResults')}</p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((o) => {
            const effectiveStatus = overrides[o.id] ?? o.status
            const handler = overrides[o.id] ? DEMO_HANDLER_NAME : o.handledBy
            return (
              <li key={o.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm font-semibold truncate">{o.member}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400 mt-1 flex-wrap">
                      <span className="font-mono text-amber-300 font-bold">
                        {o.pointsTotal.toLocaleString()}p
                      </span>
                      <span className="text-gray-500">
                        {t('balanceLabel', { amount: '4,200' })}
                      </span>
                      <span className="font-mono text-gray-600">{formatTimeLabel(tDemo, o.requestedAt)}</span>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0 ${
                      STATUS_CLASS_EMERALD[effectiveStatus] ?? STATUS_CLASS_EMERALD.pending
                    }`}
                  >
                    {statusText(t, effectiveStatus)}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2 rounded px-2 py-1 text-xs bg-gray-800/40">
                    <div className="w-7 h-7 rounded bg-gray-950 flex-shrink-0" />
                    <span className="text-gray-200 flex-1 truncate">
                      {o.itemLabel}
                      {o.itemEnchant > 0 && (
                        <span className="text-amber-300 ml-1 font-mono">.{o.itemEnchant}</span>
                      )}
                    </span>
                    <span className="text-gray-400 font-mono">× {o.quantity}</span>
                    <span className="text-amber-300 font-mono w-20 text-right">
                      {o.pointsTotal.toLocaleString()}p
                    </span>
                  </div>
                </div>

                {effectiveStatus === 'pending' && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setStatus(o.id, 'approved')}
                      className="flex items-center gap-1 text-xs bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 px-3 py-1.5 rounded transition-colors"
                    >
                      <Check size={13} />
                      {t('approveButton')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatus(o.id, 'rejected')}
                      className="flex items-center gap-1 text-xs bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 px-3 py-1.5 rounded transition-colors"
                    >
                      <X size={13} /> {t('rejectButton')}
                    </button>
                  </div>
                )}

                {effectiveStatus !== 'pending' && handler && (
                  <div className="text-gray-500 text-[11px] font-mono border-t border-gray-800 pt-2">
                    {t('statusTimestamp', { status: statusText(t, effectiveStatus), datetime: formatTimeLabel(tDemo, o.requestedAt) })}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function DemoMemberTradeDisputeReviewList({
  disputes,
}: {
  disputes: DemoMemberTradeDispute[]
}) {
  const t = useTranslations('adminMemberTradeReview')
  const tDemo = useTranslations('demo')
  const [search, setSearch] = useState('')
  const [overrides, setOverrides] = useState<
    Partial<Record<string, 'completed' | 'refunded'>>
  >({})
  const filtered = useMemo(() => {
    const query = normalizeQuery(search)
    if (!query) return disputes
    return disputes.filter((row) =>
      matchesName(`${row.title} ${row.buyer} ${row.seller}`, query),
    )
  }, [disputes, search])

  return (
    <div className="space-y-3">
      <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">{t('searchNoResults')}</p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {filtered.map((row) => {
            const status = overrides[row.id] ?? row.status
            const canResolve = status === 'disputed'
            return (
              <li key={row.id} className="space-y-3 px-1 py-4 sm:px-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-foreground">{row.title}</h3>
                    <p className="mt-1 text-xs text-muted">
                      {t('tradeItemCount', { count: row.itemCount })} ·{' '}
                      {t('tradeTotal', {
                        quantity: row.quantity.toLocaleString(),
                        total: row.totalPoints.toLocaleString(),
                      })}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${
                      status === 'disputed'
                        ? 'bg-danger-soft text-danger-soft-foreground'
                        : status === 'completed'
                          ? 'bg-success-soft text-success-soft-foreground'
                          : 'bg-surface-2 text-muted'
                    }`}>
                      {status === 'disputed'
                        ? t('statusDisputed')
                        : status === 'completed'
                          ? t('statusCompleted')
                          : t('statusRefunded')}
                    </span>
                    <p className="mt-1 font-mono text-[11px] text-subtle">
                      {formatTimeLabel(tDemo, row.requestedAt)}
                    </p>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
                    <span className="font-semibold text-subtle">{t('buyer')}</span> · {row.buyer}
                  </p>
                  <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
                    <span className="font-semibold text-subtle">{t('seller')}</span> · {row.seller}
                  </p>
                </div>
                <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger-soft-foreground">
                  <span className="font-semibold">{t('disputeReason')}</span> ·{' '}
                  {row.disputeReason === 'deliveryConflict'
                    ? t('demoReasonDeliveryConflict')
                    : t('demoReasonCancelBeforeDelivery')}
                </p>
                {canResolve && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setOverrides((current) => ({ ...current, [row.id]: 'completed' }))}
                      className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-success-soft px-3 text-xs font-semibold text-success-soft-foreground"
                    >
                      <Check size={13} /> {t('releaseButton')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setOverrides((current) => ({ ...current, [row.id]: 'refunded' }))}
                      className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-surface-2 px-3 text-xs font-semibold text-muted"
                    >
                      <X size={13} /> {t('refundButton')}
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Event payout
// ─────────────────────────────────────────────────────────────────

export function DemoEventPayoutReviewList({ requests }: { requests: DemoEventPayout[] }) {
  const t = useTranslations('adminEventPayoutReview')
  const tCommon = useTranslations('common')
  const tDemo = useTranslations('demo')
  const { overrides, setStatus } = useDemoStatusOverrides()
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const q = normalizeQuery(search)
    if (!q) return requests
    return requests.filter((r) => matchesName(r.eventName, q))
  }, [requests, search])

  return (
    <div className="space-y-3">
      <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-6">{tCommon('searchNoResults')}</p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((r) => (
            <DemoEventPayoutRow
              key={r.id}
              request={r}
              effectiveStatus={overrides[r.id] ?? r.status}
              handler={overrides[r.id] ? DEMO_HANDLER_NAME : r.handledBy}
              onApprove={() => setStatus(r.id, 'approved')}
              onReject={() => setStatus(r.id, 'rejected')}
              t={t}
              tDemo={tDemo}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function DemoEventPayoutRow({
  request,
  effectiveStatus,
  handler,
  onApprove,
  onReject,
  t,
  tDemo,
}: {
  request: DemoEventPayout
  effectiveStatus: string
  handler: string | null | undefined
  onApprove: () => void
  onReject: () => void
  t: (key: string, values?: Record<string, string | number>) => string
  tDemo: (key: string, values?: Record<string, string | number>) => string
}) {
  const [showParticipants, setShowParticipants] = useState(false)
  return (
    <li className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white text-sm font-semibold truncate">{request.eventName}</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap text-xs">
            <span className="font-mono text-amber-400">
              {t('perMember', { amount: formatSilver(request.pointsPerMember) })}
            </span>
            <span className="font-mono text-gray-300 inline-flex items-center gap-1">
              <Users size={11} />
              {t('participantCount', { count: request.participantCount })}
            </span>
            <span className="font-mono text-emerald-300">
              {t('total', { amount: formatSilver(request.totalPoints) })}
            </span>
          </div>
          <p className="text-[11px] text-gray-500 font-mono">
            {t('requestedBy', {
              by: 'Eternia',
              datetime: formatTimeLabel(tDemo, request.requestedAt),
            })}
          </p>
        </div>
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0 ${STATUS_CLASS_DEFAULT[effectiveStatus]}`}
        >
          {statusText(t, effectiveStatus)}
        </span>
      </div>

      <button
        type="button"
        onClick={() => setShowParticipants((v) => !v)}
        className="inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-white"
      >
        {showParticipants ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {showParticipants ? t('hideParticipants') : t('showParticipants')}
      </button>

      {effectiveStatus === 'pending' && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onApprove}
            className="flex items-center gap-1 text-xs bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 text-green-300 px-3 py-1.5 rounded transition-colors"
          >
            <Check size={13} />
            {t('approveWithPayout', { amount: formatSilver(request.totalPoints) })}
          </button>
          <button
            type="button"
            onClick={onReject}
            className="flex items-center gap-1 text-xs bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 px-3 py-1.5 rounded transition-colors"
          >
            <X size={13} /> {t('reject')}
          </button>
        </div>
      )}

      {effectiveStatus !== 'pending' && handler && (
        <div className="text-gray-500 text-[11px] font-mono border-t border-gray-800 pt-2 space-y-0.5">
          <p>{t('handledBy', { status: statusText(t, effectiveStatus), handler })}</p>
        </div>
      )}
    </li>
  )
}

// ─────────────────────────────────────────────────────────────────
// Craft order
// ─────────────────────────────────────────────────────────────────

export function DemoCraftOrderReviewList({ tasks }: { tasks: DemoCraftOrder[] }) {
  const t = useTranslations('adminCraftOrderReview')
  const tDemo = useTranslations('demo')
  const { overrides, setStatus } = useDemoStatusOverrides()
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const q = normalizeQuery(search)
    if (!q) return tasks
    return tasks.filter((task) => matchesName(task.crafter, q) || matchesName(task.itemLabel, q))
  }, [tasks, search])

  return (
    <div className="space-y-3">
      <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-6">{t('searchNoResults')}</p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((task) => {
            const overridden = overrides[task.id]
            const baseStatus = overridden ?? (task.status === 'pending' ? 'delivered' : task.status)
            return (
              <li
                key={task.id}
                className="border border-gray-800 rounded-xl bg-gray-900 p-3 sm:p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-gray-800 flex-shrink-0" />
                    <div>
                      <span className="text-white font-medium text-sm">{task.crafter}</span>
                      <p className="text-[11px] text-gray-500">{formatTimeLabel(tDemo, task.submittedAt)}</p>
                    </div>
                  </div>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded ${
                      baseStatus === 'approved'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : baseStatus === 'rejected'
                          ? 'bg-red-500/20 text-red-300'
                          : 'bg-amber-500/20 text-amber-200'
                    }`}
                  >
                    {craftStatusText(t, baseStatus)}
                  </span>
                </div>

                <div className="bg-gray-950 border border-gray-800 rounded-lg p-2.5 space-y-1.5">
                  <p className="text-sm font-semibold text-white flex items-center gap-1.5">
                    <span>{task.itemLabel}</span>
                    {task.itemEnchant > 0 && (
                      <span className="text-[11px] font-mono text-amber-300">+{task.itemEnchant}</span>
                    )}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {t('quantityLabel', { count: task.quantity })} ·{' '}
                    {t('unitPriceLabel', { silver: formatSilverFull(task.silverPaid / task.quantity) })} ·{' '}
                    {t('payoutLabel', { silver: formatSilverFull(task.silverPaid) })}
                  </p>
                </div>

                {task.status === 'pending' && !overridden && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setStatus(task.id, 'approved')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
                    >
                      <Check size={12} />
                      {t('approve')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatus(task.id, 'rejected')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 text-xs font-medium transition-colors"
                    >
                      <X size={12} />
                      {t('reject')}
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────

function statusText(
  t: (key: string) => string,
  status: string,
): string {
  if (status === 'approved') return t('statusApproved')
  if (status === 'rejected') return t('statusRejected')
  return t('statusPending')
}

function craftStatusText(
  t: (key: string) => string,
  status: string,
): string {
  if (status === 'approved') return t('statusApproved')
  if (status === 'rejected') return t('statusRejected')
  return t('statusDelivered')
}
