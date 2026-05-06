'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Check, X, ShieldCheck, ChevronDown, ChevronUp, Users,
} from 'lucide-react'
import SearchBox from '@/components/SearchBox'
import { matchesName, normalizeQuery } from '@/lib/search-match'
import { formatTimeLabel, formatSilver, formatSilverFull } from '../_lib/format'
import type {
  DemoRegearListItem,
  DemoExchangeRequest,
  DemoDonationRequest,
  DemoShopOrder,
  DemoEventPayout,
  DemoCraftOrder,
} from '@/data/demo-seed'

// `/admin/dashboard/approvals` 의 6 개 ReviewList 컴포넌트 (Regear/Exchange/Donation/
// Shop/EventPayout/Craft) 를 한 곳에 데모용으로 클론. 모든 액션 버튼은 disabled.
// 카드 외관 / 상태 pill / 라벨 키는 실제 컴포넌트와 동일.

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
// Regear
// ─────────────────────────────────────────────────────────────────

export function DemoRegearReviewList({ requests }: { requests: DemoRegearListItem[] }) {
  const t = useTranslations('adminRegearReview')
  const tCommon = useTranslations('common')
  const tDemo = useTranslations('demo')
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const q = normalizeQuery(search)
    if (!q) return requests
    return requests.filter((r) => matchesName(r.victim, q) || matchesName(r.battleLabel, q))
  }, [requests, search])

  return (
    <div className="space-y-3">
      <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-6">{tCommon('searchNoResults')}</p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((r) => (
            <li key={r.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-white text-sm font-semibold truncate">{r.victim}</span>
                    {r.origin === 'manual' && (
                      <span className="inline-flex items-center gap-1 bg-violet-400 text-black text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded">
                        {t('originManual')}
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
                  className={`text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0 ${STATUS_CLASS_DEFAULT[r.status]}`}
                >
                  {statusText(t, r.status)}
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1 text-green-400 text-xs">
                  <ShieldCheck size={13} /> {t('killboardVerified')}
                </span>
                <span className="text-[11px] text-gray-500">
                  · {r.killerName} <span className="text-gray-600">({r.killerWeapon})</span>
                </span>
              </div>

              {r.status === 'pending' && (
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    disabled
                    className="flex items-center gap-1 text-xs bg-green-500/20 border border-green-500/40 text-green-300 px-3 py-1.5 rounded cursor-not-allowed opacity-90"
                  >
                    <Check size={13} />
                    {t('approveWithPayout', { amount: formatSilver(r.totalSilver) })}
                  </button>
                  <button
                    type="button"
                    disabled
                    className="flex items-center gap-1 text-xs bg-red-500/20 border border-red-500/40 text-red-300 px-3 py-1.5 rounded cursor-not-allowed opacity-90"
                  >
                    <X size={13} /> {t('reject')}
                  </button>
                </div>
              )}

              {r.status !== 'pending' && r.handledBy && (
                <div className="text-gray-500 text-[11px] font-mono border-t border-gray-800 pt-2 space-y-0.5">
                  <p>{t('handledBy', { status: statusText(t, r.status), handler: r.handledBy })}</p>
                </div>
              )}
            </li>
          ))}
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
          {filtered.map((r) => (
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
                  className={`text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0 ${STATUS_CLASS_DEFAULT[r.status]}`}
                >
                  {statusText(t, r.status)}
                </span>
              </div>

              {r.status === 'pending' && (
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    disabled
                    className="flex items-center gap-1 text-xs bg-green-500/20 border border-green-500/40 text-green-300 px-3 py-1.5 rounded cursor-not-allowed opacity-90"
                  >
                    <Check size={13} />
                    {t('approveButton')}
                  </button>
                  <button
                    type="button"
                    disabled
                    className="flex items-center gap-1 text-xs bg-red-500/20 border border-red-500/40 text-red-300 px-3 py-1.5 rounded cursor-not-allowed opacity-90"
                  >
                    <X size={13} /> {t('reject')}
                  </button>
                </div>
              )}

              {r.status !== 'pending' && r.handledBy && (
                <div className="text-gray-500 text-[11px] font-mono border-t border-gray-800 pt-2 space-y-0.5">
                  <p>{t('handledBy', { status: statusText(t, r.status), handler: r.handledBy })}</p>
                </div>
              )}
            </li>
          ))}
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
          {filtered.map((r) => (
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
                  className={`text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0 ${STATUS_CLASS_DEFAULT[r.status]}`}
                >
                  {statusText(t, r.status)}
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

              {r.status === 'pending' && (
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    disabled
                    className="flex items-center gap-1 text-xs bg-green-500/20 border border-green-500/40 text-green-300 px-3 py-1.5 rounded cursor-not-allowed opacity-90"
                  >
                    <Check size={13} />
                    {t('approveWithPayout', { amount: formatSilver(r.silver) })}
                  </button>
                  <button
                    type="button"
                    disabled
                    className="flex items-center gap-1 text-xs bg-red-500/20 border border-red-500/40 text-red-300 px-3 py-1.5 rounded cursor-not-allowed opacity-90"
                  >
                    <X size={13} /> {t('reject')}
                  </button>
                </div>
              )}

              {r.status !== 'pending' && r.handledBy && (
                <div className="text-gray-500 text-[11px] font-mono border-t border-gray-800 pt-2 space-y-0.5">
                  <p>{t('handledBy', { status: statusText(t, r.status), handler: r.handledBy })}</p>
                </div>
              )}
            </li>
          ))}
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
          {filtered.map((o) => (
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
                    STATUS_CLASS_EMERALD[o.status] ?? STATUS_CLASS_EMERALD.pending
                  }`}
                >
                  {statusText(t, o.status)}
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

              {o.status === 'pending' && (
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    disabled
                    className="flex items-center gap-1 text-xs bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 px-3 py-1.5 rounded cursor-not-allowed opacity-90"
                  >
                    <Check size={13} />
                    {t('approveButton')}
                  </button>
                  <button
                    type="button"
                    disabled
                    className="flex items-center gap-1 text-xs bg-red-500/20 border border-red-500/40 text-red-300 px-3 py-1.5 rounded cursor-not-allowed opacity-90"
                  >
                    <X size={13} /> {t('rejectButton')}
                  </button>
                </div>
              )}

              {o.status !== 'pending' && o.handledBy && (
                <div className="text-gray-500 text-[11px] font-mono border-t border-gray-800 pt-2">
                  {t('statusTimestamp', { status: statusText(t, o.status), datetime: formatTimeLabel(tDemo, o.requestedAt) })}
                </div>
              )}
            </li>
          ))}
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
            <DemoEventPayoutRow key={r.id} request={r} t={t} tDemo={tDemo} />
          ))}
        </ul>
      )}
    </div>
  )
}

function DemoEventPayoutRow({
  request,
  t,
  tDemo,
}: {
  request: DemoEventPayout
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
          className={`text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0 ${STATUS_CLASS_DEFAULT[request.status]}`}
        >
          {statusText(t, request.status)}
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

      {request.status === 'pending' && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            disabled
            className="flex items-center gap-1 text-xs bg-green-500/20 border border-green-500/40 text-green-300 px-3 py-1.5 rounded cursor-not-allowed opacity-90"
          >
            <Check size={13} />
            {t('approveWithPayout', { amount: formatSilver(request.totalPoints) })}
          </button>
          <button
            type="button"
            disabled
            className="flex items-center gap-1 text-xs bg-red-500/20 border border-red-500/40 text-red-300 px-3 py-1.5 rounded cursor-not-allowed opacity-90"
          >
            <X size={13} /> {t('reject')}
          </button>
        </div>
      )}

      {request.status !== 'pending' && request.handledBy && (
        <div className="text-gray-500 text-[11px] font-mono border-t border-gray-800 pt-2 space-y-0.5">
          <p>{t('handledBy', { status: statusText(t, request.status), handler: request.handledBy })}</p>
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
            const status = task.status === 'pending' ? 'delivered' : task.status
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
                      status === 'approved'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : status === 'rejected'
                          ? 'bg-red-500/20 text-red-300'
                          : 'bg-amber-500/20 text-amber-200'
                    }`}
                  >
                    {craftStatusText(t, status)}
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

                {task.status === 'pending' && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-emerald-600 disabled:opacity-90 text-white text-xs font-medium cursor-not-allowed"
                    >
                      <Check size={12} />
                      {t('approve')}
                    </button>
                    <button
                      type="button"
                      disabled
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-medium cursor-not-allowed opacity-90"
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
  status: 'pending' | 'approved' | 'rejected',
): string {
  if (status === 'approved') return t('statusApproved')
  if (status === 'rejected') return t('statusRejected')
  return t('statusPending')
}

function craftStatusText(
  t: (key: string) => string,
  status: 'delivered' | 'approved' | 'rejected',
): string {
  if (status === 'approved') return t('statusApproved')
  if (status === 'rejected') return t('statusRejected')
  return t('statusDelivered')
}
