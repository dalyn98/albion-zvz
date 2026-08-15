'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check, LockKeyhole, TriangleAlert, X } from 'lucide-react'
import {
  approveExchangeRequest,
  rejectExchangeRequest,
} from '@/app/actions/exchange-admin'
import type { AdminExchangeRequest } from '@/app/actions/regear-admin-types'
import { formatSilver } from '@/lib/silver'
import { formatDateTimeShort } from '@/lib/format-datetime'
import SearchBox from './SearchBox'
import MemberAvatar from './MemberAvatar'
import MemberLink from './MemberLink'
import { matchesDate, matchesName, normalizeQuery } from '@/lib/search-match'
import { useToast } from './ToastProvider'
import {
  getExchangePayoutReadiness,
  getExchangePayoutStatusTranslationKey,
} from '@/lib/exchange-payout'
import {
  ApprovalActionFeedback,
  ApprovalReviewDialog,
  useApprovalWorkflow,
} from './ApprovalWorkflow'

const STATUS_CLASS: Record<AdminExchangeRequest['status'], string> = {
  pending: 'bg-warning-soft text-warning-soft-foreground',
  approved: 'bg-success-soft text-success-soft-foreground',
  rejected: 'bg-danger-soft text-danger-soft-foreground',
  cancelled: 'bg-surface-2 text-muted ring-1 ring-border',
}

interface ExchangeReviewListProps {
  requests: AdminExchangeRequest[]
  timezone: string
  avatars?: Record<string, string | null>
}

