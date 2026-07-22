'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Check, X, ChevronDown, ChevronUp, Users } from 'lucide-react'
import {
  approveEventPayoutRequest,
  rejectEventPayoutRequest,
  type AdminEventPayoutRequest,
} from '@/app/actions/event-payout-admin'
import { formatSilver } from '@/lib/silver'
import { formatDateTimeShort } from '@/lib/format-datetime'
import SearchBox from './SearchBox'
import { matchesDate, matchesName, normalizeQuery } from '@/lib/search-match'
import { useToast } from './ToastProvider'
import {
  ApprovalActionFeedback,
  ApprovalReviewDialog,
  useApprovalWorkflow,
} from './ApprovalWorkflow'

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-300',
  approved: 'bg-green-500/20 text-green-300',
  rejected: 'bg-gray-700 text-gray-300',
}

interface Props {
  requests: AdminEventPayoutRequest[]
  tz: string
}

export default function EventPayoutReviewList({ requests, tz }: Props) {
  const t = useTranslations('adminEventPayoutReview')
  const tCommon = useTranslations('common')
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const q = normalizeQuery(search)
    if (!q) return requests
    return requests.filter(
      (r) =>
        matchesName(r.event_title, q) ||
        matchesName(r.created_by_username, q) ||
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
            <PayoutRow key={r.id} request={r} tz={tz} />
          ))}
        </ul>
      )}
    </div>
  )
}

function PayoutRow({ request, tz }: { request: AdminEventPayoutRequest; tz: string }) {
  const router = useRouter()
  const t = useTranslations('adminEventPayoutReview')
  const tCommon = useTranslations('common')
  const tToast = useTranslations('toast')
  const toast = useToast()
  const approvalWorkflow = useApprovalWorkflow()
  const [error, setError] = useState('')
  const [rejectMode, setRejectMode] = useState(false)
  const [rejectNotes, setRejectNotes] = useState('')
  const [showParticipants, setShowParticipants] = useState(false)

  const statusLabel = (status: string): string => {
    if (status === 'pending') return t('statusPending')
    if (status === 'approved') return t('statusApproved')
    return t('statusRejected')
  }

  const approve = () => {
    setError('')
    approvalWorkflow.requestReview({
      action: 'approve-event-payout',
      subjectId: request.id,
      title: t('approveWithPayout', { amount: formatSilver(request.total_silver) }),
      summary: `${request.event_title}\n${t('participantCount', { count: request.participant_count })}\n${t('total', { amount: formatSilver(request.total_silver) })}`,
      confirmLabel: t('approveWithPayout', { amount: formatSilver(request.total_silver) }),
      pendingLabel: tCommon('saving'),
      receipt: tToast('eventPayoutApproved'),
      execute: () => approveEventPayoutRequest(request.id),
      onCompleted: () => {
        toast.success(tToast('eventPayoutApproved'))
        router.refresh()
      },
    })
  }

  const reject = () => {
    setError('')
    approvalWorkflow.runAction({
      action: 'reject-event-payout',
      subjectId: request.id,
      title: t('rejectConfirm'),
      summary: `${request.event_title}\n${rejectNotes.trim()}`,
      confirmLabel: t('rejectConfirm'),
      pendingLabel: tCommon('saving'),
      receipt: tToast('eventPayoutRejected'),
      execute: () => rejectEventPayoutRequest(request.id, rejectNotes),
      onCompleted: () => {
        setRejectMode(false)
        toast.success(tToast('eventPayoutRejected'))
        router.refresh()
      },
    })
  }

  return (
    <li
      className="space-y-3 px-1 py-4 sm:px-2"
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 250px' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/admin/dashboard/events/${request.event_id}`}
              className="text-white text-sm font-semibold truncate hover:text-amber-300"
            >
              {request.event_title}
            </Link>
          </div>
          <div className="flex items-center gap-3 flex-wrap text-xs">
            <span className="font-mono text-amber-400">
              {t('perMember', { amount: formatSilver(request.silver_per_member) })}
            </span>
            <span className="font-mono text-gray-300 inline-flex items-center gap-1">
              <Users size={11} />
              {t('participantCount', { count: request.participant_count })}
            </span>
            <span className="font-mono text-emerald-300">
              {t('total', { amount: formatSilver(request.total_silver) })}
            </span>
          </div>
          <p className="text-[11px] text-gray-500 font-mono">
            {t('requestedBy', {
              by: request.created_by_username,
              datetime: formatDateTimeShort(request.created_at, tz),
            })}
          </p>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0 ${STATUS_CLASS[request.status]}`}>
          {statusLabel(request.status)}
        </span>
      </div>

      {request.memo && (
        <div className="bg-gray-800/50 rounded px-3 py-2">
          <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-1">
            {t('memoLabel')}
          </p>
          <p className="text-gray-300 text-xs whitespace-pre-wrap">{request.memo}</p>
        </div>
      )}

      {request.admin_notes && (
        <p className="text-gray-400 text-xs italic bg-gray-800/50 rounded px-3 py-2">
          {request.admin_notes}
        </p>
      )}

      <button
        type="button"
        onClick={() => setShowParticipants((v) => !v)}
        className="inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-white"
      >
        {showParticipants ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {showParticipants ? t('hideParticipants') : t('showParticipants')}
      </button>
      {showParticipants && request.participants.length > 0 && (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 max-h-44 overflow-y-auto bg-gray-950 border border-gray-800 rounded px-3 py-2 text-[11px] font-mono text-gray-300">
          {request.participants.map((p) => (
            <li key={p.discord_id} className="truncate">
              {p.username}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {request.status === 'pending' && !rejectMode && (
          <>
            <button
              type="button"
              onClick={approve}
              disabled={approvalWorkflow.isPending}
              className="flex min-h-10 items-center gap-1 rounded-lg border border-green-500/40 bg-green-500/20 px-3 text-xs text-green-300 hover:bg-green-500/30"
            >
              <Check size={13} />
              {t('approveWithPayout', { amount: formatSilver(request.total_silver) })}
            </button>
            <button
              type="button"
              onClick={() => setRejectMode(true)}
              disabled={approvalWorkflow.isPending}
              className="flex min-h-10 items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/20 px-3 text-xs text-red-300 hover:bg-red-500/30"
            >
              <X size={13} /> {t('reject')}
            </button>
          </>
        )}
      </div>

      {rejectMode && (
        <div className="space-y-2">
          <textarea
            rows={2}
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            placeholder={t('rejectPlaceholder')}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 resize-none"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={reject}
              disabled={approvalWorkflow.isPending}
              className="min-h-10 rounded-lg bg-red-500 px-3 text-xs font-semibold text-white hover:bg-red-400 disabled:opacity-50"
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
              className="min-h-10 px-3 text-xs text-gray-400 hover:text-white"
            >
              {tCommon('cancel')}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      )}

      <ApprovalActionFeedback workflow={approvalWorkflow} />
      <ApprovalReviewDialog workflow={approvalWorkflow} />

      {request.resolved_at && request.status !== 'pending' && (
        <div className="text-gray-500 text-[11px] font-mono border-t border-gray-800 pt-2 space-y-0.5">
          <p>
            {t('resolvedAt', {
              status: statusLabel(request.status),
              datetime: formatDateTimeShort(request.resolved_at, tz),
            })}
          </p>
          <p>
            {t('handledBy', {
              status: statusLabel(request.status),
              handler: request.handled_by_username ?? tCommon('unknown'),
            })}
          </p>
        </div>
      )}
    </li>
  )
}