export default function ExchangeReviewList({
  requests,
  timezone,
  avatars = {},
}: ExchangeReviewListProps) {
  const t = useTranslations('adminExchangeReview')
  const tCommon = useTranslations('common')
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const q = normalizeQuery(search)
    if (!q) return requests
    return requests.filter(
      (r) =>
        matchesName(r.username, q) ||
        matchesDate(r.created_at, q) ||
        matchesDate(r.resolved_at, q),
    )
  }, [requests, search])

  return (
    <div className="space-y-3">
      <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-6">{tCommon('searchNoResults')}</p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {filtered.map((r) => (
            <ExchangeRow
              key={r.id}
              request={r}
              avatar={avatars[r.discord_id] ?? null}
              timezone={timezone}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function ExchangeRow({
  request,
  avatar,
  timezone,
}: {
  request: AdminExchangeRequest
  avatar: string | null
  timezone: string
}) {
  const router = useRouter()
  const t = useTranslations('adminExchangeReview')
  const tCommon = useTranslations('common')
  const tToast = useTranslations('toast')
  const toast = useToast()
  const approvalWorkflow = useApprovalWorkflow()
  const [rejectMode, setRejectMode] = useState(false)
  const [rejectNotes, setRejectNotes] = useState('')

  const statusLabel = (status: AdminExchangeRequest['status']): string => {
    return t(getExchangePayoutStatusTranslationKey(status))
  }

  const payout = getExchangePayoutReadiness({
    balance: request.balance,
    silver: request.silver,
    heldPoints: request.held_points,
    holdStatus: request.hold_status,
  })
  const isPending = request.status === 'pending'

  const approve = () => {
    approvalWorkflow.requestReview({
      action: 'approve-exchange',
      subjectId: request.id,
      title: t('approveButton'),
      summary: [
        request.username,
        `${t('payoutAmountLabel')}: ${formatSilver(request.silver)}`,
        `${t('currentBalanceLabel')}: ${formatSilver(request.balance)}`,
        `${t('afterPayoutLabel')}: ${formatSilver(payout.balanceAfterPayout)}`,
      ].join('\n'),
      confirmLabel: t('approveButton'),
      pendingLabel: tCommon('saving'),
      receipt: tToast('exchangeApproved'),
      execute: () => approveExchangeRequest(request.id),
      onCompleted: () => {
        toast.success(tToast('exchangeApproved'))
        router.refresh()
      },
    })
  }

  const reject = () => {
    approvalWorkflow.runAction({
      action: 'reject-exchange',
      subjectId: request.id,
      title: t('rejectConfirm'),
      summary: [request.username, rejectNotes.trim()].filter(Boolean).join('\n'),
      confirmLabel: t('rejectConfirm'),
      pendingLabel: tCommon('saving'),
      receipt: tToast('exchangeRejected'),
      execute: () => rejectExchangeRequest(request.id, rejectNotes),
      onCompleted: () => {
        setRejectMode(false)
        toast.success(tToast('exchangeRejected'))
        router.refresh()
      },
    })
  }

  return (
    <li
      className="space-y-4 px-1 py-5 sm:px-2"
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 310px' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <MemberAvatar discordId={request.discord_id} avatar={avatar} size={24} />
          <div className="min-w-0 flex-1">
            <MemberLink
              discordId={request.discord_id}
              username={request.username}
              className="block min-w-0 break-words text-sm font-semibold text-foreground"
            />
            <time
              dateTime={request.created_at}
              className="mt-1 block text-xs tabular-nums text-subtle"
            >
              {formatDateTimeShort(request.created_at, timezone)}
            </time>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[request.status]}`}>
          {statusLabel(request.status)}
        </span>
      </div>

      <dl className={`grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border shadow-card ${isPending ? 'sm:grid-cols-3' : ''}`}>
        <div className="bg-surface-2 px-3 py-3">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle">
            {t('payoutAmountLabel')}
          </dt>
          <dd className="mt-1 text-base font-semibold tabular-nums text-accent-soft-foreground">
            {formatSilver(request.silver)}
          </dd>
        </div>
        <div className="bg-surface-2 px-3 py-3">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle">
            {t('currentBalanceLabel')}
          </dt>
          <dd className="mt-1 text-base font-semibold tabular-nums text-foreground">
            {formatSilver(request.balance)}
          </dd>
        </div>
        {isPending ? (
          <div className="col-span-2 bg-surface-2 px-3 py-3 sm:col-span-1">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle">
              {t('afterPayoutLabel')}
            </dt>
            <dd className={`mt-1 text-base font-semibold tabular-nums ${payout.hasSufficientBalance ? 'text-foreground' : 'text-danger-soft-foreground'}`}>
              {formatSilver(payout.balanceAfterPayout)}
            </dd>
          </div>
        ) : null}
      </dl>

      {isPending && payout.isHoldSecured && payout.hasSufficientBalance ? (
        <p className="inline-flex min-h-7 items-center gap-1.5 rounded-full bg-success-soft px-2.5 text-xs font-medium text-success-soft-foreground">
          <LockKeyhole size={13} aria-hidden="true" />
          {t('holdReady')}
        </p>
      ) : null}

      {isPending && !payout.hasSufficientBalance ? (
        <div role="alert" className="flex gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-xs leading-relaxed text-danger-soft-foreground ring-1 ring-danger/25">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-pretty">{t('insufficientWarn')}</p>
        </div>
      ) : isPending && !payout.isHoldSecured ? (
        <div role="alert" className="flex gap-2 rounded-xl bg-warning-soft px-3 py-2.5 text-xs leading-relaxed text-warning-soft-foreground ring-1 ring-warning/25">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-pretty">{t('holdReview')}</p>
        </div>
      ) : null}

      {request.admin_notes && (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs italic text-muted">
          {request.admin_notes}
        </p>
      )}

      {isPending && !rejectMode ? (
        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
          {payout.canCompletePayout ? (
            <button
              type="button"
              onClick={approve}
              disabled={approvalWorkflow.isPending}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-success px-4 text-sm font-semibold text-success-foreground shadow-card transition-[background-color,box-shadow,transform,opacity] hover:shadow-lift active:not-disabled:scale-[0.96] disabled:opacity-50"
            >
              <Check size={15} aria-hidden="true" />
              {t('approveButton')}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setRejectMode(true)}
            disabled={approvalWorkflow.isPending}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-danger-soft px-4 text-sm font-semibold text-danger-soft-foreground ring-1 ring-danger/35 transition-[background-color,box-shadow,transform,opacity] hover:bg-danger/20 active:not-disabled:scale-[0.96] disabled:opacity-50"
          >
            <X size={15} aria-hidden="true" /> {t('reject')}
          </button>
        </div>
      ) : null}

      {rejectMode ? (
        <div className="space-y-3 rounded-[20px] bg-surface-2 p-3 shadow-card ring-1 ring-border">
          <label
            htmlFor={`exchange-reject-${request.id}`}
            className="block text-xs font-semibold text-foreground"
          >
            {t('rejectReasonLabel')}
          </label>
          <textarea
            id={`exchange-reject-${request.id}`}
            rows={2}
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            placeholder={t('rejectPlaceholder')}
            className="min-h-24 w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-subtle focus:border-danger focus:outline-none"
          />
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button
              type="button"
              onClick={reject}
              disabled={approvalWorkflow.isPending}
              className="min-h-11 rounded-lg bg-danger px-4 text-sm font-semibold text-danger-foreground transition-[background-color,transform,opacity] active:not-disabled:scale-[0.96] disabled:opacity-50"
            >
              {t('rejectConfirm')}
            </button>
            <button
              type="button"
              onClick={() => {
                setRejectMode(false)
                setRejectNotes('')
              }}
              disabled={approvalWorkflow.isPending}
              className="min-h-11 rounded-lg px-4 text-sm font-semibold text-muted transition-[background-color,color,transform,opacity] hover:bg-surface hover:text-foreground active:not-disabled:scale-[0.96] disabled:opacity-50"
            >
              {tCommon('cancel')}
            </button>
          </div>
        </div>
      ) : null}

      <ApprovalActionFeedback workflow={approvalWorkflow} />
      <ApprovalReviewDialog workflow={approvalWorkflow} />

      {request.resolved_at && !isPending ? (
        <div className="space-y-0.5 border-t border-border pt-3 text-[11px] text-subtle">
          <p>
            {t('resolvedAt', {
              status: statusLabel(request.status),
              datetime: formatDateTimeShort(request.resolved_at, timezone),
            })}
          </p>
          {request.handled_by ? (
            <p>
              {t('handledBy', {
                status: statusLabel(request.status),
                handler: request.handled_by_username ?? tCommon('unknown'),
              })}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}
